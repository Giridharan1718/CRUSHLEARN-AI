//! HTTP handlers.
//!
//! The gateway answers three routes:
//!   - `GET  /api/health` — is a provider configured, and with what limits?
//!   - `POST /api/chat`   — answer a question from verified spans.
//!   - `POST /api/session/reset` — forget a session's token spend.
//!
//! The gateway never retrieves. It receives spans the client has already
//! verified and returns an answer with citations the client verifies again.

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{json, Value};

use crate::provider;
use crate::protocol::{
    ChatRequest, ChatResponse, ErrorResponse, HealthResponse, ResearchRequest,
    ResearchResponse, SourceSpan,
};
use crate::state::SharedState;

/// The label the client shows so the learner knows which generator answered.
pub const GENERATOR_LABEL: &str = "ai_grounded";

pub async fn health(State(state): State<SharedState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        service: "crushlearn-gateway".to_string(),
        provider_configured: state.config.provider_configured(),
        model: state.config.model.clone(),
        max_spans: state.config.max_spans,
        max_citations: state.config.max_citations,
        session_token_budget: state.config.session_token_budget,
    })
}

pub(crate) fn error_response(status: StatusCode, code: &str, message: impl Into<String>) -> Response {
    (
        status,
        Json(ErrorResponse::new(code, message)),
    )
        .into_response()
}

/// Answers a question using the supplied verified spans.
pub async fn chat(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(request): Json<ChatRequest>,
) -> Response {
    if let Err(response) = check_origin(&state, &headers) {
        return response;
    }

    let Some(api_key) = state.config.api_key.clone() else {
        return error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            "provider_not_configured",
            "No provider key is configured on the gateway. The app should use its local extractive answers.",
        );
    };

    let question = request.question.trim();
    if question.is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "empty_question",
            "Enter a question before asking.",
        );
    }

    if request.spans.is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "no_spans",
            "No verified source passages were supplied. The app should use its local extractive answers.",
        );
    }

    if request.spans.len() > state.config.max_spans {
        return error_response(
            StatusCode::BAD_REQUEST,
            "too_many_spans",
            format!(
                "This request carries {} source passages. The gateway accepts at most {}.",
                request.spans.len(),
                state.config.max_spans
            ),
        );
    }

    if let Some(invalid) = invalid_span(&request.spans) {
        return error_response(StatusCode::BAD_REQUEST, "invalid_span", invalid);
    }

    let session_id = request
        .session_id
        .clone()
        .unwrap_or_else(|| "default".to_string());

    if state.budget.exceeded(&session_id) {
        return error_response(
            StatusCode::PAYMENT_REQUIRED,
            "session_budget_exceeded",
            format!(
                "This notebook has used its token budget of {} tokens. Reset the session to continue.",
                state.budget.budget()
            ),
        );
    }

    let body = provider::build_request_body(
        &state.config,
        question,
        &request.spans,
        &request.history,
    );

    let response = match call_provider(&state, &api_key, &body).await {
        Ok(value) => value,
        Err((code, message)) => return error_response(StatusCode::BAD_GATEWAY, &code, message),
    };

    if provider::is_refusal(&response) {
        return error_response(
            StatusCode::BAD_GATEWAY,
            "provider_refusal",
            "The provider declined to answer this request.",
        );
    }

    let Some(text) = provider::extract_text(&response) else {
        return error_response(
            StatusCode::BAD_GATEWAY,
            "empty_provider_answer",
            "The provider returned no answer text.",
        );
    };

    let mut usage = provider::parse_usage(&response);
    usage.cost_usd = provider::estimate_cost(&usage, &state.config.model);

    let parsed = match provider::parse_provider_answer(
        &text,
        &request.spans,
        state.config.max_citations,
    ) {
        Ok(parsed) => parsed,
        Err(error) => {
            return error_response(
                StatusCode::BAD_GATEWAY,
                &error.code,
                error.message,
            )
        }
    };

    let tokens = usage.input_tokens + usage.output_tokens;
    let session_tokens = state.budget.charge(&session_id, tokens);
    usage.session_tokens = session_tokens;
    usage.session_budget = state.budget.budget();
    usage.session_budget_exceeded = session_tokens >= state.budget.budget();

    let model = response
        .get("model")
        .and_then(Value::as_str)
        .unwrap_or(&state.config.model)
        .to_string();

    Json(ChatResponse {
        ok: true,
        answered: true,
        answer: Some(parsed.answer),
        citations: parsed.citations,
        generator: GENERATOR_LABEL.to_string(),
        model,
        note: "Answered by a model using the source passages shown below. Every citation is re-checked against the stored source text in your browser before it is shown.".to_string(),
        usage,
        errors: Vec::new(),
    })
    .into_response()
}

/// Runs one research operation over client-verified spans.
///
/// `claims` returns model-written claims with span indexes; `rerank` returns
/// only a new order of the supplied spans; `conflicts` returns model-surfaced
/// conflict signals with both sides cited. The client maps every index back to
/// its own verified span and re-checks each citation before display.
pub async fn research(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(request): Json<ResearchRequest>,
) -> Response {
    if let Err(response) = check_origin(&state, &headers) {
        return response;
    }

    let operation = request.operation.trim().to_ascii_lowercase();
    if !matches!(operation.as_str(), "claims" | "rerank" | "conflicts") {
        return error_response(
            StatusCode::BAD_REQUEST,
            "unsupported_research_operation",
            "The gateway supports the claims, rerank and conflicts research operations.",
        );
    }

    let Some(api_key) = state.config.api_key.clone() else {
        return error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            "provider_not_configured",
            "No provider key is configured on the gateway. The local research tools remain available.",
        );
    };

    let question = request.question.trim();
    if question.is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "empty_question",
            "Enter a research question before running this operation.",
        );
    }

    if request.spans.is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "no_spans",
            "No verified source passages were supplied. The local research tools remain available.",
        );
    }

    if request.spans.len() > state.config.max_spans {
        return error_response(
            StatusCode::BAD_REQUEST,
            "too_many_spans",
            format!(
                "This request carries {} source passages. The gateway accepts at most {}.",
                request.spans.len(),
                state.config.max_spans
            ),
        );
    }

    if let Some(invalid) = invalid_span(&request.spans) {
        return error_response(StatusCode::BAD_REQUEST, "invalid_span", invalid);
    }

    let session_id = request
        .session_id
        .clone()
        .unwrap_or_else(|| "default".to_string());

    if state.budget.exceeded(&session_id) {
        return error_response(
            StatusCode::PAYMENT_REQUIRED,
            "session_budget_exceeded",
            format!(
                "This notebook has used its token budget of {} tokens. Reset the session to continue.",
                state.budget.budget()
            ),
        );
    }

    let body = provider::build_research_body(
        &state.config,
        &operation,
        question,
        &request.spans,
    );

    let response = match call_provider(&state, &api_key, &body).await {
        Ok(value) => value,
        Err((code, message)) => return error_response(StatusCode::BAD_GATEWAY, &code, message),
    };

    if provider::is_refusal(&response) {
        return error_response(
            StatusCode::BAD_GATEWAY,
            "provider_refusal",
            "The provider declined this research request.",
        );
    }

    let Some(text) = provider::extract_text(&response) else {
        return error_response(
            StatusCode::BAD_GATEWAY,
            "empty_provider_answer",
            "The provider returned no research result.",
        );
    };

    let mut usage = provider::parse_usage(&response);
    usage.cost_usd = provider::estimate_cost(&usage, &state.config.model);

    let mut claims = None;
    let mut order = None;
    let mut reason = None;
    let mut conflicts = None;

    match operation.as_str() {
        "rerank" => match provider::parse_research_rerank(&text, &request.spans) {
            Ok((parsed_order, parsed_reason)) => {
                order = Some(parsed_order);
                reason = Some(parsed_reason);
            }
            Err(error) => {
                return error_response(StatusCode::BAD_GATEWAY, &error.code, error.message)
            }
        },
        "conflicts" => {
            match provider::parse_research_conflicts(
                &text,
                &request.spans,
                state.config.max_citations,
            ) {
                Ok(parsed) => conflicts = Some(parsed),
                Err(error) => {
                    return error_response(StatusCode::BAD_GATEWAY, &error.code, error.message)
                }
            }
        }
        _ => {
            match provider::parse_research_claims(
                &text,
                &request.spans,
                state.config.max_citations,
            ) {
                Ok(parsed) => claims = Some(parsed),
                Err(error) => {
                    return error_response(StatusCode::BAD_GATEWAY, &error.code, error.message)
                }
            }
        }
    }

    let tokens = usage.input_tokens + usage.output_tokens;
    let session_tokens = state.budget.charge(&session_id, tokens);
    usage.session_tokens = session_tokens;
    usage.session_budget = state.budget.budget();
    usage.session_budget_exceeded = session_tokens >= state.budget.budget();

    let model = response
        .get("model")
        .and_then(Value::as_str)
        .unwrap_or(&state.config.model)
        .to_string();

    Json(ResearchResponse {
        ok: true,
        operation,
        generator: GENERATOR_LABEL.to_string(),
        model,
        note: "Model output is grounded only in the source spans sent from this notebook. The browser maps every span index back and re-verifies each citation before showing it.".to_string(),
        usage,
        claims,
        order,
        reason,
        conflicts,
        errors: Vec::new(),
    })
    .into_response()
}

/// Forgets a session's token spend.
pub async fn reset_session(
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> Response {
    let session_id = body
        .get("session_id")
        .or_else(|| body.get("sessionId"))
        .and_then(Value::as_str)
        .unwrap_or("default");
    state.budget.reset(session_id);

    Json(json!({
        "ok": true,
        "sessionId": session_id,
        "session_tokens": 0,
        "session_budget": state.budget.budget(),
    }))
    .into_response()
}

/// Calls the provider, retrying once without the server-side fallback beta
/// when the provider does not recognise it.
async fn call_provider(
    state: &SharedState,
    api_key: &str,
    body: &Value,
) -> Result<Value, (String, String)> {
    let url = format!("{}/v1/messages", state.config.anthropic_base_url);

    let with_fallback = state.config.enable_server_side_fallback;
    let result = send_request(state, api_key, &url, body, with_fallback).await;

    match result {
        Ok(value) => Ok(value),
        Err((code, _message, status)) if with_fallback && status == Some(400) => {
            // The provider rejected the fallback beta. Retry once without it.
            send_request(state, api_key, &url, body, false)
                .await
                .map_err(|(_, retry_message, _)| (code, retry_message))
        }
        Err((code, message, _)) => Err((code, message)),
    }
}

async fn send_request(
    state: &SharedState,
    api_key: &str,
    url: &str,
    body: &Value,
    with_fallback: bool,
) -> Result<Value, (String, String, Option<u16>)> {
    let mut request = state.http.post(url).json(body);
    for (name, value) in provider::build_headers(api_key, with_fallback) {
        request = request.header(name, value);
    }

    let response = request.send().await.map_err(|error| {
        (
            "provider_unreachable".to_string(),
            format!("The provider could not be reached: {error}"),
            None,
        )
    })?;

    let status = response.status();
    let text = response.text().await.map_err(|error| {
        (
            "provider_unreadable".to_string(),
            format!("The provider response could not be read: {error}"),
            None,
        )
    })?;

    if !status.is_success() {
        return Err((
            "provider_error".to_string(),
            format!("The provider returned HTTP {status}: {}", truncate(&text, 400)),
            Some(status.as_u16()),
        ));
    }

    serde_json::from_str::<Value>(&text).map_err(|error| {
        (
            "provider_invalid_json".to_string(),
            format!("The provider response was not valid JSON: {error}"),
            None,
        )
    })
}

/// Rejects a span whose offsets do not match its own text.
///
/// The client already verified these against the stored source. Checking them
/// again here means a malformed or tampered request cannot make the gateway
/// quote text that no source actually contains.
///
/// The offsets are counted in UTF-16 code units, because that is what the
/// browser's `String.length` and `String.slice` use. Counting Unicode
/// scalars instead would reject a legitimate passage that contains an emoji
/// or any other character outside the basic multilingual plane.
fn invalid_span(spans: &[SourceSpan]) -> Option<String> {
    for span in spans {
        if span.text.trim().is_empty() {
            return Some("A source passage was empty.".to_string());
        }
        if span.end <= span.start {
            return Some("A source passage had an empty offset range.".to_string());
        }
        let utf16_length = span.text.chars().map(char::len_utf16).sum::<usize>();
        if span.end - span.start != utf16_length {
            return Some(format!(
                "The source passage from {} does not match its offset range.",
                span.source_id
            ));
        }
    }
    None
}

/// Checks the Origin header against the allowed list.
pub(crate) fn check_origin(state: &SharedState, headers: &HeaderMap) -> Result<(), Response> {
    let Some(origin) = headers.get("origin").and_then(|value| value.to_str().ok()) else {
        // A request without an Origin header is not a browser request. The
        // gateway is loopback-bound by default.
        return Ok(());
    };

    if state.config.allowed_origins.iter().any(|allowed| allowed == origin) {
        return Ok(());
    }

    Err(error_response(
        StatusCode::FORBIDDEN,
        "origin_not_allowed",
        format!("The origin {origin} is not allowed to call this gateway."),
    ))
}

fn truncate(value: &str, max: usize) -> String {
    if value.chars().count() <= max {
        return value.to_string();
    }
    value.chars().take(max).collect::<String>() + "..."
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::Locator;

    fn span(source_id: &str, text: &str, start: usize, end: usize) -> SourceSpan {
        SourceSpan {
            source_id: source_id.to_string(),
            source_title: "Notes".to_string(),
            text: text.to_string(),
            start,
            end,
            page: None,
        }
    }

    #[test]
    fn a_span_whose_offsets_disagree_with_its_text_is_rejected() {
        let spans = vec![span("s1", "Hello world", 0, 5)];
        let message = invalid_span(&spans).unwrap();
        assert!(message.contains("does not match its offset range"));
    }

    #[test]
    fn a_consistent_span_is_accepted() {
        let text = "Hello world";
        let spans = vec![span("s1", text, 0, text.len())];
        assert!(invalid_span(&spans).is_none());
    }

    #[test]
    fn an_empty_span_is_rejected() {
        let spans = vec![span("s1", "   ", 0, 3)];
        assert!(invalid_span(&spans).is_some());
    }

    #[test]
    fn a_span_containing_an_emoji_uses_utf16_offsets() {
        // The browser counts string offsets in UTF-16 code units, so an
        // emoji outside the basic multilingual plane takes two units.
        let spans = vec![span("s1", "🌱", 10, 12)];
        assert!(invalid_span(&spans).is_none());
    }

    #[test]
    fn a_span_with_unicode_scalar_offsets_is_rejected() {
        // Counting the emoji as one unit would leave a range that does not
        // match the text. The gateway must not accept it.
        let spans = vec![span("s1", "🌱", 10, 11)];
        assert!(invalid_span(&spans).is_some());
    }

    #[test]
    fn the_generator_label_marks_a_model_answer() {
        assert_eq!(GENERATOR_LABEL, "ai_grounded");
    }

    #[test]
    fn citations_carry_an_offset_locator() {
        let citation = crate::protocol::Citation {
            source_id: "s1".to_string(),
            quote: "text".to_string(),
            locator: Locator::Offset { start: 0, end: 4 },
        };
        assert_eq!(
            citation.locator.to_json(),
            json!({ "kind": "offset", "start": 0, "end": 4 })
        );
    }
}
