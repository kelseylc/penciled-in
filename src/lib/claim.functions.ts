import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * When a guest later signs up, link the participant rows they answered as
 * guests to their new profile. Matching is by the tokens their browser kept.
 */
export const claimParticipants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        tokens: z.array(z.string().regex(/^[a-f0-9]{16,80}$/i)).max(50),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (data.tokens.length === 0) return { claimed: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("participants")
      .update({ profile_id: context.userId })
      .in("token", data.tokens)
      .is("profile_id", null)
      .select("id");
    if (error) throw new Error(error.message);

    return { claimed: rows?.length ?? 0 };
  });
