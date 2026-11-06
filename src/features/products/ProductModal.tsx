import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { ImagePlus, X } from "lucide-react";
import type { Category } from "./categories.api";
import type { NewProduct, Product, ProductUpdate } from "./products.api";

type ProductDraft = {
  internalCode: string;
  satKey: string;
  barcode: string;
  name: string;
  unit: Product["unit"];
  cost: string;
  profitPercent: string;
  price: string;
  ivaPercent: string;
  iepsPercent: string;
  categoryId: string;
  stock: string;
  minStock: string;
  description: string;
  imageData: string;
};

const emptyDraft: ProductDraft = {
  internalCode: "", satKey: "", barcode: "", name: "", unit: "piece",
  cost: "", profitPercent: "", price: "", ivaPercent: "0", iepsPercent: "0",
  categoryId: "", stock: "0", minStock: "0", description: "", imageData: "",
};

const inputClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const money = (amount: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);

function draftFromProduct(product: Product): ProductDraft {
  return {
    internalCode: product.internalCode,
    satKey: product.satKey ?? "",
    barcode: product.barcode ?? "",
    name: product.name,
    unit: product.unit,
    cost: (product.costCents / 100).toFixed(2),
    profitPercent: ((product.profitBasisPoints ?? 0) / 100).toFixed(2),
    price: (product.priceCents / 100).toFixed(2),
    ivaPercent: ((product.ivaBasisPoints ?? 0) / 100).toFixed(2),
    iepsPercent: ((product.iepsBasisPoints ?? 0) / 100).toFixed(2),
    categoryId: product.categoryId === null ? "" : String(product.categoryId),
    stock: String(product.stockQuantity),
    minStock: String(product.minStock),
    description: product.description ?? "",
    imageData: product.imageData ?? "",
  };
}

export default function ProductModal({
  categories, product, saving, onClose, onSave,
}: {
  categories: Category[];
  product: Product | null;
  saving: boolean;
  onClose: () => void;
  onSave: (value: NewProduct | ProductUpdate) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ProductDraft>(() => product ? draftFromProduct(product) : emptyDraft);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  function update<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updatePriceFromMargin(costText: string, profitText: string) {
    const cost = Number(costText);
    const profit = Number(profitText);
    if (Number.isFinite(cost) && cost >= 0 && Number.isFinite(profit) && profit >= 0) {
      update("price", (cost * (1 + profit / 100)).toFixed(2));
    }
  }

  async function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Selecciona un archivo de imagen."); return; }
    if (file.size > 2_000_000) { setError("La imagen debe pesar menos de 2 MB."); return; }
    setError("");
    const reader = new FileReader();
    reader.onload = () => update("imageData", typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => setError("No fue posible leer la imagen.");
    reader.readAsDataURL(file);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const cost = Number(draft.cost);
    const price = Number(draft.price);
    const stock = Number(draft.stock);
    const minStock = Number(draft.minStock);
    const profit = Number(draft.profitPercent);
    const iva = Number(draft.ivaPercent);
    const ieps = Number(draft.iepsPercent);
    if (![cost, price, stock, minStock, profit, iva, ieps].every(Number.isFinite)
      || cost < 0 || price < 0 || stock < 0 || minStock < 0
      || profit < 0 || profit > 1000 || iva < 0 || iva > 100 || ieps < 0 || ieps > 100) {
      setError("Revisa los precios, existencias y porcentajes.");
      return;
    }
    if (draft.unit === "piece" && (!Number.isInteger(stock) || !Number.isInteger(minStock))) {
      setError("Las existencias por pieza deben ser números enteros.");
      return;
    }
    const fields = {
      categoryId: draft.categoryId ? Number(draft.categoryId) : null,
      internalCode: draft.internalCode.trim(),
      barcode: draft.barcode.trim() || null,
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      costCents: Math.round(cost * 100),
      priceCents: Math.round(price * 100),
      satKey: draft.satKey.trim() || null,
      profitBasisPoints: Math.round(profit * 100),
      ivaBasisPoints: Math.round(iva * 100),
      iepsBasisPoints: Math.round(ieps * 100),
      imageData: draft.imageData || null,
      minStock,
      unit: draft.unit,
    };
    try {
      await onSave(product
        ? { ...fields, id: product.id }
        : { ...fields, stockQuantity: stock });
    } catch (cause) {
      setError(String(cause));
    }
  }

  const suggestedPrice = Number(draft.cost || 0) * (1 + Number(draft.profitPercent || 0) / 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="product-modal-title" className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Inventario</p><h2 id="product-modal-title" className="mt-1 text-xl font-bold text-slate-900">{product ? "Editar producto" : "Nuevo producto"}</h2></div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar ventana" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </header>
        <form onSubmit={(event) => void submit(event)} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">Código del producto *<input className={inputClass} value={draft.internalCode} maxLength={80} onChange={(event) => update("internalCode", event.target.value)} required /></label>
            <label className="text-sm font-medium text-slate-700">Clave SAT<input className={inputClass} value={draft.satKey} maxLength={20} onChange={(event) => update("satKey", event.target.value)} placeholder="Ej. 01010101" /></label>
            <label className="text-sm font-medium text-slate-700">Código de barras<input className={inputClass} value={draft.barcode} onChange={(event) => update("barcode", event.target.value)} /></label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Nombre del producto *<input className={inputClass} value={draft.name} maxLength={160} onChange={(event) => update("name", event.target.value)} required /></label>
            <label className="text-sm font-medium text-slate-700">Departamento<select className={inputClass} value={draft.categoryId} onChange={(event) => update("categoryId", event.target.value)}><option value="">Sin departamento</option>{categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">Se vende por<select className={inputClass} value={draft.unit} onChange={(event) => update("unit", event.target.value as Product["unit"])}><option value="piece">Pieza (pza)</option><option value="kg">Kilogramo (kg)</option><option value="g">Gramo (g)</option>{/*<option value="liter">Litro (L)</option><option value="ml">Mililitro (ml)</option>*/}</select></label>
            <label className="text-sm font-medium text-slate-700">Costo de compra (MXN) *<input className={inputClass} type="number" min="0" step="0.01" value={draft.cost} onChange={(event) => { update("cost", event.target.value); updatePriceFromMargin(event.target.value, draft.profitPercent); }} required /></label>
            <label className="text-sm font-medium text-slate-700">Ganancia (%) *<input className={inputClass} type="number" min="0" max="1000" step="0.01" value={draft.profitPercent} onChange={(event) => { update("profitPercent", event.target.value); updatePriceFromMargin(draft.cost, event.target.value); }} required /></label>
            <label className="text-sm font-medium text-slate-700">Precio de venta (MXN) *<input className={inputClass} type="number" min="0" step="0.01" value={draft.price} onChange={(event) => update("price", event.target.value)} required /><span className="mt-1 block text-xs font-normal text-slate-500">Sugerido por costo y ganancia: {money(suggestedPrice)}</span></label>
            <label className="text-sm font-medium text-slate-700">IVA (%)<input className={inputClass} type="number" min="0" max="100" step="0.01" value={draft.ivaPercent} onChange={(event) => update("ivaPercent", event.target.value)} /></label>
            <label className="text-sm font-medium text-slate-700">IEPS (%)<input className={inputClass} type="number" min="0" max="100" step="0.01" value={draft.iepsPercent} onChange={(event) => update("iepsPercent", event.target.value)} /></label>
            <label className="text-sm font-medium text-slate-700">{product ? "Existencia actual" : "Existencia inicial"}<input className={inputClass} type="number" min="0" step={draft.unit === "piece" ? "1" : "0.001"} value={draft.stock} onChange={(event) => update("stock", event.target.value)} disabled={Boolean(product)} required /></label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-1">Imagen del producto<input className="sr-only" type="file" accept="image/*" onChange={(event) => void selectImage(event)} /><span className="mt-1 flex h-[46px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 text-sm text-slate-600 hover:border-blue-400 hover:bg-blue-50"><ImagePlus size={17} />{draft.imageData ? "Cambiar imagen" : "Seleccionar imagen"}</span></label>
            {/*<label className="text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">Descripción (opcional)<input className={inputClass} maxLength={1000} value={draft.description} onChange={(event) => update("description", event.target.value)} /></label>*/}
          </div>
          {draft.imageData && <div className="mt-4 flex items-center gap-3"><img src={draft.imageData} alt="Vista previa del producto" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" /><button type="button" className="text-sm text-rose-600 hover:underline" onClick={() => update("imageData", "")}>Quitar imagen</button></div>}
          {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <footer className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "Guardando…" : product ? "Guardar cambios" : "Guardar producto"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
