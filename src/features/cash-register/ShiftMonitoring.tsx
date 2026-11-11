import { useMemo, useState } from "react";
import { X } from "lucide-react";

type Cancellation = { time: string; item: string; quantity: number; amountCents: number; authorizedBy: string; reason: string };
type Shift = {
  id: number; cashier: string; register: string; openedAt: string; closedAt?: string;
  openingCents: number; salesCents: number; declaredCents?: number; differenceCents?: number;
  cancellations: Cancellation[];
};

const ago = (days: number, hours = 0) => new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString();
// Mock data for the UI; replace with the cash session monitoring API when multiple terminals are supported.
const mockOpenShifts: Shift[] = [
  { id: 1042, cashier: "María López", register: "Caja 01", openedAt: ago(0, 4), openingCents: 500_000, salesCents: 2_845_500, cancellations: [] },
  { id: 1043, cashier: "Carlos Ruiz", register: "Caja 02", openedAt: ago(0, 2), openingCents: 300_000, salesCents: 1_296_000, cancellations: [{ time: ago(0, 1), item: "Ticket V-00821 · Café americano", quantity: 1, amountCents: 4500, authorizedBy: "Ana Torres", reason: "Captura duplicada" }] },
];
const mockClosedShifts: Shift[] = [
  { id: 1041, cashier: "Ana Torres", register: "Caja 01", openedAt: ago(1, 9), closedAt: ago(1), openingCents: 500_000, salesCents: 4_245_000, declaredCents: 4_750_000, differenceCents: 5_000, cancellations: [] },
  { id: 1040, cashier: "María López", register: "Caja 02", openedAt: ago(2, 8), closedAt: ago(2), openingCents: 300_000, salesCents: 3_842_500, declaredCents: 4_130_000, differenceCents: -12_500, cancellations: [{ time: ago(2, 4), item: "Ticket V-00803 · Leche entera", quantity: 2, amountCents: 5600, authorizedBy: "Ana Torres", reason: "Producto equivocado" }] },
  { id: 1039, cashier: "Carlos Ruiz", register: "Caja 01", openedAt: ago(3, 8), closedAt: ago(3), openingCents: 500_000, salesCents: 2_190_000, declaredCents: 2_690_000, differenceCents: 0, cancellations: [] },
  { id: 1038, cashier: "Ana Torres", register: "Caja 02", openedAt: ago(5, 8), closedAt: ago(5), openingCents: 300_000, salesCents: 3_100_000, declaredCents: 3_400_000, differenceCents: 0, cancellations: [] },
];
const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
const dateTime = (value?: string) => value ? new Date(value).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function ShiftMonitoring() {
  const [selected, setSelected] = useState<Shift | null>(null);
  const recentClosed = useMemo(() => mockClosedShifts.filter((shift) => !!shift.closedAt && Date.now() - new Date(shift.closedAt).getTime() <= 4 * 86_400_000), []);
  return <section className="no-print space-y-5">
    <header><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Supervisión</p><h2 className="mt-1 text-xl font-bold text-slate-900">Monitoreo de turnos de caja</h2><p className="mt-1 text-sm text-slate-500">Doble clic en un turno para consultar sus cancelaciones.</p></header>
    <ShiftTable title="Turnos abiertos" subtitle={`${mockOpenShifts.length} en operación`} shifts={mockOpenShifts} open onSelect={setSelected} />
    <ShiftTable title="Turnos cerrados" subtitle={`Últimos 4 días · ${recentClosed.length} registros`} shifts={recentClosed} onSelect={setSelected} />
    {selected && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="cancellations-title" className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 p-5"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Detalle del turno</p><h2 id="cancellations-title" className="mt-1 text-xl font-bold">Cancelaciones · Turno #{selected.id}</h2><p className="mt-1 text-sm text-slate-500">{selected.cashier} · {selected.register} · {dateTime(selected.openedAt)} – {dateTime(selected.closedAt)}</p></div><button aria-label="Cerrar detalle" onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button></header>
        <div className="min-h-0 overflow-y-auto p-5">{selected.cancellations.length ? <div className="max-h-[55vh] overflow-auto rounded-lg border border-slate-200"><table className="w-full min-w-[700px] text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Hora", "Producto / ticket", "Cantidad · monto", "Autorizó", "Motivo"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{selected.cancellations.map((cancellation, index) => <tr key={`${cancellation.time}-${index}`}><td className="px-3 py-3">{dateTime(cancellation.time)}</td><td className="px-3 py-3">{cancellation.item}</td><td className="px-3 py-3">{cancellation.quantity} · {money(cancellation.amountCents)}</td><td className="px-3 py-3">{cancellation.authorizedBy}</td><td className="px-3 py-3">{cancellation.reason || "—"}</td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm text-slate-600">No se registraron cancelaciones durante este turno</div>}</div>
      </section>
    </div>}
  </section>;
}

function ShiftTable({ title, subtitle, shifts, open = false, onSelect }: { title: string; subtitle: string; shifts: Shift[]; open?: boolean; onSelect: (shift: Shift) => void }) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><header className="flex items-center justify-between gap-3 border-b border-slate-200 p-4"><div><h3 className="font-semibold text-slate-900">{title}</h3><p className="mt-0.5 text-xs text-slate-500">{subtitle}</p></div></header>
    <div className={open ? "overflow-x-auto" : "max-h-[500px] overflow-auto"}><table className="w-full min-w-[900px] text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500"><tr>{(open ? ["Turno", "Cajero / usuario", "Caja", "Apertura", "Fondo inicial", "Ventas acumuladas"] : ["Turno", "Cajero / usuario", "Caja", "Apertura", "Cierre", "Ventas esperadas", "Total declarado", "Diferencia"]).map((label) => <th key={label} className="whitespace-nowrap px-3 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{shifts.length ? shifts.map((shift) => <tr key={shift.id} onDoubleClick={() => onSelect(shift)} className="cursor-pointer select-none hover:bg-blue-50" title="Doble clic para ver cancelaciones"><td className="px-3 py-3 font-mono font-semibold text-blue-700">#{shift.id}</td><td className="px-3 py-3">{shift.cashier}</td><td className="px-3 py-3">{shift.register}</td><td className="px-3 py-3">{dateTime(shift.openedAt)}</td>{open ? <><td className="px-3 py-3 tabular-nums">{money(shift.openingCents)}</td><td className="px-3 py-3 font-semibold tabular-nums">{money(shift.salesCents)}</td></> : <><td className="px-3 py-3">{dateTime(shift.closedAt)}</td><td className="px-3 py-3 tabular-nums">{money(shift.salesCents)}</td><td className="px-3 py-3 tabular-nums">{money(shift.declaredCents ?? 0)}</td><td className={`px-3 py-3 font-semibold tabular-nums ${shift.differenceCents! > 0 ? "text-emerald-700" : shift.differenceCents! < 0 ? "text-amber-700" : "text-slate-500"}`}>{money(shift.differenceCents ?? 0)}</td></>}</tr>) : <tr><td colSpan={open ? 6 : 8} className="p-10 text-center text-sm text-slate-500">No hay turnos {open ? "abiertos" : "cerrados en los últimos cuatro días"}.</td></tr>}</tbody></table></div>
  </section>;
}
