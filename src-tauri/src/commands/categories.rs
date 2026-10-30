use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tauri::State;

use crate::commands::auth::{require_role, AuthState};
use crate::infrastructure::database::Database;

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub active: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewCategory {
    pub name: String,
}

#[tauri::command]
pub async fn list_categories(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, include_inactive: bool) -> Result<Vec<Category>, String> {
    require_role(&auth, &session_token, &["admin", "cashier", "inventory"])?;
    sqlx::query_as::<_, Category>(
        "SELECT id, name, active, created_at FROM categories
         WHERE (? = 1 OR active = 1) ORDER BY active DESC, name COLLATE NOCASE"
    ).bind(include_inactive).fetch_all(&db.0).await.map_err(|error| {
        eprintln!("Error consultando categorías: {error}");
        "No fue posible consultar las categorías.".to_string()
    })
}

#[tauri::command]
pub async fn create_category(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, category: NewCategory) -> Result<Category, String> {
    require_role(&auth, &session_token, &["admin", "inventory"])?;
    let name = category.name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err("El nombre de categoría debe tener entre 1 y 80 caracteres.".into());
    }
    let inserted = sqlx::query("INSERT INTO categories (name) VALUES (?)")
        .bind(name).execute(&db.0).await.map_err(|error| {
            eprintln!("Error creando categoría: {error}");
            if error.to_string().contains("UNIQUE constraint failed") {
                "Ya existe una categoría con ese nombre.".to_string()
            } else { "No fue posible crear la categoría.".to_string() }
        })?;
    sqlx::query_as::<_, Category>("SELECT id, name, active, created_at FROM categories WHERE id = ?")
        .bind(inserted.last_insert_rowid()).fetch_one(&db.0).await
        .map_err(|_| "La categoría se guardó, pero no fue posible recuperarla.".to_string())
}

#[tauri::command]
pub async fn deactivate_category(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, category_id: i64) -> Result<(), String> {
    require_role(&auth, &session_token, &["admin", "inventory"])?;
    let result = sqlx::query("UPDATE categories SET active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND active = 1")
        .bind(category_id).execute(&db.0).await.map_err(|_| "No fue posible archivar la categoría.".to_string())?;
    if result.rows_affected() == 0 { return Err("La categoría no existe o ya está archivada.".into()); }
    Ok(())
}
