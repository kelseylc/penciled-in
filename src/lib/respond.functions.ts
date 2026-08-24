import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenSchema = z
  .string()
  .regex(/^[a-f0-9]{16,80}$/i)
  .nullable()
  .optional();

const stateSchema = z.enum(["yes", "maybe", "no"]);

export interface RespondBundle {
  project: {
    id: string;
    name: string;
    slug: string;
    template: string;
    duration_minutes: number;
    quorum_min: number;
    response_deadline: string | null;
    status: string;
    mode: string;
  };
  slots: { id: string; start_utc: string; end_utc: string }[];
  participants: {
    id: string;
    display_name: string;
    is_required: boolean;
    responded: boolean;
  }[];
  me: {
    id: string;
    display_name: string;
    timezone: string | null;
    responded: boolean;
    responses: { candidate_slot_id: string; state: "yes" | "maybe" | "no" }[];
    defaults: {
      weekly_pattern: WeeklyPattern;
      blackout_dates: string[];
      updated_at: string;
    } | null;
  } | null;

}

export const getRespondBundle = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ slug: z.string().min(3).max(40), token: tokenSchema }).parse(data),
  )
  .handler(async ({ data }): Promise<RespondBundle> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: project } = await supabaseAdmin
      .from("projects")
      .select(
        "id, name, slug, template, duration_minutes, quorum_min, response_deadline, status, mode, group_id",
      )
      .eq("slug", data.slug)
      .maybeSingle();

    if (!project) throw new Error("This plan link isn't valid anymore.");

    const [{ data: slots }, { data: participants }] = await Promise.all([
      supabaseAdmin
        .from("candidate_slots")
        .select("id, start_utc, end_utc")
        .eq("project_id", project.id)
        .order("start_utc", { ascending: true }),
      supabaseAdmin
        .from("participants")
        .select("id, display_name, is_required, responded_at, profile_id")
        .eq("project_id", project.id)
        .order("display_name", { ascending: true }),
    ]);

    let me: RespondBundle["me"] = null;
    if (data.token) {
      const { data: participant } = await supabaseAdmin
        .from("participants")
        .select("id, display_name, timezone, responded_at, profile_id")
        .eq("project_id", project.id)
        .eq("token", data.token)
        .maybeSingle();

      if (participant) {
        const { data: responses } = await supabaseAdmin
          .from("slot_responses")
          .select("candidate_slot_id, state")
          .eq("participant_id", participant.id);

        let defaults: {
          weekly_pattern: WeeklyPattern;
          blackout_dates: string[];
          updated_at: string;
        } | null = null;

        if (participant.profile_id) {
          // Account-level standing availability first: it's the one a person
          // sets from "Your usual availability" and applies to every plan.
          const { data: mine } = await supabaseAdmin
            .from("default_availability")
            .select("weekly_pattern, blackout_dates, updated_at")
            .eq("profile_id", participant.profile_id)
            .maybeSingle();
          if (mine) {
            defaults = {
              weekly_pattern: parseWeeklyPattern(mine.weekly_pattern),
              blackout_dates: mine.blackout_dates ?? [],
              updated_at: mine.updated_at,
            };
          }
        }

        if (!defaults && participant.profile_id && project.group_id) {
          const { data: member } = await supabaseAdmin
            .from("group_members")
            .select("id")
            .eq("group_id", project.group_id)
            .eq("profile_id", participant.profile_id)
            .maybeSingle();
          if (member) {
            const { data: da } = await supabaseAdmin
              .from("default_availability")
              .select("weekly_pattern, blackout_dates, updated_at")
              .eq("group_member_id", member.id)
              .maybeSingle();
            if (da) {
              defaults = {
                weekly_pattern: parseWeeklyPattern(da.weekly_pattern),
                blackout_dates: da.blackout_dates ?? [],
                updated_at: da.updated_at,
              };
            }
          }
        }


        me = {
          id: participant.id,
          display_name: participant.display_name,
          timezone: participant.timezone,
          responded: !!participant.responded_at,
          responses: (responses ?? []).map((r) => ({
            candidate_slot_id: r.candidate_slot_id,
            state: r.state as "yes" | "maybe" | "no",
          })),
          defaults,
        };
      }
    }

    return {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        template: project.template,
        duration_minutes: project.duration_minutes,
        quorum_min: project.quorum_min,
        response_deadline: project.response_deadline,
        status: project.status,
        mode: project.mode,
      },
      slots: slots ?? [],
      participants: (participants ?? []).map((p) => ({
        id: p.id,
        display_name: p.display_name,
        is_required: p.is_required,
        responded: !!p.responded_at,
      })),
      me,
    };
  });

/** Claim an existing unclaimed participant by name, or add a new guest. */
export const joinProject = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        slug: z.string().min(3).max(40),
        name: z.string().trim().min(1).max(80),
        timezone: z.string().min(1).max(64),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("id, status")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!project) throw new Error("This plan link isn't valid anymore.");

    // Exact (case-insensitive) name match on an unclaimed participant means
    // "welcome back" — edit that response instead of creating a duplicate.
    const { data: existing } = await supabaseAdmin
      .from("participants")
      .select("id, token, display_name, responded_at, profile_id")
      .eq("project_id", project.id)
      .is("profile_id", null)
      .ilike("display_name", data.name);

    const match = (existing ?? []).find(
      (p) => p.display_name.trim().toLowerCase() === data.name.trim().toLowerCase(),
    );
    if (match) {
      await supabaseAdmin
        .from("participants")
        .update({ timezone: data.timezone })
        .eq("id", match.id);
      return {
        participant_id: match.id,
        token: match.token,
        returning: true,
        hadResponses: !!match.responded_at,
      };
    }

    const { data: created, error } = await supabaseAdmin
      .from("participants")
      .insert({
        project_id: project.id,
        display_name: data.name,
        timezone: data.timezone,
        is_required: false,
      })
      .select("id, token")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Could not add you to this plan");

    return {
      participant_id: created.id,
      token: created.token,
      returning: false,
      hadResponses: false,
    };
  });

export const submitResponses = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        slug: z.string().min(3).max(40),
        token: z.string().regex(/^[a-f0-9]{16,80}$/i),
        timezone: z.string().min(1).max(64),
        responses: z
          .array(z.object({ candidate_slot_id: z.string().uuid(), state: stateSchema }))
          .max(200),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!project) throw new Error("This plan link isn't valid anymore.");

    const { data: participant } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("project_id", project.id)
      .eq("token", data.token)
      .maybeSingle();
    if (!participant) throw new Error("That response link isn't valid.");

    const { data: slots } = await supabaseAdmin
      .from("candidate_slots")
      .select("id")
      .eq("project_id", project.id);
    const valid = new Set((slots ?? []).map((s) => s.id));
    const rows = data.responses
      .filter((r) => valid.has(r.candidate_slot_id))
      .map((r) => ({
        participant_id: participant.id,
        candidate_slot_id: r.candidate_slot_id,
        state: r.state,
      }));

    await supabaseAdmin.from("slot_responses").delete().eq("participant_id", participant.id);
    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from("slot_responses").insert(rows);
      if (error) throw new Error(error.message);
    }

    await supabaseAdmin
      .from("participants")
      .update({ responded_at: new Date().toISOString(), timezone: data.timezone })
      .eq("id", participant.id);

    return { ok: true, saved: rows.length };
  });
