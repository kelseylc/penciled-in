/**
 * Guest identity is the participant token — never an account.
 * Stored in localStorage AND a long-lived cookie, so clearing one storage
 * layer (or Safari's ITP eviction) still leaves a second chance.
 */

const MAX_AGE_SECONDS = 400 * 24 * 60 * 60; // browsers cap cookies near 400 days

function key(slug: string) {
  return `aih.token.${slug}`;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const target = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(target)) return decodeURIComponent(part.slice(target.length));
  }
  return null;
}

export function readGuestToken(slug: string): string | null {
  if (typeof window === "undefined") return null;
  let fromLocal: string | null = null;
  try {
    fromLocal = window.localStorage.getItem(key(slug));
  } catch {
    fromLocal = null;
  }
  const fromCookie = readCookie(key(slug));
  const token = fromLocal ?? fromCookie;
  // Heal whichever layer lost it.
  if (token) writeGuestToken(slug, token);
  return token;
}

export function writeGuestToken(slug: string, token: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(slug), token);
  } catch {
    /* storage blocked — the cookie is the fallback */
  }
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${encodeURIComponent(key(slug))}=${encodeURIComponent(
      token,
    )}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  } catch {
    /* cookies blocked — localStorage is the fallback */
  }
}
