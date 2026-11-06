CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
    tax_id TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_suppliers_name ON suppliers(name COLLATE NOCASE);

CREATE TABLE purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id TEXT NOT NULL UNIQUE,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    document_number TEXT,
    document_type TEXT NOT NULL CHECK (document_type IN ('invoice', 'note', 'other')),
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'voided')),
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    notes TEXT,
    received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_purchases_supplier_received ON purchases(supplier_id, received_at DESC);

CREATE TABLE purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity REAL NOT NULL CHECK (quantity > 0),
    unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
    line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
    UNIQUE (purchase_id, product_id)
);

CREATE INDEX idx_purchase_items_product ON purchase_items(product_id);

ALTER TABLE inventory_movements
    ADD COLUMN purchase_id INTEGER REFERENCES purchases(id);

CREATE INDEX idx_inventory_movements_purchase ON inventory_movements(purchase_id);
