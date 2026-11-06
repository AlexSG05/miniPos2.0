import { invokeAuthed } from "../../lib/invokeAuthed";
import { listProducts } from "../products/products.api";

export type SaleItemRequest = { productId: number; quantityMilli: number };
export type SaleReceipt = {
  folio: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: "cash" | "card" | "credit";
  receivedCents: number;
  changeCents: number;
  createdAt: string;
  cashierName: string;
  customerName: string | null;
  dueAt: string | null;
};

export type SaleHistoryRow = { folio: string; createdAt: string; totalCents: number; paymentMethods: string; status: "completed" | "voided"; cashierName: string };
export type RefundReceipt = { folio: string; amountCents: number; subtotalCents: number; method: "cash" | "card" | "credit"; reason: string; createdAt: string };
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
  negativeStock: { id: number; name: string; stockQuantity: number; unit: string }[];
};

export function searchSaleProducts(search: string) {
  return listProducts(search, { includeInactive: false });
}

export function completeSale(request: {
  operationId: string;
  items: SaleItemRequest[];
  discountCents: number;
  paymentMethod: "cash" | "card" | "credit";
  receivedCents: number;
  customerId?: number;
}) {
  return invokeAuthed<SaleReceipt>("complete_sale", { request });
}

export function voidSale(request: { operationId: string; folio: string; reason: string; supervisorUsername?: string; supervisorPassword?: string }) {
  return invokeAuthed<RefundReceipt>("void_sale", { request });
}

export function listRecentSales() {
  return invokeAuthed<SaleHistoryRow[]>("list_recent_sales");
}

export function listSalesByDay(date: string, search = "", exactAmountCents?: number) {
  return invokeAuthed<SaleHistoryRow[]>("list_sales_by_day", { date, search, exactAmountCents: exactAmountCents ?? null });
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
