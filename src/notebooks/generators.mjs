// The canonical vocabulary for "where did this content come from".
//
// Every generated artifact in the app — an answer, a summary, a study kit, a
// practice question, a saved note — must be attributable. This module is the
// single place that vocabulary is defined, so a label cannot be quietly
// dropped, coerced to a different one, or invented inline.
//
// The rule the product follows: a label must never understate what produced
// the content. A model-generated answer that is relabelled as a local
// extraction is a false claim about the evidence, and it is the one failure
// mode this codebase is built to prevent.

/**
 * Every generator the app can produce.
 *
 * - `local_deterministic` — computed by local rules, no source text quoted.
 * - `local_extractive` — local code quoting an exact source passage.
 * - `local_extractive_rule` — a local rule applied to quoted source text.
 * - `authored_catalog` — hand-authored content shipped in the repository.
 * - `ai_grounded` — a model answer whose citations were verified against the
 *   stored source text before it was shown.
 * - `ai_assisted` — model-written material saved for later study.
 */
export const GENERATORS = Object.freeze({
  LOCAL_DETERMINISTIC: 'local_deterministic',
  LOCAL_EXTRACTIVE: 'local_extractive',
  LOCAL_EXTRACTIVE_RULE: 'local_extractive_rule',
  AUTHORED_CATALOG: 'authored_catalog',
  AI_GROUNDED: 'ai_grounded',
  AI_ASSISTED: 'ai_assisted',
});

export const GENERATOR_VALUES = Object.freeze(
  Object.values(GENERATORS)
);

/**
 * The generator labels a saved study material can carry.
 *
 * A material is a thing the learner keeps: a note they wrote themselves, a
 * kit the app built by quoting their sources, or a model-written draft. The
 * vocabulary is deliberately narrower than `GENERATORS` because a material is
 * stored and read back, and its label has to survive that round trip.
 *
 * `authored` here means "the learner wrote this". It is not the same claim as
 * `authored_catalog`, which means "hand-authored content shipped with the
 * repository", so the two are kept apart.
 */
export const MATERIAL_GENERATORS = Object.freeze({
  AUTHORED: 'authored',
  LOCAL_EXTRACTIVE: GENERATORS.LOCAL_EXTRACTIVE,
  AI_ASSISTED: GENERATORS.AI_ASSISTED,
});

export const MATERIAL_GENERATOR_VALUES = Object.freeze(
  Object.values(MATERIAL_GENERATORS)
);

/**
 * A short human label for a generator, used in the UI.
 *
 * These describe the origin, not the quality.
 */
export const GENERATOR_LABELS = Object.freeze({
  [GENERATORS.LOCAL_DETERMINISTIC]: 'Local rule',
  [GENERATORS.LOCAL_EXTRACTIVE]: 'Local extractive',
  [GENERATORS.LOCAL_EXTRACTIVE_RULE]: 'Local rule on source text',
  [GENERATORS.AUTHORED_CATALOG]: 'Authored content',
  [GENERATORS.AI_GROUNDED]: 'AI answer',
  [GENERATORS.AI_ASSISTED]: 'AI-assisted',
});

/**
 * True when a generator means a language model produced the content.
 *
 * The UI uses this to decide whether a result needs the model-origin
 * treatment: a visible origin label, a capability note, and the extra
 * verification wording.
 */
export function isModelGenerated(generator) {
  return (
    generator === GENERATORS.AI_GROUNDED || generator === GENERATORS.AI_ASSISTED
  );
}

/**
 * Normalize a generator label.
 *
 * An unknown value falls back to `fallback` (by default
 * `local_deterministic`) rather than being passed through. Passing an
 * unrecognised label through would let a caller label content as something
 * the app does not actually know about.
 */
export function normalizeGenerator(value, fallback = GENERATORS.LOCAL_DETERMINISTIC) {
  return GENERATOR_VALUES.includes(value) ? value : fallback;
}

/**
 * The human label for a generator, with a safe fallback.
 */
export function formatGeneratorLabel(value) {
  return GENERATOR_LABELS[value] || 'Local rule';
}

/**
 * Normalize the generator of a saved study material.
 *
 * An unrecognised label falls back to `authored`, because a material whose
 * origin is unknown is still something the learner can read and edit. It is
 * never upgraded to a model label.
 */
export function normalizeMaterialGenerator(value) {
  return MATERIAL_GENERATOR_VALUES.includes(value)
    ? value
    : MATERIAL_GENERATORS.AUTHORED;
}
