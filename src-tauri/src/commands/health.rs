use crate::{errors::AppError, infrastructure::database::Database};
use chrono::Utc;
use serde::Serialize;
use sqlx::FromRow;
use tauri::State;

#[derive(Debug, Serialize, FromRow)]
pub struct HealthRecord {
    id: i64,
    message: String,
    created_at: String,
}

#[tauri::command]
pub async fn get_health_records(database: State<'_, Database>) -> Result<Vec<HealthRecord>, AppError> {
    let records = sqlx::query_as::<_, HealthRecord>(
        "SELECT id, message, created_at FROM health_records ORDER BY id DESC LIMIT 20"
    )
    .fetch_all(&database.0)
    .await?;
    Ok(records)
}

#[tauri::command]
pub async fn save_health_record(
    message: String,
    database: State<'_, Database>
) -> Result<i64, AppError> {
    let message = message.trim();
    if message.is_empty() {
        return Err(AppError::Validation("El mensaje no puede estar vacío.".to_string()));
    }
    if message.chars().count() > 160 {
        return Err(AppError::Validation("El mensaje no puede superar 160 caracteres.".to_string()));
    }

    let created_at = Utc::now().naive_utc().format("%Y-%m-%d %H:%M:%S").to_string();
    let result = sqlx::query(
        "INSERT INTO health_records (message, created_at) VALUES (?, ?)"
    )
    .bind(message)
    .bind(created_at)
    .execute(&database.0)
    .await?;

    Ok(result.last_insert_rowid())
}
