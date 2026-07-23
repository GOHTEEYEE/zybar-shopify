/**
 * Marketing Center — overview, audience, and analytics aggregates.
 * Presentation-layer data only; reuses journeys / leads / queue / orders.
 */
const JourneyEngine = require('./journey-engine.js');

function money(cents) {
  return Number(cents) || 0;
}

function pct(n, d) {
  const num = Number(n) || 0;
  const den = Number(d) || 0;
  if (!den) return 0;
  return Number(((num / den) * 100).toFixed(2));
}

function startOfLocalDayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function addDaysIso(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/**
 * Marketing Overview KPIs + lifecycle strip + upcoming sends.
 */
async function getOverview(supabase) {
  const todayStart = startOfLocalDayIso();
  const tomorrowStart = addDaysIso(todayStart, 1);
  const weekEnd = addDaysIso(todayStart, 7);

  const [
    leadsRes,
    leadsTodayRes,
    enrollRes,
    queueRes,
    ordersRes,
    neverEnrolledRes
  ] = await Promise.all([
    supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }),
    supabase
      .from('newsletter_subscribers')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart),
    supabase.from('lead_journeys').select('id, status, journey_id'),
    supabase
      .from('action_queue')
      .select('id, status, scheduled_at, journey_id, action_type, template_id, recipient, opened_at, clicked_at'),
    supabase
      .from('orders')
      .select('id, amount_total_cents, customer_email, created_at, status')
      .limit(5000),
    supabase
      .from('newsletter_subscribers')
      .select('id', { count: 'exact', head: true })
      .is('current_journey_id', null)
  ]);

  if (leadsRes.error) throw leadsRes.error;
  if (enrollRes.error) throw enrollRes.error;
  if (queueRes.error) throw queueRes.error;

  const totalLeads = leadsRes.count || 0;
  const subscribersToday = leadsTodayRes.count || 0;
  const neverEnrolled = neverEnrolledRes.count != null ? neverEnrolledRes.count : 0;

  const enroll = { waiting: 0, ready: 0, completed: 0, cancelled: 0, total: 0, journey_ids: {} };
  (enrollRes.data || []).forEach(function (row) {
    enroll.total += 1;
    if (enroll[row.status] != null) enroll[row.status] += 1;
    enroll.journey_ids[row.journey_id] = true;
  });

  const queue = {
    pending: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    sent_today: 0,
    opened: 0,
    clicked: 0,
    due_today: 0,
    tomorrow: 0,
    next_7: 0,
    future: 0
  };
  const upcoming = [];
  (queueRes.data || []).forEach(function (row) {
    if (queue[row.status] != null) queue[row.status] += 1;
    if (row.status === 'completed') {
      if (row.opened_at) queue.opened += 1;
      if (row.clicked_at) queue.clicked += 1;
    }
    if (row.status === 'pending') {
      const at = row.scheduled_at || '';
      if (at && at < tomorrowStart) {
        queue.due_today += 1;
        if (upcoming.length < 12) upcoming.push(row);
      } else if (at && at < addDaysIso(todayStart, 2)) {
        queue.tomorrow += 1;
        if (upcoming.length < 20) upcoming.push(row);
      } else if (at && at < weekEnd) {
        queue.next_7 += 1;
      } else {
        queue.future += 1;
      }
    }
  });

  const sentTodayRes = await supabase
    .from('action_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('executed_at', todayStart);
  queue.sent_today = sentTodayRes.count || 0;

  const openRes = await supabase
    .from('action_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .not('opened_at', 'is', null);
  const clickRes = await supabase
    .from('action_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .not('clicked_at', 'is', null);
  queue.opened = openRes.count || queue.opened;
  queue.clicked = clickRes.count || queue.clicked;

  const orders = ordersRes.data || [];
  const paidOrders = orders.filter(function (o) {
    return !o.status || o.status === 'paid' || o.status === 'complete' || o.status === 'completed';
  });
  const revenueCents = paidOrders.reduce(function (s, o) {
    return s + money(o.amount_total_cents);
  }, 0);
  const purchaserEmails = {};
  paidOrders.forEach(function (o) {
    const e = String(o.customer_email || '')
      .trim()
      .toLowerCase();
    if (e) purchaserEmails[e] = true;
  });
  const purchased = Object.keys(purchaserEmails).length;

  const emailsSent = queue.completed || 0;
  const openRate = pct(queue.opened, emailsSent);
  const clickRate = pct(queue.clicked, emailsSent);
  const conversionRate = pct(purchased, totalLeads);
  const revenuePerRecipient = totalLeads ? Math.round(revenueCents / totalLeads) : 0;

  // Enrich upcoming with journey names
  const journeyIds = {};
  upcoming.forEach(function (u) {
    if (u.journey_id) journeyIds[u.journey_id] = true;
  });
  const jids = Object.keys(journeyIds);
  let journeysById = {};
  if (jids.length) {
    const jr = await supabase.from('journeys').select('id,name').in('id', jids);
    (jr.data || []).forEach(function (j) {
      journeysById[j.id] = j.name;
    });
  }

  return {
    kpis: {
      total_leads: totalLeads,
      subscribers_today: subscribersToday,
      never_enrolled: neverEnrolled,
      journey_revenue_cents: revenueCents,
      email_revenue_pct: 100,
      open_rate: openRate,
      click_rate: clickRate,
      conversion_rate: conversionRate,
      unsubscribed: 0,
      spam_complaints: 0,
      revenue_per_recipient_cents: revenuePerRecipient,
      emails_sent_today: queue.sent_today,
      pending_actions: queue.pending,
      due_today: queue.due_today
    },
    lifecycle: [
      { key: 'subscribers', label: 'Total Leads', value: totalLeads, href: '#marketing/audience' },
      {
        key: 'enrolled',
        label: 'Journey Started',
        value: Math.max(0, totalLeads - neverEnrolled),
        href: '#marketing/audience?segment=enrolled'
      },
      {
        key: 'waiting',
        label: 'Waiting',
        value: enroll.waiting,
        href: '#marketing/audience?segment=waiting'
      },
      {
        key: 'completed_steps',
        label: 'Completed Steps',
        value: enroll.completed,
        href: '#marketing/audience?segment=completed'
      },
      {
        key: 'cancelled',
        label: 'Cancelled',
        value: enroll.cancelled,
        href: '#marketing/audience?segment=cancelled'
      },
      {
        key: 'purchased',
        label: 'Purchased',
        value: purchased,
        href: '#marketing/audience?segment=purchased'
      },
      {
        key: 'never',
        label: 'Not in Journey',
        value: neverEnrolled,
        href: '#marketing/audience?segment=never'
      }
    ],
    upcoming: {
      today: queue.due_today,
      tomorrow: queue.tomorrow,
      next_7: queue.next_7,
      future: queue.future,
      rows: upcoming
        .sort(function (a, b) {
          return String(a.scheduled_at || '').localeCompare(String(b.scheduled_at || ''));
        })
        .slice(0, 15)
        .map(function (r) {
          return {
            id: r.id,
            email: r.recipient,
            journey: journeysById[r.journey_id] || '—',
            template_id: r.template_id,
            action_type: r.action_type,
            scheduled_at: r.scheduled_at,
            status: r.status
          };
        })
    },
    queue_summary: queue,
    enroll_summary: enroll
  };
}

/**
 * Paginated audience (subscribers) with journey context.
 */
async function getAudience(supabase, options) {
  options = options || {};
  const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 40));
  const offset = Math.max(0, parseInt(options.offset, 10) || 0);
  const q = String(options.q || '')
    .trim()
    .toLowerCase();
  const segment = String(options.segment || '').trim().toLowerCase();
  const includeTest = !!options.include_test;

  let query = supabase
    .from('newsletter_subscribers')
    .select(
      'id,email,status,source,country,created_at,is_test,visitor_id,' +
        'current_journey_id,current_step,journey_status,purchased,order_count,revenue_cents',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  if (!includeTest) query = query.or('is_test.is.null,is_test.eq.false');
  if (q) query = query.ilike('email', '%' + q + '%');
  if (segment === 'never') query = query.is('current_journey_id', null);
  if (segment === 'waiting' || segment === 'active') query = query.eq('journey_status', 'active');
  if (segment === 'completed') query = query.eq('journey_status', 'completed');
  if (segment === 'enrolled') query = query.not('current_journey_id', 'is', null);
  if (segment === 'purchased') query = query.eq('purchased', true);

  query = query.range(offset, offset + limit - 1);
  const result = await query;
  if (result.error) throw result.error;

  const rows = result.data || [];
  const journeyIds = [];
  rows.forEach(function (r) {
    if (r.current_journey_id && journeyIds.indexOf(r.current_journey_id) === -1) {
      journeyIds.push(r.current_journey_id);
    }
  });
  const journeysById = {};
  if (journeyIds.length) {
    const jr = await supabase.from('journeys').select('id,name,journey_key').in('id', journeyIds);
    (jr.data || []).forEach(function (j) {
      journeysById[j.id] = j;
    });
  }

  let mapped = rows.map(function (r) {
    const e = String(r.email || '')
      .trim()
      .toLowerCase();
    const j = journeysById[r.current_journey_id];
    const revenue = money(r.revenue_cents);
    const orders = Number(r.order_count) || 0;
    return {
      id: r.id,
      email: r.email,
      country: r.country || '—',
      source: r.source || '—',
      status: r.status || '—',
      is_test: !!r.is_test,
      created_at: r.created_at,
      last_activity_at: r.created_at,
      journey_name: j ? j.name : r.current_journey_id ? '—' : 'Not in journey',
      journey_key: j ? j.journey_key : null,
      current_step: r.current_step,
      journey_status: r.journey_status || (r.current_journey_id ? '—' : 'none'),
      orders: orders,
      revenue_cents: revenue,
      ltv_cents: revenue,
      visitor_id: r.visitor_id || null,
      customer_href: '#customers/' + encodeURIComponent(e),
      activity_href: r.visitor_id ? '#activity/' + encodeURIComponent(r.visitor_id) : null,
      profile_href: '#marketing/audience/' + encodeURIComponent(r.id)
    };
  });

  if (segment === 'cancelled') {
    mapped = mapped.filter(function (r) {
      return r.journey_status === 'cancelled' || r.journey_status === 'none';
    });
  }

  return {
    total: result.count != null ? result.count : mapped.length,
    limit: limit,
    offset: offset,
    segment: segment || 'all',
    rows: mapped
  };
}

/**
 * Single audience profile + light timeline from history + orders.
 */
async function getAudienceProfile(supabase, leadId) {
  const leadRes = await supabase
    .from('newsletter_subscribers')
    .select('*')
    .eq('id', leadId)
    .maybeSingle();
  if (leadRes.error) throw leadRes.error;
  if (!leadRes.data) return null;

  const lead = leadRes.data;
  const email = String(lead.email || '')
    .trim()
    .toLowerCase();

  const [lifecycle, history, orders, leadJourneys] = await Promise.all([
    JourneyEngine.getCustomerLifecycleByEmail(supabase, email).catch(function () {
      return null;
    }),
    JourneyEngine.listHistoryAdmin(supabase, { limit: 80 }).catch(function () {
      return [];
    }),
    supabase
      .from('orders')
      .select('id,amount_total_cents,status,created_at,product_slug,stripe_session_id')
      .ilike('customer_email', email)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('lead_journeys')
      .select('*, journeys(name, journey_key)')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(20)
  ]);

  const timeline = [];
  (history || [])
    .filter(function (h) {
      return String(h.lead_email || '')
        .trim()
        .toLowerCase() === email;
    })
    .forEach(function (h) {
      timeline.push({
        at: h.at,
        label: h.message || h.event_type || 'Event',
        kind: 'email',
        status: h.status
      });
    });
  (orders.data || []).forEach(function (o) {
    timeline.push({
      at: o.created_at,
      label: 'Purchased · US$' + (money(o.amount_total_cents) / 100).toFixed(2),
      kind: 'purchase',
      href: '#orders/' + o.id
    });
  });
  (leadJourneys.data || []).forEach(function (lj) {
    timeline.push({
      at: lj.created_at || lj.entered_step_at,
      label:
        'Entered ' +
        ((lj.journeys && lj.journeys.name) || 'journey') +
        ' · ' +
        (lj.status || ''),
      kind: 'journey'
    });
  });
  timeline.sort(function (a, b) {
    return String(b.at || '').localeCompare(String(a.at || ''));
  });

  return {
    lead: lead,
    lifecycle: lifecycle,
    orders: orders.data || [],
    lead_journeys: leadJourneys.data || [],
    timeline: timeline.slice(0, 100),
    activity_href: lead.visitor_id ? '#activity/' + encodeURIComponent(lead.visitor_id) : null
  };
}

/**
 * Marketing analytics summary for date range.
 */
async function getAnalytics(supabase, range) {
  range = range || {};
  const start = range.start || addDaysIso(new Date().toISOString(), -30);
  const end = range.end || new Date().toISOString();

  const [queueRes, ordersRes, leadsRes, journeys] = await Promise.all([
    supabase
      .from('action_queue')
      .select('id,journey_id,status,opened_at,clicked_at,executed_at,template_id')
      .gte('created_at', start)
      .lt('created_at', end)
      .limit(10000),
    supabase
      .from('orders')
      .select('amount_total_cents,customer_email,created_at,country')
      .gte('created_at', start)
      .lt('created_at', end)
      .limit(5000),
    supabase
      .from('newsletter_subscribers')
      .select('id,created_at,source,country')
      .gte('created_at', start)
      .lt('created_at', end)
      .limit(5000),
    JourneyEngine.listJourneysAdmin(supabase)
  ]);

  if (queueRes.error) throw queueRes.error;

  const byJourney = {};
  let sent = 0;
  let opened = 0;
  let clicked = 0;
  (queueRes.data || []).forEach(function (r) {
    if (!byJourney[r.journey_id]) {
      byJourney[r.journey_id] = { sent: 0, opened: 0, clicked: 0, pending: 0 };
    }
    if (r.status === 'completed') {
      sent += 1;
      byJourney[r.journey_id].sent += 1;
      if (r.opened_at) {
        opened += 1;
        byJourney[r.journey_id].opened += 1;
      }
      if (r.clicked_at) {
        clicked += 1;
        byJourney[r.journey_id].clicked += 1;
      }
    }
    if (r.status === 'pending') byJourney[r.journey_id].pending += 1;
  });

  const journeyName = {};
  (journeys || []).forEach(function (j) {
    journeyName[j.id] = j.name;
  });

  const revenueByJourney = (journeys || []).map(function (j) {
    const q = byJourney[j.id] || { sent: 0, opened: 0, clicked: 0, pending: 0 };
    return {
      journey_id: j.id,
      name: j.name,
      enrolled: j.enroll_stats ? j.enroll_stats.total : 0,
      waiting: j.enroll_stats ? j.enroll_stats.waiting : 0,
      completed: j.enroll_stats ? j.enroll_stats.completed : 0,
      emails_sent: q.sent,
      open_rate: pct(q.opened, q.sent),
      click_rate: pct(q.clicked, q.sent),
      pending: q.pending
    };
  });

  const revenueCents = (ordersRes.data || []).reduce(function (s, o) {
    return s + money(o.amount_total_cents);
  }, 0);

  const byCountry = {};
  (ordersRes.data || []).forEach(function (o) {
    const c = o.country || 'Unknown';
    if (!byCountry[c]) byCountry[c] = { revenue_cents: 0, orders: 0 };
    byCountry[c].revenue_cents += money(o.amount_total_cents);
    byCountry[c].orders += 1;
  });

  const bySource = {};
  (leadsRes.data || []).forEach(function (l) {
    const s = l.source || 'unknown';
    bySource[s] = (bySource[s] || 0) + 1;
  });

  return {
    range: { start: start, end: end },
    totals: {
      emails_sent: sent,
      open_rate: pct(opened, sent),
      click_rate: pct(clicked, sent),
      ctor: pct(clicked, opened),
      revenue_cents: revenueCents,
      new_subscribers: (leadsRes.data || []).length,
      avg_revenue_per_email: sent ? Math.round(revenueCents / sent) : 0
    },
    revenue_by_journey: revenueByJourney,
    revenue_by_country: Object.keys(byCountry)
      .map(function (c) {
        return { label: c, revenue_cents: byCountry[c].revenue_cents, orders: byCountry[c].orders };
      })
      .sort(function (a, b) {
        return b.revenue_cents - a.revenue_cents;
      })
      .slice(0, 15),
    subscribers_by_source: Object.keys(bySource)
      .map(function (s) {
        return { label: s, value: bySource[s] };
      })
      .sort(function (a, b) {
        return b.value - a.value;
      })
  };
}

module.exports = {
  getOverview,
  getAudience,
  getAudienceProfile,
  getAnalytics
};
