use sqlx::SqlitePool;

pub struct Database(pub SqlitePool);
