import { AppBar } from "@/components/AppBar";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/FieldError";
import { PasswordField } from "@/components/PasswordField";
import { supabase } from "@/integrations/supabase/client";
import { readAuthErrorFromUrl, urlHasRecoveryGrant, type AuthLinkError } from "@/lib/auth-links";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — Party.up" },
      {
        name: "description",
        content: "Choose a new password for your Party.up organizer account.",
      },
      { property: "og:title", content: "Set a new password — Party.up" },
      {
        property: "og:description",
        content: "Finish resetting your Party.up organizer password.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

const passwordSchema = z.string().min(8, "Passwords need at least 8 characters").max(200);

/**
 * Both are read at import time, before the Supabase client boots and scrubs the
 * URL. `pendingLinkError` is consumed once so it can't resurface on a later
 * client-side visit.
 */
const arrivedFromRecoveryEmail = urlHasRecoveryGrant();
let pendingLinkError = readAuthErrorFromUrl();

/** How long to wait for the link's session before calling it dead. */
const LINK_GRACE_MS = 4000;

/**
 * "verify" is the important one: a plain signed-in session is not permission to
 * change the password. Only a recovery link — or the current password — is.
 */
type Gate = "checking" | "verify" | "ready" | "invalid";

type FieldErrors = { current?: string; password?: string; confirm?: string; form?: string };

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<Gate>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<AuthLinkError | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const decided = useRef(false);
  const currentRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  /** Editing a field retires the complaint about it. */
  function edit(key: "current" | "password" | "confirm", value: string) {
    if (key === "current") setCurrentPassword(value);
    if (key === "password") setPassword(value);
    if (key === "confirm") setConfirm(value);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      delete next.form;
      return next;
    });
  }

  // Work out what this visit is allowed to do. We never auto-navigate away:
  // this screen exists to collect the new password.
  useEffect(() => {
    if (pendingLinkError) {
      setLinkError(pendingLinkError);
      pendingLinkError = null;
      setGate("invalid");
      decided.current = true;
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The URL marker is set before any listener can miss the event.
    let sawRecovery = arrivedFromRecoveryEmail;

    function settle(session: { user: { email?: string } } | null) {
      if (!active || decided.current || !session) return;
      decided.current = true;
      setEmail(session.user.email ?? null);
      setGate(sawRecovery ? "ready" : "verify");
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // A recovery event is proof on its own, and it can land after we've
      // already settled on "verify" from a pre-existing session.
      if (event === "PASSWORD_RECOVERY") {
        sawRecovery = true;
        if (!active) return;
        decided.current = true;
        if (session) setEmail(session.user.email ?? null);
        setGate("ready");
        return;
      }
      settle(session);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) settle(data.session);
      // No session yet: the link may still be exchanging. Give it a moment
      // before declaring it dead, and let a late session win.
      else
        timer = setTimeout(
          () => active && setGate((g) => (g === "checking" ? "invalid" : g)),
          LINK_GRACE_MS,
        );
    });

    return () => {
      active = false;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  /** Signed in but no recovery link: prove it's you before changing the password. */
  async function confirmIdentity(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    if (!currentPassword) {
      setErrors({ current: "Enter your current password" });
      currentRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (error) throw error;
      setCurrentPassword("");
      setErrors({});
      setGate("ready");
    } catch {
      setErrors({ current: "That password didn't match" });
      currentRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const pw = passwordSchema.safeParse(password);
    const mismatch = password !== confirm;
    if (!pw.success || mismatch) {
      setErrors({
        ...(pw.success ? {} : { password: pw.error.issues[0]?.message ?? "Check your password" }),
        ...(mismatch ? { confirm: "Those passwords don't match" } : {}),
      });
      if (!pw.success) passwordRef.current?.focus();
      else confirmRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw.data });
      if (error) throw error;
      toast.success("Password updated");
      // Deliberately still busy: navigation is next, and freeing the button
      // first invites a second submit into the gap.
      navigate({ to: "/home" });
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Couldn't update your password" });
      setBusy(false);
    }
  }

  const sub =
    gate === "verify"
      ? `You're signed in as ${email ?? "this account"}. Confirm your current password first.`
      : "At least 8 characters. No symbol gymnastics required.";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 pb-10 pt-2 text-base">
      <AppBar />
      <h1 className="text-3xl font-black tracking-tight">Set a new password</h1>
      <p className="mt-2 text-sm text-muted-foreground">{sub}</p>

      {gate === "invalid" && (
        <div role="alert" className="mt-8 rounded-2xl bg-card p-5 text-sm text-muted-foreground">
          <p>{linkError?.message ?? "This reset link is expired or already used."}</p>
          <Button
            className="mt-4 h-14 w-full rounded-2xl text-base"
            onClick={() => navigate({ to: "/auth", search: { mode: "forgot" } })}
          >
            Request a new link
          </Button>
        </div>
      )}

      {gate === "verify" && (
        <form onSubmit={confirmIdentity} noValidate className="mt-8 space-y-4">
          <PasswordField
            id="current-password"
            label="Current password"
            inputRef={currentRef}
            autoComplete="current-password"
            placeholder="The one you use today"
            value={currentPassword}
            onChange={(v) => edit("current", v)}
            error={errors.current}
          />
          <Button type="submit" disabled={busy} className="h-14 w-full rounded-2xl text-base">
            {busy ? "Checking…" : "Continue"}
          </Button>
          <button
            type="button"
            onClick={() => navigate({ to: "/auth", search: { mode: "forgot" } })}
            className="min-h-11 w-full text-sm text-muted-foreground underline underline-offset-4"
          >
            Don't remember it? Email me a reset link
          </button>
        </form>
      )}

      {(gate === "checking" || gate === "ready") && (
        <form onSubmit={submit} noValidate className="mt-8 space-y-4">
          <PasswordField
            id="new-password"
            label="New password"
            inputRef={passwordRef}
            autoComplete="new-password"
            value={password}
            onChange={(v) => edit("password", v)}
            error={errors.password}
          />
          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            inputRef={confirmRef}
            autoComplete="new-password"
            placeholder="Type it again"
            value={confirm}
            onChange={(v) => edit("confirm", v)}
            error={errors.confirm}
          />

          <FieldError id="reset-error" message={errors.form} />

          <Button
            type="submit"
            disabled={busy || gate !== "ready"}
            className="h-14 w-full rounded-2xl text-base"
          >
            {busy ? "Saving…" : gate === "ready" ? "Save new password" : "Checking your link…"}
          </Button>
        </form>
      )}
    </main>
  );
}
