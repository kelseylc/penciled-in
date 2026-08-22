import { AppBar } from "@/components/AppBar";
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
          "Magic-link sign in for organizers. Responding to a plan never requires an account.",
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/home` },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 pb-10 pt-2 text-base">
      <AppBar />
      <h1 className="text-3xl font-black tracking-tight">
        {sent ? "Check your email" : "Just your email"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {sent
          ? "We sent you a magic link. No password to forget, because you have enough to remember."
          : "Organizers get a magic link — no passwords. Responding to a plan never needs an account."}
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
            {busy ? "Sending…" : "Send my magic link"}
          </Button>
        </form>
      )}

      {sent && (
        <Button
          variant="secondary"
          className="mt-8 h-14 w-full rounded-2xl text-base"
          onClick={() => setSent(false)}
        >
          Use a different email
        </Button>
      )}
    </main>
  );
}
