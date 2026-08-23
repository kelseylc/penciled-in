import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";

import { useAuth } from "@/hooks/useAuth";
import { safeRedirect } from "@/lib/auth-links";

/**
 * The single answer to "this page needs an account". Three routes each had
 * their own — an inline link, a full styled page, and a silent redirect — so
 * the same situation looked like three different products.
 *
 * Sends them to sign in carrying where they were, and replaces rather than
 * pushes so Back leaves instead of bouncing off the guard again.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const here = useRouterState({ select: (s) => s.location.href });
  // Where they were when the guard first ran. Read once: this component is
  // still mounted while the redirect commits, and by then the location is
  // /auth?redirect=… — which safeRedirect rightly refuses, so re-reading it
  // would send them on a second time with the destination stripped.
  const from = useRef(here);
  const redirected = useRef(false);

  useEffect(() => {
    if (loading || session || redirected.current) return;
    redirected.current = true;
    const back = safeRedirect(from.current);
    navigate({
      to: "/auth",
      search: { ...(back ? { redirect: back } : {}) },
      replace: true,
    });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <main className="mx-auto w-full max-w-md px-5 py-8 text-muted-foreground">One sec…</main>
    );
  }
  return <>{children}</>;
}
