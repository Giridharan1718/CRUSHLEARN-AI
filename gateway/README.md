# CrushLearn AI gateway

A small server-side service that holds the model provider key and turns
retrieval-verified source passages into a grounded answer with citations.

It is written in Rust. It is an **optional** part of the app: when it is not
running, the app falls back to its local extractive answers and says so.

## Why the key is here and not in the browser

The browser talks to this service over loopback. The provider key lives only
in this process's environment. It is never written to disk, never returned by
any endpoint, and never logged.

The key must **not** be a `VITE_`-prefixed variable. Vite inlines every
`import.meta.env.VITE_*` value into the client bundle, which would ship the
key to every browser that loads the page.

## What the gateway does and does not do

| | |
|---|---|
| **Does** | Hold the provider key, call the provider, enforce a citation budget and a per-session token budget, report a cost meter, and return an answer with offset citations. |
| **Does not** | Retrieve. It cannot. The source library lives in the browser's `localStorage`, so the server has never seen it. |
| **Does not** | Trust itself. Every citation it returns is re-verified in the browser against the stored source text before it is shown. |

The flow is:

```
browser  →  searchNotebookSources + validateCitation   (retrieval, local)
         →  POST /api/chat  with verified spans only    (the gateway)
         →  answer + offset citations                   (the gateway)
         →  validateCitation again                      (verification, local)
         →  render, or fall back to the extractive answer
```

## Running it

```bash
cd gateway
cargo run --release
```

The service listens on `http://127.0.0.1:8787` by default.

The key is read from the environment:

```bash
# macOS / Linux
export ANTHROPIC_API_KEY="sk-ant-..."
cargo run --release

# Windows PowerShell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
cargo run --release
```

With no key set the gateway still starts and still answers `/api/health`. It
reports `provider_configured: false`, and the app uses its local extractive
answers.

### From the app

The dev server proxies `/api` to the gateway, so the browser calls a
same-origin path and the key never enters the bundle:

```bash
npm run dev            # the app
npm run dev:gateway    # the gateway, in a second terminal
```

## Configuration

Every setting has a default. Set them in the environment of the gateway
process.

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(unset)* | The provider key. Server-side only. |
| `GATEWAY_HOST` | `127.0.0.1` | Bind address. |
| `GATEWAY_PORT` | `8787` | Bind port. |
| `GATEWAY_MODEL` | `claude-opus-5-5` | The model to call. |
| `GATEWAY_EFFORT` | `low` | `output_config.effort`. `low` keeps a grounded study answer cheap. |
| `GATEWAY_MAX_SPANS` | `12` | Maximum source passages accepted per request. |
| `GATEWAY_MAX_CITATIONS` | `6` | Maximum spans one answer may cite. |
| `GATEWAY_SESSION_TOKEN_BUDGET` | `200000` | Tokens one session may spend before the gateway refuses further calls. |
| `GATEWAY_MAX_OUTPUT_TOKENS` | `4096` | `max_tokens` for the provider call. |
| `GATEWAY_REQUEST_TIMEOUT_SECS` | `60` | Provider request timeout. |
| `GATEWAY_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated origins allowed to call the gateway. |
| `GATEWAY_SERVER_SIDE_FALLBACK` | `true` | Send the server-side fallback beta. Retried without it if the provider rejects it. |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Provider base URL. |

## API

### `GET /api/health`

```json
{
  "ok": true,
  "service": "crushlearn-gateway",
  "provider_configured": true,
  "model": "claude-opus-5-5",
  "max_spans": 12,
  "max_citations": 6,
  "session_token_budget": 200000
}
```

### `POST /api/chat`

Request:

```json
{
  "question": "What does chlorophyll absorb?",
  "spans": [
    {
      "sourceId": "source-biology",
      "sourceTitle": "Biology notes",
      "text": "Chlorophyll absorbs light in the visible spectrum.",
      "start": 60,
      "end": 110,
      "page": 2
    }
  ],
  "history": [{ "role": "user", "content": "an earlier question" }],
  "session_id": "user-1:notebook-1"
}
```

Response:

```json
{
  "ok": true,
  "answered": true,
  "answer": "Chlorophyll absorbs light in the visible spectrum.",
  "citations": [
    {
      "sourceId": "source-biology",
      "quote": "Chlorophyll absorbs light in the visible spectrum.",
      "locator": { "kind": "offset", "start": 60, "end": 110 }
    }
  ],
  "generator": "ai_grounded",
  "model": "claude-opus-5-5",
  "note": "Answered by a model using the source passages shown below…",
  "usage": {
    "input_tokens": 812,
    "output_tokens": 96,
    "cached_input_tokens": 0,
    "cost_usd": 0.004404,
    "session_tokens": 908,
    "session_budget": 200000,
    "session_budget_exceeded": false
  },
  "errors": []
}
```

Error shape, with a code the client can branch on:

```json
{
  "ok": false,
  "code": "session_budget_exceeded",
  "errors": ["This notebook has used its token budget of 200000 tokens."]
}
```

Codes: `provider_not_configured`, `empty_question`, `no_spans`, `too_many_spans`,
`invalid_span`, `session_budget_exceeded`, `origin_not_allowed`,
`provider_refusal`, `provider_unreachable`, `provider_error`,
`invalid_provider_json`, `empty_answer`.

### `POST /api/session/reset`

```json
{ "session_id": "user-1:notebook-1" }
```

`sessionId` is accepted too. Clears the session's token spend.

## What the gateway sends to the provider

One `POST /v1/messages` call per turn, with these headers:

| Header | Value |
|---|---|
| `content-type` | `application/json` |
| `x-api-key` | the provider key |
| `anthropic-version` | `2023-06-01` |
| `anthropic-beta` | `server-side-fallback-2026-07-01` *(only when server-side fallback is on)* |

The body carries the model, `max_tokens`, the system prompt, the messages, and
an `output_config` that asks for a strict JSON object:

```json
{
  "model": "claude-opus-5-5",
  "max_tokens": 4096,
  "system": "You are a study assistant for a learning app…",
  "messages": [
    { "role": "user", "content": "Source passages:\n\n[span 0] Biology notes (characters 60-110)\n…\n\nQuestion: What does chlorophyll absorb?" }
  ],
  "output_config": {
    "effort": "low",
    "format": { "type": "json_schema", "schema": { "…": "…" } }
  },
  "fallbacks": "default"
}
```

Each source passage is numbered (`[span 0]`, `[span 1]`, …) so the model cites
a passage by index instead of inventing a quote. The model answers with
`{"answer": "…", "citations": [{"span_index": 0}]}`, and the gateway maps each
index back to that passage's own offsets.

**The messages alternate between `user` and `assistant`.** The API rejects a
request whose roles do not alternate
(`messages: roles must alternate between "user" and "assistant"`), and it
rejects one that opens with an assistant turn. The client stores whatever turns
it has, so the gateway repairs the shape: consecutive turns with the same role
are merged, and a leading assistant turn is dropped.

`fallbacks: "default"` asks the provider to retry a safety decline on another
model instead of surfacing a dead end. A provider that does not know the beta
answers HTTP 400, so the gateway retries the request once without the beta
and the fallback parameter before giving up.

## Budgets

- **Per-request citation budget** — `GATEWAY_MAX_CITATIONS` caps how many
  spans one answer may cite, and `GATEWAY_MAX_SPANS` caps how many passages
  one request may carry.
- **Per-session token budget** — `GATEWAY_SESSION_TOKEN_BUDGET` caps the
  tokens one session may spend. Once reached, the gateway refuses further
  calls with `session_budget_exceeded` instead of letting a loop spend
  without limit. The budget lives in the process, so a restart resets it.
- **Cost meter** — every response carries `usage` with the token counts and an
  estimated `cost_usd`, plus the running session total against its budget.

## Building on Windows

The rustup GNU toolchain ships **stubs**: an `x86_64-w64-mingw32-gcc.exe` with
no `cc1`, and no assembler at all. A crate with no C dependencies compiles
against the stub, but `ring` (pulled in by rustls) and `windows-sys` do not.
You get `could not find tool "gcc.exe"` or `dlltool: CreateProcess` instead.

Install a real GNU toolchain and point Cargo at it:

```bash
winget install --id BrechtSanders.WinLibs.POSIX.MSVCRT
```

Then, in Git Bash:

```bash
WL="$LOCALAPPDATA/Microsoft/WinGet/Packages/BrechtSanders.WinLibs.POSIX.MSVCRT_Microsoft.Winget.Source_8wekyb3d8bbwe/mingw64/bin"
export PATH="$HOME/.cargo/bin:$WL:$PATH"
export CC=gcc.exe AR=ar.exe
cargo build --release
```

Cargo itself is not on `PATH` on a fresh install either. `~/.cargo/bin` is
where it lives.

## Tests

```bash
cargo test
```

The Rust tests cover the parts that decide what reaches the screen: the
provider-answer parser, the citation budget, the session budget, span
validation, the message-role normalisation, and the cost calculation. They do
not need a provider key.

The provider call itself has not been run against the live Anthropic API on
this machine, because no key is configured. The request shape, the headers, the
structured-output schema, the refusal handling and the fallback retry were
written from the API documentation and checked against a local mock of
`POST /v1/messages` that records the request it receives.

## Offsets are counted in UTF-16 code units

The browser computes source offsets with `String.length` and `String.slice`,
which count UTF-16 code units. The gateway checks a span's length the same
way, using `char::len_utf16` rather than `chars().count()`.

Counting Unicode scalars instead would reject a legitimate passage
containing an emoji or any other character outside the basic multilingual
plane: the range the browser sent would be one unit longer than the text.

