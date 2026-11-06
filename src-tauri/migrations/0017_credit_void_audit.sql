CREATE TABLE credit_sale_voids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id TEXT NOT NULL UNIQUE,
    credit_sale_id INTEGER NOT NULL UNIQUE REFERENCES credit_sales(id),
    user_id INTEGER REFERENCES users(id),
    reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 240),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
