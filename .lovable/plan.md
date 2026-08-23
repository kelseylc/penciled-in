# Auth review: sign in, sign up, forgot password

Scope: `src/routes/auth.tsx`, `src/routes/reset-password.tsx`, `src/hooks/useAuth.ts`, `src/components/AccountUpsellCard.tsx`, `src/components/AppBar.tsx`, `src/lib/claim.functions.ts`, and the auth email templates. Findings ordered by impact.

## Tier 1 — flows that lose the user or their work

**1. Signing in throws away what the user was doing.** `/new` redirects to `/auth` when there's no session, and `/auth` always lands the user on `/home` after sign-in. Someone who types a plan into the AI box on the home page, gets bounced to sign-in, and signs in ends up on "My events" with their draft gone. Fix: pass the blocked URL as a `redirect` search param (`/auth?redirect=/new?draft=…`), validate it as a same-origin path, and navigate there after sign-in instead of hardcoding `/home`.

**2. The upsell signup path is a second, weaker auth flow.** `AccountUpsellCard` calls `signUp` directly with no display name, `emailRedirectTo: "/"`, and no guest-token claim. Guest-history claiming only runs in the `/auth` component's effect, so a respondent who creates an account from the post-response card confirms their email, lands on `/`, and none of their past answers get linked — the exact benefit the card promised. Fix: route both signup paths through one shared function (name + email + password + `emailRedirectTo: /auth?claim=1`), and move the claim call somewhere it runs on any first authenticated load, not just on the `/auth` screen.

**3. "Forgot your password?" fires an email on tap.** It reads whatever is in the sign-in email field and immediately calls `resetPasswordForEmail`. If the field is empty the user gets a validation toast instead of a reset flow; if there's a typo they get silence. Fix: a real forgot screen with its own email input and an explicit "Send reset link" button, then the confirmation state.

**4. Auth screen state is not in the URL.** `mode` is `useState` seeded once from `?mode=`. Refreshing the "Check your email" or "Confirm your email" screen dumps the user back to sign-in, browser Back doesn't move between modes, and the email address shown in the copy is lost. Fix: drive `mode` and the pending email off search params.

**5. Dead recovery branch in `auth.tsx`.** Reset links now go to `/reset-password`, but `auth.tsx` still carries a `PASSWORD_RECOVERY` listener, a `settingPassword` flag that gates the redirect effect, and a whole `mode === "reset"` form. It's unreachable in the current flow and it complicates the one effect that decides where a signed-in user goes. Delete it; `/reset-password` owns recovery.

## Tier 2 — correctness

**6. Stale-closure bug in the reset link check.** In `reset-password.tsx` the `setTimeout` reads `ready` captured at effect-mount (always `false`), so the expiry decision doesn't see a session that arrived in between. On a slow hash exchange a valid link can render "This reset link is expired." Use a ref, or key the timer off the session result directly.

**7. Every component that needs the session opens its own listener.** `useAuth` registers a fresh `onAuthStateChange` plus a `getSession()` per consumer, and `auth.tsx` / `reset-password.tsx` add two more. That's N subscribers and N session reads per page, with no shared cache and inconsistent `loading` timing between them. Fix: one listener in `__root.tsx` feeding router context (or a single provider), and have `useAuth` read from it.

**8. Sign-out doesn't tear down the cache.** `AppBar` calls `signOut()` then navigates. In-flight authenticated queries land as 401s after the session clears, and cached organizer data survives in the Query cache, so Back can paint a stale signed-in shell. Fix: `cancelQueries()` → `clear()` → `signOut()` → `navigate({ replace: true })`.

**9. `resendConfirmation` can be aimed at any address.** It's offered whenever sign-in fails, using the typed email, gated only by a 30-second client-side timer. A stranger can use it to send confirmation mail to arbitrary addresses. Supabase's own rate limits blunt this, but the button shouldn't appear until we have a reason to think the account exists and is unconfirmed.

## Tier 3 — polish that changes conversion

**10. No password confirmation at signup, but there is one at reset.** Reversed from what matters: a typo at signup means the account is unrecoverable-feeling until they use forgot-password. Add either a confirm field or a show/hide toggle at signup (a reveal toggle is the lighter, more mobile-friendly option, and would help on the sign-in field too).

**11. Password rules are length-only.** No leaked-password check is enabled. Turning on the HIBP check costs nothing at signup and blocks the credentials most likely to be stuffed. Worth pairing with an inline strength hint rather than a post-submit toast.

**12. Errors are all bottom-corner toasts.** On a form, the error belongs under the field it concerns — especially "that doesn't look like an email" and the password-length rule, which today validate only on submit. Inline validation on blur plus a persistent form-level error would remove most of the retry loops.

**13. Stale copy on the forgot screen.** "Tap the link in the email to pick a new password, then come back here" — the link now lands on `/reset-password`, which finishes the job and sends them on. Should read as a completed handoff.

**14. No Google sign-in.** Email + password is the whole organizer path. For a "scheduling with friends" app, one-tap Google would remove the password from the equation for most organizers and eliminate the confirm-email step entirely. Worth considering as the primary button with email/password below it.

**15. Verify the custom auth email templates are actually installed.** `src/lib/email-templates/auth/*.html` exist in the repo, but nothing in the codebase applies them — if the backend is still sending default templates, the light-mode/table-layout work isn't reaching anyone's inbox. Confirm before doing more template work.

## Technical notes

- `storedGuestTokens()` scans all of `localStorage` for the `aih.token.` prefix on every `/auth` mount; fine at current volume, but it belongs next to the other helpers in `lib/guest-token.ts` rather than exported from a route file.
- `claimParticipants` correctly uses the admin client behind `requireSupabaseAuth` and only claims rows with a null `profile_id` — that logic is sound; the problem in item 2 is purely where it's called from.
- `auth.tsx` is 483 lines and five screens in one component. Splitting per mode (sign in / sign up / check email / forgot) once state moves to the URL would make each one testable in isolation and shrink what `/test` has to deep-link into.

## Suggested order

Items 1–3 are the ones users actually hit. Item 5 then makes items 4 and 7 straightforward. Items 6 and 8 are small correctness fixes. Everything in Tier 3 is independent — item 14 is the biggest single change to consider.
