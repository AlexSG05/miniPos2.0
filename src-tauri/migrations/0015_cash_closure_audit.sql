ALTER TABLE cash_sessions ADD COLUMN opened_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE cash_sessions ADD COLUMN closed_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE cash_sessions ADD COLUMN cash_sales_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN cash_refunds_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN cash_in_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN cash_out_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN card_sales_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN difference_reason TEXT;

CREATE TABLE cash_closure_denominations (
    session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
    denomination_cents INTEGER NOT NULL CHECK (denomination_cents > 0),
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    PRIMARY KEY (session_id, denomination_cents)
);

CREATE INDEX idx_cash_sessions_closed_at ON cash_sessions(closed_at DESC);
