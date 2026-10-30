CREATE TABLE IF NOT EXISTS health_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL CHECK (length(trim(message)) > 0 AND length(message) <= 160),
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_health_records_created_at
    ON health_records(created_at DESC);
