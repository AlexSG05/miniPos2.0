
import { invokeAuthed } from "../../lib/invokeAuthed";

export type Product = {
  id: number;
  categoryId: number | null;
  categoryName: string | null;
  internalCode: string;
  barcode: string | null;
  name: string;
  description: string | null;
  costCents: number;
  priceCents: number;
  stockQuantity: number;
  minStock: number;
  unit: "piece" | "kg" | "g" | "liter" | "ml";
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NewProduct = {
  categoryId: number | null;
  internalCode: string;
  barcode: string | null;
  name: string;
  description: string | null;
  costCents: number;
  priceCents: number;
  stockQuantity: number;
  minStock: number;
  unit: Product["unit"];
};

export type ProductUpdate = Omit<NewProduct, "stockQuantity"> & { id: number };

export type InventoryMovement = {
  id: number;
  productId: number;
  productName: string;
  movementType: string;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  createdAt: string;
};

export function listProducts(search?: string, filters?: { categoryId?: number | null; includeInactive?: boolean }) {
  return invokeAuthed<Product[]>("list_products", {
    search: search?.trim() || null,
    categoryId: filters?.categoryId ?? null,
    includeInactive: filters?.includeInactive ?? false,
  });
}

export function createProduct(product: NewProduct) {
  return invokeAuthed<Product>("create_product", { product });
}

export function updateProduct(product: ProductUpdate) {
  return invokeAuthed<Product>("update_product", { product });
}

export function setProductActive(productId: number, active: boolean) {
  return invokeAuthed<void>("set_product_active", { productId, active });
}

export function listInventoryMovements(productId?: number) {
  return invokeAuthed<InventoryMovement[]>("list_inventory_movements", {
    productId: productId ?? null,
  });
}

export function adjustInventory(adjustment: {
  productId: number;
  quantity: number;
  reason: string;
  direction: "in" | "out";
}) {
  return invokeAuthed<Product>("adjust_inventory", { adjustment });
}
