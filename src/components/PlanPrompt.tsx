import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { Mic, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { stashDraft } from "@/lib/plan-draft";
import { parsePlan } from "@/lib/plan-parse.functions";
import { cn } from "@/lib/utils";

const EXAMPLE =
  "Brunch with Iris on Saturdays or Sundays over the next 4 weeks, starting around 10:30 or 11am.";

/**
 * The Web Speech API is absent from TypeScript's DOM lib, so the shape this
 * file actually uses is spelled out here rather than reached for as `any`.
 */
type SpeechAlternative = { transcript: string };
type SpeechResultList = ArrayLike<ArrayLike<SpeechAlternative>>;
type SpeechResultEvent = { results: SpeechResultList };
type SpeechErrorEvent = { error?: string };

interface SpeechRecognizer {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognizer;
  webkitSpeechRecognition?: new () => SpeechRecognizer;
};

export function PlanPrompt() {
  const navigate = useNavigate();
  const parse = useServerFn(parsePlan);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognizer | null>(null);

  useEffect(() => {
    const w = window as SpeechWindow;
    setVoiceSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const w = window as SpeechWindow;
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Recognition) return;
    const rec = new Recognition();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    const base = text ? `${text.trim()} ` : "";
    rec.onresult = (event: SpeechResultEvent) => {
      let heard = "";
      for (let i = 0; i < event.results.length; i++)
        heard += event.results[i]?.[0]?.transcript ?? "";
      setText(base + heard);
    };
    rec.onerror = (event: SpeechErrorEvent) => {
      setListening(false);
      if (event?.error !== "aborted") toast.error("Couldn't hear that — try typing instead.");
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  async function build() {
    const value = text.trim();
    if (value.length < 3) return;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setBusy(true);
    try {
      const draft = await parse({
        data: {
          text: value,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          today: format(new Date(), "yyyy-MM-dd"),
        },
      });
      stashDraft(draft);
      navigate({ to: "/new", search: { draft: 1 } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border-2 border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
        <h2 className="text-sm font-bold">Describe it, we'll set it up</h2>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={EXAMPLE}
        aria-label="Describe the plan you want to organize"
        className="mt-3 min-h-28 resize-none text-base"
      />
      <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-2">
        {voiceSupported ? (
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={listening ? "Stop dictation" : "Dictate your plan"}
            aria-pressed={listening}
            className={cn(
              "grid size-14 shrink-0 place-items-center rounded-2xl border-2",
              listening
                ? "animate-pulse border-primary bg-primary/15"
                : "border-border bg-secondary",
            )}
          >
            {listening ? <Square className="size-5 text-primary" /> : <Mic className="size-5" />}
          </button>
        ) : null}
        <Button
          className="h-14 w-full text-base font-bold"
          disabled={busy || text.trim().length < 3}
          onClick={build}
        >
          {busy ? "Reading your plan…" : "Build it for me"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {listening
          ? "Listening… tap the square when you're done."
          : "We'll fill in what we can and ask you about the rest."}
      </p>
    </section>
  );
}
