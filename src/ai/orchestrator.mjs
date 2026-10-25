// CrushLearn AI orchestration layer.
//
// One front door for a learner request:
//   1. classify the requested task,
//   2. authorize notebook-scoped context,
//   3. choose a workflow,
//   4. call only the services that workflow needs,
//   5. combine their evidence and interpretation without mixing trust levels,
//   6. return one consistent response envelope.
//
// The default services are local and deterministic. The optional gateway path
// is used only for source-grounded answering, and its citations are verified by
// the existing groundedChat layer before this orchestrator accepts them.

import {
  CAPABILITY_STATUS,
  MAX_SERVICE_CALLS,
  RUN_STATUS,
  TASK_IDS,
  WORKFLOW_IDS,
  checkAccess,
  createEnvelope,
  normalizeRequest,
  readySources,
} from './contracts.mjs';
import {
  askGroundedSources,
  askLocalSources,
} from './retrievalService.mjs';
import {
  buildPracticeCheck,
  assessOwnWords,
  checkPracticeAnswer,
} from './assessmentService.mjs';
import { runAdaptiveLearning } from './adaptiveLearningService.mjs';
import { compareNotebookEvidence, buildResearchPlan } from './researchService.mjs';
import { buildWritingOutline } from './writingService.mjs';
import { runTutoring } from './tutoringService.mjs';
import { runTextUnderstanding } from './textUnderstandingService.mjs';
import { runVerification } from './verificationService.mjs';
import { planVisual } from './visualLearningService.mjs';

export const ORCHESTRATOR_VERSION = 1;

export const CAPABILITY_MANIFEST = Object.freeze([
  { service: 'text_understanding', status: CAPABILITY_STATUS.WORKING },
  { service: 'document_retrieval', status: CAPABILITY_STATUS.WORKING },
  { service: 'document_retrieval.grounded', status: CAPABILITY_STATUS.PARTIAL },
  { service: 'verification', status: CAPABILITY_STATUS.WORKING },
  { service: 'assessment', status: CAPABILITY_STATUS.WORKING },
  { service: 'adaptive_learning', status: CAPABILITY_STATUS.PARTIAL },
  { service: 'tutoring', status: CAPABILITY_STATUS.PARTIAL },
  { service: 'visual_learning', status: CAPABILITY_STATUS.PARTIAL },
  { service: 'research', status: CAPABILITY_STATUS.PARTIAL },
  { service: 'writing', status: CAPABILITY_STATUS.PARTIAL },
]);

function task(id, confidence, basis) {
  return { id, confidence, basis };
}

const EXPLAIN_PATTERN =
  /\b(explain|simplify|eli5|eli10|eli\s?5|eli\s?10|teach me|break (?:it|this) down|what does .{1,60} mean|help me understand)\b/i;
const PRACTICE_PATTERN = /\b(practice|quiz|test me|ask me a question|give me a question)\b/i;
const ASSESS_PATTERN = /\b(check my answer|is my answer|my explanation|in my own words|did i get)\b/i;
const RESEARCH_PATTERN =
  /\b(research|literature|find sources|compare sources|compare the sources|research gap|evidence table|research question)\b/i;
const WRITE_PATTERN = /\b(write|draft|essay|outline|thesis|report|paragraph)\b/i;
const VERIFY_PATTERN = /\b(verify|fact[- ]check|check (?:the )?citation|is this correct|source for)\b/i;
const SUMMARY_PATTERN = /\b(summarize|summary|tl;?dr|key points)\b/i;

/** Heuristic task classification with an explicit override. */
export function classifyTask(request) {
  if (request.task && TASK_IDS[request.task.toUpperCase()]) {
    return task(request.task, 0.97, 'explicit request');
  }
  const question = String(request.question || '').toLowerCase();
  const hasSelection = Boolean(request.text || request.selection?.text);

  if (request.response) return task(TASK_IDS.ASSESS, 0.9, 'learner response supplied');
  if (PRACTICE_PATTERN.test(question)) return task(TASK_IDS.PRACTICE, 0.82, 'practice wording');
  if (ASSESS_PATTERN.test(question)) return task(TASK_IDS.ASSESS, 0.8, 'assessment wording');
  if (RESEARCH_PATTERN.test(question)) return task(TASK_IDS.RESEARCH, 0.82, 'research wording');
  if (VERIFY_PATTERN.test(question)) return task(TASK_IDS.VERIFY, 0.8, 'verification wording');
  if (WRITE_PATTERN.test(question)) return task(TASK_IDS.WRITE, 0.75, 'writing wording');
  if (SUMMARY_PATTERN.test(question) && hasSelection) {
    return task(TASK_IDS.SUMMARIZE, 0.78, 'summary wording with a selection');
  }
  if (EXPLAIN_PATTERN.test(question) || (hasSelection && !question)) {
    return task(TASK_IDS.EXPLAIN, 0.86, 'explanation wording or a selection');
  }
  if (question) return task(TASK_IDS.ASK, 0.68, 'question fallback');
  return task(TASK_IDS.ASK, 0.4, 'default');
}

function chooseWorkflow(request, detected) {
  if (detected.id === TASK_IDS.EXPLAIN) {
    return /teach me|help me understand|practice|quiz/i.test(request.question)
      ? WORKFLOW_IDS.GUIDED_EXPLANATION
      : WORKFLOW_IDS.DIRECT_EXPLANATION;
  }
  if (detected.id === TASK_IDS.ASK) return WORKFLOW_IDS.SOURCE_GROUNDED_QA;
  if (detected.id === TASK_IDS.PRACTICE || detected.id === TASK_IDS.ASSESS) {
    return WORKFLOW_IDS.PRACTICE_CHECK;
  }
  if (detected.id === TASK_IDS.RESEARCH) {
    return /compare/i.test(request.question)
      ? WORKFLOW_IDS.EVIDENCE_VERIFICATION
      : WORKFLOW_IDS.RESEARCH_PLAN;
  }
  if (detected.id === TASK_IDS.WRITE) return WORKFLOW_IDS.WRITING_OUTLINE;
  if (detected.id === TASK_IDS.VERIFY) return WORKFLOW_IDS.EVIDENCE_VERIFICATION;
  if (detected.id === TASK_IDS.SUMMARIZE) return WORKFLOW_IDS.SOURCE_SUMMARY;
  return WORKFLOW_IDS.SOURCE_GROUNDED_QA;
}

function sumServiceMetrics(results) {
  return results.reduce(
    (total, result) => {
      const metrics = result?.metrics || {};
      return {
        serviceCalls: total.serviceCalls + 1,
        providerCalls: total.providerCalls + Number(metrics.providerCalls || 0),
        inputTokens: total.inputTokens + Number(metrics.inputTokens || 0),
        outputTokens: total.outputTokens + Number(metrics.outputTokens || 0),
        costUsd: total.costUsd + Number(metrics.costUsd || 0),
        retrievalResults: total.retrievalResults + Number(metrics.retrievalResults || 0),
      };
    },
    {
      serviceCalls: 0,
      providerCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      retrievalResults: 0,
    }
  );
}

function combine(results) {
  return {
    servicesUsed: results.map((result) => result.service),
    evidence: results.flatMap((result) => result.evidence || []),
    interpretations: results.flatMap((result) => result.interpretations || []),
    learnerEvidence: results.flatMap((result) => result.learnerEvidence || []),
    hypotheses: results.flatMap((result) => result.hypotheses || []),
    unavailable: [...new Set(results.flatMap((result) => result.unavailable || []))],
    limitations: [...new Set(results.flatMap((result) => result.limitations || []))],
    errors: [...new Set(results.flatMap((result) => result.errors || []))],
    model: results.find((result) => result.model)?.model || null,
    metrics: sumServiceMetrics(results),
  };
}

function statusFromResults(results) {
  if (results.some((result) => result.status === RUN_STATUS.FAILED)) return RUN_STATUS.FAILED;
  if (results.some((result) => result.status === RUN_STATUS.BLOCKED)) return RUN_STATUS.BLOCKED;
  if (results.some((result) => result.status === RUN_STATUS.NEEDS_INPUT)) {
    return RUN_STATUS.NEEDS_INPUT;
  }
  if (results.some((result) => result.status === RUN_STATUS.PARTIAL)) return RUN_STATUS.PARTIAL;
  return RUN_STATUS.COMPLETED;
}

function workflowData(workflow, results, request) {
  const primary = results[0];
  switch (workflow) {
    case WORKFLOW_IDS.DIRECT_EXPLANATION: {
      const visual = results.find((result) => result?.service === 'visual_learning');
      return {
        explanation: primary?.data?.explanation || null,
        subject: primary?.data?.subject || null,
        visualPlan: primary?.data?.visualPlan || null,
        curatedVisual: visual?.data || null,
      };
    }
    case WORKFLOW_IDS.GUIDED_EXPLANATION:
      return {
        tutoring: primary?.data || null,
        explanation: primary?.data?.explanation || null,
      };
    case WORKFLOW_IDS.SOURCE_GROUNDED_QA:
      return {
        answer: primary?.data?.answerText || primary?.data?.answer?.answer || null,
        result: primary?.data?.result || null,
        citation: primary?.data?.citation || primary?.data?.citations?.[0] || null,
        sourceTitle: primary?.data?.sourceTitle || null,
        page: primary?.data?.page ?? null,
        generator: primary?.data?.generator || primary?.generator || null,
        note: primary?.data?.note || null,
      };
    case WORKFLOW_IDS.PRACTICE_CHECK:
      return {
        questions: primary?.data?.questions || [],
        answerCheck: primary?.data || null,
        ownWords: primary?.data?.ownWords || null,
        feedback: primary?.data?.feedback || null,
        nextStrategy: primary?.data?.nextStrategy || null,
      };
    case WORKFLOW_IDS.RESEARCH_PLAN:
      return { research: primary?.data || null };
    case WORKFLOW_IDS.WRITING_OUTLINE:
      return { writing: primary?.data || null };
    case WORKFLOW_IDS.EVIDENCE_VERIFICATION:
      return {
        verification: primary?.data || null,
        comparison: primary?.service === 'research.compare' ? primary.data : null,
      };
    case WORKFLOW_IDS.SOURCE_SUMMARY:
      return {
        summary: primary?.data?.explanation || null,
        note: 'Extractive summary built from exact source sentences; not an AI synthesis.',
      };
    default:
      return { raw: primary?.data || null };
  }
}

function executeWorkflow(workflow, request) {
  switch (workflow) {
    case WORKFLOW_IDS.DIRECT_EXPLANATION:
    case WORKFLOW_IDS.SOURCE_SUMMARY: {
      const understanding = runTextUnderstanding({
        ...request,
        mode:
          workflow === WORKFLOW_IDS.SOURCE_SUMMARY ? 'simplify' : request.mode,
        level:
          workflow === WORKFLOW_IDS.SOURCE_SUMMARY
            ? 'intermediate'
            : request.level,
      });

      if (workflow === WORKFLOW_IDS.SOURCE_SUMMARY) {
        return [understanding];
      }

      // The explanation already carries a visual plan, but it cannot open a
      // curated visual on its own. The visual service is the one that knows
      // whether an authored visual matches the topic, so the direct
      // explanation workflow calls it as a second service.
      const topic =
        request.selection?.text || request.text || request.question || '';
      const subject =
        understanding?.data?.subject?.id ||
        understanding?.data?.explanation?.subject?.id ||
        'general';

      return [understanding, planVisual({ topic, subject })];
    }
    case WORKFLOW_IDS.GUIDED_EXPLANATION:
      return [runTutoring(request)];
    case WORKFLOW_IDS.SOURCE_GROUNDED_QA:
      return [askLocalSources(request)];
    case WORKFLOW_IDS.PRACTICE_CHECK: {
      if (request.response) {
        if (request.question && request.questionId) {
          return [
            checkPracticeAnswer({
              question: request.previousContext?.practice || null,
              response: request.response,
            }),
          ];
        }
        return [assessOwnWords(request)];
      }
      return [buildPracticeCheck(request)];
    }
    case WORKFLOW_IDS.RESEARCH_PLAN:
      return [buildResearchPlan(request)];
    case WORKFLOW_IDS.WRITING_OUTLINE:
      return [buildWritingOutline(request)];
    case WORKFLOW_IDS.EVIDENCE_VERIFICATION: {
      if (/compare/i.test(request.question) && request.sources.length >= 2) {
        return [compareNotebookEvidence(request)];
      }
      const explanation = request.explanation || null;
      const citations = request.citations || request.selection?.citations || [];
      return [
        runVerification({
          text: request.text || request.selection?.text || '',
          explanation,
          citations,
          sources: request.sources,
          sourceContents: request.sourceContents,
        }),
      ];
    }
    default:
      return [askLocalSources(request)];
  }
}

function finishEnvelope({ request, detected, workflow, results, startedAt, extraLimitations = [] }) {
  const combined = combine(results);
  const status = statusFromResults(results);
  const data = workflowData(workflow, results, request);
  const latencyMs = Date.now() - startedAt;
  const limitations = [...combined.limitations, ...extraLimitations];
  const envelope = createEnvelope({
    request: { ...request, startedAt: new Date(startedAt).toISOString() },
    task: detected,
    workflow,
    status,
    servicesUsed: combined.servicesUsed,
    data,
    evidence: combined.evidence,
    interpretations: combined.interpretations,
    learnerEvidence: combined.learnerEvidence,
    hypotheses: combined.hypotheses,
    unavailable: combined.unavailable,
    limitations,
    errors: combined.errors,
    model: combined.model,
    metrics: {
      ...combined.metrics,
      latencyMs,
      serviceCalls: results.length,
      completion:
        status === RUN_STATUS.COMPLETED
          ? 1
          : status === RUN_STATUS.PARTIAL
            ? 0.6
            : status === RUN_STATUS.NEEDS_INPUT
              ? 0.4
              : 0,
    },
  });

  // A failed preservation check or provider fallback must be visible at the
  // top level, not buried in service details.
  if (
    results.some(
      (result) =>
        result?.data?.explanation?.verification &&
        result.data.explanation.verification.ok === false
    )
  ) {
    envelope.status = RUN_STATUS.PARTIAL;
    envelope.ok = true;
    envelope.limitations.push(
      'The explanation did not pass every preservation check. The original text remains authoritative.'
    );
  }

  return envelope;
}

/**
 * Synchronous orchestration for the local services. Use this from render paths
 * that must not wait for a network provider.
 */
export function orchestrateLearningRequest(input = {}) {
  const startedAt = Date.now();
  const request = normalizeRequest({ ...input, startedAt });
  const detected = classifyTask(request);
  const access = checkAccess(request);
  if (!access.ok) {
    return createEnvelope({
      request: { ...request, startedAt: new Date(startedAt).toISOString() },
      task: detected,
      workflow: chooseWorkflow(request, detected),
      status: RUN_STATUS.BLOCKED,
      errors: [access.error],
      limitations: ['No notebook data was used because authorization failed.'],
      metrics: { latencyMs: Date.now() - startedAt, serviceCalls: 0 },
    });
  }

  const workflow = chooseWorkflow(request, detected);

  try {
    const results = executeWorkflow(workflow, request).slice(0, MAX_SERVICE_CALLS);
    return finishEnvelope({
      request,
      detected,
      workflow,
      results,
      startedAt,
      extraLimitations: access.scope === 'selection'
        ? ['This request used the selected text only; no notebook source was read.']
        : [],
    });
  } catch (error) {
    return createEnvelope({
      request: { ...request, startedAt: new Date(startedAt).toISOString() },
      task: detected,
      workflow,
      status: RUN_STATUS.FAILED,
      errors: [error?.message || 'The orchestration step failed.'],
      limitations: ['The request stopped after an internal service failure. No partial answer was presented as complete.'],
      metrics: { latencyMs: Date.now() - startedAt },
    });
  }
}

/**
 * Asynchronous orchestration for workflows that may call the optional gateway
 * or the bounded adaptive loop. The synchronous path remains available as a
 * fallback when this cannot run.
 */
export async function orchestrateLearningRequestAsync(input = {}) {
  const startedAt = Date.now();
  const request = normalizeRequest({ ...input, startedAt });
  const detected = classifyTask(request);
  const access = checkAccess(request);
  if (!access.ok) {
    return createEnvelope({
      request: { ...request, startedAt: new Date(startedAt).toISOString() },
      task: detected,
      workflow: chooseWorkflow(request, detected),
      status: RUN_STATUS.BLOCKED,
      errors: [access.error],
      limitations: ['No notebook data was used because authorization failed.'],
      metrics: { latencyMs: Date.now() - startedAt, serviceCalls: 0 },
    });
  }

  const workflow = chooseWorkflow(request, detected);

  try {
    let results;
    if (workflow === WORKFLOW_IDS.SOURCE_GROUNDED_QA && request.allowModel) {
      results = [await askGroundedSources(request)];
    } else if (
      workflow === WORKFLOW_IDS.PRACTICE_CHECK &&
      request.response &&
      request.useAdaptiveLoop
    ) {
      results = [
        await runAdaptiveLearning({
          ...request,
          event: { type: 'practice_response', response: request.response },
        }),
      ];
    } else {
      results = executeWorkflow(workflow, request);
    }
    return finishEnvelope({
      request,
      detected,
      workflow,
      results: results.slice(0, MAX_SERVICE_CALLS),
      startedAt,
      extraLimitations: [],
    });
  } catch (error) {
    return createEnvelope({
      request: { ...request, startedAt: new Date(startedAt).toISOString() },
      task: detected,
      workflow,
      status: RUN_STATUS.FAILED,
      errors: [error?.message || 'The orchestration step failed.'],
      limitations: ['The request stopped after an internal service failure. No partial answer was presented as complete.'],
      metrics: { latencyMs: Date.now() - startedAt },
    });
  }
}

/** Capability manifest for the UI and audit report. */
export function listCapabilities() {
  return CAPABILITY_MANIFEST.map((item) => ({ ...item }));
}

/** Explicit availability check used by the UI before offering a workflow. */
export function isWorkflowAvailable(workflow, { hasSources = false, providerConfigured = false } = {}) {
  if (workflow === WORKFLOW_IDS.SOURCE_GROUNDED_QA) return hasSources;
  if (workflow === WORKFLOW_IDS.RESEARCH_PLAN) return hasSources;
  if (workflow === WORKFLOW_IDS.WRITING_OUTLINE) return hasSources;
  if (workflow === WORKFLOW_IDS.DIRECT_EXPLANATION) return true;
  if (workflow === WORKFLOW_IDS.GUIDED_EXPLANATION) return true;
  if (workflow === WORKFLOW_IDS.PRACTICE_CHECK) return true;
  if (workflow === WORKFLOW_IDS.EVIDENCE_VERIFICATION) return hasSources;
  return Boolean(providerConfigured || hasSources);
}

export { readySources };
