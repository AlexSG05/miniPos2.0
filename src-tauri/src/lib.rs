mod commands;
mod infrastructure;

use infrastructure::database::Database;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use std::{fs, str::FromStr};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_local_data_dir()?;
            fs::create_dir_all(&app_data_dir)?;
            let database_path = app_data_dir.join("minipos.sqlite3");

            let options = SqliteConnectOptions::from_str(
                &format!("sqlite://{}", database_path.to_string_lossy().replace('\\', "/"))
            )?
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(SqliteJournalMode::Wal);

            let pool = tauri::async_runtime::block_on(async move {
                let pool = SqlitePoolOptions::new()
                    .max_connections(5)
                    .connect_with(options)
                    .await?;
                sqlx::migrate!("./migrations").run(&pool).await?;
                Ok::<_, sqlx::Error>(pool)
            })?;

            app.manage(Database(pool));
            app.manage(commands::auth::AuthState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::auth_status,
            commands::auth::bootstrap_admin,
            commands::auth::login,
            commands::auth::current_user,
            commands::auth::logout,
            commands::auth::list_users,
            commands::auth::create_user,
            commands::auth::set_user_active,
            commands::auth::set_user_role,
            commands::auth::reset_user_password,
            commands::cash::get_open_cash_session,
            commands::cash::list_cash_closures,
            commands::cash::open_cash_session,
            commands::cash::close_cash_session,
            commands::cash::record_cash_movement,
            commands::sales::complete_sale,
            commands::sales::void_sale,
            commands::sales::list_recent_sales,
            commands::sales::get_sale_receipt,
            commands::sales::get_sales_report,
            commands::settings::get_business_settings,
            commands::settings::save_business_settings,
            commands::categories::list_categories,
            commands::categories::create_category,
            commands::categories::deactivate_category,
            commands::products::list_products,
            commands::products::create_product,
            commands::products::update_product,
            commands::products::set_product_active,
            commands::products::list_inventory_movements,
            commands::products::adjust_inventory
        ])
        .run(tauri::generate_context!())
        .expect("error while running MiniPOS");
}
