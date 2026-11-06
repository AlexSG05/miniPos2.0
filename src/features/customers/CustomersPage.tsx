import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Printer, UserRound, Wallet, X } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { createCustomer, getCustomerStatement, listCustomers, receiveCustomerPayment, updateCustomer, type Customer, type CustomerInput, type CustomerPaymentReceipt, type CustomerStatement } from "./customers.api";

const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
const localDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX");
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500";
type CustomerForm = { name: string; phone: string; taxId: string; address: string; creditLimit: string; creditDays: string; accountStatus: "active" | "blocked" };
const emptyForm: CustomerForm = { name: "", phone: "", taxId: "", address: "", creditLimit: "0.00", creditDays: "30", accountStatus: "active" };

export default function CustomersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentReceipt, setPaymentReceipt] = useState<CustomerPaymentReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const operation = useRef<{ id: string; fingerprint: string } | null>(null);

  async function load(preferredId = selectedId) {
    setLoading(true);
    try {
      const rows = await listCustomers(); setCustomers(rows);
      const target = preferredId && rows.some((item) => item.id === preferredId) ? preferredId : rows[0]?.id ?? null;
      setSelectedId(target);
      setStatement(target ? await getCustomerStatement(target) : null);
    } catch (cause) { setError(String(cause)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(null); }, []);

  const visibleCustomers = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es-MX");
    return customers.filter((customer) => !term || `${customer.name} ${customer.phone ?? ""} ${customer.taxId ?? ""}`.toLocaleLowerCase("es-MX").includes(term));
  }, [customers, query]);

  async function selectCustomer(customer: Customer) {
    setSelectedId(customer.id); setStatement(null); setPaymentReceipt(null); setError("");
    try { setStatement(await getCustomerStatement(customer.id)); }
    catch (cause) { setError(String(cause)); }
  }

  function startCreate() { setEditingId(null); setForm(emptyForm); setShowForm(true); }
  function startEdit(customer: Customer) {
    setEditingId(customer.id);
    setForm({ name: customer.name, phone: customer.phone ?? "", taxId: customer.taxId ?? "", address: customer.address ?? "", creditLimit: (customer.creditLimitCents / 100).toFixed(2), creditDays: String(customer.creditDays), accountStatus: customer.accountStatus });
    setShowForm(true);
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const cents = Math.round(Number(form.creditLimit) * 100);
      const days = Number(form.creditDays);
      if (!Number.isSafeInteger(cents) || cents < 0 || !Number.isInteger(days) || days < 0 || days > 365) throw new Error("Revisa el límite y los días de crédito.");
      const input: CustomerInput = { name: form.name.trim(), phone: form.phone || null, taxId: form.taxId || null, address: form.address || null, creditLimitCents: cents, creditDays: days, accountStatus: form.accountStatus };
      const saved = editingId ? await updateCustomer(editingId, input) : await createCustomer(input);
      setShowForm(false); setNotice(editingId ? "Cliente actualizado." : "Cliente registrado."); await load(saved.id);
    } catch (cause) { setError(String(cause)); }
    finally { setSaving(false); }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!statement) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const amountCents = Math.round(Number(paymentAmount) * 100);
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > statement.customer.balanceCents) throw new Error("El abono debe ser mayor que cero y no superar el saldo actual.");
      if (paymentMethod === "transfer" && !paymentReference.trim()) throw new Error("Indica la referencia de la transferencia.");
      const payload = { customerId: statement.customer.id, amountCents, method: paymentMethod, reference: paymentReference.trim() };
      const fingerprint = JSON.stringify(payload);
      if (operation.current?.fingerprint !== fingerprint) operation.current = { id: crypto.randomUUID(), fingerprint };
      const receipt = await receiveCustomerPayment({ operationId: operation.current.id, ...payload });
      operation.current = null; setPaymentReceipt(receipt); setShowPayment(false); setPaymentAmount(""); setPaymentReference("");
      setNotice("Abono registrado y aplicado a las cuentas más antiguas."); await load(statement.customer.id);
    } catch (cause) { setError(String(cause)); }
    finally { setSaving(false); }
  }

  return <main className="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-slate-50 p-4 text-slate-800 sm:p-5">
    <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Cartera / Crédito</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Clientes y cuentas por cobrar</h1></div>{isAdmin && <button type="button" onClick={startCreate} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"><UserRound className="mr-2 inline" size={16}/>Nuevo cliente</button>}</header>
    {error && <div role="alert" className="no-print flex shrink-0 items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Cerrar error"><X size={16}/></button></div>}
    {notice && <div role="status" className="no-print shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{notice}</div>}
    <div className="no-print grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,2fr)]">
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="shrink-0 border-b border-slate-200 p-3"><input className={inputClass.replace("mt-1 ", "")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente…" aria-label="Buscar cliente"/></div><div className="min-h-0 flex-1 overflow-auto">{loading ? <p className="p-5 text-sm text-slate-500">Cargando clientes…</p> : visibleCustomers.map((customer) => <button key={customer.id} type="button" onClick={() => void selectCustomer(customer)} className={`w-full border-b border-slate-100 p-4 text-left hover:bg-blue-50 ${selectedId === customer.id ? "bg-blue-50" : ""}`}><span className="flex items-start justify-between gap-2"><strong className="text-sm">{customer.name}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${customer.accountStatus === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{customer.accountStatus === "active" ? "Activa" : "Bloqueada"}</span></span><span className="mt-1 block text-xs text-slate-500">Saldo {money(customer.balanceCents)} / límite {money(customer.creditLimitCents)}</span>{customer.hasOverdue && <span className="mt-1 block text-xs font-semibold text-rose-600">Tiene saldo vencido</span>}</button>)}{!loading && visibleCustomers.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No hay clientes coincidentes.</p>}</div></aside>
      <section className="min-h-0 overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">{statement ? <>
        <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-slate-500">Estado de cuenta</p><h2 className="mt-1 text-xl font-bold">{statement.customer.name}</h2><p className="mt-1 text-sm text-slate-500">{statement.customer.phone || "Sin teléfono"}{statement.customer.taxId ? ` · RFC ${statement.customer.taxId}` : ""}</p></div><div className="flex gap-2"><button type="button" onClick={() => { setPaymentAmount(""); setShowPayment(true); }} disabled={statement.customer.balanceCents <= 0} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Wallet className="mr-1 inline" size={15}/>Registrar abono</button>{isAdmin && <button type="button" onClick={() => startEdit(statement.customer)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Editar</button>}</div></header>
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><Summary label="Saldo actual" value={money(statement.customer.balanceCents)}/><Summary label="Límite" value={money(statement.customer.creditLimitCents)}/><Summary label="Disponible" value={money(Math.max(0, statement.customer.creditLimitCents - statement.customer.balanceCents))}/></div>
        <h3 className="mt-6 font-semibold">Compras a crédito por ticket</h3><div className="mt-2 overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2.5">Ticket / emisión</th><th className="px-3 py-2.5">Vencimiento</th><th className="px-3 py-2.5 text-right">Original</th><th className="px-3 py-2.5 text-right">Abonado</th><th className="px-3 py-2.5 text-right">Pendiente</th><th className="px-3 py-2.5">Estado</th></tr></thead><tbody className="divide-y divide-slate-100">{statement.tickets.map((ticket) => <tr key={ticket.creditSaleId}><td className="px-3 py-2.5"><strong className="font-mono text-blue-700">{ticket.folio}</strong><span className="block text-xs text-slate-500">{new Date(ticket.issuedAt).toLocaleDateString("es-MX")}</span></td><td className="px-3 py-2.5">{localDate(ticket.dueAt)}<span className={`block text-xs ${ticket.daysUntilDue !== null && ticket.daysUntilDue < 0 ? "font-semibold text-rose-600" : "text-slate-500"}`}>{ticket.balanceDueCents <= 0 ? "Liquidado" : ticket.daysUntilDue !== null && ticket.daysUntilDue < 0 ? `Vencido hace ${Math.abs(ticket.daysUntilDue)} días` : ticket.daysUntilDue === 0 ? "Vence hoy" : `Vence en ${ticket.daysUntilDue} días`}</span></td><td className="px-3 py-2.5 text-right">{money(ticket.originalAmountCents)}</td><td className="px-3 py-2.5 text-right">{money(ticket.paidCents)}</td><td className="px-3 py-2.5 text-right font-semibold">{money(ticket.balanceDueCents)}</td><td className="px-3 py-2.5">{ticket.status === "paid" ? "Pagado" : ticket.status === "voided" ? "Anulado" : "Pendiente"}</td></tr>)}</tbody></table>{statement.tickets.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Este cliente aún no tiene ventas a crédito.</p>}</div>
        <h3 className="mt-6 font-semibold">Abonos realizados</h3><div className="mt-2 space-y-2">{statement.payments.map((payment) => <article key={payment.id} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{money(payment.amountCents)} · {payment.method === "cash" ? "Efectivo" : "Transferencia"}</strong><span className="text-slate-500">{new Date(payment.createdAt).toLocaleString("es-MX")} · {payment.cashierName}</span></div>{payment.reference && <p className="mt-1 text-xs text-slate-500">Referencia: {payment.reference}</p>}<p className="mt-1 text-xs text-slate-600">Aplicado a {payment.allocations.map((allocation) => `${allocation.folio} (${money(allocation.allocatedCents)})`).join(", ") || "sin detalle"} · saldo posterior {money(payment.balanceAfterCents)}</p></article>)}{statement.payments.length === 0 && <p className="text-sm text-slate-500">Aún no hay abonos registrados.</p>}</div>
      </> : <div className="grid h-full place-items-center text-center text-sm text-slate-500">Selecciona un cliente para consultar su estado de cuenta.</div>}</section>
    </div>

    {paymentReceipt && <PaymentReceipt receipt={paymentReceipt} onPrint={() => window.print()} onDismiss={() => setPaymentReceipt(null)}/>}
    {showForm && <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><section role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl"><header className="flex justify-between"><div><p className="text-xs font-semibold uppercase text-blue-600">Cuentas por cobrar</p><h2 className="mt-1 text-xl font-bold">{editingId ? "Editar cliente" : "Nuevo cliente"}</h2></div><button type="button" onClick={() => setShowForm(false)} aria-label="Cerrar" className="rounded p-2 hover:bg-slate-100"><X size={18}/></button></header><form onSubmit={(event) => void saveCustomer(event)} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Nombre<input autoFocus className={inputClass} maxLength={160} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label><label className="text-sm font-medium">Teléfono<input className={inputClass} maxLength={40} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/></label><label className="text-sm font-medium">RFC<input className={inputClass} maxLength={32} value={form.taxId} onChange={(event) => setForm({ ...form, taxId: event.target.value })}/></label><label className="text-sm font-medium">Límite de crédito (MXN)<input className={inputClass} type="number" min="0" step="0.01" required value={form.creditLimit} onChange={(event) => setForm({ ...form, creditLimit: event.target.value })}/></label><label className="text-sm font-medium">Días de crédito<input className={inputClass} type="number" min="0" max="365" step="1" required value={form.creditDays} onChange={(event) => setForm({ ...form, creditDays: event.target.value })}/></label><label className="text-sm font-medium">Estado de cuenta<select className={inputClass} value={form.accountStatus} onChange={(event) => setForm({ ...form, accountStatus: event.target.value as CustomerForm["accountStatus"] })}><option value="active">Activa</option><option value="blocked">Bloqueada</option></select></label><label className="text-sm font-medium sm:col-span-2">Dirección<input className={inputClass} maxLength={240} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })}/></label><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar cliente"}</button></div></form></section></div>}
    {showPayment && statement && <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><section role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><header className="flex justify-between"><div><p className="text-xs font-semibold uppercase text-emerald-700">Abono a cuenta</p><h2 className="mt-1 text-xl font-bold">{statement.customer.name}</h2><p className="mt-1 text-sm text-slate-500">Saldo {money(statement.customer.balanceCents)}</p></div><button type="button" onClick={() => setShowPayment(false)} aria-label="Cerrar" className="rounded p-2 hover:bg-slate-100"><X size={18}/></button></header><form onSubmit={(event) => void submitPayment(event)} className="mt-5 grid gap-3"><label className="text-sm font-medium">Importe (MXN)<input autoFocus className={inputClass} type="number" min="0.01" max={(statement.customer.balanceCents / 100).toFixed(2)} step="0.01" required value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)}/></label><label className="text-sm font-medium">Método<select className={inputClass} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "cash" | "transfer")}><option value="cash">Efectivo</option><option value="transfer">Transferencia</option></select></label>{paymentMethod === "transfer" && <label className="text-sm font-medium">Referencia de transferencia<input className={inputClass} maxLength={100} required value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)}/></label>}<p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">El importe se aplicará automáticamente primero a las cuentas con vencimiento más próximo. El backend validará saldos y registrará el movimiento de caja si es efectivo.</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setShowPayment(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Registrando…" : "Registrar abono"}</button></div></form></section></div>}
  </main>;
}

function Summary({ label, value }: { label: string; value: string }) { return <article className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><strong className="mt-1 block text-lg tabular-nums">{value}</strong></article>; }

function PaymentReceipt({ receipt, onPrint, onDismiss }: { receipt: CustomerPaymentReceipt; onPrint: () => void; onDismiss: () => void }) {
  return <section id="credit-payment-receipt" className="credit-payment-print rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-7"><div className="no-print mb-4 flex justify-end gap-2"><button type="button" onClick={onPrint} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"><Printer size={16}/> Imprimir comprobante</button><button type="button" onClick={onDismiss} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cerrar</button></div><div className="text-center"><h2 className="text-xl font-bold">Comprobante de abono</h2><p className="text-sm">Folio A-{String(receipt.id).padStart(6, "0")}</p></div><div className="mt-4 space-y-2 border-y border-dashed border-slate-300 py-3 text-sm"><ReceiptRow label="Cliente" value={receipt.customerName}/><ReceiptRow label="Fecha" value={new Date(receipt.createdAt).toLocaleString("es-MX")}/><ReceiptRow label="Atendió" value={receipt.cashierName}/><ReceiptRow label="Método" value={receipt.method === "cash" ? "Efectivo" : "Transferencia"}/>{receipt.reference && <ReceiptRow label="Referencia" value={receipt.reference}/>}</div><div className="mt-4 space-y-2 text-sm"><ReceiptRow label="Importe recibido" value={money(receipt.amountCents)}/><p className="mt-3 font-semibold">Aplicación</p>{receipt.allocations.map((item) => <div key={item.folio} className="flex justify-between gap-4"><span>{item.folio} · aplicado {money(item.allocatedCents)}</span><span>resta {money(item.balanceAfterCents)}</span></div>)}<div className="border-t border-dashed border-slate-300 pt-3"><ReceiptRow label="Saldo total posterior" value={money(receipt.balanceAfterCents)} strong/></div></div><p className="mt-5 text-center text-xs text-slate-500">Gracias. Conserva este comprobante.</p></section>;
}

function ReceiptRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={`flex justify-between gap-4 ${strong ? "font-bold" : ""}`}><span>{label}</span><span className="text-right">{value}</span></div>; }
