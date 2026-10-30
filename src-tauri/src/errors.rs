use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    Database(String),
    Validation(String),
}

impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        Self::Database(error.to_string())
    }
}
