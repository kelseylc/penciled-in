import { useEffect } from "react";

import { useAppMode } from "@/hooks/useAppMode";

/**
 * Paints the whole document in the active mode's palette (crimson for
 * Campaign, seafoam teal for Events) so the theme follows the user across
 * every page. Per-object scopes (.campaign-scope / .plans-scope) still win
 * locally because they set the same vars on a nested element.
 */
export function ModeThemeSync() {
  const { mode, hydrated } = useAppMode();

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.classList.toggle("mode-plans", mode === "plans");
    root.classList.toggle("mode-campaign", mode === "campaign");
  }, [mode, hydrated]);

  return null;
}
