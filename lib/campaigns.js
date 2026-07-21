/**
 * Campaign send service — status audiences only (Phase 1).
 * Always re-checks latest lead status from the database before sending.
 * Campaigns never modify Journey progress.
 */
const EmailTemplates = require('./email-templates.js');
const TemplateStore = require('./email-template-store.js');
const LeadStatus = require('./lead-status.js');
const JourneyEngine = require('./journey-engine.js');

function buildTemplateVariables(lead, snapshot, env) {
  env = env || process.env;
  const firstOrder = snapshot && snapshot.orders && snapshot.orders[0] ? snapshot.orders[0] : null;
  return {
    customerName: firstOrder && firstOrder.customer_name ? firstOrder.customer_name : null,
    discountCode: (lead && lead.discount_code) || EmailTemplates.DEFAULT_DISCOUNT_CODE,
    storeName: env.STORE_NAME || EmailTemplates.DEFAULT_STORE_NAME,
    storeUrl: env.STORE_URL || EmailTemplates.DEFAULT_STORE_URL
  };
}

async function getCampaignBootstrap(supabase, preferredAudience) {
  const audiences = await LeadStatus.getAudienceCounts(supabase);
  let templates = [];
  try {
    templates = await TemplateStore.listTemplates(supabase, { status: 'active' });
    templates = templates.map(function (t) {
      return {
        key: t.template_key,
        name: t.name,
        description: t.description || ''
      };
    });
  } catch (e) {
    templates = EmailTemplates.listTemplates();
  }
  let audience = String(preferredAudience || '')
    .trim()
    .toLowerCase();
  if (!LeadStatus.isValidLeadStatus(audience)) {
    audience = null;
  }
  return {
    audiences: audiences.audiences,
    total_leads: audiences.total,
    templates: templates,
    preferred_audience: audience
  };
}

async function resolveTemplateDefinition(supabase, templateKey) {
  const db = await TemplateStore.getTemplateByKey(supabase, templateKey);
  if (db) {
    return { key: db.template_key, name: db.name, description: db.description || '' };
  }
  return EmailTemplates.getTemplateDefinition(templateKey);
}

async function previewCampaign(supabase, options, env) {
  options = options || {};
  const audience = String(options.audience || '')
    .trim()
    .toLowerCase();
  const templateKey = String(options.template_key || '').trim();

  if (!LeadStatus.isValidLeadStatus(audience)) {
    return { status: 400, json: { success: false, error: 'Select a valid status audience.' } };
  }
  const definition = await resolveTemplateDefinition(supabase, templateKey);
  if (!definition) {
    return { status: 400, json: { success: false, error: 'Select a valid email template.' } };
  }

  const counts = await LeadStatus.getAudienceCounts(supabase);
  const audienceMeta = (counts.audiences || []).find(function (a) {
    return a.key === audience;
  });
  const recipientCount = (audienceMeta && audienceMeta.count) || 0;

  const sampleLeads = await LeadStatus.listLeadsByStatus(supabase, audience, { limit: 5000 });
  const sample = sampleLeads[0] || null;
  let sampleLeadRow = null;
  let snapshot = null;
  if (sample && sample.id) {
    const leadRes = await supabase
      .from('newsletter_subscribers')
      .select('*')
      .eq('id', sample.id)
      .maybeSingle();
    if (leadRes.error) throw leadRes.error;
    sampleLeadRow = leadRes.data;
    if (sampleLeadRow) {
      snapshot = await LeadStatus.getLeadJourneySnapshot(supabase, sampleLeadRow);
    }
  }

  const vars = buildTemplateVariables(
    sampleLeadRow || { discount_code: EmailTemplates.DEFAULT_DISCOUNT_CODE },
    snapshot || { orders: [] },
    env || process.env
  );
  const rendered = await TemplateStore.renderTemplate(supabase, templateKey, vars);

  return {
    status: 200,
    json: {
      success: true,
      audience: audience,
      audience_label: (audienceMeta && audienceMeta.label) || audience,
      recipient_count: recipientCount,
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

/**
 * Send campaign now to all leads whose *latest* status matches the audience.
 * Status is re-checked per recipient immediately before send.
 */
async function sendCampaign(supabase, options, env) {
  options = options || {};
  env = env || process.env;
  const audience = String(options.audience || '')
    .trim()
    .toLowerCase();
  const templateKey = String(options.template_key || '').trim();

  if (!LeadStatus.isValidLeadStatus(audience)) {
    return { status: 400, json: { success: false, error: 'Select a valid status audience.' } };
  }
  const definition = await resolveTemplateDefinition(supabase, templateKey);
  if (!definition) {
    return { status: 400, json: { success: false, error: 'Select a valid email template.' } };
  }

  const candidates = await LeadStatus.listLeadsByStatus(supabase, audience);
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
    if (leadRes.error) {
      failed += 1;
      errors.push({ email: candidate.email, error: leadRes.error.message });
      continue;
    }
    const lead = leadRes.data;
    if (!lead) {
      skipped += 1;
      continue;
    }

    let snapshot;
    try {
      snapshot = await LeadStatus.getLeadJourneySnapshot(supabase, lead);
    } catch (err) {
      failed += 1;
      errors.push({
        email: lead.email,
        error: (err && err.message) || 'Failed to load lead status'
      });
      continue;
    }

    if (!snapshot || snapshot.status !== audience) {
      skipped += 1;
      continue;
    }

    const queueResult = await supabase
      .from('action_queue')
      .insert({
        lead_id: lead.id,
        journey_id: null,
        step_id: null,
        lead_journey_id: null,
        action_type: 'email',
        template_id: templateKey,
        recipient: lead.email,
        scheduled_at: new Date().toISOString(),
        status: 'pending',
        source_type: 'campaign',
        source_reference: audience,
        step_name_snapshot: 'Campaign: ' + definition.name,
        updated_at: new Date().toISOString()
      })
      .select('*')
      .single();
    if (queueResult.error) {
      failed += 1;
      errors.push({
        email: lead.email,
        error: queueResult.error.message || 'Failed to create campaign queue action'
      });
      continue;
    }

    const result = await JourneyEngine.executeAction(supabase, queueResult.data, env);

    if (!result.ok) {
      if (result.status === 'cancelled') {
        skipped += 1;
        continue;
      }
      failed += 1;
      errors.push({ email: lead.email, error: result.error || 'Send failed' });
      continue;
    }
    sent += 1;
  }

  const logStatus = failed && sent ? 'partial' : failed && !sent ? 'failed' : 'completed';
  try {
    await supabase.from('campaign_send_logs').insert({
      audience: audience,
      template_key: templateKey,
      sent_count: sent,
      skipped_count: skipped,
      failed_count: failed,
      status: logStatus,
      error_message: errors.length ? errors[0].error : null
    });
    await supabase.from('marketing_history').insert({
      event_type: 'campaign_send',
      source: 'campaign',
      message:
        'Campaign to ' +
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
        audience: audience,
        template_key: templateKey,
        sent: sent,
        skipped: skipped,
        failed: failed
      }
    });
  } catch (logErr) {
    console.warn('campaign log:', logErr && logErr.message ? logErr.message : logErr);
  }

  return {
    status: 200,
    json: {
      success: true,
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
  getCampaignBootstrap,
  previewCampaign,
  sendCampaign
};
