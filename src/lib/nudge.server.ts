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

async function sendResend(
  apiKey: string,
  to: string,
  subject: string,
  text: string,
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
        text,
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
