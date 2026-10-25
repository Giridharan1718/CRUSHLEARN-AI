// VisualLearningService: curated authored visuals plus an honest plan for the
// visual a subject would benefit from.
//
// The catalog contains a small number of authored topics. This service never
// presents a curated visual as source evidence, and it does not claim to
// generate diagrams, charts, animations or audio on demand.
//
// The subject-to-representation map lives in `src/notebooks/textExplanation.mjs`
// as `VISUAL_REPRESENTATIONS`. This file used to hold a second copy of it with
// different wording for the same nine subjects; there is now one map.

import { findVisualExplanationForTopic } from '../visual/visualCatalog.mjs';
import { validateVisualExplanation } from '../visual/visualSchema.mjs';
import { VISUAL_REPRESENTATIONS } from '../notebooks/textExplanation.mjs';
import { GENERATORS } from '../notebooks/generators.mjs';
import {
  CAPABILITY_STATUS,
  RUN_STATUS,
  createServiceResult,
} from './contracts.mjs';

export const VISUAL_CAPABILITY = CAPABILITY_STATUS.PARTIAL;

/**
 * The reason a representation is recommended for a subject.
 *
 * The wording is the user-facing explanation of the recommendation, so it
 * lives next to the map it explains.
 */
const RECOMMENDATION_REASONS = Object.freeze({
  mathematics:
    'Mathematics usually benefits from worked equation steps or a graph of the relationship.',
  physics:
    'Physics usually benefits from a free-body or process diagram with labelled quantities.',
  chemistry:
    'Chemistry usually benefits from a reaction scheme that shows substances and conditions.',
  biology:
    'Biology usually benefits from a process map that shows structures, inputs and outputs.',
  programming:
    'Programming usually benefits from a trace of state changes or a control-flow diagram.',
  engineering:
    'Engineering usually benefits from a system diagram with loads, materials and constraints.',
  research_paper:
    'A research paper usually benefits from a study-flow diagram or an evidence table.',
  data_table:
    'Structured data usually benefits from a chart with labelled axes and units.',
  general:
    'No subject-specific visual is recommended for general text.',
});

function recommendationFor(subject) {
  const representation =
    VISUAL_REPRESENTATIONS[subject] || VISUAL_REPRESENTATIONS.general;
  return {
    representation,
    reason: RECOMMENDATION_REASONS[subject] || RECOMMENDATION_REASONS.general,
  };
}

export function planVisual({ topic = '', subject = 'general' } = {}) {
  const match = topic ? findVisualExplanationForTopic(topic) : { ok: false };
  if (match.ok && match.explanation) {
    const validation = validateVisualExplanation(match.explanation);
    if (validation.ok) {
      return createServiceResult({
        service: 'visual_learning',
        capability: VISUAL_CAPABILITY,
        status: RUN_STATUS.COMPLETED,
        data: {
          available: true,
          kind: 'curated',
          id: match.explanation.id,
          title: match.explanation.title,
          visualType: match.explanation.visualType,
          note: 'Curated authored explanation, not generated from the source and not source evidence.',
          recommendation: recommendationFor(subject),
        },
        limitations: [
          'The visual is authored in the app and is separate from the source evidence map.',
        ],
        generator: GENERATORS.AUTHORED_CATALOG,
      });
    }
  }

  return createServiceResult({
    service: 'visual_learning',
    capability: VISUAL_CAPABILITY,
    // The run itself completed: it answered the question it was asked, which
    // was "is there a curated visual for this, and if not, what would help?".
    // The things this build cannot produce are listed under `unavailable`.
    // Reporting a partial run here would downgrade every explanation that
    // has no matching authored visual, which is most of them.
    status: RUN_STATUS.COMPLETED,
    data: {
      available: false,
      kind: 'unavailable',
      recommendation: recommendationFor(subject),
      note: 'No authored visual matches this topic. Arbitrary visual generation is not implemented.',
    },
    unavailable: ['generated diagram', 'generated chart', 'generated animation', 'generated audio'],
    limitations: [
      'A visual would be useful here, but this build only opens curated authored visuals.',
      'Audio explanations are not generated; browser speech synthesis can read existing text only.',
    ],
    generator: GENERATORS.LOCAL_DETERMINISTIC,
  });
}
