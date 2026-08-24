import { AppBar } from "@/components/AppBar";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/FieldError";
import { PasswordField } from "@/components/PasswordField";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { claimParticipants } from "@/lib/claim.functions";
import { signUpWithEmail } from "@/lib/auth-signup";
import { storedGuestTokens } from "@/lib/guest-token";
import { readAuthErrorFromUrl, safeRedirect, type AuthLinkError } from "@/lib/auth-links";

/** The screens you can navigate to. Absent mode is the sign-in form. */
type ScreenParam = "signup" | "forgot";
type Screen = "login" | ScreenParam;
type Search = { mode?: ScreenParam; redirect?: string };

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
  // ?mode=signup|forgot is the screen; absent means sign in. Switching screens
  // navigates, so Back works and password managers see a new page.
  // ?redirect=/path is where sign-in returns you to; anything off-site is dropped.
  validateSearch: (search: Record<string, unknown>): Search => {
    const m = search["mode"];
    const dest = safeRedirect(search["redirect"]);
    return {
      ...(m === "signup" || m === "forgot" ? { mode: m } : {}),
      ...(dest ? { redirect: dest } : {}),
    };
  },
  component: AuthPage,
});

/** Email is the only login identifier. Names collide; phone needs SMS. */
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("That doesn't look like an email")
  .max(255);
const passwordSchema = z.string().min(8, "Passwords need at least 8 characters").max(200);
const displayNameSchema = z.string().trim().min(1, "Add a name your group will recognize").max(80);

/**
 * Captured at import time and consumed once: the Supabase client wipes the
 * error out of the URL the moment it initializes, which happens in an effect.
 */
let pendingLinkError = readAuthErrorFromUrl();

/**
 * "We sent it" is the consequence of an action, not a destination — it holds
 * the address we sent to, which a deep link could never supply.
 */
type Sent = { kind: "confirm" | "reset"; email: string };

const SENT_KEY = "penciled:auth-sent";
/** Long enough to check a phone, short enough not to greet a new visit. */
const SENT_TTL_MS = 30 * 60 * 1000;
const COOLDOWN_SECONDS = 30;

/**
 * The screen and its resend cooldown are remembered together. Remembering only
 * the screen would re-arm the button on every reload, and the answer to that is
 * Supabase's rate limiter rather than ours.
 */
function rememberSent(next: Sent | null, until = 0) {
  try {
    if (!next) sessionStorage.removeItem(SENT_KEY);
    else sessionStorage.setItem(SENT_KEY, JSON.stringify({ ...next, at: Date.now(), until }));
  } catch {
    /* storage blocked — the screen still works, it just won't survive a reload */
  }
}

function recallSent(): { sent: Sent; cooldown: number } | null {
  try {
    const raw = sessionStorage.getItem(SENT_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Sent> & { at?: number; until?: number };
    const fresh = typeof saved.at === "number" && Date.now() - saved.at < SENT_TTL_MS;
    if (!fresh || typeof saved.email !== "string") return null;
    if (saved.kind !== "confirm" && saved.kind !== "reset") return null;
    const left = typeof saved.until === "number" ? saved.until - Date.now() : 0;
    return {
      sent: { kind: saved.kind, email: saved.email },
      cooldown: Math.max(0, Math.ceil(left / 1000)),
    };
  } catch {
    return null;
  }
}

/**
 * Supabase answers a too-soon resend with its own wording ("For security
 * purposes, you can only request this after 47 seconds"). Say it the way the
 * rest of the screen speaks, and hand back the wait so the button can show it.
 */
function describeSendError(err: unknown): { message: string; retryAfter: number } {
  const raw = err instanceof Error ? err.message : "";
  const seconds = Number(/after (\d+) seconds?/i.exec(raw)?.[1] ?? 0);
  if (seconds > 0) {
    return {
      message: `Hang on — you can ask for another email in ${seconds}s.`,
      retryAfter: seconds,
    };
  }
  if (/rate limit|too many/i.test(raw)) {
    return { message: "That's a lot of emails. Give it a minute and try again.", retryAfter: 60 };
  }
  return { message: raw || "Couldn't send the email", retryAfter: 0 };
}

type FieldErrors = {
  displayName?: string;
  email?: string;
  password?: string;
  confirm?: string;
  form?: string;
};

function issueOf(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const claim = useServerFn(claimParticipants);

  const { mode: modeParam, redirect } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sent, setSent] = useState<Sent | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [unconfirmedHint, setUnconfirmedHint] = useState(false);
  const [existingAccount, setExistingAccount] = useState(false);
  const [linkError, setLinkError] = useState<AuthLinkError | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const screen: Screen = modeParam ?? "login";

  // Claim guest history and route onward once signed in.
  useEffect(() => {
    if (loading || !session) return;
    rememberSent(null);
    const tokens = storedGuestTokens();
    claim({ data: { tokens } })
      .then((r) => {
        if (r.claimed > 0)
          toast.success(`Linked ${r.claimed} of your past answers to this account`);
      })
      .catch(() => void 0)
      .finally(() => navigate({ href: redirect ?? "/home", replace: true }));
  }, [loading, session, navigate, claim, redirect]);

  // Surfaced from a state the server never rendered, so hydration still matches.
  useEffect(() => {
    if (!pendingLinkError) return;
    setLinkError(pendingLinkError);
    pendingLinkError = null;
  }, []);

  useEffect(() => {
    const remembered = recallSent();
    if (!remembered) return;
    setSent(remembered.sent);
    setCooldown(remembered.cooldown);
  }, []);

  // A Back that changes the screen should drop the "we sent it" state with it,
  // but not on the first pass, which would undo the restore above.
  const firstScreen = useRef(true);
  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    setSent(null);
    rememberSent(null);
    setErrors({});
  }, [modeParam]);

  // Moving between screens is a new screen, so say so — the heading changes but
  // focus would otherwise sit where it was.
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [screen, sent]);

  useEffect(() => {
    if (sent) return;
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    (screen === "signup" ? nameRef : emailRef).current?.focus();
  }, [screen, sent]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /** Starts the resend wait and records it, so a reload can't re-arm the button. */
  function startCooldown(next: Sent, seconds = COOLDOWN_SECONDS) {
    setCooldown(seconds);
    rememberSent(next, Date.now() + seconds * 1000);
  }

  /** Switching screens is a navigation, so Back returns to the previous one. */
  function goTo(next: Screen) {
    setPassword("");
    setConfirm("");
    setSent(null);
    rememberSent(null);
    setErrors({});
    setUnconfirmedHint(false);
    setExistingAccount(false);
    setLinkError(null);
    navigate({
      to: "/auth",
      search: (prev: Search) => ({
        ...(prev.redirect ? { redirect: prev.redirect } : {}),
        ...(next === "login" ? {} : { mode: next }),
      }),
    });
  }

  /** Editing a field retires the complaint about it and the last attempt. */
  function edit(key: "displayName" | "email" | "password" | "confirm", value: string) {
    if (key === "displayName") setDisplayName(value);
    if (key === "email") setEmail(value);
    if (key === "password") setPassword(value);
    if (key === "confirm") setConfirm(value);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      delete next.form;
      return next;
    });
    setUnconfirmedHint(false);
    setExistingAccount(false);
    setLinkError(null);
  }

  function focusFirst(found: FieldErrors) {
    if (found.displayName) nameRef.current?.focus();
    else if (found.email) emailRef.current?.focus();
    else if (found.password) passwordRef.current?.focus();
    else if (found.confirm) confirmRef.current?.focus();
  }

  /** Every problem at once, rather than one per submit. */
  function checkEmail(): string | null {
    const parsed = emailSchema.safeParse(email);
    if (parsed.success) return parsed.data;
    const found = { email: issueOf(parsed.error, "Check your email") };
    setErrors(found);
    focusFirst(found);
    return null;
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success || !password) {
      const found: FieldErrors = {
        ...(parsed.success ? {} : { email: issueOf(parsed.error, "Check your email") }),
        ...(password ? {} : { password: "Enter your password" }),
      };
      setErrors(found);
      focusFirst(found);
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data,
        password,
      });
      if (error) throw error;
      // Deliberately still busy: the session listener claims guest answers and
      // navigates, and freeing the button first invites a second submit into
      // the gap.
    } catch (err) {
      // Supabase masks "email not confirmed" as invalid credentials so accounts
      // can't be enumerated. Offer the confirmation path instead of dead-ending.
      const message = err instanceof Error ? err.message : "";
      if (/invalid login credentials/i.test(message)) {
        setUnconfirmedHint(true);
        setErrors({
          form: "That email and password didn't match — or the email is still unconfirmed.",
        });
      } else {
        setErrors({ form: message || "Couldn't sign you in" });
      }
      setBusy(false);
    }
  }

  async function submitSignup(e: React.FormEvent) {
    e.preventDefault();
    const name = displayNameSchema.safeParse(displayName);
    const parsed = emailSchema.safeParse(email);
    const pw = passwordSchema.safeParse(password);
    const mismatch = pw.success && password !== confirm;
    if (!name.success || !parsed.success || !pw.success || mismatch) {
      const found: FieldErrors = {
        ...(name.success ? {} : { displayName: issueOf(name.error, "Add a name") }),
        ...(parsed.success ? {} : { email: issueOf(parsed.error, "Check your email") }),
        ...(pw.success ? {} : { password: issueOf(pw.error, "Check your password") }),
        ...(mismatch ? { confirm: "Those passwords don't match" } : {}),
      };
      setErrors(found);
      focusFirst(found);
      return;
    }

    setBusy(true);
    try {
      const outcome = await signUpWithEmail({
        email: parsed.data,
        password: pw.data,
        displayName: name.data,
      });
      // Signed in already: the listener navigates, so stay busy through it.
      if (outcome.status === "signed-in") return;
      if (outcome.status === "already-registered") {
        setExistingAccount(true);
        setBusy(false);
        return;
      }
      const next: Sent = { kind: "confirm", email: parsed.data };
      setSent(next);
      startCooldown(next);
      setBusy(false);
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Couldn't create your account" });
      setBusy(false);
    }
  }

  /** Sends the recovery link from the forgot-password form, then confirms it went. */
  async function submitPasswordReset(e: React.FormEvent) {
    e.preventDefault();
    const address = checkEmail();
    if (!address) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      const next: Sent = { kind: "reset", email: address };
      setSent(next);
      startCooldown(next);
    } catch (err) {
      const { message, retryAfter } = describeSendError(err);
      setErrors({ form: message });
      if (retryAfter > 0) setCooldown(retryAfter);
    } finally {
      setBusy(false);
    }
  }

  /** Re-sends the signup confirmation link. */
  async function resendConfirmation(address: string) {
    if (cooldown > 0) return;
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: address,
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      });
      if (error) throw error;
      if (sent) startCooldown(sent);
      else setCooldown(COOLDOWN_SECONDS);
      toast.success("Confirmation email sent again");
    } catch (err) {
      const { message, retryAfter } = describeSendError(err);
      toast.error(message);
      if (retryAfter > 0) setCooldown(retryAfter);
    }
  }

  async function resendReset(address: string) {
    if (cooldown > 0) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      if (sent) startCooldown(sent);
      else setCooldown(COOLDOWN_SECONDS);
      toast.success("Reset email sent again");
    } catch (err) {
      const { message, retryAfter } = describeSendError(err);
      toast.error(message);
      if (retryAfter > 0) setCooldown(retryAfter);
    }
  }

  const heading = sent
    ? sent.kind === "reset"
      ? "Check your email"
      : "Confirm your email"
    : screen === "forgot"
      ? "Reset your password"
      : screen === "signup"
        ? "Create your organizer account"
        : "Welcome back";

  const sub = sent
    ? sent.kind === "reset"
      ? `We sent a password reset link to ${sent.email}. Tap it to choose a new password.`
      : `We sent a confirmation email to ${sent.email}. Tap the button in it to activate your account.`
    : screen === "forgot"
      ? "Enter the email you signed up with and we'll send you a link to pick a new password."
      : screen === "signup"
        ? "Organizers need an account. Responding to a plan never does."
        : "Sign in to see your plans. Responding to a plan never needs an account.";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 pb-10 pt-2 text-base">
      <AppBar />
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-3xl font-black tracking-tight outline-none"
      >
        {heading}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{sub}</p>

      {linkError && (
        <div
          role="alert"
          className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <p className="font-bold text-destructive">That link didn't work</p>
          <p className="mt-1 text-muted-foreground">{linkError.message}</p>
        </div>
      )}

      {existingAccount && screen === "signup" && !sent && (
        <div role="alert" className="mt-6 rounded-2xl bg-card p-4 text-sm text-muted-foreground">
          <p>{email.trim()} already has an account — no new one was created.</p>
          <div className="mt-1 flex flex-col">
            <button
              type="button"
              onClick={() => goTo("login")}
              className="min-h-11 text-left text-sm font-bold text-primary"
            >
              Sign in instead
            </button>
            <button
              type="button"
              onClick={() => goTo("forgot")}
              className="min-h-11 text-left text-sm font-bold text-primary"
            >
              Reset my password
            </button>
          </div>
        </div>
      )}

      {sent && (
        <div className="mt-8 space-y-5">
          <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground">
            {sent.kind === "reset"
              ? "Tap the link in the email to pick a new password, then come back here."
              : "One tap and you're done. If it's not there in a minute, check spam."}
          </p>
          <button
            type="button"
            onClick={() =>
              sent.kind === "reset" ? resendReset(sent.email) : resendConfirmation(sent.email)
            }
            disabled={cooldown > 0}
            className="min-h-11 w-full text-sm font-bold text-primary disabled:text-muted-foreground"
          >
            {cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend email"}
          </button>
          <Button
            variant="secondary"
            className="h-14 w-full rounded-2xl text-base"
            onClick={() => goTo("login")}
          >
            Back to sign in
          </Button>
        </div>
      )}

      {!sent && screen === "login" && (
        <form onSubmit={submitLogin} noValidate className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              ref={emailRef}
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              className="h-14 rounded-xl text-base"
              value={email}
              onChange={(e) => edit("email", e.target.value)}
              placeholder="you@example.com"
            />
            <FieldError id="email-error" message={errors.email} />
          </div>
          <PasswordField
            id="password"
            label="Password"
            inputRef={passwordRef}
            autoComplete="current-password"
            value={password}
            onChange={(v) => edit("password", v)}
            error={errors.password}
          />

          <FieldError id="login-error" message={errors.form} />

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
                onClick={() => {
                  const address = checkEmail();
                  if (address) void resendConfirmation(address);
                }}
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
              onClick={() => goTo("forgot")}
              className="min-h-11 text-sm text-muted-foreground underline underline-offset-4"
            >
              Forgot your password?
            </button>
            <button
              type="button"
              onClick={() => goTo("signup")}
              className="min-h-11 text-sm text-muted-foreground underline underline-offset-4"
            >
              New here? Create an account
            </button>
          </div>
        </form>
      )}

      {!sent && screen === "signup" && (
        <form onSubmit={submitSignup} noValidate className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="display-name">Your name</Label>
            <Input
              id="display-name"
              ref={nameRef}
              type="text"
              required
              autoComplete="name"
              maxLength={80}
              aria-invalid={!!errors.displayName}
              aria-describedby={errors.displayName ? "display-name-error" : undefined}
              className="h-14 rounded-xl text-base"
              value={displayName}
              onChange={(e) => edit("displayName", e.target.value)}
              placeholder="What your group calls you"
            />
            <FieldError id="display-name-error" message={errors.displayName} />
            <p className="text-xs text-muted-foreground">
              This is what your group sees. You can change it any time — it's never your login.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-email">Email</Label>
            <Input
              id="signup-email"
              ref={emailRef}
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "signup-email-error" : undefined}
              className="h-14 rounded-xl text-base"
              value={email}
              onChange={(e) => edit("email", e.target.value)}
              placeholder="you@example.com"
            />
            <FieldError id="signup-email-error" message={errors.email} />
          </div>
          <PasswordField
            id="signup-password"
            label="Password"
            inputRef={passwordRef}
            autoComplete="new-password"
            value={password}
            onChange={(v) => edit("password", v)}
            error={errors.password}
          />
          <PasswordField
            id="signup-confirm"
            label="Confirm password"
            inputRef={confirmRef}
            autoComplete="new-password"
            placeholder="Type it again"
            value={confirm}
            onChange={(v) => edit("confirm", v)}
            error={errors.confirm}
          />

          <FieldError id="signup-error" message={errors.form} />

          <Button type="submit" disabled={busy} className="h-14 w-full rounded-2xl text-base">
            {busy ? "Creating…" : "Create account"}
          </Button>
          <button
            type="button"
            onClick={() => goTo("login")}
            className="min-h-11 w-full text-sm text-muted-foreground underline underline-offset-4"
          >
            Already have an account? Sign in
          </button>
        </form>
      )}

      {!sent && screen === "forgot" && (
        <form onSubmit={submitPasswordReset} noValidate className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              ref={emailRef}
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "forgot-email-error" : undefined}
              className="h-14 rounded-xl text-base"
              value={email}
              onChange={(e) => edit("email", e.target.value)}
              placeholder="you@example.com"
            />
            <FieldError id="forgot-email-error" message={errors.email} />
          </div>

          <FieldError id="forgot-error" message={errors.form} />

          <Button type="submit" disabled={busy} className="h-14 w-full rounded-2xl text-base">
            {busy ? "Sending…" : "Send reset link"}
          </Button>
          <button
            type="button"
            onClick={() => goTo("login")}
            className="min-h-11 w-full text-sm text-muted-foreground underline underline-offset-4"
          >
            Back to sign in
          </button>
        </form>
      )}
    </main>
  );
}
