import { AppBar } from "@/components/AppBar";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

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
          "Sign in with your email and password. Responding to a plan never requires an account.",
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
  // ?mode=signup|forgot deep-links a specific screen (used by /test auditing).
  validateSearch: (search: Record<string, unknown>): { mode?: "signup" | "forgot" } => {
    const m = search["mode"];
    return m === "signup" || m === "forgot" ? { mode: m } : {};
  },
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

/** Email is the only login identifier. Names collide; phone needs SMS. */
const emailSchema = z.string().trim().email("That doesn't look like an email").max(255);
const passwordSchema = z.string().min(8, "Passwords need at least 8 characters").max(200);
const displayNameSchema = z.string().trim().min(1, "Add a name your group will recognize").max(80);

type Mode = "login" | "signup" | "forgot" | "reset" | "verify-email";

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const claim = useServerFn(claimParticipants);

  const { mode: modeParam } = Route.useSearch() as { mode?: Mode };
  const [mode, setMode] = useState<Mode>(modeParam ?? "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [settingPassword, setSettingPassword] = useState(false);
  const [unconfirmedHint, setUnconfirmedHint] = useState(false);

  // Claim guest history and route onward once signed in — unless we're mid
  // password reset, in which case stay on the reset form.
  useEffect(() => {
    if (loading || !session || settingPassword) return;
    const tokens = storedGuestTokens();
    claim({ data: { tokens } })
      .then((r) => {
        if (r.claimed > 0) toast.success(`Linked ${r.claimed} of your past answers to this account`);
      })
      .catch(() => void 0)
      .finally(() => navigate({ to: "/home" }));
  }, [loading, session, navigate, claim, settingPassword]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Supabase fires PASSWORD_RECOVERY when the user lands back here after
  // tapping the "reset password" link in their email. Show the reset form.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setSettingPassword(true);
        setMode("reset");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  function parseEmail(): string | null {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your email");
      return null;
    }
    return parsed.data;
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    const address = parseEmail();
    if (!address) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: address, password });
      if (error) throw error;
      // The session listener redirects to /home.
    } catch (err) {
      // Supabase masks "email not confirmed" as invalid credentials so accounts
      // can't be enumerated. Offer the confirmation path instead of dead-ending.
      const message = err instanceof Error ? err.message : "";
      if (/invalid login credentials/i.test(message)) {
        setUnconfirmedHint(true);
        toast.error("That email and password didn't match — or the email is still unconfirmed.");
      } else {
        toast.error(message || "Couldn't sign you in");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitSignup(e: React.FormEvent) {
    e.preventDefault();
    const address = parseEmail();
    if (!address) return;
    const name = displayNameSchema.safeParse(displayName);
    if (!name.success) {
      toast.error(name.error.issues[0]!.message);
      return;
    }
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) {
      toast.error(pw.error.issues[0]!.message);
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: address,
        password: pw.data,
        options: {
          data: { display_name: name.data },
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });
      if (error) throw error;
      if (data.session) return; // Auto-confirm on: the listener takes it from here.
      setCooldown(30);
      setMode("verify-email");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create your account");
    } finally {
      setBusy(false);
    }
  }

  async function startPasswordReset() {
    const address = parseEmail();
    if (!address) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      setCooldown(30);
      setMode("forgot");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the email");
    } finally {
      setBusy(false);
    }
  }

  /** Re-sends the signup confirmation link. */
  async function resendConfirmation() {
    if (cooldown > 0) return;
    const address = parseEmail();
    if (!address) return;
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: address,
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      });
      if (error) throw error;
      setCooldown(30);
      toast.success("Confirmation email sent again");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't resend the email");
    }
  }

  async function resendReset() {
    if (cooldown > 0) return;
    const address = parseEmail();
    if (!address) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      setCooldown(30);
      toast.success("Reset email sent again");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't resend the email");
    }
  }

  async function submitNewPassword(e: React.FormEvent) {
    e.preventDefault();
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) {
      toast.error(pw.error.issues[0]!.message);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw.data });
      if (error) throw error;
      toast.success("Password updated");
      setSettingPassword(false); // Releases the redirect to /home.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update your password");
    } finally {
      setBusy(false);
    }
  }

  function backToLogin() {
    setMode("login");
    setSettingPassword(false);
    setPassword("");
  }

  const heading =
    mode === "forgot"
      ? "Check your email"
      : mode === "verify-email"
        ? "Confirm your email"
        : mode === "reset"
          ? "Set a new password"
          : mode === "signup"
            ? "Create your organizer account"
            : "Welcome back";

  const sub =
    mode === "forgot"
      ? `We sent a password reset link to ${email.trim()}. Tap it to choose a new password.`
      : mode === "verify-email"
        ? `We sent a confirmation email to ${email.trim()}. Tap the button in it to activate your account.`
        : mode === "reset"
          ? "At least 8 characters. No symbol gymnastics required."
          : mode === "signup"
            ? "Organizers need an account. Responding to a plan never does."
            : "Sign in to see your plans. Responding to a plan never needs an account.";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 pb-10 pt-2 text-base">
      <AppBar />
      <h1 className="text-3xl font-black tracking-tight">{heading}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{sub}</p>

      {mode === "login" && (
        <form onSubmit={submitLogin} className="mt-8 space-y-4">
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
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              className="h-14 rounded-xl text-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <Button type="submit" disabled={busy} className="h-14 w-full rounded-2xl text-base">
            {busy ? "Signing in…" : "Sign in"}
          </Button>

          {unconfirmedHint && (
            <div className="rounded-2xl bg-card p-4 text-sm text-muted-foreground">
              <p>
                If you just created this account, tap the confirmation link we emailed you first —
                unconfirmed accounts can't sign in yet.
              </p>
              <button
                type="button"
                onClick={resendConfirmation}
                disabled={cooldown > 0}
                className="mt-2 min-h-11 text-sm font-bold text-primary disabled:text-muted-foreground"
              >
                {cooldown > 0 ? `Resend link in ${cooldown}s` : "Resend confirmation link"}
              </button>
            </div>
          )}

          <div className="flex flex-col gap-1 pt-2">
            <button
              type="button"
              onClick={startPasswordReset}
              className="min-h-11 text-sm text-muted-foreground underline underline-offset-4"
            >
              Forgot your password?
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setPassword("");
              }}
              className="min-h-11 text-sm text-muted-foreground underline underline-offset-4"
            >
              New here? Create an account
            </button>
          </div>
        </form>
      )}

      {mode === "signup" && (
        <form onSubmit={submitSignup} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="display-name">Your name</Label>
            <Input
              id="display-name"
              type="text"
              required
              autoComplete="name"
              maxLength={80}
              className="h-14 rounded-xl text-base"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="What your group calls you"
            />
            <p className="text-xs text-muted-foreground">
              This is what your group sees. You can change it any time — it's never your login.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-email">Email</Label>
            <Input
              id="signup-email"
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
          <div className="space-y-2">
            <Label htmlFor="signup-password">Password</Label>
            <Input
              id="signup-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="h-14 rounded-xl text-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <Button type="submit" disabled={busy} className="h-14 w-full rounded-2xl text-base">
            {busy ? "Creating…" : "Create account"}
          </Button>
          <button
            type="button"
            onClick={backToLogin}
            className="min-h-11 w-full text-sm text-muted-foreground underline underline-offset-4"
          >
            Already have an account? Sign in
          </button>
        </form>
      )}

      {mode === "verify-email" && (
        <div className="mt-8 space-y-5">
          <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground">
            One tap and you're done. If it's not there in a minute, check spam.
          </p>
          <button
            type="button"
            onClick={resendConfirmation}
            disabled={cooldown > 0}
            className="min-h-11 w-full text-sm font-bold text-primary disabled:text-muted-foreground"
          >
            {cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend confirmation email"}
          </button>
          <Button
            variant="secondary"
            className="h-14 w-full rounded-2xl text-base"
            onClick={backToLogin}
          >
            Back to sign in
          </Button>
        </div>
      )}

      {mode === "forgot" && (
        <div className="mt-8 space-y-5">
          <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground">
            Tap the link in the email to pick a new password, then come back here.
          </p>
          <button
            type="button"
            onClick={resendReset}
            disabled={cooldown > 0}
            className="min-h-11 w-full text-sm font-bold text-primary disabled:text-muted-foreground"
          >
            {cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend reset email"}
          </button>
          <Button
            variant="secondary"
            className="h-14 w-full rounded-2xl text-base"
            onClick={backToLogin}
          >
            Back to sign in
          </Button>
        </div>
      )}

      {mode === "reset" && (
        <form onSubmit={submitNewPassword} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="h-14 rounded-xl text-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <Button type="submit" disabled={busy} className="h-14 w-full rounded-2xl text-base">
            {busy ? "Saving…" : "Save password"}
          </Button>
        </form>
      )}
    </main>
  );
}
