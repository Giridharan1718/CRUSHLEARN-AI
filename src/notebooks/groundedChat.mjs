// Grounded chat: the layer between a learner question and an answer.
//
// The order of operations is the whole point of this module:
//
//   1. Retrieve spans from the local sources and verify each one against the
//      stored source text. Nothing reaches the model that the local verifier
//      has not already checked.
//   2. Ask the gateway, which holds the provider key.
//   3. Verify every citation the gateway returned, a second time, against the
//      stored source text.
//   4. If any citation fails, drop the model answer and fall back to the
//      local extractive answer.
//
// A model answer that cannot be verified never reaches the screen.

import { validateCitation } from './citations.mjs';
import { searchNotebookSources } from './sourceRetrieval.mjs';
import { answerFromNotebookSources } from './sourceAnswers.mjs';
import { readySources, sourceTextMap } from './sourceAccess.mjs';
import { GENERATORS } from './generators.mjs';
import { askGateway, probeGateway } from './gatewayClient.mjs';

export const GENERATOR_EXTRACTIVE = GENERATORS.LOCAL_EXTRACTIVE;
export const GENERATOR_GROUNDED = GENERATORS.AI_GROUNDED;

/** The label shown under a model answer so its origin is never ambiguous. */
export const GROUNDED_ANSWER_LABEL =
  'AI answer grounded in your sources. Every citation below was re-checked against the stored source text.';

/** The label shown under a local extractive answer. */
export const EXTRACTIVE_ANSWER_LABEL =
  'Extractive source answer — not AI-generated. This is a direct quotation from a matching source passage.';

/** How many source passages are sent to the gateway. */
export const MAX_GATEWAY_SPANS = 8;

/** How many previous turns are sent to the gateway as context. */
export const MAX_HISTORY_TURNS = 6;

/**
 * Verifies a list of citations against the stored source text.
 *
 * Returns the citations that passed, and the ones that did not. A citation
 * that names a source outside the notebook, or whose quote does not match the
 * text at its offsets, is rejected.
 */
export function verifyCitations(citations, { sources = [], sourceContents = {} } = {}) {
  const sourceIds = readySources(sources).map((source) => source.id);
  const sourceTexts = sourceTextMap(sources, sourceContents);
  const accepted = [];
  const rejected = [];

  (Array.isArray(citations) ? citations : []).forEach((citation) => {
    const result = validateCitation(citation, {
      sourceIds,
      sourceTexts,
      requireSourceText: true,
    });
    if (result.ok && result.verified) {
      accepted.push(result.citation);
    } else {
      rejected.push({
        citation: citation || null,
        errors: result.errors,
      });
    }
  });

  return { accepted, rejected };
}

/**
 * Turns retrieval results into the span shape the gateway expects.
 */
export function toGatewaySpans(results) {
  return (Array.isArray(results) ? results : []).slice(0, MAX_GATEWAY_SPANS).map((result) => ({
    sourceId: result.sourceId,
    sourceTitle: result.sourceTitle || '',
    text: result.text,
    start: result.citation?.locator?.start ?? 0,
    end: result.citation?.locator?.end ?? result.text.length,
    page: Number.isInteger(result.page) ? result.page : null,
  }));
}

/**
 * Builds the conversation history sent to the gateway.
 *
 * Only turns that produced a real answer are included, and the learner turns
 * are included so a follow-up question has context.
 */
export function buildHistory(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role === 'user' || message?.role === 'assistant')
    .filter((message) => typeof message.content === 'string' && message.content.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map((message) => ({ role: message.role, content: message.content }));
}

/**
 * Answers a question about the notebook sources.
 *
 * The returned object always describes how the answer was produced, so the
 * caller can label it truthfully.
 */
export async function answerGroundedQuestion({
  question,
  sources = [],
  sourceContents = {},
  messages = [],
  sessionId = null,
  baseUrl = '',
  fetchImpl = null,
  gateway = null,
} = {}) {
  const trimmed = String(question ?? '').trim();
  const ready = readySources(sources);

  if (!trimmed) {
    return {
      ok: false,
      answered: false,
      answer: null,
      citations: [],
      generator: GENERATOR_EXTRACTIVE,
      note: 'Enter a question before asking.',
      errors: ['Enter a question before asking.'],
    };
  }

  if (ready.length === 0) {
    return {
      ok: false,
      answered: false,
      answer: null,
      citations: [],
      generator: GENERATOR_EXTRACTIVE,
      note: 'Add at least one ready source before asking a question.',
      errors: ['Add at least one ready source before asking a question.'],
    };
  }

  // 1. Retrieve locally and verify. This is the only retrieval that happens.
  const search = searchNotebookSources({
    sources: ready,
    sourceContents,
    query: trimmed,
    limit: MAX_GATEWAY_SPANS,
  });

  if (!search.ok) {
    return {
      ok: false,
      answered: false,
      answer: null,
      citations: [],
      generator: GENERATOR_EXTRACTIVE,
      note: search.errors[0],
      errors: search.errors,
    };
  }

  if (search.results.length === 0) {
    // Honest turn: the sources do not cover the question. No outside
    // knowledge is used to fill the gap.
    return {
      ok: true,
      answered: false,
      answer: null,
      citations: [],
      generator: GENERATOR_EXTRACTIVE,
      note:
        'No source passage matched this question. The sources do not contain enough relevant text to answer it.',
      errors: [],
    };
  }

  // 2. Ask the gateway.
  const ask = gateway
    ? await gateway({
        question: trimmed,
        spans: toGatewaySpans(search.results),
        history: buildHistory(messages),
        sessionId,
        baseUrl,
        fetchImpl,
      })
    : await askGateway({
        question: trimmed,
        spans: toGatewaySpans(search.results),
        history: buildHistory(messages),
        sessionId,
        baseUrl,
        fetchImpl,
      });

  if (!ask.ok) {
    // 4a. The gateway could not answer. Fall back to the local extractive
    // answer, which is still a verified quotation.
    return withExtractiveFallback({
      question: trimmed,
      sources: ready,
      sourceContents,
      reason: ask.error,
    });
  }

  // 3. Verify every citation the gateway returned, a second time.
  const { accepted, rejected } = verifyCitations(ask.data.citations, {
    sources: ready,
    sourceContents,
  });

  if (rejected.length > 0) {
    // 4b. The model cited something that does not check out. Do not show the
    // model answer. Fall back to the local extractive answer instead.
    return withExtractiveFallback({
      question: trimmed,
      sources: ready,
      sourceContents,
      reason:
        'The model answer included a citation that could not be verified against the source text.',
    });
  }

  if (accepted.length === 0) {
    return withExtractiveFallback({
      question: trimmed,
      sources: ready,
      sourceContents,
      reason: 'The model answer did not cite any source passage.',
    });
  }

  return {
    ok: true,
    answered: true,
    answer: ask.data.answer,
    citations: accepted,
    generator: GENERATOR_GROUNDED,
    model: ask.data.model || null,
    usage: ask.data.usage || null,
    note: GROUNDED_ANSWER_LABEL,
    errors: [],
  };
}

/**
 * Builds the local extractive answer, used whenever the model path fails.
 */
export function withExtractiveFallback({ question, sources, sourceContents, reason }) {
  const extractive = answerFromNotebookSources({
    sources,
    sourceContents,
    question,
  });

  if (!extractive.answered) {
    return {
      ok: true,
      answered: false,
      answer: null,
      citations: [],
      generator: GENERATOR_EXTRACTIVE,
      note: extractive.message || reason,
      errors: extractive.errors || [],
    };
  }

  return {
    ok: true,
    answered: true,
    answer: extractive.answer,
    citations: extractive.citation ? [extractive.citation] : [],
    generator: GENERATOR_EXTRACTIVE,
    model: null,
    usage: null,
    note: `${EXTRACTIVE_ANSWER_LABEL} The AI gateway could not be used: ${reason}`,
    errors: [],
  };
}

/**
 * Checks whether the gateway is running and has a provider key.
 */
export async function checkGatewayStatus({ baseUrl = '', fetchImpl = null } = {}) {
  return probeGateway({ baseUrl, fetchImpl });
}
