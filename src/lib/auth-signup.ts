import { supabase } from "@/integrations/supabase/client";

/**
 * The one place an account gets created. Both entry points — the organizer
 * sign-up screen and the respondent upsell card — go through here, so the
 * three outcomes are handled the same way in both.
 */
export type SignUpOutcome =
  /** Email confirmation is off for this project: they're already signed in. */
  | { status: "signed-in" }
  /** A confirmation email is on its way. */
  | { status: "confirm-sent" }
  /**
   * The address already has an account. Supabase reports this as success with
   * no identities and sends no email, so it has to be detected, not awaited.
   */
  | { status: "already-registered" };

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  /** What their group sees. Falls back to the email's local part server-side. */
  displayName?: string;
}): Promise<SignUpOutcome> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      ...(input.displayName ? { data: { display_name: input.displayName } } : {}),
      // /auth is the only route that claims this browser's guest answers, so
      // every confirmation lands there regardless of where signup started.
      emailRedirectTo: `${window.location.origin}/auth`,
    },
  });
  if (error) throw error;
  if (data.session) return { status: "signed-in" };
  if (data.user && (data.user.identities?.length ?? 0) === 0)
    return { status: "already-registered" };
  return { status: "confirm-sent" };
}
