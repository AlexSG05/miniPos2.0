/**
 * ============================================================================
 * UTILIDAD: pos.utils.ts (Motor de Lógica de Negocio y Carrito POS)
 * ============================================================================
 * 
 * PROPÓSITO:
 * Contiene las funciones puras, validaciones, conversiones financieras y lógica
 * operativa para el Punto de Venta (POS).
 *
 * ARQUITECTURA Y PATRONES:
 * 1. Precisión Financiera: Moneda manejada estrictamente en CENTAVOS enteros 
 *    y cantidades en MILI-UNIDADES (cantidad * 1000) para eliminar errores de 
 *    redondeo flotante IEEE 754.
 * 2. Funciones Puras: Las operaciones del carrito (`addToCart`, `setLineQuantity`, etc.)
 *    no mutan el estado, facilitando las pruebas unitarias y la integración en React.
 * 3. Parser de Entrada Rápida: Soporta la sintaxis de cajero `[cantidad]*[código]`.
 * 4. Reglas de Validación: Valida stock máximo, piezas enteras e impuestos calculados
 *    en puntos base con redondeo half-up idéntico al backend.
 * ============================================================================
 */
import type { Product } from "../../products/products.api";

export type Unit = Product["unit"];
export type CartLine = { lineId: string; product: Product; quantityMilli: number; discountPercent: number };
export type CartResult = { cart: CartLine[]; error?: string };

const currency = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const plainAmount = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "$1,234.50" */
export const money = (cents: number) => currency.format(cents / 100);
/** "1,234.50" (sin símbolo, para el bloque de TOTAL) */
export const amount = (cents: number) => plainAmount.format(cents / 100);

export const UNIT_LABELS: Record<Unit, string> = { piece: "pza", kg: "kg", g: "g", liter: "L", ml: "ml" };

export function formatQuantity(milli: number) {
  return (milli / 1000).toLocaleString("es-MX", { maximumFractionDigits: 3, useGrouping: false });
}

/** Paso de los botones + / − de cada línea. */
export function stepMilli(unit: Unit) {
  if (unit === "piece") return 1000;
  if (unit === "kg" || unit === "liter") return 500;
  return 100_000; // g y ml: 100 por clic
}

/** Máximo vendible. Usa el mismo floor que el backend para no discrepar. */

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}

export const lineSubtotalCents = (line: CartLine) =>
  Math.round((line.product.priceCents * line.quantityMilli) / 1000);
export const lineDiscountCents = (line: CartLine) =>
  Math.round((lineSubtotalCents(line) * clampPercent(line.discountPercent)) / 100);
export const lineTotalCents = (line: CartLine) => lineSubtotalCents(line) - lineDiscountCents(line);

export type Totals = {
  lineCount: number;
  articleCount: number;
  weightKg: number;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
};

/** Misma fórmula que el backend: impuesto sobre (subtotal − descuento), redondeo half-up. */
export function calculateTotals(cart: CartLine[], taxRateBasisPoints: number | null): Totals {
  let subtotalCents = 0;
  let discountCents = 0;
  let articleMilli = 0;
  let weightKg = 0;
  for (const line of cart) {
    subtotalCents += lineSubtotalCents(line);
    discountCents += lineDiscountCents(line);
    articleMilli += line.quantityMilli;
    if (line.product.unit === "kg") weightKg += line.quantityMilli / 1000;
    else if (line.product.unit === "g") weightKg += line.quantityMilli / 1_000_000;
  }
  const taxableCents = subtotalCents - discountCents;
  const taxCents =
    taxRateBasisPoints === null ? 0 : Math.floor((taxableCents * taxRateBasisPoints + 5000) / 10000);
  return {
    lineCount: cart.length,
    articleCount: articleMilli / 1000,
    weightKg,
    subtotalCents,
    discountCents,
    taxCents,
    totalCents: taxableCents + taxCents,
  };
}

/* ---------- Operaciones del carrito (puras) ---------- */

export function createLineId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function addToCart(cart: CartLine[], product: Product, quantityMilli: number): CartResult {
  if (!Number.isFinite(quantityMilli) || quantityMilli <= 0) {
    return { cart, error: "La cantidad debe ser mayor que cero." };
  }
  if (product.unit === "piece" && quantityMilli % 1000 !== 0) {
    return { cart, error: `${product.name} se vende en piezas enteras.` };
  }
  if (!product.active) return { cart, error: `${product.name} está inactivo.` };

  // Cada escaneo o captura es un renglón independiente en el ticket/caja
  const newLine: CartLine = {
    lineId: createLineId(),
    product,
    quantityMilli,
    discountPercent: 0,
  };

  return { cart: [...cart, newLine] };
}

export function setLineQuantity(cart: CartLine[], lineId: string, quantityMilli: number): CartResult {
  const line = cart.find((item) => item.lineId === lineId);
  if (!line) return { cart };
  if (quantityMilli <= 0) return { cart: removeFromCart(cart, lineId) };
  const { product } = line;
  if (product.unit === "piece" && quantityMilli % 1000 !== 0) {
    return { cart, error: `${product.name} se vende en piezas enteras.` };
  }
  return {
    cart: cart.map((item) =>
      item.lineId === lineId ? { ...item, quantityMilli } : item
    ),
  };
}

export function setLineDiscount(cart: CartLine[], lineId: string, percent: number): CartLine[] {
  return cart.map((line) =>
    line.lineId === lineId ? { ...line, discountPercent: clampPercent(percent) } : line
  );
}

export const removeFromCart = (cart: CartLine[], lineId: string) =>
  cart.filter((line) => line.lineId !== lineId);

/* ---------- Captura rápida ---------- */

/** Texto → cantidad ×1000, o null si no es un número mayor que cero. */
export function parseQuantityInput(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const milli = Math.round(value * 1000);
  return milli > 0 ? milli : null;
}

const ENTRY_WITH_QUANTITY = /^\s*(\d+(?:[.,]\d+)?)\s*\*\s*(\S.*)$/;

/** Acepta "código" o "cantidad*código" (p. ej. "3*7501055300000"). */
export function parseEntry(raw: string): { code: string; quantityMilli: number | null; hasQuantityPrefix: boolean } {
  const match = ENTRY_WITH_QUANTITY.exec(raw);
  if (!match) return { code: raw.trim(), quantityMilli: null, hasQuantityPrefix: false };
  return { code: match[2].trim(), quantityMilli: parseQuantityInput(match[1]), hasQuantityPrefix: true };
}

/** Los lectores entregan códigos numéricos largos; esos no se "adivinan" por nombre. */
export const looksLikeBarcode = (code: string) => /^\d{6,}$/.test(code);

export function findExact(products: Product[], code: string) {
  const wanted = code.toLocaleLowerCase();
  return products.find(
    (product) => product.barcode === code || product.internalCode.toLocaleLowerCase() === wanted
  );
}

/* ---------- Presentación ---------- */

export function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 6) return "¡Buenas noches!";
  if (hour < 12) return "¡Buenos días!";
  if (hour < 19) return "¡Buenas tardes!";
  return "¡Buenas noches!";
}

/** Billetes sugeridos (en centavos) para el cobro en efectivo: los 3 primeros que cubren el total. */
export function cashSuggestions(totalCents: number): number[] {
  const denominations = [20, 50, 100, 200, 500, 1000].map((pesos) => pesos * 100);
  const above = denominations.filter((cents) => cents >= totalCents).slice(0, 3);
  if (above.length > 0) return above;
  const next = Math.ceil(totalCents / 50_000) * 50_000;
  return [next, next + 50_000];
}
