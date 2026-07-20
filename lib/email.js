/**
 * Simple admin test email via Resend.
 */
const { Resend } = require('resend');

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

/**
 * @param {{ to?: string, subject?: string, html?: string }} body
 * @param {NodeJS.ProcessEnv} env
 */
async function sendAdminEmail(body, env) {
  const apiKey = (env && env.RESEND_API_KEY) || '';
  const from =
    (env && env.RESEND_FROM_EMAIL) || 'ZYBAR <onboarding@resend.dev>';
  const to = String((body && body.to) || '')
    .trim()
    .toLowerCase();
  const subject = String((body && body.subject) || '').trim();
  const html = String((body && body.html) || '').trim();

  if (!apiKey) {
    return {
      status: 500,
      json: { success: false, error: 'RESEND_API_KEY is not configured' }
    };
  }
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

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject,
    html
  });

  if (error) {
    return {
      status: 500,
      json: {
        success: false,
        error: (error && (error.message || error.name)) || 'Failed to send email'
      }
    };
  }

  return { status: 200, json: { success: true } };
}

module.exports = { sendAdminEmail };
