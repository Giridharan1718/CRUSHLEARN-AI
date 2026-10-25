// VerificationService: deterministic checks that do not ask a model to grade
// itself. It verifies citations against stored source text, re-checks an
// explanation's preserved facts, and reports what it cannot verify.

import { validateCitation } from '../notebooks/citations.mjs';
import {
  findEquationSpans,
  findNumberFacts,
  findQuantities,
  validateExplanationResult,
} from '../notebooks/textExplanation.mjs';
import {
  CAPABILITY_STATUS,
  RUN_STATUS,
  createServiceResult,
  failureResult,
  sourceTextMap,
} from './contracts.mjs';

export const VERIFICATION_CAPABILITY = CAPABILITY_STATUS.WORKING;

export function verifyCitations(citations, { sources = [], sourceContents = {} } = {}) {
  const sourceIds = (Array.isArray(sources) ? sources : []).map((source) => source.id);
  const sourceTexts = sourceTextMap(sources, sourceContents);
  const accepted = [];
  const rejected = [];

  (Array.isArray(citations) ? citations : []).forEach((citation) => {
    const result = validateCitation(citation, {
      sourceIds,
      sourceTexts,
      requireSourceText: true,
    });
    if (result.ok && result.verified) accepted.push(result.citation);
    else rejected.push({ citation: citation || null, errors: result.errors });
  });

  return { accepted, rejected };
}

export function runVerification(request = {}) {
  const started = Date.now();
  const text = String(request.text || request.selection?.text || '');
  const explanation = request.explanation || null;
  const citations = Array.isArray(request.citations) ? request.citations : [];
  const checks = [];
  const errors = [];
  const warnings = [];

  if (explanation && text) {
    const result = validateExplanationResult({ text, result: explanation });
    checks.push(...result.checks);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  if (citations.length > 0) {
    const { accepted, rejected } = verifyCitations(citations, {
      sources: request.sources,
      sourceContents: request.sourceContents,
    });
    checks.push({
      id: 'citations_verified',
      ok: rejected.length === 0 && accepted.length > 0,
      detail:
        rejected.length > 0
          ? `${rejected.length} citation(s) did not match the stored source text.`
          : `${accepted.length} citation(s) matched the stored source text.`,
    });
    if (rejected.length > 0) {
      errors.push('At least one citation did not match the stored source text.');
    }
  }

  if (text) {
    const numbers = findNumberFacts(text);
    const equations = findEquationSpans(text);
    const quantities = findQuantities(text);
    checks.push({
      id: 'inputs_inspected',
      ok: true,
      detail: `${numbers.length} numeric value(s), ${equations.length} equation span(s) and ${quantities.length} quantity value(s) were inspected.`,
    });
  }

  if (checks.length === 0) {
    return failureResult('verification', ['Nothing was supplied to verify.'], {
      capability: VERIFICATION_CAPABILITY,
    });
  }

  const ok = errors.length === 0;
  return createServiceResult({
    service: 'verification',
    capability: VERIFICATION_CAPABILITY,
    status: ok ? RUN_STATUS.COMPLETED : RUN_STATUS.PARTIAL,
    data: {
      ok,
      checks,
      errors,
      warnings,
      limitations: [
        'Deterministic checks verify quotation offsets, preserved numbers, equations and units. They do not prove the source claim is true.',
        'No mathematical solver, unit converter or external fact database is connected.',
      ],
    },
    limitations: [
      'Deterministic checks verify quotation offsets, preserved numbers, equations and units. They do not prove the source claim is true.',
    ],
    errors,
    metrics: { latencyMs: Date.now() - started, checks: checks.length },
    generator: 'local_deterministic',
  });
}
