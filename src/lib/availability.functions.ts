import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import {
  normalizePattern,
  parseWeeklyPattern,
  type WeeklyPattern,
} from "@/lib/weekly-availability";

/** After this long, a standing pattern is a guess about a life you used to have. */
export const AVAILABILITY_STALE_DAYS = 60;
/** The gentle monthly "still true?" ritual fires at this age. */
export const AVAILABILITY_REFRESH_DAYS = 30;

export interface MyAvailability {
  weekly_pattern: WeeklyPattern;
  blackout_dates: string[];
  updated_at: string | null;
  last_confirmed_at: string | null;
  /** Days since it was last written or confirmed; null when nothing is saved. */
  ageDays: number | null;
  /** Old enough that we should ask before trusting it. */
  needsRefresh: boolean;
  /** Old enough that we stop counting it toward quorum. */
  stale: boolean;
}

const rangeSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  state: z.enum(["yes", "maybe"]).default("yes"),
});

const patternSchema = z.record(
  z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]),
  z.object({ all_day: z.boolean(), ranges: z.array(rangeSchema).max(8) }),
);

const blackoutSchema = z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60);

export function availabilityAge(freshestIso: string | null): number | null {
  if (!freshestIso) return null;
  return Math.floor((Date.now() - new Date(freshestIso).getTime()) / 86_400_000);
}

function bundle(row: {
  weekly_pattern: Json | null;
  blackout_dates: string[] | null;
  updated_at: string | null;
  last_confirmed_at: string | null;
} | null): MyAvailability {
  const freshest = [row?.last_confirmed_at, row?.updated_at]
    .filter((v): v is string => !!v)
    .sort()
    .pop() ?? null;
  const pattern = parseWeeklyPattern(row?.weekly_pattern ?? null);
  const hasAnything = Object.keys(pattern).length > 0;
  const ageDays = hasAnything ? availabilityAge(freshest) : null;
  return {
    weekly_pattern: pattern,
    blackout_dates: row?.blackout_dates ?? [],
    updated_at: row?.updated_at ?? null,
    last_confirmed_at: row?.last_confirmed_at ?? null,
    ageDays,
    needsRefresh: ageDays !== null && ageDays >= AVAILABILITY_REFRESH_DAYS,
    stale: ageDays !== null && ageDays >= AVAILABILITY_STALE_DAYS,
  };
}

export const getMyAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAvailability> => {
    const { data } = await context.supabase
      .from("default_availability")
      .select("weekly_pattern, blackout_dates, updated_at, last_confirmed_at")
      .eq("profile_id", context.userId)
      .maybeSingle();

    return bundle(data ?? null);
  });

export const saveMyAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        weekly_pattern: patternSchema,
        blackout_dates: blackoutSchema.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<MyAvailability> => {
    // Overlaps merge rather than erroring — redundant data isn't a user mistake.
    const pattern = normalizePattern(data.weekly_pattern as WeeklyPattern);
    const now = new Date().toISOString();
    const blackouts = data.blackout_dates
      ? Array.from(new Set(data.blackout_dates)).sort()
      : undefined;

    const { data: existing } = await context.supabase
      .from("default_availability")
      .select("id, blackout_dates")
      .eq("profile_id", context.userId)
      .maybeSingle();

    const row = {
      weekly_pattern: pattern as unknown as Json,
      blackout_dates: blackouts ?? existing?.blackout_dates ?? [],
      updated_at: now,
      last_confirmed_at: now,
    };

    if (existing) {
      const { error } = await context.supabase
        .from("default_availability")
        .update(row)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("default_availability")
        .insert({ profile_id: context.userId, ...row });
      if (error) throw new Error(error.message);
    }

    return bundle({
      weekly_pattern: pattern as unknown as Json,
      blackout_dates: row.blackout_dates,
      updated_at: now,
      last_confirmed_at: now,
    });
  });

/**
 * "Still good" — the one-tap half of the monthly ritual. Nothing changes except
 * our confidence in it, which is exactly the point: confirming must be cheaper
 * than editing, or nobody does either.
 */
export const confirmMyAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAvailability> => {
    const now = new Date().toISOString();
    const { data: existing } = await context.supabase
      .from("default_availability")
      .select("id, weekly_pattern, blackout_dates, updated_at")
      .eq("profile_id", context.userId)
      .maybeSingle();
    if (!existing) throw new Error("You haven't set a usual schedule yet.");

    const { error } = await context.supabase
      .from("default_availability")
      .update({ last_confirmed_at: now })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);

    return bundle({ ...existing, last_confirmed_at: now });
  });
