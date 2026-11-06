CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
    phone TEXT,
    tax_id TEXT,
    address TEXT,
    credit_limit_cents INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit_cents >= 0),
    credit_days INTEGER NOT NULL DEFAULT 30 CHECK (credit_days BETWEEN 0 AND 365),
    balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'blocked')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_customers_name ON customers(name COLLATE NOCASE);

CREATE TABLE credit_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL UNIQUE REFERENCES sales(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    original_amount_cents INTEGER NOT NULL CHECK (original_amount_cents > 0),
    balance_due_cents INTEGER NOT NULL CHECK (balance_due_cents >= 0),
    credit_days INTEGER NOT NULL CHECK (credit_days BETWEEN 0 AND 365),
    issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    due_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'voided'))
);

CREATE INDEX idx_credit_sales_customer_status_due
    ON credit_sales(customer_id, status, due_at);

CREATE TABLE customer_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    method TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
    reference TEXT,
    session_id INTEGER REFERENCES cash_sessions(id),
    user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_customer_payments_customer_date
    ON customer_payments(customer_id, created_at DESC);

CREATE TABLE customer_payment_allocations (
    payment_id INTEGER NOT NULL REFERENCES customer_payments(id),
    credit_sale_id INTEGER NOT NULL REFERENCES credit_sales(id),
    allocated_cents INTEGER NOT NULL CHECK (allocated_cents > 0),
    PRIMARY KEY (payment_id, credit_sale_id)
);

CREATE INDEX idx_payment_allocations_credit_sale
    ON customer_payment_allocations(credit_sale_id);

ALTER TABLE cash_movements
    ADD COLUMN customer_payment_id INTEGER REFERENCES customer_payments(id);

CREATE UNIQUE INDEX idx_cash_movement_customer_payment
    ON cash_movements(customer_payment_id) WHERE customer_payment_id IS NOT NULL;
