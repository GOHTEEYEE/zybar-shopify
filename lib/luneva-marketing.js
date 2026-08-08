/**
 * LUNEVA Marketing Center — overview, audience, journeys, queue.
 * Brand-scoped; never mixes ZYBAR automotive leads or sends.
 */
const BrandAnalytics = require('./brand-analytics.js');
const JourneyEngine = require('./journey-engine.js');
const EmailTemplates = require('./email-templates.js');

const LUNEVA_JOURNEY_KEYS = [
  'luneva_welcome_journey',
  'luneva_cart_journey',
  'luneva_customer_journey'
];

function money(cents) {
  return Number(cents) || 0;
}

function startOfLocalDayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function isLunevaJourney(row) {
  if (!row) return false;
  if (String(row.brand || '').toLowerCase() === BrandAnalytics.BRAND_LUNEVA) return true;
  return String(row.journey_key || '').indexOf('luneva_') === 0;
}

async function listLunevaJourneyRows(supabase) {
  const result = await supabase.from('journeys').select('*').order('name', { ascending: true });
  if (result.error) throw result.error;
  return (result.data || []).filter(isLunevaJourney);
}

async function getLunevaJourneyIdSet(supabase) {
  const rows = await listLunevaJourneyRows(supabase);
  const set = {};
  rows.forEach(function (j) {
    set[j.id] = j;
  });
  return set;
}

async function listActiveLunevaLeads(supabase, options) {
  options = options || {};
  const limit = Math.min(10000, Math.max(1, parseInt(options.limit, 10) || 5000));
  let query = supabase
    .from('newsletter_subscribers')
    .select(
      'id,email,status,source,discount_code,brand,country,created_at,is_test,visitor_id,' +
        'current_journey_id,current_step,journey_status,purchased,order_count,revenue_cents,used_discount'
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  query = BrandAnalytics.applyLunevaLeadFilters(query);
  if (!options.include_test) query = query.or('is_test.is.null,is_test.eq.false');
  const result = await query;
  if (result.error && /brand|column|purchased|order_count|is_test/i.test(String(result.error.message || ''))) {
    const legacy = await supabase
      .from('newsletter_subscribers')
      .select(
        'id,email,status,source,discount_code,brand,country,created_at,visitor_id,' +
          'current_journey_id,current_step,journey_status,used_discount'
      )
      .or('source.ilike.%luneva%,discount_code.eq.LUNEVA5,brand.eq.luneva')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (legacy.error) throw legacy.error;
    return (legacy.data || []).filter(BrandAnalytics.isLunevaLead);
  }
  if (result.error) throw result.error;
  return (result.data || []).filter(BrandAnalytics.isLunevaLead);
}

async function getOverview(supabase) {
  const todayStart = startOfLocalDayIso();
  const [leads, journeysById] = await Promise.all([
    listActiveLunevaLeads(supabase),
    getLunevaJourneyIdSet(supabase)
  ]);
  const journeyIds = Object.keys(journeysById);

  const [enrollRes, queueRes] = await Promise.all([
    journeyIds.length
      ? supabase.from('lead_journeys').select('id,status,journey_id').in('journey_id', journeyIds)
      : Promise.resolve({ data: [], error: null }),
    journeyIds.length
      ? supabase
          .from('action_queue')
          .select(
            'id,status,scheduled_at,executed_at,journey_id,action_type,template_id,recipient,opened_at,clicked_at'
          )
          .in('journey_id', journeyIds)
          .limit(5000)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (enrollRes.error) throw enrollRes.error;
  if (queueRes.error) throw queueRes.error;

  const totalLeads = leads.length;
  const subscribersToday = leads.filter(function (l) {
    return l.created_at && String(l.created_at) >= todayStart;
  }).length;
  const neverEnrolled = leads.filter(function (l) {
    return !l.current_journey_id;
  }).length;

  const byKey = {};
  LUNEVA_JOURNEY_KEYS.forEach(function (key) {
    byKey[key] = { current: 0, active: 0, waiting_history: 0, completed_history: 0, ever_enrolled: 0 };
  });

  leads.forEach(function (lead) {
    const j = lead.current_journey_id ? journeysById[lead.current_journey_id] : null;
    if (!j) return;
    const key = j.journey_key;
    if (!byKey[key]) {
      byKey[key] = { current: 0, active: 0, waiting_history: 0, completed_history: 0, ever_enrolled: 0 };
    }
    byKey[key].current += 1;
    if (lead.journey_status === 'active') byKey[key].active += 1;
  });

  (enrollRes.data || []).forEach(function (row) {
    const j = journeysById[row.journey_id];
    if (!j) return;
    const key = j.journey_key;
    if (!byKey[key]) {
      byKey[key] = { current: 0, active: 0, waiting_history: 0, completed_history: 0, ever_enrolled: 0 };
    }
    byKey[key].ever_enrolled += 1;
    if (row.status === 'waiting' || row.status === 'ready') byKey[key].waiting_history += 1;
    if (row.status === 'completed') byKey[key].completed_history += 1;
  });

  const now = Date.now();
  const queue = { pending: 0, due: 0, waiting: 0, completed: 0, failed: 0 };
  let emailsSentToday = 0;
  let opened = 0;
  let clicked = 0;
  (queueRes.data || []).forEach(function (row) {
    if (row.status === 'pending') {
      queue.pending += 1;
      const scheduled = row.scheduled_at ? new Date(row.scheduled_at).getTime() : 0;
      if (scheduled && scheduled <= now) queue.due += 1;
      else queue.waiting += 1;
    } else if (row.status === 'completed') {
      queue.completed += 1;
      if (row.executed_at && String(row.executed_at) >= todayStart) emailsSentToday += 1;
      if (row.opened_at) opened += 1;
      if (row.clicked_at) clicked += 1;
    } else if (row.status === 'failed') {
      queue.failed += 1;
    }
  });

  const journeyCategories = [
    {
      key: 'welcome',
      label: 'Welcome',
      journey_key: 'luneva_welcome_journey',
      href: '#mkt-audience?journey=luneva_welcome_journey',
      current: byKey.luneva_welcome_journey.current,
      active: byKey.luneva_welcome_journey.active,
      waiting_history: byKey.luneva_welcome_journey.waiting_history,
      completed_history: byKey.luneva_welcome_journey.completed_history,
      ever_enrolled: byKey.luneva_welcome_journey.ever_enrolled
    },
    {
      key: 'cart',
      label: 'Cart recovery',
      journey_key: 'luneva_cart_journey',
      href: '#mkt-audience?journey=luneva_cart_journey',
      current: byKey.luneva_cart_journey.current,
      active: byKey.luneva_cart_journey.active,
      waiting_history: byKey.luneva_cart_journey.waiting_history,
      completed_history: byKey.luneva_cart_journey.completed_history,
      ever_enrolled: byKey.luneva_cart_journey.ever_enrolled
    },
    {
      key: 'purchase',
      label: 'Purchase',
      journey_key: 'luneva_customer_journey',
      href: '#mkt-audience?journey=luneva_customer_journey',
      current: byKey.luneva_customer_journey.current,
      active: byKey.luneva_customer_journey.active,
      waiting_history: byKey.luneva_customer_journey.waiting_history,
      completed_history: byKey.luneva_customer_journey.completed_history,
      ever_enrolled: byKey.luneva_customer_journey.ever_enrolled
    }
  ];

  return {
    kpis: {
      total_leads: totalLeads,
      subscribers_today: subscribersToday,
      never_enrolled: neverEnrolled,
      welcome_leads: byKey.luneva_welcome_journey.current,
      cart_leads: byKey.luneva_cart_journey.current,
      purchase_leads: byKey.luneva_customer_journey.current,
      emails_sent_today: emailsSentToday,
      due_today: queue.due,
      open_rate: queue.completed ? Number(((opened / queue.completed) * 100).toFixed(1)) : 0,
      click_rate: queue.completed ? Number(((clicked / queue.completed) * 100).toFixed(1)) : 0
    },
    journey_categories: journeyCategories,
    queue_summary: queue,
    journeys: Object.keys(journeysById).map(function (id) {
      const j = journeysById[id];
      return { id: j.id, name: j.name, journey_key: j.journey_key, status: j.status };
    })
  };
}

async function getAudience(supabase, options) {
  options = options || {};
  const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 50));
  const offset = Math.max(0, parseInt(options.offset, 10) || 0);
  const q = String(options.q || '')
    .trim()
    .toLowerCase();
  const segment = String(options.segment || '')
    .trim()
    .toLowerCase();
  const journeyFilter = String(options.journey || options.journey_key || '')
    .trim()
    .toLowerCase();

  const [leads, journeysById] = await Promise.all([
    listActiveLunevaLeads(supabase),
    getLunevaJourneyIdSet(supabase)
  ]);

  let journeyIdFilter = null;
  if (journeyFilter) {
    const match = Object.keys(journeysById).find(function (id) {
      return String(journeysById[id].journey_key || '').toLowerCase() === journeyFilter;
    });
    journeyIdFilter = match || '__none__';
  }

  let filtered = leads.slice();
  if (q) {
    filtered = filtered.filter(function (r) {
      return String(r.email || '')
        .toLowerCase()
        .indexOf(q) !== -1;
    });
  }
  if (segment === 'never') {
    filtered = filtered.filter(function (r) {
      return !r.current_journey_id;
    });
  } else if (segment === 'enrolled' || segment === 'active' || segment === 'waiting') {
    filtered = filtered.filter(function (r) {
      return !!r.current_journey_id && (r.journey_status === 'active' || !r.journey_status);
    });
  } else if (segment === 'completed') {
    filtered = filtered.filter(function (r) {
      return r.journey_status === 'completed';
    });
  } else if (segment === 'popup') {
    filtered = filtered.filter(function (r) {
      return String(r.source || '').indexOf('luneva_popup') === 0;
    });
  } else if (segment === 'checkout') {
    filtered = filtered.filter(function (r) {
      const src = String(r.source || '');
      return src === 'luneva_checkout' || src.indexOf('checkout') !== -1;
    });
  }
  if (journeyIdFilter === '__none__') filtered = [];
  else if (journeyIdFilter) {
    filtered = filtered.filter(function (r) {
      return r.current_journey_id === journeyIdFilter;
    });
  }

  const total = filtered.length;
  const rows = filtered.slice(offset, offset + limit).map(function (r) {
    const j = journeysById[r.current_journey_id];
    return {
      id: r.id,
      email: r.email,
      country: r.country || '—',
      source: r.source || '—',
      status: r.status || '—',
      created_at: r.created_at,
      journey_name: j ? j.name : r.current_journey_id ? '—' : 'Not in journey',
      journey_key: j ? j.journey_key : null,
      current_step: r.current_step,
      journey_status: r.journey_status || (r.current_journey_id ? '—' : 'none'),
      orders: Number(r.order_count) || 0,
      revenue_cents: money(r.revenue_cents)
    };
  });

  return {
    total: total,
    limit: limit,
    offset: offset,
    segment: segment || 'all',
    journey: journeyFilter || '',
    rows: rows
  };
}

async function listJourneys(supabase) {
  const journeys = await listLunevaJourneyRows(supabase);
  const ids = journeys.map(function (j) {
    return j.id;
  });
  if (!ids.length) return [];

  const [stepsRes, enrollRes, queueRes] = await Promise.all([
    supabase.from('journey_steps').select('*').in('journey_id', ids).order('step_order', { ascending: true }),
    supabase.from('lead_journeys').select('id,journey_id,status').in('journey_id', ids),
    supabase.from('action_queue').select('id,journey_id,status').in('journey_id', ids)
  ]);
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
    if (enrollStats[row.journey_id][row.status] != null) enrollStats[row.journey_id][row.status] += 1;
  });

  const queueStats = {};
  (queueRes.data || []).forEach(function (row) {
    if (!queueStats[row.journey_id]) {
      queueStats[row.journey_id] = { pending: 0, completed: 0, failed: 0 };
    }
    if (queueStats[row.journey_id][row.status] != null) queueStats[row.journey_id][row.status] += 1;
  });

  return journeys.map(function (j) {
    return Object.assign({}, j, {
      steps: stepsByJourney[j.id] || [],
      enroll_stats: enrollStats[j.id] || { waiting: 0, ready: 0, completed: 0, cancelled: 0, total: 0 },
      queue_stats: queueStats[j.id] || { pending: 0, completed: 0, failed: 0 }
    });
  });
}

async function listQueue(supabase, options) {
  options = options || {};
  const journeysById = await getLunevaJourneyIdSet(supabase);
  const ids = Object.keys(journeysById);
  if (!ids.length) return [];

  const limit = Math.min(500, Math.max(1, parseInt(options.limit, 10) || 200));
  let query = supabase
    .from('action_queue')
    .select(
      '*, journeys(name, journey_key), journey_steps(step_name, step_order), newsletter_subscribers(email)'
    )
    .in('journey_id', ids)
    .order('scheduled_at', { ascending: true })
    .limit(limit);
  if (options.status) query = query.eq('status', options.status);
  const result = await query;
  if (result.error) throw result.error;

  return (result.data || []).map(function (row) {
    return {
      id: row.id,
      lead_id: row.lead_id,
      journey_id: row.journey_id,
      template_id: row.template_id,
      recipient: row.recipient,
      scheduled_at: row.scheduled_at,
      status: row.status,
      executed_at: row.executed_at,
      error_message: row.error_message,
      opened_at: row.opened_at || null,
      clicked_at: row.clicked_at || null,
      journey_name: row.journeys && row.journeys.name ? row.journeys.name : null,
      journey_key: row.journeys && row.journeys.journey_key ? row.journeys.journey_key : null,
      step_name:
        (row.journey_steps && row.journey_steps.step_name) || row.step_name_snapshot || null,
      lead_email:
        (row.newsletter_subscribers && row.newsletter_subscribers.email) || row.recipient
    };
  });
}

/**
 * Promote + execute only LUNEVA journey queue items.
 */
async function executeReady(supabase, env, options) {
  options = options || {};
  const journeysById = await getLunevaJourneyIdSet(supabase);
  const journeyIds = Object.keys(journeysById);
  if (!journeyIds.length) {
    return { promoted: 0, processed: 0, completed: 0, failed: 0, cancelled: 0, rounds: 0 };
  }

  const batchLimit = Math.max(1, Math.min(100, Number(options.limit) || 25));
  const promoteLimit = Math.max(1, Math.min(200, Number(options.promote_limit) || 100));
  const maxRounds = Math.max(1, Math.min(40, Number(options.max_rounds) || 20));

  let promoted = 0;
  let processed = 0;
  let completed = 0;
  let failed = 0;
  let cancelled = 0;
  let rounds = 0;

  for (let round = 0; round < maxRounds; round++) {
    rounds += 1;
    const due = await supabase
      .from('lead_journeys')
      .select('*')
      .in('journey_id', journeyIds)
      .eq('status', 'waiting')
      .lte('next_ready_at', new Date().toISOString())
      .order('next_ready_at', { ascending: true })
      .limit(promoteLimit);
    if (due.error) throw due.error;

    let roundPromoted = 0;
    for (const lj of due.data || []) {
      const result = await JourneyEngine.promoteLeadJourneyStep(supabase, lj);
      if (result && result.promoted) {
        promoted += 1;
        roundPromoted += 1;
      }
    }

    const pending = await supabase
      .from('action_queue')
      .select('*')
      .in('journey_id', journeyIds)
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(batchLimit);
    if (pending.error) throw pending.error;

    const rows = pending.data || [];
    let roundProcessed = 0;
    for (const row of rows) {
      const out = await JourneyEngine.executeAction(supabase, row, env);
      processed += 1;
      roundProcessed += 1;
      if (out.ok) completed += 1;
      else if (out.status === 'cancelled') cancelled += 1;
      else failed += 1;
    }

    if (roundProcessed === 0 && roundPromoted === 0) break;
    if (roundProcessed < batchLimit && roundPromoted === 0) break;
  }

  return {
    promoted: promoted,
    processed: processed,
    completed: completed,
    failed: failed,
    cancelled: cancelled,
    rounds: rounds,
    brand: 'luneva'
  };
}

function listTemplates() {
  return EmailTemplates.listTemplates().filter(function (t) {
    return String(t.key || '').indexOf('luneva_') === 0;
  });
}

async function previewTemplate(supabase, templateKey, env) {
  const key = String(templateKey || '').trim();
  if (!key || key.indexOf('luneva_') !== 0) {
    return { status: 400, json: { success: false, error: 'Select a LUNEVA template.' } };
  }
  const definition = EmailTemplates.getTemplateDefinition(key);
  if (!definition) {
    return { status: 404, json: { success: false, error: 'Template not found: ' + key } };
  }

  const TemplateStore = require('./email-template-store.js');
  const Unsubscribe = require('./unsubscribe.js');
  const MemberPricing = require('./member-pricing.js');
  env = env || process.env;

  const vars = {
    customerName: 'Alex',
    discountCode: EmailTemplates.LUNEVA_DISCOUNT_CODE,
    memberCredential: MemberPricing.issueCredential(
      { email: 'preview@luneva.example', discount_code: EmailTemplates.LUNEVA_DISCOUNT_CODE },
      MemberPricing.TIERS.luneva.id,
      env
    ),
    storeName: EmailTemplates.LUNEVA_STORE_NAME,
    storeUrl: env.STORE_URL || EmailTemplates.DEFAULT_STORE_URL,
    unsubscribeUrl: Unsubscribe.buildUrl('preview@luneva.example', env)
  };

  const rendered = await TemplateStore.renderTemplate(supabase, key, vars);
  return {
    status: 200,
    json: {
      success: true,
      template: definition,
      preview: {
        subject: rendered.subject,
        html: rendered.html,
        preheader: rendered.preheader || null
      }
    }
  };
}

async function enrollNeverIntoWelcome(supabase, options) {
  options = options || {};
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
  const leads = await listActiveLunevaLeads(supabase);
  const candidates = leads
    .filter(function (lead) {
      return lead && lead.id && !lead.current_journey_id;
    })
    .slice(0, limit);

  let enrolled = 0;
  let failed = 0;
  const errors = [];

  for (const lead of candidates) {
    try {
      const full = await supabase
        .from('newsletter_subscribers')
        .select('*')
        .eq('id', lead.id)
        .maybeSingle();
      if (full.error || !full.data) {
        failed += 1;
        continue;
      }
      const rows = await JourneyEngine.enrollLeadOnSignup(supabase, full.data);
      if (rows && rows.length) enrolled += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      errors.push({
        email: lead.email,
        error: (err && err.message) || 'Enroll failed'
      });
    }
  }

  return {
    scanned: candidates.length,
    enrolled: enrolled,
    failed: failed,
    errors: errors.slice(0, 20)
  };
}

module.exports = {
  LUNEVA_JOURNEY_KEYS,
  getOverview,
  getAudience,
  listJourneys,
  listQueue,
  executeReady,
  enrollNeverIntoWelcome,
  listTemplates,
  previewTemplate,
  getLunevaJourneyIdSet
};
