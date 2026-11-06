import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { KeyRound, Plus, Search, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { createUser, listUsers, resetUserPassword, setUserActive, setUserRole, type UserInfo, type UserRole } from "./auth.api";
import { useAuth } from "./useAuth";

type UserStatus = "all" | "active" | "inactive";
const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const roleName: Record<UserRole, string> = { admin: "Administrador", cashier: "Cajero", inventory: "Inventario" };
const localToday = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<UserStatus>("active");
  const [showCreate, setShowCreate] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("cashier");
  const [phone, setPhone] = useState("");
  const [hireDate, setHireDate] = useState(localToday);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => setUsers(await listUsers()), []);
  useEffect(() => { void refresh().catch((cause) => setError(String(cause))).finally(() => setLoading(false)); }, [refresh]);

  const visibleUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-MX");
    return users.filter((account) => {
      if (statusFilter === "active" && !account.active) return false;
      if (statusFilter === "inactive" && account.active) return false;
      if (roleFilter !== "all" && account.role !== roleFilter) return false;
      return !term || [account.username, account.displayName].some((value) => value.toLocaleLowerCase("es-MX").includes(term));
    });
  }, [users, search, roleFilter, statusFilter]);

  const activeCount = users.filter((account) => account.active).length;
  const adminCount = users.filter((account) => account.active && account.role === "admin").length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await createUser(username.trim(), displayName.trim(), password, role, phone.trim(), hireDate);
      setUsername(""); setDisplayName(""); setPassword(""); setRole("cashier"); setPhone(""); setHireDate(localToday()); setShowCreate(false);
      await refresh(); setStatusFilter("all"); setNotice("Usuario creado correctamente.");
    } catch (cause) { setError(String(cause)); }
    finally { setSaving(false); }
  }

  async function toggleActive(target: UserInfo) {
    setError(""); setNotice("");
    try { await setUserActive(target.id, !target.active); await refresh(); setNotice(target.active ? "Usuario desactivado." : "Usuario reactivado."); }
    catch (cause) { setError(String(cause)); }
  }

  async function changePassword(target: UserInfo) {
    const next = window.prompt(`Nueva contraseña para ${target.username} (mínimo 4 caracteres):`);
    if (next === null) return;
    if (next.length < 4 || next.length > 128) { setError("La contraseña debe tener entre 4 y 128 caracteres."); return; }
    setError(""); setNotice("");
    try { await resetUserPassword(target.id, next); setNotice("Contraseña actualizada; se cerraron sus sesiones anteriores."); }
    catch (cause) { setError(String(cause)); }
  }

  async function changeRole(target: UserInfo, nextRole: UserRole) {
    setError(""); setNotice("");
    try { await setUserRole(target.id, nextRole); await refresh(); setNotice(`Rol de ${target.username} actualizado; deberá iniciar sesión de nuevo.`); }
    catch (cause) { setError(String(cause)); }
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-slate-50 text-slate-800">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Sistema / Accesos</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Usuarios</h1><p className="mt-1 text-sm text-slate-500">Administra las cuentas y los permisos del sistema.</p></div>
        <button type="button" onClick={() => { setError(""); setShowCreate(true); }} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"><Plus size={17} /> Nuevo usuario</button>
      </header>

      {error && <div role="alert" className="flex shrink-0 items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Cerrar error"><X size={16} /></button></div>}
      {notice && <div role="status" className="flex shrink-0 items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Cerrar aviso"><X size={16} /></button></div>}

      <section className="grid shrink-0 gap-3 sm:grid-cols-3" aria-label="Resumen de usuarios">
        <article className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><span className="rounded-lg bg-blue-50 p-2.5 text-blue-600"><Users size={20} /></span><div><p className="text-xs font-medium text-slate-500">Cuentas registradas</p><strong className="text-xl text-slate-900">{users.length}</strong></div></article>
        <article className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><span className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600"><UserRound size={20} /></span><div><p className="text-xs font-medium text-slate-500">Usuarios activos</p><strong className="text-xl text-slate-900">{activeCount}</strong></div></article>
        <article className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><span className="rounded-lg bg-violet-50 p-2.5 text-violet-600"><ShieldCheck size={20} /></span><div><p className="text-xs font-medium text-slate-500">Administradores activos</p><strong className="text-xl text-slate-900">{adminCount}</strong></div></article>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 p-3">
          <label className="relative min-w-[220px] flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:bg-white" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar usuario o nombre…" aria-label="Buscar usuarios" /></label>
          <select className="min-w-[170px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as UserRole | "all")} aria-label="Filtrar por rol"><option value="all">Todos los roles</option><option value="admin">Administrador</option><option value="cashier">Cajero</option><option value="inventory">Inventario</option></select>
          <select className="min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as UserStatus)} aria-label="Filtrar por estado"><option value="active">Activos</option><option value="inactive">Desactivados</option><option value="all">Todos los estados</option></select>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[920px] text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Teléfono</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Ingreso</th><th className="px-4 py-3">Acciones</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={7} className="p-10 text-center text-slate-500">Cargando usuarios…</td></tr> : visibleUsers.length === 0 ? <tr><td colSpan={7} className="p-10 text-center"><p className="font-semibold text-slate-700">No hay usuarios para mostrar</p><p className="mt-1 text-sm text-slate-500">Cambia los filtros o agrega una cuenta nueva.</p></td></tr> : visibleUsers.map((account) => <tr key={account.id} className={`hover:bg-slate-50 ${account.active ? "" : "bg-slate-50/70 text-slate-400"}`}>
              <td className="px-4 py-3 font-semibold text-slate-800">{account.username}{account.id === currentUser?.id && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Tú</span>}</td><td className="px-4 py-3">{account.displayName}</td><td className="px-4 py-3 text-slate-600">{account.phone || "—"}</td>
              <td className="px-4 py-3"><select aria-label={`Rol de ${account.username}`} value={account.role} disabled={!account.active || account.id === currentUser?.id} onChange={(event) => void changeRole(account, event.target.value as UserRole)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 disabled:opacity-50">{Object.entries(roleName).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
              <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${account.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{account.active ? "Activo" : "Desactivado"}</span></td><td className="px-4 py-3 text-slate-500">{new Date(`${account.hireDate}T12:00:00`).toLocaleDateString("es-MX")}</td>
              <td className="px-4 py-3"><div className="flex gap-2"><button type="button" onClick={() => void changePassword(account)} disabled={!account.active} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700 disabled:opacity-40"><KeyRound size={13} /> Contraseña</button><button type="button" onClick={() => void toggleActive(account)} disabled={account.id === currentUser?.id} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:border-rose-200 hover:text-rose-600 disabled:opacity-40">{account.active ? "Desactivar" : "Reactivar"}</button></div></td>
            </tr>)}</tbody></table>
        </div>
        <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 px-4 py-2 text-xs text-slate-500"><span>{visibleUsers.length} usuarios</span><span>Las cuentas desactivadas no pueden iniciar sesión.</span></footer>
      </section>

      {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowCreate(false); }}><section role="dialog" aria-modal="true" aria-labelledby="new-user-title" className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Accesos</p><h2 id="new-user-title" className="mt-1 text-xl font-bold text-slate-900">Nuevo usuario</h2><p className="mt-1 text-sm text-slate-500">Crea una cuenta y define su nivel de acceso.</p></div><button type="button" onClick={() => setShowCreate(false)} aria-label="Cerrar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={19} /></button></div>
        <form onSubmit={(event) => void submit(event)} className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Nombre visible<input autoFocus className={`${inputClass} mt-1`} maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label><label className="text-sm font-medium text-slate-700">Usuario<input className={`${inputClass} mt-1`} minLength={3} maxLength={40} autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} required /></label><label className="text-sm font-medium text-slate-700">Contraseña<input className={`${inputClass} mt-1`} type="password" minLength={4} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><span className="mt-1 block text-xs font-normal text-slate-500">Debe tener mínimo 4 caracteres.</span></label><label className="text-sm font-medium text-slate-700">Teléfono <span className="font-normal text-slate-400">(opcional)</span><input className={`${inputClass} mt-1`} type="tel" maxLength={30} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Ej. 55 1234 5678" /></label><label className="text-sm font-medium text-slate-700">Fecha de ingreso<input className={`${inputClass} mt-1`} type="date" value={hireDate} onChange={(event) => setHireDate(event.target.value)} required /></label><label className="text-sm font-medium text-slate-700">Rol<select className={`${inputClass} mt-1`} value={role} onChange={(event) => setRole(event.target.value as UserRole)}><option value="cashier">Cajero</option><option value="inventory">Inventario</option><option value="admin">Administrador</option></select></label><div className="mt-1 flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setShowCreate(false)} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button><button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando…" : "Crear usuario"}</button></div></form>
      </section></div>}
    </main>
  );
}
