import { AppBar } from "@/components/AppBar";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/share/$slug")({
  head: () => ({
    meta: [
      { title: "Share your plan — Party.up" },
      {
        name: "description",
        content: "Copy the one link your group needs. No signup required to respond.",
      },
      { property: "og:title", content: "Share your plan — Party.up" },
      {
        property: "og:description",
        content: "One short link, one copy button, one chat-ready message.",
      },
    ],
  }),
  component: SharePage,
});

function SharePage() {
  const { slug } = Route.useParams();
  const { session, loading } = useAuth();
  const [projectName, setProjectName] = useState<string>("");
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    if (loading || !session) return;
    supabase
      .from("projects")
      .select("name")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data }) => setProjectName(data?.name ?? ""));
  }, [slug, session, loading]);

  const link = origin ? `${origin}/p/${slug}` : `/p/${slug}`;
  const message = `Trying to lock in ${projectName || "our plan"} — takes 30 seconds, no signup: ${link}`;

  async function copy(text: string, which: "link" | "message") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      toast.success("Copied");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Couldn't copy — long-press to select instead.");
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ text: message, url: link });
      } catch {
        /* dismissed */
      }
    } else {
      copy(message, "message");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-10">
      <AppBar />
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
        Ready to send
      </p>
      <h1 className="mt-3 text-3xl font-black tracking-tight">
        {projectName ? projectName : "Your plan"} is live
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Anyone with this link can respond. No account, no app, 30 seconds.
      </p>

      <div className="mt-8 rounded-2xl border-2 border-border bg-card p-4">
        <p className="break-all text-sm font-medium">{link}</p>
      </div>

      <Button className="mt-4 h-14 w-full text-base font-bold" onClick={() => copy(link, "link")}>
        {copied === "link" ? <Check className="size-5" /> : <Copy className="size-5" />}
        Copy link
      </Button>

      <Button variant="secondary" className="mt-3 h-14 w-full text-base font-bold" onClick={share}>
        <Share2 className="size-5" />
        Share…
      </Button>

      <div className="mt-8">
        <p className="text-sm font-bold">Group-chat ready</p>
        <div className="mt-2 rounded-2xl bg-secondary p-4 text-sm">{message}</div>
        <button
          type="button"
          onClick={() => copy(message, "message")}
          className="mt-3 min-h-11 text-sm text-muted-foreground underline underline-offset-4"
        >
          {copied === "message" ? "Copied!" : "Copy message"}
        </button>
      </div>

      <Link
        to="/results/$slug"
        params={{ slug }}
        className="mt-10 flex min-h-12 items-center justify-center rounded-2xl border-2 border-border text-sm font-bold"
      >
        See results
      </Link>

      <Link
        to="/new"
        className="mt-auto flex min-h-11 items-center justify-center pt-8 text-sm text-muted-foreground underline underline-offset-4"
      >
        Start another plan
      </Link>
    </main>
  );
}
