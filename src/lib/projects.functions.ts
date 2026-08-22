import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const participantSchema = z.object({
  display_name: z.string().min(1).max(80),
  timezone: z.string().min(1).max(64),
  is_required: z.boolean(),
  profile_id: z.string().uuid().nullable().optional(),
});

const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  template: z.string().min(1).max(32),
  duration_minutes: z.number().int().min(15).max(720),
  mode: z.enum(["one_off", "recurring"]),
  cadence: z.enum(["weekly", "biweekly", "monthly", "quarterly"]).nullable(),
  window_mode: z.enum(["rolling", "custom"]),
  window_start: z.string(),
  window_end: z.string(),
  quorum_min: z.number().int().min(1).max(100),
  response_deadline: z.string().nullable(),
  group_id: z.string().uuid().nullable(),
  participants: z.array(participantSchema).min(1).max(100),
  slots: z
    .array(z.object({ start_utc: z.string(), end_utc: z.string() }))
    .min(1)
    .max(200),
});

function makeSlug() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createProjectSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const slug = makeSlug();

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        name: data.name,
        template: data.template,
        duration_minutes: data.duration_minutes,
        mode: data.mode,
        cadence: data.cadence,
        window_mode: data.window_mode,
        window_start: data.window_start,
        window_end: data.window_end,
        quorum_min: data.quorum_min,
        response_deadline: data.response_deadline,
        group_id: data.group_id,
        organizer_id: userId,
        status: "collecting",
        slug,
      })
      .select("id, slug")
      .single();

    if (error || !project) throw new Error(error?.message ?? "Could not create project");

    const { error: pErr } = await supabase.from("participants").insert(
      data.participants.map((p) => ({
        project_id: project.id,
        display_name: p.display_name,
        timezone: p.timezone,
        is_required: p.is_required,
        profile_id: p.profile_id ?? null,
      })),
    );
    if (pErr) throw new Error(pErr.message);

    const { error: sErr } = await supabase.from("candidate_slots").insert(
      data.slots.map((s) => ({
        project_id: project.id,
        start_utc: s.start_utc,
        end_utc: s.end_utc,
      })),
    );
    if (sErr) throw new Error(sErr.message);

    return { id: project.id, slug: project.slug };
  });
