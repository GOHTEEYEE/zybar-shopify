/**
 * Customer Journey Engine
 *
 * Generic multi-step journeys. Email is one action_type — never hardcode
 * email into enrollment / ready / advance logic. Phase 1 executes email only
 * via the shared sendEmail() service, and only when an admin clicks Execute.
 */
const Email = require('./email.js');
const EmailTemplates = require('./email-templates.js');
const TemplateStore = require('./email-template-store.js');
const LeadStatus = require('./lead-status.js');

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
const TRIGGER_TYPES = ['signup', 'add_to_cart', 'purchase', 'no_purchase', 'manual'];

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
  const result = await supabase
    .from('journeys')
    .select('*')
    .eq('trigger_type', triggerType)
    .eq('is_active', true);
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
    storeName: env.STORE_NAME || EmailTemplates.DEFAULT_STORE_NAME,
    storeUrl: env.STORE_URL || EmailTemplates.DEFAULT_STORE_URL
  };
}

/**
 * Enroll a lead into a journey at step 1.
 * Does not execute any action — only schedules next_ready_at.
 */
async function enrollLeadInJourney(supabase, lead, journey) {
  if (!supabase || !lead || !lead.id || !journey || !journey.id) return null;

  const steps = await getJourneySteps(supabase, journey.id);
  if (!steps.length) {
    throw new Error('Journey has no steps: ' + (journey.journey_key || journey.id));
  }

  const first = steps[0];
  const entered = nowIso();
  const nextReadyAt = computeNextReadyAt(entered, first.delay_value, first.delay_unit);

  const insert = await supabase
    .from('lead_journeys')
    .insert({
      lead_id: lead.id,
      journey_id: journey.id,
      current_step: first.step_order,
      entered_step_at: entered,
      next_ready_at: nextReadyAt,
      status: LEAD_JOURNEY_STATUS.WAITING,
      updated_at: entered
    })
    .select('*')
    .single();

  if (insert.error) {
    if (String(insert.error.code) === '23505') return null;
    throw insert.error;
  }

  return insert.data;
}

/**
 * Enroll lead into all active journeys for a trigger type.
 */
async function enrollLeadByTrigger(supabase, lead, triggerType) {
  if (!supabase || !lead || !lead.id) return [];
  const journeys = await getJourneysByTrigger(supabase, triggerType);
  const enrolled = [];
  for (const journey of journeys) {
    const row = await enrollLeadInJourney(supabase, lead, journey);
    if (row) enrolled.push(row);
  }
  return enrolled;
}

async function enrollLeadOnSignup(supabase, lead) {
  return enrollLeadByTrigger(supabase, lead, 'signup');
}

async function enrollLeadOnAddToCart(supabase, lead) {
  return enrollLeadByTrigger(supabase, lead, 'add_to_cart');
}

async function enrollLeadOnPurchase(supabase, lead) {
  return enrollLeadByTrigger(supabase, lead, 'purchase');
}

/**
 * Promote waiting lead_journeys whose next_ready_at has passed:
 * status → ready + create pending action_queue row.
 * Manual only in Phase 1 (called from admin Queue UI / API).
 */
async function promoteReadySteps(supabase, limit) {
  const cap = Math.max(1, Math.min(200, Number(limit) || 50));
  const now = nowIso();

  const due = await supabase
    .from('lead_journeys')
    .select('*')
    .eq('status', LEAD_JOURNEY_STATUS.WAITING)
    .lte('next_ready_at', now)
    .order('next_ready_at', { ascending: true })
    .limit(cap);

  if (due.error) throw due.error;
  const rows = due.data || [];
  const promoted = [];
  const skipped = [];

  for (const lj of rows) {
    const step = await getStepByOrder(supabase, lj.journey_id, lj.current_step);
    if (!step) {
      skipped.push({ lead_journey_id: lj.id, reason: 'step_not_found' });
      continue;
    }

    const lead = await getLeadById(supabase, lj.lead_id);
    const recipient = lead && lead.email ? lead.email : null;

    const queueInsert = await supabase
      .from('action_queue')
      .insert({
        lead_id: lj.lead_id,
        journey_id: lj.journey_id,
        step_id: step.id,
        lead_journey_id: lj.id,
        action_type: step.action_type,
        template_id: step.template_id || null,
        recipient: recipient,
        scheduled_at: lj.next_ready_at,
        status: ACTION_QUEUE_STATUS.PENDING,
        updated_at: now
      })
      .select('*')
      .single();

    if (queueInsert.error) {
      if (String(queueInsert.error.code) === '23505') {
        await supabase
          .from('lead_journeys')
          .update({ status: LEAD_JOURNEY_STATUS.READY, updated_at: now })
          .eq('id', lj.id)
          .eq('status', LEAD_JOURNEY_STATUS.WAITING);
        skipped.push({ lead_journey_id: lj.id, reason: 'queue_already_exists' });
        continue;
      }
      throw queueInsert.error;
    }

    const update = await supabase
      .from('lead_journeys')
      .update({ status: LEAD_JOURNEY_STATUS.READY, updated_at: now })
      .eq('id', lj.id)
      .eq('status', LEAD_JOURNEY_STATUS.WAITING)
      .select('*')
      .maybeSingle();

    if (update.error) throw update.error;

    promoted.push({
      lead_journey: update.data || lj,
      action: queueInsert.data
    });
  }

  return { scanned: rows.length, promoted: promoted.length, skipped: skipped.length, items: promoted };
}

/**
 * Execute a single action_queue row.
 * Phase 1: email only. Other types are marked failed with a clear message.
 */
async function executeAction(supabase, action, env) {
  if (!action || !action.id) return { ok: false, error: 'Missing action' };

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

  try {
    if (actionType === 'email') {
      await executeEmailAction(supabase, row, env);
    } else {
      throw new Error(
        'Action type "' +
          actionType +
          '" is not executable in Phase 1. Architecture supports it; wire a handler later.'
      );
    }

    const completedAt = nowIso();
    await supabase
      .from('action_queue')
      .update({
        status: ACTION_QUEUE_STATUS.COMPLETED,
        executed_at: completedAt,
        error_message: null,
        updated_at: completedAt
      })
      .eq('id', row.id);

    await advanceLeadJourney(supabase, row);

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
    env: env || process.env
  });

  if (!sendResult.ok) {
    throw new Error(sendResult.error || 'Failed to send email');
  }
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
  if (!action.lead_journey_id) {
    const find = await supabase
      .from('lead_journeys')
      .select('*')
      .eq('lead_id', action.lead_id)
      .eq('journey_id', action.journey_id)
      .in('status', [LEAD_JOURNEY_STATUS.READY, LEAD_JOURNEY_STATUS.WAITING])
      .maybeSingle();
    if (find.error) throw find.error;
    if (!find.data) return null;
    action = Object.assign({}, action, { lead_journey_id: find.data.id });
  }

  const ljRes = await supabase
    .from('lead_journeys')
    .select('*')
    .eq('id', action.lead_journey_id)
    .maybeSingle();
  if (ljRes.error) throw ljRes.error;
  const lj = ljRes.data;
  if (!lj) return null;

  const steps = await getJourneySteps(supabase, lj.journey_id);
  const nextOrder = (lj.current_step || 1) + 1;
  const nextStep = steps.find(function (s) {
    return s.step_order === nextOrder;
  });

  const now = nowIso();

  if (!nextStep) {
    const done = await supabase
      .from('lead_journeys')
      .update({
        status: LEAD_JOURNEY_STATUS.COMPLETED,
        completed_at: now,
        updated_at: now
      })
      .eq('id', lj.id)
      .select('*')
      .maybeSingle();
    if (done.error) throw done.error;
    return done.data;
  }

  const entered = now;
  const nextReadyAt = computeNextReadyAt(entered, nextStep.delay_value, nextStep.delay_unit);
  const advanced = await supabase
    .from('lead_journeys')
    .update({
      current_step: nextStep.step_order,
      entered_step_at: entered,
      next_ready_at: nextReadyAt,
      status: LEAD_JOURNEY_STATUS.WAITING,
      updated_at: now
    })
    .eq('id', lj.id)
    .select('*')
    .maybeSingle();

  if (advanced.error) throw advanced.error;
  return advanced.data;
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

  for (const row of rows) {
    const out = await executeAction(supabase, row, env);
    results.push(out);
    if (out.ok) completed += 1;
    else failed += 1;
  }

  return { processed: rows.length, completed: completed, failed: failed, results: results };
}

async function cancelLeadJourney(supabase, leadJourneyId) {
  const now = nowIso();
  const update = await supabase
    .from('lead_journeys')
    .update({ status: LEAD_JOURNEY_STATUS.CANCELLED, updated_at: now })
    .eq('id', leadJourneyId)
    .in('status', [LEAD_JOURNEY_STATUS.WAITING, LEAD_JOURNEY_STATUS.READY])
    .select('*')
    .maybeSingle();
  if (update.error) throw update.error;

  if (update.data) {
    await supabase
      .from('action_queue')
      .update({ status: ACTION_QUEUE_STATUS.CANCELLED, updated_at: now })
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
      is_active: payload.is_active !== false,
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
  if (payload.is_active !== undefined) patch.is_active = !!payload.is_active;

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
  const limit = Math.max(1, Math.min(200, Number(options.limit) || 100));

  let query = supabase
    .from('lead_journeys')
    .select('*, journeys(id, name, journey_key, trigger_type), newsletter_subscribers(id, email)')
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
      journey_name: row.journeys && row.journeys.name ? row.journeys.name : null,
      step_name: row.journey_steps && row.journey_steps.step_name ? row.journey_steps.step_name : null,
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
 */
async function executeReadyActions(supabase, env, options) {
  options = options || {};
  const promote = await promoteReadySteps(supabase, options.promote_limit || 50);
  const execute = await executePendingActions(supabase, env, {
    limit: options.limit || 25,
    action_id: options.action_id || null
  });
  return {
    promoted: promote.promoted,
    scanned: promote.scanned,
    processed: execute.processed,
    completed: execute.completed,
    failed: execute.failed,
    results: execute.results
  };
}

async function duplicateJourney(supabase, journeyId) {
  const source = await getJourneyDetail(supabase, journeyId);
  if (!source) throw new Error('Journey not found');
  const copy = await createJourney(supabase, {
    name: source.name + ' (Copy)',
    description: source.description,
    trigger_type: source.trigger_type,
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

async function deleteJourney(supabase, journeyId) {
  // Cancel active enrollments first
  const now = nowIso();
  await supabase
    .from('lead_journeys')
    .update({ status: LEAD_JOURNEY_STATUS.CANCELLED, updated_at: now })
    .eq('journey_id', journeyId)
    .in('status', [LEAD_JOURNEY_STATUS.WAITING, LEAD_JOURNEY_STATUS.READY]);

  await supabase
    .from('action_queue')
    .update({ status: ACTION_QUEUE_STATUS.CANCELLED, updated_at: now })
    .eq('journey_id', journeyId)
    .eq('status', ACTION_QUEUE_STATUS.PENDING);

  const del = await supabase.from('journeys').delete().eq('id', journeyId).select('id').maybeSingle();
  if (del.error) throw del.error;
  return !!del.data;
}

async function getJourneyWorkspace(supabase, journeyId) {
  const journey = await getJourneyDetail(supabase, journeyId);
  if (!journey) return null;
  const activeLeads = await listLeadJourneysAdmin(supabase, {
    journey_id: journeyId,
    limit: 100
  });
  const templates = await TemplateStore.listTemplates(supabase, { status: 'active' });
  return {
    journey: journey,
    active_leads: activeLeads.filter(function (lj) {
      return lj.status === 'waiting' || lj.status === 'ready';
    }),
    all_leads: activeLeads,
    templates: templates,
    action_types: ACTION_TYPES,
    delay_units: DELAY_UNITS,
    trigger_types: TRIGGER_TYPES
  };
}

async function listHistoryAdmin(supabase, limit) {
  const cap = Math.max(1, Math.min(200, Number(limit) || 100));
  const events = [];

  try {
    const hist = await supabase
      .from('marketing_history')
      .select('*, journeys(name)')
      .order('created_at', { ascending: false })
      .limit(cap);
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

  try {
    const campaigns = await supabase
      .from('campaign_send_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(cap);
    if (!campaigns.error) {
      (campaigns.data || []).forEach(function (row) {
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
            ', skipped ' +
            row.skipped_count +
            ', failed ' +
            row.failed_count,
          status: row.status,
          metadata: {
            audience: row.audience,
            template_key: row.template_key,
            sent_count: row.sent_count,
            skipped_count: row.skipped_count,
            failed_count: row.failed_count,
            error_message: row.error_message
          }
        });
      });
    }
  } catch (e) {}

  try {
    const queue = await listActionQueueAdmin(supabase, { limit: cap });
    queue.forEach(function (row) {
      if (row.status === 'pending' || row.status === 'executing') return;
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

  const leads = status
    ? await LeadStatus.listLeadsByStatus(supabase, status, { limit: limit })
    : await LeadStatus.listActiveLeads(supabase, { limit: limit });

  const audiences = await LeadStatus.getAudienceCounts(supabase);
  const leadIds = leads
    .map(function (l) {
      return l.id;
    })
    .filter(Boolean);

  const journeyByLead = {};
  if (leadIds.length) {
    const ljSimple = await supabase
      .from('lead_journeys')
      .select('*, journeys(name, journey_key)')
      .in('lead_id', leadIds)
      .in('status', ['waiting', 'ready'])
      .order('updated_at', { ascending: false });

    if (!ljSimple.error) {
      const stepsNeeded = {};
      (ljSimple.data || []).forEach(function (row) {
        if (journeyByLead[row.lead_id]) return;
        stepsNeeded[row.journey_id] = true;
        journeyByLead[row.lead_id] = row;
      });
      const jids = Object.keys(stepsNeeded);
      const stepsByJourney = {};
      if (jids.length) {
        const stepsRes = await supabase.from('journey_steps').select('*').in('journey_id', jids);
        if (!stepsRes.error) {
          (stepsRes.data || []).forEach(function (s) {
            if (!stepsByJourney[s.journey_id]) stepsByJourney[s.journey_id] = [];
            stepsByJourney[s.journey_id].push(s);
          });
        }
      }
      Object.keys(journeyByLead).forEach(function (lid) {
        const row = journeyByLead[lid];
        journeyByLead[lid] = enrichLeadJourney(
          row,
          row.journeys,
          stepsByJourney[row.journey_id] || []
        );
      });
    }
  }

  return {
    audiences: audiences.audiences,
    total: audiences.total,
    leads: leads.map(function (lead) {
      const lj = journeyByLead[lead.id] || null;
      return {
        id: lead.id,
        email: lead.email,
        status: lead.status,
        product_name: lead.product_name || null,
        country: lead.country || null,
        created_at: lead.created_at || null,
        last_activity_at: lead.last_activity_at || lead.updated_at || lead.created_at || null,
        journey_name: lj ? lj.journey_name : null,
        journey_status: lj ? lj.status : null,
        current_step: lj ? lj.current_step : null,
        current_step_name: lj ? lj.current_step_name : null,
        next_ready_at: lj ? lj.next_ready_at : null,
        remaining_label: lj ? lj.remaining_label : null,
        next_action: lj
          ? (lj.current_action_type || '') +
            (lj.current_template_id ? ' · ' + lj.current_template_id : '')
          : null
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
  enrollLeadInJourney,
  enrollLeadByTrigger,
  enrollLeadOnSignup,
  enrollLeadOnAddToCart,
  enrollLeadOnPurchase,
  promoteReadySteps,
  executeAction,
  executePendingActions,
  executeReadyActions,
  advanceLeadJourney,
  cancelLeadJourney,
  duplicateJourney,
  deleteJourney,
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
  recordHistory,
  getJourneyByKey,
  getJourneySteps
};
