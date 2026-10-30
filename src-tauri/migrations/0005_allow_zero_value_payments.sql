CREATE TABLE sale_payments_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    method TEXT NOT NULL CHECK (method IN ('cash', 'card')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    received_cents INTEGER NOT NULL CHECK (received_cents >= amount_cents),
    change_cents INTEGER NOT NULL CHECK (change_cents >= 0)
);

INSERT INTO sale_payments_new (id, sale_id, method, amount_cents, received_cents, change_cents)
SELECT id, sale_id, method, amount_cents, received_cents, change_cents
FROM sale_payments;

DROP TABLE sale_payments;
ALTER TABLE sale_payments_new RENAME TO sale_payments;
