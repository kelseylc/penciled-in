import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export type AuthState = {
  session: Session | null;
  user: User | null;
  /** True until the first session lookup settles. */
  loading: boolean;
};

export const AuthContext = createContext<AuthState | null>(null);

/**
 * The signed-in session, resolved once for the whole tree. Every caller used to
 * open its own Supabase subscription and its own loading flag, so a page with
 * two of them settled twice and could flash a signed-out UI in between.
 */
export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error("useAuth must be used inside <AuthProvider>");
  return state;
}
