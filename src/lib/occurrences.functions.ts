import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const tokenRe = /^[a-f0-9]{16,80}$/i;

export interface OccurrenceGuestBundle {
  occurrence: {
    id: string;
    project_id: string;
    scheduled_start_utc: string;
    scheduled_end_utc: string;
    status: string;
    index: number;
    total: number;
  };
  project: { name: string; slug: string; quorum_min: number };
  me: {
    id: string;
    display_name: string;
    state: "in" | "out" | "late" | null;
    note: string | null;
  } | null;
  tally: { attending: number; out: number; noResponse: number; total: number };
}

export interface OrganizerOccurrence {
  id: string;
  project_id: string;
  project_name: string;
  project_slug: string;
  scheduled_start_utc: string;
  scheduled_end_utc: string;
  status: string;
  quorum_min: number;
  attending: number;
  totalParticipants: number;
  inNames: string[];
  lateNames: string[];
  outNames: string[];
  noResponseNames: string[];
  requiredOut: string[];
  repollSlug: string | null;
  /** "campaign" sessions get the rescue loop and the played/session-number chrome. */
  appMode: "campaign" | "plans";
  sessionNumber: number | null;
  playedAt: string | null;
  /** Set when the session was moved by a rescue and nobody has acknowledged it. */
  movedAt: string | null;
  groupId: string | null;
  daysSinceLastPlayed: number | null;
}

export const getOccurrenceGuest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        occurrenceId: z.string().uuid(),
        token: z.string().regex(tokenRe).nullable().optional(),
        name: z.string().trim().min(1).max(80).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<OccurrenceGuestBundle> => {
    const { loadOccurrenceGuestBundle } = await import("@/lib/occurrences.guest.server");
    return loadOccurrenceGuestBundle(data);
  });

export const submitOccurrenceRsvp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        occurrenceId: z.string().uuid(),
        token: z.string().regex(tokenRe).nullable().optional(),
        name: z.string().trim().min(1).max(80).nullable().optional(),
        state: z.enum(["in", "out", "late"]),
        note: z.string().trim().max(200).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { saveOccurrenceRsvp } = await import("@/lib/occurrences.guest.server");
    return saveOccurrenceRsvp(data);
  });

export const getOrganizerOccurrences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ slug: z.string().min(3).max(40).nullable().optional() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<OrganizerOccurrence[]> => {
    const { loadOrganizerOccurrences } = await import("@/lib/occurrences.organizer.server");
    return loadOrganizerOccurrences(context.supabase, data.slug ?? null);
  });

export const actOnOccurrence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        occurrenceId: z.string().uuid(),
        action: z.enum(["repoll", "go_ahead", "cancel", "played"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { runOccurrenceAction } = await import("@/lib/occurrences.organizer.server");
    return runOccurrenceAction(context.supabase, context.userId, data.occurrenceId, data.action);
  });
