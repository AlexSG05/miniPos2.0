/**
 * ============================================================================
 * PÁGINA / COMPONENTE PRINCIPAL: SalesPage (Vista Operativa del POS)
 * ============================================================================
 * 
 * PROPÓSITO:
 * Orquestador principal del Punto de Venta. Integra la gestión del carrito, 
 * lectura de códigos de barras, atajos de teclado globales y procesamiento de cobros.
 *
 * ARQUITECTURA Y CARACTERÍSTICAS CLAVE:
 * 1. Sincronización Estado/Ref (cartRef): Previene duplicaciones de ítems causadas 
 *    por disparos ultra rápidos de lectores de código de barras USB/láser.
 * 2. Atajos de Teclado Globales:
 *    - F1: Cancelar venta | F2: Cantidad de captura | F3: Editar artículo | F4: Buscar | F12: Cobrar.
 * 3. Idempotencia en Transacciones: Usa UUIDs y fingerprints de carga para evitar 
 *    ventas duplicadas al reintentar envíos a la API.
 * 4. Control de Turno: Bloquea las operaciones de cobro si no existe una caja abierta (`CashSession`).
 * 5. Reenfoque Persistente: Mantiene el foco de la pantalla en el campo de código principal.
 * ============================================================================
 */
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, Banknote, CheckCircle2, X } from "lucide-react";
import { getOpenCashSession, type CashSession } from "../cash-register/cash.api";
import type { Product } from "../products/products.api";
import { getBusinessSettings } from "../settings/settings.api";
import { completeSale, searchSaleProducts, type SaleReceipt } from "./sales.api";
import { authorizeAdminAction, listActiveAdmins, type AdminOption } from "../auth/auth.api";
import { useAuth } from "../auth/useAuth";
import CartTable from "./pos/CartTable";
import ClockCard from "./pos/ClockCard";
import ConfirmDialog from "./pos/ConfirmDialog";
import PaymentDialog, { type PaymentMethod } from "./pos/PaymentDialog";
import ProductPreview from "./pos/ProductPreview";
import QuickEntryBar from "./pos/QuickEntryBar";
import TotalsCard from "./pos/TotalsCard";
import CashWithdrawalDialog from "../cash-register/CashWithdrawalDialog";
import {
  addToCart, calculateTotals, findExact, looksLikeBarcode, money, parseEntry, parseQuantityInput,
  removeFromCart, setLineDiscount, setLineQuantity, type CartLine,
} from "./pos/pos.utils";

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));
const NO_SUGGESTIONS = { term: "", items: [] as Product[] };

export default function SalesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManageCart = user?.role === "admin" || user?.role === "cashier";

  const [cash, setCash] = useState<CashSession | null>(null);
  const [cashLoaded, setCashLoaded] = useState(false);
  const [taxRateBasisPoints, setTaxRateBasisPoints] = useState<number | null>(null);

  // El carrito vive también en un ref para validar sin depender del último render
  // (un lector de códigos puede disparar dos Enter seguidos).
  const [cart, setCart] = useState<CartLine[]>([]);
  const cartRef = useRef<CartLine[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [lastProduct, setLastProduct] = useState<Product | null>(null);
  const [lastFolio, setLastFolio] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [quantityText, setQuantityText] = useState("1");
  const [suggest, setSuggest] = useState(NO_SUGGESTIONS);
  const [highlight, setHighlight] = useState(0);

  const [paying, setPaying] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payError, setPayError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearAuthOpen, setClearAuthOpen] = useState(false);
  const [adminAction, setAdminAction] = useState<{ kind: "edit" | "remove"; productId: number } | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminOptions, setAdminOptions] = useState<AdminOption[]>([]);
  const [adminQuantityText, setAdminQuantityText] = useState("");
  const [adminDiscountText, setAdminDiscountText] = useState("");
  const [adminActionError, setAdminActionError] = useState("");
  const [adminActionSaving, setAdminActionSaving] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);

  const operation = useRef<{ id: string; fingerprint: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);

  const focusMain = useCallback((select = false) => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (select) input.select();
  }, []);
  const focusMainSoon = useCallback(() => {
    window.requestAnimationFrame(() => focusMain());
  }, [focusMain]);
  const commitCart = useCallback((next: CartLine[]) => {
    cartRef.current = next;
    setCart(next);
  }, []);

  /* ---------- Carga inicial ---------- */
  useEffect(() => {
    let active = true;
    getOpenCashSession()
      .then((session) => { if (active) setCash(session); })
      .catch((err) => { if (active) setError(messageOf(err)); })
      .finally(() => { if (active) setCashLoaded(true); });
    getBusinessSettings()
      .then((settings) => {
        if (!active) return;
        setTaxRateBasisPoints(settings.taxRateBasisPoints);
      })
      .catch((err) => { if (active) setError(messageOf(err)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (user?.role !== "cashier") return;
    listActiveAdmins().then((admins) => {
      setAdminOptions(admins);
      setAdminUsername((current) => current || admins[0]?.username || "");
    }).catch((cause) => setAdminActionError(messageOf(cause)));
  }, [user?.role]);

  /* ---------- Sugerencias mientras se escribe ---------- */
  const entry = useMemo(() => parseEntry(query), [query]);
  const searchTerm = entry.code;
  const showSuggestions =
    !paying && searchTerm !== "" && !looksLikeBarcode(searchTerm) && suggest.items.length > 0;

  useEffect(() => {
    if (!searchTerm || looksLikeBarcode(searchTerm)) return;
    let active = true;
    const timer = window.setTimeout(() => {
      searchSaleProducts(searchTerm)
        .then((results) => {
          if (!active) return;
          setSuggest({ term: searchTerm, items: results.slice(0, 8) });
          setHighlight(0);
        })
        .catch((err) => { if (active) setError(messageOf(err)); });
    }, 150);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [searchTerm]);

  const totals = useMemo(() => calculateTotals(cart, taxRateBasisPoints), [cart, taxRateBasisPoints]);

  /* ---------- Captura ---------- */
  function handleQueryChange(value: string) {
    setQuery(value);
    setHighlight(0);
    if (!value.trim()) setSuggest(NO_SUGGESTIONS);
  }

  function currentQuantity() {
    const parsed = parseEntry(query);
    return parsed.hasQuantityPrefix ? parsed.quantityMilli : parseQuantityInput(quantityText);
  }

  function addProduct(product: Product, quantityMilli: number) {
    const result = addToCart(cartRef.current, product, quantityMilli);
    // El campo se limpia siempre: si no, el siguiente escaneo se concatenaría al anterior.
    setQuery("");
    setQuantityText("1");
    setSuggest(NO_SUGGESTIONS);
    if (result.error) {
      setError(result.error);
    } else {
      commitCart(result.cart);
      setSelectedId(product.id);
      setLastProduct(product);
      setReceipt(null);
      setError("");
    }
    focusMainSoon();
  }

  async function submitEntry() {
    const term = entry.code;
    if (!term) return;
    const quantityMilli = currentQuantity();
    if (quantityMilli === null) {
      setError("Escribe una cantidad válida (mayor que cero).");
      quantityRef.current?.focus();
      quantityRef.current?.select();
      return;
    }
    try {
      const results = await searchSaleProducts(term);
      let pick = findExact(results, term);
      if (!pick && !looksLikeBarcode(term)) {
        const highlighted = suggest.term === term ? suggest.items[highlight] : undefined;
        pick = highlighted ?? (results.length === 1 ? results[0] : undefined);
        if (!pick && results.length > 1) {
          setSuggest({ term, items: results.slice(0, 8) });
          setHighlight(0);
          return;
        }
      }
      if (!pick) {
        setError("No encontramos un producto con ese código.");
        if (looksLikeBarcode(term)) setQuery("");
        return;
      }
      addProduct(pick, quantityMilli);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  function pickSuggestion(product: Product) {
    const quantityMilli = currentQuantity();
    if (quantityMilli === null) {
      setError("Escribe una cantidad válida (mayor que cero).");
      return;
    }
    addProduct(product, quantityMilli);
  }

  function moveSelection(delta: number) {
    const lines = cartRef.current;
    if (lines.length === 0) return;
    const index = lines.findIndex((line) => line.product.id === selectedId);
    const next = index === -1 ? lines.length - 1 : Math.min(lines.length - 1, Math.max(0, index + delta));
    setSelectedId(lines[next].product.id);
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "Enter":
        event.preventDefault();
        void submitEntry();
        break;
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        if (showSuggestions) setHighlight((current) => (current + delta + suggest.items.length) % suggest.items.length);
        else moveSelection(delta);
        break;
      }
      case "Escape":
        if (query) {
          event.preventDefault();
          handleQueryChange("");
        }
        break;
      case "Delete":
        if (!query && selectedId !== null) {
          event.preventDefault();
          requestRemove(selectedId);
        }
        break;
    }
  }

  /* ---------- Edición del carrito ---------- */
  function removeLine(productId: number) {
    const lines = cartRef.current;
    const index = lines.findIndex((line) => line.product.id === productId);
    if (index === -1) return;
    const next = removeFromCart(lines, productId);
    commitCart(next);
    setSelectedId(next.length > 0 ? next[Math.min(index, next.length - 1)].product.id : null);
    focusMainSoon();
  }

  function requestEdit(productId: number) {
    if (!canManageCart) return;
    const line = cartRef.current.find((item) => item.product.id === productId);
    if (!line) return;
    setAdminAction({ kind: "edit", productId });
    setAdminQuantityText((line.quantityMilli / 1000).toString());
    setAdminDiscountText(String(line.discountPercent));
    if (user?.role === "cashier") setAdminPassword("");
    setAdminActionError("");
  }

  function requestRemove(productId: number) {
    if (!canManageCart) return;
    if (!cartRef.current.some((line) => line.product.id === productId)) return;
    if (user?.role === "admin") {
      removeLine(productId);
      return;
    }
    setAdminAction({ kind: "remove", productId });
    setAdminPassword("");
    setAdminActionError("");
  }

  async function confirmAdminAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adminAction) return;
    setAdminActionSaving(true);
    setAdminActionError("");
    try {
      if (user?.role === "cashier") await authorizeAdminAction(adminUsername, adminPassword);
      if (adminAction.kind === "remove") {
        removeLine(adminAction.productId);
      } else {
        const quantityMilli = parseQuantityInput(adminQuantityText);
        if (quantityMilli === null) { setAdminActionError("Ingresa una cantidad mayor que cero."); return; }
        const result = setLineQuantity(cartRef.current, adminAction.productId, quantityMilli);
        if (result.error) { setAdminActionError(result.error); return; }
        const discountPercent = Number(adminDiscountText.replace(",", "."));
        if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
          setAdminActionError("El descuento debe estar entre 0 y 100%.");
          return;
        }
        commitCart(setLineDiscount(result.cart, adminAction.productId, discountPercent));
      }
      setAdminAction(null);
      setAdminPassword("");
      focusMainSoon();
    } catch (cause) {
      setAdminActionError(messageOf(cause));
    } finally { setAdminActionSaving(false); }
  }

  function clearSale() {
    commitCart([]);
    setSelectedId(null);
    setLastProduct(null);
    setPaying(false);
    setConfirmClear(false);
    setClearAuthOpen(false);
    setError("");
    operation.current = null;
    focusMainSoon();
  }

  function requestClearSale() {
    setConfirmClear(false);
    if (user?.role === "admin") {
      clearSale();
      return;
    }
    setAdminPassword("");
    setAdminActionError("");
    setClearAuthOpen(true);
  }

  async function confirmAuthorizedClear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminActionSaving(true);
    setAdminActionError("");
    try {
      await authorizeAdminAction(adminUsername, adminPassword);
      clearSale();
    } catch (cause) {
      setAdminActionError(messageOf(cause));
    } finally {
      setAdminActionSaving(false);
    }
  }

  /* ---------- Cobro ---------- */
  const beginCharge = useCallback(() => {
    const hasItems = cartRef.current.length > 0;
    if (!cash) {
      if (!cashLoaded) return;
      if (hasItems) setError("Abre el turno (caja) antes de cobrar.");
      else navigate("/caja");
      return;
    }
    if (!hasItems) {
      focusMain();
      return;
    }
    if (taxRateBasisPoints === null) {
      setError("Cargando la configuración de impuestos. Intenta de nuevo en un momento.");
      return;
    }
    setPayError("");
    setPaying(true);
  }, [cash, cashLoaded, focusMain, navigate, taxRateBasisPoints]);

  async function completeCharge(method: PaymentMethod, receivedCents: number, customerId?: number) {
    const lines = cartRef.current;
    if (lines.length === 0 || saving) return;
    setSaving(true);
    setPayError("");
    const payload = {
      items: lines.map((line) => ({ productId: line.product.id, quantityMilli: line.quantityMilli })),
      discountCents: totals.discountCents,
      paymentMethod: method,
      receivedCents,
      customerId,
    };
    // El mismo operationId solo se reutiliza al reintentar exactamente la misma venta.
    const fingerprint = JSON.stringify(payload);
    if (operation.current?.fingerprint !== fingerprint) {
      operation.current = { id: crypto.randomUUID(), fingerprint };
    }
    try {
      const saved = await completeSale({ operationId: operation.current.id, ...payload });
      setReceipt(saved);
      setLastFolio(saved.folio);
      commitCart([]);
      setSelectedId(null);
      setLastProduct(null);
      setQuery("");
      setPaying(false);
      operation.current = null;
      focusMainSoon();
      void getOpenCashSession().then(setCash).catch(() => undefined);
    } catch (err) {
      setPayError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  /* ---------- Atajos globales: F1 cancelar · F2 cantidad · F3 descuento · F4 buscar · F12 cobrar ---------- */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (paying || confirmClear || clearAuthOpen || adminAction) return; // los diálogos manejan sus propias teclas
      if (withdrawalOpen) return;
      switch (event.key) {
        case "F8":
          if (user?.role === "admin" || user?.role === "cashier") { event.preventDefault(); setWithdrawalOpen(true); }
          break;
        case "F1":
          event.preventDefault();
          if (cartRef.current.length > 0) setConfirmClear(true);
          break;
        case "F2":
          event.preventDefault();
          quantityRef.current?.focus();
          quantityRef.current?.select();
          break;
        case "F3": {
          event.preventDefault();
          const id = selectedId ?? cartRef.current.at(-1)?.product.id;
          if (id === undefined) break;
          setSelectedId(id);
          if (canManageCart) {
            const line = cartRef.current.find((item) => item.product.id === id);
            if (line) {
              setAdminAction({ kind: "edit", productId: id });
              setAdminQuantityText((line.quantityMilli / 1000).toString());
              setAdminDiscountText(String(line.discountPercent));
              setAdminPassword("");
              setAdminActionError("");
            }
          }
          break;
        }
        case "F4":
          event.preventDefault();
          setError("");
          focusMain(true);
          break;
        case "F12":
          event.preventDefault();
          beginCharge();
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [adminAction, beginCharge, canManageCart, clearAuthOpen, confirmClear, focusMain, paying, selectedId, user?.role, withdrawalOpen]);

  /** Un clic en una zona vacía devuelve el foco al campo principal. */
  function handleWorkspaceClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (paying || confirmClear || clearAuthOpen || adminAction) return;
    if ((event.target as HTMLElement).closest("input, textarea, select, a, [role='option']")) return;
    focusMain();
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100 text-slate-800">

      <div className="min-h-0 flex-1 overflow-hidden" onClick={handleWorkspaceClick}>
        <div className="grid min-h-full grid-cols-1 gap-3 p-3 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,2.1fr)_minmax(340px,1fr)] lg:gap-4 lg:p-4">
          <section className="flex min-h-[460px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:min-h-0">
            {(user?.role === "admin" || user?.role === "cashier") && <div className="flex shrink-0 justify-end border-b border-slate-100 px-3 py-2"><button type="button" onClick={() => setWithdrawalOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"><Banknote size={16}/> Retiro de caja <kbd className="rounded bg-white px-1.5 py-0.5 text-[10px]">F8</kbd></button></div>}
            {(error || receipt || (cashLoaded && !cash)) && (
              <div className="shrink-0 space-y-2 border-b border-slate-100 p-3">
                {error && (
                  <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">
                    <AlertCircle className="mt-0.5 shrink-0" size={18} />
                    <p className="min-w-0 flex-1">{error}</p>
                    <button type="button" aria-label="Cerrar aviso" onClick={() => setError("")} className="rounded p-1 text-rose-700 hover:bg-rose-100">
                      <X size={16} />
                    </button>
                  </div>
                )}
                {cashLoaded && !cash && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
                    <p>El turno está cerrado. Ábrelo para poder cobrar.</p>
                    <Link to="/caja" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700">
                      Abrir turno
                    </Link>
                  </div>
                )}
                {receipt && (
                  <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-emerald-900">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 size={22} className="shrink-0" />
                      <div>
                        <strong className="text-sm">Venta completada · {receipt.folio}</strong>
                        <p className="text-xs text-emerald-800">Total {money(receipt.totalCents)}{receipt.paymentMethod === "credit" && receipt.customerName ? ` · Cuenta de ${receipt.customerName}${receipt.dueAt ? ` · vence ${new Date(`${receipt.dueAt.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX")}` : ""}` : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {receipt.changeCents > 0 && (
                        <p className="text-right">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700">Cambio</span>
                          <span className="text-3xl font-extrabold tabular-nums">{money(receipt.changeCents)}</span>
                        </p>
                      )}
                      <button type="button" aria-label="Cerrar aviso" onClick={() => setReceipt(null)} className="rounded p-1 text-emerald-700 hover:bg-emerald-100">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <CartTable
              lines={cart}
              canManageActions={canManageCart}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onEdit={requestEdit}
              onRemove={requestRemove}
              onClear={() => setConfirmClear(true)}
            />

            <QuickEntryBar
              quantityText={quantityText}
              onQuantityChange={setQuantityText}
              query={query}
              onQueryChange={handleQueryChange}
              onInputKeyDown={handleInputKeyDown}
              inputRef={inputRef}
              quantityRef={quantityRef}
              suggestions={suggest.items}
              showSuggestions={showSuggestions}
              highlight={highlight}
              onHighlight={setHighlight}
              onPick={pickSuggestion}
              articleCount={totals.articleCount}
              hasItems={cart.length > 0}
              onCharge={beginCharge}
            />
          </section>

          <aside className="flex min-h-0 min-w-0 flex-col gap-3 lg:gap-4">
            <ClockCard />
            <ProductPreview product={lastProduct} />
            <TotalsCard totals={totals} lastFolio={lastFolio} />
          </aside>
        </div>
      </div>

      {withdrawalOpen && <CashWithdrawalDialog onClose={() => { setWithdrawalOpen(false); focusMainSoon(); }} onSaved={() => { void getOpenCashSession().then(setCash).catch(() => undefined); }} />}
      {paying && (
        <PaymentDialog
          totalCents={totals.totalCents}
          saving={saving}
          error={payError}
          onConfirm={(method, receivedCents, customerId) => void completeCharge(method, receivedCents, customerId)}
          onCancel={() => {
            setPaying(false);
            focusMainSoon();
          }}
        />
      )}
      {confirmClear && (
        <ConfirmDialog
          title="¿Cancelar la venta actual?"
          message="Se quitarán todos los artículos del carrito. Esta acción no se puede deshacer."
          confirmLabel="Sí, cancelar venta"
          onConfirm={requestClearSale}
          onCancel={() => {
            setConfirmClear(false);
            focusMainSoon();
          }}
        />
      )}
      {clearAuthOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="clear-auth-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Autorización requerida</p>
            <h2 id="clear-auth-title" className="mt-1 text-xl font-bold text-slate-900">Cancelar toda la venta</h2>
            <p className="mt-2 text-sm text-slate-600">Un administrador debe autorizar la eliminación de todos los artículos del carrito.</p>
            <form onSubmit={(event) => void confirmAuthorizedClear(event)} className="mt-5 grid gap-4">
              <label className="text-sm font-medium text-slate-700">Usuario administrador<select autoFocus className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-blue-500" value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} required><option value="">Selecciona un administrador</option>{adminOptions.map((admin) => <option key={admin.username} value={admin.username}>{admin.displayName} ({admin.username})</option>)}</select></label>
              <label className="text-sm font-medium text-slate-700">Contraseña del administrador<input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-blue-500" type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} required /></label>
              {adminActionError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{adminActionError}</p>}
              <div className="flex justify-end gap-2"><button type="button" disabled={adminActionSaving} onClick={() => setClearAuthOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold">Volver</button><button type="submit" disabled={adminActionSaving || adminOptions.length === 0} className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{adminActionSaving ? "Validando…" : "Autorizar y cancelar"}</button></div>
            </form>
          </section>
        </div>
      )}
      {adminAction && (() => {
        const line = cart.find((item) => item.product.id === adminAction.productId);
        if (!line) return null;
        const editing = adminAction.kind === "edit";
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !adminActionSaving) setAdminAction(null); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="admin-action-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Autorización requerida</p>
              <h2 id="admin-action-title" className="mt-1 text-xl font-bold text-slate-900">{editing ? "Editar cantidad" : "Eliminar de la venta"}</h2>
              <p className="mt-2 text-sm text-slate-600"><strong>{line.product.name}</strong>{editing ? " · captura la cantidad que se va a vender." : " · se quitará del carrito actual."}</p>
              <form onSubmit={(event) => void confirmAdminAction(event)} className="mt-5 grid gap-4">
                {editing && <><label className="text-sm font-medium text-slate-700">Cantidad ({line.product.unit === "piece" ? "piezas enteras" : line.product.unit})<input autoFocus className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" type="number" min={line.product.unit === "piece" ? "1" : "0.001"} step={line.product.unit === "piece" ? "1" : "0.001"} value={adminQuantityText} onChange={(event) => setAdminQuantityText(event.target.value)} required /></label><label className="text-sm font-medium text-slate-700">Descuento (%)<input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" type="number" min="0" max="100" step="0.01" value={adminDiscountText} onChange={(event) => setAdminDiscountText(event.target.value)} required /><span className="mt-1 block text-xs font-normal text-slate-500">El descuento se aplica solo a este producto.</span></label></>}
                {user?.role === "cashier" && <><label className="text-sm font-medium text-slate-700">Usuario administrador<select autoFocus={!editing} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} required><option value="">Selecciona un administrador</option>{adminOptions.map((admin) => <option key={admin.username} value={admin.username}>{admin.displayName} ({admin.username})</option>)}</select></label><label className="text-sm font-medium text-slate-700">Contraseña del administrador<input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} required /></label></>}
                {adminActionError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{adminActionError}</p>}
                <div className="flex justify-end gap-2"><button type="button" disabled={adminActionSaving} onClick={() => { setAdminAction(null); focusMainSoon(); }} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button><button type="submit" disabled={adminActionSaving || (user?.role === "cashier" && adminOptions.length === 0)} className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${editing ? "bg-blue-600 hover:bg-blue-700" : "bg-rose-600 hover:bg-rose-700"}`}>{adminActionSaving ? "Guardando…" : editing ? user?.role === "cashier" ? "Autorizar y guardar" : "Guardar cambios" : "Autorizar y eliminar"}</button></div>
              </form>
            </section>
          </div>
        );
      })()}
    </div>
  );
}
