// Client for the Rust gateway.
//
// The gateway is a local server-side service. It holds the provider key; this
// module never sees a credential. It sends retrieval-verified source spans
// and receives an answer with citations that the caller must verify again
// before showing them.
//
// The gateway is optional. When it is missing, stopped, or has no provider
// key, every call here fails in a way the app can answer honestly by falling
// back to its local extractive answers.

export const GATEWAY_ASK_PATH = '/api/chat';
export const GATEWAY_RESEARCH_PATH = '/api/research';
export const GATEWAY_FETCH_PATH = '/api/fetch';
export const GATEWAY_HEALTH_PATH = '/api/health';
export const GATEWAY_DEFAULT_TIMEOUT_MS = 45_000;
export const GATEWAY_HEALTH_TIMEOUT_MS = 2_500;
export const GATEWAY_FETCH_TIMEOUT_MS = 35_000;

/**
 * The base URL of the gateway.
 *
 * By default the app calls a same-origin `/api` path, which the dev server
 * proxies to the gateway process. `VITE_GATEWAY_URL` can point at a gateway
 * on another host, in which case the `/api` prefix is kept. It names a
 * location, not a secret, so it is safe in the client bundle. The provider
 * key never is.
 */
export function resolveGatewayBaseUrl(env = readEnv()) {
  const override = typeof env.VITE_GATEWAY_URL === 'string' ? env.VITE_GATEWAY_URL.trim() : '';
  const base = override || '';
  return base.replace(/\/+$/, '');
}

function readEnv() {
  // `import.meta.env` exists in the Vite build and is undefined under Node,
  // where the test runner imports these modules directly.
  const env = import.meta.env;
  return env && typeof env === 'object' ? env : {};
}

function resolveFetch(fetchImpl) {
  if (typeof fetchImpl === 'function') return fetchImpl;
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
  return null;
}

async function request(
  { baseUrl, path, method = 'POST', body = null, fetchImpl, timeoutMs }
) {
  const doFetch = resolveFetch(fetchImpl);
  if (!doFetch) {
    return { ok: false, status: 0, data: null, error: 'This browser cannot make network requests.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${String(baseUrl).replace(/\/+$/, '')}${path}`;

  try {
    const response = await doFetch(url, {

      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message =
        data?.errors?.[0] ||
        data?.error ||
        `The gateway returned HTTP ${response.status}.`;
      return { ok: false, status: response.status, data, error: message };
    }

    return { ok: true, status: response.status, data, error: null };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, status: 0, data: null, error: 'The gateway did not answer in time.' };
    }
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'The AI gateway is not running. The app is using its local extractive answers.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Asks the gateway whether a provider is configured.
 *
 * Returns `provider_configured: false` when the gateway is running but has no
 * key, which is different from the gateway being unreachable.
 */
export async function probeGateway({
  baseUrl = '',
  fetchImpl = null,
  timeoutMs = GATEWAY_HEALTH_TIMEOUT_MS,
} = {}) {
  const result = await request({
    baseUrl,
    path: GATEWAY_HEALTH_PATH,
    method: 'GET',
    fetchImpl,
    timeoutMs,
  });

  if (!result.ok) {
    return {
      available: false,
      providerConfigured: false,
      model: null,
      error: result.error,
    };
  }

  return {
    available: true,
    providerConfigured: Boolean(result.data?.provider_configured),
    model: result.data?.model || null,
    error: null,
  };
}

/**
 * Sends a question with its verified spans to the gateway.
 */
export async function askGateway({
  question,
  spans = [],
  history = [],
  sessionId = null,
  baseUrl = '',
  fetchImpl = null,
  timeoutMs = GATEWAY_DEFAULT_TIMEOUT_MS,
} = {}) {
  const payload = {
    question: String(question ?? '').trim(),
    spans,
    history,
    session_id: sessionId,
  };

  const result = await request({
    baseUrl,
    path: GATEWAY_ASK_PATH,
    method: 'POST',
    body: payload,
    fetchImpl,
    timeoutMs,
  });

  if (!result.ok) {
    return { ok: false, data: null, error: result.error, status: result.status };
  }

  const data = result.data;
  if (!data || typeof data.answer !== 'string' || !data.answer.trim()) {
    return {
      ok: false,
      data: data || null,
      error: data?.errors?.[0] || 'The gateway returned no answer.',
      status: result.status,
    };
  }

  return { ok: true, data, error: null, status: result.status };
}

/**
 * Sends a research operation to the gateway.
 *
 * `operation` is one of `claims`, `rerank` or `conflicts`. Claims and
 * conflicts are returned with `span_indexes`; the caller maps them back to the
 * verified spans it sent and re-verifies every citation before showing it. A
 * rerank response can only reorder the results the client supplied.
 */
export async function askResearchGateway({
  question,
  spans = [],
  operation = 'claims',
  sessionId = null,
  baseUrl = '',
  fetchImpl = null,
  timeoutMs = GATEWAY_DEFAULT_TIMEOUT_MS,
} = {}) {
  const payload = {
    question: String(question ?? '').trim(),
    spans,
    operation,
    session_id: sessionId,
  };

  const result = await request({
    baseUrl,
    path: GATEWAY_RESEARCH_PATH,
    method: 'POST',
    body: payload,
    fetchImpl,
    timeoutMs,
  });

  if (!result.ok) {
    return { ok: false, data: result.data || null, error: result.error, status: result.status };
  }

  const data = result.data;
  if (!data || data.ok !== true) {
    return {
      ok: false,
      data: data || null,
      error: data?.errors?.[0] || 'The gateway returned no research result.',
      status: result.status,
    };
  }

  if (operation === 'rerank') {
    if (!Array.isArray(data.order) || data.order.length === 0) {
      return {
        ok: false,
        data,
        error: 'The gateway returned no usable reranking order.',
        status: result.status,
      };
    }
  } else if (operation === 'conflicts') {
    if (!Array.isArray(data.conflicts)) {
      return {
        ok: false,
        data,
        error: 'The gateway returned no conflict analysis.',
        status: result.status,
      };
    }
  } else if (!Array.isArray(data.claims)) {
    return {
      ok: false,
      data,
      error: 'The gateway returned no claims.',
      status: result.status,
    };
  }

  return { ok: true, data, error: null, status: result.status };
}

/**
 * Fetch a web page through the gateway and return its extracted text.
 *
 * This is deliberately not a browser fetch. The gateway applies scheme,
 * private-address, redirect, size and content-type checks. When the gateway is
 * not running, the caller receives a real error and records a failed source;
 * it must not retry the URL in the browser.
 */
export async function fetchWebPage({
  url,
  baseUrl = '',
  fetchImpl = null,
  timeoutMs = GATEWAY_FETCH_TIMEOUT_MS,
} = {}) {
  const result = await request({
    baseUrl,
    path: GATEWAY_FETCH_PATH,
    method: 'POST',
    body: { url: String(url ?? '').trim() },
    fetchImpl,
    timeoutMs,
  });

  if (!result.ok) {
    const reason =
      result.status === 0
        ? 'The web reader gateway is not running. A page cannot be fetched in the browser, so no source text was imported.'
        : result.error;
    return { ok: false, data: result.data || null, error: reason, status: result.status };
  }

  const data = result.data;
  if (!data || data.ok !== true || typeof data.text !== 'string' || !data.text.trim()) {
    return {
      ok: false,
      data: data || null,
      error:
        data?.errors?.[0] ||
        'The gateway fetched the page but returned no readable text.',
      status: result.status,
    };
  }

  return { ok: true, data, error: null, status: result.status };
}
