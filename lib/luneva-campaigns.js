/**
 * LUNEVA one-off campaign sends — brand-scoped, never touches ZYBAR leads.
 */
const crypto = require('crypto');
const BrandAnalytics = require('./brand-analytics.js');
const Email = require('./email.js');
const EmailTemplates = require('./email-templates.js');
const TemplateStore = require('./email-template-store.js');
const Unsubscribe = require('./unsubscribe.js');
const MemberPricing = require('./member-pricing.js');

const AUDIENCES = [
  {
    key: 'all',
    label: 'All LUNEVA emails',
    match: function () {
      return true;
    }
  },
  {
    key: 'popup',
    label: 'Welcome popup only',
    match: function (lead) {
      return String(lead.source || '').indexOf('luneva_popup') === 0;
    }
  },
  {
    key: 'checkout',
    label: 'Checkout leads (unpaid)',
    match: function (lead) {
      const src = String(lead.source || '');
      return src === 'luneva_checkout' || src === 'checkout_email' || src.indexOf('checkout') !== -1;
    }
  },
  {
    key: 'no_purchase',
    label: 'Not yet purchased',
    match: function (lead) {
      return !lead.purchased && !lead.used_discount && !(Number(lead.order_count) > 0);
    }
  }
];

function isValidAudience(key) {
  return AUDIENCES.some(function (a) {
    return a.key === key;
  });
}

function audienceMeta(key) {
  for (let i = 0; i < AUDIENCES.length; i++) {
    if (AUDIENCES[i].key === key) return AUDIENCES[i];
  }
  return null;
}

function listLunevaTemplateCatalog() {
  return EmailTemplates.listTemplates()
    .filter(function (t) {
      return String(t.key || '').indexOf('luneva_') === 0;
    })
    .map(function (t) {
      return {
        key: t.key,
        name: t.name,
        description: t.description || ''
      };
    });
}

async function listActiveLunevaLeads(supabase) {
  let query = supabase
    .from('newsletter_subscribers')
    .select(
      'id,email,source,brand,discount_code,status,created_at,visitor_id,used_discount,order_count,purchased,is_test'
    )
    .neq('status', 'unsubscribed')
    .order('created_at', { ascending: false })
    .limit(5000);
  query = BrandAnalytics.applyLunevaLeadFilters(query);
  const result = await query;
  if (result.error && /brand|column|purchased|order_count|is_test/i.test(String(result.error.message || ''))) {
    const legacy = await supabase
      .from('newsletter_subscribers')
      .select('id,email,source,brand,discount_code,status,created_at,visitor_id,used_discount')
      .or('source.ilike.%luneva%,discount_code.eq.LUNEVA5,brand.eq.luneva')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (legacy.error) throw legacy.error;
    return (legacy.data || [])
      .filter(BrandAnalytics.isLunevaLead)
      .filter(function (row) {
        return String(row.status || 'active') !== 'unsubscribed' && !row.is_test;
      });
  }
  if (result.error) throw result.error;
  return (result.data || [])
    .filter(BrandAnalytics.isLunevaLead)
    .filter(function (row) {
      return !row.is_test;
    });
}

function filterByAudience(leads, audienceKey) {
  const meta = audienceMeta(audienceKey);
  if (!meta) return [];
  return (leads || []).filter(function (lead) {
    return meta.match(lead);
  });
}

function buildVars(lead, env) {
  env = env || process.env;
  return {
    customerName: null,
    discountCode: (lead && lead.discount_code) || EmailTemplates.LUNEVA_DISCOUNT_CODE,
    memberCredential: MemberPricing.issueCredential(
      lead,
      MemberPricing.TIERS.luneva.id,
      env
    ),
    storeName: EmailTemplates.LUNEVA_STORE_NAME,
    storeUrl: env.STORE_URL || EmailTemplates.DEFAULT_STORE_URL,
    unsubscribeUrl: Unsubscribe.buildUrl(lead && lead.email, env)
  };
}

async function resolveTemplateDefinition(supabase, templateKey) {
  const key = String(templateKey || '').trim();
  if (key.indexOf('luneva_') !== 0) return null;
  try {
    const db = await TemplateStore.getTemplateByKey(supabase, key);
    if (db) {
      return { key: db.template_key, name: db.name, description: db.description || '' };
    }
  } catch (_) {}
  return EmailTemplates.getTemplateDefinition(key);
}

async function getBootstrap(supabase) {
  const leads = await listActiveLunevaLeads(supabase);
  const audiences = AUDIENCES.map(function (a) {
    return {
      key: a.key,
      label: a.label,
      count: filterByAudience(leads, a.key).length
    };
  });
  return {
    audiences: audiences,
    total_leads: leads.length,
    templates: listLunevaTemplateCatalog()
  };
}

async function previewCampaign(supabase, options, env) {
  options = options || {};
  const audience = String(options.audience || '')
    .trim()
    .toLowerCase();
  const templateKey = String(options.template_key || '').trim();

  if (!isValidAudience(audience)) {
    return { status: 400, json: { success: false, error: 'Select a valid LUNEVA audience.' } };
  }
  const definition = await resolveTemplateDefinition(supabase, templateKey);
  if (!definition) {
    return { status: 400, json: { success: false, error: 'Select a LUNEVA email template.' } };
  }

  const leads = filterByAudience(await listActiveLunevaLeads(supabase), audience);
  const sample = leads[0] || null;
  let sampleLead = sample;
  if (sample && sample.id) {
    const full = await supabase
      .from('newsletter_subscribers')
      .select('*')
      .eq('id', sample.id)
      .maybeSingle();
    if (!full.error && full.data) sampleLead = full.data;
  }

  const vars = buildVars(
    sampleLead || { discount_code: EmailTemplates.LUNEVA_DISCOUNT_CODE },
    env
  );
  const rendered = await TemplateStore.renderTemplate(supabase, templateKey, vars);

  return {
    status: 200,
    json: {
      success: true,
      audience: audience,
      audience_label: (audienceMeta(audience) && audienceMeta(audience).label) || audience,
      recipient_count: leads.length,
      template: definition,
      preview: {
        subject: rendered.subject,
        html: rendered.html,
        sample_email: sample ? sample.email : null
      },
      subject: rendered.subject,
      html: rendered.html
    }
  };
}

async function sendCampaign(supabase, options, env) {
  options = options || {};
  env = env || process.env;
  const audience = String(options.audience || '')
    .trim()
    .toLowerCase();
  const templateKey = String(options.template_key || '').trim();

  if (!isValidAudience(audience)) {
    return { status: 400, json: { success: false, error: 'Select a valid LUNEVA audience.' } };
  }
  const definition = await resolveTemplateDefinition(supabase, templateKey);
  if (!definition) {
    return { status: 400, json: { success: false, error: 'Select a LUNEVA email template.' } };
  }

  const candidates = filterByAudience(await listActiveLunevaLeads(supabase), audience);
  const campaignLogId = crypto.randomUUID();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  for (const candidate of candidates) {
    if (!candidate || !candidate.id || !candidate.email) {
      skipped += 1;
      continue;
    }

    const leadRes = await supabase
      .from('newsletter_subscribers')
      .select('*')
      .eq('id', candidate.id)
      .maybeSingle();
    if (leadRes.error || !leadRes.data) {
      failed += 1;
      errors.push({
        email: candidate.email,
        error: (leadRes.error && leadRes.error.message) || 'Lead not found'
      });
      continue;
    }
    const lead = leadRes.data;
    if (!BrandAnalytics.isLunevaLead(lead)) {
      skipped += 1;
      continue;
    }
    if (String(lead.status || '') === 'unsubscribed') {
      skipped += 1;
      continue;
    }

    try {
      const vars = buildVars(lead, env);
      const rendered = await TemplateStore.renderTemplate(supabase, templateKey, vars);
      const sendResult = await Email.sendEmail({
        to: lead.email,
        subject: rendered.subject,
        html: rendered.html,
        headers: Unsubscribe.buildHeaders(lead.email, env),
        env: env
      });
      if (!sendResult.ok) {
        failed += 1;
        errors.push({ email: lead.email, error: sendResult.error || 'Send failed' });
        continue;
      }
      sent += 1;
    } catch (err) {
      failed += 1;
      errors.push({
        email: lead.email,
        error: (err && err.message) || 'Send failed'
      });
    }
  }

  const logStatus = failed && sent ? 'partial' : failed && !sent ? 'failed' : 'completed';
  const audienceKey = 'luneva_' + audience;
  try {
    await supabase.from('campaign_send_logs').insert({
      id: campaignLogId,
      audience: audienceKey,
      template_key: templateKey,
      sent_count: sent,
      skipped_count: skipped,
      failed_count: failed,
      status: logStatus,
      error_message: errors.length ? errors[0].error : null
    });
    await supabase.from('marketing_history').insert({
      event_type: 'campaign_send',
      source: 'luneva_campaign',
      message:
        'LUNEVA campaign to ' +
        audience +
        ' via ' +
        templateKey +
        ' — sent ' +
        sent +
        ', skipped ' +
        skipped +
        ', failed ' +
        failed,
      metadata: {
        brand: 'luneva',
        audience: audience,
        template_key: templateKey,
        sent: sent,
        skipped: skipped,
        failed: failed,
        campaign_log_id: campaignLogId
      }
    });
  } catch (logErr) {
    console.warn('luneva campaign log:', logErr && logErr.message ? logErr.message : logErr);
  }

  return {
    status: 200,
    json: {
      success: true,
      brand: 'luneva',
      audience: audience,
      template_key: templateKey,
      template_name: definition.name,
      matched: candidates.length,
      sent: sent,
      skipped: skipped,
      failed: failed,
      errors: errors.slice(0, 20)
    }
  };
}

module.exports = {
  AUDIENCES,
  getBootstrap,
  previewCampaign,
  sendCampaign
};
