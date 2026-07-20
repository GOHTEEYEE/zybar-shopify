/**
 * Resend transport for Cloudflare Pages Functions.
 * Mirrors lib/email.js defaults (From + Reply-To).
 */
import { Resend } from 'resend';

const DEFAULT_FROM = 'ZYBAR <support@zybar.shop>';
const DEFAULT_REPLY_TO = 'zybar.info@gmail.com';

function getEmailConfig(env) {
  env = env || {};
  return {
    apiKey: env.RESEND_API_KEY || '',
    from: env.RESEND_FROM_EMAIL || DEFAULT_FROM,
    replyTo: env.RESEND_REPLY_TO || DEFAULT_REPLY_TO
  };
}

/**
 * @param {{ env?: object, to: string|string[], subject: string, html: string }} options
 */
export async function sendEmail({ env, to, subject, html }) {
  const config = getEmailConfig(env);

  if (!config.apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  if (!to) {
    throw new Error('Missing email recipient');
  }
  if (!subject) {
    throw new Error('Missing email subject');
  }
  if (!html) {
    throw new Error('Missing email html body');
  }

  const resend = new Resend(config.apiKey);
  const recipients = Array.isArray(to) ? to : [String(to)];

  const { data, error } = await resend.emails.send({
    from: config.from,
    replyTo: config.replyTo,
    to: recipients,
    subject: String(subject),
    html: String(html)
  });

  if (error) {
    throw new Error(
      (error && (error.message || error.name)) || 'Failed to send email via Resend'
    );
  }

  return data;
}

export { DEFAULT_FROM, DEFAULT_REPLY_TO, getEmailConfig };
