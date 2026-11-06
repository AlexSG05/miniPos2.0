ALTER TABLE sales ADD COLUMN user_id INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_sales_user_created
    ON sales(user_id, created_at DESC);
