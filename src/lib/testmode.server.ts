import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const DEMO_EMAIL = "demo@penciled.in";
export const DEMO_PASSWORD = "penciled-demo-2026";

const SLUG_ONEOFF = "demo-brunch";
const SLUG_LOCKED = "demo-movie";
const SLUG_RECURRING = "demo-dnd";
const GROUP_SLUG = "demo-crew";

export interface TestModeSeed {
  email: string;
  password: string;
  group: { slug: string; name: string };
  projects: {
    slug: string;
    name: string;
    kind: "collecting" | "locked-one-off" | "locked-recurring";
    participants: { name: string; token: string }[];
  }[];
  occurrences: { id: string; startUtc: string; status: string }[];
}

function iso(d: Date) {
  return d.toISOString();
}
function atUtc(daysFromNow: number, hourUtc: number) {
  const d = new Date();
  d.setUTCHours(hourUtc, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d;
}

async function ensureDemoUser(): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", DEMO_EMAIL)
    .maybeSingle();
  if (existing?.id) {
    await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    return existing.id;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "Demo Organizer" },
  });
  if (error || !data.user) {
    // Fall back to finding the user if it exists in auth but has no profile row.
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = list?.users.find((u) => u.email === DEMO_EMAIL);
    if (!found) throw new Error(error?.message ?? "Could not create the demo account");
    await supabaseAdmin.auth.admin.updateUserById(found.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    return found.id;
  }
  return data.user.id;
}

async function wipe() {
  const { data: projects } = await supabaseAdmin
    .from("projects")
    .select("id")
    .in("slug", [SLUG_ONEOFF, SLUG_LOCKED, SLUG_RECURRING]);
  const ids = (projects ?? []).map((p) => p.id);
  if (ids.length) {
    // Re-poll children first (they reference the parent project).
    await supabaseAdmin.from("projects").delete().in("parent_project_id", ids);
    await supabaseAdmin.from("projects").delete().in("id", ids);
  }
  await supabaseAdmin.from("groups").delete().eq("slug", GROUP_SLUG);
}

const PEOPLE = [
  { name: "Maya", tz: "America/New_York", required: true },
  { name: "Devon", tz: "America/Los_Angeles", required: true },
  { name: "Priya", tz: "Europe/London", required: false },
  { name: "Sam", tz: "America/Chicago", required: false },
  { name: "Alex", tz: "Australia/Sydney", required: false },
];

async function addParticipants(projectId: string, count: number) {
  const rows = PEOPLE.slice(0, count).map((p) => ({
    project_id: projectId,
    display_name: p.name,
    timezone: p.tz,
    is_required: p.required,
  }));
  const { data, error } = await supabaseAdmin
    .from("participants")
    .insert(rows)
    .select("id, display_name, token");
  if (error || !data) throw new Error(error?.message ?? "participants failed");
  return data;
}

async function createProjectRow(row: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from("projects")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(row as any)
    .select("id, slug, name")
    .single();
  if (error || !data) throw new Error(error?.message ?? "project failed");
  return data;
}

export async function seedTestMode(): Promise<TestModeSeed> {
  const userId = await ensureDemoUser();
  await wipe();

  // Saved group
  const { data: group, error: gErr } = await supabaseAdmin
    .from("groups")
    .insert({ name: "The Usual Suspects", slug: GROUP_SLUG, owner_id: userId })
    .select("id, slug, name")
    .single();
  if (gErr || !group) throw new Error(gErr?.message ?? "group failed");
  await supabaseAdmin.from("group_members").insert(
    PEOPLE.map((p) => ({
      group_id: group.id,
      display_name: p.name,
      timezone: p.tz,
      is_required_default: p.required,
    })),
  );

  const projects: TestModeSeed["projects"] = [];

  // 1) One-off still collecting responses
  const oneOff = await createProjectRow({
    name: "Sunday brunch",
    slug: SLUG_ONEOFF,
    template: "brunch",
    duration_minutes: 90,
    mode: "one_off",
    cadence: null,
    window_mode: "rolling",
    window_start: iso(atUtc(1, 12)),
    window_end: iso(atUtc(14, 23)),
    quorum_min: 3,
    response_deadline: iso(atUtc(5, 12)),
    group_id: group.id,
    organizer_id: userId,
    status: "collecting",
  });

  const slotRows: { project_id: string; start_utc: string; end_utc: string }[] = [];
  for (let day = 2; day <= 13; day++) {
    for (const hour of [14, 18, 23]) {
      const start = atUtc(day, hour);
      slotRows.push({
        project_id: oneOff.id,
        start_utc: iso(start),
        end_utc: iso(new Date(start.getTime() + 90 * 60_000)),
      });
    }
  }
  const { data: slots } = await supabaseAdmin
    .from("candidate_slots")
    .insert(slotRows)
    .select("id, start_utc");

  const p1 = await addParticipants(oneOff.id, 5);
  const states = ["yes", "maybe", "no"] as const;
  const responses: { candidate_slot_id: string; participant_id: string; state: string }[] = [];
  p1.slice(0, 4).forEach((p, pi) => {
    (slots ?? []).forEach((s, si) => {
      if ((si + pi) % 4 === 3) return; // leave some unknown
      responses.push({
        candidate_slot_id: s.id,
        participant_id: p.id,
        state: states[(si + pi * 2) % 3]!,
      });
    });
  });
  if (responses.length) await supabaseAdmin.from("slot_responses").insert(responses);
  await supabaseAdmin
    .from("participants")
    .update({ responded_at: new Date().toISOString() })
    .in(
      "id",
      p1.slice(0, 4).map((p) => p.id),
    );
  projects.push({
    slug: oneOff.slug,
    name: oneOff.name,
    kind: "collecting",
    participants: p1.map((p) => ({ name: p.display_name, token: p.token })),
  });

  // 2) One-off, locked (decision screen + single-event .ics)
  const locked = await createProjectRow({
    name: "Movie night",
    slug: SLUG_LOCKED,
    template: "movie",
    duration_minutes: 180,
    mode: "one_off",
    cadence: null,
    window_mode: "rolling",
    window_start: iso(atUtc(1, 0)),
    window_end: iso(atUtc(14, 23)),
    quorum_min: 3,
    response_deadline: null,
    group_id: group.id,
    organizer_id: userId,
    status: "locked",
  });
  const chosenStart = atUtc(6, 1);
  const { data: lockedSlots } = await supabaseAdmin
    .from("candidate_slots")
    .insert([
      {
        project_id: locked.id,
        start_utc: iso(chosenStart),
        end_utc: iso(new Date(chosenStart.getTime() + 180 * 60_000)),
      },
      {
        project_id: locked.id,
        start_utc: iso(atUtc(8, 1)),
        end_utc: iso(new Date(atUtc(8, 1).getTime() + 180 * 60_000)),
      },
    ])
    .select("id");
  const p2 = await addParticipants(locked.id, 4);
  await supabaseAdmin.from("slot_responses").insert(
    p2.map((p, i) => ({
      candidate_slot_id: lockedSlots![0]!.id,
      participant_id: p.id,
      state: i === 3 ? "maybe" : "yes",
    })),
  );
  await supabaseAdmin
    .from("participants")
    .update({ responded_at: new Date().toISOString() })
    .in(
      "id",
      p2.map((p) => p.id),
    );
  await supabaseAdmin
    .from("decisions")
    .insert({ project_id: locked.id, chosen_slot_id: lockedSlots![0]!.id });
  projects.push({
    slug: locked.slug,
    name: locked.name,
    kind: "locked-one-off",
    participants: p2.map((p) => ({ name: p.display_name, token: p.token })),
  });

  // 3) Recurring, locked cadence with occurrences (one at risk)
  const recurring = await createProjectRow({
    name: "D&D — Curse of Strahd",
    slug: SLUG_RECURRING,
    template: "dnd",
    duration_minutes: 300,
    mode: "recurring",
    cadence: "biweekly",
    window_mode: "rolling",
    window_start: iso(atUtc(0, 0)),
    window_end: iso(atUtc(84, 23)),
    quorum_min: 4,
    response_deadline: null,
    group_id: group.id,
    organizer_id: userId,
    status: "locked",
  });
  const p3 = await addParticipants(recurring.id, 5);
  await supabaseAdmin
    .from("participants")
    .update({ responded_at: new Date().toISOString() })
    .in(
      "id",
      p3.map((p) => p.id),
    );

  const first = atUtc(3, 19);
  const occRows = Array.from({ length: 12 }, (_, i) => {
    const start = new Date(first.getTime() + i * 14 * 86_400_000);
    return {
      project_id: recurring.id,
      scheduled_start_utc: iso(start),
      scheduled_end_utc: iso(new Date(start.getTime() + 300 * 60_000)),
      status: "pending",
    };
  });
  const { data: occs } = await supabaseAdmin
    .from("occurrences")
    .insert(occRows)
    .select("id, scheduled_start_utc, status");
  await supabaseAdmin.from("decisions").insert({
    project_id: recurring.id,
    cadence_kind: "biweekly",
    cadence_weekday: first.getUTCDay(),
    cadence_start_time_utc: `${String(first.getUTCHours()).padStart(2, "0")}:00:00`,
  });

  const o1 = occs![0]!;
  const o2 = occs![1]!;
  await supabaseAdmin.from("occurrence_rsvps").insert([
    ...p3.map((p, i) => ({
      occurrence_id: o1.id,
      participant_id: p.id,
      state: i === 4 ? "late" : "in",
      note: i === 4 ? "Coming from work, 20 min behind" : null,
    })),
    { occurrence_id: o2.id, participant_id: p3[0]!.id, state: "out", note: "Out of town" },
    { occurrence_id: o2.id, participant_id: p3[1]!.id, state: "in", note: null },
  ]);
  await supabaseAdmin.from("occurrences").update({ status: "confirmed" }).eq("id", o1.id);
  await supabaseAdmin.from("occurrences").update({ status: "at_risk" }).eq("id", o2.id);

  projects.push({
    slug: recurring.slug,
    name: recurring.name,
    kind: "locked-recurring",
    participants: p3.map((p) => ({ name: p.display_name, token: p.token })),
  });

  return {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    group: { slug: group.slug, name: group.name },
    projects,
    occurrences: (occs ?? []).slice(0, 3).map((o) => ({
      id: o.id,
      startUtc: o.scheduled_start_utc,
      status: o.id === o1.id ? "confirmed" : o.id === o2.id ? "at_risk" : o.status,
    })),
  };
}
