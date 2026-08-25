/**
 * Outbound email. One place so every message keeps the dark-mode-safe rules:
 * inline styles, table-based button, light color-scheme pair, no pure
 * white/black, and the link repeated as plain selectable text.
 */

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<boolean> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Penciled.in <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function emailConfigured(): boolean {
  return !!process.env["RESEND_API_KEY"];
}

/** Shell used by every transactional message. */
export function emailShell(headline: string, body: string, cta?: { label: string; link: string }) {
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="center" bgcolor="#C4633F" style="background-color:#C4633F;border-radius:12px;">
    <a href="${cta.link}" style="display:inline-block;padding:16px 32px;font-family:-apple-system,BlinkMacSystemFont,Helvetica,sans-serif;font-size:16px;font-weight:600;color:#FFFDF9;text-decoration:none;border-radius:12px;">${cta.label}</a>
  </td></tr>
  </table>
  <p style="margin:16px 0 24px;font-size:13px;line-height:20px;color:#8A8079;">Or paste this into your browser:<br>${cta.link}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#FAF7F2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FAF7F2" style="background-color:#FAF7F2;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFDF9" style="max-width:480px;background-color:#FFFDF9;border-radius:16px;">
<tr><td style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;color:#2B2622;">
  <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#2B2622;">${headline}</p>
  <div style="margin:0 0 24px;font-size:15px;line-height:22px;color:#5C5349;">${body}</div>
  ${button}
  <p style="margin:0;font-size:13px;line-height:20px;color:#8A8079;">— Penciled.in</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** A time written in one person's own zone, e.g. "Thu Nov 13, 7:00 PM EST". */
export function formatInZone(iso: string, timezone: string | null): string {
  const zone = timezone || "UTC";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toUTCString();
  }
}
