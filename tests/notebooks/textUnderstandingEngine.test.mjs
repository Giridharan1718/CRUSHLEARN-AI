import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPLANATION_LEVELS,
  LEGACY_LEVEL_ALIASES,
  analyzeText,
  checkSimpleArithmetic,
  detectSubject,
  evaluateOwnWordsExplanation,
  explainSelection,
  findDifficultWords,
  findEquationSpans,
  findQuantities,
  validateExplanationResult,
} from '../../src/notebooks/textExplanation.mjs';

const BIOLOGY = [
  'Photosynthesis is the process by which plants convert sunlight into chemical energy.',
  'Chlorophyll absorbs light inside chloroplasts in plant cells.',
  'The light reactions occur in the thylakoid membrane, and the Calvin cycle occurs in the stroma.',
  'For example, a maple leaf produces roughly 5 grams of glucose per day.',
  'This process only applies to cells that contain chlorophyll.',
].join(' ');

test('subject detection distinguishes representative content types', () => {
  assert.equal(
    detectSubject(
      'Abstract. This study used a randomised sample of 120 participants. Methods and results are reported, with a p-value of 0.03 and limitations.'
    ).id,
    'research_paper'
  );
  assert.equal(
    detectSubject(
      '```js\nconst total = items.reduce((sum, item) => sum + item, 0);\nreturn total;\n```\nThe function returns the array total.'
    ).id,
    'programming'
  );
  assert.equal(
    detectSubject(
      'The reaction between 2H2 + O2 → 2H2O is exothermic. Each molecule forms chemical bonds.'
    ).id,
    'chemistry'
  );
  assert.equal(
    detectSubject(
      'A net force produces an acceleration. The 5 kg mass accelerates at 2 m/s2 and the voltage is 9 V.'
    ).id,
    'physics'
  );
  assert.equal(
    detectSubject(
      'Theorem: the integral of a derivative equals the original function. The proof uses a matrix.'
    ).id,
    'mathematics'
  );
  assert.equal(
    detectSubject(
      '| Sample | Mean |\n| --- | --- |\n| A | 12 |\n| B | 15 |'
    ).id,
    'data_table'
  );
  assert.equal(detectSubject('The weather was pleasant.').id, 'general');
});

test('all six levels are exported and normal remains a legacy alias', () => {
  assert.deepEqual([...EXPLANATION_LEVELS], [
    'eli5',
    'eli10',
    'beginner',
    'intermediate',
    'advanced',
    'expert',
  ]);
  assert.equal(LEGACY_LEVEL_ALIASES.normal, 'intermediate');
  const normal = explainSelection({ text: BIOLOGY, level: 'normal' });
  assert.equal(normal.ok, true);
  assert.equal(normal.level, 'intermediate');
});

test('content analysis keeps source spans and identifies uncertainty honestly', () => {
  const analysis = analyzeText(
    [
      'A catalyst is a substance that speeds up a reaction.',
      'The result depends on the temperature, which requires a stable environment.',
      'The measurement is approximately 5 grams, and the yield may be lower.',
      'However, another study reports a different value.',
      'The reaction is: 2H2 + O2 → 2H2O at 25 °C.',
    ].join(' ')
  );

  assert.equal(analysis.subject.id, 'chemistry');
  assert.ok(analysis.mainIdeas.length > 0);
  analysis.mainIdeas.forEach((idea) => {
    assert.equal(typeof idea.text, 'string');
    assert.ok(idea.end > idea.start);
  });
  assert.ok(analysis.prerequisites.length > 0, 'dependency cue is surfaced');
  assert.ok(analysis.equations.length > 0, 'reaction equation is detected');
  assert.ok(analysis.quantities.some((item) => item.unit === '°C'));
  assert.ok(analysis.ambiguities.length > 0, 'hedged wording is flagged');
  assert.ok(analysis.limitations.length > 0, 'contrast is flagged');
  assert.ok(
    analysis.relationships.some((item) => item.kind === 'causal' || item.kind === 'dependency')
  );
  analysis.prerequisites.forEach((item) => {
    assert.match(item.basis, /not verified/i);
  });
});

test('equations and quantities are exact substrings with offsets', () => {
  const text = 'The relation is F = m a. A 5 kg mass accelerates at 2 m/s2 and needs 10 N.';
  const equations = findEquationSpans(text);
  const quantities = findQuantities(text);

  assert.ok(equations.length > 0);
  equations.forEach((item) => {
    assert.equal(text.slice(item.start, item.end), item.text);
  });
  assert.ok(quantities.some((item) => item.text.includes('5 kg')));
  assert.ok(quantities.some((item) => item.unit === 'N'));
  quantities.forEach((item) => {
    assert.equal(text.slice(item.start, item.end), item.text);
  });
});

test('every level preserves numbers and reports preservation checks', () => {
  EXPLANATION_LEVELS.forEach((level) => {
    const result = explainSelection({ text: BIOLOGY, level });
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.facts.map((fact) => fact.value),
      ['5'],
      `level ${level} dropped or duplicated a numeric fact`
    );
    assert.equal(result.verification.checks.find((item) => item.id === 'numbers_preserved').ok, true);
    assert.equal(result.verification.checks.find((item) => item.id === 'verbatim_spans').ok, true);
  });
});

test('advanced and expert surface the source limitation instead of hiding it', () => {
  ['advanced', 'expert'].forEach((level) => {
    const result = explainSelection({ text: BIOLOGY, level });
    assert.ok(
      result.segments.some(
        (segment) =>
          segment.role === 'limitation' &&
          /only applies to cells/i.test(segment.text)
      ),
      `${level} must surface the qualification`
    );
    assert.equal(
      result.verification.checks.find((item) => item.id === 'limitations_visible').ok,
      true
    );
  });
});

test('simple arithmetic is checked deterministically and a mismatch is flagged', () => {
  assert.deepEqual(
    checkSimpleArithmetic('2 + 2 = 4 and 3 * 4 = 12').map((item) => item.ok),
    [true, true]
  );
  const wrong = checkSimpleArithmetic('2 + 2 = 5');
  assert.equal(wrong[0].ok, false);

  const result = explainSelection({
    text: 'The total is 2 + 2 = 5 according to the note. The mass is 5 kg.',
    level: 'advanced',
  });
  assert.equal(result.verification.ok, false);
  assert.ok(
    result.limitations.some((note) => /does not evaluate as written/i.test(note))
  );
  assert.equal(
    result.verification.checks.find((item) => item.id === 'simple_arithmetic').ok,
    false
  );
});

test('a subject-specific strategy changes the analysis and visual recommendation', () => {
  const math = explainSelection({
    text: 'Theorem: the integral of a derivative equals the original function. The relation is F = m a.',
    level: 'intermediate',
  });
  assert.equal(math.subject.id, 'mathematics');
  assert.match(math.strategy.focus, /equation/i);
  assert.equal(math.visualPlan.available, false);
  assert.match(math.visualPlan.reason, /does not generate arbitrary visuals/i);

  const curated = explainSelection({
    text: 'An electric circuit connects a battery, wires and a light bulb. Current flows from the battery through the wire and back to the battery.',
    mode: 'diagram',
  });
  assert.equal(curated.diagram.matched, true);
  assert.equal(curated.diagram.id, 'electricity-circuit');
});

test('non-English language requests disclose that no translation happened', () => {
  const result = explainSelection({ text: BIOLOGY, level: 'eli5', language: 'hi' });
  assert.equal(result.ok, true);
  assert.equal(result.language.requested, 'hi');
  assert.equal(result.language.resolved, 'en');
  assert.equal(result.language.supported, false);
  assert.match(result.language.note, /No translation/i);
  assert.ok(result.limitations.includes(result.language.note));
  assert.ok(result.evidenceKinds.unavailable.includes('translation'));
});

test('another explanation is a different source route, not new content', () => {
  const first = explainSelection({ text: BIOLOGY, level: 'eli10' });
  const second = explainSelection({ text: BIOLOGY, level: 'eli10', mode: 'another' });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.alternative, true);
  assert.notDeepEqual(
    first.segments.map((item) => item.text),
    second.segments.map((item) => item.text)
  );
  second.segments.forEach((segment) => {
    assert.ok(BIOLOGY.includes(segment.text));
  });
});

test('sections mode uses detected headings and labels inferred grouping', () => {
  const paper =
    'Abstract\nThis study examines a question.\nMethods\nWe used a sample of 40 participants.\nResults\nThe result was 12 units.\nDiscussion\nA limitation is the small sample.';
  const result = explainSelection({ text: paper, mode: 'sections' });
  assert.equal(result.ok, true);
  assert.equal(result.subject.id, 'research_paper');
  assert.ok(result.segments.some((segment) => segment.sectionTitle === 'Methods'));
  assert.ok(
    result.limitations.some((note) => /inferred from heading-like lines/i.test(note))
  );
});

test('own-words evaluation uses deterministic coverage and refuses to claim mastery', () => {
  const empty = evaluateOwnWordsExplanation({ text: BIOLOGY, response: '' });
  assert.equal(empty.ok, false);
  assert.equal(empty.understanding, 'insufficient_evidence');

  const partial = evaluateOwnWordsExplanation({
    text: BIOLOGY,
    response: 'Plants use chlorophyll to absorb light.',
  });
  assert.equal(partial.ok, true);
  assert.ok(partial.coverage > 0);
  assert.ok(['partial_evidence', 'some_evidence'].includes(partial.understanding));
  assert.ok(partial.limitations.some((note) => /not establish comprehension|mastery/i.test(note)));

  const copied = evaluateOwnWordsExplanation({
    text: BIOLOGY,
    response: BIOLOGY,
  });
  assert.equal(copied.copiedFromSource, true);
  assert.match(copied.feedback, /word for word/i);
});

test('a failed verification is visible and does not silently pass', () => {
  const result = explainSelection({
    text: 'The mass is 5 kg and the force is 10 N. The value is 2 + 2 = 5.',
  });
  const verification = validateExplanationResult({ text: 'The mass is 5 kg.', result });
  assert.equal(verification.ok, false);
  assert.ok(verification.errors.length > 0);
});

test('difficult words are simple strings in appearance order', () => {
  const words = findDifficultWords(BIOLOGY);
  assert.ok(words.includes('Photosynthesis'));
  assert.ok(words.length <= 6);
  assert.ok(words.every((word) => typeof word === 'string'));
});
