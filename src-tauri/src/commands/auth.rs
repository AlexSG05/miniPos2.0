use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use serde::Serialize;
use sha2::Sha256;
use sqlx::FromRow;
use std::{collections::HashMap, sync::Mutex};
use tauri::State;

use crate::infrastructure::database::Database;

type HmacSha256 = Hmac<Sha256>;
const HASH_ROUNDS: u32 = 210_000;

#[derive(Clone, Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub role: String,
    pub active: bool,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub token: String,
    pub user: UserInfo,
}

#[derive(Clone)]
struct ActiveSession {
    user: UserInfo,
}

#[derive(Default)]
pub struct AuthState(Mutex<HashMap<String, ActiveSession>>);

pub fn require_role(state: &AuthState, token: &str, roles: &[&str]) -> Result<UserInfo, String> {
    let sessions = state.0.lock().map_err(|_| "No fue posible validar la sesión.".to_string())?;
    let session = sessions.get(token).ok_or_else(|| "Tu sesión venció. Inicia sesión de nuevo.".to_string())?;
    if !roles.contains(&session.user.role.as_str()) {
        return Err("Tu rol no tiene permiso para realizar esta operación.".into());
    }
    Ok(session.user.clone())
}

fn validate_credentials(username: &str, display_name: &str, password: &str) -> Result<(), String> {
    let username = username.trim();
    if !(3..=40).contains(&username.chars().count()) || !username.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')) {
        return Err("El usuario debe tener entre 3 y 40 caracteres (letras, números, punto, guion o guion bajo).".into());
    }
    if display_name.trim().is_empty() || display_name.trim().chars().count() > 120 {
        return Err("El nombre debe tener entre 1 y 120 caracteres.".into());
    }
    if password.chars().count() < 10 || password.chars().count() > 128 {
        return Err("La contraseña debe tener entre 10 y 128 caracteres.".into());
    }
    Ok(())
}

fn derive_password(password: &str, salt: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(password.as_bytes()).expect("HMAC acepta cualquier longitud de clave");
    mac.update(salt);
    mac.update(&1u32.to_be_bytes());
    let mut u = mac.finalize().into_bytes().to_vec();
    let mut output = u.clone();
    for _ in 1..HASH_ROUNDS {
        let mut mac = HmacSha256::new_from_slice(password.as_bytes()).expect("HMAC acepta cualquier longitud de clave");
        mac.update(&u);
        u = mac.finalize().into_bytes().to_vec();
        for (out, byte) in output.iter_mut().zip(&u) { *out ^= byte; }
    }
    output
}

fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut value = String::with_capacity(bytes.len() * 2);
    for byte in bytes { value.push(DIGITS[(byte >> 4) as usize] as char); value.push(DIGITS[(byte & 15) as usize] as char); }
    value
}

fn from_hex(value: &str) -> Option<Vec<u8>> {
    if value.len() % 2 != 0 { return None; }
    value.as_bytes().chunks_exact(2).map(|pair| {
        let digit = |b: u8| match b { b'0'..=b'9' => Some(b - b'0'), b'a'..=b'f' => Some(b - b'a' + 10), _ => None };
        Some((digit(pair[0])? << 4) | digit(pair[1])?)
    }).collect()
}

fn password_hash(password: &str) -> String {
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    format!("pbkdf2-sha256${}${}${}", HASH_ROUNDS, hex(&salt), hex(&derive_password(password, &salt)))
}

fn verify_password(password: &str, encoded: &str) -> bool {
    let mut parts = encoded.split('$');
    if parts.next() != Some("pbkdf2-sha256") || parts.next() != Some("210000") { return false; }
    let Some(salt) = parts.next().and_then(from_hex) else { return false; };
    let Some(expected) = parts.next().and_then(from_hex) else { return false; };
    if parts.next().is_some() { return false; }
    let actual = derive_password(password, &salt);
    if actual.len() != expected.len() { return false; }
    actual.iter().zip(expected).fold(0u8, |diff, (a, b)| diff | (a ^ b)) == 0
}

fn new_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    hex(&bytes)
}

async fn user_by_id(db: &sqlx::SqlitePool, id: i64) -> Result<UserInfo, String> {
    sqlx::query_as::<_, UserInfo>("SELECT id, username, display_name, role, active, created_at FROM users WHERE id = ?")
        .bind(id).fetch_one(db).await.map_err(|_| "No fue posible recuperar el usuario.".to_string())
}

#[tauri::command]
pub async fn auth_status(db: State<'_, Database>) -> Result<bool, String> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE active = 1").fetch_one(&db.0).await.map_err(|_| "No fue posible revisar la configuración de usuarios.".to_string())?;
    Ok(count == 0)
}

#[tauri::command]
pub async fn bootstrap_admin(db: State<'_, Database>, auth: State<'_, AuthState>, username: String, display_name: String, password: String) -> Result<SessionInfo, String> {
    validate_credentials(&username, &display_name, &password)?;
    let mut tx = db.0.begin().await.map_err(|_| "No fue posible iniciar la configuración de usuarios.".to_string())?;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users").fetch_one(&mut *tx).await.map_err(|_| "No fue posible revisar los usuarios.".to_string())?;
    if count != 0 { return Err("La configuración inicial ya se completó. Inicia sesión.".into()); }
    let result = sqlx::query("INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, 'admin')")
        .bind(username.trim()).bind(display_name.trim()).bind(password_hash(&password)).execute(&mut *tx).await
        .map_err(|_| "No fue posible crear el administrador inicial.".to_string())?;
    let id = result.last_insert_rowid();
    tx.commit().await.map_err(|_| "No fue posible guardar el administrador.".to_string())?;
    let user = user_by_id(&db.0, id).await?;
    let token = new_token();
    auth.0.lock().map_err(|_| "No fue posible iniciar la sesión del administrador.".to_string())?.insert(token.clone(), ActiveSession { user: user.clone() });
    Ok(SessionInfo { token, user })
}

#[tauri::command]
pub async fn login(db: State<'_, Database>, auth: State<'_, AuthState>, username: String, password: String) -> Result<SessionInfo, String> {
    let row: Option<(i64, String, String, String, String, bool, String)> = sqlx::query_as(
        "SELECT id, username, display_name, role, password_hash, active, created_at FROM users WHERE username = ? COLLATE NOCASE"
    ).bind(username.trim()).fetch_optional(&db.0).await.map_err(|_| "No fue posible consultar el usuario.".to_string())?;
    let Some((id, username, display_name, role, hash, active, created_at)) = row else { return Err("Usuario o contraseña incorrectos.".into()); };
    if !active || !verify_password(&password, &hash) { return Err("Usuario o contraseña incorrectos.".into()); }
    let user = UserInfo { id, username, display_name, role, active, created_at };
    let token = new_token();
    auth.0.lock().map_err(|_| "No fue posible iniciar la sesión.".to_string())?.insert(token.clone(), ActiveSession { user: user.clone() });
    Ok(SessionInfo { token, user })
}

#[tauri::command]
pub async fn current_user(auth: State<'_, AuthState>, session_token: String) -> Result<UserInfo, String> {
    Ok(require_role(&auth, &session_token, &["admin", "cashier", "inventory"])?)
}

#[tauri::command]
pub async fn logout(auth: State<'_, AuthState>, session_token: String) -> Result<(), String> {
    auth.0.lock().map_err(|_| "No fue posible cerrar la sesión.".to_string())?.remove(&session_token);
    Ok(())
}

#[tauri::command]
pub async fn list_users(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String) -> Result<Vec<UserInfo>, String> {
    require_role(&auth, &session_token, &["admin"])?;
    sqlx::query_as::<_, UserInfo>("SELECT id, username, display_name, role, active, created_at FROM users ORDER BY display_name COLLATE NOCASE")
        .fetch_all(&db.0).await.map_err(|_| "No fue posible consultar los usuarios.".to_string())
}

#[tauri::command]
pub async fn create_user(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, username: String, display_name: String, password: String, role: String) -> Result<UserInfo, String> {
    require_role(&auth, &session_token, &["admin"])?;
    validate_credentials(&username, &display_name, &password)?;
    if !matches!(role.as_str(), "admin" | "cashier" | "inventory") { return Err("El rol indicado no es válido.".into()); }
    let result = sqlx::query("INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)")
        .bind(username.trim()).bind(display_name.trim()).bind(password_hash(&password)).bind(role).execute(&db.0).await
        .map_err(|error| if error.to_string().contains("UNIQUE constraint failed") { "Ese nombre de usuario ya existe.".to_string() } else { "No fue posible crear el usuario.".to_string() })?;
    user_by_id(&db.0, result.last_insert_rowid()).await
}

#[tauri::command]
pub async fn set_user_active(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, user_id: i64, active: bool) -> Result<(), String> {
    let current = require_role(&auth, &session_token, &["admin"])?;
    if user_id <= 0 { return Err("El usuario indicado no es válido.".into()); }
    if current.id == user_id && !active { return Err("No puedes desactivar tu propia cuenta.".into()); }
    if !active {
        let role: Option<String> = sqlx::query_scalar("SELECT role FROM users WHERE id = ? AND active = 1").bind(user_id).fetch_optional(&db.0).await.map_err(|_| "No fue posible validar el usuario.".to_string())?;
        if role.as_deref() == Some("admin") {
            let admins: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1").fetch_one(&db.0).await.map_err(|_| "No fue posible validar los administradores.".to_string())?;
            if admins <= 1 { return Err("Debe permanecer al menos un administrador activo.".into()); }
        }
    }
    let result = sqlx::query("UPDATE users SET active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
        .bind(active).bind(user_id).execute(&db.0).await.map_err(|_| "No fue posible actualizar el usuario.".to_string())?;
    if result.rows_affected() == 0 { return Err("No se encontró el usuario.".into()); }
    if !active {
        let mut sessions = auth.0.lock().map_err(|_| "No fue posible invalidar las sesiones.".to_string())?;
        sessions.retain(|_, session| session.user.id != user_id);
    }
    Ok(())
}

#[tauri::command]
pub async fn set_user_role(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, user_id: i64, role: String) -> Result<(), String> {
    let current = require_role(&auth, &session_token, &["admin"])?;
    if current.id == user_id { return Err("No puedes cambiar tu propio rol.".into()); }
    if user_id <= 0 || !matches!(role.as_str(), "admin" | "cashier" | "inventory") { return Err("El usuario o el rol indicado no es válido.".into()); }
    let previous: Option<(String, bool)> = sqlx::query_as("SELECT role, active FROM users WHERE id = ?")
        .bind(user_id).fetch_optional(&db.0).await.map_err(|_| "No fue posible validar el usuario.".to_string())?;
    let Some((previous_role, active)) = previous else { return Err("No se encontró el usuario.".into()); };
    if active && previous_role == "admin" && role != "admin" {
        let admins: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1")
            .fetch_one(&db.0).await.map_err(|_| "No fue posible validar los administradores.".to_string())?;
        if admins <= 1 { return Err("Debe permanecer al menos un administrador activo.".into()); }
    }
    sqlx::query("UPDATE users SET role = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
        .bind(&role).bind(user_id).execute(&db.0).await.map_err(|_| "No fue posible cambiar el rol.".to_string())?;
    let mut sessions = auth.0.lock().map_err(|_| "No fue posible invalidar la sesión anterior.".to_string())?;
    sessions.retain(|_, session| session.user.id != user_id);
    Ok(())
}

#[tauri::command]
pub async fn reset_user_password(db: State<'_, Database>, auth: State<'_, AuthState>, session_token: String, user_id: i64, password: String) -> Result<(), String> {
    require_role(&auth, &session_token, &["admin"])?;
    if password.chars().count() < 10 || password.chars().count() > 128 { return Err("La contraseña debe tener entre 10 y 128 caracteres.".into()); }
    let result = sqlx::query("UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND active = 1")
        .bind(password_hash(&password)).bind(user_id).execute(&db.0).await.map_err(|_| "No fue posible actualizar la contraseña.".to_string())?;
    if result.rows_affected() == 0 { return Err("No se encontró un usuario activo.".into()); }
    let mut sessions = auth.0.lock().map_err(|_| "No fue posible invalidar sesiones anteriores.".to_string())?;
    sessions.retain(|_, session| session.user.id != user_id);
    Ok(())
}
