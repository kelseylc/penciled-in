import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppBar } from "@/components/AppBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { createGroup, listMyGroups, type MyGroup } from "@/lib/groups.functions";

export const Route = createFileRoute("/groups")({
  head: () => ({
    meta: [
      { title: "My groups — Penciled.in" },
      {
        name: "description",
        content:
          "Save the people you plan with once, reuse them for every future plan, and hand co-organizer access to anyone in the group.",
      },
      { property: "og:title", content: "My groups — Penciled.in" },
      {
        property: "og:description",
        content: "Reusable crews with shared scheduling memory and co-organizers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GroupsPage,
});

function GroupsPage() {
  const { session, loading } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listMyGroups);
  const createFn = useServerFn(createGroup);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const query = useQuery<MyGroup[]>({
    queryKey: ["my-groups"],
    queryFn: () => listFn({ data: undefined }),
    enabled: !!session,
  });

  const create = useMutation({
    mutationFn: (groupName: string) => createFn({ data: { name: groupName } }),
    onSuccess: () => {
      setName("");
      setAdding(false);
      toast.success("Group saved — add people to it next.");
      void qc.invalidateQueries({ queryKey: ["my-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <main className="mx-auto w-full max-w-md px-5 py-8">One sec…</main>;

  if (!session)
    return (
      <main className="mx-auto w-full max-w-md px-5 py-8">
        <AppBar />
        <h1 className="text-2xl font-black tracking-tight">My groups</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Saved groups live with your account, so sign in to see and manage them. Responding to a
          plan never needs an account.
        </p>
        <Link
          to="/auth"
          className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground"
        >
          Sign in
        </Link>
      </main>
    );

  const groups = query.data ?? [];

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-16 pt-6">
      <AppBar />
      <h1 className="text-2xl font-black tracking-tight">My groups</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        A group is a set of people you plan with again and again. Reuse them for any new plan, and
        make anyone with an account a co-organizer.
      </p>

      {query.isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}

      {!query.isLoading && groups.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No saved groups yet. Create one here, or save the invitees of any plan as a group while
          you build it.
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {groups.map((g) => (
          <li key={g.slug}>
            <Link
              to="/g/$slug"
              params={{ slug: g.slug }}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <Users className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{g.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {g.memberCount} {g.memberCount === 1 ? "person" : "people"} ·{" "}
                  {g.isOwner ? "You own this" : "You co-organize"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="mt-6 rounded-2xl border border-border p-4">
          <label className="text-sm font-bold" htmlFor="group-name">
            Group name
          </label>
          <Input
            id="group-name"
            className="mt-2 h-12"
            placeholder="The Usual Suspects"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              className="h-12"
              disabled={!name.trim() || create.isPending}
              onClick={() => create.mutate(name.trim())}
            >
              Save group
            </Button>
            <Button variant="secondary" className="h-12" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          className="mt-6 h-14 w-full rounded-2xl text-base"
          onClick={() => setAdding(true)}
        >
          <Plus className="mr-2 size-5" aria-hidden /> New group
        </Button>
      )}

      <Link
        to="/new"
        className="mt-3 flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground"
      >
        Start scheduling
      </Link>
    </main>
  );
}
