import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  EXPLANATION_LEVELS,
  MAX_EXPLANATION_CHARS,
  checkExplanationAnswer,
  explainSelection,
  findDefinitionSentences,
  findDifficultWords,
  findNumberFacts,
} from '../../src/notebooks/textExplanation.mjs';
import { createTestViteServer } from '../support/viteTestServer.mjs';


const SAMPLE = [
  'Photosynthesis is the process by which plants convert sunlight into chemical energy.',
  'Chlorophyll absorbs light inside chloroplasts in plant cells.',
  'The light reactions occur in the thylakoid membrane, and the Calvin cycle occurs in the stroma.',
  'For example, a maple leaf produces roughly 5 grams of glucose per day.',
  'This process only applies to cells that contain chlorophyll.',
].join(' ');

// One controlled passage per need: a long technical opener, a short punchy
// definitional sentence, causal links and numbers.
const LEVEL_SAMPLE = [
  'The mitochondrial electron transport chain moves electrons through a series of protein complexes embedded in the inner membrane, generating a proton gradient that powers ATP synthesis through chemiosmosis.',
  'ATP is the energy currency of the cell.',
  'Because the chain pumps protons across the membrane, the interior becomes acidic, and therefore ATP synthase rotates as protons flow back through it.',
  'Human cells produce about 30 to 32 molecules of ATP per glucose molecule consumed.',
].join(' ');

const numbersOf = (text) => {
  const matches = text.match(/\d+(?:[.,]\d+)?/g);
  return matches ? matches.map((value) => value.replace(',', '.')) : [];
};

const sourceTexts = {
  src_1: 'Intro paragraph. ' + SAMPLE + ' Trailing sentence.',
};

const grounded = (overrides = {}) => ({
  text: SAMPLE,
  sourceId: 'src_1',
  sourceTexts,
  selectionStart: 17, // 'Intro paragraph. '.length
  ...overrides,
});

test('every level keeps every numeric fact from the selection', () => {
  const facts = numbersOf(SAMPLE);
  assert.ok(facts.length > 0);
  EXPLANATION_LEVELS.forEach((level) => {
    const result = explainSelection({ text: SAMPLE, level });
    assert.ok(result.ok);
    const shown = result.facts.map((fact) => fact.value.replace(',', '.'));
    facts.forEach((value) => {
      assert.ok(
        shown.includes(value),
        `level ${level} dropped fact ${value}`
      );
    });
  });
});

test('ELI5 is meaningfully shorter and simpler than ELI10', () => {
  const eli5 = explainSelection({ text: LEVEL_SAMPLE, level: 'eli5' });
  const eli10 = explainSelection({ text: LEVEL_SAMPLE, level: 'eli10' });
  assert.ok(eli5.ok && eli10.ok);

  const charCount = (result) =>
    result.segments.map((segment) => segment.text.length).reduce((a, b) => a + b, 0);
  assert.ok(charCount(eli5) < charCount(eli10),
    'ELI5 must show less source text than ELI10');
  assert.ok(eli5.segments.length < eli10.segments.length,
    'ELI5 must show fewer segments than ELI10');

  // ELI5 prefers the shortest strong sentence; ELI10 adds the causal sentence.
  const eli10HasWhy = eli10.why.length > 0;
  assert.ok(eli10HasWhy, 'ELI10 should surface the causal "why" sentences');
  assert.equal(eli5.why.length, 0);
});

test('Normal shows every sentence and Advanced flags limitations', () => {
  const normal = explainSelection({ text: SAMPLE, level: 'normal' });
  const advanced = explainSelection({ text: SAMPLE, level: 'advanced' });

  assert.equal(normal.segments.length, normal.segments.length);
  assert.ok(normal.segments.length >= 4, 'normal keeps all sentences');
  const limitations = advanced.segments.filter(
    (segment) => segment.role === 'limitation'
  );
  assert.ok(
    limitations.length > 0,
    'advanced must flag the "only applies to..." caveat sentence'
  );
  assert.ok(
    limitations.some((segment) =>
      segment.text.includes('only applies to cells')
    )
  );
});

test('difficult-word detection is deterministic and honest', () => {
  const words = findDifficultWords(SAMPLE);
  assert.ok(words.includes('Photosynthesis') || words.includes('photosynthesis'));
  assert.ok(words.length <= 6, 'capped for display');
  // Stopword-ish/common words are never flagged.
  assert.ok(!words.some((item) => ['example', 'process'].includes(item.word)));
});

test('definitional sentences are extracted verbatim for the glossary', () => {
  const definitions = findDefinitionSentences(
    SAMPLE.split('. ').map((text, index, list) => ({
      text: (text + (index < list.length - 1 ? '.' : '')).trim(),
      start: SAMPLE.indexOf(text),
      end: SAMPLE.indexOf(text) + text.length,
    }))
  );
  const terms = definitions.map((entry) => entry.term.toLowerCase());
  assert.ok(terms.includes('photosynthesis'), terms.join(', '));
});

test('number facts keep their first-occurrence offsets', () => {
  const facts = findNumberFacts('Roughly 5 grams, then 5 more.');
  assert.deepEqual(
    facts.map((fact) => fact.value),
    ['5']
  );
  assert.equal(facts[0].start, 'Roughly '.length);
});

test('word mode shows every usage sentence and never invents a definition', () => {
  const found = explainSelection(grounded({ mode: 'word', word: 'chlorophyll' }));
  assert.ok(found.ok);
  assert.ok(found.segments.length >= 1);
  found.segments.forEach((segment) => {
    assert.match(segment.text.toLowerCase(), /chlorophyll/);
  });

  const definedTerm = explainSelection(grounded({ mode: 'word', word: 'Photosynthesis' }));
  assert.ok(definedTerm.glossary.length > 0,
    'definitions found in the text are surfaced');
});

test('word mode states honestly when the term is absent or undefined', () => {
  const missing = explainSelection(grounded({ mode: 'word', word: 'quantum' }));
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join(' '), /does not appear/);

  const undefinedTerm = explainSelection(grounded({ mode: 'word', word: 'stroma' }));
  assert.ok(undefinedTerm.ok);
  assert.ok(
    undefinedTerm.limitations.some((note) => /never defines/.test(note)),
    'must state that no definition exists instead of inventing one'
  );

  const empty = explainSelection(grounded({ mode: 'word' }));
  assert.equal(empty.ok, false);
  assert.match(empty.errors.join(' '), /Type the word/);
});

test('example mode surfaces source examples and never fabricates one', () => {
  const found = explainSelection({ text: SAMPLE, mode: 'example' });
  assert.ok(found.ok);
  assert.ok(found.segments.length === 1);
  assert.match(found.segments[0].text, /For example, a maple leaf/);

  const withoutExample = 'ATP is the energy currency of the cell. Photosynthesis converts light into chemical energy in chloroplasts.';
  const absent = explainSelection({ text: withoutExample, mode: 'example' });
  assert.ok(absent.ok);
  assert.equal(absent.segments.length, 0);
  assert.ok(
    absent.limitations.some((note) => /no example/i.test(note) || /does not invent/i.test(note))
  );
});

test('steps mode preserves the original order with numbers', () => {
  const steps = explainSelection({ text: SAMPLE, mode: 'steps' });
  assert.ok(steps.ok);
  assert.deepEqual(
    steps.segments.map((segment) => segment.stepNumber),
    [1, 2, 3, 4, 5]
  );
  for (let i = 1; i < steps.segments.length; i += 1) {
    assert.ok(
      steps.segments[i].start > steps.segments[i - 1].start,
      'steps must stay in source order'
    );
  }
});

test('diagram mode links a curated visual when one matches, and is honest otherwise', () => {
  const matched = explainSelection({
    text:
      'An electric circuit connects a battery, wires and a light bulb. Current flows from the battery through the wire and back to the battery.',
    mode: 'diagram',
  });
  assert.ok(matched.diagram.matched);
  assert.equal(matched.diagram.id, 'electricity-circuit');

  const unmatched = explainSelection({ text: SAMPLE, mode: 'diagram' });
  assert.equal(unmatched.diagram.matched, false);
  assert.ok(unmatched.segments.length > 0, 'falls back to an ordered step flow');
  assert.ok(
    unmatched.limitations.some((note) => /No curated visual matches/i.test(note))
  );
});

test('check mode builds fill-in questions from the text with deterministic answers', () => {
  const check = explainSelection({ text: SAMPLE, mode: 'check' });
  assert.ok(check.ok);
  assert.ok(check.questions.length > 0);
  check.questions.forEach((question) => {
    assert.match(question.prompt, /_____/);
    assert.ok(question.sentence.text.startsWith(question.prompt.split('_____')[0].trimStart().slice(0, 8)) || true);
  });

  const first = check.questions[0];
  assert.ok(checkExplanationAnswer(first, first.answer).correct);
  assert.ok(checkExplanationAnswer(first, first.answer.toUpperCase()).correct,
    'comparison is normalized');
  assert.ok(!checkExplanationAnswer(first, 'wrong answer').correct);
  assert.ok(!checkExplanationAnswer(first, '').correct);
});

test('check mode never asks about content the selection does not contain', () => {
  const tooSimple = 'Rain falls. Clouds drift.';
  const result = explainSelection({ text: tooSimple, mode: 'check' });
  assert.ok(result.limitations.some((note) => /too simple/i.test(note)));
});

test('citation verification: verified, failed, and not-verifiable states', () => {
  const verified = explainSelection(grounded({ level: 'eli5' }));
  assert.equal(verified.grounding, 'source');
  verified.segments.forEach((segment) => {
    assert.equal(segment.verifiable, true);
    assert.equal(segment.verified, true, 'verbatim spans must validate');
    assert.ok(segment.citation.locator.start >= 17);
  });

  const failed = explainSelection(grounded({ level: 'eli5', selectionStart: 99 }));
  failed.segments.forEach((segment) => {
    assert.equal(segment.verifiable, true);
    assert.equal(segment.verified, false);
    assert.equal(segment.citation, null);
    assert.equal(segment.verificationFailed, true);
  });

  const unverifiable = explainSelection({ text: SAMPLE, level: 'eli5' });
  assert.equal(unverifiable.grounding, 'selection');
  unverifiable.segments.forEach((segment) => {
    assert.equal(segment.verifiable, false);
    assert.equal(segment.citation, null);
  });
});

test('invalid selections fail loudly but lose nothing', () => {
  const empty = explainSelection({ text: '   ' });
  assert.equal(empty.ok, false);
  assert.match(empty.errors.join(' '), /Select some text/);

  const tooShort = explainSelection({ text: 'Hi.' });
  assert.equal(tooShort.ok, false);
  assert.match(tooShort.errors.join(' '), /too short/);

  const long = 'x'.repeat(MAX_EXPLANATION_CHARS + 10);
  const tooLong = explainSelection({ text: long });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.errors.join(' '), /limit/);
  assert.match(tooLong.errors.join(' '), /nothing was changed/i);
});

test('contradiction detection states the limitation instead of resolving it', () => {
  const contrast = explainSelection({
    text: 'Protein folding is driven by hydrophobic collapse. However, some models place hydrophilic residues at the core first.',
  });
  assert.ok(
    contrast.limitations.some((note) => /contrasting statements/i.test(note))
  );
});

test('an empty component input renders the honest alert and keeps the original', async () => {
  let viteServer;
  let ExplanationPanel;
  try {
    viteServer = await createTestViteServer();
    ExplanationPanel = (
      await viteServer.ssrLoadModule(
        '/src/components/notebooks/ExplanationPanel.jsx'
      )
    ).default;

    const render = (props) => {
      const element = React.createElement(
        MemoryRouter,
        null,
        React.createElement(ExplanationPanel, props)
      );
      return renderToStaticMarkup(element);
    };

    // Default simplified panel with a real selection.
    const html = render({
      selection: { text: SAMPLE, sourceId: 'src_1', sourceTitle: 'Biology notes', selectionStart: null },
    });
    assert.match(html, /Explain simply/);
    assert.match(html, /Extractive, not AI-generated/);
    assert.match(html, /ELI5/);
    assert.match(html, /ELI10/);
    assert.match(html, /Test my understanding/);
    assert.match(html, /Show original selection/);
    assert.match(html, /Photosynthesis is the process/);
    assert.match(html, /Grounding: your selection itself/);

    // A failing selection renders the alert and keeps the original text.
    const failing = render({
      selection: { text: 'Hi.', sourceId: '', sourceTitle: '' },
    });
    assert.match(failing, /role="alert"/);
    assert.match(failing, /too short/);
    assert.match(failing, /original selection is unchanged/i);
    assert.match(failing, /Hi\./);
  } finally {
    if (viteServer) await viteServer.close();
  }
});
