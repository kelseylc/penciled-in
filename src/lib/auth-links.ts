/**
 * Readers for the URLs Supabase redirects back to after an emailed auth link.
 *
 * These have to run before the Supabase client boots: it scrubs its own params
 * out of the URL as soon as it initializes, so the auth routes snapshot these
 * at module scope rather than reading them from an effect.
 */

export type AuthLinkError = { code: string; message: string };

const ERROR_KEYS = ["error", "error_code", "error_description"] as const;

/** Paths we never bounce back to after sign-in, because they'd loop. */
const NEVER_RETURN_TO = ["/auth", "/reset-password"];

function hashParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

function describe(code: string, description: string | null): string {
  if (code === "otp_expired")
    return "That link has expired. Ask for a fresh one and we'll send it right over.";
  if (code === "access_denied")
    return "That link was already used, or it's no longer valid. Ask for a fresh one.";
  // Supabase form-encodes the description, so plus signs stand in for spaces.
  return description?.replace(/\+/g, " ") || "That link didn't work. Ask for a fresh one.";
}

/**
 * Reads the `error` / `error_code` params Supabase sends back when a
 * confirmation or recovery link is expired or already spent, then strips them
 * so a refresh doesn't resurrect the message.
 */
export function readAuthErrorFromUrl(): AuthLinkError | null {
  if (typeof window === "undefined") return null;

  const hash = hashParams();
  const search = new URLSearchParams(window.location.search);
  const read = (key: string) => hash.get(key) ?? search.get(key);

  const error = read("error");
  const code = read("error_code");
  if (!error && !code) return null;

  const message = describe(code ?? error ?? "", read("error_description"));

  for (const key of ERROR_KEYS) {
    hash.delete(key);
    search.delete(key);
  }
  const nextSearch = search.toString();
  const nextHash = hash.toString();
  window.history.replaceState(
    null,
    "",
    window.location.pathname +
      (nextSearch ? `?${nextSearch}` : "") +
      (nextHash ? `#${nextHash}` : ""),
  );

  return { code: code ?? error ?? "unknown", message };
}

/**
 * True when this document was opened from a password-recovery email. The
 * implicit flow marks the hash `type=recovery`; PKCE sends only `?code=`, which
 * on the reset route can only be a recovery grant — signup confirmations land
 * on /auth instead.
 */
export function urlHasRecoveryGrant(): boolean {
  if (typeof window === "undefined") return false;
  const search = new URLSearchParams(window.location.search);
  if (hashParams().get("type") === "recovery" || search.get("type") === "recovery") return true;
  return search.has("code");
}

/**
 * Only same-origin app paths survive, so `?redirect=` can't be aimed at another
 * site. Rejects protocol-relative ("//evil.example") and backslash variants.
 */
export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const path = value.trim();
  if (path.length > 512 || !path.startsWith("/")) return undefined;
  if (path.startsWith("//") || path.startsWith("/\\")) return undefined;
  if (
    NEVER_RETURN_TO.some((p) => path === p || path.startsWith(`${p}?`) || path.startsWith(`${p}/`))
  )
    return undefined;
  return path;
}
