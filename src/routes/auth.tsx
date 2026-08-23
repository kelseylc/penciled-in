import { AppBar } from "@/components/AppBar";
import { OtpInput } from "@/components/OtpInput";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { claimParticipants } from "@/lib/claim.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Organizer sign in — Penciled.in" },
      {
        name: "description",
        content:
          "Sign in with a 6-digit code. Responding to a plan never requires an account.",
      },
      { property: "og:title", content: "Organizer sign in — Penciled.in" },
      {
        property: "og:description",
        content: "Organizers sign in here. Everyone else: takes 30 seconds — no signup.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

/** Every guest token this browser has collected, so we can claim them on sign-in. */
export function storedGuestTokens(): string[] {
  const tokens: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith("aih.token.")) continue;
    const value = window.localStorage.getItem(key);
    if (value && /^[a-f0-9]{16,80}$/i.test(value)) tokens.push(value);
  }
  return tokens;
}

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const claim = useServerFn(claimParticipants);

  useEffect(() => {
    if (loading || !session) return;
    const tokens = storedGuestTokens();
    claim({ data: { tokens } })
      .then((r) => {
        if (r.claimed > 0) toast.success(`Linked ${r.claimed} of your past answers to this account`);
      })
      .catch(() => void 0)
      .finally(() => navigate({ to: "/home" }));
  }, [loading, session, navigate, claim]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(address: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
    setCooldown(30);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await sendCode(email.trim());
      setSent(true);
      setResetKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    try {
      await sendCode(email.trim());
      setResetKey((k) => k + 1);
      toast.success("New code sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't resend the code");
    }
  }

  async function verify(code: string) {
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: "email",
      });
      if (error) throw error;
      // The auth listener picks up the session and redirects to /home.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That code didn't work");
      setResetKey((k) => k + 1);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 pb-10 pt-2 text-base">
      <AppBar />
      <h1 className="text-3xl font-black tracking-tight">
        {sent ? "Enter your code" : "Just your email"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {sent
          ? `We sent a 6-digit code to ${email.trim()}. It expires in 10 minutes.`
          : "Organizers get a 6-digit code — no passwords, no links to chase. Responding to a plan never needs an account."}
      </p>

      {!sent && (
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              className="h-14 rounded-xl text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <Button type="submit" disabled={busy} className="h-14 w-full rounded-2xl text-base">
            {busy ? "Sending…" : "Send my code"}
          </Button>
        </form>
      )}

      {sent && (
        <div className="mt-8 space-y-5">
          <OtpInput onComplete={verify} disabled={verifying} resetKey={resetKey} />
          {verifying && <p className="text-center text-sm text-muted-foreground">Checking…</p>}
          <button
            type="button"
            onClick={resend}
            disabled={cooldown > 0}
            className="min-h-11 w-full text-sm font-bold text-primary disabled:text-muted-foreground"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
          <Button
            variant="secondary"
            className="h-14 w-full rounded-2xl text-base"
            onClick={() => setSent(false)}
          >
            Use a different email
          </Button>
        </div>
      )}
    </main>
  );
}
