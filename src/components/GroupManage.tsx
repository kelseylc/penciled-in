import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import {
  addGroupMember,
  getGroupManage,
  renameGroup,
  setCoOrganizer,
  updateGroupMember,
  type GroupManage as GroupManageData,
} from "@/lib/groups.functions";

/** Organizer-only controls on a saved group page. Renders nothing for everyone else. */
export function GroupManage({ slug }: { slug: string }) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const manageFn = useServerFn(getGroupManage);
  const renameFn = useServerFn(renameGroup);
  const addFn = useServerFn(addGroupMember);
  const updateFn = useServerFn(updateGroupMember);
  const coFn = useServerFn(setCoOrganizer);

  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [coTarget, setCoTarget] = useState<string | null>(null);
  const [coEmail, setCoEmail] = useState("");

  const query = useQuery<GroupManageData>({
    queryKey: ["group-manage", slug],
    queryFn: () => manageFn({ data: { slug } }),
    enabled: !!session,
    retry: false,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["group-manage", slug] });
    void qc.invalidateQueries({ queryKey: ["group", slug] });
    void qc.invalidateQueries({ queryKey: ["my-groups"] });
  };
  const onError = (e: Error) => toast.error(e.message);

  const rename = useMutation({
    mutationFn: (name: string) => renameFn({ data: { slug, name } }),
    onSuccess: () => {
      setRenaming(null);
      toast.success("Renamed");
      refresh();
    },
    onError,
  });

  const addMember = useMutation({
    mutationFn: (display_name: string) => addFn({ data: { slug, display_name } }),
    onSuccess: () => {
      setNewName("");
      refresh();
    },
    onError,
  });

  const updateMember = useMutation({
    mutationFn: (vars: { memberId: string; is_required_default?: boolean; remove?: boolean }) =>
      updateFn({ data: vars }),
    onSuccess: refresh,
    onError,
  });

  const coOrganizer = useMutation({
    mutationFn: (vars: { memberId: string; email: string | null }) =>
      coFn({ data: { slug, ...vars } }),
    onSuccess: (res) => {
      setCoTarget(null);
      setCoEmail("");
      toast.success(res.linked ? "They can now organize for this group." : "Co-organizer removed.");
      refresh();
    },
    onError,
  });

  const data = query.data;
  if (!session || query.isError || !data) return null;

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Manage group
        </h2>
        {data.isOwner && (
          <button
            type="button"
            className="min-h-11 px-1 text-sm font-semibold text-primary"
            onClick={() => setRenaming(renaming === null ? data.name : null)}
          >
            {renaming === null ? "Rename" : "Cancel"}
          </button>
        )}
      </div>

      {renaming !== null && (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Input className="h-12" value={renaming} onChange={(e) => setRenaming(e.target.value)} />
          <Button
            className="h-12"
            disabled={!renaming.trim() || rename.isPending}
            onClick={() => rename.mutate(renaming.trim())}
          >
            Save
          </Button>
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {data.members.map((m) => (
          <li key={m.id} className="rounded-xl border border-border p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-bold">
                  {m.display_name}
                  {m.is_me && <span className="text-muted-foreground"> (you)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.is_organizer ? (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <ShieldCheck className="size-3" aria-hidden /> Co-organizer
                      {m.email ? ` · ${m.email}` : ""}
                    </span>
                  ) : (
                    (m.timezone ?? "Invitee")
                  )}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${m.display_name}`}
                onClick={() => updateMember.mutate({ memberId: m.id, remove: true })}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold">Required by default</p>
                <p className="text-xs text-muted-foreground">
                  Pre-marked as required on new plans with this group.
                </p>
              </div>
              <Switch
                checked={m.is_required_default}
                onCheckedChange={(c) =>
                  updateMember.mutate({ memberId: m.id, is_required_default: c })
                }
              />
            </div>

            {m.is_organizer
              ? data.isOwner &&
                !m.is_me && (
                  <button
                    type="button"
                    className="mt-2 min-h-11 text-sm font-semibold text-muted-foreground underline underline-offset-4"
                    onClick={() => coOrganizer.mutate({ memberId: m.id, email: null })}
                  >
                    Remove co-organizer access
                  </button>
                )
              : coTarget !== m.id && (
                  <button
                    type="button"
                    className="mt-2 min-h-11 text-sm font-semibold text-primary"
                    onClick={() => {
                      setCoTarget(m.id);
                      setCoEmail("");
                    }}
                  >
                    Make co-organizer
                  </button>
                )}

            {coTarget === m.id && (
              <div className="mt-2">
                <Input
                  className="h-12"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="their@email.com"
                  value={coEmail}
                  onChange={(e) => setCoEmail(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  The email on their Party.up account. Co-organizers can start and lock plans for
                  this group.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button
                    className="h-12"
                    disabled={!coEmail.trim() || coOrganizer.isPending}
                    onClick={() => coOrganizer.mutate({ memberId: m.id, email: coEmail.trim() })}
                  >
                    Add
                  </Button>
                  <Button variant="secondary" className="h-12" onClick={() => setCoTarget(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Input
          className="h-12"
          placeholder="Add someone"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              e.preventDefault();
              addMember.mutate(newName.trim());
            }
          }}
        />
        <Button
          className="size-12 shrink-0 p-0"
          disabled={!newName.trim() || addMember.isPending}
          onClick={() => addMember.mutate(newName.trim())}
          aria-label="Add member"
        >
          <Plus className="size-5" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
