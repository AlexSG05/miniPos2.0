
/**
 * ============================================================================
 * COMPONENTE: QuickEntryBar (Barra Inferior de Captura Rápida y Cobro POS)
 * ============================================================================
 * 
 * PROPÓSITO:
 * Componente interactivo clave del POS para la captura rápida de productos 
 * (mediante lectura de código de barras o búsqueda manual) y activación del cobro.
 *
 * FUNCIONALIDADES CLAVE:
 * 1. Campo de Cantidad (F2): Define multiplicadores antes de escanear y transfiere 
 *    el foco al campo de código al presionar Enter.
 * 2. Autocompletado WAI-ARIA (F4): Lista de sugerencias dinámica navegable por 
 *    teclado (Flechas arriba/abajo + Enter) con alertas de inventario.
 * 3. Disparador de Cobro (F12): Botón de confirmación global con contador visual 
 *    de artículos que activa la pasarela de pago.
 * 4. Optimizado para Lectores de Código: Diseñado para recibir entradas continuas 
 *    de escáneres láser/USB sin perder el foco del cursor.
 * ============================================================================
 */
import type { KeyboardEvent, RefObject } from "react";
import { ScanBarcode, Search } from "lucide-react";
import type { Product } from "../../products/products.api";
import { UNIT_LABELS, money } from "./pos.utils";

type Props = {
  quantityText: string;
  onQuantityChange: (value: string) => void;
  query: string;
  onQueryChange: (value: string) => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  quantityRef: RefObject<HTMLInputElement | null>;
  suggestions: Product[];
  showSuggestions: boolean;
  highlight: number;
  onHighlight: (index: number) => void;
  onPick: (product: Product) => void;
  articleCount: number;
  hasItems: boolean;
  onCharge: () => void;
  onOpenSearch: () => void;
};

const label = "mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500";
const kbd = "rounded border border-current/30 px-1 py-px text-[9px] font-bold leading-none opacity-80";

export default function QuickEntryBar({
  quantityText, onQuantityChange, query, onQueryChange, onInputKeyDown, inputRef, quantityRef,
  suggestions, showSuggestions, highlight, onHighlight, onPick, articleCount, hasItems, onCharge, onOpenSearch,
}: Props) {
  const count = Number.isInteger(articleCount) ? String(articleCount) : articleCount.toFixed(2);

  return (
    <div className="shrink-0 border-t border-slate-200 bg-slate-50 p-3 sm:p-4">
      <div className="flex items-end gap-3">
        <div className="w-24 shrink-0 sm:w-28">
          <label htmlFor="pos-quantity" className={label}>Cantidad <kbd className={kbd}>F3</kbd></label>
          <input
            id="pos-quantity"
            ref={quantityRef}
            inputMode="decimal"
            autoComplete="off"
            value={quantityText}
            onChange={(event) => onQuantityChange(event.target.value.replace(/[^\d.,]/g, ""))}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                inputRef.current?.focus();
              }
            }}
            className="h-14 w-full rounded-xl border-2 border-slate-200 bg-white text-center text-2xl font-bold tabular-nums text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
          />
        </div>

        <div className="relative min-w-0 flex-1">
          <label htmlFor="pos-code" className={label}>Código de barras / búsqueda <kbd className={kbd}>F4</kbd></label>
          {showSuggestions && (
            <ul
              id="pos-suggestions"
              role="listbox"
              aria-label="Productos encontrados"
              onMouseDown={(event) => event.preventDefault()}
              className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
            >
              {suggestions.map((product, index) => {
                const inactive = !product.active;
                return (
                  <li
                    key={product.id}
                    id={`pos-suggestion-${index}`}
                    role="option"
                    aria-selected={index === highlight}
                    onMouseEnter={() => onHighlight(index)}
                    onClick={() => onPick(product)}
                    className={`flex cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-2.5 ${
                      index === highlight ? "bg-blue-50" : ""
                    } ${inactive ? "opacity-60" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{product.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {product.internalCode}
                        {product.barcode ? ` · ${product.barcode}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold tabular-nums text-slate-900">{money(product.priceCents)}</p>
                      <p className={`text-xs ${inactive ? "text-rose-600" : "text-slate-500"}`}>
                        {inactive ? "Producto inactivo" : `${product.stockQuantity} ${UNIT_LABELS[product.unit]} en sistema`}
                      </p>
                    </div>
                  </li>
                );
              })}
              <li className="px-3 pb-1.5 pt-1 text-[11px] text-slate-400" aria-hidden>
                ↑ ↓ para elegir · Enter para agregar
              </li>
            </ul>
          )}
          <div className="relative">
            <ScanBarcode className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={22} />
            <input
              id="pos-code"
              ref={inputRef}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={showSuggestions}
              aria-controls="pos-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={showSuggestions ? `pos-suggestion-${highlight}` : undefined}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={onInputKeyDown}
              className="h-14 w-full rounded-xl border-2 border-slate-200 bg-white pl-12 pr-4 text-lg font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSearch}
          title="Buscar producto por nombre (F6 o Ctrl+F)"
          className="flex h-14 shrink-0 items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-50"
        >
          <Search size={18} />
          <span className="hidden sm:inline">Buscar</span>
          <kbd className={kbd}>F6</kbd>
        </button>

        <button
          type="button"
          onClick={onCharge}
          disabled={!hasItems}
          title="Cobrar la cuenta (F12 o Ctrl+Enter)"
          className="flex h-14 shrink-0 items-center gap-2.5 rounded-xl bg-blue-600 px-4 text-base font-extrabold tracking-wide text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-300 sm:px-6"
        >
          <span>COBRAR</span>
          <div className="flex flex-col items-center leading-none gap-0.5">
            <kbd className="rounded border border-white/40 bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">F12</kbd>
            <span className="text-[9px] font-semibold opacity-90">Ctrl+↵</span>
          </div>
          <span
            aria-label={`${count} artículos`}
            className={`min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums ${hasItems ? "bg-white text-blue-700" : "bg-white/60 text-slate-500"}`}
          >
            {count}
          </span>
        </button>
      </div>
    </div>
  );
}
