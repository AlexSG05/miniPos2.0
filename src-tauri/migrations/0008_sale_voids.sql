CREATE TABLE sale_refunds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id TEXT NOT NULL UNIQUE,
    sale_id INTEGER NOT NULL UNIQUE REFERENCES sales(id),
    session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    tax_cents INTEGER NOT NULL CHECK (tax_cents >= 0),
    method TEXT NOT NULL CHECK (method IN ('cash', 'card')),
    reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 240),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_sale_refunds_session ON sale_refunds(session_id, created_at DESC);
