import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, ArrowDownToLine, Boxes, CircleDollarSign, Clock3, Image as ImageIcon, PackagePlus, Plus, Search, Tags, X } from "lucide-react";
import { createCategory, listCategories, type Category } from "./categories.api";
import { adjustInventory, createProduct, listInventoryMovements, listProducts, setProductActive, updateProduct, type InventoryMovement, type NewProduct, type Product, type ProductUpdate } from "./products.api";
import ProductModal from "./ProductModal";

type ModalName = "category" | "adjustment" | "movements" | null;
const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
const quantity = (value: number) => new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(value);

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [productModal, setProductModal] = useState<Product | null | undefined>(undefined);
  const [modal, setModal] = useState<ModalName>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [adjustment, setAdjustment] = useState({ productId: "", quantity: "", direction: "in" as "in" | "out", reason: "" });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [productRows, categoryRows] = await Promise.all([
        listProducts(undefined, { includeInactive: true }),
        listCategories(true),
      ]);
      setProducts(productRows);
      setCategories(categoryRows);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-MX");
    return products.filter((product) => {
      if (!includeInactive && !product.active) return false;
      if (categoryFilter && String(product.categoryId ?? "") !== categoryFilter) return false;
      if (!term) return true;
      return [product.name, product.internalCode, product.barcode ?? "", product.satKey ?? ""]
        .some((value) => value.toLocaleLowerCase("es-MX").includes(term));
    });
  }, [products, search, categoryFilter, includeInactive]);

  const stockSummary = useMemo(() => {
    const active = products.filter((product) => product.active);
    return {
      itemCount: active.length,
      quantity: active.reduce((total, product) => total + product.stockQuantity, 0),
      costCents: Math.round(active.reduce((total, product) => total + product.costCents * Math.max(0, product.stockQuantity), 0)),
    };
  }, [products]);

  async function saveProduct(value: NewProduct | ProductUpdate) {
    setSaving(true);
    setError("");
    try {
      if ("id" in value) await updateProduct(value);
      else await createProduct(value);
      setProductModal(undefined);
      setSuccess("Producto guardado correctamente.");
      await loadData();
    } catch (cause) {
      setError(String(cause));
      throw cause;
    } finally {
      setSaving(false);
    }
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await createCategory(categoryName.trim());
      setCategories((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name, "es-MX")));
      setCategoryName("");
      setModal(null);
      setSuccess("Departamento creado.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setSaving(false);
    }
  }

  async function saveAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await adjustInventory({
        productId: Number(adjustment.productId),
        quantity: Number(adjustment.quantity),
        direction: adjustment.direction,
        reason: adjustment.reason.trim(),
      });
      setAdjustment({ productId: "", quantity: "", direction: "in", reason: "" });
      setModal(null);
      setSuccess("Existencia actualizada.");
      await loadData();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setSaving(false);
    }
  }

  async function toggleProduct(product: Product) {
    const nextActive = !product.active;
    if (!window.confirm(nextActive ? `¿Reactivar ${product.name}?` : `¿Archivar ${product.name}?`)) return;
    setError("");
    try {
      await setProductActive(product.id, nextActive);
      await loadData();
      setSuccess(nextActive ? "Producto reactivado." : "Producto archivado.");
    } catch (cause) { setError(String(cause)); }
  }

  async function showMovements() {
    setError("");
    try {
      setMovements(await listInventoryMovements());
      setModal("movements");
    } catch (cause) {
      setError(String(cause));
    }
  }

  const selectedAdjustmentProduct = products.find((product) => product.id === Number(adjustment.productId));

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-slate-50 text-slate-800">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Inventario / Catálogo</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Productos</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setModal("category")} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Tags size={16} /> Departamento</button>
          <button type="button" onClick={() => setModal("adjustment")} disabled={!products.some((product) => product.active)} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><ArrowDownToLine size={16} /> Ajustar stock</button>
          <button type="button" onClick={() => setProductModal(null)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"><Plus size={17} /> Nuevo producto</button>
        </div>
      </header>

      {error && <div role="alert" className="flex shrink-0 items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Cerrar error"><X size={16} /></button></div>}
      {success && <div role="status" className="flex shrink-0 items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700"><span>{success}</span><button type="button" onClick={() => setSuccess("")} aria-label="Cerrar aviso"><X size={16} /></button></div>}

      <section className="grid shrink-0 gap-3 sm:grid-cols-3" aria-label="Resumen del inventario">
        <article className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><span className="rounded-lg bg-blue-50 p-2.5 text-blue-600"><Boxes size={20} /></span><div><p className="text-xs font-medium text-slate-500">Productos activos</p><strong className="text-xl text-slate-900">{stockSummary.itemCount}</strong></div></article>
        <article className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><span className="rounded-lg bg-violet-50 p-2.5 text-violet-600"><PackagePlus size={20} /></span><div><p className="text-xs font-medium text-slate-500">Existencias totales</p><strong className="text-xl text-slate-900">{quantity(stockSummary.quantity)}</strong><p className="text-[11px] text-slate-400">en las unidades de cada producto</p></div></article>
        <article className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><span className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600"><CircleDollarSign size={20} /></span><div><p className="text-xs font-medium text-slate-500">Costo del inventario</p><strong className="text-xl text-slate-900">{money(stockSummary.costCents)}</strong></div></article>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 p-3">
          <label className="relative min-w-[220px] flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:bg-white" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nombre, código o clave SAT…" aria-label="Buscar productos" /></label>
          <select className="min-w-[190px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filtrar por departamento"><option value="">Todos los departamentos</option>{categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          <label className="flex items-center gap-2 px-1 text-sm text-slate-600"><input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} className="rounded border-slate-300 text-blue-600" />Archivados</label>
          <button type="button" onClick={() => void showMovements()} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"><Clock3 size={16} /> Movimientos</button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
              <th className="w-28 px-4 py-3">Código</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Clave SAT</th><th className="px-4 py-3 text-right">Costo compra</th><th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3 text-right">Precio venta</th><th className="px-4 py-3">Acciones</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={7} className="p-10 text-center text-slate-500">Cargando productos…</td></tr>
                : visibleProducts.length === 0 ? <tr><td colSpan={7} className="p-10 text-center"><p className="font-semibold text-slate-700">No hay productos para mostrar</p><p className="mt-1 text-sm text-slate-500">Cambia los filtros o agrega un producto nuevo.</p></td></tr>
                  : visibleProducts.map((product) => <tr key={product.id} className={`hover:bg-slate-50 ${product.active ? "" : "bg-slate-50/70 text-slate-400"}`}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-600">{product.internalCode}</td>
                    <td className="px-4 py-3"><div className="flex min-w-0 items-center gap-3">{product.imageData ? <img src={product.imageData} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><ImageIcon size={18} /></span>}<div className="min-w-0"><p className="truncate font-semibold text-slate-800">{product.name}</p><p className="mt-0.5 text-xs text-slate-500">{product.categoryName ?? "Sin departamento"}{product.active ? "" : " · Archivado"}</p></div></div></td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{product.satKey || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(product.costCents)}</td>
                    <td className="px-4 py-3 text-right"><span className={`font-semibold tabular-nums ${product.stockQuantity < 0 ? "text-rose-600" : "text-slate-800"}`}>{quantity(product.stockQuantity)} <span className="font-normal text-slate-500">{product.unit === "piece" ? "pza" : product.unit}</span></span></td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{money(product.priceCents)}</td>
                    <td className="px-4 py-3"><div className="flex gap-2"><button type="button" onClick={() => setProductModal(product)} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">Editar</button><button type="button" onClick={() => void toggleProduct(product)} className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:border-rose-200 hover:text-rose-600" title={product.active ? "Archivar" : "Reactivar"} aria-label={product.active ? `Archivar ${product.name}` : `Reactivar ${product.name}`}><Archive size={14} /></button></div></td>
                  </tr>)}
            </tbody>
          </table>
        </div>
        <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 px-4 py-2 text-xs text-slate-500"><span>{visibleProducts.length} productos</span><span>El valor del inventario se calcula con costo de compra × existencia.</span></footer>
      </section>

      {productModal !== undefined && <ProductModal categories={categories} product={productModal} saving={saving} onClose={() => { if (!saving) setProductModal(undefined); }} onSave={saveProduct} />}


      {modal === "category" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModal(null); }}><section role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Inventario</p><h2 className="mt-1 text-xl font-bold">Nuevo departamento</h2></div><button type="button" onClick={() => setModal(null)} aria-label="Cerrar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={19} /></button></div><form onSubmit={(event) => void saveCategory(event)} className="mt-5"><label className="text-sm font-medium text-slate-700">Nombre del departamento<input autoFocus className={inputClass + " mt-1"} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} maxLength={80} required /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar"}</button></div></form></section></div>}

      {modal === "adjustment" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModal(null); }}><section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Inventario</p><h2 className="mt-1 text-xl font-bold">Ajustar existencias</h2></div><button type="button" onClick={() => setModal(null)} aria-label="Cerrar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={19} /></button></div><form onSubmit={(event) => void saveAdjustment(event)} className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700 sm:col-span-2">Producto<select className={inputClass + " mt-1"} value={adjustment.productId} onChange={(event) => setAdjustment({ ...adjustment, productId: event.target.value })} required><option value="">Selecciona un producto</option>{products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.internalCode} · {product.name}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Movimiento<select className={inputClass + " mt-1"} value={adjustment.direction} onChange={(event) => setAdjustment({ ...adjustment, direction: event.target.value as "in" | "out" })}><option value="in">Entrada</option><option value="out">Salida</option></select></label><label className="text-sm font-medium text-slate-700">Cantidad<input className={inputClass + " mt-1"} type="number" min={selectedAdjustmentProduct?.unit === "piece" ? "1" : "0.001"} step={selectedAdjustmentProduct?.unit === "piece" ? "1" : "0.001"} value={adjustment.quantity} onChange={(event) => setAdjustment({ ...adjustment, quantity: event.target.value })} required /></label><label className="text-sm font-medium text-slate-700 sm:col-span-2">Motivo<input className={inputClass + " mt-1"} maxLength={240} value={adjustment.reason} onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })} required /></label><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setModal(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando…" : "Registrar ajuste"}</button></div></form></section></div>}

      {modal === "movements" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><section role="dialog" aria-modal="true" className="flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Inventario</p><h2 className="mt-1 text-xl font-bold">Movimientos recientes</h2></div><button type="button" onClick={() => setModal(null)} aria-label="Cerrar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={19} /></button></header><div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Cambio</th><th className="px-4 py-3">Existencia final</th><th className="px-4 py-3">Motivo</th></tr></thead><tbody className="divide-y divide-slate-100">{movements.map((movement) => <tr key={movement.id}><td className="whitespace-nowrap px-4 py-3">{new Date(movement.createdAt).toLocaleString("es-MX")}</td><td className="px-4 py-3">{movement.productName}</td><td className="px-4 py-3">{{ initial_stock: "Existencia inicial", purchase: "Entrada", manual_out: "Salida", adjustment: "Ajuste", sale: "Venta", return: "Devolución" }[movement.movementType] ?? movement.movementType}</td><td className="px-4 py-3">{movement.movementType === "manual_out" ? "−" : "+"}{quantity(movement.quantity)}</td><td className="px-4 py-3">{quantity(movement.newQuantity)}</td><td className="px-4 py-3">{movement.reason}</td></tr>)}</tbody></table>{movements.length === 0 && <p className="p-10 text-center text-sm text-slate-500">Aún no hay movimientos registrados.</p>}</div></section></div>}
    </main>
  );
}
