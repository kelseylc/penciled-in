import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpWithEmail } from "@/lib/auth-signup";
import { safeRedirect } from "@/lib/auth-links";
import { claimParticipants } from "@/lib/claim.functions";
import { storedGuestTokens } from "@/lib/guest-token";

type Variant = "respondent" | "organizer";

const DISMISS_KEY = "penciled:upsell-dismissed";

/**
 * Soft, non-blocking account offer. Never a modal, never shown before the
 * response is saved, and never re-prompted once dismissed this session.
 *
 * Uses the same one-click email confirmation flow as the organizer sign-in
 * page — no codes to copy anywhere in the app.
 */
export function AccountUpsellCard({
  variant = "respondent",
  defaultName,
}: {
  variant?: Variant;
  /** The name they already gave as a guest, so their group still recognizes them. */
  defaultName?: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [existingAccount, setExistingAccount] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const here = useRouterState({ select: (s) => s.location.href });
  const backHere = safeRedirect(here);
  const claim = useServerFn(claimParticipants);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) setDismissed(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (dismissed) return null;

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  async function save() {
    const address = email.trim();
    if (!address || password.length < 8) return;
    setBusy(true);
    try {
      const outcome = await signUpWithEmail({
        email: address,
        password,
        ...(defaultName?.trim() ? { displayName: defaultName.trim() } : {}),
      });
      if (outcome.status === "already-registered") {
        setExistingAccount(true);
        return;
      }
      // No confirmation step for this project: there's no /auth round trip to
      // claim the answers, so do it here rather than promise an email that
      // will never arrive.
      if (outcome.status === "signed-in") {
        await claim({ data: { tokens: storedGuestTokens() } }).catch(() => void 0);
        setDone(true);
        return;
      }
      setSent(true);
      setCooldown(30);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send that email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-base font-bold">Want us to remember this?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Save your availability and we'll fill it in for you next time — most people are done in two
        taps after that. You'll also see everything you've been invited to in one place, instead of
        hunting for the link in your group chat.
      </p>

      {done ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold">You're all set</p>
          <p className="text-sm text-muted-foreground">
            Your answers are saved to this account. Next time we'll fill them in for you.
          </p>
        </div>
      ) : existingAccount ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold">You already have an account</p>
          <p className="text-sm text-muted-foreground">
            {email.trim()} is already registered. Sign in and we'll link this answer to it.
          </p>
          <Link
            to="/auth"
            search={{ ...(backHere ? { redirect: backHere } : {}) }}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground"
          >
            Sign in
          </Link>
        </div>
      ) : sent ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold">Confirm your email</p>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation email to {email.trim()}. Tap the button in it to activate your
            account.
          </p>
          <button
            type="button"
            disabled={cooldown > 0 || busy}
            onClick={save}
            className="min-h-11 w-full text-sm font-bold text-primary disabled:text-muted-foreground"
          >
            {cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend email"}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <Label htmlFor="upsell-email" className="sr-only">
            Email
          </Label>
          <Input
            id="upsell-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            className="h-12 text-base"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setExistingAccount(false);
            }}
          />
          <Label htmlFor="upsell-password" className="sr-only">
            Password
          </Label>
          <Input
            id="upsell-password"
            type="password"
            autoComplete="new-password"
            className="h-12 text-base"
            placeholder="Password (at least 8 characters)"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            className="h-12 w-full text-base font-bold"
            disabled={!email.trim() || password.length < 8 || busy}
            onClick={save}
          >
            {variant === "organizer" ? "Create my account" : "Save my availability"}
          </Button>
          <button
            type="button"
            onClick={dismiss}
            className="min-h-11 w-full text-sm font-semibold text-foreground underline underline-offset-4"
          >
            No thanks
          </button>
          <p className="text-xs text-muted-foreground">
            We'll email you one link to confirm it's you. That's the whole setup.
          </p>
        </div>
      )}
    </section>
  );
}
