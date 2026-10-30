CREATE TABLE business_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    business_name TEXT NOT NULL CHECK (length(trim(business_name)) BETWEEN 1 AND 120),
    tax_rate_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_basis_points BETWEEN 0 AND 10000),
    timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO business_settings (id, business_name, tax_rate_basis_points)
VALUES (1, 'MiniPOS', 0);
