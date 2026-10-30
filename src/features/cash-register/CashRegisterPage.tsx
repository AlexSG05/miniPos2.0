import { useEffect, useState, type FormEvent } from "react";
import { closeCashSession, getOpenCashSession, listCashClosures, openCashSession, recordCashMovement, type CashClosure, type CashSession } from "./cash.api";

const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);

export default function CashRegisterPage() {
  const [session, setSession] = useState<CashSession | null>(null);
  const [closures, setClosures] = useState<CashClosure[]>([]);
  const [opening, setOpening] = useState("0.00");
  const [counted, setCounted] = useState("");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [movementDirection, setMovementDirection] = useState<"in" | "out">("in");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  async function refresh() {
    try { setSession(await getOpenCashSession()); }
    catch (err) { setError(String(err)); }
    finally { setLoading(false); }
  }
  async function loadClosures() {
    try { setClosures(await listCashClosures()); }
    catch (err) { setError(String(err)); }
  }
  useEffect(() => { void refresh(); void loadClosures(); }, []);

  async function handleOpen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setFeedback("");
    try {
      const cents = Math.round(Number(opening) * 100);
      if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("El fondo inicial debe ser una cantidad válida.");
      setSession(await openCashSession(cents));
      setFeedback("Turno de caja abierto.");
    } catch (err) { setError(String(err)); }
    finally { setSaving(false); }
  }

  async function handleClose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setFeedback("");
    try {
      const cents = Math.round(Number(counted) * 100);
      if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("El efectivo contado debe ser una cantidad válida.");
      const difference = await closeCashSession(cents);
      setSession(null); setCounted("");
      await loadClosures();
      setFeedback(`Turno cerrado. Diferencia: ${money(difference)}.`);
    } catch (err) { setError(String(err)); }
    finally { setSaving(false); }
  }

  async function handleMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setFeedback("");
    try {
      const cents = Math.round(Number(movementAmount) * 100);
      if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("El importe debe ser mayor que cero.");
      await recordCashMovement({ direction: movementDirection, amountCents: cents, reason: movementReason.trim() });
      setMovementAmount(""); setMovementReason("");
      await refresh();
      setFeedback(movementDirection === "in" ? "Entrada de efectivo registrada." : "Salida de efectivo registrada.");
    } catch (err) { setError(String(err)); }
    finally { setSaving(false); }
  }

  return <main className="min-h-full space-y-5 bg-zinc-950 p-6 text-zinc-100">
    <header><p className="text-sm text-zinc-400">Operación / Turnos</p><h1 className="mt-1 text-2xl font-semibold text-white">Caja</h1><p className="mt-1 text-sm text-zinc-400">Abre un turno antes de cobrar y registra el efectivo contado al cierre.</p></header>
    {error && <div role="alert" className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
    {feedback && <div role="status" className="rounded-lg border border-emerald-900 bg-emerald-950/30 p-3 text-sm text-emerald-300">{feedback}</div>}
    {loading ? <p className="text-sm text-zinc-400">Consultando caja...</p> : session ? <section className="max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Turno abierto</h2><span className="rounded-full bg-emerald-950 px-3 py-1 text-xs text-emerald-300">En operación</span></div>
      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3"><div><dt className="text-sm text-zinc-500">Fondo inicial</dt><dd className="mt-1 text-lg">{money(session.openingCents)}</dd></div><div><dt className="text-sm text-zinc-500">Ventas en efectivo</dt><dd className="mt-1 text-lg">{money(session.cashSalesCents)}</dd></div><div><dt className="text-sm text-zinc-500">Pagos con tarjeta</dt><dd className="mt-1 text-lg">{money(session.cardSalesCents)}</dd></div><div><dt className="text-sm text-zinc-500">Reembolsos en efectivo</dt><dd className="mt-1 text-lg">{money(session.cashRefundsCents)}</dd></div><div><dt className="text-sm text-zinc-500">Entradas de efectivo</dt><dd className="mt-1 text-lg">{money(session.cashInCents)}</dd></div><div><dt className="text-sm text-zinc-500">Salidas de efectivo</dt><dd className="mt-1 text-lg">{money(session.cashOutCents)}</dd></div><div><dt className="text-sm text-zinc-500">Efectivo esperado</dt><dd className="mt-1 text-lg font-semibold">{money(session.expectedCents)}</dd></div><div className="col-span-2 sm:col-span-3"><dt className="text-sm text-zinc-500">Apertura</dt><dd className="mt-1 text-sm">{new Date(session.openedAt).toLocaleString("es-MX")}</dd></div></dl>
      <form onSubmit={handleMovement} className="mt-6 border-t border-zinc-800 pt-5"><h3 className="font-medium">Movimiento de efectivo</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm text-zinc-300">Tipo<select value={movementDirection} onChange={(event) => setMovementDirection(event.target.value as "in" | "out")} className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-950 p-2.5 text-white"><option value="in">Entrada</option><option value="out">Salida</option></select></label><label className="text-sm text-zinc-300">Importe (MXN)<input type="number" min="0.01" step="0.01" required value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-950 p-2.5 text-white" /></label><label className="text-sm text-zinc-300 sm:col-span-2">Motivo<input maxLength={240} required value={movementReason} onChange={(event) => setMovementReason(event.target.value)} className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-950 p-2.5 text-white" placeholder="Ej. retiro para cambio" /></label></div><button disabled={saving} className="mt-3 rounded border border-zinc-600 px-4 py-2 text-sm disabled:opacity-50">{saving ? "Guardando..." : "Registrar movimiento"}</button></form>
      <form onSubmit={handleClose} className="mt-6 border-t border-zinc-800 pt-5"><label className="block text-sm text-zinc-300">Efectivo contado al cierre (MXN)<input type="number" min="0" step="0.01" required value={counted} onChange={(event) => setCounted(event.target.value)} className="mt-2 block w-full rounded border border-zinc-700 bg-zinc-950 p-3 text-white" placeholder="0.00" /></label><p className="mt-2 text-xs text-zinc-500">Diferencia estimada: {counted !== "" ? money(Math.round(Number(counted) * 100) - session.expectedCents) : "—"}</p><button disabled={saving} className="mt-4 rounded bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50">{saving ? "Cerrando..." : "Cerrar turno"}</button></form>
    </section> : <section className="max-w-xl rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"><h2 className="font-semibold">Abrir turno de caja</h2><p className="mt-1 text-sm text-zinc-400">Registra el efectivo disponible en caja al inicio del turno.</p><form onSubmit={handleOpen} className="mt-5"><label className="block text-sm text-zinc-300">Fondo inicial (MXN)<input autoFocus type="number" min="0" step="0.01" required value={opening} onChange={(event) => setOpening(event.target.value)} className="mt-2 block w-full rounded border border-zinc-700 bg-zinc-950 p-3 text-white" /></label><button disabled={saving} className="mt-4 rounded bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Abriendo..." : "Abrir caja"}</button></form></section>}
    {closures.length > 0 && <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30"><h2 className="border-b border-zinc-800 p-4 font-semibold">Cierres anteriores</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-zinc-900 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Apertura</th><th className="px-4 py-3">Cierre</th><th className="px-4 py-3">Fondo</th><th className="px-4 py-3">Esperado</th><th className="px-4 py-3">Contado</th><th className="px-4 py-3">Diferencia</th></tr></thead><tbody className="divide-y divide-zinc-800">{closures.map((closure) => <tr key={closure.id}><td className="px-4 py-3">{new Date(closure.openedAt).toLocaleString("es-MX")}</td><td className="px-4 py-3">{new Date(closure.closedAt).toLocaleString("es-MX")}</td><td className="px-4 py-3">{money(closure.openingCents)}</td><td className="px-4 py-3">{money(closure.expectedCents)}</td><td className="px-4 py-3">{money(closure.countedCents)}</td><td className={`px-4 py-3 ${closure.differenceCents === 0 ? "text-emerald-300" : "text-amber-300"}`}>{money(closure.differenceCents)}</td></tr>)}</tbody></table></div></section>}
  </main>;
}
