import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowDownToLine, Plus, Trash2, Truck, X } from "lucide-react";
import { listProducts, type Product } from "../products/products.api";
import { createSupplier, listSuppliers, receivePurchase, type Supplier } from "./purchases.api";

type Line = { productId: number; quantity: string; unitCost: string };
const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500";
const currency = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);

export default function PurchasesPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [documentType, setDocumentType] = useState<"invoice" | "note" | "other">("invoice");
  const [documentNumber, setDocumentNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [supplierModal, setSupplierModal] = useState(false);
  const operationId = useRef("");
  const [supplierForm, setSupplierForm] = useState({ name: "", taxId: "", phone: "", email: "", address: "" });

  async function load() {
    setLoading(true); setError("");
    try {
      const [supplierRows, productRows] = await Promise.all([listSuppliers(), listProducts()]);
      setSuppliers(supplierRows); setProducts(productRows.filter((product) => product.active));
    } catch (cause) { setError(String(cause)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const availableProducts = useMemo(() => products.filter((product) => !lines.some((line) => line.productId === product.id)), [products, lines]);
  const matchingProducts = useMemo(() => availableProducts.filter((product) => `${product.internalCode} ${product.name} ${product.barcode ?? ""}`.toLocaleLowerCase("es-MX").includes(productSearch.trim().toLocaleLowerCase("es-MX"))), [availableProducts, productSearch]);
  const matchingSuppliers = useMemo(() => suppliers.filter((supplier) => supplier.name.toLocaleLowerCase("es-MX").includes(supplierSearch.trim().toLocaleLowerCase("es-MX"))), [suppliers, supplierSearch]);
  const totalCents = lines.reduce((total, line) => total + Math.round((Number(line.quantity) || 0) * (Number(line.unitCost) || 0) * 100), 0);
  const selectedProduct = products.find((product) => product.id === Number(selectedProductId));

  function addLine() {
    if (!selectedProduct) return;
    setLines((current) => [...current, { productId: selectedProduct.id, quantity: "1", unitCost: (selectedProduct.costCents / 100).toFixed(2) }]);
    setSelectedProductId(""); setError("");
  }
  function updateLine(index: number, field: "quantity" | "unitCost", value: string) {
    setLines((current) => current.map((line, i) => i === index ? { ...line, [field]: value } : line));
  }

  async function saveSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const supplier = await createSupplier(supplierForm);
      setSuppliers((current) => [...current, supplier].sort((a, b) => a.name.localeCompare(b.name, "es-MX")));
      setSupplierId(String(supplier.id)); setSupplierForm({ name: "", taxId: "", phone: "", email: "", address: "" }); setSupplierModal(false);
    } catch (cause) { setError(String(cause)); }
    finally { setSaving(false); }
  }

  async function saveReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    try {
      if (!supplierId) throw new Error("Selecciona un proveedor.");
      if (!lines.length) throw new Error("Agrega al menos un producto.");
      for (const line of lines) {
        const product = products.find((row) => row.id === line.productId)!;
        const qty = Number(line.quantity); const cost = Number(line.unitCost);
        if (!Number.isFinite(qty) || qty <= 0 || (product.unit === "piece" && !Number.isInteger(qty)) || Math.abs(qty * 1000 - Math.round(qty * 1000)) > 1e-6) throw new Error(`Revisa la cantidad de ${product.name}.`);
        if (!Number.isFinite(cost) || cost < 0 || Math.round(cost * 100) > Number.MAX_SAFE_INTEGER) throw new Error(`Revisa el costo de ${product.name}.`);
      }
      if (!operationId.current) operationId.current = crypto.randomUUID();
      const result = await receivePurchase({
        operationId: operationId.current, supplierId: Number(supplierId), documentType,
        documentNumber, notes,
        items: lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity), unitCostCents: Math.round(Number(line.unitCost) * 100) })),
      });
      setSuccess(`Recepción #${result.id} guardada. Total: ${currency(result.subtotalCents)}.`);
      operationId.current = ""; setLines([]); setDocumentNumber(""); setNotes("");
      await load();
    } catch (cause) { setError(String(cause)); }
    finally { setSaving(false); }
  }

  return <main className="flex h-full min-h-0 flex-col gap-4 overflow-hidden text-slate-800">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Inventario / Proveedores</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Compras y recepción</h1></div><button type="button" onClick={() => setSupplierModal(true)} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold"><Truck size={16}/> Nuevo proveedor</button></header>
    {error && <div role="alert" className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Cerrar error"><X size={16}/></button></div>}
    {success && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{success}</div>}
    <form onSubmit={(event) => void saveReceipt(event)} className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <section className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-slate-700 lg:col-span-2">Buscar proveedor<input className={`${inputClass} mt-1`} value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} placeholder="Escribe el nombre…"/><select className={`${inputClass} mt-1`} value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required><option value="">{loading ? "Cargando…" : "Selecciona proveedor"}</option>{matchingSuppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Documento<select className={`${inputClass} mt-1`} value={documentType} onChange={(event) => setDocumentType(event.target.value as typeof documentType)}><option value="invoice">Factura</option><option value="note">Nota</option><option value="other">Otro</option></select></label>
        <label className="text-sm font-medium text-slate-700">Número de factura/nota<input className={`${inputClass} mt-1`} value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} maxLength={80} placeholder="Opcional" /></label>
      </section>
      <section className="flex shrink-0 flex-wrap gap-2"><input aria-label="Buscar producto" className={`${inputClass} min-w-[200px] flex-1`} value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Buscar por nombre, código o barras…"/><select aria-label="Producto para agregar" className={`${inputClass} min-w-[240px] flex-1`} value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}><option value="">Selecciona producto…</option>{matchingProducts.map((product) => <option key={product.id} value={product.id}>{product.internalCode} · {product.name} · {currency(product.costCents)}</option>)}</select><button type="button" disabled={!selectedProduct} onClick={addLine} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus size={16}/> Agregar producto</button></section>
      <div className="min-h-36 flex-1 overflow-auto rounded-lg border border-slate-200"><table className="w-full min-w-[760px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Producto</th><th className="w-36 px-3 py-3">Cantidad</th><th className="w-40 px-3 py-3">Costo unitario</th><th className="w-36 px-3 py-3 text-right">Importe</th><th className="w-12 px-3 py-3"/></tr></thead><tbody className="divide-y divide-slate-100">{lines.map((line, index) => { const product = products.find((row) => row.id === line.productId)!; const rowTotal = Math.round((Number(line.quantity) || 0) * (Number(line.unitCost) || 0) * 100); return <tr key={line.productId}><td className="px-3 py-3"><strong>{product.name}</strong><span className="ml-2 text-xs text-slate-500">{product.internalCode} · {product.unit === "piece" ? "pza" : product.unit}</span></td><td className="px-3 py-2"><input aria-label={`Cantidad ${product.name}`} className={inputClass} type="number" min={product.unit === "piece" ? "1" : "0.001"} step={product.unit === "piece" ? "1" : "0.001"} value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} required/></td><td className="px-3 py-2"><input aria-label={`Costo unitario ${product.name}`} className={inputClass} type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => updateLine(index, "unitCost", event.target.value)} required/></td><td className="px-3 py-3 text-right font-semibold tabular-nums">{currency(rowTotal)}</td><td className="px-3 py-2"><button type="button" onClick={() => setLines((current) => current.filter((_, i) => i !== index))} aria-label={`Quitar ${product.name}`} className="rounded-md p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16}/></button></td></tr>; })}{lines.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-slate-500">Agrega los productos que recibiste del proveedor.</td></tr>}</tbody></table></div>
      <label className="shrink-0 text-sm font-medium text-slate-700">Notas<textarea className={`${inputClass} mt-1`} rows={2} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observaciones de la recepción"/></label>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><p className="text-sm text-slate-500"><ArrowDownToLine className="mr-1 inline" size={16}/> El inventario y los costos se actualizan al confirmar.</p><div className="flex items-center gap-4"><span className="text-sm text-slate-600">Total <strong className="ml-2 text-xl text-slate-900">{currency(totalCents)}</strong></span><button type="submit" disabled={saving || loading} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar recepción"}</button></div></footer>
    </form>
    {supplierModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><header className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Compras</p><h2 className="mt-1 text-xl font-bold">Nuevo proveedor</h2></div><button type="button" onClick={() => setSupplierModal(false)} aria-label="Cerrar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={19}/></button></header><form onSubmit={(event) => void saveSupplier(event)} className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Nombre<input className={`${inputClass} mt-1`} value={supplierForm.name} onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })} maxLength={160} required/></label><label className="text-sm font-medium">RFC<input className={`${inputClass} mt-1`} value={supplierForm.taxId} onChange={(event) => setSupplierForm({ ...supplierForm, taxId: event.target.value })} maxLength={32}/></label><label className="text-sm font-medium">Teléfono<input className={`${inputClass} mt-1`} value={supplierForm.phone} onChange={(event) => setSupplierForm({ ...supplierForm, phone: event.target.value })} maxLength={40}/></label><label className="text-sm font-medium sm:col-span-2">Correo<input className={`${inputClass} mt-1`} type="email" value={supplierForm.email} onChange={(event) => setSupplierForm({ ...supplierForm, email: event.target.value })} maxLength={160}/></label><label className="text-sm font-medium sm:col-span-2">Dirección<input className={`${inputClass} mt-1`} value={supplierForm.address} onChange={(event) => setSupplierForm({ ...supplierForm, address: event.target.value })} maxLength={240}/></label><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setSupplierModal(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Guardar proveedor</button></div></form></section></div>}
  </main>;
}
