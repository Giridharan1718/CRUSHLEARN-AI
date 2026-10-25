//! Shared application state for the gateway.

use std::sync::Arc;

use crate::budget::BudgetTracker;
use crate::config::GatewayConfig;

pub struct AppState {
    pub config: GatewayConfig,
    pub budget: BudgetTracker,
    pub http: reqwest::Client,
}

pub type SharedState = Arc<AppState>;

impl AppState {
    pub fn new(config: GatewayConfig) -> anyhow_lite::Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(config.request_timeout_secs))
            .build()
            .map_err(|error| anyhow_lite::Error::new(error.to_string()))?;
        let budget = BudgetTracker::new(config.session_token_budget);

        Ok(Self {
            config,
            budget,
            http,
        })
    }
}

/// A minimal error type so the crate does not need a dependency just to carry
/// a message.
pub mod anyhow_lite {
    #[derive(Debug)]
    pub struct Error {
        message: String,
    }

    impl Error {
        pub fn new(message: impl Into<String>) -> Self {
            Self {
                message: message.into(),
            }
        }
    }

    impl std::fmt::Display for Error {
        fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            write!(formatter, "{}", self.message)
        }
    }

    impl std::error::Error for Error {}

    pub type Result<T> = std::result::Result<T, Error>;
}
