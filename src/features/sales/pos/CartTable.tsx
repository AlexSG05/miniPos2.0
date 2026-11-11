/**
 * ============================================================================
 * COMPONENTE: CartTable (Tabla de Carrito del Punto de Venta)
 * ============================================================================
 * 
 * PROPÓSITO:
 * Muestra y gestiona los productos de la venta en curso dentro del sistema POS.
 *
 * FUNCIONALIDADES CLAVE:
 * 1. Visualización de ítems: Lista productos con su código, precio, subtotal y descuentos.
 * 2. La cantidad del carrito se cambia desde la acción protegida de edición.
 * 3. Descuentos por renglón (DiscountCell): Edición de % de descuento por ítem.
 * 4. Navegación y Foco: Maneja teclas Enter/Escape para confirmar o cancelar edición 
 *    y devuelve el foco al lector de código de barras mediante `onDone`.
 * 5. Auto-Scroll: Desplaza la tabla automáticamente al producto seleccionado.
 * 6. Estado Vacío (EmptyState): Muestra guía visual y atajos cuando el carrito está vacío.
 * ============================================================================
 */
import { useEffect, useRef } from "react";
import { Banknote, Percent, Pencil, ScanBarcode, Trash2 } from "lucide-react";
import {
  UNIT_LABELS, formatQuantity, lineDiscountCents, lineTotalCents, money, type CartLine,
} from "./pos.utils";

type Props = {
  lines: CartLine[];
  canManageActions: boolean;
  selectedId: string | null;
  onSelect: (lineId: string) => void;
  onEdit: (lineId: string) => void;
  onRemove: (lineId: string) => void;
  onClear: () => void;
  onOpenWithdrawal?: () => void;
  onOpenDiscount?: () => void;
};

const th =
  "sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500";
const td = "border-b border-slate-100 px-3 py-2.5";

function EmptyState() {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-50 to-slate-100 text-blue-600 ring-1 ring-blue-100">
        <ScanBarcode size={38} strokeWidth={1.6} />
      </span>
      <p className="text-sm font-semibold text-slate-700">Listo para escanear o buscar productos</p>
      <p className="mt-1 text-xs text-slate-400">Escanea con el lector o presiona F6 para buscar por nombre</p>
    </div>
  );
}

export default function CartTable({
  lines,
  canManageActions,
  selectedId,
  onSelect,
  onEdit,
  onRemove,
  onClear,
  onOpenWithdrawal,
  onOpenDiscount,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedId === null) return;
    bodyRef.current?.querySelector(`[data-row-id="${selectedId}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId, lines.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 bg-slate-50/50">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Venta actual</h2>
          <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
            {lines.length === 1 ? "1 artículo" : `${lines.length} artículos`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {onOpenWithdrawal && (
            <button
              type="button"
              onClick={onOpenWithdrawal}
              title="Registrar salida o retiro de dinero de caja (F8 o Alt+R)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              <Banknote size={14} className="text-amber-700" />
              <span>Retiro</span>
              <kbd className="rounded bg-white/90 px-1 py-0.5 text-[9px] font-bold text-amber-900 shadow-xs">F8</kbd>
            </button>
          )}

          {onOpenDiscount && (
            <button
              type="button"
              disabled={lines.length === 0}
              onClick={onOpenDiscount}
              title="Aplicar descuento a toda la cuenta (F2 o Alt+D)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-800 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <Percent size={13} className="text-blue-700" />
              <span>Descuento</span>
              <kbd className="rounded bg-white/90 px-1 py-0.5 text-[9px] font-bold text-blue-900 shadow-xs">F2</kbd>
            </button>
          )}

          <button
            type="button"
            disabled={lines.length === 0}
            onClick={onClear}
            title="Cancelar toda la venta y vaciar carrito (F1 o Alt+X)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-rose-200"
          >
            <Trash2 size={13} className="text-rose-600" />
            <span>Cancelar</span>
            <kbd className="rounded bg-white/90 px-1 py-0.5 text-[9px] font-bold text-rose-800 shadow-xs">F1</kbd>
          </button>
        </div>
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
                <th className={`${th} w-28 text-center`}>Cantidad</th>
                <th className={`${th} w-32 text-right`}>Importe</th>
                {canManageActions && <th className={`${th} w-28 pr-4 text-center`}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const { product, lineId } = line;
                const selected = lineId === selectedId;
                const discount = lineDiscountCents(line);
                return (
                  <tr
                    key={lineId}
                    data-row-id={lineId}
                    data-selected={selected}
                    onClick={() => onSelect(lineId)}
                    className={`cursor-pointer transition-colors ${selected ? "bg-blue-50/80" : "hover:bg-slate-50"}`}
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
                    <td className={`${td} text-center font-bold tabular-nums text-slate-900`}>{formatQuantity(line.quantityMilli)} <span className="font-normal text-slate-500">{UNIT_LABELS[product.unit]}</span></td>
                    <td className={`${td} text-right`}>
                      <p className="text-base font-bold tabular-nums text-slate-900">{money(lineTotalCents(line))}</p>
                      {discount > 0 && <p className="text-xs font-semibold tabular-nums text-emerald-700">−{money(discount)} ({line.discountPercent}%)</p>}
                    </td>
                    {canManageActions && <td className={`${td} pr-4`}>
                      <div className="flex justify-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`Editar cantidad de ${product.name}`}
                          title="Cambiar cantidad (F3)"
                          onClick={(event) => { event.stopPropagation(); onEdit(lineId); }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Eliminar ${product.name} de la venta`}
                          title="Quitar producto de la venta (Supr / Delete)"
                          onClick={(event) => { event.stopPropagation(); onRemove(lineId); }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50/70 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-200"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>}
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
