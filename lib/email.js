/**
 * Centralized ZYBAR email service (Resend).
 * All server-side emails should go through sendEmail() here.
 */
const { Resend } = require('resend');

const DEFAULT_FROM = 'ZYBAR <support@zybar.shop>';
const DEFAULT_REPLY_TO = 'zybar.info@gmail.com';

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

/**
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} [env]
 */
function getEmailConfig(env) {
  const e = env || process.env;
  return {
    apiKey: (e && e.RESEND_API_KEY) || '',
    from: (e && e.RESEND_FROM_EMAIL) || DEFAULT_FROM,
    replyTo: (e && e.RESEND_REPLY_TO) || DEFAULT_REPLY_TO
  };
}

/**
 * Send an email via Resend with shared From + Reply-To defaults.
 * @param {{ to: string|string[], subject: string, html: string, env?: NodeJS.ProcessEnv|Record<string, string|undefined> }} options
 */
async function sendEmail({ to, subject, html, env }) {
  const config = getEmailConfig(env);

  if (!config.apiKey) {
    return { ok: false, error: 'RESEND_API_KEY is not configured' };
  }
  if (!to) {
    return { ok: false, error: 'Missing email recipient' };
  }
  if (!String(subject || '').trim()) {
    return { ok: false, error: 'Missing email subject' };
  }
  if (!String(html || '').trim()) {
    return { ok: false, error: 'Missing email html body' };
  }

  const recipients = Array.isArray(to)
    ? to.map(function (addr) {
        return String(addr).trim();
      })
    : [String(to).trim()];

  const resend = new Resend(config.apiKey);
  const { data, error } = await resend.emails.send({
    from: config.from,
    replyTo: config.replyTo,
    to: recipients,
    subject: String(subject).trim(),
    html: String(html)
  });

  if (error) {
    return {
      ok: false,
      error: (error && (error.message || error.name)) || 'Failed to send email'
    };
  }

  return { ok: true, data: data };
}

/**
 * Admin test email API helper.
 * @param {{ to?: string, subject?: string, html?: string }} body
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} [env]
 */
async function sendAdminEmail(body, env) {
  const to = String((body && body.to) || '')
    .trim()
    .toLowerCase();
  const subject = String((body && body.subject) || '').trim();
  const html = String((body && body.html) || '').trim();

  if (!isValidEmail(to)) {
    return {
      status: 400,
      json: { success: false, error: 'A valid recipient email is required.' }
    };
  }
  if (!subject) {
    return { status: 400, json: { success: false, error: 'Subject is required.' } };
  }
  if (!html) {
    return {
      status: 400,
      json: { success: false, error: 'HTML message is required.' }
    };
  }

  const result = await sendEmail({ to, subject, html, env });
  if (!result.ok) {
    return {
      status: result.error === 'RESEND_API_KEY is not configured' ? 500 : 500,
      json: { success: false, error: result.error || 'Failed to send email' }
    };
  }

  return { status: 200, json: { success: true } };
}

module.exports = {
  DEFAULT_FROM,
  DEFAULT_REPLY_TO,
  getEmailConfig,
  sendEmail,
  sendAdminEmail
};
