use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tauri::State;

use crate::{
    commands::auth::{require_role, AuthState, UserInfo},
    infrastructure::database::Database,
};

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Customer {
    pub id: i64,
    pub name: String,
    pub phone: Option<String>,
    pub tax_id: Option<String>,
    pub address: Option<String>,
    pub credit_limit_cents: i64,
    pub credit_days: i64,
    pub balance_cents: i64,
    pub account_status: String,
    pub has_overdue: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerInput {
    pub name: String,
    pub phone: Option<String>,
    pub tax_id: Option<String>,
    pub address: Option<String>,
    pub credit_limit_cents: i64,
    pub credit_days: i64,
    pub account_status: String,
}

fn clean(value: Option<String>, max: usize) -> Result<Option<String>, String> {
    let value = value.map(|item| item.trim().to_owned()).filter(|item| !item.is_empty());
    if value.as_ref().is_some_and(|item| item.chars().count() > max) {
        return Err("Uno de los datos del cliente supera la longitud permitida.".into());
    }
    Ok(value)
}

fn validate_customer(input: &CustomerInput) -> Result<(), String> {
    if input.name.trim().is_empty() || input.name.chars().count() > 160 {
        return Err("El nombre del cliente es obligatorio y admite hasta 160 caracteres.".into());
    }
    if input.credit_limit_cents < 0 || !(0..=365).contains(&input.credit_days) {
        return Err("El límite debe ser positivo y los días de crédito deben estar entre 0 y 365.".into());
    }
    if !matches!(input.account_status.as_str(), "active" | "blocked") {
        return Err("El estado de la cuenta no es válido.".into());
    }
    Ok(())
}

const CUSTOMER_COLUMNS: &str = "c.id, c.name, c.phone, c.tax_id, c.address,
    c.credit_limit_cents, c.credit_days, c.balance_cents, c.account_status,
    EXISTS(SELECT 1 FROM credit_sales cs WHERE cs.customer_id = c.id AND cs.status = 'open'
        AND cs.balance_due_cents > 0 AND date(cs.due_at) < date('now', '-6 hours')) AS has_overdue";

#[tauri::command]
pub async fn list_customers(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
) -> Result<Vec<Customer>, String> {
    require_role(&auth, &session_token, &["admin", "cashier"])?;
    let query = format!("SELECT {CUSTOMER_COLUMNS} FROM customers c ORDER BY c.name COLLATE NOCASE");
    sqlx::query_as::<_, Customer>(&query)
        .fetch_all(&db.0)
        .await
        .map_err(|_| "No fue posible consultar los clientes.".into())
}

#[tauri::command]
pub async fn create_customer(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
    customer: CustomerInput,
) -> Result<Customer, String> {
    require_role(&auth, &session_token, &["admin"])?;
    validate_customer(&customer)?;
    let id = sqlx::query(
        "INSERT INTO customers (name, phone, tax_id, address, credit_limit_cents, credit_days, account_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(customer.name.trim())
    .bind(clean(customer.phone, 40)?)
    .bind(clean(customer.tax_id, 32)?)
    .bind(clean(customer.address, 240)?)
    .bind(customer.credit_limit_cents)
    .bind(customer.credit_days)
    .bind(customer.account_status)
    .execute(&db.0)
    .await
    .map_err(|_| "No fue posible registrar el cliente.".to_string())?
    .last_insert_rowid();
    customer_by_id(&db.0, id).await
}

#[tauri::command]
pub async fn update_customer(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
    customer_id: i64,
    customer: CustomerInput,
) -> Result<Customer, String> {
    require_role(&auth, &session_token, &["admin"])?;
    validate_customer(&customer)?;
    if customer_id <= 0 {
        return Err("El cliente indicado no es válido.".into());
    }
    let result = sqlx::query(
        "UPDATE customers SET name = ?, phone = ?, tax_id = ?, address = ?,
            credit_limit_cents = ?, credit_days = ?, account_status = ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(customer.name.trim())
    .bind(clean(customer.phone, 40)?)
    .bind(clean(customer.tax_id, 32)?)
    .bind(clean(customer.address, 240)?)
    .bind(customer.credit_limit_cents)
    .bind(customer.credit_days)
    .bind(customer.account_status)
    .bind(customer_id)
    .execute(&db.0)
    .await
    .map_err(|_| "No fue posible actualizar el cliente.".to_string())?;
    if result.rows_affected() == 0 {
        return Err("No se encontró el cliente.".into());
    }
    customer_by_id(&db.0, customer_id).await
}

async fn customer_by_id(db: &sqlx::SqlitePool, id: i64) -> Result<Customer, String> {
    let query = format!("SELECT {CUSTOMER_COLUMNS} FROM customers c WHERE c.id = ?");
    sqlx::query_as::<_, Customer>(&query)
        .bind(id)
        .fetch_one(db)
        .await
        .map_err(|_| "No fue posible recuperar el cliente.".into())
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CreditTicket {
    pub credit_sale_id: i64,
    pub sale_id: i64,
    pub folio: String,
    pub original_amount_cents: i64,
    pub paid_cents: i64,
    pub balance_due_cents: i64,
    pub issued_at: String,
    pub due_at: String,
    pub days_until_due: Option<i64>,
    pub status: String,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PaymentAllocation {
    pub folio: String,
    pub allocated_cents: i64,
    pub balance_after_cents: i64,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CustomerPaymentRecord {
    pub id: i64,
    pub amount_cents: i64,
    pub balance_after_cents: i64,
    pub method: String,
    pub reference: Option<String>,
    pub created_at: String,
    pub cashier_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerPaymentWithAllocations {
    #[serde(flatten)]
    pub payment: CustomerPaymentRecord,
    pub allocations: Vec<PaymentAllocation>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerStatement {
    pub customer: Customer,
    pub tickets: Vec<CreditTicket>,
    pub payments: Vec<CustomerPaymentWithAllocations>,
}

async fn statement_for(db: &sqlx::SqlitePool, customer_id: i64) -> Result<CustomerStatement, String> {
    let customer = customer_by_id(db, customer_id).await?;
    let tickets = sqlx::query_as::<_, CreditTicket>(
        "SELECT cs.id AS credit_sale_id, s.id AS sale_id, s.folio,
                cs.original_amount_cents,
                CASE WHEN cs.status = 'voided' THEN 0
                     ELSE cs.original_amount_cents - cs.balance_due_cents END AS paid_cents,
                cs.balance_due_cents, cs.issued_at, cs.due_at,
                CASE WHEN cs.balance_due_cents > 0
                     THEN CAST(julianday(date(cs.due_at)) - julianday(date('now', '-6 hours')) AS INTEGER)
                     ELSE NULL END AS days_until_due,
                cs.status
         FROM credit_sales cs JOIN sales s ON s.id = cs.sale_id
         WHERE cs.customer_id = ? ORDER BY cs.issued_at DESC, cs.id DESC",
    )
    .bind(customer_id)
    .fetch_all(db)
    .await
    .map_err(|_| "No fue posible consultar las ventas a crédito.".to_string())?;
    let records = sqlx::query_as::<_, CustomerPaymentRecord>(
        "SELECT p.id, p.amount_cents,
                COALESCE((SELECT SUM(cs.original_amount_cents) FROM credit_sales cs
                    WHERE cs.customer_id = p.customer_id AND cs.issued_at <= p.created_at
                    AND NOT EXISTS(SELECT 1 FROM credit_sale_voids v WHERE v.credit_sale_id = cs.id AND v.created_at <= p.created_at)), 0)
                - COALESCE((SELECT SUM(a.allocated_cents) FROM customer_payment_allocations a
                    JOIN customer_payments earlier ON earlier.id = a.payment_id
                    WHERE earlier.customer_id = p.customer_id
                    AND (earlier.created_at < p.created_at OR (earlier.created_at = p.created_at AND earlier.id <= p.id))), 0)
                    AS balance_after_cents,
                p.method, p.reference,
                p.created_at, COALESCE(u.display_name, 'Usuario anterior') AS cashier_name
         FROM customer_payments p LEFT JOIN users u ON u.id = p.user_id
         WHERE p.customer_id = ? ORDER BY p.id DESC",
    )
    .bind(customer_id)
    .fetch_all(db)
    .await
    .map_err(|_| "No fue posible consultar los abonos del cliente.".to_string())?;
    let mut payments = Vec::with_capacity(records.len());
    for payment in records {
        let allocations = sqlx::query_as::<_, PaymentAllocation>(
            "SELECT s.folio, a.allocated_cents,
                    cs.original_amount_cents - COALESCE((SELECT SUM(a2.allocated_cents)
                        FROM customer_payment_allocations a2
                        JOIN customer_payments p2 ON p2.id = a2.payment_id
                        WHERE a2.credit_sale_id = cs.id
                        AND (p2.created_at < p.created_at OR (p2.created_at = p.created_at AND p2.id <= p.id))), 0)
                    AS balance_after_cents
             FROM customer_payment_allocations a
             JOIN credit_sales cs ON cs.id = a.credit_sale_id
             JOIN sales s ON s.id = cs.sale_id
             JOIN customer_payments p ON p.id = a.payment_id
             WHERE a.payment_id = ? ORDER BY a.rowid",
        )
        .bind(payment.id)
        .fetch_all(db)
        .await
        .map_err(|_| "No fue posible consultar la aplicación de un abono.".to_string())?;
        payments.push(CustomerPaymentWithAllocations { payment, allocations });
    }
    Ok(CustomerStatement { customer, tickets, payments })
}

#[tauri::command]
pub async fn get_customer_statement(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
    customer_id: i64,
) -> Result<CustomerStatement, String> {
    require_role(&auth, &session_token, &["admin", "cashier"])?;
    if customer_id <= 0 {
        return Err("El cliente indicado no es válido.".into());
    }
    statement_for(&db.0, customer_id).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerPaymentRequest {
    pub operation_id: String,
    pub customer_id: i64,
    pub amount_cents: i64,
    pub method: String,
    pub reference: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PaymentReceiptRow {
    pub id: i64,
    pub customer_id: i64,
    pub customer_name: String,
    pub amount_cents: i64,
    pub balance_after_cents: i64,
    pub method: String,
    pub reference: Option<String>,
    pub created_at: String,
    pub cashier_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerPaymentReceipt {
    #[serde(flatten)]
    pub receipt: PaymentReceiptRow,
    pub allocations: Vec<PaymentAllocation>,
}

async fn payment_receipt(db: &sqlx::SqlitePool, payment_id: i64) -> Result<CustomerPaymentReceipt, String> {
    let receipt = sqlx::query_as::<_, PaymentReceiptRow>(
        "SELECT p.id, p.customer_id, c.name AS customer_name, p.amount_cents,
                COALESCE((SELECT SUM(cs.original_amount_cents) FROM credit_sales cs
                    WHERE cs.customer_id = p.customer_id AND cs.issued_at <= p.created_at
                    AND NOT EXISTS(SELECT 1 FROM credit_sale_voids v WHERE v.credit_sale_id = cs.id AND v.created_at <= p.created_at)), 0)
                - COALESCE((SELECT SUM(a.allocated_cents) FROM customer_payment_allocations a
                    JOIN customer_payments earlier ON earlier.id = a.payment_id
                    WHERE earlier.customer_id = p.customer_id
                    AND (earlier.created_at < p.created_at OR (earlier.created_at = p.created_at AND earlier.id <= p.id))), 0)
                    AS balance_after_cents,
                p.method, p.reference, p.created_at,
                COALESCE(u.display_name, 'Usuario anterior') AS cashier_name
         FROM customer_payments p JOIN customers c ON c.id = p.customer_id
         LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?",
    )
    .bind(payment_id)
    .fetch_one(db)
    .await
    .map_err(|_| "No fue posible recuperar el comprobante del abono.".to_string())?;
    let allocations = sqlx::query_as::<_, PaymentAllocation>(
        "SELECT s.folio, a.allocated_cents,
                cs.original_amount_cents - COALESCE((SELECT SUM(a2.allocated_cents)
                    FROM customer_payment_allocations a2
                    JOIN customer_payments p2 ON p2.id = a2.payment_id
                    WHERE a2.credit_sale_id = cs.id
                    AND (p2.created_at < p.created_at OR (p2.created_at = p.created_at AND p2.id <= p.id))), 0)
                AS balance_after_cents
         FROM customer_payment_allocations a
         JOIN credit_sales cs ON cs.id = a.credit_sale_id
         JOIN sales s ON s.id = cs.sale_id
         JOIN customer_payments p ON p.id = a.payment_id
         WHERE a.payment_id = ? ORDER BY a.rowid",
    )
    .bind(payment_id)
    .fetch_all(db)
    .await
    .map_err(|_| "No fue posible recuperar el detalle del abono.".to_string())?;
    Ok(CustomerPaymentReceipt { receipt, allocations })
}

#[tauri::command]
pub async fn receive_customer_payment(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
    payment: CustomerPaymentRequest,
) -> Result<CustomerPaymentReceipt, String> {
    let user: UserInfo = require_role(&auth, &session_token, &["admin", "cashier"])?;
    let operation_id = payment.operation_id.trim();
    if operation_id.is_empty() || operation_id.len() > 100 {
        return Err("El identificador del abono no es válido.".into());
    }
    if payment.customer_id <= 0 || payment.amount_cents <= 0 {
        return Err("Selecciona un cliente e indica un importe mayor que cero.".into());
    }
    if !matches!(payment.method.as_str(), "cash" | "transfer") {
        return Err("El método del abono debe ser efectivo o transferencia.".into());
    }
    let reference = clean(payment.reference, 100)?;
    if payment.method == "transfer" && reference.is_none() {
        return Err("Indica la referencia de la transferencia.".into());
    }
    if let Some(existing_id) = sqlx::query_scalar::<_, i64>("SELECT id FROM customer_payments WHERE operation_id = ?")
        .bind(operation_id).fetch_optional(&db.0).await
        .map_err(|_| "No fue posible validar el abono.".to_string())? {
        return payment_receipt(&db.0, existing_id).await;
    }

    let mut tx = db.0.begin().await.map_err(|_| "No fue posible iniciar el abono.".to_string())?;
    let customer = sqlx::query_as::<_, (String, i64)>(
        "SELECT name, balance_cents FROM customers WHERE id = ?",
    )
    .bind(payment.customer_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_| "No fue posible validar la cuenta del cliente.".to_string())?
    .ok_or_else(|| "No se encontró el cliente.".to_string())?;
    if payment.amount_cents > customer.1 {
        return Err("El abono no puede superar el saldo pendiente del cliente.".into());
    }
    let session_id: Option<i64> = if payment.method == "cash" {
        Some(sqlx::query_scalar("SELECT id FROM cash_sessions WHERE closed_at IS NULL")
            .fetch_optional(&mut *tx).await.map_err(|_| "No fue posible consultar la caja.".to_string())?
            .ok_or_else(|| "Abre un turno de caja para recibir un abono en efectivo.".to_string())?)
    } else {
        None
    };
    let tickets = sqlx::query_as::<_, (i64, i64)>(
        "SELECT id, balance_due_cents FROM credit_sales
         WHERE customer_id = ? AND status = 'open' AND balance_due_cents > 0
         ORDER BY due_at ASC, issued_at ASC, id ASC",
    )
    .bind(payment.customer_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|_| "No fue posible determinar las facturas pendientes.".to_string())?;
    let total_due = tickets.iter().try_fold(0_i64, |sum, (_, due)| sum.checked_add(*due))
        .ok_or_else(|| "El saldo del cliente excede el límite permitido.".to_string())?;
    if payment.amount_cents > total_due {
        return Err("El abono supera las cuentas por cobrar registradas.".into());
    }
    let balance_after = customer.1.checked_sub(payment.amount_cents)
        .ok_or_else(|| "El saldo resultante no es válido.".to_string())?;
    let payment_id = sqlx::query(
        "INSERT INTO customer_payments (operation_id, customer_id, amount_cents,
            method, reference, session_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(operation_id).bind(payment.customer_id).bind(payment.amount_cents)
    .bind(&payment.method).bind(reference.as_deref()).bind(session_id).bind(user.id)
    .execute(&mut *tx).await.map_err(|_| "No fue posible registrar el abono.".to_string())?
    .last_insert_rowid();

    let mut remaining = payment.amount_cents;
    for (credit_sale_id, due) in tickets {
        if remaining == 0 { break; }
        let applied = remaining.min(due);
        let ticket_balance = due - applied;
        sqlx::query(
            "INSERT INTO customer_payment_allocations (payment_id, credit_sale_id, allocated_cents)
             VALUES (?, ?, ?)",
        ).bind(payment_id).bind(credit_sale_id).bind(applied)
            .execute(&mut *tx).await.map_err(|_| "No fue posible aplicar el abono a una venta.".to_string())?;
        sqlx::query("UPDATE credit_sales SET balance_due_cents = ?, status = ? WHERE id = ? AND status = 'open'")
            .bind(ticket_balance).bind(if ticket_balance == 0 { "paid" } else { "open" }).bind(credit_sale_id)
            .execute(&mut *tx).await.map_err(|_| "No fue posible actualizar el saldo de una venta.".to_string())?;
        remaining -= applied;
    }
    if remaining != 0 { return Err("No fue posible aplicar el importe completo del abono.".into()); }
    sqlx::query("UPDATE customers SET balance_cents = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
        .bind(balance_after).bind(payment.customer_id).execute(&mut *tx).await
        .map_err(|_| "No fue posible actualizar el saldo del cliente.".to_string())?;
    if let Some(session_id) = session_id {
        sqlx::query("INSERT INTO cash_movements (session_id, direction, amount_cents, reason, customer_payment_id) VALUES (?, 'in', ?, ?, ?)")
            .bind(session_id).bind(payment.amount_cents).bind(format!("Abono de cliente {}", customer.0)).bind(payment_id)
            .execute(&mut *tx).await.map_err(|_| "No fue posible registrar la entrada del abono en caja.".to_string())?;
    }
    tx.commit().await.map_err(|_| "No fue posible confirmar el abono.".to_string())?;
    payment_receipt(&db.0, payment_id).await
}
