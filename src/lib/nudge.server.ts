/**
 * Nudges. Email goes out through Resend when it's configured; when it isn't,
 * we still return a chat-ready message so the organizer can paste it manually.
 */

export interface NudgeResult {
  projectName: string;
  slug: string;
  waiting: string[];
  message: string;
  emailed: number;
  emailConfigured: boolean;
}

export function listNames(names: string[]): string {
  if (names.length === 0) return "everyone";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function nudgeMessage(projectName: string, waiting: string[], link: string) {
  return `Still waiting on ${listNames(waiting)} for ${projectName} — takes 30 seconds, no signup: ${link}`;
}

/**
 * Dark-mode-safe nudge email. Inline styles only, table-based bulletproof
 * button, light color-scheme meta pair, no pure white/black, and the link
 * repeated as plain selectable text. See email-templates/auth/README.md.
 */
function nudgeHtml(name: string, projectName: string, link: string): string {
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
  <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#2B2622;">Hi ${name}, we still need your times</p>
  <p style="margin:0 0 24px;font-size:15px;line-height:22px;color:#5C5349;">${projectName} is waiting on you. It takes about 30 seconds and there's no signup.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" bgcolor="#C4633F" style="background-color:#C4633F;border-radius:12px;">
      <a href="${link}" style="display:inline-block;padding:16px 32px;font-family:-apple-system,BlinkMacSystemFont,Helvetica,sans-serif;font-size:16px;font-weight:600;color:#FFFDF9;text-decoration:none;border-radius:12px;">Give my times</a>
    </td>
  </tr>
  </table>
  <p style="margin:16px 0 24px;font-size:13px;line-height:20px;color:#8A8079;">Or paste this into your browser:<br>${link}</p>
  <p style="margin:0;font-size:13px;line-height:20px;color:#8A8079;">— Penciled.in</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

async function sendResend(
  apiKey: string,
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Penciled.in <onboarding@resend.dev>",
        to: [to],
        subject,
        // multipart: real text/plain alternative alongside the HTML part
        text,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}


/**
 * Builds (and optionally emails) a nudge for everyone who hasn't answered yet.
 */
export async function nudgeProject(slug: string, origin: string): Promise<NudgeResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!project) throw new Error("Plan not found");

  const { data: participants } = await supabaseAdmin
    .from("participants")
    .select("id, display_name, token, profile_id, responded_at")
    .eq("project_id", project.id);

  const pending = (participants ?? []).filter((p) => !p.responded_at);
  const link = `${origin}/p/${project.slug}`;
  const waiting = pending.map((p) => p.display_name);
  const message = nudgeMessage(project.name, waiting, link);

  const apiKey = process.env["RESEND_API_KEY"];
  let emailed = 0;

  if (apiKey && pending.length > 0) {
    const profileIds = pending.map((p) => p.profile_id).filter((v): v is string => !!v);
    const emails = new Map<string, string>();
    if (profileIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .in("id", profileIds);
      for (const p of profiles ?? []) if (p.email) emails.set(p.id, p.email);
    }
    for (const p of pending) {
      const to = p.profile_id ? emails.get(p.profile_id) : undefined;
      if (!to) continue;
      const personal = `${link}?t=${p.token}`;
      const ok = await sendResend(
        apiKey,
        to,
        `Quick one: ${project.name}`,
        `Hi ${p.display_name},\n\nWe still need your times for ${project.name}. It takes about 30 seconds and there's no signup:\n\n${personal}\n\n— Penciled.in`,
      );
      if (ok) emailed += 1;
    }
  }

  return {
    projectName: project.name,
    slug: project.slug,
    waiting,
    message,
    emailed,
    emailConfigured: !!apiKey,
  };
}

/** Projects whose response deadline lands roughly 48 hours from now. */
export async function nudgeDueProjects(origin: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = Date.now();
  const from = new Date(now + 47 * 3600_000).toISOString();
  const to = new Date(now + 48 * 3600_000).toISOString();

  const { data: projects } = await supabaseAdmin
    .from("projects")
    .select("slug")
    .eq("status", "collecting")
    .gte("response_deadline", from)
    .lt("response_deadline", to);

  const results: { slug: string; waiting: number; emailed: number }[] = [];
  for (const p of projects ?? []) {
    try {
      const r = await nudgeProject(p.slug, origin);
      results.push({ slug: p.slug, waiting: r.waiting.length, emailed: r.emailed });
    } catch {
      // one bad plan shouldn't stop the batch
    }
  }
  return results;
}
