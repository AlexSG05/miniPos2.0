import { invokeAuthed } from "../../lib/invokeAuthed";
import { listProducts } from "../products/products.api";

export type SaleItemRequest = { productId: number; quantityMilli: number };
export type SaleReceipt = {
  folio: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: "cash" | "card";
  receivedCents: number;
  changeCents: number;
  createdAt: string;
};

export type SaleHistoryRow = { folio: string; createdAt: string; totalCents: number; paymentMethods: string; status: "completed" | "voided" };
export type RefundReceipt = { folio: string; amountCents: number; subtotalCents: number; method: "cash" | "card"; reason: string; createdAt: string };
export type SaleReceiptDetails = {
  receipt: SaleReceipt;
  items: { productName: string; internalCode: string; quantity: number; unitPriceCents: number; lineTotalCents: number }[];
  status: "completed" | "voided";
};
export type DailySalesReport = {
  date: string;
  grossCents: number;
  discountsCents: number;
  refundCents: number;
  refundedSubtotalCents: number;
  taxCents: number;
  totalCents: number;
  operations: number;
  cashCents: number;
  cardCents: number;
  bestSellers: { productName: string; quantitySold: number; salesCents: number }[];
  lowStock: { id: number; name: string; stockQuantity: number; minStock: number; unit: string }[];
};

export function searchSaleProducts(search: string) {
  return listProducts(search, { includeInactive: false });
}

export function completeSale(request: {
  operationId: string;
  items: SaleItemRequest[];
  paymentMethod: "cash" | "card";
  receivedCents: number;
}) {
  return invokeAuthed<SaleReceipt>("complete_sale", { request });
}

export function voidSale(request: { operationId: string; folio: string; reason: string }) {
  return invokeAuthed<RefundReceipt>("void_sale", { request });
}

export function listRecentSales() {
  return invokeAuthed<SaleHistoryRow[]>("list_recent_sales");
}

export function getSaleReceipt(folio: string) {
  return invokeAuthed<SaleReceiptDetails>("get_sale_receipt", { folio });
}

export function getDailySalesReport(startDate?: string, endDate?: string) {
  return invokeAuthed<DailySalesReport>("get_sales_report", {
    startDate: startDate || null,
    endDate: endDate || null,
  });
}
