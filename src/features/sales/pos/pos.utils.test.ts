import { describe, expect, it } from "vitest";
import type { Product } from "../../products/products.api";
import {
  addToCart, amount, calculateTotals, cashSuggestions, findExact, formatQuantity, greetingFor,
  looksLikeBarcode, money, parseEntry, parseQuantityInput, removeFromCart, setLineDiscount,
  setLineQuantity, type CartLine,
} from "./pos.utils";

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 1,
  categoryId: null,
  categoryName: null,
  internalCode: "ABR-001",
  barcode: "7501000000001",
  name: "Refresco 600 ml",
  description: null,
  costCents: 1000,
  priceCents: 2500,
  stockQuantity: 10,
  minStock: 2,
  unit: "piece",
  active: true,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...overrides,
});

const line = (p: Product, quantityMilli: number, discountPercent = 0, lineId = "test-1"): CartLine => ({
  lineId,
  product: p,
  quantityMilli,
  discountPercent,
});

describe("calculateTotals", () => {
  it("suma líneas, descuentos por línea e impuesto sobre el neto (igual que el backend)", () => {
    const soda = product({ id: 1, priceCents: 2500, unit: "piece" });
    const apples = product({ id: 2, priceCents: 3000, unit: "kg", stockQuantity: 20 });
    const totals = calculateTotals([line(soda, 3000, 10), line(apples, 1500)], 1600);

    expect(totals.subtotalCents).toBe(12000); // 7500 + 4500
    expect(totals.discountCents).toBe(750); // 10 % de 7500
    expect(totals.taxCents).toBe(1800); // 11250 × 16 % = 1800.5 → 1800
    expect(totals.totalCents).toBe(13050);
    expect(totals.lineCount).toBe(2);
    expect(totals.articleCount).toBe(4.5);
    expect(totals.weightKg).toBe(1.5);
  });

  it("convierte gramos a kilos y no cuenta piezas ni litros como peso", () => {
    const grams = product({ id: 1, unit: "g", priceCents: 10, stockQuantity: 5000 });
    const liters = product({ id: 2, unit: "liter", priceCents: 1800, stockQuantity: 50 });
    const piece = product({ id: 3 });
    const totals = calculateTotals([line(grams, 250_000), line(liters, 2000), line(piece, 1000)], null);

    expect(totals.weightKg).toBe(0.25);
    expect(totals.taxCents).toBe(0); // sin tasa cargada todavía
  });

  it("devuelve ceros con el carrito vacío", () => {
    const totals = calculateTotals([], 1600);
    expect(totals.totalCents).toBe(0);
    expect(totals.articleCount).toBe(0);
    expect(totals.weightKg).toBe(0);
  });
});

describe("addToCart", () => {
  it("agrega una línea nueva sin descuento", () => {
    const result = addToCart([], product(), 1000);
    expect(result.error).toBeUndefined();
    expect(result.cart).toHaveLength(1);
    expect(result.cart[0].discountPercent).toBe(0);
    expect(result.cart[0].quantityMilli).toBe(1000);
  });

  it("agrega un nuevo renglón cada vez aunque sea el mismo producto", () => {
    const first = addToCart([], product(), 1000).cart;
    const second = addToCart(first, product(), 2000);
    expect(second.cart).toHaveLength(2);
    expect(second.cart[0].quantityMilli).toBe(1000);
    expect(second.cart[1].quantityMilli).toBe(2000);
    expect(second.cart[0].lineId).not.toBe(second.cart[1].lineId);
  });

  it("rechaza productos inactivos, cantidades inválidas y piezas fraccionadas", () => {
    expect(addToCart([], product({ active: false }), 1000).error).toMatch(/está inactivo/);
    expect(addToCart([], product(), 0).error).toMatch(/mayor que cero/);
    expect(addToCart([], product(), -1000).error).toMatch(/mayor que cero/);
    expect(addToCart([], product(), 1500).error).toMatch(/piezas enteras/);
  });

  it("permite fracciones en productos por peso", () => {
    const result = addToCart([], product({ unit: "kg", stockQuantity: 5 }), 750);
    expect(result.error).toBeUndefined();
    expect(result.cart[0].quantityMilli).toBe(750);
  });
});

describe("setLineQuantity / setLineDiscount / removeFromCart", () => {
  const cart = [line(product({ stockQuantity: 5 }), 2000, 0, "line-1")];

  it("quita la línea con cantidad cero o negativa", () => {
    expect(setLineQuantity(cart, "line-1", 0).cart).toHaveLength(0);
    expect(setLineQuantity(cart, "line-1", -1000).cart).toHaveLength(0);
  });

  it("actualiza la cantidad cuando es válida", () => {
    const result = setLineQuantity(cart, "line-1", 3000);
    expect(result.cart[0].quantityMilli).toBe(3000);
    expect(result.error).toBeUndefined();
  });

  it("no acepta fracciones en piezas", () => {
    const result = setLineQuantity(cart, "line-1", 2500);
    expect(result.error).toMatch(/piezas enteras/);
    expect(result.cart[0].quantityMilli).toBe(2000);
  });

  it("mantiene el descuento dentro de 0–100 %", () => {
    expect(setLineDiscount(cart, "line-1", 150)[0].discountPercent).toBe(100);
    expect(setLineDiscount(cart, "line-1", -5)[0].discountPercent).toBe(0);
    expect(setLineDiscount(cart, "line-1", Number.NaN)[0].discountPercent).toBe(0);
    expect(setLineDiscount(cart, "line-1", 12.5)[0].discountPercent).toBe(12.5);
  });

  it("quita una línea por su lineId", () => {
    expect(removeFromCart(cart, "line-1")).toHaveLength(0);
    expect(removeFromCart(cart, "otra-linea")).toHaveLength(1);
  });
});

describe("captura rápida", () => {
  it("interpreta cantidades escritas", () => {
    expect(parseQuantityInput("2")).toBe(2000);
    expect(parseQuantityInput("0,5")).toBe(500);
    expect(parseQuantityInput(" 1.25 ")).toBe(1250);
    expect(parseQuantityInput("0")).toBeNull();
    expect(parseQuantityInput("")).toBeNull();
    expect(parseQuantityInput("abc")).toBeNull();
    expect(parseQuantityInput("-1")).toBeNull();
  });

  it("separa 'cantidad*código'", () => {
    const withQty = parseEntry("3*7501000000001");
    expect(withQty.code).toBe("7501000000001");
    expect(withQty.quantityMilli).toBe(3000);
    expect(withQty.hasQuantityPrefix).toBe(true);

    const named = parseEntry("2.5 * arroz blanco");
    expect(named.code).toBe("arroz blanco");
    expect(named.quantityMilli).toBe(2500);

    const plain = parseEntry("  7501000000001 ");
    expect(plain.code).toBe("7501000000001");
    expect(plain.quantityMilli).toBeNull();
    expect(plain.hasQuantityPrefix).toBe(false);

    const zero = parseEntry("0*7501000000001");
    expect(zero.hasQuantityPrefix).toBe(true);
    expect(zero.quantityMilli).toBeNull();
  });

  it("distingue códigos de barras de búsquedas por nombre", () => {
    expect(looksLikeBarcode("7501000000001")).toBe(true);
    expect(looksLikeBarcode("12345")).toBe(false);
    expect(looksLikeBarcode("coca")).toBe(false);
  });

  it("encuentra coincidencias exactas por código de barras o código interno", () => {
    const list = [product({ id: 1 }), product({ id: 2, internalCode: "ABR-002", barcode: null })];
    expect(findExact(list, "7501000000001")?.id).toBe(1);
    expect(findExact(list, "abr-002")?.id).toBe(2);
    expect(findExact(list, "ABR")).toBeUndefined();
  });
});

describe("presentación", () => {
  it("saluda según la hora", () => {
    expect(greetingFor(new Date(2026, 9, 31, 3))).toBe("¡Buenas noches!");
    expect(greetingFor(new Date(2026, 9, 31, 9))).toBe("¡Buenos días!");
    expect(greetingFor(new Date(2026, 9, 31, 15))).toBe("¡Buenas tardes!");
    expect(greetingFor(new Date(2026, 9, 31, 21))).toBe("¡Buenas noches!");
  });

  it("formatea importes y cantidades", () => {
    expect(money(123456)).toBe("$1,234.56");
    expect(amount(123456)).toBe("1,234.56");
    expect(formatQuantity(3000)).toBe("3");
    expect(formatQuantity(1500)).toBe("1.5");
    expect(formatQuantity(250)).toBe("0.25");
  });

  it("sugiere billetes que cubren el total", () => {
    expect(cashSuggestions(8700)).toEqual([10000, 20000, 50000]);
    expect(cashSuggestions(2000)).toEqual([2000, 5000, 10000]);
    expect(cashSuggestions(150000)).toEqual([150000, 200000]);
  });
});
