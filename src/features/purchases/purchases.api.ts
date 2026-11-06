import { invokeAuthed } from "../../lib/invokeAuthed";

export type Supplier = { id: number; name: string; taxId: string | null; phone: string | null; email: string | null; address: string | null; active: boolean };
export type PurchaseLine = { productId: number; quantity: number; unitCostCents: number };
export type PurchaseReceipt = { id: number; subtotalCents: number; itemCount: number };

export function listSuppliers() { return invokeAuthed<Supplier[]>("list_suppliers"); }
export function createSupplier(supplier: { name: string; taxId: string; phone: string; email: string; address: string }) {
  return invokeAuthed<Supplier>("create_supplier", { supplier });
}
export function receivePurchase(purchase: {
  operationId: string; supplierId: number; documentType: "invoice" | "note" | "other";
  documentNumber: string; notes: string; items: PurchaseLine[];
}) { return invokeAuthed<PurchaseReceipt>("receive_purchase", { purchase }); }
