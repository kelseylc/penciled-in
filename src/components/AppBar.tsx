import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, CalendarCheck, CalendarPlus, LogIn, LogOut, Menu, Users } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  /** Show a back control. Defaults to true. */
  back?: boolean;
  /** Optional short label shown next to the brand. */
  title?: string;
};

export function AppBar({ back = true, title }: Props) {
  const router = useRouter();
  const { session } = useAuth();

  return (
    <div className="sticky top-0 z-40 mb-4 flex items-center gap-1 border-b border-border/60 bg-background/90 py-2 backdrop-blur">
      {back && (
        <button
          type="button"
          aria-label="Go back"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
            else router.navigate({ to: "/" });
          }}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-foreground hover:bg-accent/40"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
      )}

      <Link
        to="/"
        className="flex min-h-11 min-w-0 flex-1 items-center truncate px-1 text-sm font-bold tracking-tight"
      >
        {title ?? "Penciled.in"}
      </Link>

      {!session && (
        <Link
          to="/auth"
          className="flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-foreground hover:bg-accent/40"
        >
          Sign in
        </Link>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Open menu"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-foreground hover:bg-accent/40"
        >
          <Menu className="size-5" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild>
            <Link to="/new" className="cursor-pointer">
              <CalendarPlus className="mr-2 size-4" aria-hidden /> Start scheduling
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/home" className="cursor-pointer">
              <CalendarCheck className="mr-2 size-4" aria-hidden /> My events
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/groups" className="cursor-pointer">
              <Users className="mr-2 size-4" aria-hidden /> My groups
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {session ? (
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => {
                void supabase.auth.signOut().then(() => router.navigate({ to: "/" }));
              }}
            >
              <LogOut className="mr-2 size-4" aria-hidden /> Sign out
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <Link to="/auth" className="cursor-pointer">
                <LogIn className="mr-2 size-4" aria-hidden /> Sign in
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
