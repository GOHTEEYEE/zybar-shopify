/**
 * Customer Journey Engine
 *
 * Generic multi-step journeys. Email is one action_type — never hardcode
 * email into enrollment / ready / advance logic. Phase 1 executes email only
 * via the shared sendEmail() service, and only when an admin clicks Execute.
 */
const Email = require('./email.js');
const EmailTemplates = require('./email-templates.js');
const MemberPricing = require('./member-pricing.js');
const TemplateStore = require('./email-template-store.js');
const LeadStatus = require('./lead-status.js');
const Unsubscribe = require('./unsubscribe.js');

const LEAD_JOURNEY_STATUS = {
  WAITING: 'waiting',
  READY: 'ready',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

const ACTION_QUEUE_STATUS = {
  PENDING: 'pending',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

const ACTION_TYPES = ['email', 'whatsapp', 'sms', 'crm_task', 'webhook', 'ai_action'];
const DELAY_UNITS = ['minutes', 'hours', 'days', 'weeks'];
const TRIGGER_TYPES = [
  'signup',
  'add_to_cart',
  'purchase',
  'no_purchase_90_days',
  'manual'
];

function nowIso() {
  return new Date().toISOString();
}

function delayToMs(value, unit) {
  const n = Math.max(0, Number(value) || 0);
  switch (String(unit || 'minutes')) {
    case 'weeks':
      return n * 7 * 24 * 60 * 60 * 1000;
    case 'days':
      return n * 24 * 60 * 60 * 1000;
    case 'hours':
      return n * 60 * 60 * 1000;
    case 'minutes':
    default:
      return n * 60 * 1000;
  }
}

function computeNextReadyAt(fromIso, delayValue, delayUnit) {
  const base = fromIso ? new Date(fromIso).getTime() : Date.now();
  return new Date(base + delayToMs(delayValue, delayUnit)).toISOString();
}

function remainingMs(nextReadyAt) {
  if (!nextReadyAt) return 0;
  return Math.max(0, new Date(nextReadyAt).getTime() - Date.now());
}

function formatRemaining(ms) {
  if (ms <= 0) return 'Ready';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return days + 'd ' + hours + 'h';
  if (hours > 0) return hours + 'h ' + minutes + 'm';
  if (minutes > 0) return minutes + 'm';
  return totalSec + 's';
}

function progressPercent(currentStep, totalSteps) {
  const total = Math.max(1, Number(totalSteps) || 1);
  const current = Math.max(0, Number(currentStep) || 0);
  return Math.min(100, Math.round((current / total) * 100));
}

async function getJourneyByKey(supabase, journeyKey) {
  const result = await supabase
    .from('journeys')
    .select('*')
    .eq('journey_key', journeyKey)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function getJourneysByTrigger(supabase, triggerType) {
  const normalizedTrigger =
    String(triggerType || '').trim() === 'no_purchase'
      ? 'no_purchase_90_days'
      : String(triggerType || '').trim();
  const result = await supabase
    .from('journeys')
    .select('*')
    .eq('trigger_type', normalizedTrigger)
    .eq('status', 'published');
  if (result.error) throw result.error;
  return result.data || [];
}

async function getJourneySteps(supabase, journeyId) {
  const result = await supabase
    .from('journey_steps')
    .select('*')
    .eq('journey_id', journeyId)
    .order('step_order', { ascending: true });
  if (result.error) throw result.error;
  return result.data || [];
}

async function getStepByOrder(supabase, journeyId, stepOrder) {
  const result = await supabase
    .from('journey_steps')
    .select('*')
    .eq('journey_id', journeyId)
    .eq('step_order', stepOrder)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function getLeadById(supabase, leadId) {
  const result = await supabase
    .from('newsletter_subscribers')
    .select('*')
    .eq('id', leadId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

function buildTemplateVariables(lead, snapshot, env) {
  const firstOrder = snapshot && snapshot.orders && snapshot.orders[0] ? snapshot.orders[0] : null;
  return {
    customerName: firstOrder && firstOrder.customer_name ? firstOrder.customer_name : null,
    discountCode: (lead && lead.discount_code) || EmailTemplates.DEFAULT_DISCOUNT_CODE,
    memberCredential: MemberPricing.issueCredential(
      lead,
      MemberPricing.getTierForSubscriber(lead).id,
      env
    ),
    storeName: env.STORE_NAME || EmailTemplates.DEFAULT_STORE_NAME,
    storeUrl: env.STORE_URL || EmailTemplates.DEFAULT_STORE_URL,
    unsubscribeUrl: Unsubscribe.buildUrl(lead && lead.email, env)
  };
}

/**
 * Transition a lead into a journey at step 1.
 * The database operation atomically completes/cancels the prior journey,
 * cancels its pending queue, and starts this journey.
 */
async function enrollLeadInJourney(supabase, lead, journey) {
  if (!supabase || !lead || !lead.id || !journey || !journey.id) return null;

  const transition = await supabase.rpc('transition_lead_journey', {
    p_lead_id: lead.id,
    p_journey_id: journey.id
  });
  if (transition.error) throw transition.error;

  const leadJourneyId = transition.data;
  if (!leadJourneyId) return null;

  const result = await supabase
    .from('lead_journeys')
    .select('*')
    .eq('id', leadJourneyId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

/**
 * Transition a lead into the single published journey for a trigger type.
 * Returns an array for backward compatibility with subscribe API responses.
 */
async function enrollLeadByTrigger(supabase, lead, triggerType) {
  if (!supabase || !lead || !lead.id) return [];
  const journeys = await getJourneysByTrigger(supabase, triggerType);
  if (!journeys.length) return [];
  if (journeys.length > 1) {
    throw new Error('Multiple active journeys found for trigger: ' + triggerType);
  }
  const row = await enrollLeadInJourney(supabase, lead, journeys[0]);
  return row ? [row] : [];
}

async function enroll(supabase, lead, triggerType) {
  return enrollLeadByTrigger(supabase, lead, triggerType);
}

async function enrollLeadOnSignup(supabase, lead) {
  const BrandAnalytics = require('./brand-analytics.js');
  if (BrandAnalytics.isLunevaLead(lead)) return [];
  return enrollLeadByTrigger(supabase, lead, 'signup');
}

async function enrollLeadOnAddToCart(supabase, lead) {
  const BrandAnalytics = require('./brand-analytics.js');
  if (BrandAnalytics.isLunevaLead(lead)) return [];
  return enrollLeadByTrigger(supabase, lead, 'add_to_cart');
}

async function enrollLeadOnPurchase(supabase, lead) {
  const BrandAnalytics = require('./brand-analytics.js');
  if (BrandAnalytics.isLunevaLead(lead)) return [];
  return enrollLeadByTrigger(supabase, lead, 'purchase');
}

async function enrollLeadOnNoPurchase(supabase, lead) {
  return enrollLeadByTrigger(supabase, lead, 'no_purchase_90_days');
}

/**
 * Manual/future-scheduler entry point for the 90-day lifecycle transition.
 * Phase 1 exposes this through an admin API; no background worker is required.
 */
async function transitionNoPurchaseLeads(supabase, options) {
  options = options || {};
  const days = Math.max(1, Number(options.days) || 90);
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
  const customerJourneys = await getJourneysByTrigger(supabase, 'purchase');
  if (!customerJourneys.length) {
    return { scanned: 0, eligible: 0, transitioned: 0, items: [] };
  }

  const leadsResult = await supabase
    .from('newsletter_subscribers')
    .select('*')
    .eq('current_journey_id', customerJourneys[0].id)
    .limit(limit);
  if (leadsResult.error) throw leadsResult.error;

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const items = [];
  let eligible = 0;
  for (const lead of leadsResult.data || []) {
    const snapshot = await LeadStatus.getLeadJourneySnapshot(supabase, lead);
    const orders = (snapshot && snapshot.orders) || [];
    const latestOrderAt = orders.reduce(function (latest, order) {
      const value = new Date(order.created_at || order.order_date || 0).getTime();
      return value > latest ? value : latest;
    }, 0);
    if (!latestOrderAt || latestOrderAt > cutoff) continue;
    eligible += 1;
    const transitioned = await enrollLeadOnNoPurchase(supabase, lead);
    if (transitioned.length) {
      items.push({
        lead_id: lead.id,
        email: lead.email,
        lead_journey_id: transitioned[0].id
      });
    }
  }

  return {
    scanned: (leadsResult.data || []).length,
    eligible: eligible,
    transitioned: items.length,
    items: items
  };
}

async function promoteLeadJourneyStep(supabase, leadJourney) {
  const lj = leadJourney;
  const now = nowIso();
  const currentLeadResult = await supabase
    .from('newsletter_subscribers')
    .select('current_journey_instance_id,journey_status')
    .eq('id', lj.lead_id)
    .maybeSingle();
  if (currentLeadResult.error) throw currentLeadResult.error;
  if (
    !currentLeadResult.data ||
    currentLeadResult.data.current_journey_instance_id !== lj.id ||
    currentLeadResult.data.journey_status !== 'active'
  ) {
    return { promoted: false, reason: 'not_current_journey' };
  }

  const queueResult = await supabase
    .from('action_queue')
    .select('*')
    .eq('lead_journey_id', lj.id)
    .eq('status', ACTION_QUEUE_STATUS.PENDING)
    .lte('scheduled_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (queueResult.error) throw queueResult.error;
  if (!queueResult.data) return { promoted: false, reason: 'pending_action_not_found' };

  const update = await supabase
    .from('lead_journeys')
    .update({ status: LEAD_JOURNEY_STATUS.READY, updated_at: now })
    .eq('id', lj.id)
    .eq('status', LEAD_JOURNEY_STATUS.WAITING)
    .select('*')
    .maybeSingle();
  if (update.error) throw update.error;

  return {
    promoted: true,
    item: {
      lead_journey: update.data || lj,
      action: queueResult.data
    }
  };
}

/**
 * Promote waiting lead_journeys whose next_ready_at has passed:
 * status → ready. Queue rows are created when a journey starts or advances.
 * Manual only in Phase 1 (called from admin Queue UI / API).
 */
async function promoteReadySteps(supabase, limit) {
  const cap = Math.max(1, Math.min(200, Number(limit) || 50));
  const due = await supabase
    .from('lead_journeys')
    .select('*')
    .eq('status', LEAD_JOURNEY_STATUS.WAITING)
    .lte('next_ready_at', nowIso())
    .order('next_ready_at', { ascending: true })
    .limit(cap);

  if (due.error) throw due.error;
  const rows = due.data || [];
  const promoted = [];
  const skipped = [];
  for (const lj of rows) {
    const result = await promoteLeadJourneyStep(supabase, lj);
    if (result.promoted) promoted.push(result.item);
    else skipped.push({ lead_journey_id: lj.id, reason: result.reason });
  }

  return {
    scanned: rows.length,
    promoted: promoted.length,
    skipped: skipped.length,
    items: promoted
  };
}

/**
 * Execute a single action_queue row.
 * Phase 1: email only. Other types are marked failed with a clear message.
 */
async function executeAction(supabase, action, env) {
  if (!action || !action.id) return { ok: false, error: 'Missing action' };
  if (action.scheduled_at && new Date(action.scheduled_at).getTime() > Date.now()) {
    return {
      ok: false,
      id: action.id,
      status: ACTION_QUEUE_STATUS.PENDING,
      error: 'Action is scheduled for ' + action.scheduled_at
    };
  }

  const [leadResult, instanceResult] = await Promise.all([
    supabase
      .from('newsletter_subscribers')
      .select(
        'id,email,visitor_id,status,is_test,current_journey_id,current_journey_instance_id,journey_status'
      )
      .eq('id', action.lead_id)
      .maybeSingle(),
    action.lead_journey_id
      ? supabase
          .from('lead_journeys')
          .select('id,status,journey_id')
          .eq('id', action.lead_journey_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  if (leadResult.error) throw leadResult.error;
  if (instanceResult.error) throw instanceResult.error;

  const lifecycleLead = leadResult.data;
  const lifecycleInstance = instanceResult.data;
  const sourceType = action.source_type || 'journey';

  // Suppression beats every other rule: never send to an unsubscribed or bounced address.
  if (lifecycleLead && lifecycleLead.status !== 'active') {
    const suppressedAt = nowIso();
    await supabase
      .from('action_queue')
      .update({
        status: ACTION_QUEUE_STATUS.CANCELLED,
        error_message: 'Cancelled because the recipient is ' + lifecycleLead.status,
        updated_at: suppressedAt
      })
      .eq('id', action.id)
      .eq('status', ACTION_QUEUE_STATUS.PENDING);
    return {
      ok: false,
      id: action.id,
      status: ACTION_QUEUE_STATUS.CANCELLED,
      error: 'Recipient is ' + lifecycleLead.status
    };
  }

  let isCurrent = false;
  if (sourceType === 'campaign' && lifecycleLead && !lifecycleLead.is_test) {
    const campaignSnapshot = await LeadStatus.getLeadJourneySnapshot(supabase, lifecycleLead);
    isCurrent =
      lifecycleLead.status === 'active' &&
      campaignSnapshot &&
      campaignSnapshot.status === action.source_reference;
  } else {
    isCurrent =
      lifecycleLead &&
      lifecycleInstance &&
      lifecycleLead.current_journey_id === action.journey_id &&
      lifecycleLead.current_journey_instance_id === action.lead_journey_id &&
      lifecycleLead.journey_status === 'active' &&
      (lifecycleInstance.status === LEAD_JOURNEY_STATUS.WAITING ||
        lifecycleInstance.status === LEAD_JOURNEY_STATUS.READY);
  }

  if (!isCurrent) {
    const cancelledAt = nowIso();
    await supabase
      .from('action_queue')
      .update({
        status: ACTION_QUEUE_STATUS.CANCELLED,
        error_message:
          sourceType === 'campaign'
            ? 'Cancelled because the lead no longer matches the campaign audience'
            : 'Cancelled because this is no longer the customer current journey',
        updated_at: cancelledAt
      })
      .eq('id', action.id)
      .eq('status', ACTION_QUEUE_STATUS.PENDING);
    return {
      ok: false,
      id: action.id,
      status: ACTION_QUEUE_STATUS.CANCELLED,
      error:
        sourceType === 'campaign'
          ? 'Lead no longer matches the campaign audience'
          : 'Action belongs to an old journey'
    };
  }

  const claim = await supabase
    .from('action_queue')
    .update({ status: ACTION_QUEUE_STATUS.EXECUTING, updated_at: nowIso() })
    .eq('id', action.id)
    .eq('status', ACTION_QUEUE_STATUS.PENDING)
    .select('*')
    .maybeSingle();

  if (claim.error) throw claim.error;
  if (!claim.data) {
    return { ok: false, error: 'Action is not pending', id: action.id };
  }

  const row = claim.data;
  const actionType = String(row.action_type || '');
  let deliveryAccepted = false;
  let providerMessageId = null;

  try {
    if (actionType === 'email') {
      const emailOutcome = await executeEmailAction(supabase, row, env);
      providerMessageId = (emailOutcome && emailOutcome.messageId) || null;
      deliveryAccepted = true;
    } else {
      throw new Error(
        'Action type "' +
          actionType +
          '" is not executable in Phase 1. Architecture supports it; wire a handler later.'
      );
    }

    if ((row.source_type || 'journey') === 'campaign') {
      const completedAt = nowIso();
      const completion = await supabase
        .from('action_queue')
        .update({
          status: ACTION_QUEUE_STATUS.COMPLETED,
          executed_at: completedAt,
          error_message: null,
          provider_message_id: providerMessageId,
          updated_at: completedAt
        })
        .eq('id', row.id)
        .eq('status', ACTION_QUEUE_STATUS.EXECUTING)
        .select('id')
        .maybeSingle();
      if (completion.error) throw completion.error;
      if (!completion.data) throw new Error('Campaign queue action could not be completed');
    } else {
      if (providerMessageId) {
        try {
          await supabase
            .from('action_queue')
            .update({ provider_message_id: providerMessageId, updated_at: nowIso() })
            .eq('id', row.id);
        } catch (e) {
          // Non-fatal: engagement tracking is best-effort.
        }
      }
      await advanceLeadJourney(supabase, row);
    }

    await recordHistory(supabase, {
      event_type: 'queue_executed',
      source: 'queue',
      lead_email: row.recipient || null,
      journey_id: row.journey_id,
      reference_id: row.id,
      message: 'Action executed: ' + row.action_type + (row.template_id ? ' / ' + row.template_id : ''),
      metadata: { action_type: row.action_type, template_id: row.template_id, step_id: row.step_id }
    });

    return { ok: true, id: row.id, status: ACTION_QUEUE_STATUS.COMPLETED };
  } catch (err) {
    const message = (err && err.message) || 'Action execution failed';
    if (deliveryAccepted) {
      await supabase
        .from('action_queue')
        .update({
          error_message: 'Email accepted; journey completion requires reconciliation: ' + message,
          updated_at: nowIso()
        })
        .eq('id', row.id)
        .eq('status', ACTION_QUEUE_STATUS.EXECUTING);
      return {
        ok: false,
        id: row.id,
        status: ACTION_QUEUE_STATUS.EXECUTING,
        error: 'Email was accepted, but journey advancement needs reconciliation.'
      };
    }
    await supabase
      .from('action_queue')
      .update({
        status: ACTION_QUEUE_STATUS.FAILED,
        error_message: message,
        executed_at: nowIso(),
        updated_at: nowIso()
      })
      .eq('id', row.id);

    await recordHistory(supabase, {
      event_type: 'queue_failed',
      source: 'queue',
      lead_email: row.recipient || null,
      journey_id: row.journey_id,
      reference_id: row.id,
      message: message,
      metadata: { action_type: row.action_type, template_id: row.template_id }
    });

    return { ok: false, id: row.id, status: ACTION_QUEUE_STATUS.FAILED, error: message };
  }
}

async function runJourneyForTestEmails(supabase, journeyId, emails, env) {
  const journey = await getJourneyDetail(supabase, journeyId);
  if (!journey) throw new Error('Journey not found');
  if (!journey.steps || !journey.steps.length) {
    throw new Error('Journey has no steps');
  }

  const uniqueEmails = [];
  (Array.isArray(emails) ? emails : []).forEach(function (value) {
    const email = String(value || '').trim().toLowerCase();
    if (email && uniqueEmails.indexOf(email) === -1) uniqueEmails.push(email);
  });
  if (!uniqueEmails.length) throw new Error('Enter at least one email address');
  if (uniqueEmails.length > 25) throw new Error('Run at most 25 email addresses at once');

  const results = [];
  for (const email of uniqueEmails) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      results.push({ email: email, ok: false, status: 'invalid', error: 'Invalid email address' });
      continue;
    }

    try {
      let leadResult = await supabase
        .from('newsletter_subscribers')
        .select('*')
        .ilike('email', email)
        .maybeSingle();
      if (leadResult.error) throw leadResult.error;

      let lead = leadResult.data;
      let createdLead = false;
      if (!lead) {
        const insertResult = await supabase
          .from('newsletter_subscribers')
          .insert({
            email: email,
            source: 'admin_workflow_test',
            status: 'active',
            is_test: true
          })
          .select('*')
          .single();
        if (insertResult.error) throw insertResult.error;
        lead = insertResult.data;
        createdLead = true;
      } else if (lead.status !== 'active') {
        throw new Error('Lead is unsubscribed or suppressed');
      }

      const transition = await supabase.rpc('transition_lead_journey', {
        p_lead_id: lead.id,
        p_journey_id: journey.id,
        p_restart: true,
        p_allow_inactive: true
      });
      if (transition.error) throw transition.error;

      const instanceResult = await supabase
        .from('lead_journeys')
        .select('*')
        .eq('id', transition.data)
        .single();
      if (instanceResult.error) throw instanceResult.error;
      const instance = instanceResult.data;
      const actionResult = await supabase
        .from('action_queue')
        .select('*')
        .eq('lead_journey_id', instance.id)
        .eq('status', ACTION_QUEUE_STATUS.PENDING)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (actionResult.error) throw actionResult.error;
      if (!actionResult.data) throw new Error('Journey did not generate a queue action');
      const action = actionResult.data;
      const isImmediate = new Date(action.scheduled_at).getTime() <= Date.now() + 1000;

      if (!isImmediate) {
        results.push({
          email: email,
          ok: true,
          status: 'scheduled',
          created_lead: createdLead,
          lead_id: lead.id,
          lead_journey_id: instance.id,
          action_id: action.id,
          scheduled_at: action.scheduled_at
        });
        continue;
      }

      const promoted = await promoteLeadJourneyStep(supabase, instance);
      if (!promoted.promoted) {
        throw new Error('Unable to prepare first queue action: ' + promoted.reason);
      }

      const worker = await executePendingActions(supabase, env || process.env, {
        action_id: action.id,
        limit: 1
      });
      const executed = worker.results[0] || {
        ok: false,
        status: 'failed',
        error: 'Queue worker did not process the action'
      };
      results.push({
        email: email,
        ok: executed.ok,
        status: executed.ok ? 'executed' : executed.status || 'failed',
        created_lead: createdLead,
        lead_id: lead.id,
        lead_journey_id: instance.id,
        action_id: action.id,
        error: executed.ok ? null : executed.error
      });
    } catch (err) {
      results.push({
        email: email,
        ok: false,
        status: 'failed',
        error: (err && err.message) || 'Workflow test failed'
      });
    }
  }

  return {
    journey_id: journey.id,
    journey_name: journey.name,
    requested: uniqueEmails.length,
    succeeded: results.filter(function (item) {
      return item.ok;
    }).length,
    failed: results.filter(function (item) {
      return !item.ok;
    }).length,
    results: results
  };
}

async function executeEmailAction(supabase, action, env) {
  const lead = await getLeadById(supabase, action.lead_id);
  if (!lead || !lead.email) {
    throw new Error('Lead email not found');
  }

  const templateKey = action.template_id;
  if (!templateKey) {
    throw new Error('Missing template_id for email action');
  }

  const snapshot = await LeadStatus.getLeadJourneySnapshot(supabase, lead);
  const rendered = await TemplateStore.renderTemplate(
    supabase,
    templateKey,
    buildTemplateVariables(lead, snapshot, env || process.env)
  );

  const sendResult = await Email.sendEmail({
    to: lead.email,
    subject: rendered.subject,
    html: rendered.html,
    headers: Unsubscribe.buildHeaders(lead.email, env || process.env),
    env: env || process.env
  });

  if (!sendResult.ok) {
    throw new Error(sendResult.error || 'Failed to send email');
  }

  // Resend returns { id } — stash it so open/click webhooks can be matched back.
  return { messageId: (sendResult.data && sendResult.data.id) || null };
}

async function recordHistory(supabase, entry) {
  if (!supabase || !entry) return;
  try {
    await supabase.from('marketing_history').insert({
      event_type: entry.event_type || 'info',
      source: entry.source || 'journey',
      lead_email: entry.lead_email || null,
      journey_id: entry.journey_id || null,
      reference_id: entry.reference_id || null,
      message: entry.message || '',
      metadata: entry.metadata || {}
    });
  } catch (e) {
    console.warn('marketing history insert:', e && e.message ? e.message : e);
  }
}

/**
 * After successful action: move lead to next step or complete journey.
 */
async function advanceLeadJourney(supabase, action) {
  if (!action || !action.id) return null;
  const completion = await supabase.rpc('complete_journey_action', {
    p_action_id: action.id
  });
  if (completion.error) throw completion.error;
  if (!completion.data) return null;
  const result = await supabase
    .from('lead_journeys')
    .select('*')
    .eq('id', completion.data)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

/**
 * Execute all (or limited) pending actions. Manual admin trigger only.
 */
async function executePendingActions(supabase, env, options) {
  options = options || {};
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 25));
  const actionId = options.action_id || null;

  let query = supabase
    .from('action_queue')
    .select('*')
    .eq('status', ACTION_QUEUE_STATUS.PENDING)
    .lte('scheduled_at', nowIso())
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (actionId) {
    query = supabase
      .from('action_queue')
      .select('*')
      .eq('id', actionId)
      .eq('status', ACTION_QUEUE_STATUS.PENDING)
      .maybeSingle();
  }

  const result = await query;
  if (result.error) throw result.error;

  const rows = actionId ? (result.data ? [result.data] : []) : result.data || [];
  const results = [];
  let completed = 0;
  let failed = 0;
  let cancelled = 0;

  for (const row of rows) {
    const out = await executeAction(supabase, row, env);
    results.push(out);
    if (out.ok) completed += 1;
    else if (out.status === ACTION_QUEUE_STATUS.CANCELLED) cancelled += 1;
    else failed += 1;
  }

  return {
    processed: rows.length,
    completed: completed,
    failed: failed,
    cancelled: cancelled,
    results: results
  };
}

async function retryFailedAction(supabase, actionId, env) {
  const reset = await supabase
    .from('action_queue')
    .update({
      status: ACTION_QUEUE_STATUS.PENDING,
      scheduled_at: nowIso(),
      executed_at: null,
      error_message: null,
      updated_at: nowIso()
    })
    .eq('id', actionId)
    .eq('status', ACTION_QUEUE_STATUS.FAILED)
    .select('*')
    .maybeSingle();
  if (reset.error) throw reset.error;
  if (!reset.data) throw new Error('Failed queue action not found');

  const worker = await executePendingActions(supabase, env || process.env, {
    action_id: reset.data.id,
    limit: 1
  });
  return {
    action: reset.data,
    worker: worker
  };
}

async function cancelLeadJourney(supabase, leadJourneyId) {
  const now = nowIso();
  const update = await supabase
    .from('lead_journeys')
    .update({
      status: LEAD_JOURNEY_STATUS.CANCELLED,
      completed_at: now,
      updated_at: now
    })
    .eq('id', leadJourneyId)
    .in('status', [LEAD_JOURNEY_STATUS.WAITING, LEAD_JOURNEY_STATUS.READY])
    .select('*')
    .maybeSingle();
  if (update.error) throw update.error;

  if (update.data) {
    await supabase
      .from('action_queue')
      .update({
        status: ACTION_QUEUE_STATUS.CANCELLED,
        error_message: 'Cancelled because customer journey was cancelled',
        updated_at: now
      })
      .eq('lead_journey_id', leadJourneyId)
      .eq('status', ACTION_QUEUE_STATUS.PENDING);
  }

  return update.data;
}

function enrichLeadJourney(lj, journey, steps) {
  const stepList = steps || [];
  const current = stepList.find(function (s) {
    return s.step_order === lj.current_step;
  });
  const rem = remainingMs(lj.next_ready_at);
  return Object.assign({}, lj, {
    journey_name: journey ? journey.name : null,
    journey_key: journey ? journey.journey_key : null,
    trigger_type: journey ? journey.trigger_type : null,
    current_step_name: current ? current.step_name : null,
    current_action_type: current ? current.action_type : null,
    current_template_id: current ? current.template_id : null,
    total_steps: stepList.length,
    progress: progressPercent(lj.status === LEAD_JOURNEY_STATUS.COMPLETED ? stepList.length : lj.current_step - 1, stepList.length),
    remaining_ms: rem,
    remaining_label: lj.status === LEAD_JOURNEY_STATUS.WAITING ? formatRemaining(rem) : lj.status,
    is_due: lj.status === LEAD_JOURNEY_STATUS.WAITING && rem <= 0
  });
}

async function listJourneysAdmin(supabase) {
  const [journeysRes, stepsRes, enrollRes, queueRes] = await Promise.all([
    supabase.from('journeys').select('*').order('name', { ascending: true }),
    supabase.from('journey_steps').select('*').order('step_order', { ascending: true }),
    supabase.from('lead_journeys').select('id, journey_id, status'),
    supabase.from('action_queue').select('id, journey_id, status')
  ]);
  if (journeysRes.error) throw journeysRes.error;
  if (stepsRes.error) throw stepsRes.error;
  if (enrollRes.error) throw enrollRes.error;
  if (queueRes.error) throw queueRes.error;

  const stepsByJourney = {};
  (stepsRes.data || []).forEach(function (step) {
    if (!stepsByJourney[step.journey_id]) stepsByJourney[step.journey_id] = [];
    stepsByJourney[step.journey_id].push(step);
  });

  const enrollStats = {};
  (enrollRes.data || []).forEach(function (row) {
    if (!enrollStats[row.journey_id]) {
      enrollStats[row.journey_id] = { waiting: 0, ready: 0, completed: 0, cancelled: 0, total: 0 };
    }
    enrollStats[row.journey_id].total += 1;
    if (enrollStats[row.journey_id][row.status] != null) {
      enrollStats[row.journey_id][row.status] += 1;
    }
  });

  const queueStats = {};
  (queueRes.data || []).forEach(function (row) {
    if (!queueStats[row.journey_id]) {
      queueStats[row.journey_id] = { pending: 0, completed: 0, failed: 0 };
    }
    if (queueStats[row.journey_id][row.status] != null) {
      queueStats[row.journey_id][row.status] += 1;
    }
  });

  return (journeysRes.data || []).map(function (j) {
    return Object.assign({}, j, {
      steps: stepsByJourney[j.id] || [],
      enroll_stats: enrollStats[j.id] || { waiting: 0, ready: 0, completed: 0, cancelled: 0, total: 0 },
      queue_stats: queueStats[j.id] || { pending: 0, completed: 0, failed: 0 }
    });
  });
}

async function getJourneyDetail(supabase, journeyId) {
  const journeyRes = await supabase.from('journeys').select('*').eq('id', journeyId).maybeSingle();
  if (journeyRes.error) throw journeyRes.error;
  if (!journeyRes.data) return null;
  const steps = await getJourneySteps(supabase, journeyId);
  return Object.assign({}, journeyRes.data, { steps: steps });
}

async function createJourney(supabase, payload) {
  const now = nowIso();
  const requestedStatus =
    payload.status === 'published' || payload.is_active === true ? 'published' : 'draft';
  let journeyKey = String(payload.journey_key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_|_$/g, '');
  if (!journeyKey) {
    journeyKey =
      String(payload.name || 'journey')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') +
      '_' +
      Date.now().toString(36);
  }

  const insert = await supabase
    .from('journeys')
    .insert({
      journey_key: journeyKey,
      name: String(payload.name || '').trim() || 'Untitled Journey',
      description: payload.description ? String(payload.description).trim() : null,
      trigger_type: String(payload.trigger_type || 'manual').trim(),
      exit_trigger: payload.exit_trigger ? String(payload.exit_trigger).trim() : null,
      next_journey_id: payload.next_journey_id || null,
      exit_behavior: payload.exit_behavior === 'cancelled' ? 'cancelled' : 'completed',
      status: requestedStatus,
      is_active: requestedStatus === 'published',
      archived_at: null,
      updated_at: now
    })
    .select('*')
    .single();
  if (insert.error) throw insert.error;
  return insert.data;
}

async function updateJourney(supabase, journeyId, payload) {
  const patch = { updated_at: nowIso() };
  if (payload.name != null) patch.name = String(payload.name).trim();
  if (payload.description !== undefined) {
    patch.description = payload.description ? String(payload.description).trim() : null;
  }
  if (payload.trigger_type != null) patch.trigger_type = String(payload.trigger_type).trim();
  if (payload.exit_trigger !== undefined) {
    patch.exit_trigger = payload.exit_trigger ? String(payload.exit_trigger).trim() : null;
  }
  if (payload.next_journey_id !== undefined) {
    patch.next_journey_id = payload.next_journey_id || null;
  }
  if (payload.exit_behavior !== undefined) {
    patch.exit_behavior = payload.exit_behavior === 'cancelled' ? 'cancelled' : 'completed';
  }
  if (payload.status !== undefined || payload.is_active !== undefined) {
    const requestedStatus =
      payload.status === 'archived'
        ? 'archived'
        : payload.status === 'published' || payload.is_active === true
          ? 'published'
          : 'draft';
    patch.status = requestedStatus;
    patch.is_active = requestedStatus === 'published';
    patch.archived_at = requestedStatus === 'archived' ? nowIso() : null;
  }

  const result = await supabase
    .from('journeys')
    .update(patch)
    .eq('id', journeyId)
    .select('*')
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function replaceJourneySteps(supabase, journeyId, steps) {
  const list = Array.isArray(steps) ? steps : [];
  const activeResult = await supabase
    .from('lead_journeys')
    .select('id', { count: 'exact', head: true })
    .eq('journey_id', journeyId)
    .in('status', [LEAD_JOURNEY_STATUS.WAITING, LEAD_JOURNEY_STATUS.READY]);
  if (activeResult.error) throw activeResult.error;
  if (activeResult.count) {
    throw new Error('Archive or complete active customers before changing journey steps.');
  }
  const del = await supabase.from('journey_steps').delete().eq('journey_id', journeyId);
  if (del.error) throw del.error;

  if (!list.length) return [];

  const rows = list.map(function (step, index) {
    const actionType = String(step.action_type || 'email').trim();
    if (ACTION_TYPES.indexOf(actionType) === -1) {
      throw new Error('Unsupported action_type: ' + actionType);
    }
    const delayUnit = String(step.delay_unit || 'minutes').trim();
    if (DELAY_UNITS.indexOf(delayUnit) === -1) {
      throw new Error('Unsupported delay_unit: ' + delayUnit);
    }
    return {
      journey_id: journeyId,
      step_order: Number(step.step_order) || index + 1,
      step_name: String(step.step_name || 'Step ' + (index + 1)).trim(),
      delay_value: Math.max(0, Number(step.delay_value) || 0),
      delay_unit: delayUnit,
      action_type: actionType,
      template_id: step.template_id ? String(step.template_id).trim() : null
    };
  });

  const insert = await supabase.from('journey_steps').insert(rows).select('*').order('step_order');
  if (insert.error) throw insert.error;
  return insert.data || [];
}

async function listLeadJourneysAdmin(supabase, options) {
  options = options || {};
  const limit = Math.max(1, Math.min(1000, Number(options.limit) || 100));

  let query = supabase
    .from('lead_journeys')
    .select(
      '*, journeys(id, name, journey_key, trigger_type), newsletter_subscribers!lead_journeys_lead_id_fkey(id, email)'
    )
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (options.status) query = query.eq('status', options.status);
  if (options.journey_id) query = query.eq('journey_id', options.journey_id);

  const result = await query;
  if (result.error) throw result.error;

  const journeyIds = {};
  (result.data || []).forEach(function (row) {
    journeyIds[row.journey_id] = true;
  });
  const ids = Object.keys(journeyIds);
  const stepsByJourney = {};
  if (ids.length) {
    const stepsRes = await supabase.from('journey_steps').select('*').in('journey_id', ids);
    if (stepsRes.error) throw stepsRes.error;
    (stepsRes.data || []).forEach(function (step) {
      if (!stepsByJourney[step.journey_id]) stepsByJourney[step.journey_id] = [];
      stepsByJourney[step.journey_id].push(step);
    });
  }

  return (result.data || []).map(function (row) {
    const journey = row.journeys || null;
    const enriched = enrichLeadJourney(row, journey, stepsByJourney[row.journey_id] || []);
    enriched.lead_email =
      row.newsletter_subscribers && row.newsletter_subscribers.email
        ? row.newsletter_subscribers.email
        : null;
    delete enriched.journeys;
    delete enriched.newsletter_subscribers;
    return enriched;
  });
}

async function listActionQueueAdmin(supabase, options) {
  options = options || {};
  const limit = Math.max(1, Math.min(200, Number(options.limit) || 100));

  let query = supabase
    .from('action_queue')
    .select(
      '*, journeys(name, journey_key), journey_steps(step_name, step_order, delay_value, delay_unit), newsletter_subscribers(email)'
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options.status) query = query.eq('status', options.status);
  if (options.journey_id) query = query.eq('journey_id', options.journey_id);

  const result = await query;
  if (result.error) throw result.error;

  return (result.data || []).map(function (row) {
    return {
      id: row.id,
      lead_id: row.lead_id,
      journey_id: row.journey_id,
      step_id: row.step_id,
      lead_journey_id: row.lead_journey_id,
      action_type: row.action_type,
      template_id: row.template_id,
      recipient: row.recipient,
      scheduled_at: row.scheduled_at,
      status: row.status,
      executed_at: row.executed_at,
      error_message: row.error_message,
      created_at: row.created_at,
      opened_at: row.opened_at || null,
      clicked_at: row.clicked_at || null,
      open_count: Number(row.open_count) || 0,
      click_count: Number(row.click_count) || 0,
      journey_name: row.journeys && row.journeys.name ? row.journeys.name : null,
      step_name:
        row.journey_steps && row.journey_steps.step_name
          ? row.journey_steps.step_name
          : row.step_name_snapshot || null,
      step_order: row.journey_steps && row.journey_steps.step_order ? row.journey_steps.step_order : null,
      lead_email:
        row.newsletter_subscribers && row.newsletter_subscribers.email
          ? row.newsletter_subscribers.email
          : row.recipient
    };
  });
}

/**
 * Promote due steps, then execute pending actions — single admin button flow.
 * By default drains the due queue in batches (not a single 25-send pass).
 */
async function executeReadyActions(supabase, env, options) {
  options = options || {};
  const actionId = options.action_id || null;
  const batchLimit = Math.max(1, Math.min(100, Number(options.limit) || 25));
  const promoteLimit = Math.max(1, Math.min(200, Number(options.promote_limit) || 50));
  // Single action id = one shot. Otherwise loop until the due queue is clear.
  const maxRounds = actionId
    ? 1
    : Math.max(1, Math.min(40, Number(options.max_rounds) || (options.drain === false ? 1 : 20)));

  var promoted = 0;
  var scanned = 0;
  var processed = 0;
  var completed = 0;
  var failed = 0;
  var cancelled = 0;
  var rounds = 0;
  var results = [];

  for (var round = 0; round < maxRounds; round++) {
    rounds += 1;
    var promote = await promoteReadySteps(supabase, promoteLimit);
    promoted += promote.promoted || 0;
    scanned += promote.scanned || 0;

    var execute = await executePendingActions(supabase, env, {
      limit: batchLimit,
      action_id: actionId
    });
    processed += execute.processed || 0;
    completed += execute.completed || 0;
    failed += execute.failed || 0;
    cancelled += execute.cancelled || 0;
    if (execute.results && execute.results.length) {
      results = results.concat(execute.results);
    }

    if (actionId) break;
    if ((execute.processed || 0) === 0 && (promote.promoted || 0) === 0) break;
    if ((execute.processed || 0) < batchLimit && (promote.promoted || 0) === 0) break;
  }

  return {
    promoted: promoted,
    scanned: scanned,
    processed: processed,
    completed: completed,
    failed: failed,
    cancelled: cancelled,
    rounds: rounds,
    batch_limit: batchLimit,
    results: results
  };
}

async function duplicateJourney(supabase, journeyId) {
  const source = await getJourneyDetail(supabase, journeyId);
  if (!source) throw new Error('Journey not found');
  const copy = await createJourney(supabase, {
    name: source.name + ' (Copy)',
    description: source.description,
    trigger_type: source.trigger_type,
    exit_trigger: source.exit_trigger,
    next_journey_id: source.next_journey_id,
    exit_behavior: source.exit_behavior,
    is_active: false,
    journey_key: source.journey_key + '_copy_' + Date.now().toString(36)
  });
  const steps = await replaceJourneySteps(
    supabase,
    copy.id,
    (source.steps || []).map(function (s) {
      return {
        step_order: s.step_order,
        step_name: s.step_name,
        delay_value: s.delay_value,
        delay_unit: s.delay_unit,
        action_type: s.action_type,
        template_id: s.template_id
      };
    })
  );
  return Object.assign({}, copy, { steps: steps });
}

async function archiveJourney(supabase, journeyId) {
  const now = nowIso();
  const result = await supabase
    .from('journeys')
    .update({
      status: 'archived',
      is_active: false,
      archived_at: now,
      updated_at: now
    })
    .eq('id', journeyId)
    .neq('status', 'archived')
    .select('*')
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

const PROTECTED_JOURNEY_KEYS = {
  welcome_journey: true,
  cart_journey: true,
  customer_journey: true,
  win_back_journey: true
};

/**
 * Permanently delete a journey definition and cascaded steps/queue/history instances.
 * Core lifecycle journeys cannot be deleted.
 *
 * DB FKs use ON DELETE RESTRICT on lead_journeys + action_queue, so children must
 * be removed explicitly before deleting the journey row.
 */
async function deleteJourneyPermanently(supabase, journeyId) {
  const journey = await getJourneyDetail(supabase, journeyId);
  if (!journey) return null;

  const key = String(journey.journey_key || '');
  if (PROTECTED_JOURNEY_KEYS[key]) {
    throw new Error(
      'Cannot permanently delete core lifecycle journey "' +
        key +
        '". Archive it instead if you need to hide it.'
    );
  }

  // Clear inbound next_journey pointers so FK SET NULL is explicit before delete.
  await supabase
    .from('journeys')
    .update({ next_journey_id: null, updated_at: nowIso() })
    .eq('next_journey_id', journeyId);

  // Drop lifecycle pointers that still reference this journey definition.
  await supabase
    .from('newsletter_subscribers')
    .update({
      current_journey_id: null,
      current_journey_instance_id: null
    })
    .eq('current_journey_id', journeyId);

  // RESTRICT FKs: remove queue rows and enrollments before deleting the journey.
  const queueDel = await supabase.from('action_queue').delete().eq('journey_id', journeyId);
  if (queueDel.error) throw queueDel.error;

  const leadsDel = await supabase.from('lead_journeys').delete().eq('journey_id', journeyId);
  if (leadsDel.error) throw leadsDel.error;

  const del = await supabase.from('journeys').delete().eq('id', journeyId).select('id').maybeSingle();
  if (del.error) throw del.error;
  if (!del.data) return null;
  return { id: journeyId, deleted: true, journey_key: key, name: journey.name };
}

async function getJourneyWorkspace(supabase, journeyId) {
  const journey = await getJourneyDetail(supabase, journeyId);
  if (!journey) return null;
  const [activeLeads, templates, journeyOptions, history] = await Promise.all([
    listLeadJourneysAdmin(supabase, {
      journey_id: journeyId,
      limit: 100
    }),
    TemplateStore.listTemplates(supabase, { status: 'active' }),
    listJourneysAdmin(supabase),
    listHistoryAdmin(supabase, { limit: 50, journey_id: journeyId })
  ]);
  const currentStats = journeyOptions.find(function (option) {
    return option.id === journeyId;
  });
  return {
    journey: journey,
    active_leads: activeLeads.filter(function (lj) {
      return lj.status === 'waiting' || lj.status === 'ready';
    }),
    all_leads: activeLeads,
    analytics: currentStats
      ? {
          enrollments: currentStats.enroll_stats,
          queue: currentStats.queue_stats
        }
      : null,
    history: history,
    templates: templates,
    journey_options: journeyOptions.map(function (option) {
      return {
        id: option.id,
        name: option.name,
        trigger_type: option.trigger_type,
        is_active: option.is_active
      };
    }),
    action_types: ACTION_TYPES,
    delay_units: DELAY_UNITS,
    trigger_types: TRIGGER_TYPES
  };
}

/**
 * Count unique recipients who opened / clicked, per campaign log id.
 * Uses first-touch timestamps on action_queue so each recipient counts once.
 */
async function aggregateCampaignEngagement(supabase, campaignIds) {
  const result = {};
  const ids = (campaignIds || []).filter(Boolean);
  if (!ids.length) return result;
  try {
    const rows = await supabase
      .from('action_queue')
      .select('campaign_log_id, opened_at, clicked_at')
      .in('campaign_log_id', ids);
    if (rows.error || !rows.data) return result;
    rows.data.forEach(function (row) {
      const key = row.campaign_log_id;
      if (!key) return;
      if (!result[key]) result[key] = { opened: 0, clicked: 0 };
      if (row.opened_at) result[key].opened += 1;
      if (row.clicked_at) result[key].clicked += 1;
    });
  } catch (e) {}
  return result;
}

async function listHistoryAdmin(supabase, options) {
  options = typeof options === 'number' ? { limit: options } : options || {};
  const cap = Math.max(1, Math.min(200, Number(options.limit) || 100));
  const journeyId = options.journey_id || null;
  const events = [];

  try {
    let historyQuery = supabase
      .from('marketing_history')
      .select('*, journeys(name)')
      .order('created_at', { ascending: false })
      .limit(cap);
    if (journeyId) historyQuery = historyQuery.eq('journey_id', journeyId);
    const hist = await historyQuery;
    if (!hist.error) {
      (hist.data || []).forEach(function (row) {
        events.push({
          id: row.id,
          at: row.created_at,
          event_type: row.event_type,
          source: row.source,
          lead_email: row.lead_email,
          journey_name: row.journeys && row.journeys.name ? row.journeys.name : null,
          message: row.message,
          status: row.event_type.indexOf('fail') !== -1 ? 'failed' : 'completed',
          metadata: row.metadata || {}
        });
      });
    }
  } catch (e) {}

  if (!journeyId) try {
    const campaigns = await supabase
      .from('campaign_send_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(cap);
    if (!campaigns.error) {
      const campaignRows = campaigns.data || [];
      const engagement = await aggregateCampaignEngagement(
        supabase,
        campaignRows.map(function (row) {
          return row.id;
        })
      );
      campaignRows.forEach(function (row) {
        const eng = engagement[row.id] || { opened: 0, clicked: 0 };
        events.push({
          id: row.id,
          at: row.created_at,
          event_type: 'campaign_send',
          source: 'campaign',
          lead_email: null,
          journey_name: null,
          message:
            'Campaign to ' +
            row.audience +
            ' via ' +
            row.template_key +
            ' — sent ' +
            row.sent_count +
            ', opened ' +
            eng.opened +
            ', clicked ' +
            eng.clicked,
          status: row.status,
          metadata: {
            audience: row.audience,
            template_key: row.template_key,
            sent_count: row.sent_count,
            skipped_count: row.skipped_count,
            failed_count: row.failed_count,
            opened_count: eng.opened,
            clicked_count: eng.clicked,
            error_message: row.error_message
          }
        });
      });
    }
  } catch (e) {}

  try {
    const queue = await listActionQueueAdmin(supabase, {
      limit: cap,
      journey_id: journeyId
    });
    queue.forEach(function (row) {
      if (row.status === 'pending' || row.status === 'executing') return;
      var engagementNote = '';
      if (row.status === 'completed' && row.action_type === 'email') {
        engagementNote =
          ' · ' +
          (row.opened_at ? 'opened' : 'not opened') +
          (row.clicked_at ? ' · clicked' : '');
      }
      events.push({
        id: row.id,
        at: row.executed_at || row.created_at,
        event_type: 'queue_' + row.status,
        source: 'queue',
        lead_email: row.lead_email,
        journey_name: row.journey_name,
        message:
          (row.step_name || 'Step') +
          ' · ' +
          row.action_type +
          (row.template_id ? ' · ' + row.template_id : '') +
          engagementNote +
          (row.error_message ? ' — ' + row.error_message : ''),
        status: row.status,
        metadata: row
      });
    });
  } catch (e) {}

  events.sort(function (a, b) {
    return new Date(b.at).getTime() - new Date(a.at).getTime();
  });
  return events.slice(0, cap);
}

async function listEmailLeadsCrm(supabase, options) {
  options = options || {};
  const status = options.status || null;
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 200));
  const includeTest = !!options.include_test;

  const leads = status
    ? await LeadStatus.listLeadsByStatus(supabase, status, { limit: limit, includeTest: includeTest })
    : await LeadStatus.listActiveLeads(supabase, { limit: limit, includeTest: includeTest });

  const audiences = await LeadStatus.getAudienceCounts(supabase);
  const leadIds = leads
    .map(function (l) {
      return l.id;
    })
    .filter(Boolean);

  const lifecycleByLead = {};
  if (leadIds.length) {
    const lifecycleResult = await supabase
      .from('newsletter_subscribers')
      .select(
        'id,current_journey_id,current_journey_instance_id,current_step,journey_status,' +
          'journey_started_at,journey_completed_at'
      )
      .in('id', leadIds);
    if (lifecycleResult.error) throw lifecycleResult.error;

    const journeyIds = [];
    const instanceIds = [];
    (lifecycleResult.data || []).forEach(function (row) {
      lifecycleByLead[row.id] = row;
      if (row.current_journey_id && journeyIds.indexOf(row.current_journey_id) === -1) {
        journeyIds.push(row.current_journey_id);
      }
      if (
        row.current_journey_instance_id &&
        instanceIds.indexOf(row.current_journey_instance_id) === -1
      ) {
        instanceIds.push(row.current_journey_instance_id);
      }
    });

    const journeysById = {};
    const stepsByJourney = {};
    const instancesById = {};
    if (journeyIds.length) {
      const [journeysResult, stepsResult] = await Promise.all([
        supabase.from('journeys').select('id,name,journey_key').in('id', journeyIds),
        supabase.from('journey_steps').select('*').in('journey_id', journeyIds)
      ]);
      if (journeysResult.error) throw journeysResult.error;
      if (stepsResult.error) throw stepsResult.error;
      (journeysResult.data || []).forEach(function (journey) {
        journeysById[journey.id] = journey;
      });
      (stepsResult.data || []).forEach(function (step) {
        if (!stepsByJourney[step.journey_id]) stepsByJourney[step.journey_id] = [];
        stepsByJourney[step.journey_id].push(step);
      });
    }
    if (instanceIds.length) {
      const instancesResult = await supabase
        .from('lead_journeys')
        .select('id,next_ready_at,entered_step_at')
        .in('id', instanceIds);
      if (instancesResult.error) throw instancesResult.error;
      (instancesResult.data || []).forEach(function (instance) {
        instancesById[instance.id] = instance;
      });
    }

    Object.keys(lifecycleByLead).forEach(function (leadId) {
      const lifecycle = lifecycleByLead[leadId];
      const steps = stepsByJourney[lifecycle.current_journey_id] || [];
      const current = steps.find(function (step) {
        return step.step_order === lifecycle.current_step;
      });
      const instance = instancesById[lifecycle.current_journey_instance_id] || null;
      const remaining = instance ? remainingMs(instance.next_ready_at) : 0;
      lifecycle.journey_name = journeysById[lifecycle.current_journey_id]
        ? journeysById[lifecycle.current_journey_id].name
        : null;
      lifecycle.current_step_name = current ? current.step_name : null;
      lifecycle.current_action_type = current ? current.action_type : null;
      lifecycle.current_template_id = current ? current.template_id : null;
      lifecycle.next_ready_at = instance ? instance.next_ready_at : null;
      lifecycle.remaining_label =
        lifecycle.journey_status === 'active'
          ? formatRemaining(remaining)
          : lifecycle.journey_status;
    });
  }

  return {
    audiences: audiences.audiences,
    total: audiences.total,
    leads: leads.map(function (lead) {
      const lifecycle = lifecycleByLead[lead.id] || null;
      return {
        id: lead.id,
        email: lead.email,
        status: lead.status,
        is_test: !!lead.is_test,
        source: lead.source || null,
        product_name: lead.product_name || null,
        country: lead.country || null,
        created_at: lead.created_at || null,
        last_activity_at: lead.last_activity_at || lead.updated_at || lead.created_at || null,
        journey_name: lifecycle ? lifecycle.journey_name : null,
        journey_status: lifecycle ? lifecycle.journey_status : null,
        journey_started_at: lifecycle ? lifecycle.journey_started_at : null,
        journey_completed_at: lifecycle ? lifecycle.journey_completed_at : null,
        current_step: lifecycle ? lifecycle.current_step : null,
        current_step_name: lifecycle ? lifecycle.current_step_name : null,
        next_ready_at: lifecycle ? lifecycle.next_ready_at : null,
        remaining_label: lifecycle ? lifecycle.remaining_label : null,
        next_action: lifecycle
          ? (lifecycle.current_action_type || '') +
            (lifecycle.current_template_id ? ' · ' + lifecycle.current_template_id : '')
          : null
      };
    })
  };
}

async function getCustomerLifecycleByEmail(supabase, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;

  const leadResult = await supabase
    .from('newsletter_subscribers')
    .select(
      'id,email,current_journey_id,current_journey_instance_id,current_step,journey_status,' +
        'journey_started_at,journey_completed_at'
    )
    .ilike('email', normalizedEmail)
    .maybeSingle();
  if (leadResult.error) throw leadResult.error;
  const lead = leadResult.data;
  if (!lead) return null;

  const historyResult = await supabase
    .from('lead_journeys')
    .select('*, journeys(id,name,journey_key,trigger_type)')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (historyResult.error) throw historyResult.error;

  let currentJourney = null;
  let currentStep = null;
  let currentInstance = null;
  if (lead.current_journey_id) {
    const [journeyResult, stepResult] = await Promise.all([
      supabase
        .from('journeys')
        .select('id,name,journey_key,trigger_type,exit_trigger,next_journey_id')
        .eq('id', lead.current_journey_id)
        .maybeSingle(),
      lead.current_step
        ? supabase
            .from('journey_steps')
            .select('*')
            .eq('journey_id', lead.current_journey_id)
            .eq('step_order', lead.current_step)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ]);
    if (journeyResult.error) throw journeyResult.error;
    if (stepResult.error) throw stepResult.error;
    currentJourney = journeyResult.data || null;
    currentStep = stepResult.data || null;
  }
  if (lead.current_journey_instance_id) {
    const instanceResult = await supabase
      .from('lead_journeys')
      .select('*')
      .eq('id', lead.current_journey_instance_id)
      .maybeSingle();
    if (instanceResult.error) throw instanceResult.error;
    currentInstance = instanceResult.data || null;
  }

  return {
    lead_id: lead.id,
    email: lead.email,
    current_journey: currentJourney,
    current_step: currentStep,
    journey_status: lead.journey_status,
    journey_started_at: lead.journey_started_at,
    journey_completed_at: lead.journey_completed_at,
    next_ready_at: currentInstance ? currentInstance.next_ready_at : null,
    remaining_label:
      currentInstance && lead.journey_status === 'active'
        ? formatRemaining(remainingMs(currentInstance.next_ready_at))
        : lead.journey_status,
    history: (historyResult.data || []).map(function (row) {
      return {
        id: row.id,
        journey_id: row.journey_id,
        journey_name: row.journeys ? row.journeys.name : null,
        trigger_type: row.journeys ? row.journeys.trigger_type : null,
        current_step: row.current_step,
        status: row.status,
        started_at: row.created_at,
        completed_at: row.completed_at,
        updated_at: row.updated_at
      };
    })
  };
}

module.exports = {
  LEAD_JOURNEY_STATUS,
  ACTION_QUEUE_STATUS,
  ACTION_TYPES,
  DELAY_UNITS,
  TRIGGER_TYPES,
  delayToMs,
  computeNextReadyAt,
  formatRemaining,
  enroll,
  enrollLeadInJourney,
  enrollLeadByTrigger,
  enrollLeadOnSignup,
  enrollLeadOnAddToCart,
  enrollLeadOnPurchase,
  enrollLeadOnNoPurchase,
  transitionNoPurchaseLeads,
  promoteReadySteps,
  executeAction,
  runJourneyForTestEmails,
  executePendingActions,
  retryFailedAction,
  executeReadyActions,
  advanceLeadJourney,
  cancelLeadJourney,
  duplicateJourney,
  archiveJourney,
  deleteJourneyPermanently,
  PROTECTED_JOURNEY_KEYS,
  getJourneyWorkspace,
  listJourneysAdmin,
  getJourneyDetail,
  createJourney,
  updateJourney,
  replaceJourneySteps,
  listLeadJourneysAdmin,
  listActionQueueAdmin,
  listHistoryAdmin,
  listEmailLeadsCrm,
  getCustomerLifecycleByEmail,
  recordHistory,
  getJourneyByKey,
  getJourneySteps
};
