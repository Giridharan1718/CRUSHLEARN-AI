// Shared contracts for the CrushLearn AI orchestration layer.
//
// Every specialized capability returns the same envelope shape so the
// orchestrator can combine results without guessing. The envelope keeps source
// evidence, model interpretation, learner evidence and unavailable capabilities
// in separate fields. A generated explanation is never treated as verified
// evidence merely because another service produced it.

import {
  readySources as sharedReadySources,
  sourceTextMap as sharedSourceTextMap,
} from '../notebooks/sourceAccess.mjs';

export const ORCHESTRATION_SCHEMA_VERSION = 1;

export const TASK_IDS = Object.freeze({
  EXPLAIN: 'explain',
  ASK: 'ask',
  PRACTICE: 'practice',
  ASSESS: 'assess',
  RESEARCH: 'research',
  WRITE: 'write',
  VERIFY: 'verify',
  SUMMARIZE: 'summarize',
});

export const TASK_LABELS = Object.freeze({
  explain: 'Explain text',
  ask: 'Answer from sources',
  practice: 'Practice',
  assess: 'Check understanding',
  research: 'Research planning',
  write: 'Writing support',
  verify: 'Verification',
  summarize: 'Summarize',
});

export const WORKFLOW_IDS = Object.freeze({
  DIRECT_EXPLANATION: 'direct_explanation',
  GUIDED_EXPLANATION: 'guided_explanation',
  SOURCE_GROUNDED_QA: 'source_grounded_qa',
  PRACTICE_CHECK: 'practice_check',
  UNDERSTANDING_CHECK: 'understanding_check',
  RESEARCH_PLAN: 'research_plan',
  WRITING_OUTLINE: 'writing_outline',
  EVIDENCE_VERIFICATION: 'evidence_verification',
  SOURCE_SUMMARY: 'source_summary',
});

export const CAPABILITY_STATUS = Object.freeze({
  WORKING: 'WORKING',
  PARTIAL: 'PARTIAL',
  MOCKED: 'MOCKED',
  MISSING: 'MISSING',
  UNVERIFIED: 'UNVERIFIED',
});

export const RUN_STATUS = Object.freeze({
  COMPLETED: 'completed',
  PARTIAL: 'partial',
  BLOCKED: 'blocked',
  FAILED: 'failed',
  NEEDS_INPUT: 'needs_input',
});

export const TRUST_KINDS = Object.freeze({
  SOURCE_EVIDENCE: 'source_evidence',
  MODEL_INTERPRETATION: 'model_interpretation',
  RULE_BASED_INTERPRETATION: 'rule_based_interpretation',
  LEARNER_EVIDENCE: 'learner_evidence',
  UNVERIFIED_HYPOTHESIS: 'unverified_hypothesis',
  UNAVAILABLE: 'unavailable',
});

export const MAX_ORCHESTRATION_TEXT_CHARS = 4000;
export const MAX_SERVICE_CALLS = 5;

function clean(value, max = 500) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function readySources(sources) {
  return sharedReadySources(sources);
}

export function sourceTextMap(sources, sourceContents = {}) {
  return sharedSourceTextMap(sources, sourceContents);
}

export function normalizeRequest(input = {}) {
  return {
    task: typeof input.task === 'string' ? input.task.trim().toLowerCase() : '',
    text: typeof input.text === 'string' ? input.text : '',
    selection: input.selection && typeof input.selection === 'object' ? input.selection : null,
    question: clean(input.question, 300),
    level:
      typeof input.level === 'string' && input.level.trim()
        ? input.level.trim().toLowerCase()
        : 'eli10',
    mode:
      typeof input.mode === 'string' && input.mode.trim()
        ? input.mode.trim().toLowerCase()
        : 'simplify',
    word: clean(input.word, 60),
    language:
      typeof input.language === 'string' && input.language.trim()
        ? input.language.trim().toLowerCase()
        : 'en',
    userId: clean(input.userId, 160),
    notebookId: clean(input.notebookId, 160),
    sources: Array.isArray(input.sources) ? input.sources : [],
    sourceContents:
      input.sourceContents && typeof input.sourceContents === 'object'
        ? input.sourceContents
        : {},
    messages: Array.isArray(input.messages) ? input.messages : [],
    previousContext: input.previousContext || null,
    explanation: input.explanation || null,
    citations: Array.isArray(input.citations) ? input.citations : [],
    useAdaptiveLoop: Boolean(input.useAdaptiveLoop),
    sessionId: clean(input.sessionId, 240) || null,
    baseUrl: typeof input.baseUrl === 'string' ? input.baseUrl : '/api',
    fetchImpl: typeof input.fetchImpl === 'function' ? input.fetchImpl : null,
    gateway: typeof input.gateway === 'function' ? input.gateway : null,
    response: typeof input.response === 'string' ? input.response : '',
    questionId: clean(input.questionId, 120),
    allowModel: input.allowModel !== false,
  };
}

/**
 * Authorization check for notebook-scoped work. The demo app has no server
 * identity boundary, but the orchestrator still refuses to combine data when
 * the caller cannot name the learner and notebook that own it.
 */
export function checkAccess(request) {
  const notebookScoped =
    Boolean(request.notebookId) || Boolean(request.sources?.length);

  if (!notebookScoped) return { ok: true, scope: 'selection' };
  if (!request.userId) {
    return {
      ok: false,
      scope: 'notebook',
      code: 'permission_denied',
      error: 'This request needs a signed-in learner before notebook data can be used.',
    };
  }
  if (!request.notebookId) {
    return {
      ok: false,
      scope: 'notebook',
      code: 'permission_denied',
      error: 'This request needs a notebook id before notebook data can be used.',
    };
  }
  return { ok: true, scope: 'notebook' };
}

export function createServiceResult({
  service,
  capability = CAPABILITY_STATUS.WORKING,
  status = RUN_STATUS.COMPLETED,
  data = null,
  evidence = [],
  interpretations = [],
  learnerEvidence = [],
  hypotheses = [],
  unavailable = [],
  limitations = [],
  errors = [],
  metrics = {},
  model = null,
  generator = 'local_deterministic',
} = {}) {
  return {
    ok: status !== RUN_STATUS.FAILED && status !== RUN_STATUS.BLOCKED,
    service,
    capability,
    status,
    data,
    evidence: Array.isArray(evidence) ? evidence : [],
    interpretations: Array.isArray(interpretations) ? interpretations : [],
    learnerEvidence: Array.isArray(learnerEvidence) ? learnerEvidence : [],
    hypotheses: Array.isArray(hypotheses) ? hypotheses : [],
    unavailable: Array.isArray(unavailable) ? unavailable : [],
    limitations: Array.isArray(limitations) ? limitations : [],
    errors: Array.isArray(errors) ? errors : [],
    metrics: metrics && typeof metrics === 'object' ? metrics : {},
    model: model || null,
    generator,
  };
}

export function failureResult(service, errors, extra = {}) {
  const list = Array.isArray(errors) ? errors : [String(errors || 'Unknown failure')];
  return createServiceResult({
    service,
    status: RUN_STATUS.FAILED,
    errors: list,
    limitations: list,
    ...extra,
  });
}

export function createEnvelope({
  request,
  task,
  workflow,
  status = RUN_STATUS.COMPLETED,
  servicesUsed = [],
  data = null,
  evidence = [],
  interpretations = [],
  learnerEvidence = [],
  hypotheses = [],
  unavailable = [],
  limitations = [],
  errors = [],
  metrics = {},
  model = null,
} = {}) {
  return {
    schemaVersion: ORCHESTRATION_SCHEMA_VERSION,
    ok: status !== RUN_STATUS.FAILED && status !== RUN_STATUS.BLOCKED,
    task: {
      id: task?.id || TASK_IDS.ASK,
      label: TASK_LABELS[task?.id] || TASK_LABELS.ask,
      confidence: Number(task?.confidence || 0),
      basis: task?.basis || 'default',
    },
    workflow,
    status,
    servicesUsed: Array.isArray(servicesUsed) ? servicesUsed : [],
    evidence: {
      source: Array.isArray(evidence) ? evidence : [],
      citations: Array.isArray(evidence)
        ? evidence.map((item) => item.citation).filter(Boolean)
        : [],
    },
    interpretation: Array.isArray(interpretations) ? interpretations : [],
    learnerEvidence: Array.isArray(learnerEvidence) ? learnerEvidence : [],
    hypotheses: Array.isArray(hypotheses) ? hypotheses : [],
    unavailable: Array.isArray(unavailable) ? unavailable : [],
    limitations: Array.isArray(limitations) ? limitations : [],
    errors: Array.isArray(errors) ? errors : [],
    metrics: {
      startedAt: request?.startedAt || null,
      latencyMs: Number(metrics.latencyMs || 0),
      serviceCalls: Number(metrics.serviceCalls || 0),
      providerCalls: Number(metrics.providerCalls || 0),
      inputTokens: Number(metrics.inputTokens || 0),
      outputTokens: Number(metrics.outputTokens || 0),
      costUsd: Number(metrics.costUsd || 0),
      retrievalResults: Number(metrics.retrievalResults || 0),
      completion:
        status === RUN_STATUS.COMPLETED
          ? 1
          : status === RUN_STATUS.PARTIAL
            ? 0.6
            : status === RUN_STATUS.NEEDS_INPUT
              ? 0.4
              : 0,
      ...metrics,
    },
    model: model || null,
    data,
  };
}

export function citationsFromExplanation(explanation) {
  const citations = [];
  const seen = new Set();
  [...(explanation?.segments || []), ...(explanation?.why || [])].forEach((segment) => {
    const citation = segment?.citation;
    if (!citation) return;
    const key = `${citation.sourceId}:${citation.locator?.start}:${citation.locator?.end}`;
    if (seen.has(key)) return;
    seen.add(key);
    citations.push({
      citation,
      sourceTitle: explanation?.sourceTitle || '',
      quote: citation.quote,
    });
  });
  return citations;
}

export function estimateReadabilityLevel(text) {
  const source = String(text || '');
  const sentences = source.split(/[.!?]+/).filter((item) => item.trim()).length || 1;
  const words = source.split(/\s+/).filter(Boolean).length || 1;
  const syllables =
    source.toLowerCase().match(/[aeiouy]+/g)?.length || 1;
  const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
  return Number(Math.max(0, Math.min(100, score)).toFixed(1));
}
