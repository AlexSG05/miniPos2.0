use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tauri::State;

use crate::commands::auth::{require_role, AuthState, UserInfo};
use crate::infrastructure::database::Database;

const CASH_DENOMINATIONS: &[i64] = &[
    100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100, 50, 20, 10, 5,
];

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CashSession {
    pub id: i64,
    pub opened_at: String,
    pub opened_by_name: String,
    pub opening_cents: i64,
    pub expected_cents: i64,
    pub cash_sales_cents: i64,
    pub cash_refunds_cents: i64,
    pub card_sales_cents: i64,
    pub cash_in_cents: i64,
    pub cash_out_cents: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CashDenomination {
    pub denomination_cents: i64,
    pub quantity: i64,
    pub subtotal_cents: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashClosure {
    pub id: i64,
    pub opened_at: String,
    pub closed_at: String,
    pub opened_by_name: String,
    pub closed_by_name: String,
    pub opening_cents: i64,
    pub cash_sales_cents: i64,
    pub cash_refunds_cents: i64,
    pub card_sales_cents: i64,
    pub cash_in_cents: i64,
    pub cash_out_cents: i64,
    pub expected_cents: i64,
    pub counted_cents: i64,
    pub difference_cents: i64,
    pub difference_reason: Option<String>,
    pub denominations: Vec<CashDenomination>,
    pub withdrawals: Vec<CashWithdrawalAudit>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CashWithdrawalAudit {
    pub movement_id: i64,
    pub amount_cents: i64,
    pub reason: String,
    pub created_at: String,
    pub created_by_name: String,
    pub recipient_name: String,
    pub denominations: Vec<CashDenomination>,
}

#[derive(Debug, FromRow)]
struct CashWithdrawalRow {
    movement_id: i64,
    amount_cents: i64,
    reason: String,
    created_at: String,
    created_by_name: String,
    recipient_name: String,
}

#[derive(Debug, FromRow)]
struct CashClosureRow {
    id: i64,
    opened_at: String,
    closed_at: String,
    opened_by_name: String,
    closed_by_name: String,
    opening_cents: i64,
    cash_sales_cents: i64,
    cash_refunds_cents: i64,
    card_sales_cents: i64,
    cash_in_cents: i64,
    cash_out_cents: i64,
    expected_cents: i64,
    counted_cents: i64,
    difference_cents: i64,
    difference_reason: Option<String>,
}

async fn expected_cents(
    db: &sqlx::SqlitePool,
    session_id: i64,
    opening: i64,
) -> Result<i64, String> {
    let cash_sales: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(p.amount_cents), 0) FROM sale_payments p
         JOIN sales s ON s.id = p.sale_id WHERE s.session_id = ? AND p.method = 'cash'",
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
    opening
        .checked_add(cash_sales)
        .and_then(|v| v.checked_add(cash_in))
        .and_then(|v| v.checked_sub(cash_out))
        .and_then(|v| v.checked_sub(refunds))
        .filter(|v| *v >= 0)
        .ok_or_else(|| "El efectivo calculado está fuera del rango válido.".to_string())
}

async fn closure_by_id(db: &sqlx::SqlitePool, session_id: i64) -> Result<CashClosure, String> {
    let row = sqlx::query_as::<_, CashClosureRow>(
        "SELECT c.id, c.opened_at, c.closed_at,
                COALESCE(opener.display_name, 'Usuario anterior') AS opened_by_name,
                COALESCE(closer.display_name, 'Usuario anterior') AS closed_by_name,
                c.opening_cents, c.cash_sales_cents, c.cash_refunds_cents,
                c.card_sales_cents, c.cash_in_cents, c.cash_out_cents,
                c.expected_cents, c.counted_cents, c.difference_cents,
                c.difference_reason
         FROM cash_sessions c
         LEFT JOIN users opener ON opener.id = c.opened_by_user_id
         LEFT JOIN users closer ON closer.id = c.closed_by_user_id
         WHERE c.id = ? AND c.closed_at IS NOT NULL",
    )
    .bind(session_id)
    .fetch_optional(db)
    .await
    .map_err(|_| "No fue posible consultar el cierre de caja.".to_string())?
    .ok_or_else(|| "No se encontró el cierre solicitado.".to_string())?;
    let denominations = sqlx::query_as::<_, CashDenomination>(
        "SELECT denomination_cents, quantity, subtotal_cents
         FROM cash_closure_denominations WHERE session_id = ?
         ORDER BY denomination_cents DESC",
    )
    .bind(session_id)
    .fetch_all(db)
    .await
    .map_err(|_| "No fue posible consultar el arqueo por denominación.".to_string())?;
    let withdrawal_rows = sqlx::query_as::<_, CashWithdrawalRow>(
        "SELECT m.id AS movement_id, m.amount_cents, m.reason, m.created_at,
                COALESCE(actor.display_name, 'Usuario anterior') AS created_by_name,
                COALESCE(recipient.display_name, 'Encargado anterior') AS recipient_name
         FROM cash_movements m
         LEFT JOIN users actor ON actor.id = m.created_by_user_id
         LEFT JOIN users recipient ON recipient.id = m.recipient_user_id
         WHERE m.session_id = ? AND m.direction = 'out' AND m.recipient_user_id IS NOT NULL
         ORDER BY m.created_at, m.id",
    ).bind(session_id).fetch_all(db).await
        .map_err(|_| "No fue posible consultar los retiros auditados.".to_string())?;
    let mut withdrawals = Vec::with_capacity(withdrawal_rows.len());
    for item in withdrawal_rows {
        let movement_denominations = sqlx::query_as::<_, CashDenomination>(
            "SELECT denomination_cents, quantity, subtotal_cents FROM cash_movement_denominations WHERE movement_id = ? ORDER BY denomination_cents DESC",
        ).bind(item.movement_id).fetch_all(db).await
            .map_err(|_| "No fue posible consultar el detalle de un retiro.".to_string())?;
        withdrawals.push(CashWithdrawalAudit {
            movement_id: item.movement_id, amount_cents: item.amount_cents, reason: item.reason,
            created_at: item.created_at, created_by_name: item.created_by_name,
            recipient_name: item.recipient_name, denominations: movement_denominations,
        });
    }
    Ok(CashClosure {
        id: row.id,
        opened_at: row.opened_at,
        closed_at: row.closed_at,
        opened_by_name: row.opened_by_name,
        closed_by_name: row.closed_by_name,
        opening_cents: row.opening_cents,
        cash_sales_cents: row.cash_sales_cents,
        cash_refunds_cents: row.cash_refunds_cents,
        card_sales_cents: row.card_sales_cents,
        cash_in_cents: row.cash_in_cents,
        cash_out_cents: row.cash_out_cents,
        expected_cents: row.expected_cents,
        counted_cents: row.counted_cents,
        difference_cents: row.difference_cents,
        difference_reason: row.difference_reason,
        denominations,
        withdrawals,
    })
}

#[tauri::command]
pub async fn get_open_cash_session(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
) -> Result<Option<CashSession>, String> {
    require_role(&auth, &session_token, &["admin", "cashier"])?;
    let row = sqlx::query_as::<_, (i64, String, i64, String)>(
        "SELECT c.id, c.opened_at, c.opening_cents,
                COALESCE(u.display_name, 'Usuario anterior')
         FROM cash_sessions c LEFT JOIN users u ON u.id = c.opened_by_user_id
         WHERE c.closed_at IS NULL",
    )
    .fetch_optional(&db.0)
    .await
    .map_err(|_| "No fue posible consultar el estado de caja.".to_string())?;
    let Some((id, opened_at, opening_cents, opened_by_name)) = row else {
        return Ok(None);
    };
    let cash_sales_cents: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(p.amount_cents), 0) FROM sale_payments p JOIN sales s ON s.id = p.sale_id WHERE s.session_id = ? AND p.method = 'cash'").bind(id).fetch_one(&db.0).await.map_err(|_| "No fue posible calcular ventas en efectivo.".to_string())?;
    let cash_refunds_cents: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM sale_refunds WHERE session_id = ? AND method = 'cash'").bind(id).fetch_one(&db.0).await.map_err(|_| "No fue posible calcular reembolsos en efectivo.".to_string())?;
    let card_sales_cents: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(p.amount_cents), 0) FROM sale_payments p JOIN sales s ON s.id = p.sale_id WHERE s.session_id = ? AND p.method = 'card'").bind(id).fetch_one(&db.0).await.map_err(|_| "No fue posible calcular ventas con tarjeta.".to_string())?;
    let cash_in_cents: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM cash_movements WHERE session_id = ? AND direction = 'in'").bind(id).fetch_one(&db.0).await.map_err(|_| "No fue posible calcular entradas de efectivo.".to_string())?;
    let cash_out_cents: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM cash_movements WHERE session_id = ? AND direction = 'out'").bind(id).fetch_one(&db.0).await.map_err(|_| "No fue posible calcular salidas de efectivo.".to_string())?;
    Ok(Some(CashSession {
        id,
        opened_at,
        opened_by_name,
        opening_cents,
        expected_cents: expected_cents(&db.0, id, opening_cents).await?,
        cash_sales_cents,
        cash_refunds_cents,
        card_sales_cents,
        cash_in_cents,
        cash_out_cents,
    }))
}

#[tauri::command]
pub async fn open_cash_session(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
    opening_cents: i64,
) -> Result<CashSession, String> {
    let user = require_role(&auth, &session_token, &["admin", "cashier"])?;
    if opening_cents < 0 {
        return Err("El fondo inicial no puede ser negativo.".into());
    }
    let result = sqlx::query("INSERT INTO cash_sessions (opening_cents, opened_by_user_id) VALUES (?, ?)")
        .bind(opening_cents)
        .bind(user.id)
        .execute(&db.0)
        .await
        .map_err(|error| {
            eprintln!("Error abriendo caja: {error}");
            if error.to_string().contains("UNIQUE constraint failed") {
                "Ya existe un turno de caja abierto.".to_string()
            } else {
                "No fue posible abrir la caja.".to_string()
            }
        })?;
    let id = result.last_insert_rowid();
    let (opened_at,): (String,) = sqlx::query_as("SELECT opened_at FROM cash_sessions WHERE id = ?")
        .bind(id)
        .fetch_one(&db.0)
        .await
        .map_err(|_| "No fue posible recuperar la apertura.".to_string())?;
    Ok(CashSession {
        id,
        opened_at,
        opened_by_name: user.display_name,
        opening_cents,
        expected_cents: opening_cents,
        cash_sales_cents: 0,
        cash_refunds_cents: 0,
        card_sales_cents: 0,
        cash_in_cents: 0,
        cash_out_cents: 0,
    })
}

#[tauri::command]
pub async fn list_cash_closures(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
) -> Result<Vec<CashClosure>, String> {
    require_role(&auth, &session_token, &["admin", "cashier"])?;
    let ids = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM cash_sessions WHERE closed_at IS NOT NULL ORDER BY id DESC LIMIT 50",
    )
    .fetch_all(&db.0)
    .await
    .map_err(|_| "No fue posible consultar cierres anteriores.".to_string())?;
    let mut closures = Vec::with_capacity(ids.len());
    for id in ids {
        closures.push(closure_by_id(&db.0, id).await?);
    }
    Ok(closures)
}

#[tauri::command]
pub async fn get_cash_closure(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
    session_id: i64,
) -> Result<CashClosure, String> {
    require_role(&auth, &session_token, &["admin", "cashier"])?;
    if session_id <= 0 {
        return Err("El turno indicado no es válido.".into());
    }
    closure_by_id(&db.0, session_id).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashMovementRequest {
    pub direction: String,
    pub amount_cents: i64,
    pub reason: String,
}

#[tauri::command]
pub async fn record_cash_movement(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
    movement: CashMovementRequest,
) -> Result<(), String> {
    require_role(&auth, &session_token, &["admin", "cashier"])?;
    if !matches!(movement.direction.as_str(), "in" | "out") {
        return Err("El tipo de movimiento de caja no es válido.".into());
    }
    if movement.direction == "out" {
        return Err("Para retirar efectivo, registra el retiro con conteo por denominación.".into());
    }
    if movement.amount_cents <= 0 {
        return Err("El importe debe ser mayor que cero.".into());
    }
    let reason = movement.reason.trim();
    if reason.is_empty() || reason.chars().count() > 240 {
        return Err("Describe el motivo del movimiento (máximo 240 caracteres).".into());
    }
    let mut tx = db
        .0
        .begin()
        .await
        .map_err(|_| "No fue posible iniciar el movimiento de caja.".to_string())?;
    let session = sqlx::query_as::<_, (i64, i64)>(
        "SELECT id, opening_cents FROM cash_sessions WHERE closed_at IS NULL",
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_| "No fue posible consultar la caja.".to_string())?
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
        if movement.amount_cents > available {
            return Err("La salida supera el efectivo disponible en caja.".into());
        }
    }
    sqlx::query("INSERT INTO cash_movements (session_id, direction, amount_cents, reason) VALUES (?, ?, ?, ?)")
        .bind(session.0).bind(movement.direction).bind(movement.amount_cents).bind(reason)
        .execute(&mut *tx).await.map_err(|_| "No fue posible guardar el movimiento de caja.".to_string())?;
    tx.commit().await.map_err(|_| "No fue posible confirmar el movimiento de caja.".to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashWithdrawalRequest {
    pub denominations: Vec<CashDenomination>,
    pub recipient_user_id: i64,
    pub reason: String,
}

#[tauri::command]
pub async fn record_cash_withdrawal(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
    withdrawal: CashWithdrawalRequest,
) -> Result<i64, String> {
    let actor = require_role(&auth, &session_token, &["admin", "cashier"])?;
    let amount_cents = counted_from_denominations(&withdrawal.denominations)?;
    if amount_cents <= 0 { return Err("El retiro debe ser mayor que cero.".into()); }
    if withdrawal.recipient_user_id <= 0 { return Err("Selecciona al encargado que recibe el retiro.".into()); }
    let reason = withdrawal.reason.trim();
    if reason.is_empty() || reason.chars().count() > 240 { return Err("Escribe el motivo del retiro (máximo 240 caracteres).".into()); }
    let recipient: Option<String> = sqlx::query_scalar("SELECT display_name FROM users WHERE id = ? AND active = 1 AND role = 'admin'")
        .bind(withdrawal.recipient_user_id).fetch_optional(&db.0).await
        .map_err(|_| "No fue posible validar al encargado.".to_string())?;
    let recipient = recipient.ok_or_else(|| "El encargado seleccionado ya no está activo.".to_string())?;
    let mut tx = db.0.begin().await.map_err(|_| "No fue posible iniciar el retiro.".to_string())?;
    let session = sqlx::query_as::<_, (i64, i64)>("SELECT id, opening_cents FROM cash_sessions WHERE closed_at IS NULL")
        .fetch_optional(&mut *tx).await.map_err(|_| "No fue posible consultar la caja.".to_string())?
        .ok_or_else(|| "Abre la caja antes de registrar un retiro.".to_string())?;
    let sales: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(p.amount_cents), 0) FROM sale_payments p JOIN sales s ON s.id = p.sale_id WHERE s.session_id = ? AND p.method = 'cash'")
        .bind(session.0).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular el efectivo disponible.".to_string())?;
    let (cash_in, cash_out): (i64, i64) = sqlx::query_as("SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cents ELSE 0 END), 0), COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cents ELSE 0 END), 0) FROM cash_movements WHERE session_id = ?")
        .bind(session.0).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular movimientos previos.".to_string())?;
    let refunds: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM sale_refunds WHERE session_id = ? AND method = 'cash'")
        .bind(session.0).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular reembolsos.".to_string())?;
    let available = session.1.checked_add(sales).and_then(|v| v.checked_add(cash_in)).and_then(|v| v.checked_sub(cash_out)).and_then(|v| v.checked_sub(refunds))
        .ok_or_else(|| "El efectivo disponible no es válido.".to_string())?;
    if amount_cents > available { return Err("El retiro supera el efectivo disponible en caja.".into()); }
    let inserted = sqlx::query("INSERT INTO cash_movements (session_id, direction, amount_cents, reason, created_by_user_id, recipient_user_id) VALUES (?, 'out', ?, ?, ?, ?)")
        .bind(session.0).bind(amount_cents).bind(format!("Retiro para {}: {}", recipient, reason)).bind(actor.id).bind(withdrawal.recipient_user_id)
        .execute(&mut *tx).await.map_err(|_| "No fue posible guardar el retiro.".to_string())?;
    let movement_id = inserted.last_insert_rowid();
    for item in &withdrawal.denominations {
        sqlx::query("INSERT INTO cash_movement_denominations (movement_id, denomination_cents, quantity, subtotal_cents) VALUES (?, ?, ?, ?)")
            .bind(movement_id).bind(item.denomination_cents).bind(item.quantity).bind(item.subtotal_cents)
            .execute(&mut *tx).await.map_err(|_| "No fue posible guardar el detalle de billetes y monedas.".to_string())?;
    }
    tx.commit().await.map_err(|_| "No fue posible confirmar el retiro.".to_string())?;
    Ok(amount_cents)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashClosureRequest {
    pub denominations: Vec<CashDenomination>,
    pub difference_reason: String,
}

fn counted_from_denominations(denominations: &[CashDenomination]) -> Result<i64, String> {
    if denominations.is_empty() || denominations.len() > CASH_DENOMINATIONS.len() {
        return Err("Captura el conteo de efectivo por denominación.".into());
    }
    let mut seen = std::collections::HashSet::new();
    let mut counted = 0_i64;
    for item in denominations {
        if !CASH_DENOMINATIONS.contains(&item.denomination_cents)
            || !seen.insert(item.denomination_cents)
        {
            return Err("La lista de denominaciones no es válida.".into());
        }
        if item.quantity < 0 || item.quantity > 1_000_000 {
            return Err("Las cantidades de billetes y monedas deben ser enteros no negativos.".into());
        }
        let subtotal = item
            .denomination_cents
            .checked_mul(item.quantity)
            .ok_or_else(|| "El conteo excede el importe permitido.".to_string())?;
        if subtotal != item.subtotal_cents {
            return Err("El subtotal de una denominación no coincide con su conteo.".into());
        }
        counted = counted
            .checked_add(subtotal)
            .ok_or_else(|| "El total contado excede el importe permitido.".to_string())?;
    }
    Ok(counted)
}

#[tauri::command]
pub async fn close_cash_session(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
    closure: CashClosureRequest,
) -> Result<CashClosure, String> {
    let user: UserInfo = require_role(&auth, &session_token, &["admin", "cashier"])?;
    let counted_cents = counted_from_denominations(&closure.denominations)?;
    let reason = closure.difference_reason.trim();
    if reason.chars().count() > 500 {
        return Err("El motivo admite hasta 500 caracteres.".into());
    }

    let mut tx = db
        .0
        .begin()
        .await
        .map_err(|_| "No fue posible iniciar el cierre de caja.".to_string())?;
    let session = sqlx::query_as::<_, (i64, i64)>(
        "SELECT id, opening_cents FROM cash_sessions WHERE closed_at IS NULL",
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_| "No fue posible consultar la caja abierta.".to_string())?
    .ok_or_else(|| "No hay una caja abierta para cerrar.".to_string())?;
    let session_id = session.0;
    let cash_sales: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(p.amount_cents), 0) FROM sale_payments p JOIN sales s ON s.id = p.sale_id WHERE s.session_id = ? AND p.method = 'cash'")
        .bind(session_id).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular ventas en efectivo.".to_string())?;
    let card_sales: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(p.amount_cents), 0) FROM sale_payments p JOIN sales s ON s.id = p.sale_id WHERE s.session_id = ? AND p.method = 'card'")
        .bind(session_id).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular ventas con tarjeta.".to_string())?;
    let cash_in: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM cash_movements WHERE session_id = ? AND direction = 'in'")
        .bind(session_id).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular entradas de efectivo.".to_string())?;
    let cash_out: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM cash_movements WHERE session_id = ? AND direction = 'out'")
        .bind(session_id).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular salidas de efectivo.".to_string())?;
    let refunds: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM sale_refunds WHERE session_id = ? AND method = 'cash'")
        .bind(session_id).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular reembolsos de efectivo.".to_string())?;
    let expected = session.1.checked_add(cash_sales).and_then(|v| v.checked_add(cash_in)).and_then(|v| v.checked_sub(cash_out)).and_then(|v| v.checked_sub(refunds))
        .filter(|v| *v >= 0).ok_or_else(|| "El efectivo esperado no es válido.".to_string())?;
    let difference = counted_cents.checked_sub(expected)
        .ok_or_else(|| "La diferencia está fuera del rango válido.".to_string())?;
    if difference != 0 && reason.is_empty() {
        return Err("Indica el motivo del faltante o sobrante para cerrar el turno.".into());
    }

    for item in &closure.denominations {
        sqlx::query("INSERT INTO cash_closure_denominations (session_id, denomination_cents, quantity, subtotal_cents) VALUES (?, ?, ?, ?)")
            .bind(session_id).bind(item.denomination_cents).bind(item.quantity).bind(item.subtotal_cents)
            .execute(&mut *tx).await.map_err(|_| "No fue posible guardar el arqueo por denominación.".to_string())?;
    }
    let reason = if reason.is_empty() { None } else { Some(reason) };
    let updated = sqlx::query(
        "UPDATE cash_sessions SET closed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            closed_by_user_id = ?, cash_sales_cents = ?, cash_refunds_cents = ?,
            cash_in_cents = ?, cash_out_cents = ?, card_sales_cents = ?,
            expected_cents = ?, counted_cents = ?, difference_cents = ?, difference_reason = ?
         WHERE id = ? AND closed_at IS NULL",
    )
    .bind(user.id).bind(cash_sales).bind(refunds).bind(cash_in).bind(cash_out)
    .bind(card_sales).bind(expected).bind(counted_cents).bind(difference).bind(reason)
    .bind(session_id).execute(&mut *tx).await
    .map_err(|_| "No fue posible guardar el cierre de caja.".to_string())?;
    if updated.rows_affected() != 1 {
        return Err("El turno ya fue cerrado. Actualiza la pantalla e inténtalo de nuevo.".into());
    }
    tx.commit().await.map_err(|_| "No fue posible confirmar el cierre de caja.".to_string())?;
    closure_by_id(&db.0, session_id).await
}
