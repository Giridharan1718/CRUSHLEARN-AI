//! The Anthropic Messages API client.
//!
//! Rust has no official Anthropic SDK, so this calls the HTTP API directly.
//! The request is shaped so the provider returns a strict JSON object, and the
//! response is parsed defensively: a provider that returns prose instead of
//! JSON is a failure, not a silent empty answer.

use serde_json::{json, Value};

use crate::config::GatewayConfig;
use crate::protocol::{
    Citation, Locator, ResearchClaim, ResearchConflict, SourceSpan, Usage,
};

/// The answer shape the provider is asked to produce.
pub const ANSWER_SCHEMA: &str = r#"{
  "type": "object",
  "properties": {
    "answer": {
      "type": "string",
      "description": "The answer written for a learner, grounded in the supplied spans."
    },
    "citations": {
      "type": "array",
      "description": "The spans the answer relies on.",
      "items": {
        "type": "object",
        "properties": {
          "span_index": {
            "type": "integer",
            "description": "The index of the span in the supplied list, starting at 0."
          }
        },
        "required": ["span_index"],
        "additionalProperties": false
      }
    }
  },
  "required": ["answer", "citations"],
  "additionalProperties": false
}"#;

const SYSTEM_PROMPT: &str = "\
You are a study assistant for a learning app. You answer questions using only the \
source passages supplied in the user message. Every claim you make must be supported \
by one of those passages.

Rules:
- Cite the specific passage each claim comes from, using the span index shown before \
that passage.
- If the passages do not contain the answer, say that the sources do not cover it. Do \
not use outside knowledge, and do not guess.
- Keep the answer to the point: a few sentences, then a short note if the sources are \
partial or ambiguous.
- Write plainly for a learner. No preamble about being an AI model.";

/// Everything the provider call produced, before the client verifies it.
#[derive(Debug)]
pub struct ProviderAnswer {
    pub answer: String,
    pub citations: Vec<Citation>,
}

/// A provider call that did not produce a usable answer.
#[derive(Debug)]
pub struct ProviderError {
    pub code: String,
    pub message: String,
}

impl ProviderError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

/// Builds the source-passage block sent to the provider.
///
/// Each passage carries its index, so the model can cite a span by number
/// instead of inventing a quote.
pub fn build_source_block(spans: &[SourceSpan]) -> String {
    let mut block = String::new();
    for (index, span) in spans.iter().enumerate() {
        let title = if span.source_title.trim().is_empty() {
            "Untitled source"
        } else {
            span.source_title.trim()
        };
        let page = match span.page {
            Some(page) => format!(", page {page}"),
            None => String::new(),
        };
        block.push_str(&format!(
            "[span {index}] {title}{page} (characters {}-{})\n",
            span.start, span.end
        ));
        block.push_str(&format!("{}\n\n", span.text));
    }
    block
}

/// Builds the user message for one turn.
pub fn build_user_message(question: &str, spans: &[SourceSpan]) -> String {
    format!(
        "Source passages:\n\n{}\nQuestion: {}",
        build_source_block(spans),
        question.trim()
    )
}

/// Extracts the provider's answer and maps its span indices back to citations.
pub fn parse_provider_answer(
    raw: &str,
    spans: &[SourceSpan],
    max_citations: usize,
) -> Result<ProviderAnswer, ProviderError> {
    let parsed: Value = serde_json::from_str(raw)
        .map_err(|error| ProviderError::new("invalid_provider_json", format!(
            "The provider did not return a usable answer: {error}"
        )))?;

    let answer = parsed
        .get("answer")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            ProviderError::new("empty_answer", "The provider returned an empty answer.")
        })?;

    let mut citations = Vec::new();
    if let Some(items) = parsed.get("citations").and_then(Value::as_array) {
        for item in items {
            let index = match item.get("span_index").and_then(Value::as_u64) {
                Some(value) => value as usize,
                None => continue,
            };
            let Some(span) = spans.get(index) else {
                // The provider cited a span that does not exist. Drop it rather
                // than build a citation the client could not verify.
                continue;
            };
            if citations.iter().any(|existing: &Citation| {
                existing.source_id == span.source_id
                    && matches!(&existing.locator, Locator::Offset { start, end }
                        if *start == span.start && *end == span.end)
            }) {
                continue;
            }
            citations.push(Citation {
                source_id: span.source_id.clone(),
                quote: span.text.clone(),
                locator: Locator::Offset {
                    start: span.start,
                    end: span.end,
                },
            });
        }
    }

    citations.truncate(max_citations);

    Ok(ProviderAnswer {
        answer: answer.to_string(),
        citations,
    })
}

/// The schema for model-written claims. A claim may cite more than one span.
pub const CLAIMS_SCHEMA: &str = r#"{
  "type": "object",
  "properties": {
    "claims": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "text": { "type": "string" },
          "span_indexes": {
            "type": "array",
            "items": { "type": "integer" },
            "minItems": 1
          }
        },
        "required": ["text", "span_indexes"],
        "additionalProperties": false
      }
    }
  },
  "required": ["claims"],
  "additionalProperties": false
}"#;

/// The schema for reranking. It returns only indexes, never new source text.
pub const RERANK_SCHEMA: &str = r#"{
  "type": "object",
  "properties": {
    "order": {
      "type": "array",
      "items": { "type": "integer" },
      "minItems": 1
    },
    "reason": { "type": "string" }
  },
  "required": ["order", "reason"],
  "additionalProperties": false
}"#;

/// The schema for explicit conflict signals. The model does not decide which
/// side is correct; the client surfaces both quotations for inspection.
pub const CONFLICTS_SCHEMA: &str = r#"{
  "type": "object",
  "properties": {
    "conflicts": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "text": { "type": "string" },
          "explanation": { "type": "string" },
          "span_indexes": {
            "type": "array",
            "items": { "type": "integer" },
            "minItems": 2
          }
        },
        "required": ["text", "explanation", "span_indexes"],
        "additionalProperties": false
      }
    }
  },
  "required": ["conflicts"],
  "additionalProperties": false
}"#;

const CLAIMS_PROMPT: &str = "\
You break a research answer into atomic claims that are grounded in the supplied \
source passages.

Rules:
- Use only the supplied passages. Do not add outside knowledge.
- Each claim must cite one or more span indexes shown before the passages.
- Keep each claim short and factual. Do not merge unrelated points into one claim.
- If the passages do not support any claim, return an empty claims array.
- Do not decide which source is correct, and do not infer agreement.";

const RERANK_PROMPT: &str = "\
You rerank already-retrieved source passages by how directly they help answer the \
question.

Rules:
- Return span indexes only, most relevant first. Never invent passages or quotes.
- Rank every supplied passage when possible. A passage may be weak but still present.
- Give one short reason for the ordering.
- Do not use outside knowledge. Do not decide whether a passage is true.";

const CONFLICTS_PROMPT: &str = "\
You look for explicit disagreements between the supplied source passages.

Rules:
- Report a conflict only when two different passages assert opposing things.
- Merely different wording, emphasis or scope is not a conflict.
- Each conflict cites the indexes of both passages and states what each passage says.
- Never decide which passage is correct. Never use outside knowledge.
- If there is no explicit conflict, return an empty conflicts array.";

/// Builds the Messages API body for one research operation.
///
/// Unknown operations are rejected before this is called. The schema is
/// operation-specific so the model cannot return a shape the client cannot
/// verify.
pub fn build_research_body(
    config: &GatewayConfig,
    operation: &str,
    question: &str,
    spans: &[SourceSpan],
) -> Value {
    let (system, schema) = match operation {
        "rerank" => (RERANK_PROMPT, RERANK_SCHEMA),
        "conflicts" => (CONFLICTS_PROMPT, CONFLICTS_SCHEMA),
        _ => (CLAIMS_PROMPT, CLAIMS_SCHEMA),
    };
    let user = format!(
        "Source passages:\n\n{}\nResearch question: {}",
        build_source_block(spans),
        question.trim()
    );

    let mut body = json!({
        "model": config.model,
        "max_tokens": config.max_output_tokens,
        "system": system,
        "messages": [{ "role": "user", "content": user }],
        "output_config": {
            "effort": config.effort,
            "format": {
                "type": "json_schema",
                "schema": serde_json::from_str::<Value>(schema).unwrap_or(Value::Null),
            },
        },
    });

    if config.enable_server_side_fallback {
        body["fallbacks"] = json!("default");
    }
    body
}

/// Parses model claims and maps their span indexes to the supplied spans.
///
/// A claim with an out-of-range index keeps its text but loses that index, so
/// the client can show it as unsupported rather than silently dropping it.
pub fn parse_research_claims(
    raw: &str,
    spans: &[SourceSpan],
    max_claims: usize,
) -> Result<Vec<ResearchClaim>, ProviderError> {
    let parsed: Value = serde_json::from_str(raw).map_err(|error| {
        ProviderError::new(
            "invalid_provider_json",
            format!("The provider did not return usable claims: {error}"),
        )
    })?;
    let items = parsed
        .get("claims")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            ProviderError::new(
                "missing_claims",
                "The provider returned no claims array.",
            )
        })?;

    let mut claims = Vec::new();
    for item in items {
        let text = item
            .get("text")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let Some(text) = text else { continue };
        let mut span_indexes = Vec::new();
        if let Some(values) = item.get("span_indexes").and_then(Value::as_array) {
            for value in values {
                let Some(index) = value.as_u64().map(|number| number as usize) else {
                    continue;
                };
                if index < spans.len() && !span_indexes.contains(&index) {
                    span_indexes.push(index);
                }
            }
        }
        span_indexes.truncate(4);
        claims.push(ResearchClaim {
            text: text.to_string(),
            span_indexes,
        });
        if claims.len() >= max_claims {
            break;
        }
    }

    Ok(claims)
}

/// Parses a reranking order. Only indexes of supplied spans are accepted, and
/// duplicates are removed. The order may be partial; the client appends any
/// remaining results locally.
pub fn parse_research_rerank(
    raw: &str,
    spans: &[SourceSpan],
) -> Result<(Vec<usize>, String), ProviderError> {
    let parsed: Value = serde_json::from_str(raw).map_err(|error| {
        ProviderError::new(
            "invalid_provider_json",
            format!("The provider did not return a usable ordering: {error}"),
        )
    })?;
    let items = parsed
        .get("order")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            ProviderError::new(
                "missing_order",
                "The provider returned no ordering array.",
            )
        })?;
    let mut order = Vec::new();
    for value in items {
        let Some(index) = value.as_u64().map(|number| number as usize) else {
            continue;
        };
        if index < spans.len() && !order.contains(&index) {
            order.push(index);
        }
    }
    if order.is_empty() {
        return Err(ProviderError::new(
            "empty_order",
            "The provider returned no usable span indexes.",
        ));
    }
    let reason = parsed
        .get("reason")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("The provider did not give a reason for the ordering.")
        .to_string();
    Ok((order, reason))
}

/// Parses model-surfaced conflict signals. A conflict needs at least two
/// valid, distinct span indexes; anything less is dropped as unusable.
pub fn parse_research_conflicts(
    raw: &str,
    spans: &[SourceSpan],
    max_conflicts: usize,
) -> Result<Vec<ResearchConflict>, ProviderError> {
    let parsed: Value = serde_json::from_str(raw).map_err(|error| {
        ProviderError::new(
            "invalid_provider_json",
            format!("The provider did not return usable conflicts: {error}"),
        )
    })?;
    let items = parsed
        .get("conflicts")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            ProviderError::new(
                "missing_conflicts",
                "The provider returned no conflicts array.",
            )
        })?;

    let mut conflicts = Vec::new();
    for item in items {
        let text = item
            .get("text")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let explanation = item
            .get("explanation")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let (Some(text), Some(explanation)) = (text, explanation) else {
            continue;
        };
        let mut span_indexes = Vec::new();
        if let Some(values) = item.get("span_indexes").and_then(Value::as_array) {
            for value in values {
                let Some(index) = value.as_u64().map(|number| number as usize) else {
                    continue;
                };
                if index < spans.len() && !span_indexes.contains(&index) {
                    span_indexes.push(index);
                }
            }
        }
        if span_indexes.len() < 2 {
            continue;
        }
        conflicts.push(ResearchConflict {
            text: text.to_string(),
            explanation: explanation.to_string(),
            span_indexes,
        });
        if conflicts.len() >= max_conflicts {
            break;
        }
    }

    Ok(conflicts)
}

/// Reads the usage block from a Messages API response.
pub fn parse_usage(response: &Value) -> Usage {
    let usage = response.get("usage");
    let input_tokens = usage
        .and_then(|value| value.get("input_tokens"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let output_tokens = usage
        .and_then(|value| value.get("output_tokens"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let cached_input_tokens = usage
        .and_then(|value| value.get("cache_read_input_tokens"))
        .and_then(Value::as_u64)
        .unwrap_or(0);

    Usage {
        input_tokens,
        output_tokens,
        cached_input_tokens,
        cost_usd: 0.0,
        session_tokens: 0,
        session_budget: 0,
        session_budget_exceeded: false,
    }
}

/// The cost of a request, in US dollars.
///
/// Prices are per million tokens and are kept here so the cost meter does not
/// need a network call. Update these when the model or the price changes.
pub fn estimate_cost(usage: &Usage, model: &str) -> f64 {
    let (input_per_mtok, output_per_mtok) = price_per_mtok(model);
    let billable_input = usage.input_tokens.saturating_sub(usage.cached_input_tokens) as f64;
    (billable_input * input_per_mtok + usage.output_tokens as f64 * output_per_mtok) / 1_000_000.0
}

fn price_per_mtok(model: &str) -> (f64, f64) {
    match model {
        "claude-haiku-5-5" => (0.10, 0.50),
        "claude-haiku-4-5" => (1.00, 5.00),
        "claude-sonnet-5-5" | "claude-sonnet-5" => (2.00, 10.00),
        "claude-sonnet-4-6" => (3.00, 15.00),
        "claude-opus-4-6" | "claude-opus-4-7" | "claude-opus-4-8" => (5.00, 25.00),
        "claude-opus-5" => (5.00, 25.00),
        "claude-opus-5-5" => (4.00, 20.00),
        "claude-fable-5" | "claude-fable-5-1" => (10.00, 50.00),
        _ => (4.00, 20.00),
    }
}

/// Normalizes conversation turns into the alternating user/assistant sequence
/// the Messages API requires.
///
/// The API rejects a request whose roles do not alternate
/// (`messages: roles must alternate between "user" and "assistant"`), and it
/// rejects one that opens with an assistant turn. The client sends whatever
/// turns it has stored, so the gateway repairs the shape here rather than
/// making the client guess.
///
/// Consecutive turns with the same role are merged, which is what the API
/// would do with them anyway.
pub fn normalize_turns(turns: &[(String, String)]) -> Vec<(String, String)> {
    let mut normalized: Vec<(String, String)> = Vec::new();

    for (role, content) in turns {
        let role = if role == "assistant" {
            "assistant"
        } else {
            "user"
        };
        let content = content.trim();
        if content.is_empty() {
            continue;
        }

        // A leading assistant turn answers a question that is not in this
        // request, so it is dropped rather than answered.
        if normalized.is_empty() && role == "assistant" {
            continue;
        }

        match normalized.last_mut() {
            Some((last_role, last_content)) if last_role == role => {
                last_content.push_str("\n\n");
                last_content.push_str(content);
            }
            _ => normalized.push((role.to_string(), content.to_string())),
        }
    }

    normalized
}

/// Builds the Messages API request body.
pub fn build_request_body(
    config: &GatewayConfig,
    question: &str,
    spans: &[SourceSpan],
    history: &[crate::protocol::HistoryTurn],
) -> Value {
    // The current question is a user turn, and it goes last.
    let mut turns: Vec<(String, String)> = history
        .iter()
        .map(|turn| (turn.role.clone(), turn.content.clone()))
        .collect();
    turns.push((
        "user".to_string(),
        build_user_message(question, spans),
    ));

    let messages: Vec<Value> = normalize_turns(&turns)
        .into_iter()
        .map(|(role, content)| json!({ "role": role, "content": content }))
        .collect();

    let mut body = json!({
        "model": config.model,
        "max_tokens": config.max_output_tokens,
        "system": SYSTEM_PROMPT,
        "messages": messages,
        "output_config": {
            "effort": config.effort,
            "format": {
                "type": "json_schema",
                "schema": serde_json::from_str::<Value>(ANSWER_SCHEMA).unwrap_or(Value::Null),
            },
        },
    });

    // Claude Opus 5.5 and Sonnet 5.5 recommend opting into server-side
    // fallbacks by default so a safety decline is retried on another model
    // instead of surfacing as a dead end. The beta header and the parameter
    // are dropped automatically if the provider rejects them.
    if config.enable_server_side_fallback {
        body["fallbacks"] = json!("default");
    }

    body
}

/// The headers for a Messages API call.
pub fn build_headers(api_key: &str, with_fallback_beta: bool) -> Vec<(&'static str, String)> {
    let mut headers = vec![
        ("content-type", "application/json".to_string()),
        ("x-api-key", api_key.to_string()),
        ("anthropic-version", "2023-06-01".to_string()),
    ];
    if with_fallback_beta {
        headers.push((
            "anthropic-beta",
            "server-side-fallback-2026-07-01".to_string(),
        ));
    }
    headers
}

/// Pulls the assistant text out of a Messages API response.
pub fn extract_text(response: &Value) -> Option<String> {
    let content = response.get("content")?.as_array()?;
    let mut text = String::new();
    for block in content {
        if block.get("type").and_then(Value::as_str) == Some("text") {
            if let Some(value) = block.get("text").and_then(Value::as_str) {
                text.push_str(value);
            }
        }
    }
    if text.trim().is_empty() {
        None
    } else {
        Some(text)
    }
}

/// True when the provider declined the request for safety reasons.
pub fn is_refusal(response: &Value) -> bool {
    response.get("stop_reason").and_then(Value::as_str) == Some("refusal")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn span(index: usize) -> SourceSpan {
        SourceSpan {
            source_id: format!("source-{index}"),
            source_title: format!("Source {index}"),
            text: format!("Passage {index} text."),
            start: index * 100,
            end: index * 100 + 17,
            page: Some(2),
        }
    }

    #[test]
    fn the_source_block_numbers_every_span() {
        let block = build_source_block(&[span(0), span(1)]);
        assert!(block.contains("[span 0]"));
        assert!(block.contains("[span 1]"));
        assert!(block.contains("characters 0-17"));
        assert!(block.contains("characters 100-117"));
    }

    #[test]
    fn a_provider_citation_maps_back_to_the_span_offsets() {
        let spans = vec![span(0), span(1)];
        let raw = r#"{"answer":"Photosynthesis uses light.","citations":[{"span_index":1}]}"#;
        let parsed = parse_provider_answer(raw, &spans, 6).unwrap();

        assert_eq!(parsed.answer, "Photosynthesis uses light.");
        assert_eq!(parsed.citations.len(), 1);
        assert_eq!(parsed.citations[0].source_id, "source-1");
        assert_eq!(
            parsed.citations[0].locator,
            Locator::Offset {
                start: 100,
                end: 117
            }
        );
    }

    #[test]
    fn a_citation_for_an_unknown_span_is_dropped() {
        let spans = vec![span(0)];
        let raw = r#"{"answer":"Answer.","citations":[{"span_index":7}]}"#;
        let parsed = parse_provider_answer(raw, &spans, 6).unwrap();
        assert!(parsed.citations.is_empty());
    }

    #[test]
    fn the_citation_budget_is_enforced() {
        let spans: Vec<SourceSpan> = (0..10).map(span).collect();
        let raw = r#"{"answer":"Answer.","citations":[
            {"span_index":0},{"span_index":1},{"span_index":2},{"span_index":3},
            {"span_index":4},{"span_index":5},{"span_index":6}]}"#;
        let parsed = parse_provider_answer(raw, &spans, 3).unwrap();
        assert_eq!(parsed.citations.len(), 3);
    }

    #[test]
    fn prose_instead_of_json_is_an_error_not_an_answer() {
        let spans = vec![span(0)];
        let error = parse_provider_answer("Sure! Here is the answer.", &spans, 6).unwrap_err();
        assert_eq!(error.code, "invalid_provider_json");
    }

    #[test]
    fn an_empty_answer_is_rejected() {
        let spans = vec![span(0)];
        let error = parse_provider_answer(r#"{"answer":"  ","citations":[]}"#, &spans, 6).unwrap_err();
        assert_eq!(error.code, "empty_answer");
    }

    #[test]
    fn a_refusal_is_detected() {
        assert!(is_refusal(&json!({ "stop_reason": "refusal" })));
        assert!(!is_refusal(&json!({ "stop_reason": "end_turn" })));
    }

    #[test]
    fn cost_is_computed_from_the_model_price() {
        let usage = Usage {
            input_tokens: 1_000_000,
            output_tokens: 1_000_000,
            ..Usage::default()
        };
        let cost = estimate_cost(&usage, "claude-opus-5-5");
        assert!((cost - 24.0).abs() < 0.0001);
    }

    #[test]
    fn the_request_body_carries_effort_and_the_json_schema() {
        let config = GatewayConfig::from_env();
        let body = build_request_body(&config, "What is this?", &[span(0)], &[]);
        assert_eq!(body["output_config"]["effort"], config.effort);
        assert_eq!(
            body["output_config"]["format"]["type"],
            json!("json_schema")
        );
        assert!(body["messages"].as_array().unwrap().len() == 1);
    }

    fn roles_of(body: &Value) -> Vec<String> {
        body["messages"]
            .as_array()
            .unwrap()
            .iter()
            .map(|message| message["role"].as_str().unwrap_or_default().to_string())
            .collect()
    }

    #[test]
    fn the_messages_alternate_between_user_and_assistant() {
        // The API rejects a request whose roles do not alternate.
        let history = vec![
            crate::protocol::HistoryTurn {
                role: "user".to_string(),
                content: "tell me about plants".to_string(),
            },
            crate::protocol::HistoryTurn {
                role: "assistant".to_string(),
                content: "Plants make their own food.".to_string(),
            },
        ];

        let config = GatewayConfig::from_env();
        let body = build_request_body(&config, "What does chlorophyll do?", &[span(0)], &history);

        assert_eq!(roles_of(&body), vec!["user", "assistant", "user"]);
    }

    #[test]
    fn two_learner_turns_in_a_row_are_merged() {
        // The client stores a learner turn and an answer turn, but a turn can
        // also follow a turn the app could not answer. Two user turns in a row
        // would be rejected by the API.
        let history = vec![
            crate::protocol::HistoryTurn {
                role: "user".to_string(),
                content: "first question".to_string(),
            },
            crate::protocol::HistoryTurn {
                role: "user".to_string(),
                content: "second question".to_string(),
            },
        ];

        let config = GatewayConfig::from_env();
        let body = build_request_body(&config, "third question", &[span(0)], &history);

        assert_eq!(roles_of(&body), vec!["user"]);
        assert!(body["messages"][0]["content"]
            .as_str()
            .unwrap()
            .contains("first question"));
    }

    #[test]
    fn a_leading_assistant_turn_is_dropped() {
        // An assistant turn with no question before it answers something the
        // request never asked. The API also rejects a request that opens with
        // an assistant turn.
        let history = vec![crate::protocol::HistoryTurn {
            role: "assistant".to_string(),
            content: "Plants make their own food.".to_string(),
        }];

        let config = GatewayConfig::from_env();
        let body = build_request_body(&config, "What does chlorophyll do?", &[span(0)], &history);

        assert_eq!(roles_of(&body), vec!["user"]);
    }

    #[test]
    fn a_history_that_ends_in_an_assistant_turn_still_ends_with_the_question() {
        let history = vec![
            crate::protocol::HistoryTurn {
                role: "user".to_string(),
                content: "first question".to_string(),
            },
            crate::protocol::HistoryTurn {
                role: "assistant".to_string(),
                content: "an answer".to_string(),
            },
        ];

        let config = GatewayConfig::from_env();
        let body = build_request_body(&config, "follow-up question", &[span(0)], &history);

        let roles = roles_of(&body);
        assert_eq!(roles, vec!["user", "assistant", "user"]);
        assert_eq!(*roles.last().unwrap(), "user");
    }

    #[test]
    fn claims_keep_their_text_and_drop_out_of_range_span_indexes() {
        let spans = vec![span(0), span(1)];
        let raw = r#"{"claims":[
            {"text":"First claim.","span_indexes":[0,1]},
            {"text":"Second claim.","span_indexes":[9]},
            {"text":"  ","span_indexes":[0]}
        ]}"#;
        let claims = parse_research_claims(raw, &spans, 6).unwrap();
        assert_eq!(claims.len(), 2);
        assert_eq!(claims[0].span_indexes, vec![0, 1]);
        assert!(claims[1].span_indexes.is_empty());
    }

    #[test]
    fn rerank_order_drops_invalid_indexes_and_duplicates() {
        let spans = vec![span(0), span(1)];
        let raw = r#"{"order":[1,1,4,0],"reason":"Second is more direct."}"#;
        let (order, reason) = parse_research_rerank(raw, &spans).unwrap();
        assert_eq!(order, vec![1, 0]);
        assert_eq!(reason, "Second is more direct.");
    }

    #[test]
    fn rerank_with_no_usable_indexes_is_an_error() {
        let spans = vec![span(0)];
        let error = parse_research_rerank(r#"{"order":[4],"reason":"none"}"#, &spans).unwrap_err();
        assert_eq!(error.code, "empty_order");
    }

    #[test]
    fn a_conflict_needs_two_valid_distinct_span_indexes() {
        let spans = vec![span(0), span(1)];
        let raw = r#"{"conflicts":[
            {"text":"Opposing findings","explanation":"One says up, one says down.","span_indexes":[0,1]},
            {"text":"Invalid","explanation":"Only one span.","span_indexes":[0]},
            {"text":"Invalid too","explanation":"Out of range.","span_indexes":[0,9]}
        ]}"#;
        let conflicts = parse_research_conflicts(raw, &spans, 4).unwrap();
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].span_indexes, vec![0, 1]);
    }

    #[test]
    fn a_research_body_uses_the_operation_specific_schema() {
        let config = GatewayConfig::from_env();
        let claims = build_research_body(&config, "claims", "question", &[span(0)]);
        let rerank = build_research_body(&config, "rerank", "question", &[span(0)]);
        assert!(claims["output_config"]["format"]["schema"]
            .get("properties")
            .unwrap()
            .get("claims")
            .is_some());
        assert!(rerank["output_config"]["format"]["schema"]
            .get("properties")
            .unwrap()
            .get("order")
            .is_some());
    }
}
