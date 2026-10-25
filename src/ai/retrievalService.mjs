// DocumentRetrievalService: source-grounded question answering.
//
// Two implementations share one contract:
//   - local lexical retrieval + extractive quotation (always available);
//   - the optional server-side gateway, whose citations are re-verified by the
//     existing groundedChat layer before this service accepts them.
//
// This module never invents an answer. If retrieval finds nothing, it returns an
// explicit no-match result with the passages it did find, if any.

import { answerFromNotebookSources } from '../notebooks/sourceAnswers.mjs';
import { GENERATORS } from '../notebooks/generators.mjs';
import { answerGroundedQuestion } from '../notebooks/groundedChat.mjs';
import {
  CAPABILITY_STATUS,
  RUN_STATUS,
  createServiceResult,
  failureResult,
  readySources,
} from './contracts.mjs';

export const RETRIEVAL_CAPABILITY = CAPABILITY_STATUS.WORKING;
export const GROUNDED_GATEWAY_CAPABILITY = CAPABILITY_STATUS.PARTIAL;

function evidenceFromResults(results) {
  return (Array.isArray(results) ? results : [])
    .filter((result) => result?.citation)
    .map((result) => ({
      kind: 'source_evidence',
      sourceId: result.sourceId,
      sourceTitle: result.sourceTitle,
      page: Number.isInteger(result.page) ? result.page : null,
      quote: result.text,
      citation: result.citation,
    }));
}

export function askLocalSources(request = {}) {
  const started = Date.now();
  const ready = readySources(request.sources);
  if (!request.question) {
    return failureResult('document_retrieval', ['Enter a question before asking.'], {
      capability: RETRIEVAL_CAPABILITY,
    });
  }
  if (ready.length === 0) {
    return failureResult(
      'document_retrieval',
      ['Add at least one ready source before asking a question.'],
      {
        capability: RETRIEVAL_CAPABILITY,
        unavailable: ['source-grounded answer without a ready source'],
      }
    );
  }

  const answer = answerFromNotebookSources({
    sources: ready,
    sourceContents: request.sourceContents,
    question: request.question,
  });

  const evidence = evidenceFromResults(answer.results);
  if (!answer.ok) {
    return createServiceResult({
      service: 'document_retrieval',
      capability: RETRIEVAL_CAPABILITY,
      status: RUN_STATUS.FAILED,
      data: { answer },
      errors: answer.errors,
      limitations: answer.errors,
      metrics: { latencyMs: Date.now() - started },
      generator: GENERATORS.LOCAL_EXTRACTIVE,
    });
  }

  if (!answer.answered) {
    return createServiceResult({
      service: 'document_retrieval',
      capability: RETRIEVAL_CAPABILITY,
      status: RUN_STATUS.BLOCKED,
      data: { answer },
      evidence,
      limitations: [
        answer.message ||
          'The sources do not contain enough relevant text to answer this question.',
      ],
      metrics: {
        latencyMs: Date.now() - started,
        retrievalResults: answer.results?.length || 0,
      },
      generator: GENERATORS.LOCAL_EXTRACTIVE,
    });
  }

  return createServiceResult({
    service: 'document_retrieval',
    capability: RETRIEVAL_CAPABILITY,
    status: RUN_STATUS.COMPLETED,
    data: {
      answer,
      answerText: answer.answer,
      citation: answer.citation,
      sourceTitle: answer.sourceTitle,
      page: answer.page,
      generator: GENERATORS.LOCAL_EXTRACTIVE,
      note: answer.note,
    },
    evidence: [
      {
        kind: 'source_evidence',
        sourceId: answer.sourceId,
        sourceTitle: answer.sourceTitle,
        page: answer.page,
        quote: answer.answer,
        citation: answer.citation,
      },
      ...evidence.filter(
        (item) => item.citation.locator.start !== answer.citation.locator.start
      ),
    ],
    limitations: [
      'The answer is one exact source sentence selected by lexical overlap. It is not a generated synthesis.',
      'Keyword overlap is a relevance heuristic, not proof that the sentence answers the full intent.',
    ],
    metrics: {
      latencyMs: Date.now() - started,
      retrievalResults: answer.results?.length || 0,
    },
    generator: GENERATORS.LOCAL_EXTRACTIVE,
  });
}

/**
 * Provider-backed grounded answer. Falls back to the local extractive answer
 * when the gateway is unavailable or when any model citation fails
 * verification (groundedChat already enforces that rule).
 */
export async function askGroundedSources(request = {}) {
  const started = Date.now();
  const ready = readySources(request.sources);
  if (!request.question) {
    return failureResult('document_retrieval.grounded', [
      'Enter a question before asking.',
    ], { capability: GROUNDED_GATEWAY_CAPABILITY });
  }
  if (ready.length === 0) {
    return failureResult(
      'document_retrieval.grounded',
      ['Add at least one ready source before asking a question.'],
      {
        capability: GROUNDED_GATEWAY_CAPABILITY,
        unavailable: ['source-grounded answer without a ready source'],
      }
    );
  }

  const result = await answerGroundedQuestion({
    question: request.question,
    sources: ready,
    sourceContents: request.sourceContents,
    messages: request.messages,
    sessionId: request.sessionId,
    baseUrl: request.baseUrl,
    fetchImpl: request.fetchImpl,
    gateway: request.gateway,
  });

  const evidence = (result.citations || []).map((citation) => {
    const source = ready.find((item) => item.id === citation.sourceId);
    return {
      kind: 'source_evidence',
      sourceId: citation.sourceId,
      sourceTitle: source?.title || 'Source',
      page: null,
      quote: citation.quote,
      citation,
    };
  });

  if (!result.ok) {
    return createServiceResult({
      service: 'document_retrieval.grounded',
      capability: GROUNDED_GATEWAY_CAPABILITY,
      status: RUN_STATUS.FAILED,
      data: { result },
      evidence,
      errors: result.errors || [result.note],
      limitations: [result.note].filter(Boolean),
      metrics: { latencyMs: Date.now() - started },
      generator: result.generator || GENERATORS.LOCAL_EXTRACTIVE,
    });
  }

  if (!result.answered) {
    return createServiceResult({
      service: 'document_retrieval.grounded',
      capability: GROUNDED_GATEWAY_CAPABILITY,
      status: RUN_STATUS.BLOCKED,
      data: { result },
      evidence,
      limitations: [result.note].filter(Boolean),
      metrics: { latencyMs: Date.now() - started },
      generator: result.generator || GENERATORS.LOCAL_EXTRACTIVE,
    });
  }

  const modelBacked = result.generator === 'ai_grounded';
  return createServiceResult({
    service: 'document_retrieval.grounded',
    capability: modelBacked ? CAPABILITY_STATUS.PARTIAL : RETRIEVAL_CAPABILITY,
    status: modelBacked ? RUN_STATUS.COMPLETED : RUN_STATUS.PARTIAL,
    data: {
      result,
      answerText: result.answer,
      citations: result.citations,
      generator: result.generator,
      note: result.note,
    },
    evidence,
    interpretations: modelBacked
      ? [
          {
            kind: 'model_interpretation',
            text: result.answer,
            note: 'Model wording grounded in the cited passages. The wording is not itself source evidence.',
          },
        ]
      : [],
    limitations: [
      result.note,
      ...(modelBacked
        ? [
            'The model can still misread a passage. The quotations are verified; the synthesis is not independently fact-checked.',
          ]
        : []),
    ].filter(Boolean),
    metrics: {
      latencyMs: Date.now() - started,
      providerCalls: modelBacked ? 1 : 0,
      inputTokens: result.usage?.input_tokens || 0,
      outputTokens: result.usage?.output_tokens || 0,
      costUsd: result.usage?.cost_usd || 0,
      retrievalResults: result.citations?.length || 0,
    },
    model: result.model || null,
    generator: result.generator || GENERATORS.LOCAL_EXTRACTIVE,
  });
}
