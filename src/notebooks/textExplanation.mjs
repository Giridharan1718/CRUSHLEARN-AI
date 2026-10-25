// Subject-aware, deterministic Text Understanding Engine.
//
// This is not a language model. It does not paraphrase, translate or invent
// content. Every explanation segment is a VERBATIM span of the explained text,
// tracked with exact character offsets, so it can be validated as a citation
// against the source (via validateCitation) whenever the selection came from a
// notebook source.
//
// The engine does four things:
//   1. Analyses the selection (subject, main ideas, terms, prerequisites,
//      equations, quantities, relationships, ambiguities, limitations).
//   2. Selects source sentences according to the requested level and a
//      subject-specific strategy.
//   3. Preserves numbers, equations, units and qualifications, then validates
//      the result against the selection.
//   4. States honestly what it cannot do: translate, generate analogies,
//      generate arbitrary diagrams, or measure understanding by itself.
//
// Levels: ELI5, ELI10, Beginner, Intermediate, Advanced, Expert. The legacy
// `normal` level is accepted as an alias for `intermediate` so saved choices
// keep working.

import { CITATION_LOCATOR_KINDS, validateCitation } from './citations.mjs';
import { splitTextIntoSentences, tokenize } from './sourceText.mjs';
import { findVisualExplanationForTopic } from '../visual/visualCatalog.mjs';

export const EXPLANATION_LEVELS = Object.freeze([
  'eli5',
  'eli10',
  'beginner',
  'intermediate',
  'advanced',
  'expert',
]);

/** Older saved settings used `normal`; keep it readable. */
export const LEGACY_LEVEL_ALIASES = Object.freeze({ normal: 'intermediate' });

export const EXPLANATION_LEVEL_LABELS = Object.freeze({
  eli5: 'ELI5',
  eli10: 'ELI10',
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
});

export const EXPLANATION_ACTIONS = Object.freeze([
  'simplify',
  'word',
  'example',
  'steps',
  'sections',
  'diagram',
  'check',
  'another',
]);

export const MAX_EXPLANATION_CHARS = 4000;
export const MAX_DIFFICULT_WORDS = 6;
export const MAX_GLOSSARY_ENTRIES = 8;
export const MAX_FACTS_SHOWN = 24;
export const MAX_ANALYSIS_ITEMS = 8;

/**
 * Languages are listed so a learner can see what is possible. Only English is
 * implemented locally. The other entries are not advertised as working: a
 * model-backed translation adapter is required and is not connected.
 */
export const EXPLANATION_LANGUAGES = Object.freeze([
  { code: 'en', label: 'English', local: true },
  { code: 'es', label: 'Spanish', local: false },
  { code: 'fr', label: 'French', local: false },
  { code: 'hi', label: 'Hindi', local: false },
  { code: 'te', label: 'Telugu', local: false },
  { code: 'ar', label: 'Arabic', local: false },
]);

const LEVEL_NOTES = Object.freeze({
  eli5:
    'One idea at a time, short sentences, using the source’s own words. Numbers, units and conditions are kept exactly.',
  eli10:
    'The main idea, key details and the “why”, still using the source’s own words with technical terms pointed out.',
  beginner:
    'The main idea, supporting details, definitions found in the text and the causal sentences. Nothing outside the selection is added.',
  intermediate:
    'The original level of detail, broken into sentences for easier reading.',
  advanced:
    'Everything in the selection, with assumptions, limitations, equations and specialist terms flagged.',
  expert:
    'The full selection plus equations, quantities, relationships, assumptions and uncertainty cues. No detail is intentionally dropped.',
});

// Words that are long or look technical but appear in almost every text; not
// worth listing as "difficult".
const COMMON_LONG_WORDS = Object.freeze([
  'additional', 'appropriate', 'approximately', 'available', 'community',
  'comparison', 'complete', 'considered', 'description', 'different',
  'discussion', 'document', 'education', 'example', 'experience', 'following',
  'generally', 'important', 'information', 'instruction', 'interest',
  'knowledge', 'language', 'material', 'opportunity', 'particular',
  'performance', 'population', 'possible', 'practice', 'principle',
  'process', 'question', 'represent', 'requirement', 'research',
  'resources', 'situation', 'sometimes', 'structure', 'student',
  'technology', 'temperature', 'together', 'understanding',
  'however', 'therefore', 'because', 'although', 'despite', 'between',
  'without', 'through', 'against', 'another', 'measurement',
]);

const CAUSAL_PATTERN =
  /\b(because|therefore|so that|as a result|leads to|led to|causes|caused by|due to|results in|resulting in|since)\b/i;

const LIMITATION_PATTERN =
  /\b(assumes?|assuming|assumption|limitations?|caveat|warning|caution|approximately|uncertain|uncertainty|estimate[d]?|only applies|may not|might not|cannot|under certain|except|exception|risk)\b/i;

const CONTRAST_PATTERN =
  /\b(however|but|on the other hand|in contrast|whereas|despite|although|nevertheless|contradic\w*|disagree\w*|instead)\b/i;

const EXAMPLE_PATTERN =
  /\b(for example|for instance|e\.g\.|such as|in practice|consider a|consider an|imagine a|imagine an)\b/i;

const HEDGE_PATTERN =
  /\b(may|might|could|possibly|perhaps|likely|unlikely|suggests?|appears?|seems?|approximately|roughly|about|around|often|usually|generally|typically|some|many|most)\b/i;

const PREREQUISITE_PATTERN =
  /\b(requires?|required|depends? on|presupposes?|assumes?|given|prerequisite|before you|first,? understand|builds? on|foundation|relies on)\b/i;

const DEFINITION_PATTERNS = Object.freeze([
  /^\s*([A-Z][\w-]{2,}(?:\s+[a-z][\w-]*){0,3})\s+(?:is|are)\s+(?:a|an|the|defined|often|usually|generally|essentially)\b/,
  /\b([\w-]{3,})\s+(?:means|refers to|is defined as|are defined as|is called|are called|is known as|are known as|describes)\b/i,
  /\b(?:known|referred)\s+as\s+(?:a|an|the)\s+([\w-]{3,})/i,
  /\b(?:called|named)\s+([\w-]{3,})/i,
]);

const NUMBER_PATTERN = /\d+(?:[.,]\d+)?/g;

const UNIT_PATTERN =
  /(-?\d+(?:[.,]\d+)?)\s*(%|°C|°F|km\/h|m\/s(?:²|2|\^2)?|kg|mg|µg|ug|g|km|cm|mm|nm|m|ms|s|min|h|hr|hours?|days?|years?|L|mL|mol|mmol|M|mM|Hz|kHz|MHz|GHz|V|mV|A|mA|Ω|W|kW|J|kJ|N|Pa|kPa|MPa|K|bytes?|KB|MB|GB|TB|px|bits?|degrees?)\b/gi;

const EQUATION_PATTERN = /(=|≈|≤|≥|→|∝|≠)/;

// Subject signals are weighted so a physics sentence containing one equation
// does not automatically become "mathematics". Scores are heuristic and the
// result reports confidence and signals, never certainty.
const SUBJECT_SIGNALS = Object.freeze({
  research_paper: {
    label: 'Research paper',
    signals: [
      ['abstract', 3], ['methodology', 2], ['participants', 2], ['hypothesis', 2],
      ['literature review', 3], ['p-value', 3], ['statistically significant', 3],
      ['et al', 2], ['doi', 3], ['conclusion', 1], ['results', 1], ['study', 1],
    ],
  },
  programming: {
    label: 'Programming / technical documentation',
    signals: [
      ['function', 1], ['variable', 1], ['array', 1], ['algorithm', 2],
      ['compiler', 2], ['runtime', 2], ['api', 1], ['javascript', 2],
      ['python', 2], ['typescript', 2], ['code', 1], ['loop', 1],
      ['async', 2], ['database', 1], ['server', 1], ['npm', 2],
    ],
    symbols: /```|=>|===|!==|\bconst\b|\blet\b|\bfunction\s*\(|\bclass\s+\w+|\bimport\s+|\breturn\b|;\s*$/m,
  },
  chemistry: {
    label: 'Chemistry',
    signals: [
      ['atom', 1], ['molecule', 2], ['reaction', 1], ['bond', 1], ['mole', 2],
      ['ph', 1], ['oxidation', 2], ['compound', 1], ['catalyst', 2],
      ['acid', 1], ['base', 1], ['electron', 1], ['ion', 1],
    ],
    symbols: /\b[A-Z][a-z]?\d+(?:[A-Z][a-z]?\d*)+\b|\b[A-Z][a-z]?\d*\s*\+\s*[A-Z][a-z]?\d*\s*(?:→|->)/,
  },
  biology: {
    label: 'Biology',
    signals: [
      ['cell', 1], ['dna', 2], ['rna', 2], ['protein', 1], ['enzyme', 2],
      ['photosynthesis', 3], ['organism', 1], ['gene', 1], ['membrane', 1],
      ['mitochondria', 2], ['species', 1], ['chlorophyll', 3], ['evolution', 2],
    ],
  },
  physics: {
    label: 'Physics',
    signals: [
      ['force', 1], ['energy', 1], ['velocity', 2], ['acceleration', 2],
      ['mass', 1], ['quantum', 2], ['circuit', 2], ['voltage', 2],
      ['current', 1], ['resistance', 2], ['thermodynamics', 3],
      ['momentum', 2], ['wavelength', 2], ['frequency', 1], ['gravity', 2],
    ],
  },
  engineering: {
    label: 'Engineering',
    signals: [
      ['design', 1], ['stress', 2], ['strain', 2], ['load', 1], ['material', 1],
      ['structure', 1], ['mechanism', 1], ['tolerance', 2], ['specification', 2],
      ['manufacturing', 2], ['safety factor', 3],
    ],
  },
  mathematics: {
    label: 'Mathematics',
    signals: [
      ['equation', 1], ['theorem', 3], ['lemma', 3], ['integral', 2],
      ['derivative', 2], ['matrix', 2], ['probability', 1], ['proof', 2],
      ['solve', 1], ['function', 1], ['variable', 1],
    ],
    symbols: /[=<>≤≥±√∑∫π∞]|\$[^$]+\$/,
  },
  data_table: {
    label: 'Table / structured data',
    signals: [
      ['table', 1], ['column', 2], ['row', 2], ['dataset', 2],
      ['percentage', 1], ['mean', 1], ['median', 1], ['sample', 1],
    ],
    symbols: /\|.*\|/,
  },
});

export const SUBJECT_STRATEGIES = Object.freeze({
  general: {
    label: 'General text',
    focus: 'main idea, definitions and the author’s own wording',
    preferredActions: ['simplify', 'word', 'example', 'sections', 'check'],
    preserve: ['numbers', 'qualifications', 'source references'],
    visual: 'No subject-specific visual is authored for this text.',
  },
  mathematics: {
    label: 'Mathematics',
    focus: 'definitions, symbols, equations, quantities and the order of a worked solution',
    preferredActions: ['steps', 'word', 'simplify', 'check'],
    preserve: ['equations', 'units', 'numerical values', 'conditions'],
    visual: 'A graph or equation-step visual would be appropriate; this build only opens curated authored visuals.',
  },
  physics: {
    label: 'Physics',
    focus: 'the physical system, quantities and units, the relationship between them and its conditions',
    preferredActions: ['steps', 'simplify', 'word', 'diagram', 'check'],
    preserve: ['equations', 'units', 'numerical values', 'assumptions'],
    visual: 'A free-body diagram or process flow would be appropriate; only curated authored visuals are available.',
  },
  chemistry: {
    label: 'Chemistry',
    focus: 'substances, formulae, reactions, conditions and conservation of mass',
    preferredActions: ['steps', 'word', 'simplify', 'check'],
    preserve: ['formulae', 'equations', 'units', 'reaction conditions'],
    visual: 'A reaction scheme or molecular diagram would be appropriate; only curated authored visuals are available.',
  },
  biology: {
    label: 'Biology',
    focus: 'structures, processes, inputs and outputs, and the level at which they apply',
    preferredActions: ['simplify', 'steps', 'word', 'diagram', 'check'],
    preserve: ['quantities', 'conditions', 'qualifications'],
    visual: 'A process diagram or concept map would be appropriate; only curated authored visuals are available.',
  },
  programming: {
    label: 'Programming / technical documentation',
    focus: 'inputs, outputs, state changes, control flow and the contract of each step',
    preferredActions: ['steps', 'simplify', 'word', 'sections', 'check'],
    preserve: ['code', 'identifiers', 'values', 'edge cases'],
    visual: 'A code trace or flowchart would be appropriate; only curated authored visuals are available.',
  },
  engineering: {
    label: 'Engineering',
    focus: 'design constraints, loads, materials, safety factors and assumptions',
    preferredActions: ['steps', 'simplify', 'word', 'diagram', 'check'],
    preserve: ['units', 'tolerances', 'safety factors', 'conditions'],
    visual: 'A system or free-body diagram would be appropriate; only curated authored visuals are available.',
  },
  research_paper: {
    label: 'Research paper',
    focus: 'research question, method, evidence, results, limitations and what the study cannot establish',
    preferredActions: ['sections', 'simplify', 'word', 'check'],
    preserve: ['sample sizes', 'statistics', 'citations', 'uncertainty', 'limitations'],
    visual: 'A study-flow or evidence table would be appropriate; this build does not generate one.',
  },
  data_table: {
    label: 'Table / structured data',
    focus: 'columns, units, rows, comparisons and the difference between a value and its interpretation',
    preferredActions: ['steps', 'sections', 'word', 'check'],
    preserve: ['values', 'units', 'row and column labels', 'missing values'],
    visual: 'A chart would be appropriate; this build does not generate charts from arbitrary tables.',
  },
});

function countWords(text) {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

function syllableEstimate(word) {
  const groups = word.toLowerCase().match(/[aeiouy]+/g);
  let count = groups ? groups.length : 1;
  if (word.toLowerCase().endsWith('e') && count > 1) count -= 1;
  return Math.max(1, count);
}

function isDifficultWord(token) {
  if (COMMON_LONG_WORDS.includes(token.toLowerCase())) return false;
  if (/^\d/.test(token)) return false;
  // Acronyms such as RAM, CPU, pH (2-5 capitals).
  if (/^[A-Z]{2,5}$/.test(token)) return true;
  if (token.length >= 10) return true;
  if (syllableEstimate(token) >= 3) return true;
  return false;
}

/**
 * Difficult term entries with the offset of their first occurrence.
 * Order of appearance wins; capped for display.
 */
export function findDifficultTermEntries(text) {
  const source = String(text ?? '');
  const seen = new Map();

  const tokenPattern = /[A-Za-z][\w-]*/g;
  let match;
  while ((match = tokenPattern.exec(source)) !== null) {
    const token = match[0];
    if (!isDifficultWord(token)) continue;
    const key = token.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, { word: token, offset: match.index });
    }
    if (seen.size >= MAX_DIFFICULT_WORDS) break;
  }

  return Array.from(seen.values());
}

/**
 * Backwards-compatible public helper: a list of difficult words in order of
 * first appearance. Use `findDifficultTermEntries` when offsets are needed.
 */
export function findDifficultWords(text) {
  return findDifficultTermEntries(text).map((entry) => entry.word);
}

/** Sentences that define one of their terms ("X is …", "… known as X"). */
export function findDefinitionSentences(sentences) {
  const entries = [];
  const seenTerms = new Set();

  sentences.forEach((sentence) => {
    DEFINITION_PATTERNS.forEach((pattern) => {
      const match = sentence.text.match(pattern);
      if (!match) return;
      const term = (match[1] || '').trim().replace(/[.,;:]$/, '');
      if (!term || term.length < 3) return;
      const key = term.toLowerCase();
      if (seenTerms.has(key)) return;
      seenTerms.add(key);
      entries.push({
        term,
        definition: sentence.text,
        start: sentence.start,
        end: sentence.end,
      });
    });
  });

  return entries.slice(0, MAX_GLOSSARY_ENTRIES);
}

/**
 * Every numeric value in the text, with first-occurrence offset. These are
 * preserved in every explanation level — simplification never drops facts.
 */
export function findNumberFacts(text) {
  const source = String(text ?? '');
  const facts = [];
  const seen = new Set();

  let match;
  NUMBER_PATTERN.lastIndex = 0;
  while ((match = NUMBER_PATTERN.exec(source)) !== null) {
    const value = match[0];
    const key = value.replace(',', '.');
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({ value, start: match.index });
  }

  return facts;
}

/** Numeric values that carry an explicit unit. */
export function findQuantities(text) {
  const source = String(text ?? '');
  const quantities = [];
  const seen = new Set();
  let match;
  UNIT_PATTERN.lastIndex = 0;

  while ((match = UNIT_PATTERN.exec(source)) !== null) {
    const value = match[1];
    const unit = match[2];
    const key = `${value.replace(',', '.')}:${unit.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    quantities.push({
      value,
      unit,
      text: match[0].trim(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return quantities.slice(0, MAX_ANALYSIS_ITEMS * 2);
}

function pushSpan(spans, span) {
  if (!span || span.end <= span.start) return;
  if (spans.some((item) => span.start < item.end && span.end > item.start)) return;
  spans.push(span);
}

/** Equations and explicit symbolic relationships, as verbatim spans. */
export function findEquationSpans(text) {
  const source = String(text ?? '');
  const spans = [];

  const patterns = [
    { pattern: /\$[^$\n]{2,200}\$/g, kind: 'latex' },
    { pattern: /\\\[[^\]]{2,300}\\\]/g, kind: 'latex' },
    {
      // A compact expression containing a relation symbol. This is a span
      // detector, not an equation solver.
      pattern: /[^\n.!?]{0,70}(?:=|≈|≤|≥|→|∝|≠)[^\n.!?]{0,90}/g,
      kind: 'relation',
    },
  ];

  patterns.forEach(({ pattern, kind }) => {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const raw = match[0];
      const leading = raw.length - raw.trimStart().length;
      const value = raw.trim();
      if (!value || value.length < 3) continue;
      const start = match.index + leading;
      pushSpan(spans, {
        kind,
        text: value,
        start,
        end: start + value.length,
      });
    }
  });

  return spans
    .sort((left, right) => left.start - right.start)
    .slice(0, MAX_ANALYSIS_ITEMS);
}

/**
 * Simple arithmetic statements of the form `a op b = c`. This is a tiny
 * deterministic check, not a computer-algebra system. Unsupported expressions
 * are reported as unverified rather than guessed.
 */
export function checkSimpleArithmetic(text) {
  const source = String(text ?? '');
  const pattern =
    /(-?\d+(?:\.\d+)?)\s*([+\-*/×÷])\s*(-?\d+(?:\.\d+)?)\s*=\s*(-?\d+(?:\.\d+)?)/g;
  const checks = [];
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const left = Number(match[1]);
    const right = Number(match[3]);
    const expected = Number(match[4]);
    let actual = null;
    switch (match[2]) {
      case '+':
        actual = left + right;
        break;
      case '-':
        actual = left - right;
        break;
      case '*':
      case '×':
        actual = left * right;
        break;
      case '/':
      case '÷':
        actual = right === 0 ? null : left / right;
        break;
      default:
        actual = null;
    }
    checks.push({
      expression: match[0],
      start: match.index,
      ok: actual !== null && Math.abs(actual - expected) < 1e-9,
      actual,
      expected,
    });
    if (checks.length >= 8) break;
  }

  return checks;
}

/** Fenced code blocks and their line spans, kept verbatim. */
export function findCodeBlocks(text) {
  const source = String(text ?? '');
  const blocks = [];
  const pattern = /```([\w-]*)\n([\s\S]*?)```/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const body = match[2] || '';
    const bodyStart = match.index + match[0].indexOf(body);
    blocks.push({
      language: match[1] || '',
      text: body.replace(/\s+$/, ''),
      start: bodyStart,
      end: bodyStart + body.replace(/\s+$/, '').length,
    });
    if (blocks.length >= 4) break;
  }

  return blocks;
}

function scoreSubject(text) {
  const source = String(text ?? '');
  const lower = source.toLowerCase();
  const scores = {};

  Object.entries(SUBJECT_SIGNALS).forEach(([subject, definition]) => {
    let score = 0;
    definition.signals.forEach(([phrase, weight]) => {
      if (lower.includes(phrase)) score += weight;
    });
    if (definition.symbols && definition.symbols.test(source)) score += 2;
    if (subject === 'programming' && definition.symbols?.test(source)) score += 2;
    scores[subject] = score;
  });

  // A markdown pipe table is stronger evidence than the word "table".
  const lines = source.split('\n').filter((line) => line.trim());
  const tabular = lines.filter(
    (line) => (line.match(/\|/g) || []).length >= 2 || line.includes('\t')
  );
  if (tabular.length >= 2) scores.data_table += 4;

  // Several relation symbols in one selection is a mathematics signal, not a
  // reason to relabel a physics passage.
  const relations = (source.match(/[=≈≤≥]/g) || []).length;
  const looksLikeCode = /```|=>|\bconst\b|\blet\b|\bfunction\s*\(|\breturn\b/.test(source);
  if (relations >= 2 && !looksLikeCode) scores.mathematics += 2;

  const ranked = Object.entries(scores).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
  );
  const [topSubject, topScore] = ranked[0] || ['', 0];
  const total = ranked.reduce((sum, [, value]) => sum + value, 0);

  if (!topSubject || topScore <= 0) {
    return {
      id: 'general',
      label: SUBJECT_STRATEGIES.general.label,
      confidence: 0,
      signals: [],
      fallback: true,
    };
  }

  const signals = (SUBJECT_SIGNALS[topSubject]?.signals || [])
    .filter(([phrase]) => lower.includes(phrase))
    .map(([phrase, weight]) => ({ signal: phrase, weight }));

  return {
    id: topSubject,
    label: SUBJECT_SIGNALS[topSubject].label,
    confidence: total > 0 ? Number((topScore / total).toFixed(2)) : 0.5,
    signals,
    fallback: false,
  };
}

/** Detect the likely subject so the explanation strategy can differ. */
export function detectSubject(text) {
  return scoreSubject(text);
}

function filterSentencesByPattern(sentences, pattern) {
  return sentences
    .filter((sentence) => pattern.test(sentence.text))
    .map((sentence) => ({ ...sentence, role: 'limitation' }));
}

function scoreSentences(sentences) {
  const frequency = new Map();
  sentences.forEach((sentence) => {
    tokenize(sentence.text).forEach((term) => {
      frequency.set(term, (frequency.get(term) || 0) + 1);
    });
  });

  return sentences.map((sentence, index) => {
    const terms = tokenize(sentence.text);
    const words = countWords(sentence.text);
    let score = 0;

    if (DEFINITION_PATTERNS.some((pattern) => pattern.test(sentence.text))) {
      score += 2;
    }
    if (CAUSAL_PATTERN.test(sentence.text)) score += 1;
    if (EQUATION_PATTERN.test(sentence.text)) score += 0.5;

    let density = 0;
    terms.forEach((term) => {
      density += frequency.get(term) || 0;
    });
    score += terms.length > 0 ? (density / terms.length) * 2 : 0;
    score += Math.max(0, (3 - index) * 0.3);
    if (words > 32) score -= 1;

    return { sentence, score, words };
  });
}

function shortenSpan(span) {
  return {
    text: span.text,
    start: span.start,
    end: span.end,
  };
}

function verifySpan(span, context) {
  const { sourceId, sourceTexts, selectionStart } = context;
  const verifiable =
    Boolean(sourceId) &&
    Boolean(sourceTexts && typeof sourceTexts[sourceId] === 'string') &&
    Number.isInteger(selectionStart);

  if (!verifiable) {
    return {
      verified: false,
      verifiable: false,
      citation: null,
    };
  }

  const citation = {
    sourceId,
    quote: span.text,
    locator: {
      kind: CITATION_LOCATOR_KINDS.OFFSET,
      start: selectionStart + span.start,
      end: selectionStart + span.end,
    },
  };
  const result = validateCitation(citation, { sourceTexts });

  return {
    verified: result.verified,
    verifiable: true,
    verificationFailed: !result.verified,
    citation: result.verified ? citation : null,
    verificationErrors: result.verified ? [] : result.errors,
  };
}

function withCitations(segments, context) {
  return segments.map((segment) => ({
    ...segment,
    ...verifySpan(segment, context),
  }));
}

function truncateNote(count, cap, what) {
  return count > cap
    ? `The selection contains ${count} ${what}; this view shows the first ${cap}. The full original text stays visible above.`
    : null;
}

function resolveContext({
  sourceId = '',
  sourceTexts = null,
  selectionStart = null,
}) {
  return {
    sourceId: typeof sourceId === 'string' ? sourceId : '',
    sourceTexts:
      sourceTexts && typeof sourceTexts === 'object' ? sourceTexts : null,
    selectionStart:
      Number.isInteger(selectionStart) && selectionStart >= 0
        ? selectionStart
        : null,
  };
}

function normalizeLevel(level) {
  const value =
    typeof level === 'string' ? LEGACY_LEVEL_ALIASES[level] || level : '';
  return EXPLANATION_LEVELS.includes(value) ? value : 'eli10';
}

function normalizeLanguage(language) {
  const code = typeof language === 'string' ? language.trim().toLowerCase() : '';
  return EXPLANATION_LANGUAGES.find((item) => item.code === code) || null;
}

function emptyAnalysis() {
  return {
    subject: {
      id: 'general',
      label: SUBJECT_STRATEGIES.general.label,
      confidence: 0,
      signals: [],
      fallback: true,
    },
    strategy: SUBJECT_STRATEGIES.general,
    mainIdeas: [],
    difficultTerms: [],
    prerequisites: [],
    equations: [],
    quantities: [],
    relationships: [],
    ambiguities: [],
    limitations: [],
    structure: [],
    codeBlocks: [],
    table: { detected: false, rows: 0, columns: 0, header: [], preview: [] },
  };
}

/**
 * Deterministic content analysis used by the engine and exposed to the UI.
 * All entries quote the selection; labels such as “prerequisite cue” are
 * heuristic and are described as such.
 */
export function analyzeText(text) {
  const source = String(text ?? '');
  const sentences = splitTextIntoSentences(source);
  if (!trimmedCheck(source) || sentences.length === 0) {
    return emptyAnalysis();
  }

  const subject = detectSubject(source);
  const strategy = SUBJECT_STRATEGIES[subject.id] || SUBJECT_STRATEGIES.general;
  const scored = scoreSentences(sentences);
  const byScore = [...scored].sort((a, b) => b.score - a.score);
  const difficultTerms = findDifficultTermEntries(source);
  const equations = findEquationSpans(source);
  const quantities = findQuantities(source);
  const codeBlocks = findCodeBlocks(source);
  const definitions = findDefinitionSentences(sentences);

  const prerequisites = sentences
    .filter((sentence) => PREREQUISITE_PATTERN.test(sentence.text))
    .slice(0, MAX_ANALYSIS_ITEMS)
    .map((sentence) => ({
      text: sentence.text,
      start: sentence.start,
      end: sentence.end,
      basis: 'A prerequisite cue appears in this sentence. The curriculum prerequisite itself was not verified.',
    }));

  const relationships = [];
  sentences.forEach((sentence) => {
    if (CAUSAL_PATTERN.test(sentence.text)) {
      relationships.push({
        kind: 'causal',
        text: sentence.text,
        start: sentence.start,
        end: sentence.end,
        basis: 'A causal connective appears in the sentence.',
      });
    } else if (CONTRAST_PATTERN.test(sentence.text)) {
      relationships.push({
        kind: 'contrast',
        text: sentence.text,
        start: sentence.start,
        end: sentence.end,
        basis: 'A contrast connective appears in the sentence.',
      });
    } else if (PREREQUISITE_PATTERN.test(sentence.text)) {
      relationships.push({
        kind: 'dependency',
        text: sentence.text,
        start: sentence.start,
        end: sentence.end,
        basis: 'A dependency cue appears in the sentence.',
      });
    }
  });

  const ambiguities = [];
  const seenAmbiguity = new Set();
  sentences.forEach((sentence) => {
    if (seenAmbiguity.has(sentence.start)) return;
    if (CONTRAST_PATTERN.test(sentence.text)) {
      ambiguities.push({
        text: sentence.text,
        start: sentence.start,
        end: sentence.end,
        reason: 'Contrasting statement: the selection does not resolve which view is correct.',
      });
      seenAmbiguity.add(sentence.start);
    } else if (HEDGE_PATTERN.test(sentence.text)) {
      ambiguities.push({
        text: sentence.text,
        start: sentence.start,
        end: sentence.end,
        reason: 'Hedged or approximate wording: the claim is not stated as certain.',
      });
      seenAmbiguity.add(sentence.start);
    }
  });

  const limitations = [];
  const seenLimitation = new Set();
  sentences.forEach((sentence) => {
    if (seenLimitation.has(sentence.start)) return;
    if (LIMITATION_PATTERN.test(sentence.text) || CONTRAST_PATTERN.test(sentence.text)) {
      limitations.push({
        text: sentence.text,
        start: sentence.start,
        end: sentence.end,
        reason: 'A limitation, condition or contrast appears in the sentence.',
      });
      seenLimitation.add(sentence.start);
    }
  });

  const structure = findStructure(source);
  const table = findTable(source);

  return {
    subject,
    strategy,
    mainIdeas: byScore.slice(0, 3).map(({ sentence, score }) => ({
      text: sentence.text,
      start: sentence.start,
      end: sentence.end,
      score: Number(score.toFixed(2)),
      basis: 'Sentence-selection heuristic (definitions, repeated terms, early position).',
    })),
    difficultTerms,
    prerequisites,
    equations,
    quantities,
    relationships,
    ambiguities,
    limitations,
    structure,
    codeBlocks,
    table,
    definitions,
  };
}

function trimmedCheck(text) {
  return String(text ?? '').trim().length > 0;
}

function findStructure(source) {
  const headings = [];
  const pattern = /^(abstract|introduction|background|related work|methods?|materials and methods|results?|discussion|conclusions?|limitations|references|appendix|summary|objectives?|hypothesis)\s*:?\s*$/i;
  let offset = 0;

  source.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && trimmed.length <= 60 && pattern.test(trimmed)) {
      headings.push({
        title: trimmed.replace(/:$/, ''),
        start: offset + line.indexOf(trimmed),
      });
    }
    offset += line.length + 1;
  });

  return headings;
}

function findTable(source) {
  const lines = source.split('\n');
  const rows = [];
  let start = 0;
  let offset = 0;

  lines.forEach((line) => {
    const trimmed = line.trim();
    const isRow = (trimmed.match(/\|/g) || []).length >= 2 || trimmed.includes('\t');
    if (isRow) {
      if (rows.length === 0) start = offset + line.indexOf(trimmed);
      rows.push(trimmed);
    }
    offset += line.length + 1;
  });

  // A separator row of dashes is not data.
  const dataRows = rows.filter((row) => !/^\|?[\s|:-]+\|?$/.test(row));
  if (dataRows.length < 2) {
    return { detected: false, rows: 0, columns: 0, header: [], preview: [] };
  }

  const split = (row) =>
    row
      .replace(/^\||\|$/g, '')
      .split(/\||\t/)
      .map((cell) => cell.trim());

  const header = split(dataRows[0]);
  return {
    detected: true,
    rows: dataRows.length,
    columns: header.length,
    header,
    preview: dataRows.slice(0, 3).map(split),
    start,
  };
}

function emptyVisualPlan(subject, capabilities = {}) {
  return {
    recommended: capabilities.recommended || 'none',
    available: Boolean(capabilities.available),
    curatedId: capabilities.curatedId || null,
    reason:
      capabilities.reason ||
      SUBJECT_STRATEGIES[subject]?.visual ||
      SUBJECT_STRATEGIES.general.visual,
  };
}

/**
 * The visual representation recommended for a subject.
 *
 * This map is the single definition of "what kind of visual would help here".
 * It was duplicated in `src/ai/visualLearningService.mjs` with different
 * wording for the same nine subjects; the service now reads this one.
 */
export const VISUAL_REPRESENTATIONS = Object.freeze({
  mathematics: 'equation_steps_or_graph',
  physics: 'free_body_or_process_diagram',
  chemistry: 'reaction_scheme',
  biology: 'process_or_concept_map',
  programming: 'code_trace_or_flowchart',
  engineering: 'system_diagram',
  research_paper: 'study_flow_or_evidence_table',
  data_table: 'chart_from_table',
  general: 'none',
});

export function buildVisualPlan(subject, topicSeed) {
  const match = findVisualExplanationForTopic(topicSeed);
  if (match.ok && match.explanation) {
    return {
      recommended: 'curated_process',
      available: true,
      curatedId: match.explanation.id,
      curatedTitle: match.explanation.title,
      reason:
        'A curated authored visual matches this topic. It is not generated from the uploaded source.',
    };
  }

  const recommended = VISUAL_REPRESENTATIONS[subject] || VISUAL_REPRESENTATIONS.general;

  return {
    recommended,
    available: false,
    curatedId: null,
    reason: `A ${String(recommended).replaceAll('_', ' ')} would be appropriate, but this build does not generate arbitrary visuals. The ordered source steps are shown instead.`,
  };
}

function buildFollowUpQuestions(analysis) {
  const terms = analysis.difficultTerms.slice(0, 2).map((item) => item.word);
  const questions = [];

  if (analysis.mainIdeas[0]) {
    questions.push({
      prompt: 'Which sentence states the main idea, and which sentences support it?',
      basis: 'Generated study prompt from the analysed selection.',
    });
  }
  terms.forEach((term) => {
    questions.push({
      prompt: `What does the selection say about “${term}”?`,
      basis: 'Generated study prompt from a term detected in the selection.',
    });
  });
  if (analysis.limitations[0]) {
    questions.push({
      prompt: 'What condition or limitation changes how this claim should be applied?',
      basis: 'Generated study prompt from a limitation cue in the selection.',
    });
  }
  if (analysis.equations[0]) {
    questions.push({
      prompt: 'Which quantities does the equation relate, and in which units?',
      basis: 'Generated study prompt from an equation detected in the selection.',
    });
  }

  return questions.slice(0, 3);
}

function buildLevelSegments({ safeLevel, safeMode, scored, byScore, analysis, causalSentences, exampleSentences, allSentences }) {
  let segments = [];
  let why = [];
  let questions = [];
  let diagram = { matched: false, id: null, title: null };
  let followUp = '';
  let alternative = false;
  const limitations = [];

  const pickMainIdea = (preferShort, offset = 0) => {
    const top = byScore.slice(offset, offset + 4);
    if (top.length === 0) return null;
    if (preferShort) {
      return [...top].sort((a, b) => a.words - b.words)[0].sentence;
    }
    return top[0].sentence;
  };

  if (safeMode === 'another') {
    alternative = true;
    const alternate = pickMainIdea(false, 1) || pickMainIdea(false, 0);
    if (alternate) segments.push({ ...alternate, role: 'main' });
    byScore
      .filter(({ sentence }) => !alternate || sentence.start !== alternate.start)
      .slice(0, safeLevel === 'eli5' ? 2 : 4)
      .map(({ sentence }) => sentence)
      .sort((a, b) => a.start - b.start)
      .forEach((sentence) => segments.push({ ...sentence, role: 'support' }));
    why = causalSentences.slice(0, 2).map(shortenSpan);
    followUp =
      'This is a different route through the same source sentences. Check it against the original; no new content was added.';
  } else if (safeLevel === 'eli5') {
    const main = pickMainIdea(true);
    if (main) segments.push({ ...main, role: 'main' });
    const supports = byScore
      .filter(({ sentence }) => !main || sentence.start !== main.start)
      .filter(({ words }) => words <= 28)
      .sort((a, b) => a.words - b.words)
      .slice(0, 2)
      .map(({ sentence }) => sentence)
      .sort((a, b) => a.start - b.start);
    supports.forEach((sentence) => segments.push({ ...sentence, role: 'support' }));
    followUp = 'Read the main idea, then check it against the original below.';
  } else if (safeLevel === 'eli10') {
    const main = pickMainIdea(false);
    if (main) segments.push({ ...main, role: 'main' });
    byScore
      .filter(({ sentence }) => !main || sentence.start !== main.start)
      .slice(0, 5)
      .map(({ sentence }) => sentence)
      .sort((a, b) => a.start - b.start)
      .forEach((sentence) => segments.push({ ...sentence, role: 'support' }));
    why = causalSentences.slice(0, 3).map(shortenSpan);
    followUp = 'Now explain it back in your own words, then check the original.';
  } else if (safeLevel === 'beginner') {
    const main = pickMainIdea(false);
    if (main) segments.push({ ...main, role: 'main' });
    byScore
      .filter(({ sentence }) => !main || sentence.start !== main.start)
      .slice(0, 6)
      .map(({ sentence }) => sentence)
      .sort((a, b) => a.start - b.start)
      .forEach((sentence) => segments.push({ ...sentence, role: 'support' }));
    why = causalSentences.slice(0, 3).map(shortenSpan);
    followUp =
      'Use the glossary and the source sentences to explain the idea without adding outside facts.';
  } else if (safeLevel === 'advanced') {
    segments = allSentences.slice(0, 14).map((sentence) => ({
      ...sentence,
      role: LIMITATION_PATTERN.test(sentence.text) ? 'limitation' : 'detail',
    }));
    const note = truncateNote(allSentences.length, 14, 'sentences');
    if (note) limitations.push(note);
    why = causalSentences.slice(0, 4).map(shortenSpan);
    followUp = 'Check the assumptions and limitations before applying this.';
  } else if (safeLevel === 'expert') {
    segments = allSentences.slice(0, 20).map((sentence) => ({
      ...sentence,
      role: LIMITATION_PATTERN.test(sentence.text) ? 'limitation' : 'detail',
    }));
    const note = truncateNote(allSentences.length, 20, 'sentences');
    if (note) limitations.push(note);
    why = causalSentences.slice(0, 5).map(shortenSpan);
    followUp =
      'Check equations, units, assumptions and uncertainty cues before using this in an argument.';
  } else {
    // intermediate (the legacy `normal` alias resolves here)
    segments = allSentences.slice(0, 12).map((sentence) => ({
      ...sentence,
      role: 'detail',
    }));
    const note = truncateNote(allSentences.length, 12, 'sentences');
    if (note) limitations.push(note);
    why = causalSentences.slice(0, 3).map(shortenSpan);
    followUp = 'Compare this with the original text below — nothing was added.';
  }

  if (analysis.subject.id === 'mathematics' || analysis.subject.id === 'physics') {
    const equationSentence = scored.find(({ sentence }) => EQUATION_PATTERN.test(sentence.text));
    if (
      equationSentence &&
      !segments.some((segment) => segment.start === equationSentence.sentence.start) &&
      ['advanced', 'expert', 'beginner', 'intermediate'].includes(safeLevel)
    ) {
      segments.push({
        ...equationSentence.sentence,
        role: 'equation',
      });
      limitations.push(
        'An equation-bearing sentence was added so the symbolic relationship stays visible. It is still a verbatim source sentence.'
      );
    }
  }

  return { segments, why, questions, diagram, followUp, alternative, limitations };
}

function explanationFailure(errors, extra = {}) {
  return {
    ok: false,
    errors,
    level: extra.level || 'eli10',
    mode: extra.mode || 'simplify',
    levelNote: '',
    grounding: 'selection',
    segments: [],
    why: [],
    glossary: [],
    facts: [],
    factCount: 0,
    difficultWords: [],
    limitations: [],
    questions: [],
    diagram: { matched: false, id: null, title: null },
    followUp: '',
    subject: emptyAnalysis().subject,
    strategy: SUBJECT_STRATEGIES.general,
    analysis: emptyAnalysis(),
    equations: [],
    quantities: [],
    verification: { ok: false, checks: [], errors, warnings: [] },
    language: { requested: 'en', resolved: 'en', supported: true, note: '' },
    visualPlan: emptyVisualPlan('general'),
    followUpQuestions: [],
    evidenceKinds: { source: [], generated: [], unavailable: [] },
    confidence: 0,
    ...extra,
  };
}

/**
 * Validates that an explanation did not silently lose numbers, equations,
 * quantities or quotations from the selection.
 */
export function validateExplanationResult({ text, result }) {
  const source = String(text ?? '');
  const checks = [];
  const errors = [];
  const warnings = [];

  const expectedNumbers = new Set(
    findNumberFacts(source).map((fact) => fact.value.replace(',', '.'))
  );
  const shownNumbers = new Set(
    (result?.facts || []).map((fact) => fact.value.replace(',', '.'))
  );
  const missingNumbers = [...expectedNumbers].filter((value) => !shownNumbers.has(value));
  checks.push({
    id: 'numbers_preserved',
    ok: missingNumbers.length === 0,
    detail:
      missingNumbers.length === 0
        ? 'Every numeric value in the selection is listed.'
        : `Missing numeric values: ${missingNumbers.join(', ')}`,
  });
  if (missingNumbers.length > 0) errors.push(checks[checks.length - 1].detail);

  const expectedEquations = (result?.analysis?.equations || []).map((item) => item.text);
  const shownEquations = new Set((result?.equations || []).map((item) => item.text));
  const missingEquations = expectedEquations.filter((value) => !shownEquations.has(value));
  checks.push({
    id: 'equations_preserved',
    ok: missingEquations.length === 0,
    detail:
      missingEquations.length === 0
        ? 'Every detected equation span is returned with the explanation.'
        : `Equation spans missing from the result: ${missingEquations.join(' | ')}`,
  });
  if (missingEquations.length > 0) errors.push(checks[checks.length - 1].detail);

  const expectedQuantities = (result?.analysis?.quantities || []).map((item) => item.text);
  const shownQuantities = new Set((result?.quantities || []).map((item) => item.text));
  const missingQuantities = expectedQuantities.filter((value) => !shownQuantities.has(value));
  checks.push({
    id: 'quantities_preserved',
    ok: missingQuantities.length === 0,
    detail:
      missingQuantities.length === 0
        ? 'Every quantity with a unit is returned with the explanation.'
        : `Quantity values missing from the result: ${missingQuantities.join(', ')}`,
  });
  if (missingQuantities.length > 0) errors.push(checks[checks.length - 1].detail);

  const segments = [
    ...(result?.segments || []),
    ...(result?.why || []),
  ];
  const badSpans = segments.filter((segment) => {
    if (!Number.isInteger(segment.start) || !Number.isInteger(segment.end)) return true;
    return source.slice(segment.start, segment.end) !== segment.text;
  });
  checks.push({
    id: 'verbatim_spans',
    ok: badSpans.length === 0,
    detail:
      badSpans.length === 0
        ? 'Every explanation sentence is an exact verbatim span of the selection.'
        : `${badSpans.length} explanation span(s) did not match the selection text.`,
  });
  if (badSpans.length > 0) {
    errors.push('An explanation span did not match the selection. It was not treated as verified.');
  }

  const arithmetic = checkSimpleArithmetic(source);
  if (arithmetic.length > 0) {
    const wrong = arithmetic.filter((item) => !item.ok);
    checks.push({
      id: 'simple_arithmetic',
      ok: wrong.length === 0,
      detail:
        wrong.length === 0
          ? `${arithmetic.length} simple arithmetic statement(s) checked.`
          : `Arithmetic does not match: ${wrong
              .map((item) => item.expression)
              .join(' | ')}`,
    });
    if (wrong.length > 0) {
      errors.push(
        'A simple arithmetic statement in the selection does not evaluate as written. It was flagged instead of being repeated as fact.'
      );
    }
  }

  if (
    ['advanced', 'expert'].includes(result?.level) &&
    (result?.analysis?.limitations || []).length > 0
  ) {
    const hasLimitationSegment = (result?.segments || []).some(
      (segment) => segment.role === 'limitation'
    );
    checks.push({
      id: 'limitations_visible',
      ok: hasLimitationSegment || result.limitations.length > 0,
      detail: hasLimitationSegment || result.limitations.length > 0
        ? 'Limitations are surfaced at this level.'
        : 'The selection contains a limitation but the explanation does not surface it.',
    });
    if (!hasLimitationSegment && result.limitations.length === 0) {
      warnings.push(checks[checks.length - 1].detail);
    }
  }

  return {
    ok: errors.length === 0,
    checks,
    errors,
    warnings,
  };
}

/**
 * Explains a selection at the requested level.
 *
 * @param {object} input
 * @param {string} input.text           The selected text (verbatim).
 * @param {string} [input.level]        eli5 | eli10 | beginner | intermediate | advanced | expert
 * @param {string} [input.mode]         simplify | word | example | steps | sections | diagram | check | another
 * @param {string} [input.word]         Target word for mode 'word'.
 * @param {string} [input.language]     Requested explanation language. Only `en` is local.
 * @param {string} [input.sourceId]     Source the selection came from, if any.
 * @param {object|null} [input.sourceTexts] Map of sourceId -> full text, for citation verification.
 * @param {number|null} [input.selectionStart] Offset of the selection inside the source text, if known.
 */
export function explainSelection({
  text,
  level = 'eli10',
  mode = 'simplify',
  word = '',
  language = 'en',
  sourceId = '',
  sourceTexts = null,
  selectionStart = null,
} = {}) {
  const safeText = String(text ?? '');
  const trimmed = safeText.trim();

  if (!trimmed) {
    return explanationFailure(['Select some text to explain first.']);
  }
  if (safeText.length > MAX_EXPLANATION_CHARS) {
    return explanationFailure([
      `The selection is ${safeText.length} characters; the limit is ${MAX_EXPLANATION_CHARS}. Select a smaller passage — nothing was changed or lost.`,
    ]);
  }

  const safeLevel = normalizeLevel(level);
  const safeMode = EXPLANATION_ACTIONS.includes(mode) ? mode : 'simplify';
  const context = resolveContext({ sourceId, sourceTexts, selectionStart });

  const allSentences = splitTextIntoSentences(safeText);
  if (allSentences.length === 0) {
    // A short but multi-word selection (for example a fragment without final
    // punctuation) is still explainable. A single word is not.
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    if (wordCount < 2) {
      return explanationFailure(
        [
          'The selected text is too short to break into sentences. Nothing was changed.',
        ],
        { level: safeLevel, mode: safeMode }
      );
    }
    const start = safeText.indexOf(trimmed);
    allSentences.push({
      text: trimmed,
      start: start >= 0 ? start : 0,
      end: (start >= 0 ? start : 0) + trimmed.length,
    });
  }

  const analysis = analyzeText(safeText);
  const facts = findNumberFacts(safeText);
  const difficultTermEntries = findDifficultTermEntries(safeText);
  const difficultWords = difficultTermEntries.map((entry) => entry.word);
  const definitionSentences = findDefinitionSentences(allSentences);
  const causalSentences = allSentences.filter((sentence) =>
    CAUSAL_PATTERN.test(sentence.text)
  );
  const limitationSentences = allSentences.filter((sentence) =>
    LIMITATION_PATTERN.test(sentence.text)
  );
  const contrastFound = allSentences.some((sentence) =>
    CONTRAST_PATTERN.test(sentence.text)
  );
  const exampleSentences = allSentences.filter((sentence) =>
    EXAMPLE_PATTERN.test(sentence.text)
  );

  const limitations = [];
  if (contrastFound) {
    limitations.push(
      'The selection contains contrasting statements. Both views are kept below — the source itself is unclear here, so nothing is resolved for you.'
    );
  }
  if (difficultWords.length > 0) {
    limitations.push(
      `Specialist or unusual terms appear in this selection (${difficultWords
        .slice(0, 4)
        .join(', ')}${difficultWords.length > 4 ? '…' : ''}). Use “Explain a word” for the exact sentences that use them.`
    );
  }

  const requestedLanguage = normalizeLanguage(language);
  const languageSupport = requestedLanguage
    ? {
        requested: requestedLanguage.code,
        resolved: 'en',
        supported: requestedLanguage.local,
        note: requestedLanguage.local
          ? ''
          : `The local engine explains in English only. No translation into ${requestedLanguage.label} was performed, and none is claimed.`,
      }
    : {
        requested: 'en',
        resolved: 'en',
        supported: true,
        note: 'Unsupported language code; the local engine used English.',
      };
  if (!languageSupport.supported) limitations.push(languageSupport.note);

  const scored = scoreSentences(allSentences);
  const byScore = [...scored].sort((a, b) => b.score - a.score);
  const glossary = definitionSentences.slice(
    0,
    safeLevel === 'eli5' ? 3 : safeLevel === 'eli10' ? 4 : MAX_GLOSSARY_ENTRIES
  );

  let segments = [];
  let why = [];
  let questions = [];
  let diagram = { matched: false, id: null, title: null };
  let followUp = '';
  let alternative = false;

  if (safeMode === 'word') {
    const target = String(word ?? '').trim();
    if (!target) {
      return explanationFailure(['Type the word you want explained.'], {
        level: safeLevel,
        mode: safeMode,
      });
    }
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordPattern = new RegExp(`\\b${escaped}\\b`, 'i');
    if (!wordPattern.test(safeText)) {
      return explanationFailure(
        [
          `The word “${target}” does not appear in the selected text. Nothing was invented.`,
        ],
        { level: safeLevel, mode: safeMode }
      );
    }
    const matches = allSentences
      .filter((sentence) => wordPattern.test(sentence.text))
      .slice(0, 4)
      .map((sentence) => ({ ...sentence, role: 'word-usage' }));
    segments = matches;

    const defined = definitionSentences.find(
      (entry) => entry.term.toLowerCase() === target.toLowerCase()
    );
    if (!defined) {
      limitations.push(
        `The selection never defines “${target}”. Above are the exact sentences that use it — no dictionary is connected to this build, so no definition is invented.`
      );
    }
    followUp = defined
      ? `Check the definition of “${target}” against the sentences that use it.`
      : `Look up “${target}” outside this source, then check both usages against the sentences above.`;
  } else if (safeMode === 'example') {
    if (exampleSentences.length === 0) {
      limitations.push(
        'The selection contains no example (“for example”, “such as”, …). This build does not invent examples, so none is shown.'
      );
      followUp =
        'If you need an example, ask your teacher or check another source — this build will not make one up.';
    } else {
      segments = exampleSentences
        .slice(0, 3)
        .map((sentence) => ({ ...sentence, role: 'example' }));
      followUp = 'Compare the example with the main idea — does it fit?';
    }
  } else if (safeMode === 'steps') {
    const stepCap = 8;
    const codeLines = analysis.codeBlocks.length > 0
      ? analysis.codeBlocks[0].text.split('\n').filter((line) => line.trim()).slice(0, stepCap)
      : [];
    if (codeLines.length > 0) {
      let cursor = analysis.codeBlocks[0].start;
      segments = codeLines.map((line, index) => {
        const start = safeText.indexOf(line, cursor);
        const safeStart = start >= 0 ? start : cursor;
        cursor = safeStart + line.length + 1;
        return {
          text: line.trim(),
          start: safeStart + line.indexOf(line.trim()),
          end: safeStart + line.indexOf(line.trim()) + line.trim().length,
          role: 'step',
          stepNumber: index + 1,
        };
      });
      limitations.push(
        'These steps are exact lines from the code block, not an executed trace. The app cannot run this code.'
      );
      followUp = 'Follow the lines in order; execution behaviour is not simulated.';
    } else {
      segments = allSentences
        .slice(0, stepCap)
        .map((sentence, index) => ({
          ...sentence,
          role: 'step',
          stepNumber: index + 1,
        }));
      const note = truncateNote(allSentences.length, stepCap, 'sentences');
      if (note) limitations.push(note);
      followUp = 'Follow the steps in order; each one is a verbatim source sentence.';
    }
  } else if (safeMode === 'sections') {
    const headings = analysis.structure;
    if (headings.length >= 2) {
      segments = allSentences.slice(0, 16).map((sentence) => {
        const section = [...headings]
          .reverse()
          .find((heading) => heading.start <= sentence.start);
        return {
          ...sentence,
          role: 'detail',
          sectionTitle: section?.title || 'Opening',
        };
      });
      limitations.push(
        'Sections are inferred from heading-like lines. The source may use a different structure.'
      );
    } else {
      const groups = Math.ceil(allSentences.length / 3);
      segments = allSentences.slice(0, 15).map((sentence, index) => ({
        ...sentence,
        role: 'detail',
        sectionTitle: `Part ${Math.floor(index / 3) + 1} of ${groups}`,
      }));
      limitations.push(
        'No headings were detected, so the selection is grouped into small parts in source order. The grouping is not an author-supplied outline.'
      );
    }
    followUp = 'Read one part at a time, then connect it to the part before it.';
  } else if (safeMode === 'diagram') {
    const topicSeed = safeText.slice(0, 300);
    const match = findVisualExplanationForTopic(topicSeed);
    if (match.ok && match.explanation) {
      diagram = {
        matched: true,
        id: match.explanation.id,
        title: match.explanation.title,
      };
      followUp = 'The visual is an authored explanation, not generated from this source.';
    } else {
      limitations.push(
        'No curated visual matches this text. This build does not generate visuals on the fly — the ordered steps below are the closest honest diagram.'
      );
      segments = allSentences.slice(0, 8).map((sentence, index) => ({
        ...sentence,
        role: 'step',
        stepNumber: index + 1,
      }));
      followUp = 'Read the steps as a flow: each one follows from the previous.';
    }
  } else if (safeMode === 'check') {
    const tooSimple =
      allSentences.length === 1 && allSentences[0].text.length < 30;
    const targets = tooSimple ? [] : byScore.slice(0, 3);
    questions = targets
      .map(({ sentence }, index) => {
        const numberMatch = sentence.text.match(NUMBER_PATTERN);
        const difficultInSentence = findDifficultTermEntries(sentence.text);
        const blankTarget =
          (numberMatch && numberMatch[0]) ||
          (difficultInSentence[0] && difficultInSentence[0].word) ||
          (tokenize(sentence.text).sort((a, b) => b.length - a.length)[0] ??
            null);
        if (!blankTarget) return null;

        const position = sentence.text
          .toLowerCase()
          .indexOf(String(blankTarget).toLowerCase());
        if (position < 0) return null;

        return {
          id: `check-${index}`,
          prompt: (
            sentence.text.slice(0, position) +
            '_____' +
            sentence.text.slice(position + String(blankTarget).length)
          ).replace(/\s{2,}/g, ' '),
          answer: blankTarget,
          sentence: shortenSpan(sentence),
        };
      })
      .filter(Boolean);
    if (questions.length === 0) {
      limitations.push(
        tooSimple
          ? 'The selection is too simple to build a fill-in question from. Nothing is invented.'
          : 'No fill-in question could be built from this selection. Nothing is invented.'
      );
    }
    followUp = 'Answer from memory first, then verify against the original sentence.';
  } else {
    const built = buildLevelSegments({
      safeLevel,
      safeMode,
      scored,
      byScore,
      analysis,
      causalSentences,
      exampleSentences,
      allSentences,
    });
    segments = built.segments;
    why = built.why;
    questions = built.questions;
    diagram = built.diagram;
    followUp = built.followUp;
    alternative = built.alternative;
    built.limitations.forEach((note) => limitations.push(note));
  }

  const equations = analysis.equations;
  const quantities = analysis.quantities;
  const visualPlan = buildVisualPlan(analysis.subject.id, safeText.slice(0, 300));

  if (equations.length > 0) {
    limitations.push(
      `${equations.length} equation-like span${equations.length === 1 ? '' : 's'} detected. They are kept verbatim; this build does not solve or validate the mathematics.`
    );
  }
  if (quantities.length > 0) {
    limitations.push(
      `${quantities.length} quantity value${quantities.length === 1 ? '' : 's'} with units detected. Units are copied, not independently checked.`
    );
  }
  if (analysis.table.detected) {
    limitations.push(
      `A table-like structure was detected (${analysis.table.rows} rows × ${analysis.table.columns} columns). Cell meaning is not inferred.`
    );
  }
  if (analysis.subject.fallback) {
    limitations.push(
      'The subject could not be identified confidently, so the general explanation strategy was used.'
    );
  }

  const grounded = Boolean(context.sourceId) && context.selectionStart !== null;
  const result = {
    ok: true,
    errors: [],
    level: safeLevel,
    mode: safeMode,
    levelNote: LEVEL_NOTES[safeLevel],
    grounding: grounded ? 'source' : 'selection',
    segments: withCitations(segments, context),
    why: withCitations(why, context),
    glossary,
    facts,
    factCount: facts.length,
    difficultWords,
    difficultTerms: difficultTermEntries,
    limitations,
    questions,
    diagram,
    followUp,
    subject: analysis.subject,
    strategy: analysis.strategy,
    analysis,
    equations,
    quantities,
    verification: { ok: true, checks: [], errors: [], warnings: [] },
    language: languageSupport,
    visualPlan,
    followUpQuestions: buildFollowUpQuestions(analysis),
    evidenceKinds: {
      source: [
        'verbatim source sentences',
        ...(equations.length > 0 ? ['detected equation spans'] : []),
        ...(quantities.length > 0 ? ['quantity values with units'] : []),
      ],
      generated: [
        'level selection and ordering',
        'study prompts',
        'heuristic subject label',
        'heuristic prerequisite cues',
      ],
      unavailable: [
        ...(languageSupport.supported ? [] : ['translation']),
        ...(visualPlan.available ? [] : ['generated visual']),
        'generated analogy or example when the source has none',
      ],
    },
    confidence: analysis.subject.confidence,
    alternative,
  };

  result.verification = validateExplanationResult({ text: safeText, result });
  if (!result.verification.ok) {
    result.verification.errors.forEach((error) => {
      if (!result.limitations.includes(error)) result.limitations.push(error);
    });
    result.limitations.push(
      'The explanation failed its own preservation check. Treat the quoted source text as authoritative and re-read the original selection.'
    );
  }
  result.verification.warnings.forEach((warning) => {
    if (!result.limitations.includes(warning)) result.limitations.push(warning);
  });

  return result;
}

/** Deterministic check of a fill-in answer against the engine's question. */
export function checkExplanationAnswer(question, answer) {
  if (!question || typeof question.answer !== 'string') {
    return { correct: false, reason: 'invalid-question' };
  }
  const normalize = (value) =>
    String(value ?? '')
      .toLowerCase()
      .trim()
      .replace(/[.,;:!?"'']+$/g, '')
      .replace(/\s+/g, ' ');

  const expected = normalize(question.answer);
  const given = normalize(answer);
  if (!given) return { correct: false, reason: 'empty' };
  return { correct: given === expected, reason: given === expected ? 'match' : 'mismatch' };
}

/**
 * Evaluates a learner's own-words explanation using deterministic term
 * coverage. This is evidence about the response text, not a measurement of
 * understanding or mastery. It never calls a model to judge the learner.
 */
export function evaluateOwnWordsExplanation({ text, response, level = 'eli10' } = {}) {
  const source = String(text ?? '').trim();
  const answer = String(response ?? '').trim();
  if (!source || !answer) {
    return {
      ok: false,
      errors: ['Write an explanation in your own words first.'],
      understanding: 'insufficient_evidence',
      coverage: 0,
      matchedTerms: [],
      missingTerms: [],
      copiedFromSource: false,
      feedback: 'No response was provided, so no evidence about understanding was recorded.',
      nextStrategy: 'write_response',
      limitations: [],
    };
  }

  const analysis = analyzeText(source);
  const keyTerms = Array.from(
    new Set([
      ...analysis.difficultTerms.map((item) => item.word.toLowerCase()),
      ...tokenize(analysis.mainIdeas[0]?.text || source)
        .filter((term) => term.length >= 5)
        .slice(0, 4),
    ])
  ).slice(0, 8);

  const responseTerms = new Set(tokenize(answer));
  const matchedTerms = keyTerms.filter((term) => responseTerms.has(term));
  const missingTerms = keyTerms.filter((term) => !responseTerms.has(term));
  const coverage = keyTerms.length > 0 ? matchedTerms.length / keyTerms.length : 0;
  const sourceSentences = splitTextIntoSentences(source);
  const copiedFromSource = sourceSentences.some(
    (sentence) =>
      sentence.text.length >= 45 &&
      answer.toLowerCase().includes(sentence.text.toLowerCase())
  );

  let understanding = 'insufficient_evidence';
  if (coverage >= 0.6 && !copiedFromSource) understanding = 'some_evidence';
  else if (coverage >= 0.25) understanding = 'partial_evidence';

  let nextStrategy = 're_read_source';
  let feedback = '';
  if (copiedFromSource) {
    feedback =
      'Your response repeats a source sentence word for word. Try explaining the idea without copying, so the app has evidence about your own understanding.';
    nextStrategy = 'paraphrase_without_copying';
  } else if (understanding === 'some_evidence') {
    feedback =
      'Your response uses several key terms from the selection. This is limited evidence about your explanation, not proof of mastery. Check the exact source wording next.';
    nextStrategy = 'compare_with_source';
  } else if (understanding === 'partial_evidence') {
    feedback = `Your response uses some key terms but misses ${missingTerms
      .slice(0, 3)
      .join(', ')}. Try the step-by-step source order rather than repeating the same summary.`;
    nextStrategy = 'source_steps';
  } else {
    feedback =
      'The response shares few key terms with the selection. Re-read one verified source sentence, then explain that sentence before trying the whole passage.';
    nextStrategy = 'single_sentence';
  }

  return {
    ok: true,
    errors: [],
    understanding,
    coverage: Number(coverage.toFixed(2)),
    matchedTerms,
    missingTerms,
    copiedFromSource,
    feedback,
    nextStrategy,
    level: normalizeLevel(level),
    limitations: [
      'Term coverage is a deterministic heuristic. It does not establish comprehension, mastery or retention.',
      'A model was not used to judge this response.',
    ],
  };
}
