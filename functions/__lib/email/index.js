/**
 * ZYBAR Email Service
 *
 * Entry point for campaigns, automations, templates, analytics, and webhooks.
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
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL || 'ZYBAR <onboarding@resend.dev>';
  const template = getTestTemplate();

  return sendEmail({
    from: from,
    to: to,
    subject: template.subject,
    html: template.html,
    apiKey: apiKey
  });
}

export { sendEmail } from './resend.js';
export { getTestTemplate } from './templates.js';
