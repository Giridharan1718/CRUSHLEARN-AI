//! Gateway configuration, read from the process environment only.
//!
//! The provider key never leaves this process. It is not written to disk, not
//! returned by any endpoint, and not logged. The browser talks to this service
//! and never sees a credential.

/// Everything the gateway needs to run, resolved once at start-up.
#[derive(Clone, Debug)]
pub struct GatewayConfig {
    /// `ANTHROPIC_API_KEY`. `None` means the provider is not configured; the
    /// gateway still runs and still answers `/api/health`, but every chat
    /// request is refused with a clear error so the client can fall back.
    pub api_key: Option<String>,
    pub model: String,
    pub host: String,
    pub port: u16,
    /// Maximum number of verified spans the gateway will accept in one
    /// request. This is the per-request citation budget on the input side.
    pub max_spans: usize,
    /// Maximum number of spans one answer may cite.
    pub max_citations: usize,
    /// Maximum cumulative tokens a single session may spend.
    pub session_token_budget: u64,
    pub max_output_tokens: u32,
    /// `output_config.effort`. "low" keeps a grounded study answer cheap.
    pub effort: String,
    pub request_timeout_secs: u64,
    /// Origins allowed to call the gateway from a browser.
    pub allowed_origins: Vec<String>,
    /// Whether to send the server-side fallback parameters. A provider that
    /// does not know the beta rejects the request, so the gateway retries once
    /// without them before giving up.
    pub enable_server_side_fallback: bool,
    pub anthropic_base_url: String,
    /// Maximum bytes read from one web page. The reader stops at this cap and
    /// marks the result truncated rather than buffering an unbounded response.
    pub fetch_max_bytes: usize,
    /// Maximum characters of readable text returned to the browser.
    pub fetch_max_chars: usize,
    /// Timeout for one fetch hop, including DNS resolution and the body read.
    pub fetch_timeout_secs: u64,
    /// Maximum redirects followed. Every hop is re-validated.
    pub fetch_max_redirects: usize,
}

fn env_string(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn env_number<T: std::str::FromStr>(name: &str, fallback: T) -> T {
    env_string(name)
        .and_then(|value| value.parse::<T>().ok())
        .unwrap_or(fallback)
}

impl GatewayConfig {
    pub fn from_env() -> Self {
        let api_key = env_string("ANTHROPIC_API_KEY");
        let allowed_origins = env_string("GATEWAY_ALLOWED_ORIGINS")
            .map(|value| {
                value
                    .split(',')
                    .map(|origin| origin.trim().to_string())
                    .filter(|origin| !origin.is_empty())
                    .collect::<Vec<String>>()
            })
            .unwrap_or_else(|| {
                vec![
                    "http://localhost:5173".to_string(),
                    "http://127.0.0.1:5173".to_string(),
                ]
            });

        Self {
            api_key,
            model: env_string("GATEWAY_MODEL").unwrap_or_else(|| "claude-opus-5-5".to_string()),
            host: env_string("GATEWAY_HOST").unwrap_or_else(|| "127.0.0.1".to_string()),
            port: env_number("GATEWAY_PORT", 8787u16),
            max_spans: env_number("GATEWAY_MAX_SPANS", 12usize).clamp(1, 64),
            max_citations: env_number("GATEWAY_MAX_CITATIONS", 6usize).clamp(1, 32),
            session_token_budget: env_number("GATEWAY_SESSION_TOKEN_BUDGET", 200_000u64),
            max_output_tokens: env_number("GATEWAY_MAX_OUTPUT_TOKENS", 4096u32).clamp(256, 32_000),
            effort: env_string("GATEWAY_EFFORT").unwrap_or_else(|| "low".to_string()),
            request_timeout_secs: env_number("GATEWAY_REQUEST_TIMEOUT_SECS", 60u64).clamp(5, 600),
            allowed_origins,
            enable_server_side_fallback: env_string("GATEWAY_SERVER_SIDE_FALLBACK")
                .map(|value| value != "0" && value.to_lowercase() != "false")
                .unwrap_or(true),
            anthropic_base_url: env_string("ANTHROPIC_BASE_URL")
                .unwrap_or_else(|| "https://api.anthropic.com".to_string()),
            fetch_max_bytes: env_number("GATEWAY_FETCH_MAX_BYTES", 2 * 1024 * 1024)
                .clamp(64 * 1024, 10 * 1024 * 1024),
            fetch_max_chars: env_number("GATEWAY_FETCH_MAX_CHARS", 500_000)
                .clamp(10_000, 500_000),
            fetch_timeout_secs: env_number("GATEWAY_FETCH_TIMEOUT_SECS", 20u64)
                .clamp(5, 120),
            fetch_max_redirects: env_number("GATEWAY_FETCH_MAX_REDIRECTS", 5usize)
                .clamp(0, 10),
        }
    }

    /// True when a provider key is present, so the gateway can actually answer.
    pub fn provider_configured(&self) -> bool {
        self.api_key.is_some()
    }

    pub fn bind_address(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_conservative() {
        let config = GatewayConfig {
            api_key: None,
            model: "claude-opus-5-5".to_string(),
            host: "127.0.0.1".to_string(),
            port: 8787,
            max_spans: 12,
            max_citations: 6,
            session_token_budget: 200_000,
            max_output_tokens: 4096,
            effort: "low".to_string(),
            request_timeout_secs: 60,
            allowed_origins: vec![],
            enable_server_side_fallback: true,
            anthropic_base_url: "https://api.anthropic.com".to_string(),
            fetch_max_bytes: 2 * 1024 * 1024,
            fetch_max_chars: 500_000,
            fetch_timeout_secs: 20,
            fetch_max_redirects: 5,
        };

        assert!(!config.provider_configured());
        assert_eq!(config.bind_address(), "127.0.0.1:8787");
    }
}
