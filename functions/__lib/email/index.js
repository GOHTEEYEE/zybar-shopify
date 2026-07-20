/**
 * ZYBAR Email Service (Cloudflare Pages Functions).
 * Business logic lives here — API routes only validate and call these helpers.
 */
import { sendEmail } from './resend.js';
import { getTestTemplate } from './templates.js';

/**
 * Send the ZYBAR test email.
 * @param {object} context Cloudflare Pages Function context
 * @param {string} to Recipient email
 */
export async function sendTestEmail(context, to) {
  const env = (context && context.env) || {};
  const template = getTestTemplate();

  return sendEmail({
    env: env,
    to: to,
    subject: template.subject,
    html: template.html
  });
}

export { sendEmail, getEmailConfig, DEFAULT_FROM, DEFAULT_REPLY_TO } from './resend.js';
export { getTestTemplate } from './templates.js';
