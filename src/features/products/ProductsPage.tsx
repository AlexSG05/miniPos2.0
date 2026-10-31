
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adjustInventory, createProduct, listInventoryMovements, listProducts, setProductActive, updateProduct, type InventoryMovement, type NewProduct, type Product, type ProductUpdate } from "./products.api";
import { createCategory, deactivateCategory, listCategories, type Category } from "./categories.api";

const money = (cents: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(cents / 100);

const emptyForm = {
  internalCode: "",
  barcode: "",
  name: "",
  description: "",
  cost: "",
  price: "",
  stock: "0",
  minStock: "0",
  unit: "piece" as Product["unit"],
  categoryId: "",
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [adjustment, setAdjustment] = useState({ productId: "", quantity: "", direction: "in" as "in" | "out", reason: "" });
  const selectedAdjustmentProduct = products.find((product) => product.id === Number(adjustment.productId));

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await listProducts(search, { categoryId: categoryFilter ? Number(categoryFilter) : null, includeInactive });
      setProducts(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, includeInactive]);

  async function loadMovements() {
    try {
      setMovements(await listInventoryMovements());
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    void loadMovements();
  }, []);

  useEffect(() => {
    void listCategories(true).then(setCategories).catch((err) => setError(String(err)));
  }, []);

  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCategorySaving(true); setError(""); setSuccess("");
    try {
      const created = await createCategory(newCategoryName.trim());
      setCategories((current) => [...current.filter((category) => category.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name, "es-MX")));
      setNewCategoryName("");
      setSuccess("Categoría creada.");
    } catch (err) { setError(String(err)); }
    finally { setCategorySaving(false); }
  }

  async function handleCategoryActive(category: Category) {
    try {
      await deactivateCategory(category.id);
      setCategories((current) => current.map((item) => item.id === category.id ? { ...item, active: false } : item));
      await loadProducts();
    } catch (err) { setError(String(err)); }
  }

  async function handleProductActive(product: Product) {
    const nextActive = !product.active;
    const confirmed = window.confirm(nextActive ? `¿Reactivar ${product.name}?` : `¿Archivar ${product.name}? Ya no aparecerá en nuevas ventas y se conservará el historial.`);
    if (!confirmed) return;
    try {
      await setProductActive(product.id, nextActive);
      await loadProducts();
      setSuccess(nextActive ? "Producto reactivado." : "Producto archivado.");
    } catch (err) { setError(String(err)); }
  }

  async function handleAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSavingAdjustment(true);
    try {
      await adjustInventory({
        productId: Number(adjustment.productId),
        quantity: Number(adjustment.quantity),
        direction: adjustment.direction,
        reason: adjustment.reason.trim(),
      });
      setAdjustment({ ...adjustment, quantity: "", reason: "" });
      setSuccess("Existencias actualizadas y movimiento registrado.");
      await Promise.all([loadProducts(), loadMovements()]);
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingAdjustment(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const cost = Number(form.cost);
    const price = Number(form.price);
    const stock = Number(form.stock);
    const minStock = Number(form.minStock);

    if (
      !form.internalCode.trim() ||
      !form.name.trim() ||
      form.cost.trim() === "" ||
      form.price.trim() === "" ||
      !Number.isFinite(cost) ||
      !Number.isFinite(price) ||
      !Number.isFinite(stock) ||
      !Number.isFinite(minStock) ||
      cost < 0 ||
      price < 0 ||
      stock < 0 ||
      minStock < 0
    ) {
      setError("Revisa los campos. Los precios y las existencias deben ser válidos y no negativos.");
      return;
    }

    const productFields = {
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      internalCode: form.internalCode.trim(),
      barcode: form.barcode.trim() || null,
      name: form.name.trim(),
      description: form.description.trim() || null,
      costCents: Math.round(cost * 100),
      priceCents: Math.round(price * 100),
      minStock,
      unit: form.unit,
    };
    const product: NewProduct = { ...productFields, stockQuantity: stock };

    setSaving(true);

    try {
      if (editingId === null) {
        await createProduct(product);
      } else {
        const update: ProductUpdate = { ...productFields, id: editingId };
        await updateProduct(update);
      }
      setForm(emptyForm);
      setShowForm(false);
      setEditingId(null);
      setSearch("");
      setSuccess(editingId === null ? "Producto registrado correctamente." : "Producto actualizado correctamente.");
      await loadProducts();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  function startEditing(product: Product) {
    setEditingId(product.id);
    setForm({
      internalCode: product.internalCode,
      barcode: product.barcode ?? "",
      name: product.name,
      description: product.description ?? "",
      cost: (product.costCents / 100).toFixed(2),
      price: (product.priceCents / 100).toFixed(2),
      stock: String(product.stockQuantity),
      minStock: String(product.minStock),
      unit: product.unit,
      categoryId: product.categoryId === null ? "" : String(product.categoryId),
    });
    setShowForm(true);
    setError("");
    setSuccess("");
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500";

  return (
    <main className="min-h-full space-y-6 bg-slate-50 p-6 text-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Inventario / Catálogo</p>
          <h1 className="mt-1 text-2xl font-semibold">Productos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Administra precios, códigos y existencias.
          </p>
        </div>

        <button
          onClick={() => {
            setError("");
            setSuccess("");
            if (showForm) {
              setEditingId(null);
              setForm(emptyForm);
              setShowForm(false);
            } else {
              setEditingId(null);
              setForm(emptyForm);
              setShowForm(true);
            }
          }}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-black hover:bg-yellow-400"
        >
          {showForm ? "Cancelar" : "+ Nuevo producto"}
        </button>
      </header>

      {error && (
        <div role="alert" className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div role="status" className="rounded-lg border border-emerald-900 bg-emerald-950/30 p-3 text-sm text-emerald-300">
          {success}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2 lg:grid-cols-3"
        >
          <label className="space-y-1.5 text-sm">
            Código interno *
            <input
              className={inputClass}
              value={form.internalCode}
              onChange={(e) => setForm({ ...form, internalCode: e.target.value })}
              maxLength={80}
              required
            />
          </label>

          <label className="space-y-1.5 text-sm">
            Código de barras
            <input
              className={inputClass}
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            />
          </label>

          <label className="space-y-1.5 text-sm">
            Categoría
            <select className={inputClass} value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
              <option value="">Sin categoría</option>
              {categories.map((category) => <option key={category.id} value={category.id} disabled={!category.active}>{category.name}{category.active ? "" : " (archivada)"}</option>)}
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            Nombre *
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={160}
              required
            />
          </label>

          <label className="space-y-1.5 text-sm">
            Costo por unidad (MXN) *
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
              required
            />
          </label>

          <label className="space-y-1.5 text-sm">
            Precio de venta (MXN) *
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              required
            />
          </label>

          <label className="space-y-1.5 text-sm">
            Unidad
            <select
              className={inputClass}
              value={form.unit}
              onChange={(e) =>
                setForm({ ...form, unit: e.target.value as Product["unit"] })
              }
            >
              <option value="piece">Pieza</option>
              <option value="kg">Kilogramo</option>
              <option value="g">Gramo</option>
              <option value="liter">Litro</option>
              <option value="ml">Mililitro</option>
            </select>
          </label>

          {editingId === null && <label className="space-y-1.5 text-sm">
            Existencias iniciales
            <input className={inputClass} type="number" min="0" step={form.unit === "piece" ? "1" : "0.001"} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required />
          </label>}

          <label className="space-y-1.5 text-sm">
            Stock mínimo
            <input
              className={inputClass}
              type="number"
              min="0"
              step={form.unit === "piece" ? "1" : "0.001"}
              value={form.minStock}
              onChange={(e) => setForm({ ...form, minStock: e.target.value })}
              required
            />
          </label>

          <label className="space-y-1.5 text-sm md:col-span-2 lg:col-span-1">
            Descripción
            <input
              className={inputClass}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          <div className="flex justify-end md:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
            >
              {saving ? "Guardando..." : editingId === null ? "Guardar producto" : "Guardar cambios"}
            </button>
          </div>
        </form>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Categorías</h2>
        <form onSubmit={handleCreateCategory} className="mt-3 flex max-w-xl gap-2">
          <input className={inputClass} value={newCategoryName} maxLength={80} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="Nombre de categoría" required />
          <button disabled={categorySaving} className="whitespace-nowrap rounded bg-blue-600 px-4 text-sm font-semibold disabled:opacity-50">{categorySaving ? "Guardando..." : "Crear categoría"}</button>
        </form>
        {categories.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{categories.map((category) => <span key={category.id} className="flex items-center gap-2 rounded border border-slate-200 px-3 py-1.5 text-sm"><span>{category.name}{category.active ? "" : " · Archivada"}</span>{category.active && <button type="button" onClick={() => void handleCategoryActive(category)} className="text-xs text-amber-300">Archivar</button>}</span>)}</div>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Movimiento de inventario</h2>
        <p className="mt-1 text-sm text-slate-500">Cada entrada o salida queda registrada junto con su motivo.</p>
        <form onSubmit={handleAdjustment} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          <select aria-label="Producto para ajuste" className={inputClass} value={adjustment.productId} onChange={(e) => setAdjustment({ ...adjustment, productId: e.target.value })} required>
            <option value="">Selecciona producto</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
          <select aria-label="Tipo de movimiento" className={inputClass} value={adjustment.direction} onChange={(e) => setAdjustment({ ...adjustment, direction: e.target.value as "in" | "out" })}>
            <option value="in">Entrada</option><option value="out">Salida</option>
          </select>
          <input aria-label="Cantidad del movimiento" className={inputClass} type="number" min={selectedAdjustmentProduct?.unit === "piece" ? "1" : "0.001"} step={selectedAdjustmentProduct?.unit === "piece" ? "1" : "0.001"} placeholder="Cantidad" value={adjustment.quantity} onChange={(e) => setAdjustment({ ...adjustment, quantity: e.target.value })} required />
          <input aria-label="Motivo del movimiento" className={inputClass} maxLength={240} placeholder="Motivo" value={adjustment.reason} onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })} required />
          <button disabled={savingAdjustment} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50" type="submit">{savingAdjustment ? "Guardando..." : "Registrar movimiento"}</button>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 p-4 font-semibold">Movimientos recientes</h2>
        {movements.length === 0 ? <p className="p-5 text-sm text-slate-500">Aún no hay movimientos de inventario.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="bg-white text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Cambio</th><th className="px-4 py-3">Existencia final</th><th className="px-4 py-3">Motivo</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{movements.map((movement) => <tr key={movement.id}><td className="px-4 py-3">{new Date(movement.createdAt).toLocaleString("es-MX")}</td><td className="px-4 py-3">{movement.productName}</td><td className="px-4 py-3">{{ initial_stock: "Existencia inicial", purchase: "Entrada", manual_out: "Salida", adjustment: "Ajuste", sale: "Venta", return: "Devolución" }[movement.movementType] ?? movement.movementType}</td><td className="px-4 py-3">{movement.movementType === "manual_out" ? "−" : "+"}{movement.quantity}</td><td className="px-4 py-3">{movement.newQuantity}</td><td className="px-4 py-3">{movement.reason}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <input
            className={inputClass}
            placeholder="Buscar por nombre, código o código de barras..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select aria-label="Filtrar por categoría" className={inputClass + " max-w-xs"} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">Todas las categorías</option>{categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
            <label className="flex items-center gap-2 text-sm text-slate-500"><input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />Mostrar archivados</label>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {products.length} productos encontrados
          </p>
        </div>

        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500">Cargando productos...</p>
        ) : products.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium">No hay productos para mostrar</p>
            <p className="mt-1 text-sm text-slate-500">
              Registra un producto para comenzar tu catálogo.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Costo</th>
                  <th className="px-4 py-3">Precio</th>
                  <th className="px-4 py-3">Existencias</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-white">
                    <td className="px-4 py-3">
                      <p className="font-medium">{product.name}</p>
                      {product.description && (
                        <p className="mt-1 text-xs text-slate-500">{product.description}</p>
                      )}
                      <p className="mt-1 text-xs text-slate-500">{product.categoryName ?? "Sin categoría"}{product.active ? "" : " · Archivado"}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {product.internalCode}
                    </td>
                    <td className="px-4 py-3">{money(product.costCents)}</td>
                    <td className="px-4 py-3 font-medium">{money(product.priceCents)}</td>
                    <td className="px-4 py-3">
                      <span className={product.stockQuantity <= product.minStock ? "text-amber-400" : "text-slate-800"}>
                        {product.stockQuantity} {product.unit}
                      </span>
                      {product.stockQuantity <= product.minStock && (
                        <p className="mt-1 text-xs text-amber-400">Stock bajo</p>
                      )}
                    </td>
                    <td className="px-4 py-3"><div className="flex gap-2"><button type="button" onClick={() => startEditing(product)} disabled={!product.active} className="rounded border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-zinc-800 disabled:opacity-40">Editar</button><button type="button" onClick={() => void handleProductActive(product)} className="rounded border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-zinc-800">{product.active ? "Archivar" : "Reactivar"}</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
