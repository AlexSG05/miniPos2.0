CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    internal_code TEXT NOT NULL COLLATE NOCASE UNIQUE,
    barcode TEXT COLLATE NOCASE UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    stock_quantity REAL NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    min_stock REAL NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
    unit TEXT NOT NULL CHECK (unit IN ('piece', 'kg', 'g', 'liter', 'ml')),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('initial_stock', 'purchase', 'manual_out', 'adjustment', 'sale', 'return')),
    quantity REAL NOT NULL CHECK (quantity > 0),
    previous_quantity REAL NOT NULL CHECK (previous_quantity >= 0),
    new_quantity REAL NOT NULL CHECK (new_quantity >= 0),
    reason TEXT NOT NULL,
    sale_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_date
    ON inventory_movements(product_id, created_at DESC);
