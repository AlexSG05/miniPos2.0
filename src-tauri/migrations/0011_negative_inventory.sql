ALTER TABLE products ADD COLUMN stock_debt REAL NOT NULL DEFAULT 0
    CHECK (stock_debt >= 0);

ALTER TABLE inventory_movements ADD COLUMN net_previous_quantity REAL;
ALTER TABLE inventory_movements ADD COLUMN net_new_quantity REAL;

UPDATE inventory_movements
SET net_previous_quantity = previous_quantity,
    net_new_quantity = new_quantity;
