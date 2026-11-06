ALTER TABLE products ADD COLUMN sat_key TEXT;
ALTER TABLE products ADD COLUMN profit_basis_points INTEGER NOT NULL DEFAULT 0
    CHECK (profit_basis_points BETWEEN 0 AND 100000);
ALTER TABLE products ADD COLUMN iva_basis_points INTEGER NOT NULL DEFAULT 0
    CHECK (iva_basis_points BETWEEN 0 AND 10000);
ALTER TABLE products ADD COLUMN ieps_basis_points INTEGER NOT NULL DEFAULT 0
    CHECK (ieps_basis_points BETWEEN 0 AND 10000);
ALTER TABLE products ADD COLUMN image_data TEXT;
