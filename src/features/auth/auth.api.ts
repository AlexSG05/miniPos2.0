import { invoke } from "@tauri-apps/api/core";
import { invokeAuthed } from "../../lib/invokeAuthed";

export type UserRole = "admin" | "cashier" | "inventory";
export type UserInfo = { id: number; username: string; displayName: string; role: UserRole; active: boolean; createdAt: string };
export type SessionInfo = { token: string; user: UserInfo };

export const authStatus = () => invoke<boolean>("auth_status");
export const bootstrapAdmin = (username: string, displayName: string, password: string) =>
  invoke<SessionInfo>("bootstrap_admin", { username, displayName, password });
export const loginUser = (username: string, password: string) => invoke<SessionInfo>("login", { username, password });
export const getCurrentUser = (sessionToken: string) => invoke<UserInfo>("current_user", { sessionToken });
export const logoutUser = (sessionToken: string) => invoke<void>("logout", { sessionToken });
export const listUsers = () => invokeAuthed<UserInfo[]>("list_users");
export const createUser = (username: string, displayName: string, password: string, role: UserRole) =>
  invokeAuthed<UserInfo>("create_user", { username, displayName, password, role });
export const setUserActive = (userId: number, active: boolean) => invokeAuthed<void>("set_user_active", { userId, active });
export const setUserRole = (userId: number, role: UserRole) => invokeAuthed<void>("set_user_role", { userId, role });
export const resetUserPassword = (userId: number, password: string) => invokeAuthed<void>("reset_user_password", { userId, password });

