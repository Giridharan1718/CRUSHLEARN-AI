// ResearchService: source-grounded research operations.
//
// The app has no external literature search, DOI lookup or embedding index.
// Everything here is derived from the learner's stored source text with
// deterministic rules and BM25 retrieval. When a provider is available, its
// claims can be added, but every citation it returns is verified against the
// stored source text before it is shown. Unsupported model claims are kept and
// labelled rather than hidden.
//
// Trust separation is explicit:
//   - claims/rows with a verified source quotation are notebook evidence;
//   - rule-based comparison and gap statements are app assessments;
//   - model claims are interpretations and never share the evidence style;
//   - speculative explanations are labelled unverified hypotheses.

import { validateCitation } from '../notebooks/citations.mjs';
import { GENERATORS } from '../notebooks/generators.mjs';
import {
  getContent,
  readySources,
  sourceTextMap,
} from '../notebooks/sourceAccess.mjs';
import { searchNotebookSources } from '../notebooks/sourceRetrieval.mjs';
import {
  findPageNumber,
  getContentText,
  splitTextIntoSentences,
  tokenize,
} from '../notebooks/sourceText.mjs';
import {
  extractSourceConcepts,
  topicTermCoverage,
} from '../notebooks/sourceConcepts.mjs';
import {
  CAPABILITY_STATUS,
  RUN_STATUS,
  createServiceResult,
  failureResult,
} from './contracts.mjs';

export const RESEARCH_CAPABILITY = CAPABILITY_STATUS.PARTIAL;
export const MAX_RESEARCH_CLAIMS = 6;
export const MAX_EVIDENCE_ROWS = 8;

const NEGATION_PATTERN =
  /\b(?:not|no|never|none|without|cannot|can't|doesn't|don't|didn't|isn't|aren't|wasn't|weren't|fails? to|unable to)\b/i;

const OPPOSITE_PAIRS = [
  ['increase', 'decrease'],
  ['increases', 'decreases'],
  ['increased', 'decreased'],
  ['higher', 'lower'],
  ['more', 'less'],
  ['positive', 'negative'],
  ['significant', 'insignificant'],
  ['always', 'never'],
  ['supports', 'refutes'],
  ['supported', 'refuted'],
  ['causes', 'prevents'],
  ['improves', 'worsens'],
  ['include', 'exclude'],
  ['includes', 'excludes'],
  ['before', 'after'],
  ['internal', 'external'],
];

const CUE_PATTERNS = {
  method:
    /\b(?:method|methods|methodology|sample|samples|participants|dataset|data|measured|measurement|experiment|survey|interview|procedure|we (?:used|collected|analysed|analyzed|tested))\b/i,
  assumption:
    /\b(?:assume|assumes|assumed|assumption|assumptions|presuppose|premise|given that|provided that)\b/i,
  conclusion:
    /\b(?:conclude|concludes|concluded|conclusion|finding|findings|result|results|therefore|suggest|suggests|show|shows|indicate|indicates|demonstrate|demonstrates)\b/i,
};

function clean(value, max = 500) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function pageAt(content, offset) {
  return findPageNumber(content, offset);
}

function verifiedSpan({
  source,
  content,
  text,
  start,
  end,
  sourceIds,
  sourceTexts,
}) {
  const quote = text.slice(start, end).trim();
  if (!quote) return null;
  const leading = text.slice(start, end).length - text.slice(start, end).trimStart().length;
  const offset = start + leading;
  const citation = {
    sourceId: source.id,
    quote,
    locator: {
      kind: 'offset',
      start: offset,
      end: offset + quote.length,
    },
  };
  const verification = validateCitation(citation, {
    sourceIds,
    sourceTexts,
    requireSourceText: true,
  });
  if (!verification.ok || !verification.verified) return null;
  return {
    sourceId: source.id,
    sourceTitle: source.title,
    quote,
    citation: verification.citation,
    page: pageAt(content, offset),
  };
}

function bestSentence({
  result,
  source,
  content,
  sourceTexts,
  queryTerms,
}) {
  const chunkStart = result.citation?.locator?.start;
  if (!Number.isInteger(chunkStart)) return null;

  const sentences = splitTextIntoSentences(result.text);
  if (sentences.length === 0) {
    return verifiedSpan({
      source,
      content,
      text: result.text,
      start: 0,
      end: result.text.length,
      sourceIds: Object.keys(sourceTexts),
      sourceTexts,
    });
  }

  let best = null;
  sentences.forEach((sentence) => {
    const terms = tokenize(sentence.text);
    const overlap = terms.filter((term) => queryTerms.has(term)).length;
    if (
      !best ||
      overlap > best.overlap ||
      (overlap === best.overlap &&
        Math.abs(sentence.start - 0) < Math.abs(best.start - 0))
    ) {
      best = { ...sentence, overlap };
    }
  });

  return verifiedSpan({
    source,
    content,
    text: result.text,
    start: best.start,
    end: best.end,
    sourceIds: Object.keys(sourceTexts),
    sourceTexts,
  });
}

function groupBySource(results) {
  const grouped = new Map();
  (Array.isArray(results) ? results : []).forEach((result) => {
    if (!grouped.has(result.sourceId)) grouped.set(result.sourceId, []);
    grouped.get(result.sourceId).push(result);
  });
  return grouped;
}

function bestQuoteForSource({
  result,
  source,
  content,
  sourceTexts,
  queryTerms,
}) {
  return bestSentence({
    result,
    source,
    content,
    sourceTexts,
    queryTerms,
  });
}

function regionForResult(result) {
  const start = result.citation?.locator?.start;
  const end = result.citation?.locator?.end;
  return Number.isInteger(start) && Number.isInteger(end)
    ? { start, end }
    : null;
}

/**
 * Assess every ready source against the question. Irrelevant sources are
 * reported as having no lexical match, not as being irrelevant in general.
 */
export function assessSourceRelevance({
  question,
  sources = [],
  sourceContents = {},
  results = null,
} = {}) {
  const ready = readySources(sources);
  const search =
    results === null
      ? searchNotebookSources({
          sources: ready,
          sourceContents,
          query: question,
          limit: 24,
        })
      : { ok: true, results, errors: [] };

  if (!search.ok) return { ok: false, errors: search.errors, rows: [] };

  const grouped = groupBySource(search.results);
  const sourceTexts = sourceTextMap(ready, sourceContents);
  const sourceIds = ready.map((source) => source.id);
  const queryTerms = new Set(tokenize(question));

  const rows = ready.map((source) => {
    const content = getContent(sourceContents, source.id);
    const sourceResults = grouped.get(source.id) || [];
    const best = sourceResults[0] || null;
    const quote = best
      ? bestQuoteForSource({
          result: best,
          source,
          content,
          sourceTexts,
          queryTerms,
        })
      : null;

    return {
      sourceId: source.id,
      title: source.title,
      sourceType: source.sourceType || 'document',
      status: best ? 'relevant' : 'not_matched',
      relevance: best ? 'matched' : 'no lexical match',
      matchCount: sourceResults.length,
      matchedTerms: [...new Set(sourceResults.flatMap((item) => item.matchedTerms || []))],
      citation: quote?.citation || null,
      quote: quote?.quote || null,
      page: quote?.page ?? null,
      reason: best
        ? 'The question terms matched a stored passage in this source.'
        : 'No retrieved passage matched the question terms. This does not prove the source is silent on the topic.',
      sourceIds,
    };
  });

  return {
    ok: true,
    rows,
    relevant: rows.filter((row) => row.status === 'relevant'),
    notMatched: rows.filter((row) => row.status === 'not_matched'),
    errors: [],
  };
}

/**
 * Build evidence-table rows from verified passages. A row without a verified
 * quotation is never emitted.
 */
export function buildEvidenceRows({
  question,
  sources = [],
  sourceContents = {},
  results = null,
  limit = MAX_EVIDENCE_ROWS,
} = {}) {
  const ready = readySources(sources);
  const sourceTexts = sourceTextMap(ready, sourceContents);
  const sourceIds = ready.map((source) => source.id);
  const queryTerms = new Set(tokenize(question));
  const search =
    results === null
      ? searchNotebookSources({
          sources: ready,
          sourceContents,
          query: question,
          limit: Math.max(limit * 2, 12),
        })
      : { ok: true, results, errors: [] };
  if (!search.ok) return { ok: false, errors: search.errors, rows: [], omitted: 0 };

  const sourceById = new Map(ready.map((source) => [source.id, source]));
  const rows = [];
  let omitted = 0;

  search.results.slice(0, limit).forEach((result, index) => {
    const source = sourceById.get(result.sourceId);
    const content = getContent(sourceContents, result.sourceId);
    if (!source || !content) {
      omitted += 1;
      return;
    }
    const quote = bestQuoteForSource({
      result,
      source,
      content,
      sourceTexts,
      queryTerms,
    });
    if (!quote) {
      omitted += 1;
      return;
    }
    rows.push({
      id: `evidence-row-${index + 1}-${quote.citation.locator.start}`,
      claim: quote.quote,
      claimKind: 'direct_quotation',
      sourceId: source.id,
      sourceTitle: source.title,
      location: {
        page: quote.page,
        start: quote.citation.locator.start,
        end: quote.citation.locator.end,
      },
      quote: quote.quote,
      citation: quote.citation,
      status: 'supported',
      classification: 'supported',
      basis: 'A direct quotation verified against the stored source text.',
      matchedTerms: result.matchedTerms || [],
    });
  });

  return {
    ok: true,
    rows,
    omitted,
    errors: [],
    note:
      'Every row is an exact source quotation. Agreement between rows is not inferred.',
  };
}

function findCueSentence({
  results,
  source,
  content,
  sourceTexts,
  pattern,
  queryTerms,
}) {
  for (const result of results) {
    const sentences = splitTextIntoSentences(result.text);
    for (const sentence of sentences) {
      if (!pattern.test(sentence.text)) continue;
      const quote = verifiedSpan({
        source,
        content,
        text: result.text,
        start: sentence.start,
        end: sentence.end,
        sourceIds: Object.keys(sourceTexts),
        sourceTexts,
      });
      if (quote) return quote;
    }
  }

  // The best matching passage is still the source's position when no dimension
  // cue exists. It is only used for the `argument`/`finding` dimension.
  const best = results[0];
  return best
    ? bestQuoteForSource({ result: best, source, content, sourceTexts, queryTerms })
    : null;
}

function dimensionValue({
  name,
  quote,
  found,
  foundReason,
  missingReason,
}) {
  const usable = Boolean(quote && found);
  return {
    dimension: name,
    status: usable ? 'supported' : 'not_identified',
    quote: usable ? quote.quote : null,
    citation: usable ? quote.citation : null,
    page: usable ? quote.page : null,
    classification: usable ? 'notebook_evidence' : 'unavailable',
    note: usable ? foundReason : missingReason,
  };
}

function conflictTerms(text) {
  return new Set(
    tokenize(text).filter(
      (term) =>
        !NEGATION_PATTERN.test(term) &&
        !OPPOSITE_PAIRS.some((pair) => pair.includes(term))
    )
  );
}

function sharedTerms(left, right) {
  const a = conflictTerms(left);
  const b = conflictTerms(right);
  return [...a].filter((term) => b.has(term));
}

function oppositePairIn(left, right) {
  const leftTerms = new Set(tokenize(left));
  const rightTerms = new Set(tokenize(right));
  for (const [one, two] of OPPOSITE_PAIRS) {
    if (leftTerms.has(one) && rightTerms.has(two)) return [one, two];
    if (leftTerms.has(two) && rightTerms.has(one)) return [two, one];
  }
  return null;
}

/**
 * Detect explicit lexical conflicts between two sources.
 *
 * This is deliberately conservative. It requires both passages to share the
 * subject terms and to differ by negation or by a known opposite pair. A source
 * that merely uses different wording is not reported as a disagreement.
 */
export function detectNotebookDisagreements({
  question,
  sources = [],
  sourceContents = {},
  results = null,
} = {}) {
  const ready = readySources(sources);
  const sourceTexts = sourceTextMap(ready, sourceContents);
  const sourceById = new Map(ready.map((source) => [source.id, source]));
  const queryTerms = new Set(tokenize(question));
  const search =
    results === null
      ? searchNotebookSources({
          sources: ready,
          sourceContents,
          query: question,
          limit: 24,
        })
      : { ok: true, results, errors: [] };
  if (!search.ok) {
    return { ok: false, conflicts: [], errors: search.errors };
  }

  const candidates = [];
  search.results.forEach((result) => {
    const source = sourceById.get(result.sourceId);
    const content = getContent(sourceContents, result.sourceId);
    if (!source || !content) return;
    splitTextIntoSentences(result.text).forEach((sentence) => {
      const quote = verifiedSpan({
        source,
        content,
        text: result.text,
        start: sentence.start,
        end: sentence.end,
        sourceIds: Object.keys(sourceTexts),
        sourceTexts,
      });
      if (quote) candidates.push(quote);
    });
  });

  const conflicts = [];
  const seen = new Set();

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      if (left.sourceId === right.sourceId) continue;

      const shared = sharedTerms(left.quote, right.quote);
      if (shared.length < 2) continue;
      const smaller = Math.min(
        conflictTerms(left.quote).size,
        conflictTerms(right.quote).size
      );
      if (smaller > 0 && shared.length / smaller < 0.4) continue;

      const leftNegated = NEGATION_PATTERN.test(left.quote);
      const rightNegated = NEGATION_PATTERN.test(right.quote);
      const opposite = oppositePairIn(left.quote, right.quote);
      let rule = null;
      let explanation = '';

      if (leftNegated !== rightNegated) {
        rule = 'negation';
        explanation =
          'The passages share subject terms but one contains an explicit negation and the other does not.';
      } else if (opposite) {
        rule = 'antonym_pair';
        explanation = `The passages use opposite terms (${opposite[0]} / ${opposite[1]}) about the same subject terms.`;
      }

      if (!rule) continue;
      const key = [left.citation, right.citation]
        .map(
          (citation) =>
            `${citation.sourceId}:${citation.locator.start}-${citation.locator.end}`
        )
        .sort()
        .join('|');
      if (seen.has(key)) continue;
      seen.add(key);

      conflicts.push({
        id: `conflict-${conflicts.length + 1}`,
        topic: shared.join(', '),
        rule,
        explanation,
        label: 'Rule-based conflict signal, not a model judgment',
        sourceA: {
          sourceId: left.sourceId,
          sourceTitle: left.sourceTitle,
          quote: left.quote,
          page: left.page,
          citation: left.citation,
        },
        sourceB: {
          sourceId: right.sourceId,
          sourceTitle: right.sourceTitle,
          quote: right.quote,
          page: right.page,
          citation: right.citation,
        },
        verified: true,
        agreementInferred: false,
      });
    }
  }

  return {
    ok: true,
    conflicts,
    errors: [],
    method: 'rule-based negation and opposite-pair detection',
    limitations: [
      'This detects explicit lexical conflicts only. It cannot detect a contradiction that is expressed without a negation or a listed opposite pair.',
      'A detected conflict does not establish which passage is correct.',
    ],
  };
}

/**
 * Compare the retrieved passages from each source. This is an extractive
 * comparison, not a semantic analysis of the whole source.
 */
export function compareNotebookEvidence(request = {}) {
  const started = Date.now();
  const question = clean(request.question, 300);
  const mode = request.mode === 'findings' ? 'findings' : 'positions';
  const ready = readySources(request.sources);
  if (!question) {
    return failureResult('research.compare', ['Enter what the sources should be compared on.'], {
      capability: RESEARCH_CAPABILITY,
    });
  }
  if (ready.length < 2) {
    return failureResult(
      'research.compare',
      ['At least two ready sources are needed for a comparison.'],
      {
        capability: RESEARCH_CAPABILITY,
        unavailable: ['cross-source comparison'],
      }
    );
  }

  const search = searchNotebookSources({
    sources: ready,
    sourceContents: request.sourceContents,
    query: question,
    limit: 24,
  });
  if (!search.ok) {
    return failureResult('research.compare', search.errors, {
      capability: RESEARCH_CAPABILITY,
    });
  }

  const grouped = groupBySource(search.results);
  const sourceTexts = sourceTextMap(ready, request.sourceContents);
  const queryTerms = new Set(tokenize(question));
  const rows = [];

  ready.forEach((source) => {
    const results = grouped.get(source.id) || [];
    if (results.length === 0) return;
    const content = getContent(request.sourceContents, source.id);
    if (!content) return;

    const position = bestQuoteForSource({
      result: results[0],
      source,
      content,
      sourceTexts,
      queryTerms,
    });
    if (!position) return;

    const argument = dimensionValue({
      name: mode === 'findings' ? 'reported finding' : 'argument',
      quote: position,
      found: true,
      foundReason: 'The strongest matching passage for this source.',
      missingReason: '',
    });

    const dimensions = [argument];
    if (mode !== 'findings') {
      dimensions.push(
        dimensionValue({
          name: 'method',
          quote: findCueSentence({
            results,
            source,
            content,
            sourceTexts,
            pattern: CUE_PATTERNS.method,
            queryTerms,
          }),
          found: results.some((result) =>
            splitTextIntoSentences(result.text).some((sentence) =>
              CUE_PATTERNS.method.test(sentence.text)
            )
          ),
          foundReason: 'A sentence with a method cue in the retrieved passage.',
          missingReason:
            'No method cue was found in the retrieved passages. This does not mean the source states no method.',
        }),
        dimensionValue({
          name: 'assumption',
          quote: findCueSentence({
            results,
            source,
            content,
            sourceTexts,
            pattern: CUE_PATTERNS.assumption,
            queryTerms,
          }),
          found: results.some((result) =>
            splitTextIntoSentences(result.text).some((sentence) =>
              CUE_PATTERNS.assumption.test(sentence.text)
            )
          ),
          foundReason: 'A sentence with an assumption cue in the retrieved passage.',
          missingReason:
            'No assumption cue was found in the retrieved passages. This does not mean the source makes no assumptions.',
        }),
        dimensionValue({
          name: 'conclusion',
          quote: findCueSentence({
            results,
            source,
            content,
            sourceTexts,
            pattern: CUE_PATTERNS.conclusion,
            queryTerms,
          }),
          found: results.some((result) =>
            splitTextIntoSentences(result.text).some((sentence) =>
              CUE_PATTERNS.conclusion.test(sentence.text)
            )
          ),
          foundReason: 'A sentence with a conclusion cue in the retrieved passage.',
          missingReason:
            'No conclusion cue was found in the retrieved passages. This does not mean the source draws no conclusion.',
        })
      );
    }

    const fallbackDimension = dimensions.find(
      (dimension) => dimension.citation && dimension.quote
    );
    rows.push({
      sourceId: source.id,
      sourceTitle: source.title,
      sourceType: source.sourceType || 'document',
      position: argument.quote,
      positionCitation: argument.citation,
      // A row-level citation is the strongest verified passage for this
      // source. Per-dimension citations remain available in `dimensions`.
      citation: argument?.citation || fallbackDimension?.citation || null,
      quote: argument?.quote || fallbackDimension?.quote || null,
      dimensions,
      matchCount: results.length,
    });
  });

  const missingSources = ready
    .filter((source) => !grouped.has(source.id))
    .map((source) => ({
      sourceId: source.id,
      title: source.title,
      reason: 'No retrieved passage matched the comparison question.',
    }));
  const disagreement = detectNotebookDisagreements({
    question,
    sources: ready,
    sourceContents: request.sourceContents,
    results: search.results,
  });

  const evidence = uniqueBy(
    rows.flatMap((row) =>
      row.dimensions
        .filter((dimension) => dimension.citation)
        .map((dimension) => ({
          kind: 'source_evidence',
          sourceId: row.sourceId,
          sourceTitle: row.sourceTitle,
          page: dimension.page,
          quote: dimension.quote,
          citation: dimension.citation,
          dimension: dimension.dimension,
        }))
    ),
    (item) =>
      `${item.sourceId}:${item.citation.locator.start}-${item.citation.locator.end}`
  );

  return createServiceResult({
    service: 'research.compare',
    capability: RESEARCH_CAPABILITY,
    status:
      rows.length >= 2 ? RUN_STATUS.COMPLETED : RUN_STATUS.PARTIAL,
    data: {
      question,
      mode,
      rows,
      missingSources,
      conflicts: disagreement.conflicts || [],
      agreement: {
        inferred: false,
        note:
          'Agreement or disagreement is not inferred automatically from wording. Only explicit rule-based conflict signals are listed.',
      },
      note:
        mode === 'findings'
          ? 'Findings comparison is extractive. Each row quotes the strongest matching passage.'
          : 'Each row quotes the strongest matching passage. Methods, assumptions and conclusions are shown only where a cue sentence was found.',
      limitations: [
        'A missing row does not prove the source is silent on the topic.',
        'Cue-based dimension extraction cannot verify what the section around a sentence means.',
        'No semantic entailment or model synthesis is used.',
      ],
    },
    evidence,
    interpretations: [
      {
        kind: 'rule_based_interpretation',
        text: `${rows.length} of ${ready.length} ready sources had a matching passage for this comparison.`,
        basis: 'BM25 retrieval over stored source text',
      },
    ],
    hypotheses: (disagreement.conflicts || []).length
      ? [
          {
            kind: 'unverified_hypothesis',
            text: 'A detected conflict may reflect different methods, populations or definitions, but this collection does not establish that explanation.',
            basis: 'Generated from a rule-based conflict signal; not supported by a source quotation.',
          },
        ]
      : [],
    unavailable: disagreement.conflicts?.length
      ? ['resolution of the detected disagreement']
      : [],
    limitations: [
      'Deterministic passage comparison only. This is not a systematic review.',
    ],
    metrics: {
      latencyMs: Date.now() - started,
      sources: ready.length,
      matchedSources: rows.length,
      retrievalResults: search.results.length,
      conflicts: disagreement.conflicts?.length || 0,
    },
    generator: GENERATORS.LOCAL_EXTRACTIVE_RULE,
  });
}

export function compareNotebookFindings(request = {}) {
  return compareNotebookEvidence({ ...request, mode: 'findings' });
}

function deriveResearchQuestions({
  question,
  assessments,
  coverage,
  evidenceRows,
}) {
  const questions = [];
  const relevant = assessments.filter((row) => row.status === 'relevant');

  relevant.slice(0, 3).forEach((row) => {
    const terms = (row.matchedTerms || []).filter((term) => term.length >= 3);
    const term = terms[0] || tokenize(question)[0];
    if (!term) return;
    questions.push({
      id: `question-source-${row.sourceId}`,
      question: `What does “${row.title}” establish about ${term}?`,
      sourceId: row.sourceId,
      sourceTitle: row.title,
      basis: 'A query term matched this source.',
      expectedAnswerable: true,
    });
  });

  if (relevant.length >= 2) {
    const left = relevant[0];
    const right = relevant[1];
    const shared = (left.matchedTerms || []).find((term) =>
      (right.matchedTerms || []).includes(term)
    );
    if (shared) {
      questions.push({
        id: `question-cross-${left.sourceId}-${right.sourceId}`,
        question: `Do “${left.title}” and “${right.title}” treat ${shared} in the same way?`,
        sourceId: left.sourceId,
        sourceTitle: left.title,
        sourceIds: [left.sourceId, right.sourceId],
        basis: 'Experiments with a cross-source question.',
        expectedAnswerable: true,
      });
    }
  }

  if (coverage.missing.length > 0 && relevant.length > 0) {
    const source = relevant[0];
    coverage.missing.slice(0, 2).forEach((term) => {
      questions.push({
        id: `question-gap-${term}-${source.sourceId}`,
        question: `Does “${source.title}” supply evidence about ${term}?`,
        sourceId: source.sourceId,
        sourceTitle: source.title,
        basis: `The question term “${term}” does not occur in the supplied source text.`,
        expectedAnswerable: false,
      });
    });
  }

  if (evidenceRows.length === 0) {
    questions.push({
      id: 'question-no-evidence',
      question: `Can the supplied sources answer: “${question}”?`,
      sourceId: relevant[0]?.sourceId || null,
      sourceTitle: relevant[0]?.title || null,
      basis: 'No verified evidence row was found for the question.',
      expectedAnswerable: false,
    });
  }

  return uniqueBy(questions, (item) => item.question).slice(0, 5);
}

function buildGaps({
  question,
  assessments,
  coverage,
  evidenceRows,
  conflicts,
}) {
  const gaps = [];
  const notMatched = assessments.filter((row) => row.status === 'not_matched');
  const relevant = assessments.filter((row) => row.status === 'relevant');

  coverage.missing.forEach((term) => {
    gaps.push({
      id: `gap-term-${term}`,
      title: `The question term “${term}” is absent`,
      detail: `“${term}” does not occur in any ready source text, so the supplied collection cannot establish a claim that depends on it.`,
      label: 'App assessment, not a finding of the literature',
      trigger: { kind: 'question_term', term, question },
      citations: [],
    });
  });

  if (evidenceRows.length === 0) {
    gaps.push({
      id: 'gap-no-verified-evidence',
      title: 'No verified passage matched',
      detail:
        'Retrieval found no passage to quote for this question. The sources cannot establish an answer from the current collection.',
      label: 'App assessment, not a finding of the literature',
      trigger: { kind: 'retrieval', question },
      citations: [],
    });
  }

  if (notMatched.length > 0) {
    gaps.push({
      id: 'gap-unmatched-sources',
      title: `${notMatched.length} source${notMatched.length === 1 ? '' : 's'} had no matching passage`,
      detail: `No retrieved passage from ${notMatched
        .slice(0, 3)
        .map((row) => `“${row.title}”`)
        .join(', ')} matched the question terms. This is a retrieval result, not proof that those sources are irrelevant.`,
      label: 'App assessment, not a finding of the literature',
      trigger: {
        kind: 'source_search',
        sourceIds: notMatched.map((row) => row.sourceId),
        question,
      },
      citations: [],
    });
  }

  if (relevant.length < 2 && relevant.length > 0) {
    gaps.push({
      id: 'gap-cross-source',
      title: 'Only one source matched',
      detail:
        'A cross-source comparison cannot be established from one matching source.',
      label: 'App assessment, not a finding of the literature',
      trigger: { kind: 'retrieval_coverage', matchedSources: relevant.length },
      citations: relevant[0]?.citation ? [relevant[0].citation] : [],
    });
  }

  if ((conflicts || []).length > 0) {
    const citations = [];
    const seenCitations = new Set();
    conflicts.forEach((conflict) => {
      [conflict.sourceA?.citation, conflict.sourceB?.citation]
        .filter(Boolean)
        .forEach((citation) => {
          const key = `${citation.sourceId}:${citation.locator?.start}:${citation.locator?.end}`;
          if (seenCitations.has(key)) return;
          seenCitations.add(key);
          citations.push(citation);
        });
    });
    gaps.push({
      id: 'gap-conflict-resolution',
      title: `The sources contain ${conflicts.length} explicit conflict signal${
        conflicts.length === 1 ? '' : 's'
      }`,
      detail:
        'The passages point in opposite directions. The supplied collection does not establish which passage is correct or why they differ. The conflict signals are listed separately below with both quotations.',
      label: 'App assessment, not a finding of the literature',
      trigger: { kind: 'conflict' },
      citations,
    });
  }

  return gaps;
}

function buildPlanSteps({
  question,
  queryTerms,
  relevant,
  notMatched,
  evidenceRows,
  coverage,
  gaps,
  conflicts,
}) {
  const matchedTermText = coverage.covered.join(', ') || 'none';
  const missingTermText = coverage.missing.join(', ') || 'none';

  return [
    {
      id: 'search-notebook',
      action: `Search the notebook for the question “${question}”.`,
      status: relevant.length > 0 ? 'ready' : 'needs_user_action',
      whatYouDo:
        relevant.length > 0
          ? 'Open the matching passages and check each quotation in its source.'
          : 'Add a source that directly addresses the question, or narrow the question.',
      whatTheAppCannotDo:
        'It cannot decide whether the notebook collection is representative of the wider literature.',
      matchedTerms: coverage.covered,
      missingTerms: coverage.missing,
      note: `Question terms in the sources: ${matchedTermText}. Missing: ${missingTermText}.`,
    },
    {
      id: 'assess-relevance',
      action: 'Assess each ready source against the question.',
      status: relevant.length >= 2 ? 'ready' : 'partial',
      whatYouDo:
        relevant.length >= 2
          ? 'Treat the matched sources as candidates, not as a complete literature set.'
          : 'Supply at least one independent source, then run the comparison again.',
      whatTheAppCannotDo:
        'It cannot prove a source irrelevant; a no-match result only means the lexical retrieval found no passage.',
      matchedSources: relevant.length,
      unmatchedSources: notMatched.length,
    },
    {
      id: 'extract-evidence',
      action: 'Extract exact quotations with source locations.',
      status: evidenceRows.length > 0 ? 'ready' : 'needs_user_action',
      whatYouDo:
        evidenceRows.length > 0
          ? 'Inspect every quotation at its offsets before relying on it.'
          : 'Try a different question term that occurs in the source.',
      whatTheAppCannotDo:
        'It cannot create evidence where no verified quotation exists.',
      rows: evidenceRows.length,
    },
    {
      id: 'compare-findings',
      action: 'Compare what the matched passages report.',
      status: relevant.length >= 2 ? 'ready' : 'unavailable',
      whatYouDo:
        relevant.length >= 2
          ? 'Read the comparison dimensions and verify each cited passage.'
          : 'Add a second source with a matching passage.',
      whatTheAppCannotDo:
        'It cannot infer agreement from similar wording or resolve a disagreement it only detects lexically.',
      conflicts: conflicts.length,
    },
    {
      id: 'identify-gaps',
      action: 'Record what the collection cannot establish.',
      status: gaps.length > 0 ? 'ready' : 'partial',
      whatYouDo:
        gaps.length > 0
          ? 'Decide whether to narrow the question or add sources for the listed gaps.'
          : 'No retrieval gap was detected; this is not proof that no gap exists.',
      whatTheAppCannotDo:
        'It cannot query an external database, DOI index or library catalogue.',
      gaps: gaps.length,
    },
    {
      id: 'find-literature',
      action: 'Find independent literature.',
      status: 'requires_user_action',
      whatYouDo:
        'Use your library, database or search engine, then add the sources you choose as web pages or files.',
      whatTheAppCannotDo:
        'This build has no web search, DOI lookup, PubMed or literature-database connection.',
    },
  ];
}

export function buildResearchPlan(request = {}) {
  const started = Date.now();
  const question = clean(request.question || request.topic, 300);
  if (!question) {
    return failureResult('research', ['Enter a research topic or question first.'], {
      capability: RESEARCH_CAPABILITY,
    });
  }

  const ready = readySources(request.sources);
  const search = searchNotebookSources({
    sources: ready,
    sourceContents: request.sourceContents,
    query: question,
    limit: 24,
  });
  const results = search.ok ? search.results : [];
  const queryTerms = tokenize(question);
  const coverage = topicTermCoverage(question, {
    sources: ready,
    sourceContents: request.sourceContents,
  });
  const relevance = assessSourceRelevance({
    question,
    sources: ready,
    sourceContents: request.sourceContents,
    results,
  });
  const evidenceTable = buildEvidenceRows({
    question,
    sources: ready,
    sourceContents: request.sourceContents,
    results,
  });
  const disagreement = detectNotebookDisagreements({
    question,
    sources: ready,
    sourceContents: request.sourceContents,
    results,
  });
  const questions = deriveResearchQuestions({
    question,
    assessments: relevance.rows,
    coverage,
    evidenceRows: evidenceTable.rows,
  });
  const gaps = buildGaps({
    question,
    assessments: relevance.rows,
    coverage,
    evidenceRows: evidenceTable.rows,
    conflicts: disagreement.conflicts,
  });
  const searchPlan = buildPlanSteps({
    question,
    queryTerms,
    relevant: relevance.relevant,
    notMatched: relevance.notMatched,
    evidenceRows: evidenceTable.rows,
    coverage,
    gaps,
    conflicts: disagreement.conflicts,
  });
  const sourceCount = new Set(evidenceTable.rows.map((row) => row.sourceId)).size;

  return createServiceResult({
    service: 'research',
    capability: RESEARCH_CAPABILITY,
    // A research plan is never "completed" research: external literature
    // search is unavailable, and the output is a plan over the local notebook.
    status: RUN_STATUS.PARTIAL,
    data: {
      topic: question,
      questions,
      searchPlan,
      evidenceTable: {
        columns: ['Claim', 'Source', 'Location', 'Exact quotation', 'Status'],
        rows: evidenceTable.rows,
        omittedUnverified: evidenceTable.omitted,
        note: evidenceTable.note,
      },
      sources: relevance.rows,
      sourceAssessments: relevance.rows,
      relevantSources: relevance.relevant,
      notMatchedSources: relevance.notMatched,
      gaps,
      followUps: questions,
      conflicts: disagreement.conflicts,
      coverage,
      retrieval: {
        performed: true,
        query: question,
        resultCount: results.length,
        matchedSources: sourceCount,
      },
      externalSearch: {
        performed: false,
        available: false,
        reason:
          'No web search, DOI lookup or literature database is connected. The plan uses only the notebook sources already supplied.',
      },
      planLabel: 'Plan generated from this notebook and this question',
    },
    interpretations: [
      {
        kind: 'rule_based_interpretation',
        text: `${evidenceTable.rows.length} verified quotation${
          evidenceTable.rows.length === 1 ? '' : 's'
        } from ${sourceCount} source${sourceCount === 1 ? '' : 's'}.`,
        basis: 'BM25 retrieval and citation verification',
      },
    ],
    unavailable: [
      'external literature search',
      'DOI or PubMed lookup',
      'automatic bibliography generation',
      'model-written literature review',
    ],
    limitations: [
      'This is a research plan, not a literature review.',
      'The learner must find and supply independent sources.',
      'Questions and gaps are app assessments derived from retrieval.',
    ],
    metrics: {
      latencyMs: Date.now() - started,
      sources: ready.length,
      questions: questions.length,
      evidenceRows: evidenceTable.rows.length,
      gaps: gaps.length,
    },
    generator: GENERATORS.LOCAL_EXTRACTIVE_RULE,
  });
}

export function exploreNotebookTopic(request = {}) {
  const topic = clean(request.topic || request.question, 300);
  if (!topic) {
    return failureResult('research.explore', ['Enter a topic to explore.'], {
      capability: RESEARCH_CAPABILITY,
    });
  }
  const plan = buildResearchPlan({ ...request, question: topic });
  const concepts = extractSourceConcepts({
    sources: request.sources,
    sourceContents: request.sourceContents,
    limit: 8,
  });
  const coverage = topicTermCoverage(topic, request);
  const coveredAspects = concepts.map((concept) => ({
    id: concept.id,
    aspect: concept.term,
    sourceIds: concept.sourceIds,
    sourceCount: concept.sourceCount,
    evidenceCount: concept.count,
    citation: concept.firstEvidence?.citation || null,
    label: 'Rule-based aspect derived from source terms',
  }));
  const uncoveredAspects = [
    ...coverage.missing.map((term) => ({
      id: `uncovered-${term}`,
      aspect: term,
      reason: 'The term does not occur in any ready source text.',
      sourceIds: [],
      label: 'App assessment, not a finding of the literature',
    })),
    ...(plan.data?.notMatchedSources || []).map((source) => ({
      id: `unmatched-${source.sourceId}`,
      aspect: source.title,
      reason: source.reason,
      sourceIds: [source.sourceId],
      label: 'Retrieval result, not proof of irrelevance',
    })),
  ];

  return createServiceResult({
    service: 'research.explore',
    capability: RESEARCH_CAPABILITY,
    status: plan.status,
    data: {
      topic,
      coveredAspects,
      uncoveredAspects,
      questions: plan.data?.questions || [],
      gaps: plan.data?.gaps || [],
      evidenceTable: plan.data?.evidenceTable || null,
      sourceAssessments: plan.data?.sourceAssessments || [],
      retrieval: plan.data?.retrieval || null,
      externalSearch: plan.data?.externalSearch || null,
      label:
        'Aspects are recurring significant terms in the stored source text, not a model-generated topic map.',
    },
    evidence: coveredAspects
      .filter((aspect) => aspect.citation)
      .map((aspect) => ({
        kind: 'source_evidence',
        sourceId: aspect.citation.sourceId,
        quote: aspect.citation.quote,
        citation: aspect.citation,
        aspect: aspect.aspect,
      })),
    interpretations: [
      {
        kind: 'rule_based_interpretation',
        text: `${coveredAspects.length} covered aspect${
          coveredAspects.length === 1 ? '' : 's'
        } and ${uncoveredAspects.length} uncovered item${
          uncoveredAspects.length === 1 ? '' : 's'
        } were found.`,
        basis: 'Term frequency and source coverage',
      },
    ],
    unavailable: plan.unavailable,
    limitations: plan.limitations,
    metrics: { ...plan.metrics, coveredAspects: coveredAspects.length },
    generator: GENERATORS.LOCAL_EXTRACTIVE_RULE,
  });
}

/**
 * Classify one claim against the stored source text.
 *
 * The classification is lexical, not entailment. A claim can be supported only
 * when at least one citation verifies and its wording overlaps the quoted
 * passage enough to show that the passage is actually about the claim.
 */
export function classifyClaim({
  claim,
  citations = [],
  sources = [],
  sourceContents = {},
} = {}) {
  const text = clean(claim, 2000);
  const ready = readySources(sources);
  const sourceIds = ready.map((source) => source.id);
  const sourceTexts = sourceTextMap(ready, sourceContents);
  const accepted = [];
  const rejected = [];

  (Array.isArray(citations) ? citations : []).forEach((citation) => {
    const verification = validateCitation(citation, {
      sourceIds,
      sourceTexts,
      requireSourceText: true,
    });
    if (verification.ok && verification.verified) {
      accepted.push(verification.citation);
    } else {
      rejected.push({ citation, errors: verification.errors });
    }
  });

  if (accepted.length === 0) {
    return {
      claim: text,
      classification: 'unsupported',
      reason:
        'No citation for this claim could be verified against the stored source text.',
      citations: [],
      rejectedCitations: rejected,
      evidence: rejected,
    };
  }

  const claimTerms = new Set(tokenize(text));
  const quoteTerms = new Set(
    accepted.flatMap((citation) => tokenize(citation.quote))
  );
  const overlap = [...claimTerms].filter((term) => quoteTerms.has(term));
  const isExactQuote = accepted.some((citation) => citation.quote === text);
  const classification =
    isExactQuote || overlap.length >= 2
      ? 'supported'
      : overlap.length === 1
        ? 'partially_supported'
        : 'unsupported';

  return {
    claim: text,
    classification,
    reason:
      classification === 'supported'
        ? 'The claim is a verified quotation, or its wording overlaps a verified passage.'
        : classification === 'partially_supported'
          ? 'One verified passage shares only one content term with the claim. The evidence is partial.'
          : 'The verified citations do not contain the claim’s content terms. The evidence does not cover it.',
    citations: accepted,
    rejectedCitations: rejected,
    evidence: accepted.map((citation) => ({
      sourceId: citation.sourceId,
      quote: citation.quote,
      citation,
    })),
    matchedTerms: overlap,
    lexicalCheckOnly: true,
  };
}

function claimAssessmentSummary(claims) {
  const counts = {
    supported: 0,
    partially_supported: 0,
    unsupported: 0,
  };
  claims.forEach((claim) => {
    counts[claim.classification] = (counts[claim.classification] || 0) + 1;
  });
  return {
    ...counts,
    total: claims.length,
    note:
      'Classification is lexical, not semantic entailment. Unsupported claims are shown with the evidence that failed to cover them.',
  };
}

/**
 * Build a multi-source answer from verified local passages. One claim per
 * source is preferred so an answer that spans two sources cites both.
 */
export function buildResearchAnswer(request = {}) {
  const started = Date.now();
  const question = clean(request.question, 300);
  const ready = readySources(request.sources);
  if (!question) {
    return failureResult('research.answer', ['Enter a research question first.'], {
      capability: RESEARCH_CAPABILITY,
    });
  }

  const search = searchNotebookSources({
    sources: ready,
    sourceContents: request.sourceContents,
    query: question,
    limit: 16,
  });
  if (!search.ok) {
    return failureResult('research.answer', search.errors, {
      capability: RESEARCH_CAPABILITY,
    });
  }

  const sourceTexts = sourceTextMap(ready, request.sourceContents);
  const sourceById = new Map(ready.map((source) => [source.id, source]));
  const queryTerms = new Set(tokenize(question));
  const grouped = groupBySource(search.results);
  const orderedResults = [
    ...[...grouped.values()].map((results) => results[0]),
    ...search.results.filter(
      (result, _index) => grouped.get(result.sourceId)?.[0] !== result
    ),
  ].slice(0, MAX_RESEARCH_CLAIMS);

  const claims = [];
  orderedResults.forEach((result, index) => {
    const source = sourceById.get(result.sourceId);
    const content = getContent(request.sourceContents, result.sourceId);
    if (!source || !content) return;
    const quote = bestQuoteForSource({
      result,
      source,
      content,
      sourceTexts,
      queryTerms,
    });
    if (!quote) return;
    const classification = classifyClaim({
      claim: quote.quote,
      citations: [quote.citation],
      sources: ready,
      sourceContents: request.sourceContents,
    });
    claims.push({
      id: `claim-${index + 1}`,
      text: quote.quote,
      claimKind: 'direct_quotation',
      sourceId: source.id,
      sourceTitle: source.title,
      page: quote.page,
      citation: quote.citation,
      citations: [quote.citation],
      classification: classification.classification,
      classificationReason: classification.reason,
      matchedTerms: classification.matchedTerms,
      rejectedCitations: classification.rejectedCitations,
      generator: GENERATORS.LOCAL_EXTRACTIVE,
    });
  });

  const coverage = topicTermCoverage(question, {
    sources: ready,
    sourceContents: request.sourceContents,
  });
  const relevance = assessSourceRelevance({
    question,
    sources: ready,
    sourceContents: request.sourceContents,
    results: search.results,
  });
  const evidenceRows = buildEvidenceRows({
    question,
    sources: ready,
    sourceContents: request.sourceContents,
    results: search.results,
  });
  const disagreement = detectNotebookDisagreements({
    question,
    sources: ready,
    sourceContents: request.sourceContents,
    results: search.results,
  });
  const gaps = buildGaps({
    question,
    assessments: relevance.rows,
    coverage,
    evidenceRows: evidenceRows.rows,
    conflicts: disagreement.conflicts,
  });
  const followUps = deriveResearchQuestions({
    question,
    assessments: relevance.rows,
    coverage,
    evidenceRows: evidenceRows.rows,
  });
  const sourceCount = new Set(claims.map((claim) => claim.sourceId)).size;
  const assessment = claimAssessmentSummary(claims);
  const noMatch = claims.length === 0;

  return createServiceResult({
    service: 'research.answer',
    capability: RESEARCH_CAPABILITY,
    status: noMatch ? RUN_STATUS.PARTIAL : RUN_STATUS.COMPLETED,
    data: {
      question,
      answer: noMatch
        ? null
        : `The supplied sources support ${claims.length} directly quoted claim${
            claims.length === 1 ? '' : 's'
          } from ${sourceCount} source${sourceCount === 1 ? '' : 's'}.`,
      answerKind: 'extractive_multi_source',
      claims,
      claimAssessment: assessment,
      sourceCount,
      followUps,
      canEstablish: claims.map((claim) => ({
        claimId: claim.id,
        text: claim.text,
        citation: claim.citation,
      })),
      cannotEstablish: gaps,
      gaps,
      conflicts: disagreement.conflicts,
      relevance: relevance.rows,
      evidenceTable: {
        columns: ['Claim', 'Source', 'Location', 'Exact quotation', 'Status'],
        rows: evidenceRows.rows,
        omittedUnverified: evidenceRows.omitted,
      },
      externalInformation: {
        used: false,
        note:
          'No external web search or literature database was used. Any web pages already stored by the learner are part of notebook evidence and are not independently verified by this tool.',
      },
      generator: GENERATORS.LOCAL_EXTRACTIVE,
      label:
        'Claims are exact stored source quotations. The summary sentence is a rule-based count, not a model synthesis.',
    },
    evidence: claims.map((claim) => ({
      kind: 'source_evidence',
      sourceId: claim.sourceId,
      sourceTitle: claim.sourceTitle,
      page: claim.page,
      quote: claim.text,
      citation: claim.citation,
      classification: claim.classification,
    })),
    interpretations: [
      {
        kind: 'rule_based_interpretation',
        text: `${claims.length} claim${
          claims.length === 1 ? '' : 's'
        } were selected from ${search.results.length} verified retrieval results.`,
        basis: 'BM25 retrieval plus exact citation verification',
      },
    ],
    hypotheses:
      disagreement.conflicts?.length > 0
        ? [
            {
              kind: 'unverified_hypothesis',
              text: 'The detected disagreement may reflect different methods, samples or definitions. The supplied sources do not establish that explanation.',
              basis: 'Generated from a rule-based conflict signal, not quoted evidence.',
            },
          ]
        : [],
    unavailable: [
      ...new Set([
        ...gaps.map((gap) => gap.title),
        ...coverage.missing.map(
          (term) => `evidence about the question term “${term}”`
        ),
        ...(sourceCount < 2 ? ['a cross-source synthesis'] : []),
        'external literature search',
        'DOI or PubMed lookup',
      ]),
    ],
    limitations: [
      'This is an extractive research answer, not a model-written literature review.',
      'A no-match result does not prove the source is silent; it means lexical retrieval found no passage.',
      'Claims are classified lexically, not by semantic entailment.',
    ],
    metrics: {
      latencyMs: Date.now() - started,
      sources: ready.length,
      sourceCount,
      claims: claims.length,
      retrievalResults: search.results.length,
      unsupportedClaims: assessment.unsupported,
    },
    generator: GENERATORS.LOCAL_EXTRACTIVE,
  });
}

/**
 * Apply claims returned by a provider. Every citation is re-verified here; an
 * unsupported claim is retained and classified rather than silently dropped.
 */
export function applyModelClaims({
  localAnswer,
  claims = [],
  sources = [],
  sourceContents = {},
  model = null,
} = {}) {
  const ready = readySources(sources);
  const classified = (Array.isArray(claims) ? claims : []).slice(0, MAX_RESEARCH_CLAIMS).map(
    (claim, index) => {
      const classification = classifyClaim({
        claim: claim?.text,
        citations: claim?.citations,
        sources: ready,
        sourceContents,
      });
      return {
        id: `model-claim-${index + 1}`,
        text: clean(claim?.text, 2000),
        claimKind: 'model_interpretation',
        sourceId: classification.citations[0]?.sourceId || null,
        sourceTitle:
          ready.find(
            (source) => source.id === classification.citations[0]?.sourceId
          )?.title || null,
        citation: classification.citations[0] || null,
        citations: classification.citations,
        classification: classification.classification,
        classificationReason: classification.reason,
        matchedTerms: classification.matchedTerms,
        rejectedCitations: classification.rejectedCitations,
        generator: GENERATORS.AI_GROUNDED,
      };
    }
  );
  const allClaims = [...(localAnswer?.data?.claims || []), ...classified];
  const assessment = claimAssessmentSummary(allClaims);

  return {
    ...localAnswer,
    capability: CAPABILITY_STATUS.PARTIAL,
    data: {
      ...(localAnswer?.data || {}),
      claims: allClaims,
      modelClaims: classified,
      claimAssessment: assessment,
      sourceCount: new Set(allClaims.map((claim) => claim.sourceId).filter(Boolean)).size,
      answerKind: classified.length
        ? 'model_claims_plus_local_quotes'
        : localAnswer?.data?.answerKind,
      externalInformation: {
        used: false,
        note:
          'The provider received only the verified source passages sent by this browser. It was not given a web search or literature database.',
      },
    },
    evidence: [
      ...(localAnswer?.evidence || []),
      ...classified
        .filter((claim) => claim.citation)
        .map((claim) => ({
          kind: 'model_claim_evidence',
          sourceId: claim.sourceId,
          quote: claim.citation.quote,
          citation: claim.citation,
          classification: claim.classification,
        })),
    ],
    interpretations: [
      ...(localAnswer?.interpretations || []),
      {
        kind: 'model_interpretation',
        text: `${classified.length} claim${
          classified.length === 1 ? '' : 's'
        } came from a model and were citation-checked in the browser.`,
        basis: 'Provider response, re-verified against stored source text',
        model,
      },
    ],
    model,
    generator: classified.length ? GENERATORS.AI_GROUNDED : localAnswer?.generator,
  };
}

/**
 * Rerank BM25 results with an optional provider callback. The final ordering is
 * always rebuilt from the original verified results, and every citation is
 * checked again. Without a callback the order is unchanged and the result says
 * so.
 */
export async function rerankNotebookResults({
  question,
  sources = [],
  sourceContents = {},
  limit = 8,
  rerank = null,
} = {}) {
  const search = searchNotebookSources({
    sources: readySources(sources),
    sourceContents,
    query: question,
    limit,
  });
  if (!search.ok) {
    return failureResult('research.rerank', search.errors, {
      capability: RESEARCH_CAPABILITY,
    });
  }

  if (typeof rerank !== 'function') {
    return createServiceResult({
      service: 'research.rerank',
      capability: RESEARCH_CAPABILITY,
      status: RUN_STATUS.PARTIAL,
      data: {
        question,
        results: search.results,
        reranked: false,
        note:
          'No provider is available. The BM25 order is unchanged and every citation was still verified locally.',
      },
      evidence: search.results.map((result) => ({
        kind: 'source_evidence',
        sourceId: result.sourceId,
        sourceTitle: result.sourceTitle,
        page: result.page,
        quote: result.text,
        citation: result.citation,
      })),
      unavailable: ['provider reranking'],
      generator: GENERATORS.LOCAL_EXTRACTIVE,
    });
  }

  let order = null;
  let reason = '';
  try {
    const response = await rerank({
      question,
      results: search.results.map((result, index) => ({
        index,
        sourceId: result.sourceId,
        sourceTitle: result.sourceTitle,
        text: result.text,
        page: result.page,
      })),
    });
    order = Array.isArray(response?.order) ? response.order : null;
    reason = clean(response?.reason, 500);
  } catch (error) {
    return createServiceResult({
      service: 'research.rerank',
      capability: RESEARCH_CAPABILITY,
      status: RUN_STATUS.PARTIAL,
      data: {
        question,
        results: search.results,
        reranked: false,
        note: `The provider reranker failed, so the BM25 order is unchanged: ${
          error?.message || 'unknown error'
        }`,
      },
      evidence: search.results.map((result) => ({
        kind: 'source_evidence',
        sourceId: result.sourceId,
        sourceTitle: result.sourceTitle,
        page: result.page,
        quote: result.text,
        citation: result.citation,
      })),
      errors: [error?.message || 'The provider reranker failed.'],
      generator: GENERATORS.LOCAL_EXTRACTIVE,
    });
  }

  if (!order) {
    return createServiceResult({
      service: 'research.rerank',
      capability: RESEARCH_CAPABILITY,
      status: RUN_STATUS.PARTIAL,
      data: {
        question,
        results: search.results,
        reranked: false,
        note:
          'The provider did not return a usable ordering. The BM25 order is unchanged.',
      },
      evidence: search.results.map((result) => ({
        kind: 'source_evidence',
        sourceId: result.sourceId,
        sourceTitle: result.sourceTitle,
        page: result.page,
        quote: result.text,
        citation: result.citation,
      })),
      generator: GENERATORS.LOCAL_EXTRACTIVE,
    });
  }

  const seen = new Set();
  const ordered = [];
  order.forEach((value) => {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= search.results.length) return;
    if (seen.has(index)) return;
    seen.add(index);
    ordered.push(search.results[index]);
  });
  search.results.forEach((result, index) => {
    if (!seen.has(index)) ordered.push(result);
  });

  const sourceIds = readySources(sources).map((source) => source.id);
  const sourceTexts = sourceTextMap(sources, sourceContents);
  const verified = [];
  const rejected = [];
  ordered.forEach((result) => {
    const check = validateCitation(result.citation, {
      sourceIds,
      sourceTexts,
      requireSourceText: true,
    });
    if (check.ok && check.verified) {
      verified.push({ ...result, citation: check.citation });
    } else {
      rejected.push({ result, errors: check.errors });
    }
  });

  return createServiceResult({
    service: 'research.rerank',
    capability: RESEARCH_CAPABILITY,
    status: rejected.length ? RUN_STATUS.PARTIAL : RUN_STATUS.COMPLETED,
    data: {
      question,
      results: verified,
      reranked: true,
      rejected: rejected.length,
      note: rejected.length
        ? `${rejected.length} reranked passage${
            rejected.length === 1 ? '' : 's'
          } failed citation verification and were removed.`
        : 'The provider changed the order. Every reranked passage still matches its source at the cited offsets.',
      reason,
    },
    evidence: verified.map((result) => ({
      kind: 'source_evidence',
      sourceId: result.sourceId,
      sourceTitle: result.sourceTitle,
      page: result.page,
      quote: result.text,
      citation: result.citation,
    })),
    limitations: [
      'The provider only reorders passages retrieved locally; it does not see the whole source library.',
    ],
    generator: GENERATORS.LOCAL_EXTRACTIVE,
  });
}

/**
 * Map the gateway's span indexes back to the verified spans that were sent.
 * A claim whose index points outside that set is retained without a citation
 * and will be classified as unsupported by `applyModelClaims`.
 */
export function mapGatewayClaims({ claims = [], spans = [] } = {}) {
  const safeSpans = Array.isArray(spans) ? spans : [];
  return (Array.isArray(claims) ? claims : []).map((claim, index) => {
    const indexes = Array.isArray(claim?.span_indexes)
      ? claim.span_indexes
      : Array.isArray(claim?.spanIndexes)
        ? claim.spanIndexes
        : [];
    const citations = [];
    indexes.forEach((value) => {
      const spanIndex = Number(value);
      if (
        !Number.isInteger(spanIndex) ||
        spanIndex < 0 ||
        spanIndex >= safeSpans.length
      ) {
        return;
      }
      const span = safeSpans[spanIndex];
      if (!span || typeof span.sourceId !== 'string' || typeof span.text !== 'string') {
        return;
      }
      const start = span.locator?.start ?? span.start;
      const end = span.locator?.end ?? span.end;
      if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) {
        return;
      }
      citations.push({
        sourceId: span.sourceId,
        quote: span.text,
        locator: {
          kind: span.locator?.kind || 'offset',
          start,
          end,
        },
      });
    });
    return {
      id: `gateway-claim-${index + 1}`,
      text: clean(claim?.text, 2000),
      citations,
      rejectedSpanIndexes: indexes.filter((value) => {
        const spanIndex = Number(value);
        return (
          !Number.isInteger(spanIndex) ||
          spanIndex < 0 ||
          spanIndex >= safeSpans.length
        );
      }),
    };
  });
}

/**
 * Map provider-surfaced conflicts back to the verified spans that were sent.
 *
 * A provider conflict is a model interpretation, not a finding. The mapped
 * shape is deliberately the same as the local rule-based conflict so the UI
 * can render both quotations and their citations, while the surrounding
 * section keeps the model-origin label. A conflict is dropped unless two
 * different sources are cited; a same-source disagreement is not a
 * cross-source conflict.
 */
export function mapGatewayConflicts({ conflicts = [], spans = [] } = {}) {
  const safeSpans = Array.isArray(spans) ? spans : [];
  const mapped = [];

  (Array.isArray(conflicts) ? conflicts : []).forEach((conflict) => {
    const indexes = Array.isArray(conflict?.span_indexes)
      ? conflict.span_indexes
      : Array.isArray(conflict?.spanIndexes)
        ? conflict.spanIndexes
        : [];
    const rejectedSpanIndexes = [];
    const candidates = [];

    indexes.forEach((value) => {
      const index = Number(value);
      if (!Number.isInteger(index) || index < 0 || index >= safeSpans.length) {
        rejectedSpanIndexes.push(value);
        return;
      }
      const span = safeSpans[index];
      const start = span?.locator?.start ?? span?.start;
      const end = span?.locator?.end ?? span?.end;
      if (
        !span ||
        typeof span.sourceId !== 'string' ||
        typeof span.text !== 'string' ||
        !span.text.trim() ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        end <= start
      ) {
        rejectedSpanIndexes.push(value);
        return;
      }
      if (candidates.some((candidate) => candidate.sourceId === span.sourceId)) {
        return;
      }
      candidates.push({
        sourceId: span.sourceId,
        sourceTitle: span.sourceTitle || 'Source',
        quote: span.text,
        page: Number.isInteger(span.page) ? span.page : null,
        citation: {
          sourceId: span.sourceId,
          quote: span.text,
          locator: { kind: 'offset', start, end },
        },
      });
    });

    const [sourceA, sourceB] = candidates;
    if (!sourceA || !sourceB || sourceA.sourceId === sourceB.sourceId) return;

    mapped.push({
      id: `gateway-conflict-${mapped.length + 1}`,
      text: clean(conflict?.text, 500),
      explanation: clean(conflict?.explanation, 1200),
      label: 'Model-surfaced conflict signal, not a judgment',
      sourceA,
      sourceB,
      rejectedSpanIndexes,
    });
  });

  return mapped;
}

/**
 * Run a research answer locally, then optionally add provider claims. Any
 * provider failure leaves the local answer intact and records the real error;
 * it never silently changes the trust label.
 */
export async function runGroundedResearch({
  sources = [],
  sourceContents = {},
  question,
  gateway = null,
} = {}) {
  const local = buildResearchAnswer({ question, sources, sourceContents });
  if (typeof gateway !== 'function') {
    return {
      ...local,
      data: {
        ...(local.data || {}),
        gateway: {
          attempted: false,
          used: false,
          reason: 'No gateway callable was supplied. The answer is entirely local.',
        },
      },
    };
  }

  const spans = (local.evidence || [])
    .filter((item) => item.citation)
    .slice(0, 12)
    .map((item) => ({
      sourceId: item.sourceId,
      sourceTitle: item.sourceTitle || '',
      text: item.citation.quote,
      start: item.citation.locator.start,
      end: item.citation.locator.end,
      page: Number.isInteger(item.page) ? item.page : null,
    }));
  if (spans.length === 0) {
    return {
      ...local,
      data: {
        ...(local.data || {}),
        gateway: {
          attempted: true,
          used: false,
          reason: 'No verified spans were available to send to the provider.',
        },
      },
    };
  }

  const response = await gateway({ question, spans, operation: 'claims' });
  if (!response?.ok) {
    return {
      ...local,
      errors: [
        ...(local.errors || []),
        response?.error || 'The research gateway did not return usable claims.',
      ],
      data: {
        ...(local.data || {}),
        gateway: {
          attempted: true,
          used: false,
          reason:
            response?.error ||
            'The research gateway did not return usable claims. The local answer is unchanged.',
        },
      },
    };
  }

  const mapped = mapGatewayClaims({
    claims: response.data?.claims,
    spans,
  });
  if (mapped.length === 0) {
    return {
      ...local,
      data: {
        ...(local.data || {}),
        gateway: {
          attempted: true,
          used: false,
          reason: 'The gateway returned no claims. The local answer is unchanged.',
        },
      },
    };
  }

  const combined = applyModelClaims({
    localAnswer: local,
    claims: mapped,
    sources,
    sourceContents,
    model: response.data?.model || null,
  });
  return {
    ...combined,
    data: {
      ...combined.data,
      gateway: {
        attempted: true,
        used: true,
        model: response.data?.model || null,
        reason:
          'Provider claims were mapped back to the verified spans sent and citation-checked in the browser.',
      },
    },
  };
}

export function buildResearchQuestionSet(request = {}) {
  const plan = buildResearchPlan(request);
  return plan;
}
