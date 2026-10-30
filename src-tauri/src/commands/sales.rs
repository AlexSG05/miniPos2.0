use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tauri::State;

use crate::commands::auth::{require_role, AuthState};
use crate::infrastructure::database::Database;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleRequest {
    pub operation_id: String,
    pub items: Vec<SaleRequestItem>,
    pub payment_method: String,
    pub received_cents: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleRequestItem {
    pub product_id: i64,
    pub quantity_milli: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoidSaleRequest {
    pub operation_id: String,
    pub folio: String,
    pub reason: String,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RefundReceipt {
    pub folio: String,
    pub amount_cents: i64,
    pub subtotal_cents: i64,
    pub method: String,
    pub reason: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SaleReceipt {
    pub folio: String,
    pub subtotal_cents: i64,
    pub tax_cents: i64,
    pub total_cents: i64,
    pub payment_method: String,
    pub received_cents: i64,
    pub change_cents: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SaleReceiptItem {
    pub product_name: String,
    pub internal_code: String,
    pub quantity: f64,
    pub unit_price_cents: i64,
    pub line_total_cents: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleReceiptDetails {
    pub receipt: SaleReceipt,
    pub items: Vec<SaleReceiptItem>,
    pub status: String,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SaleHistoryRow {
    pub folio: String,
    pub created_at: String,
    pub total_cents: i64,
    pub payment_methods: String,
    pub status: String,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BestSeller {
    pub product_name: String,
    pub quantity_sold: f64,
    pub sales_cents: i64,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LowStockProduct {
    pub id: i64,
    pub name: String,
    pub stock_quantity: f64,
    pub min_stock: f64,
    pub unit: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailySalesReport {
    pub date: String,
    pub gross_cents: i64,
    pub discounts_cents: i64,
    pub refund_cents: i64,
    pub refunded_subtotal_cents: i64,
    pub tax_cents: i64,
    pub total_cents: i64,
    pub operations: i64,
    pub cash_cents: i64,
    pub card_cents: i64,
    pub best_sellers: Vec<BestSeller>,
    pub low_stock: Vec<LowStockProduct>,
}

#[tauri::command]
pub async fn list_recent_sales(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String) -> Result<Vec<SaleHistoryRow>, String> {
    require_role(&auth, &session_token, &["admin", "cashier"])?;
    sqlx::query_as::<_, SaleHistoryRow>(
        "SELECT s.folio, s.created_at, s.total_cents, s.status,
                COALESCE((SELECT group_concat(method, ', ') FROM
                    (SELECT DISTINCT method FROM sale_payments WHERE sale_id = s.id)), '') AS payment_methods
         FROM sales s ORDER BY s.id DESC LIMIT 100"
    ).fetch_all(&db.0).await.map_err(|error| {
        eprintln!("Error consultando historial de ventas: {error}");
        "No fue posible consultar el historial de ventas.".to_string()
    })
}

#[tauri::command]
pub async fn get_sale_receipt(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, folio: String) -> Result<SaleReceiptDetails, String> {
    require_role(&auth, &session_token, &["admin", "cashier"])?;
    let folio = folio.trim();
    if folio.is_empty() || folio.len() > 80 {
        return Err("El folio indicado no es válido.".into());
    }
    let receipt = sqlx::query_as::<_, SaleReceipt>(
        "SELECT s.folio, s.subtotal_cents, s.tax_cents, s.total_cents,
                COALESCE((SELECT group_concat(method, ', ') FROM
                    (SELECT DISTINCT method FROM sale_payments WHERE sale_id = s.id)), '') AS payment_method,
                COALESCE((SELECT SUM(received_cents) FROM sale_payments WHERE sale_id = s.id), 0) AS received_cents,
                COALESCE((SELECT SUM(change_cents) FROM sale_payments WHERE sale_id = s.id), 0) AS change_cents,
                s.created_at
         FROM sales s WHERE s.folio = ?"
    ).bind(folio).fetch_optional(&db.0).await
        .map_err(|_| "No fue posible recuperar el comprobante.".to_string())?
        .ok_or_else(|| "No se encontró una venta con ese folio.".to_string())?;
    let (sale_id, status): (i64, String) = sqlx::query_as("SELECT id, status FROM sales WHERE folio = ?")
        .bind(folio).fetch_one(&db.0).await
        .map_err(|_| "No fue posible consultar el estado de la venta.".to_string())?;
    let items = sqlx::query_as::<_, SaleReceiptItem>(
        "SELECT product_name, internal_code, quantity, unit_price_cents, line_total_cents
         FROM sale_items WHERE sale_id = ? ORDER BY id"
    ).bind(sale_id).fetch_all(&db.0).await
        .map_err(|_| "No fue posible recuperar los artículos del comprobante.".to_string())?;
    Ok(SaleReceiptDetails { receipt, items, status })
}

#[tauri::command]
pub async fn get_sales_report(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, start_date: Option<String>, end_date: Option<String>) -> Result<DailySalesReport, String> {
    require_role(&auth, &session_token, &["admin"])?;
    let start_date = start_date.map(|value| value.trim().to_owned()).filter(|value| !value.is_empty());
    let end_date = end_date.map(|value| value.trim().to_owned()).filter(|value| !value.is_empty());
    if start_date.is_some() != end_date.is_some() { return Err("Selecciona ambas fechas del periodo.".into()); }
    if let (Some(start), Some(end)) = (&start_date, &end_date) {
        let start_day = NaiveDate::parse_from_str(start, "%Y-%m-%d").map_err(|_| "La fecha inicial no es válida.".to_string())?;
        let end_day = NaiveDate::parse_from_str(end, "%Y-%m-%d").map_err(|_| "La fecha final no es válida.".to_string())?;
        if end_day < start_day { return Err("La fecha final debe ser igual o posterior a la inicial.".into()); }
        if (end_day - start_day).num_days() > 366 { return Err("El periodo máximo es de 367 días.".into()); }
    }
    let (date, gross_cents, discounts_cents, refund_cents, refunded_subtotal_cents, tax_cents, total_cents, operations): (String, i64, i64, i64, i64, i64, i64, i64) = sqlx::query_as(
        "SELECT CASE WHEN ?1 IS NULL THEN date('now', '-6 hours') WHEN ?1 = ?2 THEN ?1 ELSE ?1 || ' — ' || ?2 END,
                COALESCE(SUM(s.subtotal_cents), 0), COALESCE(SUM(s.discount_cents), 0),
                COALESCE((SELECT SUM(r.amount_cents) FROM sale_refunds r JOIN sales rs ON rs.id = r.sale_id WHERE date(rs.created_at, '-6 hours') BETWEEN COALESCE(?1, date('now', '-6 hours')) AND COALESCE(?2, date('now', '-6 hours'))), 0),
                COALESCE((SELECT SUM(r.subtotal_cents) FROM sale_refunds r JOIN sales rs ON rs.id = r.sale_id WHERE date(rs.created_at, '-6 hours') BETWEEN COALESCE(?1, date('now', '-6 hours')) AND COALESCE(?2, date('now', '-6 hours'))), 0),
                COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.tax_cents ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.total_cents ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END), 0)
         FROM sales s WHERE date(s.created_at, '-6 hours') BETWEEN COALESCE(?1, date('now', '-6 hours')) AND COALESCE(?2, date('now', '-6 hours'))"
    ).bind(&start_date).bind(&end_date).fetch_one(&db.0).await.map_err(|_| "No fue posible calcular las ventas del día.".to_string())?;
    let cash_cents: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(p.amount_cents), 0) FROM sale_payments p JOIN sales s ON s.id = p.sale_id
         WHERE s.status = 'completed' AND p.method = 'cash' AND date(s.created_at, '-6 hours') BETWEEN COALESCE(?, date('now', '-6 hours')) AND COALESCE(?, date('now', '-6 hours'))"
    ).bind(&start_date).bind(&end_date).fetch_one(&db.0).await.map_err(|_| "No fue posible calcular pagos en efectivo.".to_string())?;
    let card_cents: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(p.amount_cents), 0) FROM sale_payments p JOIN sales s ON s.id = p.sale_id
         WHERE s.status = 'completed' AND p.method = 'card' AND date(s.created_at, '-6 hours') BETWEEN COALESCE(?, date('now', '-6 hours')) AND COALESCE(?, date('now', '-6 hours'))"
    ).bind(&start_date).bind(&end_date).fetch_one(&db.0).await.map_err(|_| "No fue posible calcular pagos con tarjeta.".to_string())?;
    let best_sellers = sqlx::query_as::<_, BestSeller>(
        "SELECT i.product_name, SUM(i.quantity) AS quantity_sold, SUM(i.line_total_cents) AS sales_cents
         FROM sale_items i JOIN sales s ON s.id = i.sale_id
         WHERE s.status = 'completed' AND date(s.created_at, '-6 hours') BETWEEN COALESCE(?, date('now', '-6 hours')) AND COALESCE(?, date('now', '-6 hours'))
         GROUP BY i.product_name ORDER BY quantity_sold DESC, sales_cents DESC LIMIT 5"
    ).bind(&start_date).bind(&end_date).fetch_all(&db.0).await.map_err(|_| "No fue posible consultar los productos más vendidos.".to_string())?;
    let low_stock = sqlx::query_as::<_, LowStockProduct>(
        "SELECT id, name, stock_quantity, min_stock, unit FROM products
         WHERE active = 1 AND stock_quantity <= min_stock ORDER BY stock_quantity ASC, name COLLATE NOCASE LIMIT 100"
    ).fetch_all(&db.0).await.map_err(|_| "No fue posible consultar productos con stock bajo.".to_string())?;
    Ok(DailySalesReport { date, gross_cents, discounts_cents, refund_cents, refunded_subtotal_cents, tax_cents, total_cents, operations, cash_cents, card_cents, best_sellers, low_stock })
}

async fn receipt_by_operation(db: &sqlx::SqlitePool, operation_id: &str) -> Result<Option<SaleReceipt>, String> {
    sqlx::query_as::<_, SaleReceipt>(
        "SELECT s.folio, s.subtotal_cents, s.tax_cents, s.total_cents, p.method AS payment_method,
                p.received_cents, p.change_cents, s.created_at
         FROM sales s JOIN sale_payments p ON p.sale_id = s.id
         WHERE s.operation_id = ? AND s.status = 'completed' LIMIT 1"
    ).bind(operation_id).fetch_optional(db).await.map_err(|_| "No fue posible recuperar la venta registrada.".into())
}

#[tauri::command]
pub async fn complete_sale(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, request: SaleRequest) -> Result<SaleReceipt, String> {
    require_role(&auth, &session_token, &["admin", "cashier"])?;
    let operation_id = request.operation_id.trim();
    if operation_id.is_empty() || operation_id.len() > 100 {
        return Err("El identificador de venta no es válido.".into());
    }
    if let Some(receipt) = receipt_by_operation(&db.0, operation_id).await? { return Ok(receipt); }
    if request.items.is_empty() || request.items.len() > 100 {
        return Err("Agrega al menos un producto a la venta.".into());
    }
    if !matches!(request.payment_method.as_str(), "cash" | "card") {
        return Err("El método de pago no es válido.".into());
    }

    let mut tx = db.0.begin().await.map_err(|_| "No fue posible iniciar la venta.".to_string())?;
    let session_id: Option<i64> = sqlx::query_scalar("SELECT id FROM cash_sessions WHERE closed_at IS NULL")
        .fetch_optional(&mut *tx).await.map_err(|_| "No fue posible verificar el estado de caja.".to_string())?;
    let session_id = session_id.ok_or_else(|| "Abre la caja antes de registrar ventas.".to_string())?;

    let mut subtotal: i64 = 0;
    let mut prepared = Vec::with_capacity(request.items.len());
    for item in &request.items {
        if item.product_id <= 0 || item.quantity_milli <= 0 {
            return Err("Hay un producto o una cantidad no válida en la venta.".into());
        }
        let row = sqlx::query_as::<_, (String, String, i64, i64, f64, bool, String)>(
            "SELECT name, internal_code, price_cents, cost_cents, stock_quantity, active, unit FROM products WHERE id = ?"
        ).bind(item.product_id).fetch_optional(&mut *tx).await
            .map_err(|_| "No fue posible validar los productos de la venta.".to_string())?
            .ok_or_else(|| "Uno de los productos ya no existe.".to_string())?;
        if !row.5 { return Err(format!("{} está inactivo.", row.0)); }
        if row.6 == "piece" && item.quantity_milli % 1000 != 0 {
            return Err(format!("{} se vende en piezas enteras.", row.0));
        }
        let available_milli = (row.4 * 1000.0).floor() as i64;
        if item.quantity_milli > available_milli { return Err(format!("Stock insuficiente para {}.", row.0)); }
        let line_calc = (row.2 as i128).checked_mul(item.quantity_milli as i128)
            .ok_or_else(|| "El importe de la venta excede el límite permitido.".to_string())?;
        let line_total = i64::try_from((line_calc + 500) / 1000)
            .map_err(|_| "El importe de la venta excede el límite permitido.".to_string())?;
        subtotal = subtotal.checked_add(line_total).ok_or_else(|| "El total de la venta excede el límite permitido.".to_string())?;
        prepared.push((item.product_id, item.quantity_milli, row.0, row.1, row.2, row.3, line_total));
    }
    let tax_rate: i64 = sqlx::query_scalar("SELECT tax_rate_basis_points FROM business_settings WHERE id = 1")
        .fetch_one(&mut *tx).await.map_err(|_| "No fue posible leer la tasa fiscal configurada.".to_string())?;
    let tax_calc = (subtotal as i128).checked_mul(tax_rate as i128)
        .ok_or_else(|| "El impuesto excede el límite permitido.".to_string())?;
    let tax = i64::try_from((tax_calc + 5000) / 10000)
        .map_err(|_| "El impuesto excede el límite permitido.".to_string())?;
    let total = subtotal.checked_add(tax).ok_or_else(|| "El total excede el límite permitido.".to_string())?;
    if request.payment_method == "cash" && request.received_cents < total {
        return Err("El efectivo recibido es menor que el total.".into());
    }
    if request.payment_method == "card" && request.received_cents != total {
        return Err("El importe registrado con tarjeta debe coincidir con el total.".into());
    }
    let change = if request.payment_method == "cash" { request.received_cents - total } else { 0 };

    let inserted = sqlx::query(
        "INSERT INTO sales (operation_id, folio, session_id, subtotal_cents, discount_cents, tax_cents, total_cents, status)
         VALUES (?, 'pending', ?, ?, 0, ?, ?, 'completed')"
    ).bind(operation_id).bind(session_id).bind(subtotal).bind(tax).bind(total)
        .execute(&mut *tx).await.map_err(|error| {
            eprintln!("Error guardando venta: {error}");
            "No fue posible registrar la venta.".to_string()
        })?;
    let sale_id = inserted.last_insert_rowid();
    let date: String = sqlx::query_scalar("SELECT strftime('%Y%m%d', 'now')")
        .fetch_one(&mut *tx).await.map_err(|_| "No fue posible generar el folio de venta.".to_string())?;
    let folio = format!("V-{date}-{sale_id:06}");
    sqlx::query("UPDATE sales SET folio = ? WHERE id = ?").bind(&folio).bind(sale_id)
        .execute(&mut *tx).await.map_err(|_| "No fue posible asignar el folio de venta.".to_string())?;

    for (product_id, quantity_milli, name, code, price, cost, line_total) in prepared {
        let quantity = quantity_milli as f64 / 1000.0;
        let updated = sqlx::query("UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND active = 1 AND stock_quantity >= ?")
            .bind(quantity).bind(product_id).bind(quantity).execute(&mut *tx).await
            .map_err(|_| "No fue posible descontar existencias.".to_string())?;
        if updated.rows_affected() != 1 { return Err(format!("Stock insuficiente para {name}; no se cobró la venta.")); }
        sqlx::query("INSERT INTO sale_items (sale_id, product_id, product_name, internal_code, quantity, unit_price_cents, unit_cost_cents, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(sale_id).bind(product_id).bind(&name).bind(&code).bind(quantity).bind(price).bind(cost).bind(line_total)
            .execute(&mut *tx).await.map_err(|_| "No fue posible guardar el detalle de la venta.".to_string())?;
        let new_stock: f64 = sqlx::query_scalar("SELECT stock_quantity FROM products WHERE id = ?")
            .bind(product_id).fetch_one(&mut *tx).await.map_err(|_| "No fue posible recuperar las existencias.".to_string())?;
        sqlx::query("INSERT INTO inventory_movements (product_id, movement_type, quantity, previous_quantity, new_quantity, reason, sale_id) VALUES (?, 'sale', ?, ?, ?, ?, ?)")
            .bind(product_id).bind(quantity).bind(new_stock + quantity).bind(new_stock).bind(format!("Venta {folio}")).bind(&folio)
            .execute(&mut *tx).await.map_err(|_| "No fue posible registrar la salida de inventario.".to_string())?;
    }
    sqlx::query("INSERT INTO sale_payments (sale_id, method, amount_cents, received_cents, change_cents) VALUES (?, ?, ?, ?, ?)")
        .bind(sale_id).bind(&request.payment_method).bind(total).bind(request.received_cents).bind(change)
        .execute(&mut *tx).await.map_err(|_| "No fue posible guardar el pago.".to_string())?;
    tx.commit().await.map_err(|_| "No fue posible confirmar la venta.".to_string())?;
    receipt_by_operation(&db.0, operation_id).await?.ok_or_else(|| "La venta se registró, pero no fue posible recuperar el comprobante.".into())
}

async fn refund_by_operation(db: &sqlx::SqlitePool, operation_id: &str) -> Result<Option<RefundReceipt>, String> {
    sqlx::query_as::<_, RefundReceipt>(
        "SELECT s.folio, r.amount_cents, r.subtotal_cents, r.method, r.reason, r.created_at
         FROM sale_refunds r JOIN sales s ON s.id = r.sale_id WHERE r.operation_id = ?"
    ).bind(operation_id).fetch_optional(db).await
        .map_err(|_| "No fue posible recuperar el reembolso registrado.".to_string())
}

#[tauri::command]
pub async fn void_sale(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, request: VoidSaleRequest) -> Result<RefundReceipt, String> {
    require_role(&auth, &session_token, &["admin"])?;
    let operation_id = request.operation_id.trim();
    let folio = request.folio.trim();
    let reason = request.reason.trim();
    if operation_id.is_empty() || operation_id.len() > 100 { return Err("El identificador de operación no es válido.".into()); }
    if folio.is_empty() || folio.len() > 80 { return Err("El folio indicado no es válido.".into()); }
    if reason.is_empty() || reason.chars().count() > 240 { return Err("Describe el motivo de la anulación (máximo 240 caracteres).".into()); }
    if let Some(receipt) = refund_by_operation(&db.0, operation_id).await? { return Ok(receipt); }

    let mut tx = db.0.begin().await.map_err(|_| "No fue posible iniciar la anulación.".to_string())?;
    let session = sqlx::query_as::<_, (i64, i64)>("SELECT id, opening_cents FROM cash_sessions WHERE closed_at IS NULL")
        .fetch_optional(&mut *tx).await.map_err(|_| "No fue posible revisar la caja abierta.".to_string())?
        .ok_or_else(|| "Abre la caja para registrar la devolución.".to_string())?;
    let sale = sqlx::query_as::<_, (i64, i64, String, i64, i64)>(
        "SELECT s.id, s.total_cents, p.method, s.subtotal_cents, s.tax_cents FROM sales s JOIN sale_payments p ON p.sale_id = s.id
         WHERE s.folio = ? AND s.status = 'completed' LIMIT 1"
    ).bind(folio).fetch_optional(&mut *tx).await.map_err(|_| "No fue posible consultar la venta.".to_string())?
        .ok_or_else(|| "La venta no existe o ya fue anulada.".to_string())?;

    if sale.2 == "cash" {
        let sales_cash: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(p.amount_cents), 0) FROM sale_payments p JOIN sales s ON s.id = p.sale_id WHERE s.session_id = ? AND p.method = 'cash'")
            .bind(session.0).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular el efectivo.".to_string())?;
        let (cash_in, cash_out): (i64, i64) = sqlx::query_as("SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cents ELSE 0 END), 0), COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cents ELSE 0 END), 0) FROM cash_movements WHERE session_id = ?")
            .bind(session.0).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular movimientos de efectivo.".to_string())?;
        let refunds: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM sale_refunds WHERE session_id = ? AND method = 'cash'")
            .bind(session.0).fetch_one(&mut *tx).await.map_err(|_| "No fue posible calcular reembolsos anteriores.".to_string())?;
        let available = session.1.checked_add(sales_cash).and_then(|value| value.checked_add(cash_in)).and_then(|value| value.checked_sub(cash_out)).and_then(|value| value.checked_sub(refunds))
            .ok_or_else(|| "El efectivo disponible no es válido.".to_string())?;
        if sale.1 > available { return Err("No hay efectivo suficiente en la caja para devolver el importe.".into()); }
    }

    let changed = sqlx::query("UPDATE sales SET status = 'voided' WHERE id = ? AND status = 'completed'")
        .bind(sale.0).execute(&mut *tx).await.map_err(|_| "No fue posible anular la venta.".to_string())?;
    if changed.rows_affected() != 1 { return Err("La venta ya fue anulada.".into()); }
    sqlx::query("INSERT INTO sale_refunds (operation_id, sale_id, session_id, amount_cents, subtotal_cents, tax_cents, method, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(operation_id).bind(sale.0).bind(session.0).bind(sale.1).bind(sale.3).bind(sale.4).bind(&sale.2).bind(reason)
        .execute(&mut *tx).await.map_err(|_| "No fue posible registrar el reembolso.".to_string())?;

    let items = sqlx::query_as::<_, (i64, f64)>("SELECT product_id, quantity FROM sale_items WHERE sale_id = ?")
        .bind(sale.0).fetch_all(&mut *tx).await.map_err(|_| "No fue posible recuperar los productos de la venta.".to_string())?;
    for (product_id, quantity) in items {
        let previous: f64 = sqlx::query_scalar("SELECT stock_quantity FROM products WHERE id = ?")
            .bind(product_id).fetch_one(&mut *tx).await.map_err(|_| "No fue posible recuperar las existencias.".to_string())?;
        let next = previous + quantity;
        if !next.is_finite() { return Err("La devolución excede el límite de inventario.".into()); }
        sqlx::query("UPDATE products SET stock_quantity = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
            .bind(next).bind(product_id).execute(&mut *tx).await.map_err(|_| "No fue posible reponer las existencias.".to_string())?;
        sqlx::query("INSERT INTO inventory_movements (product_id, movement_type, quantity, previous_quantity, new_quantity, reason, sale_id) VALUES (?, 'return', ?, ?, ?, ?, ?)")
            .bind(product_id).bind(quantity).bind(previous).bind(next).bind(format!("Devolución {folio}: {reason}")).bind(folio)
            .execute(&mut *tx).await.map_err(|_| "No fue posible registrar el retorno de inventario.".to_string())?;
    }
    tx.commit().await.map_err(|_| "No fue posible confirmar la anulación.".to_string())?;
    refund_by_operation(&db.0, operation_id).await?.ok_or_else(|| "La devolución se registró, pero no se pudo recuperar.".into())
}
