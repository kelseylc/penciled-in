import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const nudgeResponders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ slug: z.string().min(3).max(40), origin: z.string().url().max(200) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // The organizer must be able to see the plan before nudging it.
    const { data: project } = await context.supabase
      .from("projects")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!project) throw new Error("Plan not found");

    const { nudgeProject } = await import("@/lib/nudge.server");
    const result = await nudgeProject(data.slug, data.origin);
    return {
      waiting: result.waiting,
      message: result.message,
      emailed: result.emailed,
      emailConfigured: result.emailConfigured,
    };
  });
