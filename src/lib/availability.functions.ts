import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import {
  normalizePattern,
  parseWeeklyPattern,
  type WeeklyPattern,
} from "@/lib/weekly-availability";

export interface MyAvailability {
  weekly_pattern: WeeklyPattern;
  updated_at: string | null;
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

export const getMyAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAvailability> => {
    const { data } = await context.supabase
      .from("default_availability")
      .select("weekly_pattern, updated_at")
      .eq("profile_id", context.userId)
      .maybeSingle();

    return {
      weekly_pattern: parseWeeklyPattern(data?.weekly_pattern ?? null),
      updated_at: data?.updated_at ?? null,
    };
  });

export const saveMyAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ weekly_pattern: patternSchema }).parse(data))
  .handler(async ({ data, context }): Promise<MyAvailability> => {
    // Overlaps merge rather than erroring — redundant data isn't a user mistake.
    const pattern = normalizePattern(data.weekly_pattern as WeeklyPattern);
    const updated_at = new Date().toISOString();

    const { data: existing } = await context.supabase
      .from("default_availability")
      .select("id")
      .eq("profile_id", context.userId)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase
        .from("default_availability")
        .update({ weekly_pattern: pattern as unknown as Json, updated_at })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("default_availability")
        .insert({ profile_id: context.userId, weekly_pattern: pattern as unknown as Json, updated_at });
      if (error) throw new Error(error.message);
    }

    return { weekly_pattern: pattern, updated_at };
  });
