import { invoke } from "@tauri-apps/api/core";

export function invokeAuthed<T>(command: string, args: Record<string, unknown> = {}) {
  const sessionToken = sessionStorage.getItem("minipos-session");
  if (!sessionToken) return Promise.reject(new Error("Inicia sesión para continuar."));
  return invoke<T>(command, { ...args, sessionToken });
}
