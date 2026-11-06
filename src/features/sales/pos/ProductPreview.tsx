/**
 * ============================================================================
 * COMPONENTE: ProductPreview (Vista Previa del Último Producto Escaneado)
 * ============================================================================
 * 
 * PROPÓSITO:
 * Renderiza el panel visual destacado que muestra la información, imagen, 
 * precio y disponibilidad del último producto agregado o seleccionado en el POS.
 *
 * FUNCIONALIDADES CLAVE:
 * 1. Fallback de Imagen: Maneja errores de carga de imagen (`onError`) 
 *    conmutando automáticamente a un icono vectorial por defecto.
 * 2. Indicador visual de Stock: Cambia el estado del badge según el inventario 
 *    disponible (Sin existencias, Stock bajo o Normal).
 * 3. Estado Vacío: Muestra una guía inicial cuando la venta aún no contiene artículos.
 * 4. Adaptabilidad de datos: Soporta opcionalmente la propiedad `imageUrl` anticipando 
 *    respuestas futuras de la API.
 * ============================================================================
 */
import { useState } from "react";
import { Package, ScanBarcode } from "lucide-react";
import type { Product } from "../../products/products.api";
import { UNIT_LABELS, money } from "./pos.utils";

/** El backend aún no devuelve imagen; si algún día lo hace, basta con enviar `imageUrl`. */
type ProductWithImage = Product & { imageUrl?: string | null };

export default function ProductPreview({ product }: { product: Product | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageUrl = (product as ProductWithImage | null)?.imageUrl ?? null;
  const showImage = imageUrl !== null && imageUrl !== failedUrl;
  const inactive = product !== null && !product.active;

  return (
    <section
      aria-label="Último producto escaneado"
      className="flex min-h-[220px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:min-h-0"
    >
      <div className="relative min-h-0 flex-1 bg-gradient-to-b from-slate-50 to-white">
        <span className="absolute left-4 top-4 z-10 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 ring-1 ring-slate-200">
          Último producto
        </span>
        {product === null ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <ScanBarcode size={26} />
            </span>
            <p className="text-sm font-semibold text-slate-600">Sin productos escaneados</p>
            <p className="mt-1 text-xs text-slate-400">Aquí verás el último producto que agregues.</p>
          </div>
        ) : showImage ? (
          <img
            src={imageUrl}
            alt={product.name}
            onError={() => setFailedUrl(imageUrl)}
            className="absolute inset-0 h-full w-full object-contain p-6"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-50 to-slate-100 text-blue-300 ring-1 ring-blue-100">
              <Package size={44} strokeWidth={1.4} />
            </span>
          </div>
        )}
      </div>

      {product !== null && (
        <div className="shrink-0 border-t border-slate-100 p-4">
          <p className="line-clamp-2 text-lg font-bold leading-snug text-slate-900">{product.name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{product.barcode ?? product.internalCode}</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-3xl font-extrabold tabular-nums tracking-tight text-blue-700">
              {money(product.priceCents)}
              <span className="ml-1 text-sm font-semibold text-slate-400">/ {UNIT_LABELS[product.unit]}</span>
            </p>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                inactive
                  ? "bg-rose-50 text-rose-700"
                  : product.stockQuantity < 0
                    ? "bg-rose-50 text-rose-700"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {inactive ? "Producto inactivo" : `${product.stockQuantity} ${UNIT_LABELS[product.unit]} en sistema`}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
