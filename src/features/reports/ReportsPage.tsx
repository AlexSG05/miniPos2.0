import { useEffect, useState, type FormEvent } from "react";
import { getDailySalesReport, getSaleReceipt, listRecentSales, voidSale, type DailySalesReport, type SaleHistoryRow, type SaleReceiptDetails } from "../sales/sales.api";

const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
const localDate = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };

export default function ReportsPage() {
  const [report, setReport] = useState<DailySalesReport | null>(null);
  const [sales, setSales] = useState<SaleHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState(localDate);
  const [endDate, setEndDate] = useState(localDate);
  const [appliedRange, setAppliedRange] = useState({ start: localDate(), end: localDate() });
  const [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState<SaleReceiptDetails | null>(null);
  const [receiptError, setReceiptError] = useState("");

  async function showReceipt(folio: string) {
    setReceiptError("");
    try { setReceipt(await getSaleReceipt(folio)); }
    catch (err) { setReceiptError(String(err)); }
  }

  useEffect(() => {
    void Promise.all([getDailySalesReport(appliedRange.start, appliedRange.end), listRecentSales()])
      .then(([daily, history]) => { setReport(daily); setSales(history); })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [appliedRange]);

  function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startDate || !endDate) { setError("Selecciona ambas fechas."); return; }
    if (endDate < startDate) { setError("La fecha final debe ser igual o posterior a la inicial."); return; }
    setError(""); setLoading(true); setAppliedRange({ start: startDate, end: endDate });
  }

  async function handleVoid(sale: SaleHistoryRow) {
    if (!window.confirm(`¿Anular la venta ${sale.folio}? Se repondrá el inventario y se registrará el reembolso.`)) return;
    const reason = window.prompt("Motivo de la anulación:")?.trim();
    if (!reason) return;
    setError(""); setNotice("");
    try {
      await voidSale({ operationId: crypto.randomUUID(), folio: sale.folio, reason });
      const [daily, history] = await Promise.all([getDailySalesReport(appliedRange.start, appliedRange.end), listRecentSales()]);
      setReport(daily); setSales(history); setNotice(`Venta ${sale.folio} anulada y registrada.`);
    } catch (err) { setError(String(err)); }
  }

  return <main className="min-h-full space-y-6 bg-slate-50 p-6 text-slate-800">
    <header><p className="text-sm text-slate-500">Análisis / Actividad local</p><h1 className="mt-1 text-2xl font-semibold text-white">Reportes</h1><p className="mt-1 text-sm text-slate-500">Resumen calculado desde las ventas guardadas en este equipo.</p></header>
    {error && <div role="alert" className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
    {notice && <div role="status" className="rounded-lg border border-emerald-900 bg-emerald-950/30 p-3 text-sm text-emerald-300">{notice}</div>}
    <form onSubmit={applyRange} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"><label className="text-xs text-slate-500">Desde<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 block rounded border border-slate-200 bg-slate-50 p-2 text-sm text-white" required /></label><label className="text-xs text-slate-500">Hasta<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 block rounded border border-slate-200 bg-slate-50 p-2 text-sm text-white" required /></label><button disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Aplicar periodo</button></form>
    {loading ? <p className="text-sm text-slate-500">Cargando reportes...</p> : report && <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Ventas brutas</p><strong className="mt-2 block text-2xl">{money(report.grossCents)}</strong></article>
        <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Descuentos</p><strong className="mt-2 block text-2xl">{money(report.discountsCents)}</strong></article>
        <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Reembolsos</p><strong className="mt-2 block text-2xl">{money(report.refundCents)}</strong></article>
        <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Ventas netas antes de impuestos</p><strong className="mt-2 block text-2xl">{money(report.grossCents - report.discountsCents - report.refundedSubtotalCents)}</strong></article>
        <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Impuestos calculados</p><strong className="mt-2 block text-2xl">{money(report.taxCents)}</strong></article>
        <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Total cobrado</p><strong className="mt-2 block text-2xl">{money(report.totalCents)}</strong></article>
        <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Operaciones completadas</p><strong className="mt-2 block text-2xl">{report.operations}</strong></article>
        <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Pagos en efectivo</p><strong className="mt-2 block text-2xl">{money(report.cashCents)}</strong></article>
        <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Pagos con tarjeta</p><strong className="mt-2 block text-2xl">{money(report.cardCents)}</strong></article>
      </section>
      <p className="text-xs text-slate-500">Periodo comercial de Ciudad de México: {report.date}. Ventas brutas incluye operaciones completadas y anuladas. Ventas netas descuenta reembolsos antes de impuestos; total cobrado corresponde a ventas vigentes con impuestos calculados.</p>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><h2 className="border-b border-slate-200 p-4 font-semibold">Productos más vendidos hoy</h2>{report.bestSellers.length === 0 ? <p className="p-5 text-sm text-slate-500">Aún no hay ventas registradas hoy.</p> : <div className="divide-y divide-slate-100">{report.bestSellers.map((item) => <div key={item.productName} className="flex items-center justify-between gap-3 p-4"><div><strong className="text-sm">{item.productName}</strong><p className="mt-1 text-xs text-slate-500">{item.quantitySold} unidades vendidas</p></div><span className="text-sm">{money(item.salesCents)}</span></div>)}</div>}</section>
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><h2 className="border-b border-slate-200 p-4 font-semibold">Productos con stock bajo</h2>{report.lowStock.length === 0 ? <p className="p-5 text-sm text-slate-500">No hay productos por debajo de su mínimo.</p> : <div className="divide-y divide-slate-100">{report.lowStock.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 p-4"><strong className="text-sm">{item.name}</strong><span className="text-sm text-amber-300">{item.stockQuantity} / {item.minStock} {item.unit}</span></div>)}</div>}</section>
      </div>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><h2 className="border-b border-slate-200 p-4 font-semibold">Ventas recientes <span className="ml-1 text-sm font-normal text-slate-500">Últimas 100</span></h2>{sales.length === 0 ? <p className="p-5 text-sm text-slate-500">El historial aparecerá después del primer cobro.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-white text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Folio</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Pago</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Estado / acción</th></tr></thead><tbody className="divide-y divide-slate-100">{sales.map((sale) => <tr key={sale.folio}><td className="px-4 py-3 font-medium"><button onClick={() => void showReceipt(sale.folio)} className="text-blue-700 underline-offset-2 hover:underline">{sale.folio}</button></td><td className="px-4 py-3 text-slate-500">{new Date(sale.createdAt).toLocaleString("es-MX")}</td><td className="px-4 py-3 capitalize">{sale.paymentMethods === "cash" ? "Efectivo" : sale.paymentMethods === "card" ? "Tarjeta" : sale.paymentMethods}</td><td className="px-4 py-3 text-right">{money(sale.totalCents)}</td><td className="px-4 py-3">{sale.status === "voided" ? <span className="text-slate-500">Anulada</span> : <button onClick={() => void handleVoid(sale)} className="rounded border border-red-900 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950/40">Anular y reembolsar</button>}</td></tr>)}</tbody></table></div>}</section>
    </>}
    {receiptError && <div role="alert" className="rounded border border-red-900 p-3 text-sm text-red-300">{receiptError}</div>}
    {receipt && <div role="dialog" aria-modal="true" aria-labelledby="receipt-title" className="receipt-dialog fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setReceipt(null)}><section className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase text-slate-500">Comprobante {receipt.status === "voided" ? "· Anulada" : ""}</p><h2 id="receipt-title" className="mt-1 text-xl font-semibold">{receipt.receipt.folio}</h2><p className="mt-1 text-sm text-slate-500">{new Date(receipt.receipt.createdAt).toLocaleString("es-MX")}</p></div><button onClick={() => setReceipt(null)} className="rounded border border-slate-200 px-3 py-1.5 text-sm print:hidden">Cerrar</button></div><div className="mt-5 divide-y divide-slate-100">{receipt.items.map((item, index) => <div key={`${item.internalCode}-${index}`} className="flex justify-between gap-4 py-3 text-sm"><div><p>{item.productName}</p><p className="text-xs text-slate-500">{item.internalCode} · {item.quantity} × {money(item.unitPriceCents)}</p></div><span>{money(item.lineTotalCents)}</span></div>)}</div><div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm"><div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{money(receipt.receipt.subtotalCents)}</span></div><div className="flex justify-between"><span className="text-slate-500">Impuestos</span><span>{money(receipt.receipt.taxCents)}</span></div><div className="flex justify-between text-base font-semibold"><span>Total</span><span>{money(receipt.receipt.totalCents)}</span></div><div className="flex justify-between text-slate-500"><span>Pago</span><span className="capitalize">{receipt.receipt.paymentMethod === "cash" ? "Efectivo" : receipt.receipt.paymentMethod === "card" ? "Tarjeta" : receipt.receipt.paymentMethod}</span></div><div className="flex justify-between text-slate-500"><span>Recibido / cambio</span><span>{money(receipt.receipt.receivedCents)} / {money(receipt.receipt.changeCents)}</span></div></div><div className="mt-5 flex justify-end print:hidden"><button onClick={() => window.print()} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold">Imprimir</button></div></section></div>}
  </main>;
}
