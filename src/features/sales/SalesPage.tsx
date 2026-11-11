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
import { AlertCircle, X } from "lucide-react";
import { closeCashSession, getOpenCashSession, openCashSession, type CashClosure, type CashDenomination, type CashSession } from "../cash-register/cash.api";
import type { Product } from "../products/products.api";
import { getBusinessSettings } from "../settings/settings.api";
import { completeSale, searchSaleProducts, type SaleReceipt } from "./sales.api";
import { authorizeAdminAction, listActiveAdmins, type AdminOption } from "../auth/auth.api";
import { useAuth } from "../auth/useAuth";
import CartTable from "./pos/CartTable";
import ClockCard from "./pos/ClockCard";
import ConfirmDialog from "./pos/ConfirmDialog";
import ChangeReceiptDialog from "./pos/ChangeReceiptDialog";
import GlobalDiscountDialog from "./pos/GlobalDiscountDialog";
import PaymentDialog, { type PaymentMethod } from "./pos/PaymentDialog";
import ProductPreview from "./pos/ProductPreview";
import QuickEntryBar from "./pos/QuickEntryBar";
import TotalsCard from "./pos/TotalsCard";
import CashWithdrawalDialog from "../cash-register/CashWithdrawalDialog";
import {
  addToCart, calculateTotals, clampPercent, findExact, looksLikeBarcode, parseEntry, parseQuantityInput,
  removeFromCart, setLineDiscount, setLineQuantity, type CartLine,
} from "./pos/pos.utils";

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));
const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
const NO_SUGGESTIONS = { term: "", items: [] as Product[] };

export default function SalesPage() {
  const { user } = useAuth();
  const canManageCart = user?.role === "admin" || user?.role === "cashier";

  const [cash, setCash] = useState<CashSession | null>(null);
  const [cashLoaded, setCashLoaded] = useState(false);
  const [openingCash, setOpeningCash] = useState(false);
  const [closingCash, setClosingCash] = useState(false);
  const [initialCash, setInitialCash] = useState("0.00");
  const [openingNote, setOpeningNote] = useState("");
  const [declaredCash, setDeclaredCash] = useState("");
  const [cashSaving, setCashSaving] = useState(false);
  const [cashError, setCashError] = useState("");
  const [closedReport, setClosedReport] = useState<CashClosure | null>(null);
  const [taxRateBasisPoints, setTaxRateBasisPoints] = useState<number | null>(null);

  // El carrito vive también en un ref para validar sin depender del último render
  // (un lector de códigos puede disparar dos Enter seguidos).
  const [cart, setCart] = useState<CartLine[]>([]);
  const cartRef = useRef<CartLine[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastProduct, setLastProduct] = useState<Product | null>(null);
  const [lastFolio, setLastFolio] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [quantityText, setQuantityText] = useState("1");
  const [suggest, setSuggest] = useState(NO_SUGGESTIONS);
  const [highlight, setHighlight] = useState(0);

  const [paying, setPaying] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [globalDiscountOpen, setGlobalDiscountOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payError, setPayError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearAuthOpen, setClearAuthOpen] = useState(false);
  const [adminAction, setAdminAction] = useState<{ kind: "edit" | "remove"; lineId: string } | null>(null);
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
  const isShiftOpen = Boolean(cash);
  const currentShiftData = cash;

  async function submitCashOpen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCashSaving(true); setCashError("");
    try {
      const cents = Math.round(Number(initialCash) * 100);
      if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Ingresa un fondo inicial válido.");
      const session = await openCashSession(cents, openingNote.trim());
      setCash(session); setOpeningCash(false); setOpeningNote("");
      if (cartRef.current.length > 0) {
        if (taxRateBasisPoints === null) setError("Cargando la configuración de impuestos. Intenta de nuevo en un momento.");
        else { setPayError(""); setPaying(true); }
      }
    } catch (cause) { setCashError(messageOf(cause)); }
    finally { setCashSaving(false); }
  }

  async function submitCashClose(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!cash) return;
  setCashSaving(true);
  setCashError("");

  try {
    const counted = Math.round(Number(declaredCash) * 100);
    if (!Number.isSafeInteger(counted) || counted < 0) throw new Error("Ingresa un efectivo contado válido.");
    if (counted % 5 !== 0) throw new Error("El efectivo contado debe corresponder a las denominaciones disponibles (múltiplos de $0.05).");

    let remainder = counted;
    const denominations: CashDenomination[] = [100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100, 50, 20, 10, 5]
      .map((denominationCents) => {
        const quantity = Math.floor(remainder / denominationCents);
        remainder %= denominationCents;
        return { denominationCents, quantity, subtotalCents: denominationCents * quantity };
      })
      .filter((item) => item.quantity > 0);

    // Si hay diferencia, mandamos un motivo automático para cumplir la validación del backend
    const difference = counted - cash.expectedCents;
    const differenceReason =
      difference === 0
        ? ""
        : difference < 0
        ? "Faltante registrado al cierre de caja"
        : "Sobrante registrado al cierre de caja";

    const closure = await closeCashSession({ denominations, differenceReason });

    setCash(null);
    setClosingCash(false);
    setClosedReport(closure);
    setDeclaredCash("");
  } catch (cause) {
    setCashError(messageOf(cause));
  } finally {
    setCashSaving(false);
  }
}
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
      const added = result.cart[result.cart.length - 1];
      setSelectedId(added?.lineId ?? null);
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
    const index = lines.findIndex((line) => line.lineId === selectedId);
    const next = index === -1 ? lines.length - 1 : Math.min(lines.length - 1, Math.max(0, index + delta));
    setSelectedId(lines[next].lineId);
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
  function removeLine(lineId: string) {
    const lines = cartRef.current;
    const index = lines.findIndex((line) => line.lineId === lineId);
    if (index === -1) return;
    const next = removeFromCart(lines, lineId);
    commitCart(next);
    setSelectedId(next.length > 0 ? next[Math.min(index, next.length - 1)].lineId : null);
    focusMainSoon();
  }

  function requestEdit(lineId: string) {
    if (!canManageCart) return;
    const line = cartRef.current.find((item) => item.lineId === lineId);
    if (!line) return;
    setAdminAction({ kind: "edit", lineId });
    setAdminQuantityText((line.quantityMilli / 1000).toString());
    setAdminDiscountText(String(line.discountPercent));
    if (user?.role === "cashier") setAdminPassword("");
    setAdminActionError("");
  }

  function requestRemove(lineId: string) {
    if (!canManageCart) return;
    if (!cartRef.current.some((line) => line.lineId === lineId)) return;
    if (user?.role === "admin") {
      removeLine(lineId);
      return;
    }
    setAdminAction({ kind: "remove", lineId });
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
        removeLine(adminAction.lineId);
      } else {
        const quantityMilli = parseQuantityInput(adminQuantityText);
        if (quantityMilli === null) { setAdminActionError("Ingresa una cantidad mayor que cero."); return; }
        const result = setLineQuantity(cartRef.current, adminAction.lineId, quantityMilli);
        if (result.error) { setAdminActionError(result.error); return; }
        const discountPercent = Number(adminDiscountText.replace(",", "."));
        if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
          setAdminActionError("El descuento debe estar entre 0 y 100%.");
          return;
        }
        commitCart(setLineDiscount(result.cart, adminAction.lineId, discountPercent));
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
      setError(""); setOpeningCash(true);
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
  }, [cash, cashLoaded, focusMain, taxRateBasisPoints]);

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

  function handleApplyGlobalDiscount(percent: number) {
    const clamped = clampPercent(percent);
    const updated = cartRef.current.map((line) => ({
      ...line,
      discountPercent: clamped,
    }));
    commitCart(updated);
    focusMainSoon();
  }

  /* ---------- Atajos globales: F1 cancelar · F2 descuento · F3 cantidad · F4 buscar · F8 retiro · F12 cobrar ---------- */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "F12" && !cash && cashLoaded && canManageCart) {
        event.preventDefault(); setError(""); setOpeningCash(true); return;
      }
      if (paying || confirmClear || clearAuthOpen || adminAction || globalDiscountOpen || withdrawalOpen || Boolean(receipt)) return;

      const hasItems = cartRef.current.length > 0;
      const isInputActive = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;

      // Atajos de Teclas de Función F1 - F12
      switch (event.key) {
        case "F1":
          event.preventDefault();
          if (hasItems) setConfirmClear(true);
          return;
        case "F2":
          event.preventDefault();
          if (hasItems) setGlobalDiscountOpen(true);
          return;
        case "F3": {
          event.preventDefault();
          const id = selectedId ?? cartRef.current.at(-1)?.lineId;
          if (id !== undefined) {
            setSelectedId(id);
            requestEdit(id);
          } else {
            quantityRef.current?.focus();
            quantityRef.current?.select();
          }
          return;
        }
        case "F4":
          event.preventDefault();
          setError("");
          focusMain(true);
          return;
        case "F8":
          if (user?.role === "admin" || user?.role === "cashier") {
            event.preventDefault();
            setWithdrawalOpen(true);
          }
          return;
        case "F12":
          event.preventDefault();
          beginCharge();
          return;
      }

      // Atajos alternativos para Laptop (Alt + Letra)
      if (event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "x" && hasItems) {
          event.preventDefault();
          setConfirmClear(true);
        } else if (key === "d" && hasItems) {
          event.preventDefault();
          setGlobalDiscountOpen(true);
        } else if (key === "c") {
          event.preventDefault();
          const id = selectedId ?? cartRef.current.at(-1)?.lineId;
          if (id !== undefined) {
            setSelectedId(id);
            requestEdit(id);
          } else {
            quantityRef.current?.focus();
            quantityRef.current?.select();
          }
        } else if (key === "b") {
          event.preventDefault();
          setError("");
          focusMain(true);
        } else if (key === "r" && (user?.role === "admin" || user?.role === "cashier")) {
          event.preventDefault();
          setWithdrawalOpen(true);
        }
        return;
      }

      // Cobrar con Ctrl+Enter en cualquier momento
      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        beginCharge();
        return;
      }

      // Cobrar con '+' si el buscador está vacío
      if (event.key === "+" && !query && document.activeElement === inputRef.current && hasItems) {
        event.preventDefault();
        beginCharge();
        return;
      }

      // Buscar con '/' si no se está escribiendo en un input
      if (event.key === "/" && !isInputActive) {
        event.preventDefault();
        focusMain(true);
        return;
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [adminAction, beginCharge, canManageCart, cash, cashLoaded, clearAuthOpen, confirmClear, focusMain, globalDiscountOpen, paying, query, receipt, requestEdit, selectedId, user?.role, withdrawalOpen]);

  /** Un clic en una zona vacía devuelve el foco al campo principal. */
  function handleWorkspaceClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (paying || confirmClear || clearAuthOpen || adminAction || receipt) return;
    if ((event.target as HTMLElement).closest("input, textarea, select, a, [role='option']")) return;
    focusMain();
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100 text-slate-800">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm">
  <div></div>
    <button
      type="button"
      disabled={!cashLoaded || !canManageCart}
      onClick={() => {
        setCashError("");
        if (isShiftOpen && currentShiftData) {
          setDeclaredCash("");
          setClosingCash(true);
        } else setOpeningCash(true);
      }}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition disabled:cursor-wait disabled:opacity-50 ${
        isShiftOpen
          ? "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-sm shadow-rose-200"
          : "border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {isShiftOpen && currentShiftData
        ? `Cerrar turno #${currentShiftData.id}`
        : cashLoaded
        ? "Abrir caja"
        : "Consultando caja…"}
    </button>
  </div>
      <div className="min-h-0 flex-1 overflow-hidden" onClick={handleWorkspaceClick}>
        <div className="grid min-h-full grid-cols-1 gap-3 p-3 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,2.1fr)_minmax(340px,1fr)] lg:gap-4 lg:p-4">
          <section className="flex min-h-[460px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:min-h-0">
            {error && (
              <div className="shrink-0 space-y-2 border-b border-slate-100 p-3">
                <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">
                  <AlertCircle className="mt-0.5 shrink-0" size={18} />
                  <p className="min-w-0 flex-1">{error}</p>
                  <button type="button" aria-label="Cerrar aviso" onClick={() => setError("")} className="rounded p-1 text-rose-700 hover:bg-rose-100">
                    <X size={16} />
                  </button>
                </div>
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
              onOpenWithdrawal={user?.role === "admin" || user?.role === "cashier" ? () => setWithdrawalOpen(true) : undefined}
              onOpenDiscount={() => setGlobalDiscountOpen(true)}
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

      {receipt && (
        <ChangeReceiptDialog
          receipt={receipt}
          onClose={() => {
            setReceipt(null);
            focusMainSoon();
          }}
        />
      )}
      
      {openingCash && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4"><section role="dialog" aria-modal="true" aria-labelledby="cash-open-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Inicio de turno</p><h2 id="cash-open-title" className="mt-1 text-xl font-bold text-slate-900">Apertura de caja</h2><p className="mt-2 text-sm text-slate-600">Registra el efectivo disponible para dar cambio. Al confirmar, podrás continuar con el cobro del carrito.</p><form onSubmit={(event) => void submitCashOpen(event)} className="mt-5 grid gap-4"><label className="text-sm font-medium">Fondo de caja inicial (MXN)<input autoFocus required type="number" min="0" step="0.01" value={initialCash} onChange={(event) => setInitialCash(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-emerald-500" /></label><label className="text-sm font-medium">Notas u observaciones <span className="font-normal text-slate-400">(opcional)</span><textarea rows={2} maxLength={240} value={openingNote} onChange={(event) => setOpeningNote(event.target.value)} placeholder="Ej. Entregado por supervisión" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-emerald-500" /></label>{cashError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{cashError}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={cashSaving} onClick={() => setOpeningCash(false)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold">Cancelar</button><button disabled={cashSaving} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{cashSaving ? "Abriendo…" : "Confirmar apertura"}</button></div></form></section></div>}{closedReport && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4"><section role="dialog" aria-modal="true" aria-labelledby="z-report-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Corte Z guardado</p><h2 id="z-report-title" className="mt-1 text-xl font-bold">Resumen · Turno #{closedReport.id}</h2><div className="mt-4 space-y-2 border-y border-slate-200 py-4 text-sm"><p className="flex justify-between"><span>Abrió</span><strong>{closedReport.openedByName}</strong></p><p className="flex justify-between"><span>Fondo inicial</span><strong>{money(closedReport.openingCents)}</strong></p><p className="flex justify-between"><span>Efectivo esperado</span><strong>{money(closedReport.expectedCents)}</strong></p><p className="flex justify-between"><span>Contado</span><strong>{money(closedReport.countedCents)}</strong></p><p className="flex justify-between font-bold"><span>Diferencia</span><strong>{money(closedReport.differenceCents)}</strong></p></div>{closedReport.differenceReason && <p className="mt-3 text-sm text-slate-600">Motivo: {closedReport.differenceReason}</p>}<div className="mt-5 flex justify-end gap-2"><button onClick={() => window.print()} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold">Imprimir</button><button onClick={() => setClosedReport(null)} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Listo</button></div></section></div>}
      {closingCash && cash && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4">
            <section role="dialog" aria-modal="true" aria-labelledby="cash-close-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl">
              <p className="text-sm font-bold uppercase tracking-wider text-blue-700">Turno #{cash.id}</p>
              <h2 id="cash-close-title" className="mt-1 text-2xl font-extrabold text-slate-900">Cierre de caja</h2>
              
              <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl bg-slate-50 p-5 text-base">
                <span className="text-slate-500 font-medium">Cajero activo</span>
                <strong className="text-right text-slate-900">{cash.openedByName}</strong>
                <span className="text-slate-500 font-medium">Hora de apertura</span>
                <strong className="text-right text-slate-900">{new Date(cash.openedAt).toLocaleString("es-MX")}</strong>
                <span className="text-slate-500 font-medium">Fondo inicial</span>
                <strong className="text-right text-slate-900">{money(cash.openingCents)}</strong>
              </div>

              <form onSubmit={(event) => void submitCashClose(event)} className="mt-6 grid gap-6">
                <div className="flex flex-col items-center">
                  <label className="text-base font-semibold text-slate-800 mb-2 text-center">
                    Efectivo declarado
                  </label>
                  <input 
                    autoFocus 
                    required 
                    type="number" 
                    min="0" 
                    step="0.01" 
                    value={declaredCash}
                    onChange={(event) => setDeclaredCash(event.target.value)} 
                    className="w-full max-w-xs rounded-xl border-2 border-slate-300 px-4 py-3 text-center text-xl font-bold outline-none focus:border-blue-500 transition-all shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                  />
                </div>
                
                {cashError && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-base font-medium text-rose-700">{cashError}</p>}
                
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button 
                    type="button" 
                    disabled={cashSaving} 
                    onClick={() => setClosingCash(false)} 
                    className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Continuar vendiendo
                  </button>
                  
                  <button 
                    disabled={cashSaving || !declaredCash} 
                    className="rounded-xl bg-rose-600 px-6 py-3 text-base font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {cashSaving ? "Guardando cierre…" : "Finalizar cierre de caja"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      {withdrawalOpen && <CashWithdrawalDialog onClose={() => { setWithdrawalOpen(false); focusMainSoon(); }} onSaved={() => { void getOpenCashSession().then(setCash).catch(() => undefined); }} />}
      
      {globalDiscountOpen && (
        <GlobalDiscountDialog
          cartLength={cart.length}
          userRole={user?.role}
          adminOptions={adminOptions}
          onApply={handleApplyGlobalDiscount}
          onClose={() => {
            setGlobalDiscountOpen(false);
            focusMainSoon();
          }}
        />
      )}
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
        const line = cart.find((item) => item.lineId === adminAction.lineId);
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
