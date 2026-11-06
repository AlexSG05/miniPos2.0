use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tauri::State;

use crate::{commands::auth::{require_role, AuthState}, infrastructure::database::Database};

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Supplier {
    pub id: i64,
    pub name: String,
    pub tax_id: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub active: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewSupplier {
    pub name: String,
    pub tax_id: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
}

fn clean_optional(value: Option<String>, max: usize) -> Result<Option<String>, String> {
    let value = value.map(|v| v.trim().to_owned()).filter(|v| !v.is_empty());
    if value.as_ref().is_some_and(|v| v.chars().count() > max) {
        return Err("Uno de los datos del proveedor supera la longitud permitida.".into());
    }
    Ok(value)
}

#[tauri::command]
pub async fn list_suppliers(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String) -> Result<Vec<Supplier>, String> {
    require_role(&auth, &session_token, &["admin", "inventory"])?;
    sqlx::query_as::<_, Supplier>("SELECT id, name, tax_id, phone, email, address, active FROM suppliers WHERE active = 1 ORDER BY name COLLATE NOCASE")
        .fetch_all(&db.0).await.map_err(|_| "No fue posible consultar los proveedores.".into())
}

#[tauri::command]
pub async fn create_supplier(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, supplier: NewSupplier) -> Result<Supplier, String> {
    require_role(&auth, &session_token, &["admin", "inventory"])?;
    let name = supplier.name.trim();
    if name.is_empty() || name.chars().count() > 160 { return Err("El nombre del proveedor es obligatorio y admite hasta 160 caracteres.".into()); }
    let tax_id = clean_optional(supplier.tax_id, 32)?;
    let phone = clean_optional(supplier.phone, 40)?;
    let email = clean_optional(supplier.email, 160)?;
    let address = clean_optional(supplier.address, 240)?;
    let id = sqlx::query("INSERT INTO suppliers (name, tax_id, phone, email, address) VALUES (?, ?, ?, ?, ?)")
        .bind(name).bind(tax_id).bind(phone).bind(email).bind(address).execute(&db.0).await
        .map_err(|_| "No fue posible registrar el proveedor.".to_string())?.last_insert_rowid();
    sqlx::query_as::<_, Supplier>("SELECT id, name, tax_id, phone, email, address, active FROM suppliers WHERE id = ?")
        .bind(id).fetch_one(&db.0).await.map_err(|_| "No fue posible recuperar el proveedor.".into())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseLineInput { pub product_id: i64, pub quantity: f64, pub unit_cost_cents: i64 }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceivePurchaseInput {
    pub operation_id: String,
    pub supplier_id: i64,
    pub document_type: String,
    pub document_number: Option<String>,
    pub notes: Option<String>,
    pub items: Vec<PurchaseLineInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseReceipt { pub id: i64, pub subtotal_cents: i64, pub item_count: usize }

#[tauri::command]
pub async fn receive_purchase(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, purchase: ReceivePurchaseInput) -> Result<PurchaseReceipt, String> {
    require_role(&auth, &session_token, &["admin", "inventory"])?;
    if purchase.operation_id.trim().is_empty() || purchase.operation_id.len() > 100 { return Err("La operación de recepción no es válida.".into()); }
    if purchase.supplier_id <= 0 { return Err("Selecciona un proveedor válido.".into()); }
    if !matches!(purchase.document_type.as_str(), "invoice" | "note" | "other") { return Err("El tipo de documento no es válido.".into()); }
    if purchase.items.is_empty() || purchase.items.len() > 500 { return Err("Agrega al menos un producto a la recepción.".into()); }
    let document_number = clean_optional(purchase.document_number, 80)?;
    let notes = clean_optional(purchase.notes, 500)?;

    let mut tx = db.0.begin().await.map_err(|_| "No fue posible iniciar la recepción.".to_string())?;
    if let Some((id, subtotal_cents)) = sqlx::query_as::<_, (i64, i64)>("SELECT id, subtotal_cents FROM purchases WHERE operation_id = ?")
        .bind(purchase.operation_id.trim()).fetch_optional(&mut *tx).await.map_err(|_| "No fue posible validar la recepción.".to_string())? {
        tx.rollback().await.ok();
        return Ok(PurchaseReceipt { id, subtotal_cents, item_count: purchase.items.len() });
    }
    let supplier_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM suppliers WHERE id = ? AND active = 1)")
        .bind(purchase.supplier_id).fetch_one(&mut *tx).await.map_err(|_| "No fue posible validar el proveedor.".to_string())?;
    if !supplier_exists { return Err("El proveedor no existe o está inactivo.".into()); }

    let mut product_ids = std::collections::HashSet::new();
    let mut subtotal: i64 = 0;
    for item in &purchase.items {
        if item.product_id <= 0 || !product_ids.insert(item.product_id) { return Err("Cada producto debe aparecer una sola vez en la recepción.".into()); }
        if !item.quantity.is_finite() || item.quantity <= 0.0 || item.quantity > i64::MAX as f64 / 1000.0 || item.unit_cost_cents < 0 {
            return Err("Revisa las cantidades y los costos de los productos.".into());
        }
        let scaled = item.quantity * 1000.0;
        if (scaled - scaled.round()).abs() >= 0.000001 { return Err("Las cantidades admiten hasta tres decimales.".into()); }
        let unit: Option<String> = sqlx::query_scalar("SELECT unit FROM products WHERE id = ? AND active = 1")
            .bind(item.product_id).fetch_optional(&mut *tx).await.map_err(|_| "No fue posible validar un producto.".to_string())?;
        let Some(unit) = unit else { return Err("Uno de los productos no existe o está inactivo.".into()); };
        if unit == "piece" && (item.quantity - item.quantity.round()).abs() >= 0.000001 { return Err("Las cantidades de productos por pieza deben ser enteras.".into()); }
        let line = (item.quantity * item.unit_cost_cents as f64).round();
        if !line.is_finite() || line > i64::MAX as f64 || subtotal.checked_add(line as i64).is_none() { return Err("El total de la recepción supera el límite permitido.".into()); }
        subtotal += line as i64;
    }

    let purchase_id = sqlx::query("INSERT INTO purchases (operation_id, supplier_id, document_number, document_type, subtotal_cents, notes) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(purchase.operation_id.trim()).bind(purchase.supplier_id).bind(document_number).bind(&purchase.document_type).bind(subtotal).bind(notes)
        .execute(&mut *tx).await.map_err(|_| "No fue posible guardar la compra.".to_string())?.last_insert_rowid();

    for item in &purchase.items {
        let (stock, debt): (f64, f64) = sqlx::query_as("SELECT stock_quantity, stock_debt FROM products WHERE id = ?")
            .bind(item.product_id).fetch_one(&mut *tx).await.map_err(|_| "No fue posible leer las existencias.".to_string())?;
        let previous_net = stock - debt;
        let new_net = previous_net + item.quantity;
        if !new_net.is_finite() { return Err("El resultado de existencias no es válido.".into()); }
        let new_stock = new_net.max(0.0);
        let new_debt = (-new_net).max(0.0);
        let line_total = (item.quantity * item.unit_cost_cents as f64).round() as i64;
        sqlx::query("INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost_cents, line_total_cents) VALUES (?, ?, ?, ?, ?)")
            .bind(purchase_id).bind(item.product_id).bind(item.quantity).bind(item.unit_cost_cents).bind(line_total)
            .execute(&mut *tx).await.map_err(|_| "No fue posible guardar el detalle de compra.".to_string())?;
        sqlx::query("UPDATE products SET stock_quantity = ?, stock_debt = ?, cost_cents = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
            .bind(new_stock).bind(new_debt).bind(item.unit_cost_cents).bind(item.product_id)
            .execute(&mut *tx).await.map_err(|_| "No fue posible actualizar el producto.".to_string())?;
        sqlx::query("INSERT INTO inventory_movements (product_id, movement_type, quantity, previous_quantity, new_quantity, net_previous_quantity, net_new_quantity, reason, purchase_id) VALUES (?, 'purchase', ?, ?, ?, ?, ?, ?, ?)")
            .bind(item.product_id).bind(item.quantity).bind(stock).bind(new_stock).bind(previous_net).bind(new_net)
            .bind(format!("Recepción de compra #{}", purchase_id)).bind(purchase_id)
            .execute(&mut *tx).await.map_err(|_| "No fue posible registrar el movimiento de inventario.".to_string())?;
    }
    tx.commit().await.map_err(|_| "No fue posible confirmar la recepción.".to_string())?;
    Ok(PurchaseReceipt { id: purchase_id, subtotal_cents: subtotal, item_count: purchase.items.len() })
}
