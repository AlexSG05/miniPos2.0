import { invoke } from "@tauri-apps/api/core";
import { invokeAuthed } from "../../lib/invokeAuthed";

export type UserRole = "admin" | "cashier" | "inventory";
export type UserInfo = { id: number; username: string; displayName: string; role: UserRole; active: boolean; createdAt: string; phone: string; hireDate: string };
export type SessionInfo = { token: string; user: UserInfo };
export type AdminOption = { id: number; username: string; displayName: string };

export const authStatus = () => invoke<boolean>("auth_status");
export const bootstrapAdmin = (username: string, displayName: string, password: string) =>
  invoke<SessionInfo>("bootstrap_admin", { username, displayName, password });
export const loginUser = (username: string, password: string) => invoke<SessionInfo>("login", { username, password });
export const getCurrentUser = (sessionToken: string) => invoke<UserInfo>("current_user", { sessionToken });
export const listActiveAdmins = () => invokeAuthed<AdminOption[]>("list_active_admins");
export const authorizeAdminAction = (adminUsername: string, adminPassword: string) => invokeAuthed<void>("authorize_admin_action", { adminUsername, adminPassword });
export const logoutUser = (sessionToken: string) => invoke<void>("logout", { sessionToken });
export const listUsers = () => invokeAuthed<UserInfo[]>("list_users");
export const createUser = (username: string, displayName: string, password: string, role: UserRole, phone: string, hireDate: string) =>
  invokeAuthed<UserInfo>("create_user", { username, displayName, password, role, phone, hireDate });
export const setUserActive = (userId: number, active: boolean) => invokeAuthed<void>("set_user_active", { userId, active });
export const setUserRole = (userId: number, role: UserRole) => invokeAuthed<void>("set_user_role", { userId, role });
export const resetUserPassword = (userId: number, password: string) => invokeAuthed<void>("reset_user_password", { userId, password });

