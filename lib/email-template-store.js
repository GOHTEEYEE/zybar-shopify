/**
 * DB-backed email templates with code-catalog fallback.
 * Journey steps store template_key in template_id.
 */
const CodeTemplates = require('./email-templates.js');

function nowIso() {
  return new Date().toISOString();
}

function slugifyKey(input) {
  return String(input || 'template')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

function applyVars(text, vars) {
  vars = vars || {};
  return String(text || '')
    .replace(/\{\{\s*discount_code\s*\}\}/gi, vars.discountCode || CodeTemplates.DEFAULT_DISCOUNT_CODE)
    .replace(/\{\{\s*store_name\s*\}\}/gi, vars.storeName || CodeTemplates.DEFAULT_STORE_NAME)
    .replace(/\{\{\s*store_url\s*\}\}/gi, vars.storeUrl || CodeTemplates.DEFAULT_STORE_URL)
    .replace(/\{\{\s*customer_name\s*\}\}/gi, vars.customerName || 'there');
}

function wrapSimpleHtml(inner, vars) {
  const storeUrl = vars.storeUrl || CodeTemplates.DEFAULT_STORE_URL;
  const storeName = vars.storeName || CodeTemplates.DEFAULT_STORE_NAME;
  const code = vars.discountCode || CodeTemplates.DEFAULT_DISCOUNT_CODE;
  return (
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0b0b0b;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0b0b;padding:32px 12px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#171717;border:1px solid rgba(255,255,255,0.08);border-radius:18px;overflow:hidden;">' +
    '<tr><td style="padding:36px 32px 20px;text-align:center;font-family:Georgia,serif;font-size:24px;color:#fff;">' +
    storeName +
    '</td></tr>' +
    '<tr><td style="padding:0 32px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.78);">' +
    inner +
    '</td></tr>' +
    '<tr><td align="center" style="padding:0 32px 28px;">' +
    '<div style="display:inline-block;padding:12px 20px;border:1px solid rgba(255,255,255,0.18);border-radius:12px;background:#111;color:#fff;font-family:Georgia,serif;letter-spacing:0.08em;">' +
    code +
    '</div></td></tr>' +
    '<tr><td align="center" style="padding:0 32px 36px;">' +
    '<a href="' +
    storeUrl +
    '/collections/all/" style="display:inline-block;background:#fff;color:#111;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;padding:14px 24px;border-radius:999px;">Shop Now</a>' +
    '</td></tr></table></td></tr></table></body></html>'
  );
}

async function listTemplates(supabase, options) {
  options = options || {};
  let query = supabase.from('email_templates').select('*').order('updated_at', { ascending: false });
  if (options.status) query = query.eq('status', options.status);
  else if (!options.include_archived) query = query.neq('status', 'archived');

  const result = await query;
  if (result.error) throw result.error;
  const rows = result.data || [];
  if (rows.length) return rows;

  // Fallback to code catalog if DB empty
  return CodeTemplates.listTemplates().map(function (t) {
    return {
      id: null,
      template_key: t.key,
      name: t.name,
      description: t.description,
      subject: t.name,
      html_body: '',
      status: 'active',
      source: 'code'
    };
  });
}

async function getTemplateByKey(supabase, templateKey) {
  const key = String(templateKey || '').trim();
  if (!key) return null;
  if (supabase) {
    const result = await supabase
      .from('email_templates')
      .select('*')
      .eq('template_key', key)
      .maybeSingle();
    if (result.error) throw result.error;
    if (result.data) return result.data;
  }
  const def = CodeTemplates.getTemplateDefinition(key);
  if (!def) return null;
  return {
    id: null,
    template_key: def.key,
    name: def.name,
    description: def.description,
    subject: def.name,
    html_body: '',
    status: 'active',
    source: 'code'
  };
}

async function getTemplateById(supabase, id) {
  const result = await supabase.from('email_templates').select('*').eq('id', id).maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

/**
 * Render by template_key: prefer DB html/subject with {{vars}};
 * fall back to rich code renderers when DB body is empty or code key exists.
 */
async function renderTemplate(supabase, templateKey, vars) {
  vars = vars || {};
  const dbRow = supabase ? await getTemplateByKey(supabase, templateKey) : null;

  // Prefer rich code templates when available and DB body is a simple seed stub
  try {
    if (CodeTemplates.getTemplateDefinition(templateKey)) {
      const codeRendered = CodeTemplates.renderTemplate(templateKey, vars);
      if (!dbRow || !dbRow.html_body || dbRow.source === 'code') {
        return codeRendered;
      }
      // If DB has custom html (edited), use DB
      if (
        (dbRow.html_body && dbRow.html_body.indexOf('{{') !== -1) ||
        (dbRow.updated_at && dbRow.created_at && dbRow.updated_at !== dbRow.created_at)
      ) {
        const subject = applyVars(dbRow.subject, vars);
        const body = applyVars(dbRow.html_body, vars);
        const html = /<!DOCTYPE|<html/i.test(body) ? body : wrapSimpleHtml(body, vars);
        return { subject: subject, html: html };
      }
      return codeRendered;
    }
  } catch (e) {
    // continue to DB render
  }

  if (!dbRow) throw new Error('Unknown email template: ' + templateKey);
  const subject = applyVars(dbRow.subject, vars);
  const body = applyVars(dbRow.html_body, vars);
  const html = /<!DOCTYPE|<html/i.test(body) ? body : wrapSimpleHtml(body, vars);
  return { subject: subject, html: html };
}

async function createTemplate(supabase, payload) {
  const now = nowIso();
  let key = slugifyKey(payload.template_key || payload.name);
  if (!key) key = 'template_' + Date.now().toString(36);

  const insert = await supabase
    .from('email_templates')
    .insert({
      template_key: key,
      name: String(payload.name || '').trim() || 'Untitled Template',
      description: payload.description ? String(payload.description).trim() : null,
      subject: String(payload.subject || '').trim() || 'ZYBAR',
      html_body: String(payload.html_body || '').trim() || '<p></p>',
      status: payload.status === 'archived' ? 'archived' : 'active',
      updated_at: now
    })
    .select('*')
    .single();
  if (insert.error) throw insert.error;
  return insert.data;
}

async function updateTemplate(supabase, id, payload) {
  const patch = { updated_at: nowIso() };
  if (payload.name != null) patch.name = String(payload.name).trim();
  if (payload.description !== undefined) {
    patch.description = payload.description ? String(payload.description).trim() : null;
  }
  if (payload.subject != null) patch.subject = String(payload.subject).trim();
  if (payload.html_body != null) patch.html_body = String(payload.html_body);
  if (payload.status != null) patch.status = payload.status === 'archived' ? 'archived' : 'active';

  const result = await supabase
    .from('email_templates')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function duplicateTemplate(supabase, id) {
  const source = await getTemplateById(supabase, id);
  if (!source) throw new Error('Template not found');
  return createTemplate(supabase, {
    template_key: source.template_key + '_copy_' + Date.now().toString(36),
    name: source.name + ' (Copy)',
    description: source.description,
    subject: source.subject,
    html_body: source.html_body,
    status: 'active'
  });
}

async function archiveTemplate(supabase, id) {
  return updateTemplate(supabase, id, { status: 'archived' });
}

async function previewTemplate(supabase, templateKeyOrId, env) {
  let key = templateKeyOrId;
  if (templateKeyOrId && String(templateKeyOrId).indexOf('-') !== -1) {
    const byId = await getTemplateById(supabase, templateKeyOrId);
    if (byId) key = byId.template_key;
  }
  const vars = {
    customerName: null,
    discountCode: CodeTemplates.DEFAULT_DISCOUNT_CODE,
    storeName: (env && env.STORE_NAME) || CodeTemplates.DEFAULT_STORE_NAME,
    storeUrl: (env && env.STORE_URL) || CodeTemplates.DEFAULT_STORE_URL
  };
  return renderTemplate(supabase, key, vars);
}

module.exports = {
  listTemplates,
  getTemplateByKey,
  getTemplateById,
  renderTemplate,
  createTemplate,
  updateTemplate,
  duplicateTemplate,
  archiveTemplate,
  previewTemplate,
  applyVars
};
