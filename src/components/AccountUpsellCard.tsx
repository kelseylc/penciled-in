import { useEffect, useState } from "react";
import { toast } from "sonner";

import { OtpInput } from "@/components/OtpInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type Variant = "respondent" | "organizer";

const DISMISS_KEY = "penciled:upsell-dismissed";

/**
 * Soft, non-blocking account offer. Never a modal, never shown before the
 * response is saved, and never re-prompted once dismissed this session.
 */
export function AccountUpsellCard({ variant = "respondent" }: { variant?: Variant }) {
  const [dismissed, setDismissed] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

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

  if (dismissed || done) return null;

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
    if (!address) return;
    setBusy(true);
    try {
      if (variant === "organizer" && password) {
        const { error } = await supabase.auth.signUp({
          email: address,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        setSent(true);
        setCooldown(30);
        return;
      }
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setSent(true);
      setCooldown(30);
      setResetKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the code");
    } finally {
      setBusy(false);
    }
  }

  async function verify(code: string) {
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: "email",
      });
      if (error) throw error;
      toast.success("Saved — we'll fill this in for you next time.");
      setDone(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That code didn't work");
      setResetKey((k) => k + 1);
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

      {sent ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold">Enter the 6-digit code we emailed you.</p>
          <OtpInput onComplete={verify} resetKey={resetKey} />
          <button
            type="button"
            disabled={cooldown > 0}
            onClick={save}
            className="min-h-11 w-full text-sm font-bold text-primary disabled:text-muted-foreground"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
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
            onChange={(e) => setEmail(e.target.value)}
          />
          {variant === "organizer" && (
            <>
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
            </>
          )}
          <Button
            className="h-12 w-full text-base font-bold"
            disabled={!email.trim() || busy}
            onClick={save}
          >
            Save my availability
          </Button>
          <button
            type="button"
            onClick={dismiss}
            className="min-h-11 w-full text-sm font-semibold text-foreground underline underline-offset-4"
          >
            No thanks
          </button>
          <p className="text-xs text-muted-foreground">
            {variant === "organizer" && password
              ? "We'll email you a 6-digit code to confirm. Your password is saved for next time."
              : "We'll email you a 6-digit code. No password to make up."}
          </p>
        </div>
      )}
    </section>
  );
}
