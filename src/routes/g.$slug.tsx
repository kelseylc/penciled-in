import { AppBar } from "@/components/AppBar";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { Copy } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GroupManage } from "@/components/GroupManage";
import { getGroupPage, type GroupPage } from "@/lib/groups.functions";

export const Route = createFileRoute("/g/$slug")({
  head: () => ({
    meta: [
      { title: "Your group — Penciled.in" },
      {
        name: "description",
        content:
          "One permanent link for your group: every plan, every upcoming session, no signup to reply.",
      },
      { property: "og:title", content: "Your group — Penciled.in" },
      {
        property: "og:description",
        content: "Every plan for this crew in one place. Takes 30 seconds — no signup.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GroupPageRoute,
});

const STATUS_COPY: Record<string, string> = {
  collecting: "Collecting answers",
  locked: "Locked in",
  cancelled: "Called off",
};

function GroupPageRoute() {
  const { slug } = Route.useParams();
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const fetchGroup = useServerFn(getGroupPage);

  const query = useQuery<GroupPage>({
    queryKey: ["group", slug],
    queryFn: () => fetchGroup({ data: { slug } }),
  });

  const data = query.data;

  if (query.isLoading)
    return <main className="mx-auto w-full max-w-md px-5 py-8">Rounding everyone up…</main>;
  if (query.error || !data)
    return (
      <main className="mx-auto w-full max-w-md px-5 py-8">
        <AppBar />
        {(query.error as Error)?.message ?? "Couldn't load this group."}
      </main>
    );

  function copyLink() {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success("Group link copied — paste it once, use it forever"))
      .catch(() => toast.error("Couldn't copy — long-press to select instead."));
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8 text-base">
      <AppBar />
      <h1 className="text-2xl font-bold tracking-tight">{data.group.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {data.members.map((m) => m.display_name).join(", ") || "No one saved yet"}
      </p>

      <section className="mt-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Plans
        </h2>
        {data.plans.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nothing on the books. Suspiciously restful.
          </p>
        )}
        {data.plans.map((p) => (
          <Link
            key={p.slug}
            to={p.status === "locked" ? "/d/$slug" : "/p/$slug"}
            params={{ slug: p.slug }}
            className="block rounded-2xl border border-border bg-card p-4"
          >
            <p className="font-semibold">{p.name}</p>
            <p className="text-sm text-muted-foreground">
              {STATUS_COPY[p.status] ?? p.status}
              {p.nextStartUtc
                ? ` · next ${formatInTimeZone(new Date(p.nextStartUtc), tz, "EEE MMM d, h:mm a")}`
                : ""}
            </p>
          </Link>
        ))}
      </section>

      <GroupManage slug={slug} />

      <div className="sticky bottom-0 mt-8 bg-gradient-to-t from-background via-background pb-6 pt-4">
        <Button variant="secondary" className="h-14 w-full rounded-2xl text-base" onClick={copyLink}>
          <Copy className="mr-2 h-5 w-5" /> Copy group link
        </Button>
      </div>
    </main>
  );
}
