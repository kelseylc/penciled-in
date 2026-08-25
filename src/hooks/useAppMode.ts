import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { asAppMode, MODE_STORAGE_KEY, type AppMode } from "@/lib/mode";

function readStored(): AppMode {
  if (typeof window === "undefined") return "campaign";
  try {
    return asAppMode(window.localStorage.getItem(MODE_STORAGE_KEY));
  } catch {
    return "campaign";
  }
}

/**
 * The global mode preference: which mode the app opens in, and what a newly
 * created group or project is stamped with. Persisted to the profile when
 * signed in, localStorage otherwise.
 *
 * This is deliberately *not* what a group or project page renders in — those
 * always render in their own stamped mode (see `src/lib/mode.ts`).
 */
export function useAppMode() {
  const { user } = useAuth();
  // Start on "plans" so server and first client render agree; the stored value
  // lands in an effect right after hydration.
  const [mode, setModeState] = useState<AppMode>("campaign");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setModeState(readStored());
    setHydrated(true);
  }, []);

  // A signed-in profile wins over whatever this device remembered.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("preferred_mode")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data?.preferred_mode) return;
        const next = asAppMode(data.preferred_mode);
        setModeState(next);
        try {
          window.localStorage.setItem(MODE_STORAGE_KEY, next);
        } catch {
          /* private mode */
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const setMode = useCallback(
    (next: AppMode) => {
      setModeState(next);
      try {
        window.localStorage.setItem(MODE_STORAGE_KEY, next);
      } catch {
        /* private mode */
      }
      if (user) {
        void supabase.from("profiles").update({ preferred_mode: next }).eq("id", user.id);
      }
    },
    [user],
  );

  return { mode, setMode, hydrated };
}
