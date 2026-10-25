// WritingService: evidence-backed writing support.
//
// This service builds an outline and a citation plan from verified source
// passages. It does not write an essay, paraphrase sources into prose, or
// invent references. A model-backed drafting adapter is not connected.

import { answerFromNotebookSources } from '../notebooks/sourceAnswers.mjs';
import { GENERATORS } from '../notebooks/generators.mjs';
import {
  CAPABILITY_STATUS,
  RUN_STATUS,
  createServiceResult,
  failureResult,
  readySources,
} from './contracts.mjs';

export const WRITING_CAPABILITY = CAPABILITY_STATUS.PARTIAL;

export function buildWritingOutline(request = {}) {
  const started = Date.now();
  const question = String(request.question || '').trim();
  if (!question) {
    return failureResult('writing', ['Describe what you are writing about first.'], {
      capability: WRITING_CAPABILITY,
    });
  }

  const ready = readySources(request.sources);
  const citationPlan = [];
  const seen = new Set();

  ready.forEach((source) => {
    const result = answerFromNotebookSources({
      sources: [source],
      sourceContents: request.sourceContents,
      question,
      limit: 3,
    });
    if (!result.answered || !result.citation) return;
    const key = `${result.citation.sourceId}:${result.citation.locator.start}`;
    if (seen.has(key)) return;
    seen.add(key);
    citationPlan.push({
      sourceId: result.sourceId,
      sourceTitle: result.sourceTitle,
      page: result.page,
      quote: result.answer,
      citation: result.citation,
    });
  });

  const outline = [
    {
      section: 'Working question',
      purpose: question,
      status: 'learner_supplied',
    },
    {
      section: 'What the sources establish',
      purpose:
        citationPlan.length > 0
          ? 'State only claims supported by the verified quotations below.'
          : 'No verified source quotation matched yet. Add sources or refine the question.',
      status: citationPlan.length > 0 ? 'evidence_ready' : 'needs_evidence',
    },
    {
      section: 'How the sources differ',
      purpose:
        'Compare methods, samples, assumptions and conclusions. This app does not infer those automatically.',
      status: 'learner_analysis_required',
    },
    {
      section: 'What remains uncertain',
      purpose:
        'State the limitations of the evidence and any question the sources do not answer.',
      status: 'learner_analysis_required',
    },
    {
      section: 'References',
      purpose:
        'Use only citations verified against stored source text. No reference is generated from a title or DOI lookup.',
      status: 'citation_verification_available',
    },
  ];

  return createServiceResult({
    service: 'writing',
    capability: WRITING_CAPABILITY,
    status: citationPlan.length > 0 ? RUN_STATUS.PARTIAL : RUN_STATUS.NEEDS_INPUT,
    data: {
      topic: question,
      outline,
      citationPlan,
      drafting: {
        available: false,
        reason:
          'No model-backed drafting service is connected. The outline and verified quotations are the writing support provided by this build.',
      },
      limitations: [
        'The outline is a scaffold. It is not a draft and it does not synthesize a thesis.',
        'Every factual sentence you write still needs a checked citation.',
        'No bibliography formatter, plagiarism checker or DOI resolver is implemented.',
      ],
    },
    evidence: citationPlan.map((item) => ({
      kind: 'source_evidence',
      sourceId: item.sourceId,
      sourceTitle: item.sourceTitle,
      page: item.page,
      quote: item.quote,
      citation: item.citation,
    })),
    unavailable: ['model-written draft', 'automatic bibliography', 'plagiarism check'],
    limitations: [
      'Writing support stops at an outline and verified evidence plan.',
    ],
    metrics: {
      latencyMs: Date.now() - started,
      sources: ready.length,
      verifiedQuotations: citationPlan.length,
    },
    generator: GENERATORS.LOCAL_EXTRACTIVE,
  });
}
