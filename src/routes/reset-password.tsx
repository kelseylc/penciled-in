import { AppBar } from "@/components/AppBar";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — Penciled.in" },
      {
        name: "description",
        content: "Choose a new password for your Penciled.in organizer account.",
      },
      { property: "og:title", content: "Set a new password — Penciled.in" },
      {
        property: "og:description",
        content: "Finish resetting your Penciled.in organizer password.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

const passwordSchema = z.string().min(8, "Passwords need at least 8 characters").max(200);

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);

  // The recovery link lands here with a session (or a hash Supabase exchanges
  // into one). We never auto-navigate away: this screen exists to collect the
  // new password.
  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session) {
        setReady(true);
        setExpired(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) setReady(true);
      else setTimeout(() => active && setExpired((e) => (ready ? e : true)), 1500);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) {
      toast.error(pw.error.issues[0]!.message);
      return;
    }
    if (password !== confirm) {
      toast.error("Those passwords don't match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw.data });
      if (error) throw error;
      toast.success("Password updated");
      navigate({ to: "/home" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update your password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 pb-10 pt-2 text-base">
      <AppBar />
      <h1 className="text-3xl font-black tracking-tight">Set a new password</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        At least 8 characters. No symbol gymnastics required.
      </p>

      {!ready && expired ? (
        <div className="mt-8 rounded-2xl bg-card p-5 text-sm text-muted-foreground">
          <p>This reset link is expired or already used. Request a fresh one and try again.</p>
          <Button
            className="mt-4 h-14 w-full rounded-2xl text-base"
            onClick={() => navigate({ to: "/auth", search: { mode: "forgot" } })}
          >
            Request a new link
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              required
              autoComplete="new-password"
              className="h-14 rounded-xl text-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              required
              autoComplete="new-password"
              className="h-14 rounded-xl text-base"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type it again"
            />
          </div>
          <Button
            type="submit"
            disabled={busy || !ready}
            className="h-14 w-full rounded-2xl text-base"
          >
            {busy ? "Saving…" : ready ? "Save new password" : "Checking your link…"}
          </Button>
        </form>
      )}
    </main>
  );
}
