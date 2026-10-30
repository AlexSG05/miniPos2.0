CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 80),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TRIGGER validate_product_category_insert
BEFORE INSERT ON products
WHEN NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories WHERE id = NEW.category_id AND active = 1)
BEGIN
    SELECT RAISE(ABORT, 'invalid product category');
END;

CREATE TRIGGER validate_product_category_update
BEFORE UPDATE OF category_id ON products
WHEN NEW.category_id IS NOT OLD.category_id AND NEW.category_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM categories WHERE id = NEW.category_id AND active = 1)
BEGIN
    SELECT RAISE(ABORT, 'invalid product category');
END;
