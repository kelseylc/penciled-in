import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

const DISMISS_KEY = "penciled:a2hs-dismissed";

function isStandalone() {
  if (typeof window === "undefined") return true;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    iosStandalone === true ||
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches)
  );
}

/**
 * One-time, dismissible nudge to install the app so Safari's 7-day storage
 * eviction doesn't sign organizers out between sessions.
 */
export function AddToHomeScreen() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      return;
    }
    setShow(true);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage blocked — just hide for this visit */
    }
    setShow(false);
  };

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <Share className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Add this to your home screen and you'll stay signed in.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            On iPhone: tap <span className="font-medium text-foreground">Share</span> in Safari,
            then <span className="font-medium text-foreground">Add to Home Screen</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent/40"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
