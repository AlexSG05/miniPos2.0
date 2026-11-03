import { amount, money, type Totals } from "./pos.utils";

type Props = { totals: Totals; lastFolio: string | null };

function Row({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-semibold tabular-nums ${accent ? "text-emerald-700" : "text-slate-800"}`}>{value}</dd>
    </div>
  );
}

export default function TotalsCard({ totals, lastFolio }: Props) {
  const total = amount(totals.totalCents);
  // La cifra se achica al crecer para no desbordar el panel.
  const size = total.length <= 8 ? "text-6xl" : total.length <= 11 ? "text-5xl" : "text-4xl";

  return (
    <section aria-label="Totales de la venta" className="shrink-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <dl className="space-y-1.5">
        <Row label="Sub-total" value={money(totals.subtotalCents)} />
        <Row
          label="Descuento total"
          value={totals.discountCents > 0 ? `−${money(totals.discountCents)}` : money(0)}
          accent={totals.discountCents > 0}
        />
        <Row label="Impuestos" value={money(totals.taxCents)} />
      </dl>

      <div className="rounded-xl bg-slate-950 px-5 pb-4 pt-3.5 ring-1 ring-slate-800">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Total</p>
        <p
          aria-live="polite"
          aria-label={`Total ${money(totals.totalCents)}`}
          className={`mt-1 flex items-baseline justify-end gap-2 overflow-hidden font-extrabold tabular-nums tracking-tight text-green-400 [text-shadow:0_0_28px_rgba(74,222,128,0.35)] ${size}`}
        >
          <span aria-hidden className="text-3xl font-bold text-green-500/70">$</span>
          <span aria-hidden>{total}</span>
        </p>
        <dl className="mt-3.5 grid grid-cols-3 gap-2 border-t border-slate-800 pt-3 text-xs">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Folio</dt>
            <dd className="mt-0.5 font-semibold text-slate-200">Nuevo</dd>
          </div>
          <div className="text-center">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Art:</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-slate-200">{totals.articleCount.toFixed(2)}</dd>
          </div>
          <div className="text-right">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Peso</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-slate-200">{totals.weightKg.toFixed(3)} KG</dd>
          </div>
        </dl>
        {lastFolio && <p className="mt-2.5 truncate text-[11px] text-slate-500">Última venta: {lastFolio}</p>}
      </div>
    </section>
  );
}
