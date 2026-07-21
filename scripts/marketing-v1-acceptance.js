/**
 * Live Marketing Automation V1 acceptance suite.
 *
 * Requires a local server started with ZYBAR_MY=1 and production-compatible
 * Supabase/Resend environment variables. It only sends to Resend's official
 * @resend.dev test recipients.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config();
if (fs.existsSync(path.join(__dirname, '..', '.env.local'))) {
  require('dotenv').config({
    path: path.join(__dirname, '..', '.env.local'),
    override: true
  });
}
const { createClient } = require('@supabase/supabase-js');

const baseUrl = process.env.ACCEPTANCE_BASE_URL || 'http://localhost:3004';
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
const runId = Date.now().toString(36);
const workflowEmail = `delivered+v1-workflow-${runId}@resend.dev`;
const campaignEmail = `delivered+v1-campaign-${runId}@resend.dev`;
const excludedEmail = `delivered+v1-excluded-${runId}@resend.dev`;
const retryEmail = `delivered+v1-retry-${runId}@resend.dev`;
const evidence = [];
let token = '';
let welcomeJourney = null;
let cartJourney = null;
let retryJourney = null;
let campaignLead = null;
let acceptanceTemplate = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(test, detail) {
  evidence.push({ test, status: 'PASS', evidence: detail });
}

async function api(pathname, options) {
  options = options || {};
  const headers = Object.assign({}, options.headers || {});
  if (token) headers.authorization = 'Bearer ' + token;
  const response = await fetch(baseUrl + pathname, Object.assign({}, options, { headers }));
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    body = { raw: text };
  }
  return { status: response.status, ok: response.ok, body };
}

async function dbOne(table, select, filters) {
  let query = supabase.from(table).select(select || '*');
  Object.keys(filters || {}).forEach(function (key) {
    query = query.eq(key, filters[key]);
  });
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function archiveJourney(journey) {
  if (!journey || !journey.id || !token) return;
  await api('/api/admin/journeys/' + encodeURIComponent(journey.id), { method: 'DELETE' });
}

async function archiveTemplate(template) {
  if (!template || !template.id || !token) return;
  await api('/api/admin/journey-templates/' + encodeURIComponent(template.id) + '/archive', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });
}

async function main() {
  assert(process.env.SUPABASE_URL, 'SUPABASE_URL is required');
  assert(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY is required');
  assert(process.env.RESEND_API_KEY, 'RESEND_API_KEY is required for live email tests');
  [workflowEmail, campaignEmail, excludedEmail, retryEmail].forEach(function (email) {
    assert(email.endsWith('@resend.dev'), 'Acceptance email must use Resend test domain');
  });

  const anonymous = await api('/api/admin/journeys');
  assert(anonymous.status === 401, 'Anonymous admin request did not return 401');

  const session = await api('/api/admin/auth/test-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });
  assert(session.ok && session.body.token, 'Could not obtain signed test admin session');
  token = session.body.token;
  pass('TEST 6 — Authentication', 'GET /api/admin/journeys returned 401 without a session; signed session returned 200.');

  const templateCreate = await api('/api/admin/journey-templates', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      template_key: 'v1_acceptance_' + runId,
      name: 'V1 Acceptance Template ' + runId,
      description: 'Live acceptance template',
      subject: 'V1 acceptance for {{customer_name}}',
      html_body:
        '<p data-v1-acceptance="' +
        runId +
        '">Hello {{customer_name}}. Code: {{discount_code}}</p>',
      status: 'active'
    })
  });
  assert(templateCreate.status === 201, 'Template creation failed');
  const template = templateCreate.body.template;
  acceptanceTemplate = template;
  const templateEdit = await api('/api/admin/journey-templates/' + template.id, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: 'Live acceptance template edited' })
  });
  assert(templateEdit.ok, 'Template edit failed');
  const templatePreview = await api('/api/admin/journey-templates/' + template.id + '/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });
  assert(templatePreview.ok, 'Template preview failed');
  assert(templatePreview.body.preview.subject.includes('there'), 'Template subject variables did not render');
  assert(templatePreview.body.preview.html.includes('ZYBAR15'), 'Template HTML variables did not render');
  assert(templatePreview.body.preview.html.includes(runId), 'Rendered HTML did not use the saved template');
  pass('TEST 2 — Create Email Template', 'Template created, edited, and preview-rendered with customer and discount variables.');

  const welcomeCreate = await api('/api/admin/journeys', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'V1 Acceptance Welcome ' + runId,
      description: 'Acceptance journey',
      trigger_type: 'manual',
      status: 'draft',
      steps: [
        {
          step_order: 1,
          step_name: 'Acceptance immediate email',
          delay_value: 0,
          delay_unit: 'minutes',
          action_type: 'email',
          template_id: template.template_key
        },
        {
          step_order: 2,
          step_name: 'Acceptance pending email',
          delay_value: 1,
          delay_unit: 'days',
          action_type: 'email',
          template_id: template.template_key
        }
      ]
    })
  });
  assert(welcomeCreate.status === 201, 'Journey creation failed');
  welcomeJourney = welcomeCreate.body.journey;
  const welcomeEdit = await api('/api/admin/journeys/' + welcomeJourney.id, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'V1 Acceptance Welcome Edited ' + runId,
      description: 'Acceptance journey edited'
    })
  });
  assert(welcomeEdit.ok, 'Journey edit failed');
  const welcomeRead = await api('/api/admin/journeys/' + welcomeJourney.id);
  assert(welcomeRead.ok, 'Journey read-back failed');
  assert(welcomeRead.body.journey.name.includes('Edited'), 'Edited journey name was not saved');
  assert(welcomeRead.body.journey.steps.length === 2, 'Journey steps were not preserved');
  welcomeJourney = welcomeRead.body.journey;
  pass('TEST 1 — Create Journey', 'Draft journey saved, edited, read back, and retained both ordered steps.');

  const workflowRun = await api('/api/admin/journeys/' + welcomeJourney.id + '/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ emails: [workflowEmail] })
  });
  assert(workflowRun.ok && workflowRun.body.ok, 'Test Workflow execution failed');
  assert(workflowRun.body.results[0].status === 'executed', 'Immediate action was not executed by the Queue Worker');
  const workflowLead = await dbOne('newsletter_subscribers', '*', { email: workflowEmail });
  assert(workflowLead && workflowLead.is_test === true, 'Test Workflow lead was not created with is_test=true');
  const workflowInstances = await supabase
    .from('lead_journeys')
    .select('*')
    .eq('lead_id', workflowLead.id)
    .eq('journey_id', welcomeJourney.id)
    .order('created_at', { ascending: false });
  if (workflowInstances.error) throw workflowInstances.error;
  const welcomeInstance = workflowInstances.data[0];
  assert(welcomeInstance && welcomeInstance.current_step === 2, 'Journey did not advance to Step 2');
  const welcomeQueue = await supabase
    .from('action_queue')
    .select('*')
    .eq('lead_journey_id', welcomeInstance.id)
    .order('created_at');
  if (welcomeQueue.error) throw welcomeQueue.error;
  assert(welcomeQueue.data.some((row) => row.status === 'completed'), 'No completed queue email found');
  assert(welcomeQueue.data.some((row) => row.status === 'pending'), 'No next pending queue email found');
  const workflowHistory = await supabase
    .from('marketing_history')
    .select('*')
    .eq('lead_email', workflowEmail);
  if (workflowHistory.error) throw workflowHistory.error;
  assert(
    workflowHistory.data.some((row) => row.event_type === 'journey_transition'),
    'Journey transition history was not recorded'
  );
  assert(
    workflowHistory.data.some((row) => row.event_type === 'queue_executed'),
    'Email execution history was not recorded'
  );
  pass(
    'TEST 3 — Test Workflow',
    'Test lead created, Step 1 queued and accepted by Resend through the Queue Worker, Step 2 queued, and history recorded.'
  );

  const cartCreate = await api('/api/admin/journeys', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'V1 Acceptance Cart ' + runId,
      description: 'Acceptance transition target',
      trigger_type: 'acceptance_cart_' + runId,
      status: 'published',
      steps: [
        {
          step_order: 1,
          step_name: 'Acceptance cart delay',
          delay_value: 1,
          delay_unit: 'days',
          action_type: 'email',
          template_id: template.template_key
        }
      ]
    })
  });
  assert(cartCreate.status === 201, 'Cart journey creation failed');
  cartJourney = cartCreate.body.journey;
  const transition = await api('/api/admin/journey-transition', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      lead_id: workflowLead.id,
      trigger_type: cartJourney.trigger_type
    })
  });
  assert(transition.ok && transition.body.transitioned, 'Welcome-to-Cart transition failed');
  const previousAfterMove = await dbOne('lead_journeys', '*', { id: welcomeInstance.id });
  assert(previousAfterMove.status === 'completed', 'Previous Welcome journey was not completed');
  const oldPending = await supabase
    .from('action_queue')
    .select('id,status')
    .eq('lead_journey_id', welcomeInstance.id)
    .eq('status', 'pending');
  if (oldPending.error) throw oldPending.error;
  assert(oldPending.data.length === 0, 'Previous journey still has pending queue actions');
  const cancelledOld = await supabase
    .from('action_queue')
    .select('id')
    .eq('lead_journey_id', welcomeInstance.id)
    .eq('status', 'cancelled');
  if (cancelledOld.error) throw cancelledOld.error;
  assert(cancelledOld.data.length === 1, 'Previous pending queue action was not cancelled');
  const activeAfterMove = await dbOne('newsletter_subscribers', '*', { id: workflowLead.id });
  assert(activeAfterMove.current_journey_id === cartJourney.id, 'Cart journey did not become current');
  const cartQueue = await supabase
    .from('action_queue')
    .select('*')
    .eq('lead_journey_id', activeAfterMove.current_journey_instance_id)
    .eq('status', 'pending');
  if (cartQueue.error) throw cartQueue.error;
  assert(cartQueue.data.length === 1, 'Cart journey queue was not generated');
  pass('TEST 4 — Move Journey', 'Welcome completed, its pending action cancelled, Cart started, and a new pending action was generated.');

  const campaignVisitor = 'v1-campaign-' + runId;
  const excludedVisitor = 'v1-excluded-' + runId;
  const campaignLeadInsert = await supabase
    .from('newsletter_subscribers')
    .insert({
      email: campaignEmail,
      source: 'v1_acceptance',
      status: 'active',
      is_test: false,
      visitor_id: campaignVisitor
    })
    .select('*')
    .single();
  if (campaignLeadInsert.error) throw campaignLeadInsert.error;
  campaignLead = campaignLeadInsert.data;
  const excludedLeadInsert = await supabase
    .from('newsletter_subscribers')
    .insert({
      email: excludedEmail,
      source: 'v1_acceptance',
      status: 'active',
      is_test: true,
      visitor_id: excludedVisitor
    })
    .select('*')
    .single();
  if (excludedLeadInsert.error) throw excludedLeadInsert.error;
  const excludedLead = excludedLeadInsert.data;
  const cartsInsert = await supabase.from('cart_sessions').insert([
    {
      visitor_id: campaignVisitor,
      status: 'active',
      item_count: 1,
      cart_value_cents: 1000,
      currency: 'USD'
    },
    {
      visitor_id: excludedVisitor,
      status: 'active',
      item_count: 1,
      cart_value_cents: 1000,
      currency: 'USD'
    }
  ]);
  if (cartsInsert.error) throw cartsInsert.error;

  const campaignBootstrap = await api('/api/admin/campaigns?audience=cart');
  const cartAudience = campaignBootstrap.body.audiences.find((item) => item.key === 'cart');
  assert(cartAudience && cartAudience.count === 1, 'Controlled cart audience did not exclude the test lead');
  const campaignPreview = await api('/api/admin/campaigns/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ audience: 'cart', template_key: template.template_key })
  });
  assert(campaignPreview.ok && campaignPreview.body.recipient_count === 1, 'Campaign preview did not resolve one recipient');
  const campaignSend = await api('/api/admin/campaigns/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ audience: 'cart', template_key: template.template_key })
  });
  assert(campaignSend.ok, 'Campaign send request failed');
  assert(campaignSend.body.matched === 1, 'Campaign matched an unexpected number of leads');
  assert(campaignSend.body.sent === 1 && campaignSend.body.failed === 0, 'Campaign Queue Worker did not send successfully');
  const campaignAction = await supabase
    .from('action_queue')
    .select('*')
    .eq('lead_id', campaignLead.id)
    .eq('source_type', 'campaign')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (campaignAction.error) throw campaignAction.error;
  assert(campaignAction.data && campaignAction.data.status === 'completed', 'Campaign queue action was not completed');
  const excludedCampaignAction = await supabase
    .from('action_queue')
    .select('id')
    .eq('lead_id', excludedLead.id)
    .eq('source_type', 'campaign');
  if (excludedCampaignAction.error) throw excludedCampaignAction.error;
  assert(excludedCampaignAction.data.length === 0, 'Test lead received a production campaign queue action');
  const campaignLog = await supabase
    .from('campaign_send_logs')
    .select('*')
    .eq('audience', 'cart')
    .eq('template_key', template.template_key)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (campaignLog.error) throw campaignLog.error;
  assert(campaignLog.data && campaignLog.data.sent_count === 1, 'Campaign history log was not recorded');
  pass('TEST 5 — Campaign', 'One controlled production lead queued and sent; campaign log and completed queue action recorded.');

  const emailLeads = await api('/api/admin/email-leads?limit=500');
  assert(emailLeads.ok, 'Production Email Leads endpoint failed');
  const productionEmails = (emailLeads.body.leads || []).map((lead) => String(lead.email).toLowerCase());
  assert(!productionEmails.includes(workflowEmail), 'Test Workflow lead appeared in production Email Leads');
  assert(!productionEmails.includes(excludedEmail), 'Explicit test lead appeared in production Email Leads');
  pass('TEST 8 — Test Lead', 'is_test leads were excluded from campaign audience, queue creation, and production Email Leads analytics.');

  const retryCreate = await api('/api/admin/journeys', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'V1 Acceptance Retry ' + runId,
      description: 'Acceptance retry journey',
      trigger_type: 'manual',
      status: 'draft',
      steps: [
        {
          step_order: 1,
          step_name: 'Intentional first failure',
          delay_value: 0,
          delay_unit: 'minutes',
          action_type: 'email',
          template_id: 'missing_acceptance_template_' + runId
        }
      ]
    })
  });
  assert(retryCreate.status === 201, 'Retry journey creation failed');
  retryJourney = retryCreate.body.journey;
  const retryFirstRun = await api('/api/admin/journeys/' + retryJourney.id + '/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ emails: [retryEmail] })
  });
  assert(retryFirstRun.ok && retryFirstRun.body.failed === 1, 'Intentional queue failure was not recorded');
  const failedActionId = retryFirstRun.body.results[0].action_id;
  const failedAction = await dbOne('action_queue', '*', { id: failedActionId });
  assert(failedAction.status === 'failed', 'Queue action did not enter Failed status');
  const repair = await supabase
    .from('action_queue')
    .update({ template_id: template.template_key })
    .eq('id', failedActionId);
  if (repair.error) throw repair.error;
  const retryResult = await api('/api/admin/journey-queue/' + failedActionId + '/retry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });
  assert(retryResult.ok && retryResult.body.ok, 'Queue retry request failed');
  const completedRetry = await dbOne('action_queue', '*', { id: failedActionId });
  assert(completedRetry.status === 'completed', 'Retried queue action did not complete');
  const retryHistory = await supabase
    .from('marketing_history')
    .select('event_type')
    .eq('reference_id', failedActionId);
  if (retryHistory.error) throw retryHistory.error;
  assert(retryHistory.data.some((row) => row.event_type === 'queue_failed'), 'Failed attempt history missing');
  assert(retryHistory.data.some((row) => row.event_type === 'queue_executed'), 'Successful retry history missing');
  pass('TEST 9 — Queue Retry', 'Intentional template failure entered Failed; repaired action retried through worker and completed.');

  const archive = await api('/api/admin/journeys/' + welcomeJourney.id, { method: 'DELETE' });
  assert(archive.ok && archive.body.journey.status === 'archived', 'Journey archive request failed');
  const archivedJourney = await dbOne('journeys', '*', { id: welcomeJourney.id });
  assert(archivedJourney && archivedJourney.status === 'archived', 'Archived journey row no longer exists');
  const archivedInstances = await supabase
    .from('lead_journeys')
    .select('id')
    .eq('journey_id', welcomeJourney.id);
  if (archivedInstances.error) throw archivedInstances.error;
  assert(archivedInstances.data.length > 0, 'Journey history was cascade-deleted');
  pass('TEST 7 — Archive Journey', 'Journey status changed to Archived while definition and lead journey history remained.');
  welcomeJourney = null;

  const regressionChecks = await Promise.all([
    api('/api/admin/journeys'),
    api('/api/admin/campaigns'),
    api('/api/admin/journey-queue?status=completed'),
    api('/api/admin/journey-history?limit=25'),
    api('/api/analytics/dashboard?range=30d')
  ]);
  assert(regressionChecks.every((result) => result.ok), 'One or more regression endpoints failed');
  pass(
    'TEST 10 — Regression',
    'Journey, Campaign, Queue, History, and Analytics APIs returned 200 after live worker executions.'
  );

  await supabase.from('newsletter_subscribers').update({ is_test: true }).eq('id', campaignLead.id);
  campaignLead = null;
  await archiveJourney(cartJourney);
  cartJourney = null;
  await archiveJourney(retryJourney);
  retryJourney = null;
  await archiveTemplate(acceptanceTemplate);
  acceptanceTemplate = null;

  console.log(JSON.stringify({ run_id: runId, result: 'PASS', tests: evidence }, null, 2));
}

main()
  .catch(async function (error) {
    evidence.push({
      test: 'SUITE',
      status: 'FAIL',
      evidence: error && error.message ? error.message : String(error)
    });
    try {
      if (campaignLead) {
        await supabase.from('newsletter_subscribers').update({ is_test: true }).eq('id', campaignLead.id);
      }
      await archiveJourney(welcomeJourney);
      await archiveJourney(cartJourney);
      await archiveJourney(retryJourney);
      await archiveTemplate(acceptanceTemplate);
    } catch (_) {}
    console.error(JSON.stringify({ run_id: runId, result: 'FAIL', tests: evidence }, null, 2));
    process.exitCode = 1;
  });
