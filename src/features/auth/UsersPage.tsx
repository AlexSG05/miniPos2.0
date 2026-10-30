import { useEffect, useState, type FormEvent } from "react";
import { createUser, listUsers, resetUserPassword, setUserActive, setUserRole, type UserInfo, type UserRole } from "./auth.api";
import { useAuth } from "./useAuth";

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("cashier");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    setUsers(await listUsers());
  }
  useEffect(() => { void refresh().catch((err) => setError(String(err))).finally(() => setLoading(false)); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await createUser(username, displayName, password, role);
      setUsername(""); setDisplayName(""); setPassword(""); setRole("cashier");
      await refresh(); setNotice("Usuario creado.");
    } catch (err) { setError(String(err)); }
    finally { setSaving(false); }
  }

  async function toggleActive(target: UserInfo) {
    setError(""); setNotice("");
    try { await setUserActive(target.id, !target.active); await refresh(); setNotice(target.active ? "Usuario desactivado." : "Usuario reactivado."); }
    catch (err) { setError(String(err)); }
  }

  async function changePassword(target: UserInfo) {
    const next = window.prompt(`Nueva contraseña para ${target.username} (mínimo 10 caracteres):`);
    if (next === null) return;
    setError(""); setNotice("");
    try { await resetUserPassword(target.id, next); setNotice("Contraseña actualizada; se cerraron sus sesiones anteriores."); }
    catch (err) { setError(String(err)); }
  }

  async function changeRole(target: UserInfo, nextRole: UserRole) {
    setError(""); setNotice("");
    try { await setUserRole(target.id, nextRole); await refresh(); setNotice(`Rol de ${target.username} actualizado; deberá iniciar sesión de nuevo.`); }
    catch (err) { setError(String(err)); }
  }

  const inputClass = "w-full rounded border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-white";
  return <main className="min-h-full space-y-5 bg-zinc-950 p-6 text-zinc-100">
    <header><p className="text-sm text-zinc-400">Sistema / Accesos</p><h1 className="mt-1 text-2xl font-semibold">Usuarios y roles</h1><p className="mt-1 text-sm text-zinc-400">Cuentas locales para separar las tareas de caja, inventario y administración.</p></header>
    {error && <div role="alert" className="rounded border border-red-900 p-3 text-sm text-red-300">{error}</div>}
    {notice && <div role="status" className="rounded border border-emerald-900 p-3 text-sm text-emerald-300">{notice}</div>}
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4"><h2 className="font-semibold">Agregar usuario</h2><form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <label className="text-xs text-zinc-400">Usuario<input className={`${inputClass} mt-1`} minLength={3} maxLength={40} autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
      <label className="text-xs text-zinc-400">Nombre visible<input className={`${inputClass} mt-1`} maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>
      <label className="text-xs text-zinc-400">Contraseña<input className={`${inputClass} mt-1`} type="password" minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <label className="text-xs text-zinc-400">Rol<select className={`${inputClass} mt-1`} value={role} onChange={(event) => setRole(event.target.value as UserRole)}><option value="cashier">Cajero</option><option value="inventory">Inventario</option><option value="admin">Administrador</option></select></label>
      <button disabled={saving} className="self-end rounded bg-sky-700 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{saving ? "Creando…" : "Crear usuario"}</button>
    </form><p className="mt-3 text-xs text-zinc-500">La contraseña se guarda como hash con sal. Las cuentas desactivadas no pueden iniciar sesión.</p></section>
    <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30"><h2 className="border-b border-zinc-800 p-4 font-semibold">Cuentas locales</h2>{loading ? <p className="p-4 text-sm text-zinc-400">Cargando…</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-zinc-900 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-800">{users.map((account) => <tr key={account.id}><td className="px-4 py-3 font-medium">{account.username}{account.id === currentUser?.id && <span className="ml-2 text-xs text-zinc-500">Tú</span>}</td><td className="px-4 py-3">{account.displayName}</td><td className="px-4 py-3"><select aria-label={`Rol de ${account.username}`} value={account.role} disabled={!account.active || account.id === currentUser?.id} onChange={(event) => void changeRole(account, event.target.value as UserRole)} className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs disabled:opacity-50"><option value="admin">Administrador</option><option value="cashier">Cajero</option><option value="inventory">Inventario</option></select></td><td className="px-4 py-3">{account.active ? "Activo" : "Desactivado"}</td><td className="px-4 py-3"><div className="flex gap-2"><button type="button" onClick={() => void changePassword(account)} disabled={!account.active} className="rounded border border-zinc-700 px-2.5 py-1.5 text-xs disabled:opacity-40">Cambiar contraseña</button><button type="button" onClick={() => void toggleActive(account)} disabled={account.id === currentUser?.id} className="rounded border border-zinc-700 px-2.5 py-1.5 text-xs disabled:opacity-40">{account.active ? "Desactivar" : "Reactivar"}</button></div></td></tr>)}</tbody></table></div>}</section>
  </main>;
}
