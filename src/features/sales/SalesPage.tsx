import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Barcode,
  CheckCircle2,
  CreditCard,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
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
  const [discountPercent, setDiscountPercent] = useState("0");
  const [showDiscount, setShowDiscount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const operationId = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const checkoutFormRef = useRef<HTMLFormElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void getOpenCashSession().then(setCash).catch((err) => setError(String(err)));
    void getBusinessSettings()
      .then((settings) => setTaxRateBasisPoints(settings.taxRateBasisPoints))
      .catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void searchSaleProducts(query)
        .then((results) => {
          if (active) setProducts(results);
        })
        .catch((err) => {
          if (active) setError(String(err));
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const subtotalCents = useMemo(
    () => cart.reduce((sum, item) => sum + Math.round((item.product.priceCents * item.quantityMilli) / 1000), 0),
    [cart]
  );
  const discountCents = Math.min(subtotalCents, Math.round(subtotalCents * Math.min(100, Math.max(0, Number(discountPercent) || 0)) / 100));
  const taxableCents = subtotalCents - discountCents;
  const taxCents =
    taxRateBasisPoints === null ? 0 : Math.floor((taxableCents * taxRateBasisPoints + 5000) / 10000);
  const totalCents = taxableCents + taxCents;
  const receivedCents = method === "card" ? totalCents : Math.round((Number(received) || 0) * 100);
  const changeCents = Math.max(0, receivedCents - totalCents);
  const itemCount = cart.reduce((sum, item) => sum + quantity(item.quantityMilli), 0);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      const key = /^F(?:1|3|4|12)$/.test(event.key) ? event.key : event.code;
      if (!/^F(?:1|3|4|12)$/.test(key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (key === "F4") {
        searchRef.current?.focus();
        searchRef.current?.select();
        setError("");
      } else if (key === "F1") {
        if (cart.length && window.confirm("¿Vaciar toda la venta actual?")) {
          setCart([]);
          setPaying(false);
          setDiscountPercent("0");
          setReceived("");
          operationId.current = null;
        }
      } else if (key === "F3") {
        setShowDiscount(true);
        window.requestAnimationFrame(() => discountRef.current?.focus());
      } else if (!cash) {
        navigate("/caja");
      } else if (cart.length) {
        if (paying) checkoutFormRef.current?.requestSubmit();
        else {
          setPaying(true);
          setMethod("cash");
          setReceived("");
        }
      } else {
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onShortcut, true);
    return () => window.removeEventListener("keydown", onShortcut, true);
  }, [cart.length, cash, navigate, paying]);

  function addProduct(product: Product) {
    setError("");
    if (!product.active || product.stockQuantity <= 0) {
      setError("Este producto no tiene existencias disponibles.");
      return;
    }

    setCart((current) => {
      const found = current.find((item) => item.product.id === product.id);
      if (found) {
        if (found.quantityMilli + 1000 > Math.floor(product.stockQuantity * 1000)) {
          setError(`Stock insuficiente para ${product.name}.`);
          return current;
        }
        return current.map((item) =>
          item.product.id === product.id
            ? { ...item, quantityMilli: item.quantityMilli + 1000 }
            : item
        );
      }
      return [
        ...current,
        { product, quantityMilli: Math.min(1000, Math.floor(product.stockQuantity * 1000)) },
      ];
    });

    setQuery("");
    searchRef.current?.focus();
  }

  async function addByCode() {
    const code = query.trim();
    if (!code) return;
    try {
      const results = await searchSaleProducts(code);
      const exact = results.find(
        (product) =>
          product.barcode === code ||
          product.internalCode.toLocaleLowerCase() === code.toLocaleLowerCase()
      );
      if (exact) addProduct(exact);
      else setError("No encontramos un producto con ese código.");
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
            : [
                {
                  ...item,
                  quantityMilli: Math.min(
                    next,
                    Math.floor(item.product.stockQuantity * 1000)
                  ),
                },
              ]
      )
    );
  }

  async function handleCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cash) {
      setError("Abre la caja antes de realizar una venta.");
      return;
    }
    if (cart.length === 0) {
      setError("Agrega al menos un producto para continuar.");
      return;
    }
    if (method === "cash" && receivedCents < totalCents) {
      setError("El efectivo recibido es menor que el total.");
      return;
    }
    setSaving(true);
    setError("");
    operationId.current ??= crypto.randomUUID();
    try {
      const saved = await completeSale({
        operationId: operationId.current,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantityMilli: item.quantityMilli,
        })),
        discountCents,
        paymentMethod: method,
        receivedCents,
      });
      setReceipt(saved);
      setCart([]);
      setPaying(false);
      setDiscountPercent("0");
      setReceived("");
      operationId.current = null;
      const [currentCash, currentProducts] = await Promise.all([
        getOpenCashSession(),
        searchSaleProducts(query),
      ]);
      setCash(currentCash);
      setProducts(currentProducts);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex h-full min-h-0 max-w-[1680px] flex-col gap-4 overflow-hidden text-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            Caja / Operación
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Punto de venta</h1>
          <p className="mt-1 text-sm text-slate-500">
            Busca productos, agrégalos a la venta y cobra en unos cuantos pasos.
          </p>
        </div>

        {cash ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle2 size={19} />
            </span>
            <div>
              <p className="text-xs font-medium text-emerald-700">Caja abierta</p>
              <p className="text-sm font-bold text-emerald-900">Fondo {money(cash.openingCents)}</p>
            </div>
          </div>
        ) : (
          <Link
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            to="/caja"
          >
            Abrir caja <kbd>F12</kbd> <ArrowRight size={16} />
          </Link>
        )}
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 shrink-0" size={18} />
          <p className="min-w-0 flex-1">{error}</p>
          <button type="button" aria-label="Cerrar aviso" onClick={() => setError("")} className="rounded p-1 text-rose-700 hover:bg-rose-100">
            <X size={16} />
          </button>
        </div>
      )}

      {receipt && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5" size={21} />
            <div>
              <strong>Venta completada · {receipt.folio}</strong>
              <p className="mt-1 text-sm text-emerald-800">
                Total {money(receipt.totalCents)} · Cambio {money(receipt.changeCents)}
              </p>
            </div>
          </div>
          <button type="button" className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold hover:bg-emerald-100" onClick={() => setReceipt(null)}>
            Cerrar comprobante
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_410px] xl:grid-rows-1">
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">Catálogo de productos</h2>
                <p className="mt-0.5 text-xs text-slate-500">Selecciona un producto para agregarlo al carrito.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {products.length} resultados
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
                <input
                  ref={searchRef}
                  autoFocus
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50"
                  aria-label="Buscar producto o escanear código"
                  placeholder="Buscar por nombre, SKU o código de barras..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void addByCode();
                    }
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => void addByCode()}
                disabled={!query.trim()}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Barcode size={18} /> Buscar código
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Consejo: puedes usar un lector de código de barras; el producto se buscará al presionar Enter.
            </p>
            <p className="mt-1 text-xs text-slate-500">Atajos: F4 buscar · F3 descuento · F1 vaciar venta · F12 cobrar / abrir caja</p>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
            {products.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-6 text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Package size={23} />
                </span>
                <p className="font-semibold text-slate-800">No hay productos para mostrar</p>
                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  Prueba con otro nombre o código, o registra productos desde el módulo de inventario.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {products.map((product) => {
                  const inCart = cart.find((item) => item.product.id === product.id);
                  const unavailable = !product.active || product.stockQuantity <= 0;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addProduct(product)}
                      disabled={unavailable}
                      className="group flex min-h-[116px] flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60"
                    >
                      <div className="flex w-full items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition group-hover:bg-blue-100 group-hover:text-blue-700">
                            <Package size={19} />
                          </span>
                          <div className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-900">{product.name}</span>
                            <span className="mt-1 block text-xs text-slate-500">{product.internalCode}</span>
                          </div>
                        </div>
                        {inCart && (
                          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-bold text-white">
                            {quantity(inCart.quantityMilli)}
                          </span>
                        )}
                      </div>
                      <div className="mt-4 flex items-end justify-between gap-2">
                        <div>
                          <p className="text-base font-bold text-slate-900">{money(product.priceCents)}</p>
                          <p className={`mt-0.5 text-xs ${unavailable ? "text-rose-600" : product.stockQuantity <= 5 ? "text-amber-600" : "text-slate-500"}`}>
                            {unavailable ? "Sin existencias" : `Disponibles: ${product.stockQuantity} ${product.unit}`}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 group-hover:bg-blue-600 group-hover:text-white">
                          <Plus size={14} /> Agregar
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <ShoppingCart size={19} />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Venta actual</h2>
                <p className="text-xs text-slate-500">{cart.length} artículos · {itemCount.toLocaleString("es-MX")} unidades</p>
              </div>
            </div>
            {cart.length > 0 && (
              <button type="button" onClick={() => { setCart([]); setPaying(false); }} className="rounded-lg px-2.5 py-2 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600">
                Vaciar
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {cart.length === 0 ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 py-8 text-center">
                <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <ShoppingCart size={25} />
                </span>
                <p className="font-semibold text-slate-700">Tu venta está vacía</p>
                <p className="mt-1 max-w-[230px] text-sm text-slate-500">Busca un producto en el catálogo y selecciónalo para comenzar.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {cart.map(({ product, quantityMilli }) => (
                  <li key={product.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <Package size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{product.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{money(product.priceCents)} / {product.unit}</p>
                      </div>
                      <p className="whitespace-nowrap text-sm font-bold text-slate-900">
                        {money(Math.round((product.priceCents * quantityMilli) / 1000))}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between pl-12">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`Reducir ${product.name}`}
                          onClick={() => setQuantity(product.id, quantityMilli - (product.unit === "piece" ? 1000 : 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Minus size={14} />
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
                          className="h-8 w-16 rounded-lg border border-slate-200 bg-slate-50 text-center text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                        <button
                          type="button"
                          aria-label={`Aumentar ${product.name}`}
                          onClick={() => setQuantity(product.id, quantityMilli + (product.unit === "piece" ? 1000 : 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label={`Quitar ${product.name}`}
                        onClick={() => setQuantity(product.id, 0)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={13} /> Quitar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-100 bg-slate-50/70 p-5">
            <div className="mb-4 space-y-2">
              <div className="flex justify-between text-sm text-slate-500">
                <span>Subtotal</span><span className="font-medium text-slate-700">{money(subtotalCents)}</span>
              </div>
              {showDiscount ? (
                <label className="flex items-center justify-between gap-3 text-sm text-slate-600">
                  <span>Descuento (%)</span>
                  <input ref={discountRef} type="number" min="0" max="100" step="1" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} onBlur={() => setDiscountPercent(String(Math.min(100, Math.max(0, Number(discountPercent) || 0))))} className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right font-semibold text-slate-800 outline-none focus:border-blue-500" />
                </label>
              ) : (
                <button type="button" onClick={() => { setShowDiscount(true); window.setTimeout(() => discountRef.current?.focus(), 0); }} className="flex w-full justify-between text-sm text-blue-700 hover:text-blue-800"><span>Agregar descuento</span><span>F3</span></button>
              )}
              {discountCents > 0 && <div className="flex justify-between text-sm font-medium text-emerald-700"><span>Descuento ({discountPercent}%)</span><span>-{money(discountCents)}</span></div>}
              <div className="flex justify-between text-sm text-slate-500">
                <span>Impuestos</span><span className="font-medium text-slate-700">{money(taxCents)}</span>
              </div>
              <div className="flex items-end justify-between border-t border-slate-200 pt-3">
                <span className="text-sm font-semibold text-slate-700">Total a pagar</span>
                <strong className="text-3xl font-bold tracking-tight text-blue-700">{money(totalCents)}</strong>
              </div>
            </div>

            {paying ? (
              <form ref={checkoutFormRef} onSubmit={handleCheckout} className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Método de pago</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMethod("cash")}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${method === "cash" ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    <Banknote size={17} /> Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod("card")}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${method === "card" ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    <CreditCard size={17} /> Tarjeta
                  </button>
                </div>

                {method === "cash" ? (
                  <label className="block text-sm font-medium text-slate-700">
                    Efectivo recibido
                    <div className="relative mt-1.5">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                      <input
                        autoFocus
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-lg font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                        value={received}
                        onChange={(event) => setReceived(event.target.value)}
                        required
                      />
                    </div>
                    <span className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      <span>Cambio</span><strong className="text-base">{money(changeCents)}</strong>
                    </span>
                  </label>
                ) : (
                  <p className="rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-800">
                    Se registrará el pago con tarjeta por {money(totalCents)}.
                  </p>
                )}

                <div className="flex gap-2">
                  <button type="button" onClick={() => setPaying(false)} className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                    Volver
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !cash || taxRateBasisPoints === null || (method === "cash" && receivedCents < totalCents)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {saving ? "Registrando..." : "Confirmar cobro"}
                    {!saving && <CheckCircle2 size={17} />}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                disabled={!cart.length || !cash || taxRateBasisPoints === null}
                onClick={() => {
                  setPaying(true);
                  setMethod("cash");
                  setReceived("");
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Continuar al cobro <kbd>F12</kbd> <ArrowRight size={17} />
              </button>
            )}
            {!cash && (
              <p className="mt-2 text-center text-xs text-amber-700">
                Necesitas abrir la caja para registrar ventas.
              </p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
