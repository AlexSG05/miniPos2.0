use serde::Serialize;
use sqlx::FromRow;
use tauri::State;

use crate::commands::auth::{require_role, AuthState};
use crate::infrastructure::database::Database;

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CashSession {
    pub id: i64,
    pub opened_at: String,
    pub opening_cents: i64,
    pub expected_cents: i64,
    pub cash_sales_cents: i64,
    pub cash_refunds_cents: i64,
    pub card_sales_cents: i64,
    pub cash_in_cents: i64,
    pub cash_out_cents: i64,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CashClosure {
    pub id: i64,
    pub opened_at: String,
    pub closed_at: String,
    pub opening_cents: i64,
    pub expected_cents: i64,
    pub counted_cents: i64,
    pub difference_cents: i64,
}

async fn expected_cents(db: &sqlx::SqlitePool, session_id: i64, opening: i64) -> Result<i64, String> {
    let cash_sales: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(p.amount_cents), 0) FROM sale_payments p
         JOIN sales s ON s.id = p.sale_id WHERE s.session_id = ? AND p.method = 'cash'"
    )
    .bind(session_id)
    .fetch_one(db)
    .await
    .map_err(|_| "No fue posible calcular el efectivo esperado.".to_string())?;
    let refunds: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM sale_refunds WHERE session_id = ? AND method = 'cash'")
        .bind(session_id).fetch_one(db).await.map_err(|_| "No fue posible calcular reembolsos en efectivo.".to_string())?;
    let cash_in: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM cash_movements WHERE session_id = ? AND direction = 'in'")
        .bind(session_id).fetch_one(db).await.map_err(|_| "No fue posible calcular las entradas de caja.".to_string())?;
    let cash_out: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM cash_movements WHERE session_id = ? AND direction = 'out'")
        .bind(session_id).fetch_one(db).await.map_err(|_| "No fue posible calcular las salidas de caja.".to_string())?;
    opening.checked_add(cash_sales).and_then(|value| value.checked_add(cash_in)).and_then(|value| value.checked_sub(cash_out)).and_then(|value| value.checked_sub(refunds))
        .filter(|value| *value >= 0)
        .ok_or_else(|| "El efectivo calculado está fuera del rango válido.".to_string())
}

#[tauri::command]
pub async fn get_open_cash_session(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String) -> Result<Option<CashSession>, String> {
    require_role(&auth, &session_token, &["admin", "cashier"])?;
    let row = sqlx::query_as::<_, (i64, String, i64)>(
        "SELECT id, opened_at, opening_cents FROM cash_sessions WHERE closed_at IS NULL"
    ).fetch_optional(&db.0).await.map_err(|_| "No fue posible consultar el estado de caja.".to_string())?;
    match row {
        Some((id, opened_at, opening_cents)) => {
            let cash_sales_cents: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(p.amount_cents), 0) FROM sale_payments p JOIN sales s ON s.id = p.sale_id WHERE s.session_id = ? AND p.method = 'cash'").bind(id).fetch_one(&db.0).await.map_err(|_| "No fue posible calcular ventas en efectivo.".to_string())?;
            let cash_refunds_cents: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM sale_refunds WHERE session_id = ? AND method = 'cash'").bind(id).fetch_one(&db.0).await.map_err(|_| "No fue posible calcular reembolsos en efectivo.".to_string())?;
            let card_sales_cents: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(p.amount_cents), 0) FROM sale_payments p JOIN sales s ON s.id = p.sale_id WHERE s.session_id = ? AND p.method = 'card'").bind(id).fetch_one(&db.0).await.map_err(|_| "No fue posible calcular ventas con tarjeta.".to_string())?;
            let cash_in_cents: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM cash_movements WHERE session_id = ? AND direction = 'in'").bind(id).fetch_one(&db.0).await.map_err(|_| "No fue posible calcular entradas de efectivo.".to_string())?;
            let cash_out_cents: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM cash_movements WHERE session_id = ? AND direction = 'out'").bind(id).fetch_one(&db.0).await.map_err(|_| "No fue posible calcular salidas de efectivo.".to_string())?;
            Ok(Some(CashSession { id, opened_at, opening_cents, expected_cents: expected_cents(&db.0, id, opening_cents).await?, cash_sales_cents, cash_refunds_cents, card_sales_cents, cash_in_cents, cash_out_cents }))
        },
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn open_cash_session(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, opening_cents: i64) -> Result<CashSession, String> {
    require_role(&auth, &session_token, &["admin", "cashier"])?;
    if opening_cents < 0 { return Err("El fondo inicial no puede ser negativo.".into()); }
    let result = sqlx::query("INSERT INTO cash_sessions (opening_cents) VALUES (?)")
        .bind(opening_cents).execute(&db.0).await.map_err(|error| {
            eprintln!("Error abriendo caja: {error}");
            if error.to_string().contains("UNIQUE constraint failed") { "Ya existe un turno de caja abierto.".to_string() }
            else { "No fue posible abrir la caja.".to_string() }
        })?;
    let id = result.last_insert_rowid();
    let (opened_at,): (String,) = sqlx::query_as("SELECT opened_at FROM cash_sessions WHERE id = ?")
        .bind(id).fetch_one(&db.0).await.map_err(|_| "No fue posible recuperar la apertura.".to_string())?;
    Ok(CashSession { id, opened_at, opening_cents, expected_cents: opening_cents, cash_sales_cents: 0, cash_refunds_cents: 0, card_sales_cents: 0, cash_in_cents: 0, cash_out_cents: 0 })
}

#[tauri::command]
pub async fn list_cash_closures(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String) -> Result<Vec<CashClosure>, String> {
    require_role(&auth, &session_token, &["admin", "cashier"])?;
    sqlx::query_as::<_, CashClosure>(
        "SELECT id, opened_at, closed_at, opening_cents, expected_cents, counted_cents, difference_cents
         FROM cash_sessions WHERE closed_at IS NOT NULL ORDER BY id DESC LIMIT 50"
    ).fetch_all(&db.0).await.map_err(|error| {
        eprintln!("Error consultando cierres de caja: {error}");
        "No fue posible consultar cierres anteriores.".to_string()
    })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashMovementRequest {
    pub direction: String,
    pub amount_cents: i64,
    pub reason: String,
}

#[tauri::command]
pub async fn record_cash_movement(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, movement: CashMovementRequest) -> Result<(), String> {
    require_role(&auth, &session_token, &["admin", "cashier"])?;
    if !matches!(movement.direction.as_str(), "in" | "out") {
        return Err("El tipo de movimiento de caja no es válido.".into());
    }
    if movement.amount_cents <= 0 {
        return Err("El importe debe ser mayor que cero.".into());
    }
    let reason = movement.reason.trim();
    if reason.is_empty() || reason.chars().count() > 240 {
        return Err("Describe el motivo del movimiento (máximo 240 caracteres).".into());
    }
    let mut tx = db.0.begin().await.map_err(|_| "No fue posible iniciar el movimiento de caja.".to_string())?;
    let session = sqlx::query_as::<_, (i64, i64)>("SELECT id, opening_cents FROM cash_sessions WHERE closed_at IS NULL")
        .fetch_optional(&mut *tx).await.map_err(|_| "No fue posible consultar la caja.".to_string())?
        .ok_or_else(|| "Abre la caja antes de registrar movimientos.".to_string())?;
    if movement.direction == "out" {
        let sales: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(p.amount_cents), 0) FROM sale_payments p JOIN sales s ON s.id = p.sale_id WHERE s.session_id = ? AND p.method = 'cash'")
            .bind(session.0).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular el efectivo disponible.".to_string())?;
        let (cash_in, cash_out): (i64, i64) = sqlx::query_as("SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cents ELSE 0 END), 0), COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cents ELSE 0 END), 0) FROM cash_movements WHERE session_id = ?")
            .bind(session.0).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular movimientos previos.".to_string())?;
        let refunds: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM sale_refunds WHERE session_id = ? AND method = 'cash'")
            .bind(session.0).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular reembolsos en efectivo.".to_string())?;
        let available = session.1.checked_add(sales).and_then(|v| v.checked_add(cash_in)).and_then(|v| v.checked_sub(cash_out)).and_then(|v| v.checked_sub(refunds))
            .ok_or_else(|| "El efectivo disponible no es válido.".to_string())?;
        if movement.amount_cents > available { return Err("La salida supera el efectivo disponible en caja.".into()); }
    }
    sqlx::query("INSERT INTO cash_movements (session_id, direction, amount_cents, reason) VALUES (?, ?, ?, ?)")
        .bind(session.0).bind(movement.direction).bind(movement.amount_cents).bind(reason)
        .execute(&mut *tx).await.map_err(|_| "No fue posible guardar el movimiento de caja.".to_string())?;
    tx.commit().await.map_err(|_| "No fue posible confirmar el movimiento de caja.".to_string())
}

#[tauri::command]
pub async fn close_cash_session(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, counted_cents: i64) -> Result<i64, String> {
    require_role(&auth, &session_token, &["admin", "cashier"])?;
    if counted_cents < 0 { return Err("El efectivo contado no puede ser negativo.".into()); }
    let mut tx = db.0.begin().await.map_err(|_| "No fue posible iniciar el cierre de caja.".to_string())?;
    let session = sqlx::query_as::<_, (i64, i64)>("SELECT id, opening_cents FROM cash_sessions WHERE closed_at IS NULL")
        .fetch_optional(&mut *tx).await.map_err(|_| "No fue posible consultar la caja abierta.".to_string())?
        .ok_or_else(|| "No hay una caja abierta para cerrar.".to_string())?;
    let session_id = session.0;
    let cash_sales: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(p.amount_cents), 0) FROM sale_payments p JOIN sales s ON s.id = p.sale_id WHERE s.session_id = ? AND p.method = 'cash'")
        .bind(session_id).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular ventas en efectivo.".to_string())?;
    let cash_in: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM cash_movements WHERE session_id = ? AND direction = 'in'")
        .bind(session_id).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular entradas de efectivo.".to_string())?;
    let cash_out: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM cash_movements WHERE session_id = ? AND direction = 'out'")
        .bind(session_id).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular salidas de efectivo.".to_string())?;
    let refunds: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM sale_refunds WHERE session_id = ? AND method = 'cash'")
        .bind(session_id).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular reembolsos de efectivo.".to_string())?;
    let expected = session.1.checked_add(cash_sales).and_then(|v| v.checked_add(cash_in)).and_then(|v| v.checked_sub(cash_out)).and_then(|v| v.checked_sub(refunds))
        .filter(|v| *v >= 0).ok_or_else(|| "El efectivo esperado no es válido.".to_string())?;
    let difference = counted_cents.checked_sub(expected).ok_or_else(|| "La diferencia está fuera del rango válido.".to_string())?;
    sqlx::query("UPDATE cash_sessions SET closed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), expected_cents = ?, counted_cents = ?, difference_cents = ? WHERE id = ? AND closed_at IS NULL")
        .bind(expected).bind(counted_cents).bind(difference).bind(session_id).execute(&mut *tx).await
        .map_err(|_| "No fue posible guardar el cierre de caja.".to_string())?;
    tx.commit().await.map_err(|_| "No fue posible confirmar el cierre de caja.".to_string())?;
    Ok(difference)
}
