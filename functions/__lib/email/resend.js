/**
 * Resend transport for Cloudflare Pages Functions.
 * API key must come from context.env.RESEND_API_KEY.
 */
import { Resend } from 'resend';

/**
 * @param {{ from?: string, to: string|string[], subject: string, html: string, apiKey: string }} options
 */
export async function sendEmail({ from, to, subject, html, apiKey }) {
  if (!apiKey) {
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

  const resend = new Resend(apiKey);
  const recipients = Array.isArray(to) ? to : [String(to)];

  const { data, error } = await resend.emails.send({
    from: from || 'ZYBAR <onboarding@resend.dev>',
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
