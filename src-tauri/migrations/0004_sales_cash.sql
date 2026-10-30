CREATE TABLE cash_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    opening_cents INTEGER NOT NULL CHECK (opening_cents >= 0),
    closed_at TEXT,
    expected_cents INTEGER CHECK (expected_cents >= 0),
    counted_cents INTEGER CHECK (counted_cents >= 0),
    difference_cents INTEGER
);
CREATE UNIQUE INDEX idx_cash_one_open_session ON cash_sessions((1)) WHERE closed_at IS NULL;

CREATE TABLE cash_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id TEXT NOT NULL UNIQUE,
    folio TEXT NOT NULL UNIQUE,
    session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
    tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    status TEXT NOT NULL CHECK (status IN ('completed', 'voided')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    internal_code TEXT NOT NULL,
    quantity REAL NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
    line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0)
);

CREATE TABLE sale_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    method TEXT NOT NULL CHECK (method IN ('cash', 'card')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    received_cents INTEGER NOT NULL CHECK (received_cents >= amount_cents),
    change_cents INTEGER NOT NULL CHECK (change_cents >= 0)
);
CREATE INDEX idx_sales_session_date ON sales(session_id, created_at DESC);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);
