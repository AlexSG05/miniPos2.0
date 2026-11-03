import { useEffect, useRef, useState } from "react";
import { Minus, Plus, ScanBarcode, Trash2 } from "lucide-react";
import {
  UNIT_LABELS, clampPercent, formatQuantity, lineDiscountCents, lineTotalCents, money,
  parseQuantityInput, stepMilli, type CartLine,
} from "./pos.utils";

type Props = {
  lines: CartLine[];
  selectedId: number | null;
  onSelect: (productId: number) => void;
  onQuantityChange: (productId: number, quantityMilli: number) => void;
  onDiscountChange: (productId: number, percent: number) => void;
  onRemove: (productId: number) => void;
  onClear: () => void;
  /** Devuelve el foco al campo principal de captura. */
  onDone: () => void;
};

const stepper =
  "flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100";
const th =
  "sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500";
const td = "border-b border-slate-100 px-3 py-2.5";

function QuantityCell({ line, onChange, onDone }: { line: CartLine; onChange: (milli: number) => void; onDone: () => void }) {
  const { product, quantityMilli } = line;
  const step = stepMilli(product.unit);
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  return (
    <div className="inline-flex items-center gap-1">
      <button type="button" aria-label={`Reducir ${product.name}`} onClick={() => onChange(quantityMilli - step)} className={stepper}>
        <Minus size={16} />
      </button>
      <input
        aria-label={`Cantidad de ${product.name}`}
        inputMode="decimal"
        autoComplete="off"
        value={draft ?? formatQuantity(quantityMilli)}
        onFocus={(event) => {
          cancelled.current = false;
          setDraft(formatQuantity(quantityMilli));
          event.currentTarget.select();
        }}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d.,]/g, ""))}
        onBlur={() => {
          if (draft !== null && !cancelled.current) {
            const milli = parseQuantityInput(draft);
            if (milli !== null && milli !== quantityMilli) onChange(milli);
          }
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancelled.current = event.key === "Escape";
            event.currentTarget.blur();
            onDone();
          }
        }}
        className="h-10 w-20 rounded-lg border border-slate-200 bg-slate-50 text-center text-base font-bold tabular-nums text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50"
      />
      <button type="button" aria-label={`Aumentar ${product.name}`} onClick={() => onChange(quantityMilli + step)} className={stepper}>
        <Plus size={16} />
      </button>
    </div>
  );
}

function DiscountCell({ line, onChange, onDone }: { line: CartLine; onChange: (percent: number) => void; onDone: () => void }) {
  const percent = clampPercent(line.discountPercent);
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  return (
    <div className="relative mx-auto w-20">
      <input
        data-discount-input={line.product.id}
        aria-label={`Descuento en porcentaje de ${line.product.name}`}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={draft ?? (percent === 0 ? "" : String(percent))}
        onFocus={(event) => {
          cancelled.current = false;
          setDraft(percent === 0 ? "" : String(percent));
          event.currentTarget.select();
        }}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d.,]/g, ""))}
        onBlur={() => {
          if (draft !== null && !cancelled.current) {
            const next = clampPercent(Number(draft.replace(",", ".")) || 0);
            if (next !== percent) onChange(next);
          }
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancelled.current = event.key === "Escape";
            event.currentTarget.blur();
            onDone();
          }
        }}
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-2 pr-6 text-right text-sm font-semibold tabular-nums text-slate-800 outline-none placeholder:text-slate-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50"
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">%</span>
    </div>
  );
}

function Hint({ keys, text }: { keys: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
      <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700">{keys}</kbd> {text}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-50 to-slate-100 text-blue-600 ring-1 ring-blue-100">
        <ScanBarcode size={38} strokeWidth={1.6} />
      </span>
      <p className="text-xl font-bold text-slate-800">Nueva venta</p>
      <p className="mt-1.5 max-w-sm text-sm text-slate-500">
        Escanea un código de barras o escribe el nombre del producto para comenzar.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-slate-500">
        <Hint keys="F4" text="Buscar" />
        <Hint keys="F2" text="Cantidad" />
        <Hint keys="F12" text="Cobrar" />
      </div>
      <p className="mt-4 text-xs text-slate-400">
        Tip: escribe <span className="font-semibold text-slate-500">3*código</span> para agregar 3 piezas de una vez.
      </p>
    </div>
  );
}

export default function CartTable({ lines, selectedId, onSelect, onQuantityChange, onDiscountChange, onRemove, onClear, onDone }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedId === null) return;
    bodyRef.current?.querySelector(`[data-row-id="${selectedId}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId, lines.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-bold text-slate-900">Venta actual</h2>
          <span className="text-sm text-slate-500">{lines.length === 1 ? "1 artículo" : `${lines.length} artículos`}</span>
        </div>
        <button
          type="button"
          disabled={lines.length === 0}
          onClick={onClear}
          className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500"
        >
          Cancelar venta <kbd className="rounded border border-current/30 px-1.5 py-0.5 text-[10px] font-bold">F1</kbd>
        </button>
      </div>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto">
        {lines.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={`${th} w-14 pl-5 text-left`}>#</th>
                <th className={`${th} text-left`}>Descripción</th>
                <th className={`${th} w-16 text-left`}>U.M.</th>
                <th className={`${th} w-28 text-right`}>Precio</th>
                <th className={`${th} w-44 text-center`}>Cantidad</th>
                <th className={`${th} w-24 text-center`} title="Atajo F3 en la fila seleccionada">% Desc</th>
                <th className={`${th} w-32 text-right`}>Importe</th>
                <th className={`${th} w-14 pr-4`}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const { product } = line;
                const id = product.id;
                const selected = id === selectedId;
                const discount = lineDiscountCents(line);
                return (
                  <tr
                    key={id}
                    data-row-id={id}
                    data-selected={selected}
                    onClick={() => onSelect(id)}
                    className={`cursor-pointer transition-colors ${selected ? "bg-blue-50/70" : "hover:bg-slate-50"}`}
                  >
                    <td className={`${td} pl-5 text-sm font-semibold tabular-nums text-slate-400 ${selected ? "shadow-[inset_3px_0_0_0_#2563eb]" : ""}`}>
                      {index + 1}
                    </td>
                    <td className={`${td} max-w-0`}>
                      <p className="truncate font-semibold text-slate-900">{product.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{product.barcode ?? product.internalCode}</p>
                    </td>
                    <td className={`${td} text-slate-500`}>{UNIT_LABELS[product.unit]}</td>
                    <td className={`${td} text-right tabular-nums text-slate-700`}>{money(product.priceCents)}</td>
                    <td className={`${td} text-center`}>
                      <QuantityCell line={line} onChange={(milli) => onQuantityChange(id, milli)} onDone={onDone} />
                    </td>
                    <td className={`${td} text-center`}>
                      <DiscountCell line={line} onChange={(percent) => onDiscountChange(id, percent)} onDone={onDone} />
                    </td>
                    <td className={`${td} text-right`}>
                      <p className="text-base font-bold tabular-nums text-slate-900">{money(lineTotalCents(line))}</p>
                      {discount > 0 && <p className="text-xs font-medium tabular-nums text-emerald-700">−{money(discount)}</p>}
                    </td>
                    <td className={`${td} pr-4 text-right`}>
                      <button
                        type="button"
                        aria-label={`Quitar ${product.name}`}
                        title="Quitar (Supr)"
                        onClick={(event) => { event.stopPropagation(); onRemove(id); }}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"
                      >
                        <Trash2 size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
