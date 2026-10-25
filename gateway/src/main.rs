//! CrushLearn AI gateway.
//!
//! A small server-side service that holds the provider key and turns
//! retrieval-verified source spans into a grounded answer with citations.
//!
//! The key lives only in this process's environment. It is never sent to the
//! browser, never written to disk, and never logged. The browser talks to this
//! service over loopback and sends spans it has already verified itself; the
//! client re-verifies every citation this service returns before it is shown.

mod budget;
mod config;
mod handlers;
mod protocol;
mod provider;
mod state;
mod webfetch;

use axum::http::{header, HeaderValue, Method};
use axum::routing::{get, post};
use axum::Router;
use tower_http::cors::CorsLayer;

use crate::config::GatewayConfig;
use crate::state::{AppState, SharedState};

#[tokio::main]
async fn main() {
    let config = GatewayConfig::from_env();

    let state = match AppState::new(config) {
        Ok(state) => SharedState::new(state),
        Err(error) => {
            eprintln!("crushlearn-gateway: could not start: {error}");
            std::process::exit(1);
        }
    };

    let address = state.config.bind_address();
    let cors = build_cors(&state.config);

    let app = Router::new()
        .route("/api/health", get(handlers::health))
        .route("/api/chat", post(handlers::chat))
        .route("/api/research", post(handlers::research))
        .route("/api/fetch", post(webfetch::fetch_url))
        .route("/api/session/reset", post(handlers::reset_session))
        .layer(cors)
        .with_state(state.clone());

    let listener = match tokio::net::TcpListener::bind(&address).await {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("crushlearn-gateway: could not bind {address}: {error}");
            std::process::exit(1);
        }
    };

    if state.config.provider_configured() {
        println!("crushlearn-gateway: listening on http://{address}");
        println!("crushlearn-gateway: model {}", state.config.model);
        println!("crushlearn-gateway: provider key is configured (server-side only)");
    } else {
        println!("crushlearn-gateway: listening on http://{address}");
        println!(
            "crushlearn-gateway: no ANTHROPIC_API_KEY set. The app will use its local extractive answers."
        );
    }

    if let Err(error) = axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
    {
        eprintln!("crushlearn-gateway: server error: {error}");
        std::process::exit(1);
    }
}

fn build_cors(config: &GatewayConfig) -> CorsLayer {
    let origins: Vec<HeaderValue> = config
        .allowed_origins
        .iter()
        .filter_map(|origin| origin.parse::<HeaderValue>().ok())
        .collect();

    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE, header::ACCEPT])
        .max_age(std::time::Duration::from_secs(600))
}

/// Stops the server on Ctrl+C.
async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut signal) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            signal.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }

    println!("crushlearn-gateway: shutting down");
}
