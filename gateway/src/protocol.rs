//! Wire protocol between the browser client and this gateway.
//!
//! The client sends spans that its own retrieval layer has already verified
//! against the stored source text. The gateway never retrieves: it cannot see
//! the source library, which lives in browser storage. The gateway's job is to
//! turn verified spans into an answer, and to hand back the spans it cited so
//! the client can verify them a second time before rendering.

use serde::{Deserialize, Serialize};

/// A source span the client has already verified against stored source text.
///
/// The field names are the camelCase ones the browser sends, so the wire
/// format matches the client exactly.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SourceSpan {
    /// Matches the client-side source id.
    #[serde(rename = "sourceId")]
    pub source_id: String,
    /// Display title, shown back to the learner.
    #[serde(rename = "sourceTitle", default)]
    pub source_title: String,
    /// The exact quoted passage.
    pub text: String,
    /// Character offset of `text` inside the stored source.
    pub start: usize,
    /// Character offset one past the end of `text`.
    pub end: usize,
    /// 1-based page number, when the source has page offsets.
    #[serde(default)]
    pub page: Option<u32>,
}

/// One citation in an answer.
///
/// Serialized in the shape the browser's `validateCitation` expects:
/// `sourceId`, `quote`, and a `locator` with a `kind`.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct Citation {
    pub source_id: String,
    pub quote: String,
    pub locator: Locator,
}

impl Serialize for Citation {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.to_client_json().serialize(serializer)
    }
}

impl Citation {
    /// Renders the citation in the shape the browser's `validateCitation`
    /// expects: `sourceId`, `quote`, and a `locator` with a `kind`.
    pub fn to_client_json(&self) -> serde_json::Value {
        serde_json::json!({
            "sourceId": self.source_id,
            "quote": self.quote,
            "locator": self.locator.to_json(),
        })
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Locator {
    Offset { start: usize, end: usize },
    Page { page: u32 },
}

impl Locator {
    /// Renders the locator the way the client-side `formatCitationLabel`
    /// expects, so the client can reuse its existing label helper.
    pub fn to_json(&self) -> serde_json::Value {
        match self {
            Locator::Offset { start, end } => {
                serde_json::json!({ "kind": "offset", "start": start, "end": end })
            }
            Locator::Page { page } => serde_json::json!({ "kind": "page", "page": page }),
        }
    }
}

/// A request to answer a question from verified spans.
#[derive(Clone, Debug, Deserialize)]
pub struct ChatRequest {
    pub question: String,
    #[serde(default)]
    pub spans: Vec<SourceSpan>,
    /// Conversation turns so far, for a GPT-like follow-up.
    #[serde(default)]
    pub history: Vec<HistoryTurn>,
    /// Identifies the spend bucket for the session token budget.
    #[serde(rename = "session_id", default)]
    pub session_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HistoryTurn {
    pub role: String,
    pub content: String,
}

/// A successful answer.
#[derive(Clone, Debug, Serialize)]
pub struct ChatResponse {
    pub ok: bool,
    pub answered: bool,
    pub answer: Option<String>,
    pub citations: Vec<Citation>,
    /// Which generator produced the answer. The client displays this.
    pub generator: String,
    pub model: String,
    pub note: String,
    pub usage: Usage,
    pub errors: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_input_tokens: u64,
    /// Estimated cost in US dollars for this request.
    pub cost_usd: f64,
    /// Tokens spent so far in this session, including this request.
    pub session_tokens: u64,
    /// The session token budget.
    pub session_budget: u64,
    /// True when the session has used its budget.
    pub session_budget_exceeded: bool,
}

/// A research operation request.
///
/// `operation` is one of `claims`, `rerank` or `conflicts`. The gateway only
/// rewrites or orders the verified spans the client supplied; it never fetches
/// or invents source text.
#[derive(Clone, Debug, Deserialize)]
pub struct ResearchRequest {
    pub question: String,
    #[serde(default)]
    pub spans: Vec<SourceSpan>,
    #[serde(default = "default_research_operation")]
    pub operation: String,
    #[serde(rename = "session_id", default)]
    pub session_id: Option<String>,
}

fn default_research_operation() -> String {
    "claims".to_string()
}

/// One model-written claim and the spans it cites.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct ResearchClaim {
    pub text: String,
    pub span_indexes: Vec<usize>,
}

/// One model-surfaced conflict signal. It is not a decision about which side
/// is correct.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct ResearchConflict {
    pub text: String,
    pub explanation: String,
    pub span_indexes: Vec<usize>,
}

/// A successful research response. Unused fields are omitted so the client
/// can branch on exactly the operation it requested.
#[derive(Clone, Debug, Serialize)]
pub struct ResearchResponse {
    pub ok: bool,
    pub operation: String,
    pub generator: String,
    pub model: String,
    pub note: String,
    pub usage: Usage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claims: Option<Vec<ResearchClaim>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<Vec<usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflicts: Option<Vec<ResearchConflict>>,
    pub errors: Vec<String>,
}

/// An error response. `code` lets the client branch without parsing prose.
#[derive(Clone, Debug, Serialize)]
pub struct ErrorResponse {
    pub ok: bool,
    pub code: String,
    pub errors: Vec<String>,
}

impl ErrorResponse {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            ok: false,
            code: code.to_string(),
            errors: vec![message.into()],
        }
    }
}

/// What `GET /api/health` reports. It never includes the key itself.
#[derive(Clone, Debug, Serialize)]
pub struct HealthResponse {
    pub ok: bool,
    pub service: String,
    pub provider_configured: bool,
    pub model: String,
    pub max_spans: usize,
    pub max_citations: usize,
    pub session_token_budget: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_request_without_spans_parses() {
        let request: ChatRequest =
            serde_json::from_str(r#"{"question":"What is photosynthesis?"}"#).unwrap();
        assert_eq!(request.question, "What is photosynthesis?");
        assert!(request.spans.is_empty());
        assert!(request.history.is_empty());
    }

    #[test]
    fn spans_parse_with_optional_title_and_page() {
        let request: ChatRequest = serde_json::from_str(
            r#"{
                "question":"chlorophyll",
                "spans":[
                    {"sourceId":"s1","text":"Chlorophyll absorbs light.","start":10,"end":35},
                    {"sourceId":"s2","sourceTitle":"Notes","text":"Page text.","start":0,"end":9,"page":3}
                ]
            }"#,
        )
        .unwrap();

        assert_eq!(request.spans.len(), 2);
        assert_eq!(request.spans[0].source_id, "s1");
        assert_eq!(request.spans[0].source_title, "");
        assert_eq!(request.spans[0].page, None);
        assert_eq!(request.spans[1].source_title, "Notes");
        assert_eq!(request.spans[1].page, Some(3));
    }

    #[test]
    fn a_request_uses_the_clients_camel_case_field_names() {
        let request: ChatRequest = serde_json::from_str(
            r#"{
                "question":"chlorophyll",
                "spans":[{"sourceId":"s1","sourceTitle":"Notes","text":"abc","start":0,"end":3}],
                "history":[{"role":"user","content":"earlier"}],
                "session_id":"user-1:notebook-1"
            }"#,
        )
        .unwrap();

        assert_eq!(request.spans[0].source_id, "s1");
        assert_eq!(request.spans[0].source_title, "Notes");
        assert_eq!(request.history.len(), 1);
        assert_eq!(request.session_id.as_deref(), Some("user-1:notebook-1"));
    }

    #[test]
    fn a_citation_serializes_in_the_shape_the_client_verifies() {
        let citation = Citation {
            source_id: "s1".to_string(),
            quote: "abc".to_string(),
            locator: Locator::Offset { start: 0, end: 3 },
        };

        assert_eq!(
            serde_json::to_value(&citation).unwrap(),
            serde_json::json!({
                "sourceId": "s1",
                "quote": "abc",
                "locator": { "kind": "offset", "start": 0, "end": 3 },
            })
        );
    }

    #[test]
    fn a_research_request_defaults_to_claims_and_reads_camel_case_spans() {
        let request: ResearchRequest = serde_json::from_str(
            r#"{
                "question":"compare the methods",
                "spans":[{"sourceId":"s1","sourceTitle":"Notes","text":"abc","start":0,"end":3}]
            }"#,
        )
        .unwrap();
        assert_eq!(request.operation, "claims");
        assert_eq!(request.spans[0].source_id, "s1");
        assert_eq!(request.spans[0].end, 3);
    }

    #[test]
    fn research_claims_serialize_with_span_indexes() {
        let response = ResearchResponse {
            ok: true,
            operation: "claims".to_string(),
            generator: "ai_grounded".to_string(),
            model: "test-model".to_string(),
            note: "checked".to_string(),
            usage: Usage::default(),
            claims: Some(vec![ResearchClaim {
                text: "Claim".to_string(),
                span_indexes: vec![0, 1],
            }]),
            order: None,
            reason: None,
            conflicts: None,
            errors: Vec::new(),
        };
        let json = serde_json::to_value(&response).unwrap();
        assert_eq!(json["claims"][0]["span_indexes"][1], 1);
        assert!(json.get("order").is_none());
    }

    #[test]
    fn locator_serializes_to_the_client_shape() {
        let locator = Locator::Offset { start: 4, end: 9 };
        assert_eq!(
            locator.to_json(),
            serde_json::json!({ "kind": "offset", "start": 4, "end": 9 })
        );
    }
}
