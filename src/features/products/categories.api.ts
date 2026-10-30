import { invokeAuthed } from "../../lib/invokeAuthed";

export type Category = { id: number; name: string; active: boolean; createdAt: string };

export function listCategories(includeInactive = false) {
  return invokeAuthed<Category[]>("list_categories", { includeInactive });
}

export function createCategory(name: string) {
  return invokeAuthed<Category>("create_category", { category: { name } });
}

export function deactivateCategory(categoryId: number) {
  return invokeAuthed<void>("deactivate_category", { categoryId });
}
