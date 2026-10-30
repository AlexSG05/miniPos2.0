import { createContext } from "react";
import type { UserInfo } from "./auth.api";

export type AuthContextValue = {
  user: UserInfo | null;
  loading: boolean;
  needsSetup: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  setupAdmin: (username: string, displayName: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
