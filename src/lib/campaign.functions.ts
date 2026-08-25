import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const memberSchema = z.object({
  display_name: z.string().min(1).max(80),
  timezone: z.string().max(64).nullable(),
  role: z.enum(["dm", "player", "guest"]),
  is_required: z.boolean(),
});

const sessionZeroSchema = z.object({
  campaign_name: z.string().min(1).max(120),
  system: z.string().max(80).nullable(),
  cadence: z.enum(["weekly", "biweekly", "monthly", "quarterly", "adhoc"]),
  duration_minutes: z.number().int().min(30).max(1440),
  table_rule: z.enum(["play_anyway", "strict_quorum", "everyone"]),
  auto_lock_rescue: z.boolean(),
  quorum_min: z.number().int().min(1).max(100),
  window_start: z.string(),
  window_end: z.string(),
  response_deadline: z.string().nullable(),
  venue: z.string().max(200).nullable(),
  vtt_link: z.string().max(500).nullable(),
  party: z.array(memberSchema).min(1).max(20),
  slots: z
    .array(z.object({ start_utc: z.string(), end_utc: z.string() }))
    .min(1)
    .max(200),
});

function makeSlug() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (const b of crypto.getRandomValues(new Uint8Array(8))) out += alphabet[b % alphabet.length];
  return out;
}

/**
 * Session Zero. Creates the durable campaign (group), its party, and the
 * cadence-finding poll in one shot — the DM never has to "make a group" and
 * then "make an event".
 */
export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sessionZeroSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: group, error: gErr } = await supabase
      .from("groups")
      .insert({
        name: data.campaign_name,
        campaign_name: data.campaign_name,
        mode: "campaign",
        table_rule: data.table_rule,
        auto_lock_rescue: data.auto_lock_rescue,
        venue: data.venue,
        vtt_link: data.vtt_link,
        owner_id: userId,
        slug: makeSlug(),
      })
      .select("id, slug")
      .single();
    if (gErr || !group) throw new Error(gErr?.message ?? "Could not create the campaign");

    const { error: mErr } = await supabase.from("group_members").insert(
      data.party.map((p) => ({
        group_id: group.id,
        display_name: p.display_name,
        timezone: p.timezone,
        role: p.role,
        is_required_default: p.is_required,
        profile_id: p.role === "dm" ? userId : null,
      })),
    );
    if (mErr) throw new Error(mErr.message);

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .insert({
        name: `${data.campaign_name} — cadence`,
        template: "dnd",
        app_mode: "campaign",
        duration_minutes: data.duration_minutes,
        mode: "recurring",
        cadence: data.cadence,
        window_mode: "rolling",
        window_start: data.window_start,
        window_end: data.window_end,
        quorum_min: data.quorum_min,
        response_deadline: data.response_deadline,
        group_id: group.id,
        organizer_id: userId,
        status: "collecting",
        slug: makeSlug(),
      })
      .select("id, slug")
      .single();
    if (pErr || !project) throw new Error(pErr?.message ?? "Could not create the cadence poll");

    const { error: partErr } = await supabase.from("participants").insert(
      data.party.map((p) => ({
        project_id: project.id,
        display_name: p.display_name,
        timezone: p.timezone,
        role: p.role,
        is_required: p.is_required,
        profile_id: p.role === "dm" ? userId : null,
      })),
    );
    if (partErr) throw new Error(partErr.message);

    const { error: sErr } = await supabase
      .from("candidate_slots")
      .insert(data.slots.map((s) => ({ project_id: project.id, ...s })));
    if (sErr) throw new Error(sErr.message);

    return { group_id: group.id, group_slug: group.slug, slug: project.slug };
  });
