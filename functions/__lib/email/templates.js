/**
 * Email templates for the ZYBAR Email module.
 * Keep templates here so API routes stay thin.
 */

/**
 * Production-ready test email template.
 * @returns {{ subject: string, html: string }}
 */
export function getTestTemplate() {
  return {
    subject: 'ZYBAR Test Email',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ZYBAR Test Email</title>
</head>
<body style="margin:0;padding:0;background:#0b0b0b;font-family:Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0b0b;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:32px 28px 12px;text-align:center;">
              <div style="font-size:11px;letter-spacing:0.28em;color:rgba(255,255,255,0.45);text-transform:uppercase;">ZYBAR</div>
              <div style="margin-top:10px;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;color:#ffffff;">ZYBAR</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 32px;color:#ffffff;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hello!</p>
              <p style="margin:0;font-size:16px;line-height:1.6;color:rgba(255,255,255,0.78);">
                This email was successfully sent using Resend.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  };
}
