import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Ban, CalendarDays, ChevronLeft, ChevronRight, Printer, Search, X } from "lucide-react";
import { getSaleReceipt, listSalesByDay, voidSale, type SaleHistoryRow, type SaleReceiptDetails } from "./sales.api";
import { listActiveAdmins, type AdminOption } from "../auth/auth.api";
import { useAuth } from "../auth/useAuth";

const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = () => localDate(new Date());
const shiftDate = (value: string, amount: number) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + amount); return localDate(date); };
const parseAmount = (value: string) => {
  const normalized = value.trim().replace(/[\s$,]/g, "");
  if (!normalized) return undefined;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [pesos, cents = ""] = normalized.split(".");
  return Number(pesos) * 100 + Number((cents + "00").slice(0, 2));
};

export default function SalesHistoryPage() {
  const { user } = useAuth();
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState("");
  const [sales, setSales] = useState<SaleHistoryRow[]>([]);
  const [selected, setSelected] = useState<SaleReceiptDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [voidDialog, setVoidDialog] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [supervisorUsername, setSupervisorUsername] = useState("");
  const [supervisorPassword, setSupervisorPassword] = useState("");
  const [admins, setAdmins] = useState<AdminOption[]>([]);
  const [voidSaving, setVoidSaving] = useState(false);

  const exactAmountCents = useMemo(() => parseAmount(amount), [amount]);
  const loadSales = useCallback(async () => {
    if (exactAmountCents === null) { setError("Escribe un monto válido, por ejemplo 250.00."); setSales([]); setLoading(false); return; }
    setLoading(true); setError("");
    try { setSales(await listSalesByDay(date, search, exactAmountCents)); }
    catch (cause) { setError(String(cause)); setSales([]); }
    finally { setLoading(false); }
  }, [date, search, exactAmountCents]);

  useEffect(() => { void loadSales(); }, [loadSales]);

  useEffect(() => {
    if (user?.role !== "cashier") return;
    void listActiveAdmins().then((rows) => {
      setAdmins(rows);
      setSupervisorUsername(rows[0]?.username ?? "");
    }).catch((cause) => setError(String(cause)));
  }, [user?.role]);

  async function openSale(sale: SaleHistoryRow) {
    setSelected(null); setDetailLoading(true); setError("");
    try { setSelected(await getSaleReceipt(sale.folio)); }
    catch (cause) { setError(String(cause)); }
    finally { setDetailLoading(false); }
  }

  async function confirmVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setVoidSaving(true); setError(""); setNotice("");
    try {
      await voidSale({
        operationId: crypto.randomUUID(), folio: selected.receipt.folio, reason: voidReason.trim(),
        ...(user?.role === "cashier" ? { supervisorUsername, supervisorPassword } : {}),
      });
      const folio = selected.receipt.folio;
      setVoidDialog(false); setSupervisorPassword(""); setVoidReason("");
      await loadSales();
      setSelected(await getSaleReceipt(folio));
      setNotice(`La venta ${folio} fue anulada.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setVoidSaving(false); }
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-slate-50 text-slate-800">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Ventas / Consultas</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Ventas del día</h1><p className="mt-1 text-sm text-slate-500">Busca por folio, cajero o monto exacto; haz doble clic para ver el detalle.</p></div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1"><button type="button" onClick={() => setDate((value) => shiftDate(value, -1))} aria-label="Día anterior" className="rounded-md p-2 text-slate-600 hover:bg-slate-100"><ChevronLeft size={18} /></button><label className="flex items-center gap-2 px-1 text-sm text-slate-600"><CalendarDays size={16} /><input type="date" aria-label="Fecha de ventas" max={today()} value={date} onChange={(event) => setDate(event.target.value)} className="border-0 bg-transparent text-sm outline-none" /></label><button type="button" onClick={() => setDate((value) => shiftDate(value, 1))} disabled={date >= today()} aria-label="Día siguiente" className="rounded-md p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={18} /></button><button type="button" onClick={() => setDate(today())} disabled={date === today()} className="rounded-md px-2 py-1.5 text-xs font-semibold text-blue-700 disabled:text-slate-300">Hoy</button></div>
      </header>

      {error && <div role="alert" className="flex shrink-0 items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Cerrar error"><X size={16} /></button></div>}
      {notice && <div role="status" className="no-print shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{notice}</div>}

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <form className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 p-3" onSubmit={(event) => { event.preventDefault(); void loadSales(); }}>
            <label className="relative min-w-[180px] flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Folio o cajero…" aria-label="Buscar por folio o cajero" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:bg-white" /></label>
            <label className="w-36"><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Monto exacto" aria-label="Buscar por monto exacto" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:bg-white" /></label>
            <button className="rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Buscar</button>
          </form>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[600px] text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Folio / hora</th><th className="px-3 py-3">Cajero</th><th className="px-3 py-3">Pago</th><th className="px-3 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={4} className="p-10 text-center text-slate-500">Cargando ventas…</td></tr> : sales.length === 0 ? <tr><td colSpan={4} className="p-10 text-center text-slate-500">No hay ventas que coincidan con la búsqueda.</td></tr> : sales.map((sale) => <tr key={sale.folio} onDoubleClick={() => void openSale(sale)} onClick={() => setSelected((current) => current?.receipt.folio === sale.folio ? current : null)} className={`cursor-pointer select-none hover:bg-blue-50 ${selected?.receipt.folio === sale.folio ? "bg-blue-50" : ""}`} title="Doble clic para ver el detalle"><td className="px-3 py-3"><strong className="font-mono text-xs text-blue-700">{sale.folio}</strong><p className="mt-1 text-xs text-slate-500">{new Date(sale.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p></td><td className="px-3 py-3">{sale.cashierName}</td><td className="px-3 py-3">{sale.paymentMethods === "cash" ? "Efectivo" : sale.paymentMethods === "card" ? "Tarjeta" : sale.paymentMethods === "credit" ? "Crédito" : sale.paymentMethods || "—"}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{money(sale.totalCents)}{sale.status === "voided" && <span className="mt-1 block text-xs font-medium text-rose-600">Anulada</span>}</td></tr>)}
            </tbody></table>
          </div>
          <footer className="shrink-0 border-t border-slate-200 px-4 py-2 text-xs text-slate-500">{sales.length} ventas · Fecha comercial: {date}</footer>
        </div>

        <aside className="sale-ticket-print flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {detailLoading ? <div className="m-auto text-sm text-slate-500">Cargando detalle…</div> : !selected ? <div className="m-auto max-w-xs p-6 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600"><Search size={20} /></div><h2 className="mt-3 font-semibold text-slate-800">Detalle de venta</h2><p className="mt-1 text-sm text-slate-500">Haz doble clic en una venta para consultar sus artículos y datos de pago.</p></div> : <>
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">{selected.status === "voided" ? "Venta anulada" : "Comprobante de venta"}</p><h2 className="mt-1 font-mono text-lg font-bold text-slate-900">{selected.receipt.folio}</h2><p className="mt-1 text-xs text-slate-500">{new Date(selected.receipt.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "medium" })}</p></div><button type="button" onClick={() => setSelected(null)} aria-label="Cerrar detalle" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 print:hidden"><X size={17} /></button></header>
            <div className="min-h-0 flex-1 overflow-auto p-4"><div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm"><div><span className="block text-xs text-slate-500">Cajero</span><strong>{selected.receipt.cashierName}</strong></div><div><span className="block text-xs text-slate-500">Forma de pago</span><strong>{selected.receipt.paymentMethod === "cash" ? "Efectivo" : selected.receipt.paymentMethod === "card" ? "Tarjeta" : selected.receipt.paymentMethod === "credit" ? "Crédito" : selected.receipt.paymentMethod}</strong></div>{selected.receipt.customerName && <div><span className="block text-xs text-slate-500">Cliente</span><strong>{selected.receipt.customerName}</strong></div>}{selected.receipt.dueAt && <div><span className="block text-xs text-slate-500">Vence</span><strong>{new Date(`${selected.receipt.dueAt.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX")}</strong></div>}</div>
              <div className="mt-4"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Artículos</h3><div className="divide-y divide-slate-100">{selected.items.map((item, index) => <div key={`${item.internalCode}-${index}`} className="flex items-start justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="font-medium text-slate-800">{item.productName}</p><p className="mt-0.5 text-xs text-slate-500">{item.internalCode} · {item.quantity} × {money(item.unitPriceCents)}</p></div><span className="shrink-0 font-medium tabular-nums">{money(item.lineTotalCents)}</span></div>)}</div></div>
              <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{money(selected.receipt.subtotalCents)}</span></div>{selected.receipt.discountCents > 0 && <div className="flex justify-between"><span className="text-slate-500">Descuento</span><span>−{money(selected.receipt.discountCents)}</span></div>}<div className="flex justify-between"><span className="text-slate-500">Impuestos</span><span>{money(selected.receipt.taxCents)}</span></div><div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold"><span>Total</span><span>{money(selected.receipt.totalCents)}</span></div>{selected.receipt.paymentMethod === "credit" ? <div className="flex justify-between text-xs font-semibold text-amber-800"><span>Saldo a crédito</span><span>{money(selected.receipt.totalCents)}</span></div> : <div className="flex justify-between text-xs text-slate-500"><span>Recibido / cambio</span><span>{money(selected.receipt.receivedCents)} / {money(selected.receipt.changeCents)}</span></div>}</div>
            </div><footer className="shrink-0 border-t border-slate-200 p-3 print:hidden"><div className="flex gap-2">{selected.status === "completed" && (user?.role === "admin" || user?.role === "cashier") && <button type="button" onClick={() => { setVoidReason(""); setSupervisorPassword(""); setVoidDialog(true); }} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-rose-200 px-3 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"><Ban size={16}/>Anular venta</button>}<button type="button" onClick={() => window.print()} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"><Printer size={16} /> Reimprimir</button></div></footer>
          </>}
        </aside>
      </section>
      {voidDialog && selected && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4"><section role="dialog" aria-modal="true" aria-labelledby="void-sale-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><header className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Anulación de venta</p><h2 id="void-sale-title" className="mt-1 text-xl font-bold">{selected.receipt.folio}</h2><p className="mt-1 text-sm text-slate-600">Se repondrá el inventario y se registrará el reembolso cuando corresponda.</p></div><button type="button" onClick={() => setVoidDialog(false)} aria-label="Cerrar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button></header><form onSubmit={(event) => void confirmVoid(event)} className="mt-5 grid gap-4"><label className="text-sm font-medium text-slate-700">Motivo<textarea autoFocus rows={3} maxLength={240} required value={voidReason} onChange={(event) => setVoidReason(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500" placeholder="Describe por qué se anula esta venta"/></label>{user?.role === "cashier" && <><p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Un administrador debe autorizar la anulación.</p><label className="text-sm font-medium text-slate-700">Usuario administrador<select required value={supervisorUsername} onChange={(event) => setSupervisorUsername(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="">Selecciona un administrador</option>{admins.map((admin) => <option key={admin.username} value={admin.username}>{admin.displayName} ({admin.username})</option>)}</select></label><label className="text-sm font-medium text-slate-700">Contraseña del administrador<input required type="password" autoComplete="current-password" value={supervisorPassword} onChange={(event) => setSupervisorPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"/></label></>}<div className="flex justify-end gap-2"><button type="button" disabled={voidSaving} onClick={() => setVoidDialog(false)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold">Volver</button><button type="submit" disabled={voidSaving || (user?.role === "cashier" && admins.length === 0)} className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{voidSaving ? "Validando…" : "Autorizar y anular"}</button></div></form></section></div>}
    </main>
  );
}
