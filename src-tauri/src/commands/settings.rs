use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tauri::State;

use crate::commands::auth::{require_role, AuthState};
use crate::infrastructure::database::Database;

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BusinessSettings {
    pub business_name: String,
    pub tax_rate_basis_points: i64,
    pub timezone: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBusinessSettings {
    pub business_name: String,
    pub tax_rate_basis_points: i64,
}

async fn load_business_settings(db: &sqlx::SqlitePool) -> Result<BusinessSettings, String> {
    sqlx::query_as::<_, BusinessSettings>(
        "SELECT business_name, tax_rate_basis_points, timezone, updated_at FROM business_settings WHERE id = 1"
    ).fetch_one(db).await.map_err(|_| "No fue posible consultar la configuración del negocio.".to_string())
}

#[tauri::command]
pub async fn get_business_settings(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String) -> Result<BusinessSettings, String> {
    require_role(&auth, &session_token, &["admin", "cashier", "inventory"])?;
    sqlx::query_as::<_, BusinessSettings>(
        "SELECT business_name, tax_rate_basis_points, timezone, updated_at FROM business_settings WHERE id = 1"
    ).fetch_one(&db.0).await.map_err(|error| {
        eprintln!("Error consultando configuración: {error}");
        "No fue posible consultar la configuración del negocio.".to_string()
    })
}

#[tauri::command]
pub async fn save_business_settings(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, settings: UpdateBusinessSettings) -> Result<BusinessSettings, String> {
    require_role(&auth, &session_token, &["admin"])?;
    let name = settings.business_name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err("El nombre del negocio debe tener entre 1 y 120 caracteres.".into());
    }
    if !(0..=10000).contains(&settings.tax_rate_basis_points) {
        return Err("La tasa fiscal debe estar entre 0% y 100%.".into());
    }
    sqlx::query("UPDATE business_settings SET business_name = ?, tax_rate_basis_points = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1")
        .bind(name).bind(settings.tax_rate_basis_points).execute(&db.0).await
        .map_err(|error| {
            eprintln!("Error guardando configuración: {error}");
            "No fue posible guardar la configuración del negocio.".to_string()
        })?;
    load_business_settings(&db.0).await
}
