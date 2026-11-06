ALTER TABLE cash_movements ADD COLUMN created_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE cash_movements ADD COLUMN recipient_user_id INTEGER REFERENCES users(id);

CREATE TABLE cash_movement_denominations (
    movement_id INTEGER NOT NULL REFERENCES cash_movements(id) ON DELETE CASCADE,
    denomination_cents INTEGER NOT NULL CHECK (denomination_cents > 0),
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    PRIMARY KEY (movement_id, denomination_cents)
);
