/**
 * Persistent workflow automation engine.
 * Schedules executions, evaluates conditions from real data, and performs actions.
 */
const Email = require('./email.js');
const EmailTemplates = require('./email-templates.js');
const LeadStatus = require('./lead-status.js');

const EXECUTION_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed'
};

const WORKFLOW_CATALOG = [
  {
    workflow_key: 'welcome_email',
    name: 'Welcome Email',
    trigger_type: 'email_signup',
    delay_minutes: 5,
    condition_type: 'lead_status_equals',
    condition_config: { status: 'subscriber' },
    action_type: 'send_template_email',
    action_config: { template_key: 'welcome_email' }
  }
];

function nowIso() {
  return new Date().toISOString();
}

function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

async function logExecution(supabase, executionId, level, message, metadata) {
  if (!supabase || !executionId) return;
  try {
    await supabase.from('workflow_execution_logs').insert({
      execution_id: executionId,
      level: level || 'info',
      message: message,
      metadata: metadata || {}
    });
  } catch (e) {
    console.warn('workflow log insert:', e && e.message ? e.message : e);
  }
}

async function syncWorkflowDefinitions(supabase) {
  if (!supabase) return [];
  const payload = WORKFLOW_CATALOG.map(function (wf) {
    return {
      workflow_key: wf.workflow_key,
      name: wf.name,
      trigger_type: wf.trigger_type,
      delay_minutes: wf.delay_minutes,
      condition_type: wf.condition_type,
      condition_config: wf.condition_config,
      action_type: wf.action_type,
      action_config: wf.action_config,
      updated_at: nowIso()
    };
  });
  const result = await supabase
    .from('workflow_definitions')
    .upsert(payload, { onConflict: 'workflow_key' })
    .select('*')
    .order('name', { ascending: true });
  if (result.error) throw result.error;
  return result.data || [];
}

async function getWorkflowDefinitions(supabase) {
  await syncWorkflowDefinitions(supabase);
  const result = await supabase
    .from('workflow_definitions')
    .select('*')
    .order('name', { ascending: true });
  if (result.error) throw result.error;
  return result.data || [];
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

async function getLeadJourneySnapshot(supabase, lead) {
  return LeadStatus.getLeadJourneySnapshot(supabase, lead);
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

async function scheduleLeadSignupWorkflows(supabase, lead) {
  if (!supabase || !lead || !lead.id) return [];
  const workflows = await getWorkflowDefinitions(supabase);
  const eligible = workflows.filter(function (wf) {
    return wf.enabled && wf.trigger_type === 'email_signup';
  });
  const scheduled = [];

  for (const workflow of eligible) {
    const scheduledAt = addMinutes(lead.created_at || nowIso(), workflow.delay_minutes || 0);
    const insert = await supabase
      .from('workflow_executions')
      .insert({
        workflow_id: workflow.id,
        lead_id: lead.id,
        visitor_id: lead.visitor_id || null,
        lead_email: lead.email || null,
        status: EXECUTION_STATUS.PENDING,
        scheduled_at: scheduledAt,
        payload: {
          trigger: 'email_signup',
          lead_email: lead.email || null,
          lead_source: lead.source || null,
          template_key: workflow.action_config && workflow.action_config.template_key
        }
      })
      .select('*')
      .single();

    if (insert.error) {
      if (String(insert.error.code) === '23505') continue;
      throw insert.error;
    }

    await logExecution(supabase, insert.data.id, 'info', 'Lead signed up', {
      lead_id: lead.id,
      email: lead.email || null
    });
    await logExecution(supabase, insert.data.id, 'info', 'Workflow scheduled', {
      workflow_key: workflow.workflow_key,
      scheduled_at: scheduledAt
    });
    scheduled.push(insert.data);
  }

  return scheduled;
}

function isRetryableError(message) {
  const msg = String(message || '').toLowerCase();
  if (!msg) return true;
  if (
    msg.indexOf('not configured') !== -1 ||
    msg.indexOf('missing email') !== -1 ||
    msg.indexOf('unknown email template') !== -1 ||
    msg.indexOf('condition mismatch') !== -1 ||
    msg.indexOf('workflow is disabled') !== -1 ||
    msg.indexOf('lead not found') !== -1
  ) {
    return false;
  }
  return true;
}

function retryDelayMinutes(attemptCount) {
  if (attemptCount <= 1) return 5;
  if (attemptCount === 2) return 15;
  return 60;
}

async function markExecutionCancelled(supabase, execution, reason, metadata) {
  await supabase
    .from('workflow_executions')
    .update({
      status: EXECUTION_STATUS.CANCELLED,
      cancelled_at: nowIso(),
      error: reason,
      updated_at: nowIso()
    })
    .eq('id', execution.id);
  await logExecution(supabase, execution.id, 'info', reason, metadata || {});
}

async function markExecutionCompleted(supabase, execution, metadata) {
  await supabase
    .from('workflow_executions')
    .update({
      status: EXECUTION_STATUS.COMPLETED,
      completed_at: nowIso(),
      error: null,
      updated_at: nowIso()
    })
    .eq('id', execution.id);
  await logExecution(supabase, execution.id, 'info', 'Welcome email sent', metadata || {});
}

async function markExecutionFailed(supabase, execution, message) {
  const nextAttempt = (execution.attempt_count || 0) + 1;
  const retryable = isRetryableError(message) && nextAttempt < (execution.max_attempts || 3);
  const patch = {
    status: EXECUTION_STATUS.FAILED,
    failed_at: nowIso(),
    error: message,
    attempt_count: nextAttempt,
    next_retry_at: retryable ? addMinutes(nowIso(), retryDelayMinutes(nextAttempt)) : null,
    updated_at: nowIso()
  };
  await supabase.from('workflow_executions').update(patch).eq('id', execution.id);
  await logExecution(supabase, execution.id, retryable ? 'warn' : 'error', retryable ? 'Execution failed, retry scheduled' : 'Execution failed', {
    error: message,
    attempt_count: nextAttempt,
    retry_scheduled_for: patch.next_retry_at
  });
}

async function executeOneWorkflow(supabase, execution, env) {
  const workflow = execution.workflow_definitions;
  if (!workflow || !workflow.enabled) {
    await markExecutionCancelled(supabase, execution, 'Workflow is disabled');
    return { id: execution.id, status: EXECUTION_STATUS.CANCELLED };
  }

  await logExecution(supabase, execution.id, 'info', 'Executing workflow', {
    workflow_key: workflow.workflow_key
  });

  const lead = await getLeadById(supabase, execution.lead_id);
  if (!lead) {
    await markExecutionCancelled(supabase, execution, 'Lead not found');
    return { id: execution.id, status: EXECUTION_STATUS.CANCELLED };
  }

  const snapshot = await getLeadJourneySnapshot(supabase, lead);
  if (!snapshot || snapshot.status !== 'subscriber') {
    await markExecutionCancelled(supabase, execution, 'Condition mismatch: status is not Subscriber', {
      current_status: snapshot ? snapshot.status : null
    });
    return { id: execution.id, status: EXECUTION_STATUS.CANCELLED };
  }

  const action = workflow.action_config || {};
  const templateKey = action.template_key;
  const rendered = EmailTemplates.renderTemplate(templateKey, buildTemplateVariables(lead, snapshot, env || process.env));
  const sendResult = await Email.sendEmail({
    to: lead.email,
    subject: rendered.subject,
    html: rendered.html,
    env: env || process.env
  });

  if (!sendResult.ok) {
    await markExecutionFailed(supabase, execution, sendResult.error || 'Failed to send email');
    return { id: execution.id, status: EXECUTION_STATUS.FAILED, error: sendResult.error || 'Failed to send email' };
  }

  await markExecutionCompleted(supabase, execution, {
    template_key: templateKey,
    lead_id: lead.id,
    email: lead.email
  });
  return { id: execution.id, status: EXECUTION_STATUS.COMPLETED };
}

async function runDueWorkflowExecutions(supabase, env, limit) {
  await syncWorkflowDefinitions(supabase);
  const claim = await supabase.rpc('claim_due_workflow_executions', {
    p_limit: Math.max(1, Math.min(50, Number(limit) || 10))
  });
  if (claim.error) throw claim.error;

  const rows = claim.data || [];
  if (!rows.length) {
    return { claimed: 0, completed: 0, cancelled: 0, failed: 0, executions: [] };
  }

  const workflowIds = rows.map(function (row) {
    return row.workflow_id;
  });
  const defsRes = await supabase.from('workflow_definitions').select('*').in('id', workflowIds);
  if (defsRes.error) throw defsRes.error;
  const defsById = {};
  (defsRes.data || []).forEach(function (wf) {
    defsById[wf.id] = wf;
  });

  let completed = 0;
  let cancelled = 0;
  let failed = 0;
  const executions = [];

  for (const row of rows) {
    const result = await executeOneWorkflow(
      supabase,
      Object.assign({}, row, { workflow_definitions: defsById[row.workflow_id] || null }),
      env || process.env
    );
    executions.push(result);
    if (result.status === EXECUTION_STATUS.COMPLETED) completed += 1;
    else if (result.status === EXECUTION_STATUS.CANCELLED) cancelled += 1;
    else if (result.status === EXECUTION_STATUS.FAILED) failed += 1;
  }

  return {
    claimed: rows.length,
    completed: completed,
    cancelled: cancelled,
    failed: failed,
    executions: executions
  };
}

async function listWorkflowAdminData(supabase) {
  await syncWorkflowDefinitions(supabase);
  const [workflowRes, execRes, logRes] = await Promise.all([
    supabase.from('workflow_definitions').select('*').order('name', { ascending: true }),
    supabase
      .from('workflow_executions')
      .select('*, workflow_definitions(name,workflow_key)')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('workflow_execution_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300)
  ]);
  if (workflowRes.error) throw workflowRes.error;
  if (execRes.error) throw execRes.error;
  if (logRes.error) throw logRes.error;

  const logsByExecution = {};
  (logRes.data || []).forEach(function (log) {
    if (!logsByExecution[log.execution_id]) logsByExecution[log.execution_id] = [];
    logsByExecution[log.execution_id].push(log);
  });

  const workflowStats = {};
  (execRes.data || []).forEach(function (execution) {
    const workflowId = execution.workflow_id;
    if (!workflowStats[workflowId]) {
      workflowStats[workflowId] = {
        pending: 0,
        running: 0,
        completed: 0,
        cancelled: 0,
        failed: 0
      };
    }
    if (workflowStats[workflowId][execution.status] != null) {
      workflowStats[workflowId][execution.status] += 1;
    }
  });

  return {
    workflows: (workflowRes.data || []).map(function (workflow) {
      return Object.assign({}, workflow, {
        stats: workflowStats[workflow.id] || {
          pending: 0,
          running: 0,
          completed: 0,
          cancelled: 0,
          failed: 0
        }
      });
    }),
    executions: (execRes.data || []).map(function (execution) {
      return Object.assign({}, execution, {
        logs: logsByExecution[execution.id] || []
      });
    })
  };
}

async function updateWorkflowEnabled(supabase, workflowKey, enabled) {
  await syncWorkflowDefinitions(supabase);
  const result = await supabase
    .from('workflow_definitions')
    .update({ enabled: !!enabled, updated_at: nowIso() })
    .eq('workflow_key', workflowKey)
    .select('*')
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

module.exports = {
  EXECUTION_STATUS,
  WORKFLOW_CATALOG,
  getLeadJourneySnapshot,
  getWorkflowDefinitions,
  listWorkflowAdminData,
  runDueWorkflowExecutions,
  scheduleLeadSignupWorkflows,
  syncWorkflowDefinitions,
  updateWorkflowEnabled
};
