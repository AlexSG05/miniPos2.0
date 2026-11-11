import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Banknote, Printer } from "lucide-react";
import { closeCashSession, getOpenCashSession, listCashClosures, openCashSession, recordCashMovement, type CashClosure, type CashDenomination, type CashSession } from "./cash.api";
import CashWithdrawalDialog from "./CashWithdrawalDialog";
import ShiftMonitoring from "./ShiftMonitoring";

const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
const DENOMINATIONS = [100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100, 50, 20, 10, 5];
const denominationLabel = (cents: number) => cents >= 100 ? money(cents) : `${(cents / 100).toFixed(2)}¢`;
const inputClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-800 outline-none focus:border-blue-500";

export default function CashRegisterPage() {
  const [session, setSession] = useState<CashSession | null>(null);
  const [closures, setClosures] = useState<CashClosure[]>([]);
  const [report, setReport] = useState<CashClosure | null>(null);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [opening, setOpening] = useState("0.00");
  const [denominationCounts, setDenominationCounts] = useState<Record<number, string>>(() => Object.fromEntries(DENOMINATIONS.map((value) => [value, "0"])));
  const [differenceReason, setDifferenceReason] = useState("");
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

  const denominations: CashDenomination[] = useMemo(() => DENOMINATIONS.map((denominationCents) => {
    const quantity = Number(denominationCounts[denominationCents] ?? 0);
    return { denominationCents, quantity, subtotalCents: denominationCents * quantity };
  }), [denominationCounts]);
  const countedCents = denominations.reduce((sum, item) => sum + item.subtotalCents, 0);
  const differenceCents = countedCents - (session?.expectedCents ?? 0);

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
      if (differenceCents !== 0 && !differenceReason.trim()) throw new Error("Escribe el motivo del faltante o sobrante antes de cerrar.");
      const closure = await closeCashSession({ denominations, differenceReason: differenceReason.trim() });
      setReport(closure); setSession(null); setDifferenceReason("");
      setDenominationCounts(Object.fromEntries(DENOMINATIONS.map((value) => [value, "0"])));
      await loadClosures();
      setFeedback(`Turno cerrado. Diferencia: ${money(closure.differenceCents)}.`);
    } catch (err) { setError(String(err)); }
    finally { setSaving(false); }
  }

  async function handleMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setFeedback("");
    try {
      const cents = Math.round(Number(movementAmount) * 100);
      if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("El importe debe ser mayor que cero.");
      await recordCashMovement({ direction: movementDirection, amountCents: cents, reason: movementReason.trim() });
      setMovementAmount(""); setMovementReason(""); await refresh();
      setFeedback(movementDirection === "in" ? "Entrada de efectivo registrada." : "Salida de efectivo registrada.");
    } catch (err) { setError(String(err)); }
    finally { setSaving(false); }
  }

  return <main className="cash-page min-h-full space-y-5 bg-slate-50 p-4 text-slate-800 sm:p-6">
    <header className="no-print"><h1 className="text-2xl font-semibold text-slate-900">Cortes de caja</h1></header>
    <ShiftMonitoring />
    {error && <div role="alert" className="no-print rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {feedback && <div role="status" className="no-print rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{feedback}</div>}
    {loading ? <p className="no-print text-sm text-slate-500">Consultando caja…</p> : session ? <section className="no-print space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Turno abierto #{session.id}</h2><p className="text-xs text-slate-500">Abrió {session.openedByName} · {new Date(session.openedAt).toLocaleString("es-MX")}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">En operación</span></div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"><Metric label="Fondo inicial" value={money(session.openingCents)}/><Metric label="Ventas en efectivo" value={money(session.cashSalesCents)}/><Metric label="Pagos con tarjeta" value={money(session.cardSalesCents)}/><Metric label="Reembolsos en efectivo" value={money(session.cashRefundsCents)}/><Metric label="Entradas de efectivo" value={money(session.cashInCents)}/><Metric label="Retiros y gastos" value={money(session.cashOutCents)}/><Metric label="Efectivo esperado" value={money(session.expectedCents)} highlight/></dl>
      <div className="border-t border-slate-200 pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Entradas de efectivo</h3><p className="mt-1 text-sm text-slate-500">Los retiros se registran con conteo por denominación para conservar su auditoría.</p></div><button type="button" onClick={() => setWithdrawalOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-amber-950 hover:bg-amber-400"><Banknote size={17}/> Retiro por denominación</button></div><form onSubmit={handleMovement} className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm">Tipo<select value={movementDirection} onChange={(event) => setMovementDirection(event.target.value as "in" | "out")} className={inputClass}><option value="in">Entrada</option></select></label><label className="text-sm">Importe (MXN)<input type="number" min="0.01" step="0.01" required value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} className={inputClass}/></label><label className="text-sm sm:col-span-2">Motivo<input maxLength={240} required value={movementReason} onChange={(event) => setMovementReason(event.target.value)} className={inputClass} placeholder="Ej. entrada para cambio"/></label><button disabled={saving} className="justify-self-start rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">{saving ? "Guardando…" : "Registrar movimiento"}</button></form></div>
      <form onSubmit={handleClose} className="border-t border-slate-200 pt-5"><div><h3 className="font-semibold">Arqueo por denominación</h3><p className="mt-1 text-sm text-slate-500">Captura la cantidad de billetes y monedas de cada valor.</p></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{DENOMINATIONS.map((value) => <label key={value} className="rounded-lg border border-slate-200 p-3 text-sm"><span className="font-semibold">{denominationLabel(value)}</span><span className="ml-1 text-xs text-slate-500">× piezas</span><input aria-label={`Cantidad de denominación ${denominationLabel(value)}`} type="number" min="0" max="1000000" step="1" inputMode="numeric" value={denominationCounts[value]} onChange={(event) => setDenominationCounts((current) => ({ ...current, [value]: event.target.value }))} className={inputClass}/></label>)}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4"><span className="text-sm text-slate-600">Efectivo contado</span><strong className="text-xl tabular-nums">{money(countedCents)}</strong></div><div className={`mt-3 rounded-lg p-4 ${differenceCents === 0 ? "bg-emerald-50 text-emerald-800" : differenceCents < 0 ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}><p className="text-sm font-semibold">{differenceCents === 0 ? "La caja cuadra" : differenceCents < 0 ? `Faltante: ${money(Math.abs(differenceCents))}` : `Sobrante: ${money(differenceCents)}`}</p><p className="mt-1 text-xs">Esperado {money(session.expectedCents)} · Contado {money(countedCents)}</p></div>{differenceCents !== 0 && <label className="mt-3 block text-sm font-medium">Motivo obligatorio<textarea required minLength={3} maxLength={500} rows={3} value={differenceReason} onChange={(event) => setDifferenceReason(event.target.value)} className={inputClass} placeholder="Describe por qué existe el faltante o sobrante"/></label>}<button disabled={saving || (differenceCents !== 0 && differenceReason.trim().length < 3)} className="mt-4 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Cerrando turno…" : "Confirmar y cerrar turno"}</button></form>
    </section> : <section className="no-print max-w-xl rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Abrir turno de caja</h2><p className="mt-1 text-sm text-slate-500">Registra el efectivo disponible al inicio. Se guardará tu usuario y la hora de apertura.</p><form onSubmit={handleOpen} className="mt-5"><label className="block text-sm">Fondo inicial (MXN)<input autoFocus type="number" min="0" step="0.01" required value={opening} onChange={(event) => setOpening(event.target.value)} className={`${inputClass} p-3`}/></label><button disabled={saving} className="mt-4 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Abriendo…" : "Abrir caja"}</button></form></section>}

    {report && <ClosureReport closure={report} onPrint={() => window.print()} onDismiss={() => setReport(null)}/>}

    {closures.length > 0 && <section className="no-print overflow-hidden rounded-xl border border-slate-200 bg-white"><h2 className="border-b border-slate-200 p-4 font-semibold">Cierres anteriores</h2><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Turno / cajero</th><th className="px-4 py-3">Apertura</th><th className="px-4 py-3">Cierre</th><th className="px-4 py-3">Esperado</th><th className="px-4 py-3">Contado</th><th className="px-4 py-3">Diferencia</th><th className="px-4 py-3">Reporte</th></tr></thead><tbody className="divide-y divide-slate-100">{closures.map((closure) => <tr key={closure.id}><td className="px-4 py-3">#{closure.id}<span className="block text-xs text-slate-500">{closure.closedByName}</span></td><td className="px-4 py-3">{new Date(closure.openedAt).toLocaleString("es-MX")}</td><td className="px-4 py-3">{new Date(closure.closedAt).toLocaleString("es-MX")}</td><td className="px-4 py-3">{money(closure.expectedCents)}</td><td className="px-4 py-3">{money(closure.countedCents)}</td><td className={`px-4 py-3 font-semibold ${closure.differenceCents === 0 ? "text-emerald-700" : "text-rose-700"}`}>{money(closure.differenceCents)}</td><td className="px-4 py-3"><button type="button" onClick={() => setReport(closure)} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Ver cierre</button></td></tr>)}</tbody></table></div></section>}
    {withdrawalOpen && <CashWithdrawalDialog onClose={() => setWithdrawalOpen(false)} onSaved={() => { void refresh(); setFeedback("Retiro registrado y descontado del efectivo esperado."); }} />}
  </main>;
}

function Metric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div className={highlight ? "rounded-lg bg-blue-50 p-3" : "p-1"}><dt className="text-xs text-slate-500">{label}</dt><dd className={`mt-1 text-lg tabular-nums ${highlight ? "font-bold text-blue-800" : "text-slate-800"}`}>{value}</dd></div>;
}

function ClosureReport({ closure, onPrint, onDismiss }: { closure: CashClosure; onPrint: () => void; onDismiss: () => void }) {
  const nonzero = closure.denominations.filter((item) => item.quantity > 0);
  return <section id="cash-closure-report" className="print-report rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-7">
    <div className="no-print mb-5 flex flex-wrap justify-between gap-2"><h2 className="text-lg font-bold">Resumen de cierre · Turno #{closure.id}</h2><div className="flex gap-2"><button type="button" onClick={onPrint} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"><Printer size={16}/> Imprimir ticket</button><button type="button" onClick={onDismiss} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Ocultar</button></div></div>
    <div className="text-center"><h2 className="text-xl font-bold">Cierre de caja</h2><p className="text-sm">Turno #{closure.id}</p></div>
    <div className="mt-5 grid grid-cols-2 gap-2 border-y border-dashed border-slate-300 py-3 text-sm"><span>Cajero apertura</span><strong className="text-right">{closure.openedByName}</strong><span>Cajero cierre</span><strong className="text-right">{closure.closedByName}</strong><span>Inicio</span><span className="text-right">{new Date(closure.openedAt).toLocaleString("es-MX")}</span><span>Fin</span><span className="text-right">{new Date(closure.closedAt).toLocaleString("es-MX")}</span></div>
    <h3 className="mt-4 font-semibold">Resumen de efectivo</h3><div className="mt-2 space-y-1 text-sm"><ReportRow label="Fondo inicial" cents={closure.openingCents}/><ReportRow label="Ventas en efectivo" cents={closure.cashSalesCents}/><ReportRow label="Entradas" cents={closure.cashInCents}/><ReportRow label="Retiros y gastos" cents={-closure.cashOutCents}/><ReportRow label="Reembolsos en efectivo" cents={-closure.cashRefundsCents}/><ReportRow label="Ventas con tarjeta (referencia)" cents={closure.cardSalesCents}/><div className="mt-2 border-t border-dashed border-slate-300 pt-2"><ReportRow label="Efectivo esperado" cents={closure.expectedCents} strong/></div></div>
    {closure.withdrawals.length > 0 && <><h3 className="mt-5 font-semibold">Retiros entregados a encargados</h3><div className="mt-2 space-y-3 text-sm">{closure.withdrawals.map((withdrawal) => <div key={withdrawal.movementId} className="rounded-lg border border-slate-200 p-3"><div className="flex justify-between gap-3"><strong>{withdrawal.recipientName}</strong><strong>{money(withdrawal.amountCents)}</strong></div><p className="mt-1 text-xs text-slate-500">Registró {withdrawal.createdByName} · {new Date(withdrawal.createdAt).toLocaleString("es-MX")}</p><p className="mt-1 text-xs">{withdrawal.reason.replace(/^Retiro para [^:]+: /, "")}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">{withdrawal.denominations.filter((item) => item.quantity > 0).map((item) => <span key={item.denominationCents}>{denominationLabel(item.denominationCents)} × {item.quantity} = {money(item.subtotalCents)}</span>)}</div></div>)}</div></>}
    <h3 className="mt-5 font-semibold">Arqueo por denominación</h3><div className="mt-2 space-y-1 text-sm">{nonzero.length ? nonzero.map((item) => <div key={item.denominationCents} className="flex justify-between gap-4"><span>{denominationLabel(item.denominationCents)} × {item.quantity}</span><span>{money(item.subtotalCents)}</span></div>) : <p className="text-sm text-slate-500">Sin piezas contadas.</p>}<div className="border-t border-dashed border-slate-300 pt-2"><ReportRow label="Total contado" cents={closure.countedCents} strong/></div></div>
    <div className={`mt-4 rounded-lg p-3 ${closure.differenceCents === 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}><ReportRow label={closure.differenceCents < 0 ? "Faltante" : closure.differenceCents > 0 ? "Sobrante" : "Diferencia"} cents={closure.differenceCents} strong/>{closure.differenceReason && <p className="mt-2 text-sm"><strong>Justificación:</strong> {closure.differenceReason}</p>}</div>
    <p className="mt-5 text-center text-xs text-slate-500">Reporte generado por MiniPOS</p>
  </section>;
}

function ReportRow({ label, cents, strong = false }: { label: string; cents: number; strong?: boolean }) {
  return <div className={`flex justify-between gap-4 ${strong ? "font-bold" : ""}`}><span>{label}</span><span className="tabular-nums">{money(cents)}</span></div>;
}
