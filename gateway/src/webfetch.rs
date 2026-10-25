//! Server-side web-page fetching for notebook sources.
//!
//! The browser never fetches a learner-supplied URL directly. It sends the URL
//! here, and this module applies the protections a browser fetch cannot:
//!
//!   1. only `http` and `https` URLs, with no embedded credentials;
//!   2. DNS resolution on every redirect hop, rejecting loopback, private,
//!      link-local, multicast, documentation and otherwise non-public hosts;
//!   3. the resolved public address is pinned for the request, so a second DNS
//!      answer cannot turn an approved host into a private target;
//!   4. bounded redirects, time, bytes and returned characters;
//!   5. a small content-type allow-list; and
//!   6. readable-text extraction rather than returning raw HTML.
//!
//! It is deliberately not a general-purpose proxy. A URL that cannot be read
//! returns the real failure; it never becomes a successful empty source.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::extract::State;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use url::{Host, Url};

use crate::config::GatewayConfig;
use crate::handlers::{check_origin, error_response};
use crate::state::SharedState;

const USER_AGENT: &str =
    "CrushLearnAI/1.0 (+https://github.com/crushlearn; source reader; one page per request)";

#[derive(Clone, Debug, Deserialize)]
pub struct FetchRequest {
    pub url: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct FetchResponse {
    pub ok: bool,
    pub requested_url: String,
    pub final_url: String,
    pub fetched_at: String,
    pub title: String,
    pub text: String,
    pub content_type: String,
    pub bytes_read: usize,
    pub truncated: bool,
    pub redirects: Vec<String>,
    pub note: String,
}

#[derive(Debug)]
struct FetchError {
    status: StatusCode,
    code: &'static str,
    message: String,
}

impl FetchError {
    fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }

    fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, code, message)
    }

    fn bad_gateway(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_GATEWAY, code, message)
    }
}

struct Target {
    url: Url,
    host: String,
    addresses: Vec<SocketAddr>,
}

enum Hop {
    Redirect(String),
    Page {
        final_url: String,
        title: String,
        text: String,
        content_type: String,
        bytes_read: usize,
        truncated: bool,
    },
}

pub async fn fetch_url(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(request): Json<FetchRequest>,
) -> Response {
    if let Err(response) = check_origin(&state, &headers) {
        return response;
    }

    let raw = request.url.trim();
    if raw.is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "empty_url",
            "Enter a web page URL before adding the source.",
        );
    }

    match fetch_page(raw, &state.config).await {
        Ok(response) => Json(response).into_response(),
        Err(error) => error_response(error.status, error.code, error.message),
    }
}

async fn fetch_page(raw: &str, config: &GatewayConfig) -> Result<FetchResponse, FetchError> {
    let mut current = validate_url(raw)?;
    let mut redirects = Vec::new();

    for hop in 0..=config.fetch_max_redirects {
        let target = resolve_target(&current).await?;
        let result = fetch_hop(&target, config).await?;

        match result {
            Hop::Redirect(location) => {
                if hop >= config.fetch_max_redirects {
                    return Err(FetchError::bad_gateway(
                        "too_many_redirects",
                        format!(
                            "The page redirected more than {} times. It was not fetched.",
                            config.fetch_max_redirects
                        ),
                    ));
                }
                let next = current.join(&location).map_err(|error| {
                    FetchError::bad_gateway(
                        "invalid_redirect",
                        format!("The page returned an invalid redirect target: {error}"),
                    )
                })?;
                redirects.push(current.to_string());
                current = validate_url(next.as_str())?;
            }
            Hop::Page {
                final_url,
                title,
                text,
                content_type,
                bytes_read,
                truncated,
            } => {
                let title = if title.trim().is_empty() {
                    current
                        .host_str()
                        .unwrap_or("Web page")
                        .to_string()
                } else {
                    title
                };

                return Ok(FetchResponse {
                    ok: true,
                    requested_url: raw.to_string(),
                    final_url,
                    fetched_at: iso_timestamp(),
                    title: title.chars().take(200).collect(),
                    text,
                    content_type,
                    bytes_read,
                    truncated,
                    redirects,
                    note: "Fetched server-side by the CrushLearn gateway. The text was extracted from the page; the original URL and retrieval time are stored with the source.".to_string(),
                });
            }
        }
    }

    Err(FetchError::bad_gateway(
        "too_many_redirects",
        "The page redirected too many times. It was not fetched.",
    ))
}

fn validate_url(raw: &str) -> Result<Url, FetchError> {
    let url = Url::parse(raw).map_err(|error| {
        FetchError::bad_request(
            "invalid_url",
            format!("Enter a complete http:// or https:// URL. {error}"),
        )
    })?;

    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(FetchError::bad_request(
            "unsupported_scheme",
            "Only http:// and https:// URLs can be fetched.",
        ));
    }

    if !url.username().is_empty() || url.password().is_some() {
        return Err(FetchError::bad_request(
            "url_credentials_not_allowed",
            "URLs with embedded usernames or passwords are not accepted.",
        ));
    }

    let host = url.host_str().ok_or_else(|| {
        FetchError::bad_request("missing_host", "The URL does not name a host.")
    })?;
    let lower = host.to_ascii_lowercase();

    if lower == "localhost"
        || lower.ends_with(".localhost")
        || lower.ends_with(".local")
        || lower.ends_with(".internal")
        || lower.ends_with(".home.arpa")
    {
        return Err(FetchError::bad_request(
            "private_host",
            "URLs that point at the local machine or a private network are not accepted.",
        ));
    }

    if let Some(Host::Ipv4(address)) = url.host() {
        if !is_public_ipv4(address) {
            return Err(FetchError::bad_request(
                "private_host",
                "URLs that point at a private, loopback or link-local address are not accepted.",
            ));
        }
    }
    if let Some(Host::Ipv6(address)) = url.host() {
        if !is_public_ipv6(address) {
            return Err(FetchError::bad_request(
                "private_host",
                "URLs that point at a private, loopback or link-local address are not accepted.",
            ));
        }
    }

    Ok(url)
}

async fn resolve_target(url: &Url) -> Result<Target, FetchError> {
    let host = url
        .host_str()
        .ok_or_else(|| FetchError::bad_request("missing_host", "The URL does not name a host."))?
        .to_string();
    let port = url.port_or_known_default().unwrap_or(80);
    let addresses: Vec<SocketAddr> = tokio::net::lookup_host((host.as_str(), port))
        .await
        .map_err(|error| {
            FetchError::bad_gateway(
                "fetch_dns_failed",
                format!("The host \"{host}\" could not be resolved: {error}"),
            )
        })?
        .collect();

    if addresses.is_empty() {
        return Err(FetchError::bad_gateway(
            "fetch_dns_empty",
            format!("The host \"{host}\" did not resolve to an address."),
        ));
    }

    for address in &addresses {
        if !is_public_ip(address.ip()) {
            return Err(FetchError::bad_request(
                "private_host",
                format!(
                    "The host \"{host}\" resolves to a private or reserved address ({}) and was not fetched.",
                    address.ip()
                ),
            ));
        }
    }

    Ok(Target {
        url: url.clone(),
        host,
        addresses,
    })
}

async fn fetch_hop(target: &Target, config: &GatewayConfig) -> Result<Hop, FetchError> {
    let mut builder = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(config.fetch_timeout_secs))
        .connect_timeout(Duration::from_secs(config.fetch_timeout_secs.min(10)))
        .user_agent(USER_AGENT);

    // Pin the public addresses that were checked above. reqwest still uses the
    // host name for the Host header and TLS SNI, so a second DNS answer cannot
    // replace an approved address with a private one.
    if target.url.host().is_some_and(|host| !matches!(host, Host::Ipv4(_) | Host::Ipv6(_))) {
        builder = builder.resolve_to_addrs(&target.host, &target.addresses);
    }

    let client = builder.build().map_err(|error| {
        FetchError::bad_gateway(
            "fetch_client_failed",
            format!("The fetch client could not be created: {error}"),
        )
    })?;

    let response = client
        .get(target.url.clone())
        .header(
            header::ACCEPT,
            "text/html,application/xhtml+xml,text/plain;q=0.9,text/markdown;q=0.8",
        )
        .send()
        .await
        .map_err(|error| {
            FetchError::bad_gateway(
                "fetch_unreachable",
                format!("The page could not be reached: {error}"),
            )
        })?;

    let status = response.status();

    if status.is_redirection() {
        let location = response
            .headers()
            .get(header::LOCATION)
            .and_then(|value| value.to_str().ok())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                FetchError::bad_gateway(
                    "redirect_without_location",
                    format!("The page returned HTTP {status} without a Location header."),
                )
            })?;
        return Ok(Hop::Redirect(location.to_string()));
    }

    if !status.is_success() {
        return Err(FetchError::bad_gateway(
            "fetch_http_error",
            format!("The page returned HTTP {status}. It was not added as a source."),
        ));
    }

    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("text/html")
        .to_string();
    let media_type = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();

    if !matches!(
        media_type.as_str(),
        "text/html" | "application/xhtml+xml" | "text/plain" | "text/markdown"
    ) {
        return Err(FetchError::bad_gateway(
            "unsupported_content_type",
            format!(
                "The URL returned \"{}\". Only HTML, XHTML, plain text and Markdown pages can be read.",
                if media_type.is_empty() {
                    "an unknown content type"
                } else {
                    &media_type
                }
            ),
        ));
    }

    let declared_length = response
        .headers()
        .get(header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<usize>().ok());

    let mut bytes = Vec::new();
    let mut truncated = declared_length.is_some_and(|length| length > config.fetch_max_bytes);
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| {
            FetchError::bad_gateway(
                "fetch_unreadable",
                format!("The page body could not be read: {error}"),
            )
        })?;
        let remaining = config.fetch_max_bytes.saturating_sub(bytes.len());
        if chunk.len() > remaining {
            bytes.extend_from_slice(&chunk[..remaining]);
            truncated = true;
            break;
        }
        bytes.extend_from_slice(&chunk);
    }

    let body = String::from_utf8_lossy(&bytes);
    let (title, extracted) = if media_type == "text/plain" || media_type == "text/markdown" {
        (String::new(), normalize_readable_text(&body))
    } else {
        extract_html(&body)
    };

    let mut text = String::new();
    for character in extracted.chars().take(config.fetch_max_chars) {
        text.push(character);
    }
    if extracted.chars().count() > config.fetch_max_chars {
        truncated = true;
    }

    if text.trim().is_empty() {
        return Err(FetchError::bad_gateway(
            "no_readable_text",
            "The page was fetched, but no readable text was found. It was not added as a source.",
        ));
    }

    Ok(Hop::Page {
        final_url: target.url.to_string(),
        title,
        text,
        content_type: media_type,
        bytes_read: bytes.len(),
        truncated,
    })
}

fn extract_html(html: &str) -> (String, String) {
    let lower = html.to_ascii_lowercase();
    let bytes = html.as_bytes();
    let mut text = String::new();
    let mut title = String::new();
    let mut index = 0usize;

    while index < bytes.len() {
        if bytes[index] == b'<' {
            let Some(relative_end) = html[index..].find('>') else {
                break;
            };
            let end = index + relative_end;
            let tag = &html[index + 1..end];
            let tag_lower = tag.trim_start().to_ascii_lowercase();
            let tag_name = tag_lower
                .split_whitespace()
                .next()
                .unwrap_or("")
                .trim_start_matches('/')
                .trim_end_matches('/');

            if tag_lower.starts_with("!--") {
                if let Some(close) = lower[index + 4..].find("-->") {
                    index = index + 4 + close + 3;
                    continue;
                }
            }

            if is_skipped_element(tag_name) && !tag_lower.starts_with('/') {
                let closing = format!("</{tag_name}");
                if let Some(relative_close) = lower[index..].find(&closing) {
                    let close_start = index + relative_close;
                    if let Some(relative_close_end) = html[close_start..].find('>') {
                        index = close_start + relative_close_end + 1;
                        continue;
                    }
                }
            }

            if tag_lower.starts_with("title") && !tag_lower.starts_with("/title") {
                if let Some(relative_close) = lower[index..].find("</title") {
                    let content_start = end + 1;
                    let content_end = index + relative_close;
                    if content_end > content_start {
                        title = decode_entities(&html[content_start..content_end]);
                        title = normalize_readable_text(&title);
                    }
                    if let Some(relative_close_end) = html[content_end..].find('>') {
                        index = content_end + relative_close_end + 1;
                        continue;
                    }
                }
            }

            if is_block_element(tag_name) {
                push_newline(&mut text);
            }

            index = end + 1;
            continue;
        }

        let character = html[index..].chars().next().unwrap_or(' ');
        text.push(character);
        index += character.len_utf8();
    }

    (title, normalize_readable_text(&decode_entities(&text)))
}

fn is_skipped_element(name: &str) -> bool {
    matches!(
        name,
        "script" | "style" | "noscript" | "template" | "svg"
    )
}

fn is_block_element(name: &str) -> bool {
    matches!(
        name,
        "address"
            | "article"
            | "aside"
            | "blockquote"
            | "br"
            | "dd"
            | "div"
            | "dl"
            | "dt"
            | "fieldset"
            | "figcaption"
            | "figure"
            | "footer"
            | "form"
            | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "header"
            | "hr"
            | "li"
            | "main"
            | "nav"
            | "ol"
            | "p"
            | "pre"
            | "section"
            | "table"
            | "td"
            | "th"
            | "tr"
            | "ul"
    )
}

fn push_newline(output: &mut String) {
    if !output.ends_with('\n') {
        output.push('\n');
    }
}

fn normalize_readable_text(input: &str) -> String {
    let mut lines = Vec::new();
    for line in input.replace("\r\n", "\n").replace('\r', "\n").split('\n') {
        let collapsed = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if collapsed.is_empty() {
            if lines.last().is_some_and(|line: &String| !line.is_empty()) {
                lines.push(String::new());
            }
        } else {
            lines.push(collapsed);
        }
    }
    while lines.first().is_some_and(String::is_empty) {
        lines.remove(0);
    }
    while lines.last().is_some_and(String::is_empty) {
        lines.pop();
    }
    lines.join("\n")
}

fn decode_entities(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut rest = input;

    while let Some(position) = rest.find('&') {
        output.push_str(&rest[..position]);
        rest = &rest[position..];

        let end = match rest.find(';') {
            Some(end) if end <= 12 => end,
            _ => {
                output.push('&');
                rest = &rest[1..];
                continue;
            }
        };

        let entity = &rest[1..end];
        if let Some(value) = decode_entity(entity) {
            output.push_str(&value);
            rest = &rest[end + 1..];
        } else {
            output.push('&');
            rest = &rest[1..];
        }
    }

    output.push_str(rest);
    output
}

fn decode_entity(entity: &str) -> Option<String> {
    let named = match entity {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" | "#39" => Some('\''),
        "nbsp" => Some(' '),
        "ndash" => Some('–'),
        "mdash" => Some('—'),
        "hellip" => Some('…'),
        "rsquo" => Some('’'),
        "lsquo" => Some('‘'),
        "ldquo" => Some('“'),
        "rdquo" => Some('”'),
        _ => None,
    };
    if let Some(character) = named {
        return Some(character.to_string());
    }

    let number = if let Some(hex) = entity.strip_prefix("#x").or_else(|| entity.strip_prefix("#X")) {
        u32::from_str_radix(hex, 16).ok()?
    } else if let Some(decimal) = entity.strip_prefix('#') {
        decimal.parse::<u32>().ok()?
    } else {
        return None;
    };

    char::from_u32(number).map(|character| character.to_string())
}

/// Returns true only for globally routable IPv4 addresses.
pub fn is_public_ipv4(address: Ipv4Addr) -> bool {
    let [a, b, c, _d] = address.octets();
    !(a == 0
        || a == 10
        || a == 127
        || (a == 100 && (64..=127).contains(&b))
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && b == 0 && c == 0)
        || (a == 192 && b == 0 && c == 2)
        || (a == 192 && b == 168)
        || (a == 198 && (b == 18 || b == 19))
        || (a == 198 && b == 51 && c == 100)
        || (a == 203 && b == 0 && c == 113)
        || a >= 224)
}

/// Returns true only for globally routable IPv6 addresses. IPv4-mapped and
/// transition addresses are checked against the IPv4 rules as well.
pub fn is_public_ipv6(address: Ipv6Addr) -> bool {
    if address.is_unspecified()
        || address.is_loopback()
        || address.is_multicast()
        || address.segments()[0] & 0xffc0 == 0xfe80
        || address.segments()[0] & 0xffc0 == 0xfec0
        || address.segments()[0] & 0xfe00 == 0xfc00
        || (address.segments()[0] == 0x2001 && address.segments()[1] == 0x0db8)
    {
        return false;
    }

    if let Some(mapped) = address.to_ipv4_mapped() {
        return is_public_ipv4(mapped);
    }

    // 6to4 embeds an IPv4 address in the next two segments.
    if address.segments()[0] == 0x2002 {
        let embedded = Ipv4Addr::new(
            (address.segments()[1] >> 8) as u8,
            address.segments()[1] as u8,
            (address.segments()[2] >> 8) as u8,
            address.segments()[2] as u8,
        );
        return is_public_ipv4(embedded);
    }

    true
}

pub fn is_public_ip(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => is_public_ipv4(address),
        IpAddr::V6(address) => is_public_ipv6(address),
    }
}

/// A dependency-free UTC ISO-8601 timestamp. The gateway uses this so the
/// retrieval time is a real timestamp even when the provider is not configured.
fn iso_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += if month <= 2 { 1 } else { 0 };
    (year, month as u32, day as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_http_and_https_are_accepted() {
        assert!(validate_url("https://example.com/article").is_ok());
        assert!(validate_url("http://example.com").is_ok());
        for url in [
            "file:///etc/passwd",
            "ftp://example.com/file",
            "javascript:alert(1)",
            "data:text/html,hello",
        ] {
            let error = validate_url(url).unwrap_err();
            assert_eq!(error.code, "unsupported_scheme");
        }
    }

    #[test]
    fn credentials_and_local_hosts_are_rejected() {
        assert_eq!(
            validate_url("https://user:pass@example.com").unwrap_err().code,
            "url_credentials_not_allowed"
        );
        for url in [
            "http://localhost:8787/api/health",
            "http://app.localhost/",
            "http://printer.local/",
            "http://router.internal/",
        ] {
            assert_eq!(validate_url(url).unwrap_err().code, "private_host");
        }
    }

    #[test]
    fn private_and_reserved_literal_addresses_are_rejected() {
        for url in [
            "http://127.0.0.1/",
            "http://127.1.2.3/",
            "http://10.0.0.1/",
            "http://172.16.0.1/",
            "http://192.168.1.1/",
            "http://169.254.169.254/latest/meta-data/",
            "http://100.64.0.1/",
            "http://0.0.0.0/",
            "http://224.0.0.1/",
            "http://[::1]/",
            "http://[fe80::1]/",
            "http://[fc00::1]/",
            "http://[2001:db8::1]/",
        ] {
            assert_eq!(
                validate_url(url).unwrap_err().code,
                "private_host",
                "{url} should be rejected"
            );
        }
        assert!(validate_url("http://93.184.216.34/").is_ok());
    }

    #[test]
    fn address_classification_covers_the_common_ranges() {
        assert!(is_public_ip("93.184.216.34".parse().unwrap()));
        assert!(!is_public_ip("127.0.0.1".parse().unwrap()));
        assert!(!is_public_ip("10.1.2.3".parse().unwrap()));
        assert!(!is_public_ip("192.168.0.1".parse().unwrap()));
        assert!(!is_public_ip("169.254.169.254".parse().unwrap()));
        assert!(!is_public_ip("::1".parse().unwrap()));
        assert!(!is_public_ip("fe80::1".parse().unwrap()));
        assert!(!is_public_ip("fd00::1".parse().unwrap()));
    }

    #[test]
    fn html_extraction_keeps_readable_text_and_the_title() {
        let html = r#"
            <html>
              <head>
                <title>Photosynthesis &amp; light</title>
                <style>.hidden { display: none; }</style>
                <script>alert('not source text')</script>
              </head>
              <body>
                <nav>Home | About</nav>
                <article>
                  <h1>How leaves work</h1>
                  <p>Chlorophyll <strong>absorbs</strong> light.</p>
                  <p>It reflects green wavelengths.</p>
                </article>
                <noscript>Enable JavaScript.</noscript>
              </body>
            </html>
        "#;
        let (title, text) = extract_html(html);
        assert_eq!(title, "Photosynthesis & light");
        assert!(text.contains("How leaves work"));
        assert!(text.contains("Chlorophyll absorbs light."));
        assert!(text.contains("It reflects green wavelengths."));
        assert!(!text.contains("not source text"));
        assert!(!text.contains("Enable JavaScript"));
        assert!(!text.contains("display: none"));
        assert!(!text.contains("<strong>"));
    }

    #[test]
    fn entities_are_decoded_without_double_decoding() {
        assert_eq!(
            decode_entities("A &amp; B &lt; C &nbsp;&#169; &#x2014; &unknown;"),
            "A & B < C  © — &unknown;"
        );
    }

    #[test]
    fn whitespace_is_collapsed_but_paragraphs_remain() {
        let text = normalize_readable_text("  first   line\n\n\n second\tline \n");
        assert_eq!(text, "first line\n\nsecond line");
    }

    #[test]
    fn timestamps_are_iso_utc() {
        let value = iso_timestamp();
        assert_eq!(value.len(), 20);
        assert!(value.ends_with('Z'));
        assert_eq!(&value[4..5], "-");
        assert_eq!(&value[10..11], "T");
    }
}
