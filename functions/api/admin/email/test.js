/**
 * POST /api/admin/email/test
 *
 * Accepts: { "to": "example@gmail.com" }
 * Returns: { "success": true }
 */
import { sendTestEmail } from '../../../__lib/email/index.js';

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ success: false, error: 'Invalid JSON body.' }, 400);
  }

  const to = String((body && body.to) || '')
    .trim()
    .toLowerCase();

  if (!isValidEmail(to)) {
    return json({ success: false, error: 'A valid "to" email is required.' }, 400);
  }

  try {
    await sendTestEmail(context, to);
    return json({ success: true });
  } catch (err) {
    return json(
      {
        success: false,
        error: (err && err.message) || 'Failed to send test email.'
      },
      500
    );
  }
}
