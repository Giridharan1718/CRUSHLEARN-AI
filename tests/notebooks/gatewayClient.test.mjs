import test from 'node:test';
import assert from 'node:assert/strict';
import {
  askGateway,
  askResearchGateway,
  probeGateway,
  resolveGatewayBaseUrl,
} from '../../src/notebooks/gatewayClient.mjs';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  };
}

test('the gateway base url defaults to the same-origin api path', () => {
  assert.equal(resolveGatewayBaseUrl({}), '');
});

test('an explicit gateway url overrides the default and drops a trailing slash', () => {
  assert.equal(
    resolveGatewayBaseUrl({ VITE_GATEWAY_URL: 'http://127.0.0.1:9000/' }),
    'http://127.0.0.1:9000'
  );
});

test('a healthy gateway reports that a provider is configured', async () => {
  const status = await probeGateway({
    fetchImpl: async () =>
      jsonResponse({
        ok: true,
        provider_configured: true,
        model: 'claude-opus-5-5',
      }),
  });

  assert.equal(status.available, true);
  assert.equal(status.providerConfigured, true);
  assert.equal(status.model, 'claude-opus-5-5');
});

test('a running gateway with no key reports that no provider is configured', async () => {
  const status = await probeGateway({
    fetchImpl: async () =>
      jsonResponse({ ok: true, provider_configured: false, model: 'claude-opus-5-5' }),
  });

  assert.equal(status.available, true);
  assert.equal(status.providerConfigured, false);
});

test('an unreachable gateway is reported as unavailable', async () => {
  const status = await probeGateway({
    fetchImpl: async () => {
      throw new Error('connect ECONNREFUSED');
    },
  });

  assert.equal(status.available, false);
  assert.equal(status.providerConfigured, false);
  assert.match(status.error, /not running/);
});

test('a chat request posts the question and the spans', async () => {
  let captured = null;
  const result = await askGateway({
    question: 'What does chlorophyll absorb?',
    spans: [
      {
        sourceId: 'source-biology',
        sourceTitle: 'Biology notes',
        text: 'Chlorophyll absorbs light in the visible spectrum.',
        start: 60,
        end: 110,
        page: 2,
      },
    ],
    history: [{ role: 'user', content: 'earlier question' }],
    sessionId: 'user-1:notebook-1',
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({
        ok: true,
        answered: true,
        answer: 'Chlorophyll absorbs light in the visible spectrum.',
        citations: [],
        generator: 'ai_grounded',
        model: 'claude-opus-5-5',
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(captured.url, '/api/chat');
  assert.equal(captured.body.question, 'What does chlorophyll absorb?');
  assert.equal(captured.body.spans.length, 1);
  assert.equal(captured.body.spans[0].start, 60);
  assert.equal(captured.body.session_id, 'user-1:notebook-1');
  assert.equal(captured.body.history.length, 1);
});

test('a gateway error is surfaced as a message the app can show', async () => {
  const result = await askGateway({
    question: 'Anything?',
    spans: [{ sourceId: 's', sourceTitle: 't', text: 'x', start: 0, end: 1 }],
    fetchImpl: async () =>
      jsonResponse(
        { ok: false, code: 'no_spans', errors: ['No verified source passages were supplied.'] },
        { ok: false, status: 400 }
      ),
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /No verified source passages/);
});

test('a research claims request posts verified spans and the operation', async () => {
  let captured = null;
  const result = await askResearchGateway({
    question: 'Compare the findings',
    spans: [
      {
        sourceId: 'source-1',
        sourceTitle: 'Notes',
        text: 'Chlorophyll absorbs light.',
        start: 10,
        end: 35,
        page: null,
      },
    ],
    operation: 'claims',
    fetchImpl: async (url, options) => {
      captured = { url, body: JSON.parse(options.body) };
      return jsonResponse({
        ok: true,
        operation: 'claims',
        claims: [{ text: 'Chlorophyll absorbs light.', span_indexes: [0] }],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(captured.url, '/api/research');
  assert.equal(captured.body.operation, 'claims');
  assert.equal(captured.body.spans[0].start, 10);
  assert.equal(result.data.claims[0].span_indexes[0], 0);
});

test('a rerank response without an order is rejected', async () => {
  const result = await askResearchGateway({
    question: 'Compare the findings',
    operation: 'rerank',
    fetchImpl: async () => jsonResponse({ ok: true, order: [] }),
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /reranking order/i);
});

test('a conflicts response must contain an explicit conflicts array', async () => {
  const ok = await askResearchGateway({
    question: 'Compare the findings',
    operation: 'conflicts',
    fetchImpl: async () =>
      jsonResponse({ ok: true, conflicts: [] }),
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.data.conflicts, []);

  const missing = await askResearchGateway({
    question: 'Compare the findings',
    operation: 'conflicts',
    fetchImpl: async () => jsonResponse({ ok: true }),
  });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /conflict analysis/i);
});

test('a gateway response with no answer text is treated as a failure', async () => {
  const result = await askGateway({
    question: 'Anything?',
    spans: [{ sourceId: 's', sourceTitle: 't', text: 'x', start: 0, end: 1 }],
    fetchImpl: async () => jsonResponse({ ok: true, answered: false, answer: null }),
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /no answer/i);
});
