// Bounded state for the adaptive intelligence loop.
//
// The loop keeps source facts, rule-based explanations, learner input,
// assessment evidence, hypotheses, experimental results and unresolved
// questions in separate categories. Keeping them separate prevents a generated
// hint from being mistaken for a source fact or a measured assessment result.
// This module has no network or model dependency.

import { CITATION_LOCATOR_KINDS, normalizeCitation } from '../notebooks/citations.mjs';
import { GENERATORS } from '../notebooks/generators.mjs';
import { createRecordId } from '../notebooks/notebookSchema.mjs';

export const ADAPTIVE_STATE_SCHEMA_VERSION = 1;
export const MAX_ADAPTIVE_STEPS = 10;
export const MAX_ADAPTIVE_ITEMS = 6;
export const MAX_ADAPTIVE_ATTEMPTS = 10;
export const MAX_ADAPTIVE_TEXT = 600;

export const ADAPTIVE_STATUSES = Object.freeze({
  RUNNING: 'running',
  AWAITING_RESPONSE: 'awaiting_response',
  COMPLETE: 'complete',
  BLOCKED: 'blocked',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

export const ADAPTIVE_ACTIONS = Object.freeze({
  ANSWER_DIRECTLY: 'answer_directly',
  RETRIEVE_SOURCE_EVIDENCE: 'retrieve_source_evidence',
  EXPLAIN_PREREQUISITE: 'explain_prerequisite',
  GENERATE_DIAGRAM: 'generate_diagram',
  PROVIDE_WORKED_EXAMPLE: 'provide_worked_example',
  ASK_DIAGNOSTIC_QUESTION: 'ask_diagnostic_question',
  GENERATE_PRACTICE_PROBLEM: 'generate_practice_problem',
  INVESTIGATE_CONFLICTING_INFORMATION: 'investigate_conflicting_information',
  OFFER_EXPERIMENT: 'offer_experiment',
  VERIFY_UNDERSTANDING: 'verify_understanding',
  SUMMARIZE_OR_SAVE: 'summarize_or_save',
});

export const ADAPTIVE_ACTION_LABELS = Object.freeze({
  [ADAPTIVE_ACTIONS.ANSWER_DIRECTLY]: 'Answer directly',
  [ADAPTIVE_ACTIONS.RETRIEVE_SOURCE_EVIDENCE]: 'Retrieve source evidence',
  [ADAPTIVE_ACTIONS.EXPLAIN_PREREQUISITE]: 'Explain a prerequisite',
  [ADAPTIVE_ACTIONS.GENERATE_DIAGRAM]: 'Generate a diagram',
  [ADAPTIVE_ACTIONS.PROVIDE_WORKED_EXAMPLE]: 'Provide a worked example',
  [ADAPTIVE_ACTIONS.ASK_DIAGNOSTIC_QUESTION]: 'Ask a diagnostic question',
  [ADAPTIVE_ACTIONS.GENERATE_PRACTICE_PROBLEM]: 'Generate a practice problem',
  [ADAPTIVE_ACTIONS.INVESTIGATE_CONFLICTING_INFORMATION]:
    'Investigate conflicting information',
  [ADAPTIVE_ACTIONS.OFFER_EXPERIMENT]: 'Offer an experiment',
  [ADAPTIVE_ACTIONS.VERIFY_UNDERSTANDING]: 'Verify understanding',
  [ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE]: 'Summarize or save',
});

const STATUS_VALUES = new Set(Object.values(ADAPTIVE_STATUSES));
const ACTION_VALUES = new Set(Object.values(ADAPTIVE_ACTIONS));
const GENERATOR_VALUES = new Set([
  GENERATORS.LOCAL_EXTRACTIVE_RULE,
  GENERATORS.LOCAL_EXTRACTIVE,
]);
const USER_INPUT_KINDS = new Set([
  'practice_response',
  'question',
  'correction',
]);

function cleanText(value, max = MAX_ADAPTIVE_TEXT) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanAt(value, fallback = null) {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
  return fallback;
}

function normalizePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : null;
}

function normalizeTextList(value, { maxItems = MAX_ADAPTIVE_ITEMS, maxLength = 400 } = {}) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  value.forEach((item) => {
    const text = cleanText(item, maxLength);
    if (!text || seen.has(text)) return;
    seen.add(text);
    result.push(text);
  });
  return result.slice(0, maxItems);
}

function normalizeMeasured(record) {
  if (!record || typeof record !== 'object') return {};
  const result = {};
  Object.entries(record)
    .slice(0, 20)
    .forEach(([key, value]) => {
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(key)) return;
      if (typeof value === 'boolean') {
        result[key] = value;
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        result[key] = value;
      } else if (typeof value === 'string') {
        result[key] = cleanText(value, 80);
      }
    });
  return result;
}

function normalizeStep(record) {
  if (!record || typeof record !== 'object') return null;
  const action = cleanText(record.action, 80);
  const status = cleanText(record.status, 40);
  if (!action || !status) return null;
  return {
    action,
    status,
    reasonCode: cleanText(record.reasonCode, 80) || null,
    at: cleanAt(record.at),
  };
}

function normalizeSourceFact(record) {
  if (!record || typeof record !== 'object') return null;
  const citation = normalizeCitation(record.citation);
  if (!citation || citation.locator.kind !== CITATION_LOCATOR_KINDS.OFFSET) return null;
  return {
    sourceId: citation.sourceId,
    sourceTitle:
      cleanText(record.sourceTitle, 160) || 'Source',
    page: normalizePage(record.page),
    quote: citation.quote,
    citation,
    at: cleanAt(record.at),
  };
}

function normalizeGeneratedExplanation(record) {
  if (!record || typeof record !== 'object') return null;
  const text = cleanText(record.text, 1600);
  if (!text) return null;
  const generator = GENERATOR_VALUES.has(record.generator)
    ? record.generator
    : 'local_extractive_rule';
  return {
    text,
    generator,
    citation: normalizeCitation(record.citation),
    sourceTitle: cleanText(record.sourceTitle, 160) || 'Source',
    page: normalizePage(record.page),
    at: cleanAt(record.at),
  };
}

function normalizeUserInput(record) {
  if (!record || typeof record !== 'object') return null;
  const text = cleanText(record.text, 300);
  if (!text) return null;
  const kind = USER_INPUT_KINDS.has(record.kind)
    ? record.kind
    : 'practice_response';
  return { kind, text, at: cleanAt(record.at) };
}

function normalizeAssessmentEvidence(record) {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.correct !== 'boolean') return null;
  const checkedAt = cleanAt(record.checkedAt);
  if (!checkedAt) return null;
  return {
    practiceId: cleanText(record.practiceId, 160) || null,
    correct: record.correct,
    checkedAt,
    citation: normalizeCitation(record.citation),
    at: cleanAt(record.at),
  };
}

function normalizeHypothesis(record) {
  if (!record || typeof record !== 'object') return null;
  const text = cleanText(record.text, 500);
  if (!text) return null;
  return {
    text,
    confidence: 'hypothesis',
    at: cleanAt(record.at),
  };
}

function normalizeExperimentalResult(record) {
  if (!record || typeof record !== 'object') return null;
  const strategy = cleanText(record.strategy, 80);
  const outcome = cleanText(record.outcome, 80);
  if (!strategy || !outcome) return null;
  return {
    strategy,
    outcome,
    measured: record.measured === true,
    at: cleanAt(record.at),
  };
}

function normalizeUnresolvedQuestion(record) {
  if (!record || typeof record !== 'object') return null;
  const text = cleanText(record.text, 400);
  if (!text) return null;
  return { text, at: cleanAt(record.at) };
}

function normalizeCorrection(record) {
  if (!record || typeof record !== 'object') return null;
  const text = cleanText(record.text, 400);
  if (!text) return null;
  return { text, at: cleanAt(record.at) };
}

export function normalizeAdaptiveState(record) {
  if (!record || typeof record !== 'object') return null;
  if (record.schemaVersion !== ADAPTIVE_STATE_SCHEMA_VERSION) return null;

  const question = cleanText(record.question || record.goal, 300);
  const goal = cleanText(record.goal || question, 300);
  if (!question || !goal) return null;

  const status = STATUS_VALUES.has(record.status)
    ? record.status
    : ADAPTIVE_STATUSES.RUNNING;
  const currentAction = ACTION_VALUES.has(record.currentAction)
    ? record.currentAction
    : null;

  const steps = Array.isArray(record.steps)
    ? record.steps
        .map(normalizeStep)
        .filter(Boolean)
        .slice(-MAX_ADAPTIVE_STEPS)
    : [];
  const sourceFacts = Array.isArray(record.sourceFacts)
    ? record.sourceFacts
        .map(normalizeSourceFact)
        .filter(Boolean)
        .slice(0, MAX_ADAPTIVE_ITEMS)
    : [];
  const generatedExplanations = Array.isArray(record.generatedExplanations)
    ? record.generatedExplanations
        .map(normalizeGeneratedExplanation)
        .filter(Boolean)
        .slice(-MAX_ADAPTIVE_ITEMS)
    : [];
  const userProvided = Array.isArray(record.userProvided)
    ? record.userProvided
        .map(normalizeUserInput)
        .filter(Boolean)
        .slice(-MAX_ADAPTIVE_ITEMS)
    : [];
  const assessmentEvidence = Array.isArray(record.assessmentEvidence)
    ? record.assessmentEvidence
        .map(normalizeAssessmentEvidence)
        .filter(Boolean)
        .slice(-MAX_ADAPTIVE_ATTEMPTS)
    : [];
  const hypotheses = Array.isArray(record.hypotheses)
    ? record.hypotheses
        .map(normalizeHypothesis)
        .filter(Boolean)
        .slice(-MAX_ADAPTIVE_ITEMS)
    : [];
  const experimentalResults = Array.isArray(record.experimentalResults)
    ? record.experimentalResults
        .map(normalizeExperimentalResult)
        .filter(Boolean)
        .slice(-MAX_ADAPTIVE_ITEMS)
    : [];
  const unresolvedQuestions = Array.isArray(record.unresolvedQuestions)
    ? record.unresolvedQuestions
        .map(normalizeUnresolvedQuestion)
        .filter(Boolean)
        .slice(-MAX_ADAPTIVE_ITEMS)
    : [];
  const corrections = Array.isArray(record.corrections)
    ? record.corrections
        .map(normalizeCorrection)
        .filter(Boolean)
        .slice(-MAX_ADAPTIVE_ITEMS)
    : [];

  return {
    schemaVersion: ADAPTIVE_STATE_SCHEMA_VERSION,
    id: cleanText(record.id, 160) || createRecordId('adaptive'),
    goal,
    question,
    status,
    currentAction,
    summary: cleanText(record.summary, 800),
    measured: normalizeMeasured(record.measured),
    assumptions: normalizeTextList(record.assumptions),
    uncertainties: normalizeTextList(record.uncertainties),
    attemptedStrategies: normalizeTextList(record.attemptedStrategies, {
      maxItems: 8,
      maxLength: 80,
    }),
    steps,
    sourceFacts,
    generatedExplanations,
    userProvided,
    assessmentEvidence,
    hypotheses,
    experimentalResults,
    unresolvedQuestions,
    corrections,
    startedAt: cleanAt(record.startedAt),
    updatedAt: cleanAt(record.updatedAt, cleanAt(record.startedAt)),
  };
}

export function createAdaptiveState({
  goal,
  question,
  now = new Date().toISOString(),
} = {}) {
  return normalizeAdaptiveState({
    schemaVersion: ADAPTIVE_STATE_SCHEMA_VERSION,
    id: createRecordId('adaptive'),
    goal,
    question,
    status: ADAPTIVE_STATUSES.RUNNING,
    currentAction: null,
    summary: '',
    measured: {},
    assumptions: [],
    uncertainties: [],
    attemptedStrategies: [],
    steps: [],
    sourceFacts: [],
    generatedExplanations: [],
    userProvided: [],
    assessmentEvidence: [],
    hypotheses: [],
    experimentalResults: [],
    unresolvedQuestions: [],
    corrections: [],
    startedAt: now,
    updatedAt: now,
  });
}

function withState(state, patch) {
  const base = normalizeAdaptiveState(state);
  if (!base) return null;
  return normalizeAdaptiveState({ ...base, ...patch });
}

export function appendAdaptiveStep(state, step) {
  const base = normalizeAdaptiveState(state);
  if (!base) return null;
  const normalized = normalizeStep(step);
  if (!normalized) return base;
  return withState(base, {
    steps: [...base.steps, normalized].slice(-MAX_ADAPTIVE_STEPS),
    updatedAt: normalized.at || base.updatedAt,
  });
}

export function addAdaptiveSourceFacts(state, facts = [], now) {
  const base = normalizeAdaptiveState(state);
  if (!base) return null;
  const seen = new Set(
    base.sourceFacts.map(
      (fact) =>
        `${fact.citation.sourceId}:${fact.citation.locator.start}:${fact.citation.locator.end}`
    )
  );
  const next = [...base.sourceFacts];
  facts.forEach((fact) => {
    const normalized = normalizeSourceFact(fact);
    if (!normalized) return;
    const key = `${normalized.citation.sourceId}:${normalized.citation.locator.start}:${normalized.citation.locator.end}`;
    if (seen.has(key)) return;
    seen.add(key);
    next.push(normalized);
  });
  return withState(base, {
    sourceFacts: next.slice(0, MAX_ADAPTIVE_ITEMS),
    updatedAt: now || base.updatedAt,
  });
}

export function addAdaptiveGeneratedExplanation(state, explanation) {
  const base = normalizeAdaptiveState(state);
  if (!base) return null;
  const normalized = normalizeGeneratedExplanation(explanation);
  if (!normalized) return base;
  return withState(base, {
    generatedExplanations: [...base.generatedExplanations, normalized].slice(
      -MAX_ADAPTIVE_ITEMS
    ),
    updatedAt: normalized.at || base.updatedAt,
  });
}

export function addAdaptiveUserInput(state, input) {
  const base = normalizeAdaptiveState(state);
  if (!base) return null;
  const normalized = normalizeUserInput(input);
  if (!normalized) return base;
  return withState(base, {
    userProvided: [...base.userProvided, normalized].slice(-MAX_ADAPTIVE_ITEMS),
    updatedAt: normalized.at || base.updatedAt,
  });
}

export function addAdaptiveAssessment(state, evidence) {
  const base = normalizeAdaptiveState(state);
  if (!base) return null;
  const normalized = normalizeAssessmentEvidence(evidence);
  if (!normalized) return base;
  return withState(base, {
    assessmentEvidence: [
      ...base.assessmentEvidence,
      normalized,
    ].slice(-MAX_ADAPTIVE_ATTEMPTS),
    updatedAt: normalized.at || base.updatedAt,
  });
}

export function addAdaptiveHypothesis(state, hypothesis) {
  const base = normalizeAdaptiveState(state);
  if (!base) return null;
  const normalized = normalizeHypothesis(hypothesis);
  if (!normalized) return base;
  return withState(base, {
    hypotheses: [...base.hypotheses, normalized].slice(-MAX_ADAPTIVE_ITEMS),
    updatedAt: normalized.at || base.updatedAt,
  });
}

export function addAdaptiveExperimentalResult(state, result) {
  const base = normalizeAdaptiveState(state);
  if (!base) return null;
  const normalized = normalizeExperimentalResult(result);
  if (!normalized) return base;
  return withState(base, {
    experimentalResults: [
      ...base.experimentalResults,
      normalized,
    ].slice(-MAX_ADAPTIVE_ITEMS),
    updatedAt: normalized.at || base.updatedAt,
  });
}

export function addAdaptiveUnresolvedQuestion(state, text, now) {
  const base = normalizeAdaptiveState(state);
  if (!base) return null;
  const normalized = normalizeUnresolvedQuestion({ text, at: now });
  if (!normalized) return base;
  return withState(base, {
    unresolvedQuestions: [
      ...base.unresolvedQuestions,
      normalized,
    ].slice(-MAX_ADAPTIVE_ITEMS),
    updatedAt: normalized.at || base.updatedAt,
  });
}

export function addAdaptiveCorrection(state, text, now) {
  const base = normalizeAdaptiveState(state);
  if (!base) return null;
  const normalized = normalizeCorrection({ text, at: now });
  if (!normalized) return base;
  return withState(base, {
    corrections: [...base.corrections, normalized].slice(-MAX_ADAPTIVE_ITEMS),
    updatedAt: normalized.at || base.updatedAt,
  });
}

export function addAdaptiveUncertainties(state, uncertainties = [], now) {
  const base = normalizeAdaptiveState(state);
  if (!base) return null;
  const merged = normalizeTextList(
    [...base.uncertainties, ...(Array.isArray(uncertainties) ? uncertainties : [])],
    { maxItems: 8, maxLength: 400 }
  );
  return withState(base, {
    uncertainties: merged,
    updatedAt: now || base.updatedAt,
  });
}

export function setAdaptiveOutcome(
  state,
  {
    status,
    currentAction,
    summary,
    measured,
    assumptions,
    uncertainties,
    now,
  } = {}
) {
  const base = normalizeAdaptiveState(state);
  if (!base) return null;
  const nextStatus = STATUS_VALUES.has(status) ? status : base.status;
  const nextAction = ACTION_VALUES.has(currentAction)
    ? currentAction
    : currentAction === null
      ? null
      : base.currentAction;
  const nextAssumptions = assumptions
    ? normalizeTextList([...base.assumptions, ...assumptions], {
        maxItems: 8,
        maxLength: 400,
      })
    : base.assumptions;
  const nextUncertainties = uncertainties
    ? normalizeTextList([...base.uncertainties, ...uncertainties], {
        maxItems: 8,
        maxLength: 400,
      })
    : base.uncertainties;

  return withState(base, {
    status: nextStatus,
    currentAction: nextAction,
    summary: summary === undefined ? base.summary : cleanText(summary, 800),
    measured:
      measured === undefined
        ? base.measured
        : { ...base.measured, ...normalizeMeasured(measured) },
    assumptions: nextAssumptions,
    uncertainties: nextUncertainties,
    updatedAt: now || base.updatedAt,
  });
}

export function addAdaptiveStrategy(state, strategy, now) {
  const base = normalizeAdaptiveState(state);
  if (!base) return null;
  const clean = cleanText(strategy, 80);
  if (!clean) return base;
  const next = [...new Set([...base.attemptedStrategies, clean])].slice(-8);
  return withState(base, {
    attemptedStrategies: next,
    updatedAt: now || base.updatedAt,
  });
}

/**
 * Remove saved quotations that no longer verify against the current source
 * text. Assessment records remain, but a stale citation reference is removed.
 */
export function revalidateAdaptiveState(state, { isVerified } = {}) {
  const base = normalizeAdaptiveState(state);
  if (!base) return null;
  const verifier = typeof isVerified === 'function' ? isVerified : () => false;
  let removed = 0;

  const isSafeVerified = (citation) => {
    if (!citation) return false;
    try {
      return verifier(citation) === true;
    } catch {
      return false;
    }
  };

  const sourceFacts = base.sourceFacts.filter((fact) => {
    const ok = isSafeVerified(fact.citation);
    if (!ok) removed += 1;
    return ok;
  });
  const generatedExplanations = base.generatedExplanations.filter((item) => {
    if (!item.citation) return true;
    const ok = isSafeVerified(item.citation);
    if (!ok) removed += 1;
    return ok;
  });
  const assessmentEvidence = base.assessmentEvidence.map((item) => {
    if (!item.citation || isSafeVerified(item.citation)) return item;
    removed += 1;
    return { ...item, citation: null };
  });

  let uncertainties = base.uncertainties;
  if (removed > 0) {
    uncertainties = normalizeTextList(
      [
        ...uncertainties,
        'A saved source quotation used by this adaptive loop no longer verifies against the current sources and was removed.',
      ],
      { maxItems: 8, maxLength: 400 }
    );
  }

  return normalizeAdaptiveState({
    ...base,
    sourceFacts,
    generatedExplanations,
    assessmentEvidence,
    uncertainties,
  });
}

export function getAdaptiveActionLabel(action) {
  return ADAPTIVE_ACTION_LABELS[action] || 'Adaptive action';
}
