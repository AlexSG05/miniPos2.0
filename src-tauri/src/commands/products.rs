
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tauri::State;

use crate::commands::auth::{require_role, AuthState};
use crate::infrastructure::database::Database;

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: i64,
    pub category_id: Option<i64>,
    pub category_name: Option<String>,
    pub internal_code: String,
    pub barcode: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub cost_cents: i64,
    pub price_cents: i64,
    pub stock_quantity: f64,
    pub min_stock: f64,
    pub unit: String,
    pub active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewProduct {
    pub category_id: Option<i64>,
    pub internal_code: String,
    pub barcode: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub cost_cents: i64,
    pub price_cents: i64,
    pub stock_quantity: f64,
    pub min_stock: f64,
    pub unit: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductUpdate {
    pub id: i64,
    pub category_id: Option<i64>,
    pub internal_code: String,
    pub barcode: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub cost_cents: i64,
    pub price_cents: i64,
    pub min_stock: f64,
    pub unit: String,
}

const PRODUCT_COLUMNS: &str = "
    id, category_id, (SELECT name FROM categories WHERE id = products.category_id) AS category_name,
    internal_code, barcode, name, description,
    cost_cents, price_cents, stock_quantity, min_stock, unit,
    active, created_at, updated_at
";

fn validate_product(product: &NewProduct) -> Result<(), String> {
    if product.internal_code.trim().is_empty() {
        return Err("El código interno es obligatorio.".into());
    }

    if product.name.trim().is_empty() {
        return Err("El nombre del producto es obligatorio.".into());
    }

    if product.internal_code.len() > 80 {
        return Err("El código interno no puede superar 80 caracteres.".into());
    }

    if product.name.len() > 160 {
        return Err("El nombre no puede superar 160 caracteres.".into());
    }

    if product.cost_cents < 0 || product.price_cents < 0 {
        return Err("El costo y el precio no pueden ser negativos.".into());
    }

    if !product.stock_quantity.is_finite()
        || !product.min_stock.is_finite()
        || product.stock_quantity < 0.0
        || product.min_stock < 0.0
    {
        return Err("Las existencias deben ser cantidades válidas y no negativas.".into());
    }

    if !matches!(
        product.unit.as_str(),
        "piece" | "kg" | "g" | "liter" | "ml"
    ) {
        return Err("La unidad de medida no es válida.".into());
    }

    let valid_precision = |quantity: f64| {
        (quantity * 1000.0).is_finite()
            && (quantity * 1000.0 - (quantity * 1000.0).round()).abs() < 0.000001
            && (product.unit != "piece" || (quantity - quantity.round()).abs() < 0.000001)
    };
    if !valid_precision(product.stock_quantity) || !valid_precision(product.min_stock) {
        return Err("Las existencias deben usar hasta tres decimales; las piezas deben ser enteras.".into());
    }

    Ok(())
}

#[tauri::command]
pub async fn list_products(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
    search: Option<String>,
    category_id: Option<i64>,
    include_inactive: bool,
) -> Result<Vec<Product>, String> {
    require_role(&auth, &session_token, &["admin", "cashier", "inventory"])?;
    let search = search
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());

    let sql = format!(
        "SELECT {PRODUCT_COLUMNS}
         FROM products
         WHERE (?2 IS NULL OR category_id = ?2)
         AND (?3 = 1 OR active = 1)
         AND (
             ?1 IS NULL
             OR name LIKE '%' || ?1 || '%'
             OR internal_code LIKE '%' || ?1 || '%'
             OR barcode LIKE '%' || ?1 || '%'
         )
         ORDER BY name COLLATE NOCASE ASC"
    );

    sqlx::query_as::<_, Product>(&sql)
        .bind(search)
        .bind(category_id)
        .bind(include_inactive)
        .fetch_all(&db.0)
        .await
        .map_err(|error| {
            eprintln!("Error consultando productos: {error}");
            "No fue posible consultar los productos.".to_string()
        })
}

#[tauri::command]
pub async fn create_product(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
    product: NewProduct,
) -> Result<Product, String> {
    require_role(&auth, &session_token, &["admin", "inventory"])?;
    validate_product(&product)?;

    let internal_code = product.internal_code.trim().to_owned();
    let name = product.name.trim().to_owned();
    let barcode = product
        .barcode
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());

    let description = product
        .description
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());

    let mut tx = db.0.begin().await.map_err(|error| {
        eprintln!("Error iniciando transacción: {error}");
        "No fue posible iniciar el registro del producto.".to_string()
    })?;

    let insert_result = sqlx::query(
        "INSERT INTO products (
            category_id, internal_code, barcode, name, description,
            cost_cents, price_cents, stock_quantity, min_stock, unit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(product.category_id)
    .bind(internal_code)
    .bind(barcode)
    .bind(name)
    .bind(description)
    .bind(product.cost_cents)
    .bind(product.price_cents)
    .bind(product.stock_quantity)
    .bind(product.min_stock)
    .bind(product.unit)
    .execute(&mut *tx)
    .await;

    let insert_result = match insert_result {
        Ok(result) => result,
        Err(error) => {
            eprintln!("Error insertando producto: {error}");

            let message = if error.to_string().contains("UNIQUE constraint failed") {
                "El código interno o el código de barras ya está registrado."
            } else {
                "No fue posible registrar el producto."
            };

            return Err(message.to_string());
        }
    };

    let product_id = insert_result.last_insert_rowid();

    if product.stock_quantity > 0.0 {
        sqlx::query(
            "INSERT INTO inventory_movements (
                product_id, movement_type, quantity, previous_quantity,
                new_quantity, reason
            ) VALUES (?, 'initial_stock', ?, 0, ?, 'Existencia inicial al crear producto')"
        )
        .bind(product_id)
        .bind(product.stock_quantity)
        .bind(product.stock_quantity)
        .execute(&mut *tx)
        .await
        .map_err(|error| {
            eprintln!("Error registrando existencia inicial: {error}");
            "No fue posible registrar el movimiento inicial de inventario.".to_string()
        })?;
    }

    let query = format!(
        "SELECT {PRODUCT_COLUMNS} FROM products WHERE id = ?"
    );

    let saved_product = sqlx::query_as::<_, Product>(&query)
        .bind(product_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|error| {
            eprintln!("Error recuperando producto creado: {error}");
            "El producto se registró, pero no se pudo recuperar.".to_string()
        })?;

    tx.commit().await.map_err(|error| {
        eprintln!("Error confirmando transacción: {error}");
        "No fue posible confirmar el registro del producto.".to_string()
    })?;

    Ok(saved_product)
}

#[tauri::command]
pub async fn update_product(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
    product: ProductUpdate,
) -> Result<Product, String> {
    require_role(&auth, &session_token, &["admin", "inventory"])?;
    let validation = NewProduct {
        category_id: product.category_id,
        internal_code: product.internal_code.clone(),
        barcode: product.barcode.clone(),
        name: product.name.clone(),
        description: product.description.clone(),
        cost_cents: product.cost_cents,
        price_cents: product.price_cents,
        stock_quantity: 0.0,
        min_stock: product.min_stock,
        unit: product.unit.clone(),
    };
    validate_product(&validation)?;
    if product.id <= 0 {
        return Err("El producto indicado no es válido.".into());
    }

    let result = sqlx::query(
        "UPDATE products SET category_id = ?, internal_code = ?, barcode = ?,
            name = ?, description = ?, cost_cents = ?, price_cents = ?,
            min_stock = ?, unit = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND active = 1"
    )
    .bind(product.category_id)
    .bind(product.internal_code.trim())
    .bind(product.barcode.map(|value| value.trim().to_owned()).filter(|value| !value.is_empty()))
    .bind(product.name.trim())
    .bind(product.description.map(|value| value.trim().to_owned()).filter(|value| !value.is_empty()))
    .bind(product.cost_cents)
    .bind(product.price_cents)
    .bind(product.min_stock)
    .bind(product.unit)
    .bind(product.id)
    .execute(&db.0)
    .await
    .map_err(|error| {
        eprintln!("Error actualizando producto: {error}");
        if error.to_string().contains("UNIQUE constraint failed") {
            "El código interno o el código de barras ya está registrado.".to_string()
        } else {
            "No fue posible actualizar el producto.".to_string()
        }
    })?;

    if result.rows_affected() == 0 {
        return Err("El producto no existe o está inactivo.".into());
    }
    sqlx::query_as::<_, Product>(&format!("SELECT {PRODUCT_COLUMNS} FROM products WHERE id = ?"))
        .bind(product.id)
        .fetch_one(&db.0)
        .await
        .map_err(|error| {
            eprintln!("Error recuperando producto actualizado: {error}");
            "No fue posible recuperar el producto actualizado.".to_string()
        })
}

#[tauri::command]
pub async fn set_product_active(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, product_id: i64, active: bool) -> Result<(), String> {
    require_role(&auth, &session_token, &["admin", "inventory"])?;
    if product_id <= 0 { return Err("El producto indicado no es válido.".into()); }
    let result = sqlx::query("UPDATE products SET active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
        .bind(active).bind(product_id).execute(&db.0).await
        .map_err(|_| "No fue posible cambiar el estado del producto.".to_string())?;
    if result.rows_affected() == 0 { return Err("El producto no existe.".into()); }
    Ok(())
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct InventoryMovement {
    pub id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub movement_type: String,
    pub quantity: f64,
    pub previous_quantity: f64,
    pub new_quantity: f64,
    pub reason: String,
    pub created_at: String,
}

#[tauri::command]
pub async fn list_inventory_movements(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
    product_id: Option<i64>,
) -> Result<Vec<InventoryMovement>, String> {
    require_role(&auth, &session_token, &["admin", "inventory"])?;
    sqlx::query_as::<_, InventoryMovement>(
        "SELECT m.id, m.product_id, p.name AS product_name, m.movement_type,
                m.quantity, m.previous_quantity, m.new_quantity, m.reason, m.created_at
         FROM inventory_movements m JOIN products p ON p.id = m.product_id
         WHERE (? IS NULL OR m.product_id = ?)
         ORDER BY m.created_at DESC, m.id DESC LIMIT 200"
    )
    .bind(product_id)
    .bind(product_id)
    .fetch_all(&db.0)
    .await
    .map_err(|error| {
        eprintln!("Error consultando movimientos de inventario: {error}");
        "No fue posible consultar los movimientos de inventario.".to_string()
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryAdjustment {
    pub product_id: i64,
    pub quantity: f64,
    pub reason: String,
    pub direction: String,
}

#[tauri::command]
pub async fn adjust_inventory(
    db: State<'_, Database>,
    auth: State<'_, AuthState>,
    session_token: String,
    adjustment: InventoryAdjustment,
) -> Result<Product, String> {
    require_role(&auth, &session_token, &["admin", "inventory"])?;
    if !adjustment.quantity.is_finite() || adjustment.quantity <= 0.0 || adjustment.quantity > i64::MAX as f64 / 1000.0 {
        return Err("La cantidad debe ser mayor que cero.".into());
    }
    if adjustment.reason.trim().is_empty() || adjustment.reason.trim().len() > 240 {
        return Err("Indica un motivo de hasta 240 caracteres.".into());
    }
    if !matches!(adjustment.direction.as_str(), "in" | "out") {
        return Err("El tipo de ajuste no es válido.".into());
    }

    let mut tx = db.0.begin().await.map_err(|_| "No fue posible iniciar el ajuste.".to_string())?;
    let current: Option<(f64, String)> = sqlx::query_as(
        "SELECT stock_quantity, unit FROM products WHERE id = ? AND active = 1"
    )
    .bind(adjustment.product_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_| "No fue posible validar las existencias.".to_string())?;
    let (previous, unit) = current.ok_or_else(|| "El producto no existe o está inactivo.".to_string())?;
    if !(adjustment.quantity * 1000.0).is_finite()
        || (adjustment.quantity * 1000.0 - (adjustment.quantity * 1000.0).round()).abs() >= 0.000001
        || (unit == "piece" && (adjustment.quantity - adjustment.quantity.round()).abs() >= 0.000001)
    {
        return Err("La cantidad admite hasta tres decimales; las piezas deben ser enteras.".into());
    }
    let new_quantity = if adjustment.direction == "in" {
        previous + adjustment.quantity
    } else {
        previous - adjustment.quantity
    };
    if !new_quantity.is_finite() || new_quantity < 0.0 {
        return Err("La salida supera las existencias disponibles.".into());
    }

    sqlx::query("UPDATE products SET stock_quantity = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
        .bind(new_quantity)
        .bind(adjustment.product_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| "No fue posible actualizar las existencias.".to_string())?;
    sqlx::query(
        "INSERT INTO inventory_movements (product_id, movement_type, quantity, previous_quantity, new_quantity, reason)
         VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(adjustment.product_id)
    .bind(if adjustment.direction == "in" { "purchase" } else { "manual_out" })
    .bind(adjustment.quantity)
    .bind(previous)
    .bind(new_quantity)
    .bind(adjustment.reason.trim())
    .execute(&mut *tx)
    .await
    .map_err(|_| "No fue posible guardar el movimiento de inventario.".to_string())?;

    let saved = sqlx::query_as::<_, Product>(&format!("SELECT {PRODUCT_COLUMNS} FROM products WHERE id = ?"))
        .bind(adjustment.product_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| "No fue posible recuperar el producto actualizado.".to_string())?;
    tx.commit().await.map_err(|_| "No fue posible confirmar el ajuste.".to_string())?;
    Ok(saved)
}
