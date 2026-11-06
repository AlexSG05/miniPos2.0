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
import { Pencil, ScanBarcode, Trash2 } from "lucide-react";
import {
  UNIT_LABELS, formatQuantity, lineDiscountCents, lineTotalCents, money, type CartLine,
} from "./pos.utils";

type Props = {
  lines: CartLine[];
  canManageActions: boolean;
  selectedId: number | null;
  onSelect: (productId: number) => void;
  onEdit: (productId: number) => void;
  onRemove: (productId: number) => void;
  onClear: () => void;
};

const th =
  "sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500";
const td = "border-b border-slate-100 px-3 py-2.5";

function EmptyState() {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-50 to-slate-100 text-blue-600 ring-1 ring-blue-100">
        <ScanBarcode size={38} strokeWidth={1.6} />
      </span>
    </div>
  );
}

export default function CartTable({ lines, canManageActions, selectedId, onSelect, onEdit, onRemove, onClear }: Props) {
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
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-500 px-3 text-xs font-semibold text-slate-500 transition hover:bg-rose-50 hover:border-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-rose-600"
        >
          Cancelar venta
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
                <th className={`${th} w-24 text-center`}>Cantidad</th>
                <th className={`${th} w-32 text-right`}>Importe</th>
                {canManageActions && <th className={`${th} w-28 pr-4 text-center`}>Acciones</th>}
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
                    <td className={`${td} text-center font-bold tabular-nums text-slate-900`}>{formatQuantity(line.quantityMilli)} <span className="font-normal text-slate-500">{UNIT_LABELS[product.unit]}</span></td>
                    <td className={`${td} text-right`}>
                      <p className="text-base font-bold tabular-nums text-slate-900">{money(lineTotalCents(line))}</p>
                      {discount > 0 && <p className="text-xs font-medium tabular-nums text-emerald-700">−{money(discount)}</p>}
                    </td>
                    {canManageActions && <td className={`${td} pr-4`}>
                      <div className="flex justify-center gap-1">
                        <button type="button" aria-label={`Editar cantidad de ${product.name}`} title="Editar cantidad" onClick={(event) => { event.stopPropagation(); onEdit(id); }} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"><Pencil size={16} /></button>
                        <button type="button" aria-label={`Eliminar ${product.name} de la venta`} title="Eliminar producto de la venta" onClick={(event) => { event.stopPropagation(); onRemove(id); }} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"><Trash2 size={17} /></button>
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
