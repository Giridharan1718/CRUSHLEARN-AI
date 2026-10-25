// Bounded adaptive intelligence loop for the notebook study desk.
//
// One complete workflow is implemented here:
//   observe -> select -> execute -> evaluate -> adapt -> update shared context.
//
// The default adapters are deterministic local rules. Retrieval quotes source
// text, the practice check measures recall, and the worked example is assembled
// from a verified source citation. No network service or language model is
// called. The adapter seam allows a future, separately-authorized grounded
// explanation service to replace only the relevant step.
//
// Execution is bounded by a step count, per-action timeout, retry limit and an
// optional AbortSignal. Logs contain action/outcome metadata only, never the
// learner's question, answer or source quotations.

import { CITATION_LOCATOR_KINDS, validateCitation } from '../notebooks/citations.mjs';
import {
  readySources,
  sourceTextMap as sharedSourceTextMap,
} from '../notebooks/sourceAccess.mjs';
import {
  getContentText,
  normalizeSearchQuery,
  tokenize,
} from '../notebooks/sourceText.mjs';
import { getVisualExplanationById } from '../visual/visualCatalog.mjs';
import { validateVisualExplanation } from '../visual/visualSchema.mjs';
import {
  CONTEXT_VISUAL_KINDS,
  createEmptyLearningContext,
  getQuestionTopicTerms,
  normalizeLearningContext,
  selectNextAction,
  updateContextWithAdaptive,
} from './learningContext.mjs';
import {
  evaluatePracticeResponse,
  runNotebookTurn,
} from './notebookOrchestrator.mjs';
import {
  ADAPTIVE_ACTIONS,
  ADAPTIVE_STATUSES,
  MAX_ADAPTIVE_ITEMS,
  addAdaptiveAssessment,
  addAdaptiveCorrection,
  addAdaptiveExperimentalResult,
  addAdaptiveGeneratedExplanation,
  addAdaptiveHypothesis,
  addAdaptiveSourceFacts,
  addAdaptiveStrategy,
  addAdaptiveUncertainties,
  addAdaptiveUnresolvedQuestion,
  addAdaptiveUserInput,
  appendAdaptiveStep,
  createAdaptiveState,
  normalizeAdaptiveState,
  setAdaptiveOutcome,
} from './adaptiveState.mjs';
import { detectNotebookDisagreements } from '../ai/researchService.mjs';

export const ADAPTIVE_LOOP_DEFAULT_LIMITS = Object.freeze({
  maxSteps: 8,
  maxActionAttempts: 2,
  timeoutMs: 8000,
  overallTimeoutMs: 20000,
});

const EVENT_TYPES = new Set(['question', 'practice_response', 'resume']);

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function sourceTextMap(sources, sourceContents) {
  return sharedSourceTextMap(sources, sourceContents);
}

function readySourceList(sources, sourceContents) {
  return readySources(sources).filter((source) => sourceContents?.[source.id]);
}

function citationVerifier(sources, sourceContents) {
  const sourceIds = (Array.isArray(sources) ? sources : []).map(
    (source) => source.id
  );
  const sourceTexts = sourceTextMap(sources, sourceContents);
  return (citation) => {
    if (!citation) return false;
    try {
      return validateCitation(citation, {
        sourceIds,
        sourceTexts,
        requireSourceText: true,
      }).verified;
    } catch {
      return false;
    }
  };
}

function normalizeEvent(event) {
  if (!event || typeof event !== 'object') {
    return { ok: false, errorCode: 'invalid_event' };
  }
  const type = EVENT_TYPES.has(event.type) ? event.type : 'question';
  if (type === 'question') {
    const question = normalizeSearchQuery(event.question).slice(0, 300);
    if (!question) return { ok: false, errorCode: 'empty_question' };
    return { ok: true, type, question };
  }
  if (type === 'practice_response') {
    return {
      ok: true,
      type,
      response: String(event.response ?? '').slice(0, 300),
    };
  }
  return { ok: true, type };
}

function defaultCheckAccess({ userId, notebookId } = {}) {
  if (typeof userId !== 'string' || !userId.trim()) {
    return { ok: false, errorCode: 'permission_denied' };
  }
  if (typeof notebookId !== 'string' || !notebookId.trim()) {
    return { ok: false, errorCode: 'permission_denied' };
  }
  return { ok: true };
}

function defaultRetrieve({
  question,
  sources,
  sourceContents,
  previousContext,
  now,
}) {
  return runNotebookTurn({
    question,
    sources,
    sourceContents,
    previousContext,
    now,
  });
}

function defaultEvaluateRecall({ context, response, now }) {
  return evaluatePracticeResponse({ context, response, now });
}

function defaultBuildWorkedExample({ context, now }) {
  const practice = context?.practice;
  if (!practice?.citation || practice.citation.locator?.kind !== CITATION_LOCATOR_KINDS.OFFSET) {
    return {
      ok: false,
      errorCode: 'no_verified_practice_citation',
    };
  }
  return {
    ok: true,
    kind: 'worked_example',
    generator: 'local_extractive_rule',
    text: `The verified source sentence is: "${practice.citation.quote}" The missing source word was "${practice.answer}".`,
    answer: practice.answer,
    quote: practice.citation.quote,
    citation: practice.citation,
    sourceTitle: practice.sourceTitle,
    page: practice.page,
    note: 'Source-based worked example. It reveals the missing word and is not a new assessment.',
    at: now,
  };
}

function defaultValidateVisual(visual, { sources, sourceContents } = {}) {
  if (!visual) {
    return { ok: true, status: 'absent', visual: null, errors: [] };
  }
  if (visual.kind === CONTEXT_VISUAL_KINDS.SOURCE_EVIDENCE) {
    if (!Array.isArray(visual.items) || visual.items.length === 0) {
      return {
        ok: false,
        status: 'invalid',
        visual: null,
        errors: ['The source evidence map has no quotation items.'],
      };
    }
    const verify = citationVerifier(sources, sourceContents);
    const invalidItem = visual.items.find((item) => !verify(item?.citation));
    if (invalidItem) {
      return {
        ok: false,
        status: 'invalid',
        visual: null,
        errors: ['A source evidence quotation did not verify against source text.'],
      };
    }
    return { ok: true, status: 'validated', visual, errors: [] };
  }
  if (visual.kind === CONTEXT_VISUAL_KINDS.CURATED) {
    const authored = visual.id ? getVisualExplanationById(visual.id) : null;
    if (!authored) {
      return {
        ok: false,
        status: 'invalid',
        visual: null,
        errors: ['The curated visual is not present in the authored catalog.'],
      };
    }
    const validation = validateVisualExplanation(authored);
    if (!validation.ok) {
      return {
        ok: false,
        status: 'invalid',
        visual: null,
        errors: ['The curated visual failed schema validation.'],
      };
    }
    return { ok: true, status: 'validated', visual, errors: [] };
  }
  return {
    ok: false,
    status: 'invalid',
    visual: null,
    errors: ['The visual kind is not supported.'],
  };
}

function buildRelaxedQuery(question, results = []) {
  const original = normalizeSearchQuery(question);
  const originalTerms = [...new Set(tokenize(original))].sort().join(' ');
  const matched = [];
  (Array.isArray(results) ? results : []).forEach((result) => {
    (Array.isArray(result?.matchedTerms) ? result.matchedTerms : []).forEach(
      (term) => {
        const value = cleanText(term, 80);
        if (value && !matched.includes(value)) matched.push(value);
      }
    );
  });
  const topicTerms = getQuestionTopicTerms(original);
  const candidates = matched.length > 0 ? matched : topicTerms;
  const relaxed = normalizeSearchQuery(candidates.slice(0, 3).join(' '));
  if (!relaxed) return '';
  const relaxedTerms = [...new Set(tokenize(relaxed))].sort().join(' ');
  if (relaxedTerms === originalTerms) return '';
  return relaxed;
}

function sourceFactsFromResult(result, verify) {
  const items = Array.isArray(result?.turn?.evidence)
    ? result.turn.evidence
    : Array.isArray(result?.visual?.items)
      ? result.visual.items
      : [];
  const facts = [];
  items.forEach((item) => {
    if (!verify(item?.citation)) return;
    facts.push({
      sourceId: item.citation.sourceId,
      sourceTitle: item.sourceTitle,
      page: item.page,
      quote: item.citation.quote,
      citation: item.citation,
    });
  });
  if (verify(result?.citation)) {
    const alreadyPresent = facts.some(
      (fact) =>
        fact.citation.sourceId === result.citation.sourceId &&
        fact.citation.locator.start === result.citation.locator.start &&
        fact.citation.locator.end === result.citation.locator.end
    );
    if (!alreadyPresent) {
      facts.push({
        sourceId: result.citation.sourceId,
        sourceTitle: result.sourceTitle,
        page: result.page,
        quote: result.citation.quote,
        citation: result.citation,
      });
    }
  }
  return facts.slice(0, MAX_ADAPTIVE_ITEMS);
}

function createReport({ adaptive, logs, startedAt, finishedAt, eventType }) {
  return {
    eventType,
    status: adaptive.status,
    selectedAction: adaptive.currentAction,
    measured: adaptive.measured,
    assumptions: adaptive.assumptions,
    uncertainties: adaptive.uncertainties,
    logs,
    startedAt,
    finishedAt,
  };
}

function createTimeoutPromise(task, timeoutMs, signal) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (signal?.removeEventListener) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve(result);
    };
    const onAbort = () => finish({ ok: false, cancelled: true });

    if (signal?.aborted) {
      finish({ ok: false, cancelled: true });
      return;
    }
    if (signal?.addEventListener) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
    if (timeoutMs > 0) {
      timer = setTimeout(
        () => finish({ ok: false, timedOut: true }),
        timeoutMs
      );
    }
    Promise.resolve()
      .then(task)
      .then(
        (value) => finish({ ok: true, value }),
        () => finish({ ok: false, failed: true })
      );
  });
}

function addLog(logs, entry) {
  logs.push({
    action: entry.action,
    attempt: entry.attempt,
    outcome: entry.outcome,
    durationMs: Number.isFinite(entry.durationMs)
      ? Math.max(0, Math.round(entry.durationMs))
      : 0,
  });
}

function attachAdaptive(context, adaptive, now) {
  const base = normalizeLearningContext(context);
  if (!base) return context;
  return updateContextWithAdaptive(base, adaptive, now);
}

function buildNextAction({
  answer,
  practice,
  practiceResult,
  relatedVisual,
  readySourceCount,
}) {
  return selectNextAction({
    answer,
    practice,
    practiceResult,
    relatedVisual,
    readySourceCount,
  });
}

export function createAdaptiveIntelligenceLoop(adapters = {}) {
  const retrieve = adapters.retrieveSourceEvidence || defaultRetrieve;
  const evaluateRecall = adapters.evaluateRecall || defaultEvaluateRecall;
  const buildWorkedExample =
    adapters.buildWorkedExample || defaultBuildWorkedExample;
  const validateVisual = adapters.validateVisual || defaultValidateVisual;
  const checkAccess = adapters.checkAccess || defaultCheckAccess;
  const now = adapters.now || (() => new Date().toISOString());
  const clock = adapters.clock || (() => Date.now());

  const evaluateRetrieval = ({
    result,
    question,
    sources,
    sourceContents,
  }) => {
    const verify = citationVerifier(sources, sourceContents);
    if (!result || result.answered !== true || !result.answer) {
      return {
        ok: false,
        kind: result?.ok === false ? 'retrieval_error' : 'no_answer',
        reasonCode: result?.ok === false ? 'retrieval_error' : 'no_answer',
        errors: Array.isArray(result?.errors) ? result.errors : [],
        result,
      };
    }
    if (!verify(result.citation)) {
      return {
        ok: false,
        kind: 'invalid_citation',
        reasonCode: 'citation_not_verified',
        errors: ['The selected source answer did not verify against source text.'],
        result,
      };
    }

    const normalizedAnswer = String(result.answer || '')
      .replace(/\s+/g, ' ')
      .trim();
    const normalizedQuote = String(result.citation.quote || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalizedQuote || normalizedAnswer !== normalizedQuote) {
      return {
        ok: false,
        kind: 'invalid_answer',
        reasonCode: 'answer_not_equal_to_citation',
        errors: [
          'The candidate answer did not match its verified quotation and was discarded.',
        ],
        result,
      };
    }
    if (result.sourceId && result.sourceId !== result.citation.sourceId) {
      return {
        ok: false,
        kind: 'invalid_citation',
        reasonCode: 'source_id_mismatch',
        errors: ['The candidate answer source did not match its citation.'],
        result,
      };
    }

    const queryTerms = new Set(tokenize(result.resolvedQuestion || question));
    const answerTerms = new Set(tokenize(result.answer));
    const overlap = [...queryTerms].filter((term) => answerTerms.has(term));
    if (overlap.length === 0) {
      return {
        ok: false,
        kind: 'irrelevant_source',
        reasonCode: 'no_query_overlap',
        errors: [
          'The closest source passage shared no query term with the question and was not treated as an answer.',
        ],
        result,
      };
    }

    const visualCheck = validateVisual(result.visual, {
      sources,
      sourceContents,
    });
    const relatedVisualCheck = validateVisual(result.relatedVisual, {
      sources,
      sourceContents,
    });
    const practice =
      result.practice && verify(result.practice.citation)
        ? result.practice
        : null;

    return {
      ok: true,
      kind: 'answer_found',
      reasonCode: 'citation_and_relevance_verified',
      result: {
        ...result,
        answer: result.citation.quote,
        sourceId: result.citation.sourceId,
        sourceTitle:
          (Array.isArray(sources) ? sources : []).find(
            (source) => source.id === result.citation.sourceId
          )?.title || result.sourceTitle || 'Source',
      },
      citation: result.citation,
      overlap,
      visual: visualCheck.ok ? visualCheck.visual : null,
      visualStatus: visualCheck.status,
      visualErrors: visualCheck.errors || [],
      relatedVisual: relatedVisualCheck.ok ? relatedVisualCheck.visual : null,
      relatedVisualStatus: relatedVisualCheck.status,
      relatedVisualErrors: relatedVisualCheck.errors || [],
      practice,
      practiceDropped: Boolean(result.practice && !practice),
      sourceFacts: sourceFactsFromResult(result, verify),
    };
  };

  const run = async (input = {}) => {
    const event = normalizeEvent(
      input.event || { type: 'question', question: input.question }
    );
    const limits = {
      ...ADAPTIVE_LOOP_DEFAULT_LIMITS,
      ...(input.limits || {}),
    };
    const startedAt = now();
    const startedMs = clock();
    const logs = [];
    const signal = input.signal;
    const userId =
      typeof input.userId === 'string' && input.userId.trim()
        ? input.userId
        : input.previousContext?.userId;
    const notebookId =
      typeof input.notebookId === 'string' && input.notebookId.trim()
        ? input.notebookId
        : input.previousContext?.notebookId;

    const finish = ({
      adaptive,
      context,
      passthrough = {},
      status,
      errorCode,
    }) => {
      const normalizedAdaptive = normalizeAdaptiveState(adaptive);
      const resultStatus =
        status ||
        normalizedAdaptive?.status ||
        ADAPTIVE_STATUSES.BLOCKED;
      return {
        ...passthrough,
        ok: passthrough.ok !== undefined ? passthrough.ok : true,
        status: resultStatus,
        summary: normalizedAdaptive?.summary || '',
        errorCode: errorCode || null,
        adaptive: normalizedAdaptive,
        context,
        report: normalizedAdaptive
          ? createReport({
              adaptive: normalizedAdaptive,
              logs,
              startedAt,
              finishedAt: now(),
              eventType: event.type,
            })
          : null,
      };
    };

    if (signal?.aborted) {
      return finish({
        adaptive: null,
        context: input.previousContext || null,
        status: ADAPTIVE_STATUSES.CANCELLED,
        errorCode: 'cancelled',
      });
    }

    let access;
    try {
      access = await Promise.resolve(
        checkAccess({ userId, notebookId, context: input.previousContext })
      );
    } catch {
      access = { ok: false, errorCode: 'permission_check_failed' };
    }
    if (!access?.ok) {
      return finish({
        adaptive: null,
        context: input.previousContext || null,
        status: ADAPTIVE_STATUSES.BLOCKED,
        errorCode: access?.errorCode || 'permission_denied',
      });
    }

    if (!event.ok) {
      return finish({
        adaptive: null,
        context: input.previousContext || null,
        status: ADAPTIVE_STATUSES.BLOCKED,
        errorCode: event.errorCode,
      });
    }

    let baseContext = normalizeLearningContext(input.previousContext, {
      userId,
      notebookId,
    });
    if (!baseContext && event.type === 'question') {
      baseContext = createEmptyLearningContext(
        userId,
        notebookId,
        startedAt
      );
    }
    if (!baseContext) {
      return finish({
        adaptive: null,
        context: null,
        status: ADAPTIVE_STATUSES.BLOCKED,
        errorCode: 'missing_notebook_context',
      });
    }

    const question =
      event.type === 'question'
        ? event.question
        : cleanText(baseContext.currentQuestion, 300);
    if (!question) {
      return finish({
        adaptive: null,
        context: baseContext,
        status: ADAPTIVE_STATUSES.BLOCKED,
        errorCode: 'missing_question',
      });
    }

    let adaptive =
      event.type === 'question'
        ? createAdaptiveState({ goal: question, question, now: startedAt })
        : normalizeAdaptiveState(baseContext.adaptive) ||
          createAdaptiveState({ goal: question, question, now: startedAt });

    const readySources = readySourceList(input.sources, input.sourceContents);
    const verify = citationVerifier(input.sources, input.sourceContents);
    let stepCount = 0;
    let actionExecutions = 0;

    const remainingBudget = () => {
      const overall = Number(limits.overallTimeoutMs) || 0;
      if (!overall) return Number(limits.timeoutMs) || 0;
      return Math.max(0, overall - (clock() - startedMs));
    };

    const executeWithRetries = async ({ action, executor, strategy }) => {
      const attempts = Math.max(1, Number(limits.maxActionAttempts) || 1);
      const maxSteps = Math.max(1, Number(limits.maxSteps) || 1);
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (actionExecutions >= maxSteps) {
          addLog(logs, {
            action,
            attempt: 0,
            outcome: 'skipped_step_limit',
            durationMs: 0,
          });
          return {
            ok: false,
            stepLimit: true,
            attempts: attempt - 1,
          };
        }
        actionExecutions += 1;
        if (signal?.aborted) {
          return { ok: false, cancelled: true, attempts: attempt - 1 };
        }
        const remaining = remainingBudget();
        if (remaining <= 0) {
          return { ok: false, timedOut: true, attempts: attempt - 1 };
        }
        const actionStarted = clock();
        const timeoutMs = Math.min(
          Number(limits.timeoutMs) || remaining,
          remaining
        );
        const execution = await createTimeoutPromise(
          () => executor(attempt),
          timeoutMs,
          signal
        );
        addLog(logs, {
          action,
          attempt,
          outcome: execution.ok
            ? 'succeeded'
            : execution.cancelled
              ? 'cancelled'
              : execution.timedOut
                ? 'timed_out'
                : 'failed',
          durationMs: clock() - actionStarted,
        });
        if (execution.ok) {
          return {
            ok: true,
            value: execution.value,
            attempt,
            attempts: attempt,
            strategy,
          };
        }
        if (execution.cancelled) {
          return {
            ok: false,
            cancelled: true,
            attempt,
            attempts: attempt,
            strategy,
          };
        }
        if (attempt === attempts) {
          return {
            ok: false,
            timedOut: Boolean(execution.timedOut),
            failed: Boolean(execution.failed),
            attempt,
            attempts: attempt,
            strategy,
          };
        }
      }
      return { ok: false, failed: true, attempts };
    };

    const finalizeWithAdaptive = ({
      context,
      passthrough = {},
      status,
      errorCode,
    }) => {
      const attached = attachAdaptive(context || baseContext, adaptive, now());
      return finish({
        adaptive,
        context: attached,
        passthrough,
        status,
        errorCode,
      });
    };

    const retrieveOnce = async (query, strategy, previousContext) => {
      if (readySources.length === 0) {
        addLog(logs, {
          action: ADAPTIVE_ACTIONS.RETRIEVE_SOURCE_EVIDENCE,
          attempt: 0,
          outcome: 'skipped_no_ready_sources',
          durationMs: 0,
        });
        return {
          ok: false,
          skipped: true,
          reasonCode: 'no_ready_sources',
          attempts: 0,
        };
      }
      return executeWithRetries({
        action: ADAPTIVE_ACTIONS.RETRIEVE_SOURCE_EVIDENCE,
        strategy,
        executor: () =>
          retrieve({
            question: query,
            sources: readySources,
            sourceContents: input.sourceContents,
            previousContext,
            now: now(),
            userId,
            notebookId,
          }),
      });
    };

    const markFailure = ({
      strategy,
      reasonCode,
      summary,
      context,
      passthrough = {},
      status = ADAPTIVE_STATUSES.FAILED,
    }) => {
      adaptive = addAdaptiveExperimentalResult(adaptive, {
        strategy,
        outcome: reasonCode,
        measured: true,
        at: now(),
      });
      adaptive = addAdaptiveUnresolvedQuestion(
        adaptive,
        question,
        now()
      );
      adaptive = appendAdaptiveStep(adaptive, {
        action: ADAPTIVE_ACTIONS.RETRIEVE_SOURCE_EVIDENCE,
        status: 'failed',
        reasonCode,
        at: now(),
      });
      adaptive = setAdaptiveOutcome(adaptive, {
        status,
        currentAction: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
        summary,
        measured: {
          retrievalSucceeded: false,
          failureCode: reasonCode,
        },
        assumptions: [
          'No answer was produced when the source-retrieval step failed.',
        ],
        uncertainties: [
          'The failure cause was not observable from the local adapter, so the question remains unresolved.',
        ],
        now: now(),
      });
      return finalizeWithAdaptive({
        context,
        passthrough,
        status,
        errorCode: reasonCode,
      });
    };

    if (event.type === 'question') {
      let current = baseContext;
      let lastResult = null;
      let evaluation = null;
      let strategy = 'initial_query';
      let query = question;

      const firstAttempt = await retrieveOnce(query, strategy, current);
      if (firstAttempt.cancelled) {
        return finish({
          adaptive,
          context: current,
          status: ADAPTIVE_STATUSES.CANCELLED,
          errorCode: 'cancelled',
        });
      }
      if (!firstAttempt.ok) {
        const reasonCode = firstAttempt.skipped
          ? firstAttempt.reasonCode
          : firstAttempt.stepLimit
            ? 'step_limit'
            : firstAttempt.timedOut
            ? 'retrieval_timeout'
            : 'retrieval_failed';
        const summary = firstAttempt.stepLimit
          ? 'The adaptive loop reached its action limit before completing retrieval.'
          : firstAttempt.skipped
          ? 'No ready source is available, so no source-grounded answer was produced.'
          : 'The source-retrieval step failed, so no answer was produced.';
        return markFailure({
          strategy,
          reasonCode,
          summary,
          context: current,
          passthrough: {
            ok: true,
            answered: false,
            question,
            answer: null,
            citation: null,
            results: [],
            errors: [
              firstAttempt.skipped
                ? 'Add at least one ready source before asking a question.'
                : 'The source retrieval failed. No answer was generated.',
            ],
            message: summary,
            visual: null,
            relatedVisual: null,
            practice: null,
            nextAction: current.nextAction,
          },
        });
      }

      lastResult = firstAttempt.value;
      evaluation = evaluateRetrieval({
        result: lastResult,
        question,
        sources: input.sources,
        sourceContents: input.sourceContents,
      });
      stepCount += 1;

      if (!evaluation.ok) {
        adaptive = addAdaptiveStrategy(adaptive, strategy, now());
        adaptive = addAdaptiveExperimentalResult(adaptive, {
          strategy,
          outcome: evaluation.kind,
          measured: true,
          at: now(),
        });
        adaptive = appendAdaptiveStep(adaptive, {
          action: ADAPTIVE_ACTIONS.RETRIEVE_SOURCE_EVIDENCE,
          status: 'insufficient',
          reasonCode: evaluation.reasonCode,
          at: now(),
        });

        const relaxedQuery = buildRelaxedQuery(
          question,
          lastResult?.results
        );
        if (relaxedQuery) {
          const relaxedAttempt = await retrieveOnce(
            relaxedQuery,
            'relaxed_query',
            current
          );
          if (relaxedAttempt.cancelled) {
            return finish({
              adaptive,
              context: current,
              status: ADAPTIVE_STATUSES.CANCELLED,
              errorCode: 'cancelled',
            });
          }
          if (relaxedAttempt.ok) {
            const relaxedEvaluation = evaluateRetrieval({
              result: relaxedAttempt.value,
              question,
              sources: input.sources,
              sourceContents: input.sourceContents,
            });
            stepCount += 1;
            adaptive = addAdaptiveStrategy(
              adaptive,
              'relaxed_query',
              now()
            );
            adaptive = addAdaptiveExperimentalResult(adaptive, {
              strategy: 'relaxed_query',
              outcome: relaxedEvaluation.ok
                ? 'answer_found'
                : relaxedEvaluation.kind,
              measured: true,
              at: now(),
            });
            if (relaxedEvaluation.ok) {
              lastResult = relaxedAttempt.value;
              evaluation = relaxedEvaluation;
              strategy = 'relaxed_query';
            }
          } else {
            adaptive = addAdaptiveStrategy(
              adaptive,
              'relaxed_query',
              now()
            );
            adaptive = addAdaptiveExperimentalResult(adaptive, {
              strategy: 'relaxed_query',
              outcome: relaxedAttempt.timedOut
                ? 'timeout'
                : 'adapter_failure',
              measured: true,
              at: now(),
            });
          }
        }
      }

      if (!evaluation?.ok) {
        const contextForDisplay = lastResult?.context || current;
        const message =
          evaluation?.kind === 'irrelevant_source'
            ? 'The closest source passage did not share a query term with the question. It was not treated as an answer.'
            : evaluation?.kind === 'invalid_citation'
              ? 'A candidate source answer failed citation validation and was discarded.'
              : lastResult?.message ||
                'No relevant source passage answered this question.';
        adaptive = addAdaptiveUnresolvedQuestion(adaptive, question, now());
        adaptive = addAdaptiveUncertainties(
          adaptive,
          [
            'No verified, query-relevant source quotation was found for this question.',
          ],
          now()
        );
        adaptive = setAdaptiveOutcome(adaptive, {
          status: ADAPTIVE_STATUSES.BLOCKED,
          currentAction: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
          summary:
            'The adaptive loop stopped without an answer rather than presenting an unverified or irrelevant passage.',
          measured: {
            retrievalSucceeded: false,
            citationVerified: false,
            sourceCount: readySources.length,
          },
          assumptions: [
            'Question terms appearing in a source sentence are treated as a relevance signal; this is not a semantic entailment check.',
          ],
          now: now(),
        });
        adaptive = appendAdaptiveStep(adaptive, {
          action: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
          status: 'blocked',
          reasonCode: evaluation?.reasonCode || 'no_answer',
          at: now(),
        });
        return finalizeWithAdaptive({
          context: contextForDisplay,
          passthrough: {
            ok: true,
            answered: false,
            question,
            answer: null,
            citation: null,
            results: lastResult?.results || [],
            errors: evaluation?.errors || [],
            message,
            visual: null,
            relatedVisual: null,
            practice: null,
            nextAction: lastResult?.nextAction || current.nextAction,
          },
        });
      }

      current = lastResult.context || current;
      if (lastResult.visual !== evaluation.visual) {
        current = { ...current, visual: evaluation.visual };
      }
      if (lastResult.relatedVisual !== evaluation.relatedVisual) {
        current = { ...current, relatedVisual: evaluation.relatedVisual };
      }
      if (lastResult.practice !== evaluation.practice) {
        current = { ...current, practice: evaluation.practice };
      }

      adaptive = addAdaptiveStrategy(adaptive, strategy, now());
      adaptive = addAdaptiveSourceFacts(
        adaptive,
        evaluation.sourceFacts,
        now()
      );
      adaptive = addAdaptiveExperimentalResult(adaptive, {
        strategy,
        outcome: 'answer_found',
        measured: true,
        at: now(),
      });
      adaptive = appendAdaptiveStep(adaptive, {
        action: ADAPTIVE_ACTIONS.RETRIEVE_SOURCE_EVIDENCE,
        status: 'succeeded',
        reasonCode: 'citation_and_relevance_verified',
        at: now(),
      });

      // The loop actively checks for explicit cross-source conflict signals
      // after retrieval. This is a lexical check, not a judgment about which
      // source is correct, and it is skipped with a stated reason when there is
      // only one source to compare.
      let conflictReport = {
        ok: true,
        conflicts: [],
        skipped: true,
        reason: 'At least two ready sources are needed to compare passages.',
      };
      if (readySources.length >= 2) {
        conflictReport = detectNotebookDisagreements({
          question,
          sources: readySources,
          sourceContents: input.sourceContents,
          results: lastResult.results || [],
        });
        if (conflictReport.ok) {
          adaptive = appendAdaptiveStep(adaptive, {
            action: ADAPTIVE_ACTIONS.INVESTIGATE_CONFLICTING_INFORMATION,
            status: conflictReport.conflicts.length ? 'detected' : 'checked',
            reasonCode: conflictReport.conflicts.length
              ? 'explicit_conflict_detected'
              : 'no_explicit_conflict_detected',
            at: now(),
          });
          addLog(logs, {
            action: ADAPTIVE_ACTIONS.INVESTIGATE_CONFLICTING_INFORMATION,
            attempt: 1,
            outcome: conflictReport.conflicts.length
              ? 'conflicts_detected'
              : 'no_conflicts_detected',
            durationMs: 0,
          });
          if (conflictReport.conflicts.length > 0) {
            adaptive = addAdaptiveUncertainties(
              adaptive,
              [
                `${conflictReport.conflicts.length} explicit conflict signal${
                  conflictReport.conflicts.length === 1 ? '' : 's'
                } were detected. The loop did not resolve which passage is correct.`,
              ],
              now()
            );
            adaptive = addAdaptiveExperimentalResult(adaptive, {
              strategy: 'conflict_check',
              outcome: 'explicit_conflict_detected',
              measured: true,
              at: now(),
            });
          }
        } else {
          adaptive = appendAdaptiveStep(adaptive, {
            action: ADAPTIVE_ACTIONS.INVESTIGATE_CONFLICTING_INFORMATION,
            status: 'failed',
            reasonCode: 'conflict_check_failed',
            at: now(),
          });
        }
      } else {
        adaptive = appendAdaptiveStep(adaptive, {
          action: ADAPTIVE_ACTIONS.INVESTIGATE_CONFLICTING_INFORMATION,
          status: 'skipped',
          reasonCode: 'single_source',
          at: now(),
        });
      }

      if (evaluation.visualStatus === 'invalid') {
        adaptive = addAdaptiveUncertainties(
          adaptive,
          [
            'A visualization failed validation and was not shown. The answer itself was still verified.',
          ],
          now()
        );
      }
      if (evaluation.practiceDropped) {
        adaptive = addAdaptiveUncertainties(
          adaptive,
          [
            'A generated practice check did not verify against source text and was not shown.',
          ],
          now()
        );
      }

      const nextAction = buildNextAction({
        answer: { ok: true, answered: true },
        practice: evaluation.practice,
        practiceResult: evaluation.practice?.lastResult || null,
        relatedVisual: evaluation.relatedVisual,
        readySourceCount: readySources.length,
      });

      if (evaluation.practice) {
        adaptive = setAdaptiveOutcome(adaptive, {
          status: ADAPTIVE_STATUSES.AWAITING_RESPONSE,
          currentAction: ADAPTIVE_ACTIONS.VERIFY_UNDERSTANDING,
          summary:
            'A verified source answer is ready. Answer the recall check to make understanding observable.',
          measured: {
            sourceCount: readySources.length,
            citationVerified: true,
            keywordOverlap: evaluation.overlap.length,
            practiceAvailable: true,
            visualStatus: evaluation.visualStatus,
            retrievalAttempts: stepCount,
          },
          assumptions: [
            'Keyword overlap is a relevance heuristic, not proof that the sentence answers the intent.',
            'A source quotation is evidence only for the words it contains.',
          ],
          uncertainties: [
            ...(evaluation.visualStatus === 'invalid'
              ? ['The visual layer was unavailable for this answer.']
              : []),
          ],
          now: now(),
        });
        adaptive = appendAdaptiveStep(adaptive, {
          action: ADAPTIVE_ACTIONS.VERIFY_UNDERSTANDING,
          status: 'waiting',
          reasonCode: 'practice_ready',
          at: now(),
        });
      } else {
        adaptive = setAdaptiveOutcome(adaptive, {
          status: ADAPTIVE_STATUSES.COMPLETE,
          currentAction: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
          summary:
            'The source answer was verified, but no recall check could be generated. Understanding remains unmeasured.',
          measured: {
            sourceCount: readySources.length,
            citationVerified: true,
            keywordOverlap: evaluation.overlap.length,
            practiceAvailable: false,
            visualStatus: evaluation.visualStatus,
            retrievalAttempts: stepCount,
          },
          assumptions: [
            'Keyword overlap is a relevance heuristic, not proof that the sentence answers the intent.',
          ],
          uncertainties: [
            'No recall check was available, so this interaction does not measure understanding.',
            ...(evaluation.visualStatus === 'invalid'
              ? ['The visual layer was unavailable for this answer.']
              : []),
          ],
          now: now(),
        });
        adaptive = appendAdaptiveStep(adaptive, {
          action: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
          status: 'complete',
          reasonCode: 'answer_without_practice',
          at: now(),
        });
      }

      return finalizeWithAdaptive({
        context: current,
        passthrough: {
          ok: true,
          answered: true,
          question: lastResult.question || question,
          resolvedQuestion: lastResult.resolvedQuestion || '',
          usedContextTerms: lastResult.usedContextTerms || [],
          answer: lastResult.answer,
          citation: lastResult.citation,
          sourceId: lastResult.sourceId,
          sourceTitle: lastResult.sourceTitle,
          page: lastResult.page,
          note: lastResult.note,
          results: lastResult.results || [],
          visual: evaluation.visual,
          relatedVisual: evaluation.relatedVisual,
          practice: evaluation.practice,
          nextAction,
          turn: lastResult.turn || null,
          conflicts: conflictReport.ok ? conflictReport.conflicts : [],
          conflictCheck: {
            checked: readySources.length >= 2,
            skippedReason: conflictReport.skipped ? conflictReport.reason : null,
            method: conflictReport.method || null,
            limitations: conflictReport.limitations || [],
          },
        },
      });
    }

    if (event.type === 'practice_response') {
      if (!baseContext.practice) {
        adaptive = setAdaptiveOutcome(adaptive, {
          status: ADAPTIVE_STATUSES.BLOCKED,
          currentAction: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
          summary: 'There is no practice check to evaluate in this context.',
          uncertainties: [
            'No practice question was saved, so this response could not be assessed.',
          ],
          now: now(),
        });
        return finalizeWithAdaptive({
          context: baseContext,
          passthrough: {
            ok: false,
            correct: false,
            errors: ['There is no practice question in this context.'],
          },
        });
      }

      const evaluatedExecution = await executeWithRetries({
        action: ADAPTIVE_ACTIONS.VERIFY_UNDERSTANDING,
        executor: () =>
          evaluateRecall({
            context: baseContext,
            response: event.response,
            now: now(),
          }),
      });
      if (evaluatedExecution.cancelled) {
        return finish({
          adaptive,
          context: baseContext,
          status: ADAPTIVE_STATUSES.CANCELLED,
          errorCode: 'cancelled',
        });
      }
      if (!evaluatedExecution.ok) {
        adaptive = appendAdaptiveStep(adaptive, {
          action: ADAPTIVE_ACTIONS.VERIFY_UNDERSTANDING,
          status: 'failed',
          reasonCode: evaluatedExecution.stepLimit
            ? 'step_limit'
            : evaluatedExecution.timedOut
            ? 'assessment_timeout'
            : 'assessment_failed',
          at: now(),
        });
        adaptive = setAdaptiveOutcome(adaptive, {
          status: ADAPTIVE_STATUSES.FAILED,
          currentAction: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
          summary:
            'The recall check could not be evaluated. The previous context was preserved.',
          measured: { practiceCorrect: null },
          uncertainties: [
            'No assessment result was produced, so understanding was not measured.',
          ],
          now: now(),
        });
        return finalizeWithAdaptive({
          context: baseContext,
          passthrough: {
            ok: false,
            correct: false,
            practice: baseContext.practice,
            attempt: baseContext.practice?.lastResult || null,
            errors: ['The answer could not be checked.'],
          },
          status: ADAPTIVE_STATUSES.FAILED,
          errorCode: evaluatedExecution.stepLimit
            ? 'step_limit'
            : evaluatedExecution.timedOut
            ? 'assessment_timeout'
            : 'assessment_failed',
        });
      }

      const evaluated = evaluatedExecution.value;
      if (!evaluated?.ok) {
        adaptive = setAdaptiveOutcome(adaptive, {
          status: ADAPTIVE_STATUSES.BLOCKED,
          currentAction: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
          summary: 'The practice response could not be evaluated.',
          uncertainties: [
            'No assessment result was produced, so understanding was not measured.',
          ],
          now: now(),
        });
        return finalizeWithAdaptive({
          context: baseContext,
          passthrough: {
            ok: false,
            correct: false,
            practice: baseContext.practice,
            attempt: baseContext.practice?.lastResult || null,
            errors: evaluated?.errors || ['The answer could not be checked.'],
          },
        });
      }

      const workingContext = evaluated.context;
      const attempt = evaluated.attempt;
      const practice = evaluated.practice;
      const wrongAttempts = (practice.attempts || []).filter(
        (item) => item.correct === false
      ).length;
      const correct = evaluated.correct === true;

      adaptive = addAdaptiveUserInput(adaptive, {
        kind: 'practice_response',
        text: attempt.response,
        at: attempt.checkedAt,
      });
      adaptive = addAdaptiveAssessment(adaptive, {
        practiceId: practice.id,
        correct,
        checkedAt: attempt.checkedAt,
        citation: practice.citation,
        at: attempt.checkedAt,
      });
      adaptive = addAdaptiveExperimentalResult(adaptive, {
        strategy: 'verify_understanding',
        outcome: correct ? 'correct' : 'incorrect',
        measured: true,
        at: attempt.checkedAt,
      });
      adaptive = appendAdaptiveStep(adaptive, {
        action: ADAPTIVE_ACTIONS.VERIFY_UNDERSTANDING,
        status: 'succeeded',
        reasonCode: correct ? 'correct' : 'incorrect',
        at: attempt.checkedAt,
      });

      if (correct) {
        adaptive = setAdaptiveOutcome(adaptive, {
          status: ADAPTIVE_STATUSES.COMPLETE,
          currentAction: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
          summary:
            'The recall check matched the source wording. This is one measured check, not evidence of mastery.',
          measured: {
            practiceCorrect: true,
            wrongAttempts,
            assessmentCount: adaptive.assessmentEvidence.length,
          },
          assumptions: [
            'A correct exact-word recall is evidence for this check, not for broader mastery.',
          ],
          uncertainties: [
            'Retention beyond this single check was not measured.',
          ],
          now: attempt.checkedAt,
        });
        adaptive = appendAdaptiveStep(adaptive, {
          action: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
          status: 'complete',
          reasonCode: 'practice_correct',
          at: attempt.checkedAt,
        });
        return finalizeWithAdaptive({
          context: workingContext,
          passthrough: {
            ok: true,
            correct: true,
            attempt,
            practice,
            nextAction: evaluated.nextAction,
            feedbackMessage:
              'Correct. The source wording matches your answer. This single check is not mastery evidence.',
          },
        });
      }

      adaptive = addAdaptiveHypothesis(adaptive, {
        text: 'A single miss may be a recall slip or a wording mismatch; the cause is not yet confirmed.',
        at: attempt.checkedAt,
      });

      if (wrongAttempts <= 1) {
        const evidenceAvailable = Boolean(
          workingContext.evidence?.length || workingContext.answer
        );
        adaptive = addAdaptiveExperimentalResult(adaptive, {
          strategy: 'evidence_review',
          outcome: 'offered',
          measured: true,
          at: now(),
        });
        adaptive = appendAdaptiveStep(adaptive, {
          action: ADAPTIVE_ACTIONS.RETRIEVE_SOURCE_EVIDENCE,
          status: evidenceAvailable ? 'succeeded' : 'blocked',
          reasonCode: evidenceAvailable
            ? 'existing_verified_evidence'
            : 'no_verified_evidence',
          at: now(),
        });
        adaptive = setAdaptiveOutcome(adaptive, {
          status: evidenceAvailable
            ? ADAPTIVE_STATUSES.AWAITING_RESPONSE
            : ADAPTIVE_STATUSES.BLOCKED,
          currentAction: ADAPTIVE_ACTIONS.RETRIEVE_SOURCE_EVIDENCE,
          summary: evidenceAvailable
            ? 'The answer did not match. Review the exact verified passage, then try the source wording again.'
            : 'The answer did not match and no verified passage is available to review.',
          measured: {
            practiceCorrect: false,
            wrongAttempts,
            evidenceAvailable,
            citationVerified: evidenceAvailable,
          },
          assumptions: [
            'A first miss is treated as a cue to re-read evidence, not as a confirmed knowledge gap.',
          ],
          uncertainties: [
            'The cause of the miss was not measured by this interaction.',
          ],
          now: now(),
        });
        return finalizeWithAdaptive({
          context: workingContext,
          passthrough: {
            ok: true,
            correct: false,
            attempt,
            practice,
            nextAction: evaluated.nextAction,
            feedbackMessage: evidenceAvailable
              ? 'Not quite yet. Review the verified passage, then try the exact source wording again.'
              : 'Not quite yet. No verified passage is available to review.',
          },
        });
      }

      if (wrongAttempts >= 3) {
        adaptive = addAdaptiveUnresolvedQuestion(adaptive, question, now());
        adaptive = addAdaptiveExperimentalResult(adaptive, {
          strategy: 'stop_repeated_misses',
          outcome: 'stopped',
          measured: true,
          at: now(),
        });
        adaptive = setAdaptiveOutcome(adaptive, {
          status: ADAPTIVE_STATUSES.BLOCKED,
          currentAction: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
          summary:
            'The loop stopped after repeated misses to avoid repeating an ineffective strategy. The question remains unresolved.',
          measured: {
            practiceCorrect: false,
            wrongAttempts,
            evidenceAvailable: Boolean(workingContext.evidence?.length),
          },
          assumptions: [
            'Repeating the same recall prompt without new evidence is unlikely to add information.',
          ],
          uncertainties: [
            'The cause of the repeated misses remains unknown.',
          ],
          now: now(),
        });
        return finalizeWithAdaptive({
          context: workingContext,
          passthrough: {
            ok: true,
            correct: false,
            attempt,
            practice,
            nextAction: evaluated.nextAction,
            feedbackMessage:
              'The loop stopped after repeated misses. Start a new question or review the source before another check.',
          },
        });
      }

      const workedExecution = await executeWithRetries({
        action: ADAPTIVE_ACTIONS.PROVIDE_WORKED_EXAMPLE,
        executor: () =>
          buildWorkedExample({
            context: workingContext,
            practice,
            now: now(),
          }),
      });
      if (workedExecution.cancelled) {
        return finish({
          adaptive,
          context: workingContext,
          status: ADAPTIVE_STATUSES.CANCELLED,
          errorCode: 'cancelled',
        });
      }
      if (!workedExecution.ok) {
        adaptive = addAdaptiveUnresolvedQuestion(adaptive, question, now());
        adaptive = appendAdaptiveStep(adaptive, {
          action: ADAPTIVE_ACTIONS.PROVIDE_WORKED_EXAMPLE,
          status: 'failed',
          reasonCode: workedExecution.stepLimit
            ? 'step_limit'
            : workedExecution.timedOut
            ? 'worked_example_timeout'
            : 'worked_example_failed',
          at: now(),
        });
        adaptive = setAdaptiveOutcome(adaptive, {
          status: ADAPTIVE_STATUSES.FAILED,
          currentAction: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
          summary:
            'The recall check did not match, and a source-based worked example could not be verified. No answer was revealed.',
          measured: {
            practiceCorrect: false,
            wrongAttempts,
            workedExampleShown: false,
          },
          uncertainties: [
            'The worked example failed validation, so the loop stopped rather than showing unverified text.',
          ],
          now: now(),
        });
        return finalizeWithAdaptive({
          context: workingContext,
          passthrough: {
            ok: true,
            correct: false,
            attempt,
            practice,
            nextAction: evaluated.nextAction,
            feedbackMessage:
              'The worked example could not be verified, so it was not shown.',
          },
        });
      }

      const worked = workedExecution.value;
      if (!worked?.ok || !verify(worked.citation)) {
        adaptive = addAdaptiveUnresolvedQuestion(adaptive, question, now());
        adaptive = appendAdaptiveStep(adaptive, {
          action: ADAPTIVE_ACTIONS.PROVIDE_WORKED_EXAMPLE,
          status: 'failed',
          reasonCode: 'worked_example_citation_not_verified',
          at: now(),
        });
        adaptive = setAdaptiveOutcome(adaptive, {
          status: ADAPTIVE_STATUSES.FAILED,
          currentAction: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
          summary:
            'A worked example was produced, but its citation did not verify. It was discarded.',
          measured: {
            practiceCorrect: false,
            wrongAttempts,
            workedExampleShown: false,
            citationVerified: false,
          },
          uncertainties: [
            'No unverified worked example was shown.',
          ],
          now: now(),
        });
        return finalizeWithAdaptive({
          context: workingContext,
          passthrough: {
            ok: true,
            correct: false,
            attempt,
            practice,
            nextAction: evaluated.nextAction,
            feedbackMessage:
              'The worked example failed citation validation and was not shown.',
          },
        });
      }

      adaptive = addAdaptiveGeneratedExplanation(adaptive, {
        text: worked.text,
        generator: 'local_extractive_rule',
        citation: worked.citation,
        sourceTitle: worked.sourceTitle,
        page: worked.page,
        at: now(),
      });
      adaptive = addAdaptiveExperimentalResult(adaptive, {
        strategy: 'worked_example',
        outcome: 'shown',
        measured: true,
        at: now(),
      });
      adaptive = addAdaptiveHypothesis(adaptive, {
        text: 'The learner may not yet recall the exact source word, but the second miss alone does not establish why.',
        at: now(),
      });
      adaptive = addAdaptiveUnresolvedQuestion(
        adaptive,
        `Can the learner recall the missing source word without the worked example? ${question}`,
        now()
      );
      adaptive = appendAdaptiveStep(adaptive, {
        action: ADAPTIVE_ACTIONS.PROVIDE_WORKED_EXAMPLE,
        status: 'succeeded',
        reasonCode: 'verified_source_worked_example',
        at: now(),
      });
      adaptive = setAdaptiveOutcome(adaptive, {
        status: ADAPTIVE_STATUSES.BLOCKED,
        currentAction: ADAPTIVE_ACTIONS.PROVIDE_WORKED_EXAMPLE,
        summary:
          'The recall check did not match twice. A verified source-based worked example is shown; this check is closed without measured mastery.',
        measured: {
          practiceCorrect: false,
          wrongAttempts,
          workedExampleShown: true,
          citationVerified: true,
        },
        assumptions: [
          'Showing a verified source sentence is a remediation step, not evidence that the learner can recall it later.',
        ],
        uncertainties: [
          'The loop has no independent assessment of whether the worked example improved understanding.',
        ],
        now: now(),
      });

      return finalizeWithAdaptive({
        context: workingContext,
        passthrough: {
          ok: true,
          correct: false,
          attempt,
          practice,
          nextAction: evaluated.nextAction,
          workedExample: {
            text: worked.text,
            citation: worked.citation,
            sourceTitle: worked.sourceTitle,
            page: worked.page,
            answer: worked.answer,
            note: worked.note,
            generator: worked.generator,
          },
          feedbackMessage:
            'Not quite yet. A verified source-based worked example is shown. This check is closed without measured mastery.',
        },
      });
    }

    // Resume does not call a model or source adapter. It restores the selected
    // next action from saved evidence and stops when no additional action is
    // necessary.
    if (baseContext.practice?.lastResult?.correct) {
      adaptive = setAdaptiveOutcome(adaptive, {
        status: ADAPTIVE_STATUSES.COMPLETE,
        currentAction: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
        summary:
          'The saved recall check was already correct. No additional adaptive action is necessary.',
        measured: {
          practiceCorrect: true,
          wrongAttempts: (baseContext.practice.attempts || []).filter(
            (item) => item.correct === false
          ).length,
        },
        assumptions: [
          'No new evidence was produced during resume, so the saved result is reused.',
        ],
        uncertainties: [
          'Retention beyond the saved check was not measured.',
        ],
        now: now(),
      });
      adaptive = appendAdaptiveStep(adaptive, {
        action: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
        status: 'complete',
        reasonCode: 'already_correct',
        at: now(),
      });
      return finalizeWithAdaptive({
        context: baseContext,
        passthrough: {
          ok: true,
          correct: true,
          attempt: baseContext.practice.lastResult,
          practice: baseContext.practice,
          nextAction: baseContext.nextAction,
          feedbackMessage:
            'The saved recall check was already correct. No additional action is necessary.',
        },
      });
    }

    if (baseContext.practice?.lastResult) {
      const wrongAttempts = (baseContext.practice.attempts || []).filter(
        (item) => item.correct === false
      ).length;
      const wantsEvidence = wrongAttempts <= 1;
      adaptive = addAdaptiveExperimentalResult(adaptive, {
        strategy: 'resume_saved_attempt',
        outcome: wantsEvidence ? 'evidence_review' : 'stopped',
        measured: true,
        at: now(),
      });
      adaptive = appendAdaptiveStep(adaptive, {
        action: wantsEvidence
          ? ADAPTIVE_ACTIONS.RETRIEVE_SOURCE_EVIDENCE
          : ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
        status: wantsEvidence ? 'waiting' : 'blocked',
        reasonCode: wantsEvidence
          ? 'saved_miss_needs_evidence'
          : 'repeated_misses_stopped',
        at: now(),
      });
      adaptive = setAdaptiveOutcome(adaptive, {
        status: wantsEvidence
          ? ADAPTIVE_STATUSES.AWAITING_RESPONSE
          : ADAPTIVE_STATUSES.BLOCKED,
        currentAction: wantsEvidence
          ? ADAPTIVE_ACTIONS.RETRIEVE_SOURCE_EVIDENCE
          : ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
        summary: wantsEvidence
          ? 'A saved miss is present. Review the verified passage before trying again.'
          : 'The saved context contains repeated misses. The loop stopped instead of repeating the same prompt.',
        measured: {
          practiceCorrect: false,
          wrongAttempts,
        },
        uncertainties: [
          'The reason for the saved miss was not measured.',
        ],
        now: now(),
      });
      return finalizeWithAdaptive({
        context: baseContext,
        passthrough: {
          ok: true,
          correct: false,
          attempt: baseContext.practice.lastResult,
          practice: baseContext.practice,
          nextAction: baseContext.nextAction,
          feedbackMessage: wantsEvidence
            ? 'Review the verified passage before trying the check again.'
            : 'The saved context contains repeated misses; no additional action is recommended.',
        },
      });
    }

    if (baseContext.answer) {
      adaptive = setAdaptiveOutcome(adaptive, {
        status: ADAPTIVE_STATUSES.COMPLETE,
        currentAction: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
        summary:
          'A saved verified answer is available, but no recall check has been attempted.',
        measured: {
          citationVerified: Boolean(baseContext.answer),
          practiceAvailable: Boolean(baseContext.practice),
        },
        uncertainties: [
          'Understanding remains unmeasured until a recall check is attempted.',
        ],
        now: now(),
      });
      adaptive = appendAdaptiveStep(adaptive, {
        action: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
        status: 'complete',
        reasonCode: 'saved_answer_without_attempt',
        at: now(),
      });
      return finalizeWithAdaptive({
        context: baseContext,
        passthrough: {
          ok: true,
          answered: true,
          attempt: null,
          practice: baseContext.practice,
          nextAction: baseContext.nextAction,
        },
      });
    }

    adaptive = setAdaptiveOutcome(adaptive, {
      status: ADAPTIVE_STATUSES.BLOCKED,
      currentAction: ADAPTIVE_ACTIONS.SUMMARIZE_OR_SAVE,
      summary: 'The saved context has no answer or practice check to resume.',
      uncertainties: [
        'There is not enough evidence to choose another adaptive action.',
      ],
      now: now(),
    });
    return finalizeWithAdaptive({
      context: baseContext,
      passthrough: {
        ok: false,
        errors: ['There is no saved answer or practice check to resume.'],
      },
    });
  };

  return { run };
}

export const adaptiveIntelligenceLoop = createAdaptiveIntelligenceLoop();

export function runAdaptiveLoop(input = {}) {
  return adaptiveIntelligenceLoop.run(input);
}

export function recordAdaptiveCorrection(input = {}) {
  const adaptive = normalizeAdaptiveState(input.adaptive);
  if (!adaptive) return null;
  return addAdaptiveCorrection(adaptive, input.text, input.now);
}
