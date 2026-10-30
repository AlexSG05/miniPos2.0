import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { completeSale, searchSaleProducts, type SaleReceipt } from "./sales.api";
import type { Product } from "../products/products.api";
import { getOpenCashSession, type CashSession } from "../cash-register/cash.api";
import { getBusinessSettings } from "../settings/settings.api";

type CartItem = { product: Product; quantityMilli: number };

const money = (cents: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);

const quantity = (milli: number) => milli / 1000;

export default function SalesPage() {
  const [cash, setCash] = useState<CashSession | null>(null);
  const [taxRateBasisPoints, setTaxRateBasisPoints] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paying, setPaying] = useState(false);
  const [method, setMethod] = useState<"cash" | "card">("cash");
  const [received, setReceived] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const operationId = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getOpenCashSession().then(setCash).catch((err) => setError(String(err)));
    void getBusinessSettings().then((settings) => setTaxRateBasisPoints(settings.taxRateBasisPoints)).catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchSaleProducts(query).then(setProducts).catch((err) => setError(String(err)));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [query]);

  const subtotalCents = useMemo(
    () => cart.reduce((sum, item) => sum + Math.round((item.product.priceCents * item.quantityMilli) / 1000), 0),
    [cart]
  );
  const taxCents = taxRateBasisPoints === null ? 0 : Math.floor((subtotalCents * taxRateBasisPoints + 5000) / 10000);
  const totalCents = subtotalCents + taxCents;
  const receivedCents = method === "card" ? totalCents : Math.round((Number(received) || 0) * 100);
  const changeCents = Math.max(0, receivedCents - totalCents);

  function addProduct(product: Product) {
    setError("");
    if (!product.active || product.stockQuantity <= 0) {
      setError("El producto no tiene existencias disponibles.");
      return;
    }
    const found = cart.find((item) => item.product.id === product.id);
    if (found) {
      if (found.quantityMilli + 1000 > Math.floor(product.stockQuantity * 1000)) {
        setError(`Stock insuficiente para ${product.name}.`);
        return;
      }
      setCart(cart.map((item) => (item.product.id === product.id ? { ...item, quantityMilli: item.quantityMilli + 1000 } : item)));
    } else {
      setCart([...cart, { product, quantityMilli: Math.min(1000, Math.floor(product.stockQuantity * 1000)) }]);
    }
    setQuery("");
    searchRef.current?.focus();
  }

  async function addByCode() {
    const code = query.trim();
    if (!code) return;
    try {
      const results = await searchSaleProducts(code);
      const exact = results.find(
        (product) => product.barcode === code || product.internalCode.toLocaleLowerCase() === code.toLocaleLowerCase()
      );
      if (exact) addProduct(exact);
      else setError("No se encontró un producto con ese código.");
    } catch (err) {
      setError(String(err));
    }
  }

  function setQuantity(productId: number, next: number) {
    setCart((current) =>
      current.flatMap((item) =>
        item.product.id !== productId
          ? [item]
          : next <= 0
          ? []
          : [{ ...item, quantityMilli: Math.min(next, Math.floor(item.product.stockQuantity * 1000)) }]
      )
    );
  }

  async function handleCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cash) {
      setError("Abre la caja antes de cobrar.");
      return;
    }
    if (cart.length === 0) {
      setError("Agrega productos antes de cobrar.");
      return;
    }
    setSaving(true);
    setError("");
    operationId.current ??= crypto.randomUUID();
    try {
      const saved = await completeSale({
        operationId: operationId.current,
        items: cart.map((item) => ({ productId: item.product.id, quantityMilli: item.quantityMilli })),
        paymentMethod: method,
        receivedCents,
      });
      setReceipt(saved);
      setCart([]);
      setPaying(false);
      setReceived("");
      operationId.current = null;
      const [currentCash, currentProducts] = await Promise.all([getOpenCashSession(), searchSaleProducts(query)]);
      setCash(currentCash);
      setProducts(currentProducts);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-[1600px] flex-col gap-4 text-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-600">Caja · nueva venta</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Punto de venta</h1>
          <p className="mt-1 text-sm text-slate-500">Escanea o busca un producto para agregarlo a la venta.</p>
        </div>
        {cash ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
            Caja abierta · Fondo {money(cash.openingCents)}
          </span>
        ) : (
          <Link className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-amber-950 shadow-sm hover:bg-amber-300" to="/caja">
            Abrir caja para vender
          </Link>
        )}
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {receipt && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <div>
            <strong>Venta completada · {receipt.folio}</strong>
            <p className="mt-1 text-sm">
              Subtotal {money(receipt.subtotalCents)} · Impuesto {money(receipt.taxCents)} · Total {money(receipt.totalCents)} · Cambio {money(receipt.changeCents)}
            </p>
          </div>
          <button className="rounded border border-emerald-700 px-3 py-1.5 text-sm" onClick={() => setReceipt(null)}>
            Cerrar comprobante
          </button>
        </div>
      )}

      <div className="grid min-h-[500px] flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,.85fr)]">
        {/* Catálogo y Búsqueda */}
        <section className="flex min-h-[390px] flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex gap-2">
            <input
              ref={searchRef}
              autoFocus
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
              aria-label="Buscar producto o escanear código"
              placeholder="Nombre, SKU o código de barras"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addByCode();
                }
              }}
            />
            <button onClick={() => void addByCode()} className="rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500">
              Agregar código
            </button>
          </div>
          <div className="max-h-[460px] flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            {products.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">No hay productos coincidentes.</p>
            ) : (
              products.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addProduct(product)}
                  disabled={!product.active || product.stockQuantity <= 0}
                  className="flex w-full items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-indigo-50/60 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>
                    <strong className="block text-sm">{product.name}</strong>
                    <small className="text-slate-500">
                      {product.internalCode} · Disponible: {product.stockQuantity} {product.unit}
                    </small>
                  </span>
                  <span className="whitespace-nowrap font-semibold">{money(product.priceCents)}</span>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Carrito y Cobro */}
        <section className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 p-4 font-semibold text-slate-800">
            Venta actual <span className="ml-1 text-sm font-normal text-slate-400">{cart.length} productos</span>
          </h2>

          <div className="flex-1 divide-y divide-zinc-800 overflow-auto">
            {cart.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">El carrito está vacío.</p>
            ) : (
              cart.map(({ product, quantityMilli }) => (
                <div key={product.id} className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{product.name}</strong>
                    <small className="text-slate-500">
                      {money(product.priceCents)} por {product.unit} · {money(Math.round((product.priceCents * quantityMilli) / 1000))}
                    </small>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      aria-label={`Reducir ${product.name}`}
                      onClick={() => setQuantity(product.id, quantityMilli - (product.unit === "piece" ? 1000 : 1))}
                      className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                    >
                      −
                    </button>
                    <input
                      key={quantityMilli}
                      aria-label={`Cantidad de ${product.name}`}
                      type="number"
                      min={product.unit === "piece" ? 1 : 0.001}
                      step={product.unit === "piece" ? 1 : 0.001}
                      max={product.stockQuantity}
                      defaultValue={quantity(quantityMilli)}
                      onBlur={(event) => {
                        const next = Number(event.currentTarget.value);
                        if (Number.isFinite(next) && next > 0) {
                          setQuantity(product.id, Math.round(next * 1000));
                        } else {
                          event.currentTarget.value = String(quantity(quantityMilli));
                        }
                      }}
                      className="w-20 rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-center text-sm text-slate-800"
                    />
                    <button
                      aria-label={`Aumentar ${product.name}`}
                      onClick={() => setQuantity(product.id, quantityMilli + (product.unit === "piece" ? 1000 : 1))}
                      className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                    >
                      +
                    </button>
                  </div>
                  <button aria-label={`Quitar ${product.name}`} onClick={() => setQuantity(product.id, 0)} className="px-1 text-sm text-red-400 hover:underline">
                    Quitar
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-100 p-4">
            <div className="mb-4 space-y-1">
              <div className="flex justify-between text-sm text-slate-500">
                <span>Subtotal</span>
                <span>{money(subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-500">
                <span>Impuesto configurado</span>
                <span>{money(taxCents)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-3">
                <span className="font-semibold text-slate-700">Total a pagar</span>
                <strong className="text-3xl font-extrabold tracking-tight text-indigo-700">{money(totalCents)}</strong>
              </div>
            </div>

            {paying ? (
              <form onSubmit={handleCheckout} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMethod("cash")}
                    className={`rounded-xl border p-2.5 text-sm font-semibold ${method === "cash" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                  >
                    Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod("card")}
                    className={`rounded-xl border p-2.5 text-sm font-semibold ${method === "card" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                  >
                    Tarjeta
                  </button>
                </div>

                {method === "cash" && (
                  <label className="block text-sm font-medium text-slate-600">
                    Recibido (MXN)
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      step="0.01"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                      value={received}
                      onChange={(event) => setReceived(event.target.value)}
                      required
                    />
                    <span className="mt-1 block">
                      Cambio: <strong className="text-emerald-700">{money(changeCents)}</strong>
                    </span>
                  </label>
                )}

                <div className="flex gap-2">
                  <button type="button" onClick={() => setPaying(false)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                    Volver
                  </button>
                  <button
                    disabled={saving || !cash || taxRateBasisPoints === null || (method === "cash" && receivedCents < totalCents)}
                    className="flex-1 rounded-xl bg-emerald-600 py-3 font-bold text-white shadow-lg shadow-emerald-100 disabled:opacity-50 hover:bg-emerald-500"
                  >
                    {saving ? "Registrando..." : "Confirmar cobro"}
                  </button>
                </div>
              </form>
            ) : (
              <button
                disabled={!cart.length || !cash || taxRateBasisPoints === null}
                onClick={() => {
                  setPaying(true);
                  setMethod("cash");
                  setReceived("");
                }}
                className="w-full rounded-xl bg-indigo-600 py-3.5 font-bold text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                Cobrar {money(totalCents)}
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
