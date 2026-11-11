/**
 * ============================================================================
 * COMPONENTE: ProductSearchDialog (Buscador de productos en modal)
 * ============================================================================
 *
 * PROPÓSITO:
 * Permite encontrar un producto por nombre cuando el cajero no tiene el código.
 * Arriba hay un campo de búsqueda y debajo una tabla que se filtra letra por letra.
 *
 * FUNCIONAMIENTO:
 * 1. Al abrir, descarga una sola vez los productos activos y filtra en memoria,
 *    así cada tecla responde al instante (sin consultar la base en cada letra).
 * 2. La búsqueda ignora mayúsculas y acentos, y acepta varias palabras
 *    ("coca 600" encuentra "Coca-Cola 600 ml"). Busca en nombre, código interno,
 *    código de barras y categoría.
 * 3. Teclado: ↑ ↓ para moverse, Enter o clic para agregar, Esc para cerrar.
 * ============================================================================
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import Modal from "./Modal";
import { searchSaleProducts } from "../sales.api";
import type { Product } from "../../products/products.api";
import { UNIT_LABELS, money } from "./pos.utils";

type Props = {
  onPick: (product: Product) => void;
  onClose: () => void;
};

/** Máximo de filas dibujadas a la vez, para que la tabla siga fluida con catálogos grandes. */
const MAX_ROWS = 100;

const normalize = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Indexed = { product: Product; haystack: string; name: string };

export default function ProductSearchDialog({ onPick, onClose }: Props) {
  const [term, setTerm] = useState("");
  const [products, setProducts] = useState<Indexed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    searchSaleProducts("")
      .then((items) => {
        if (!active) return;
        setProducts(
          items.map((product) => ({
            product,
            name: normalize(product.name),
            haystack: normalize(
              [product.name, product.internalCode, product.barcode ?? "", product.categoryName ?? ""].join(" "),
            ),
          })),
        );
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const { rows, total } = useMemo(() => {
    const words = normalize(term).split(/\s+/).filter(Boolean);
    if (words.length === 0) return { rows: products.slice(0, MAX_ROWS).map((item) => item.product), total: products.length };
    const matches = products.filter((item) => words.every((word) => item.haystack.includes(word)));
    // Primero los que empiezan con lo escrito; el resto conserva el orden alfabético.
    const first = words[0];
    const startsWith = matches.filter((item) => item.name.startsWith(first));
    const others = matches.filter((item) => !item.name.startsWith(first));
    return { rows: [...startsWith, ...others].slice(0, MAX_ROWS).map((item) => item.product), total: matches.length };
  }, [products, term]);

  useEffect(() => {
    setHighlight(0);
  }, [term]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (rows.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((current) => (current + delta + rows.length) % rows.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const product = rows[highlight];
      if (product) onPick(product);
    }
  }

  return (
    <Modal title="Buscar producto" onClose={onClose} widthClass="max-w-5xl">
      <div className="flex h-[min(78vh,720px)] flex-col">
        <div className="shrink-0 border-b border-slate-100 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Escribe el nombre, código o categoría del producto…"
              aria-label="Buscar producto"
              className="h-12 w-full rounded-xl border-2 border-slate-200 bg-white pl-12 pr-11 text-base font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
            />
            {term && (
              <button
                type="button"
                aria-label="Borrar búsqueda"
                onClick={() => setTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-auto">
          {error ? (
            <p role="alert" className="m-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>
          ) : loading ? (
            <p className="p-8 text-center text-sm text-slate-500">Cargando productos…</p>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">No hay productos que coincidan con “{term.trim()}”.</p>
          ) : (
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Producto</th>
                  <th className="px-4 py-2.5">Código</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">Categoría</th>
                  <th className="px-4 py-2.5 text-right">Precio</th>
                  <th className="px-4 py-2.5 text-right">Existencia</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((product, index) => (
                  <tr
                    key={product.id}
                    data-row={index}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => onPick(product)}
                    className={`cursor-pointer border-t border-slate-100 ${index === highlight ? "bg-blue-50" : ""}`}
                  >
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{product.name}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {product.internalCode}
                      {product.barcode ? <span className="block">{product.barcode}</span> : null}
                    </td>
                    <td className="hidden px-4 py-2.5 text-slate-600 md:table-cell">{product.categoryName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums text-slate-900">{money(product.priceCents)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${product.stockQuantity <= 0 ? "font-semibold text-rose-600" : "text-slate-600"}`}>
                      {product.stockQuantity} {UNIT_LABELS[product.unit]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
          <span>
            {loading ? "" : total > MAX_ROWS ? `Mostrando ${MAX_ROWS} de ${total}. Sigue escribiendo para acotar.` : `${total} producto${total === 1 ? "" : "s"}`}
          </span>
          <span aria-hidden>↑ ↓ para elegir · Enter o clic para agregar · Esc para cerrar</span>
        </div>
      </div>
    </Modal>
  );
}
