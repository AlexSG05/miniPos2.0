import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, Boxes, CircleDollarSign, ShoppingBasket, Store } from "lucide-react";
import { getOpenCashSession, type CashSession } from "../cash-register/cash.api";
import { getDailySalesReport, listRecentSales, type DailySalesReport, type SaleHistoryRow } from "../sales/sales.api";

const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);

export default function DashboardPage() {
  const [report, setReport] = useState<DailySalesReport | null>(null);
  const [cash, setCash] = useState<CashSession | null>(null);
  const [sales, setSales] = useState<SaleHistoryRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([getDailySalesReport(), getOpenCashSession(), listRecentSales()])
      .then(([daily, session, history]) => { setReport(daily); setCash(session); setSales(history.slice(0, 5)); })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  return <main className="space-y-6 bg-slate-50 p-6 text-slate-800">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-slate-500">Vista general</p><h1 className="mt-1 text-2xl font-semibold text-white">Resumen del negocio</h1><p className="mt-1 text-sm text-slate-500">Actividad guardada en este equipo.</p></div><span className="flex items-center gap-2 text-sm text-slate-500"><Activity size={15} />{report?.date ?? "Datos locales"}</span></header>
    {error && <div role="alert" className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">No se pudo cargar el resumen: {error}</div>}
    {loading ? <p className="text-sm text-slate-500">Consultando actividad...</p> : report && <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Total cobrado hoy</p><strong className="mt-2 block text-2xl">{money(report.totalCents)}</strong></article>
        <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Ventas completadas</p><strong className="mt-2 block text-2xl">{report.operations}</strong></article>
        <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Productos con stock bajo</p><strong className="mt-2 block text-2xl">{report.lowStock.length}</strong></article>
        <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Estado de caja</p><strong className={`mt-2 block text-lg ${cash ? "text-emerald-300" : "text-amber-300"}`}>{cash ? "Abierta" : "Sin abrir"}</strong>{cash && <span className="text-xs text-slate-500">Efectivo esperado {money(cash.expectedCents)}</span>}</article>
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 p-4"><h2 className="font-semibold">Actividad reciente</h2><Link className="text-sm text-blue-700" to="/reportes">Ver historial</Link></div>{sales.length === 0 ? <div className="p-5 text-sm text-slate-500">Todavía no hay ventas guardadas.</div> : <div className="divide-y divide-slate-100">{sales.map((sale) => <div key={sale.folio} className="flex items-center justify-between gap-3 p-4"><div><strong className="text-sm">{sale.folio}</strong><p className="mt-1 text-xs text-slate-500">{new Date(sale.createdAt).toLocaleString("es-MX")}</p></div><span className="text-sm">{money(sale.totalCents)}</span></div>)}</div>}</section>
        <section className="space-y-3"><h2 className="px-1 font-semibold">Tareas principales</h2><Link to="/ventas" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:bg-white"><ShoppingBasket className="text-blue-700" /><span className="flex-1"><strong className="block text-sm">Punto de venta</strong><small className="text-slate-500">Registrar un cobro</small></span><ArrowRight size={16} /></Link><Link to="/productos" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:bg-white"><Boxes className="text-blue-700" /><span className="flex-1"><strong className="block text-sm">Productos e inventario</strong><small className="text-slate-500">Administrar catálogo y existencias</small></span><ArrowRight size={16} /></Link><Link to="/caja" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:bg-white"><Store className="text-blue-700" /><span className="flex-1"><strong className="block text-sm">Turno de caja</strong><small className="text-slate-500">{cash ? "Consultar y cerrar turno" : "Abrir caja para comenzar a vender"}</small></span><ArrowRight size={16} /></Link><Link to="/reportes" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:bg-white"><CircleDollarSign className="text-blue-700" /><span className="flex-1"><strong className="block text-sm">Reportes</strong><small className="text-slate-500">Consultar ventas, pagos y alertas de stock</small></span><ArrowRight size={16} /></Link></section>
      </div>
    </>}
  </main>;
}
