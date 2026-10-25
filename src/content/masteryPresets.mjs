// Reusable mastery presets for authored course content.
//
// These are content configuration, not progression logic. The mastery engine
// applies the same rules to every subject. Authors can spread a preset and
// override individual thresholds without touching application code.

export const baseMasteryCriteria = Object.freeze({
  minimumCorrect: 2,
  minimumDistinctItems: 2,
  minimumDistinctSources: 2,
  minimumAccuracy: 0.75,
  accuracyWindow: 5,
  requiredSources: [],
  retention: Object.freeze({
    required: false,
    minimumDelayHours: 24,
    minimumCorrect: 1,
    sources: Object.freeze(['review']),
  }),
});

// Objectives assessed inside a guided journey also need correct evidence from
// the lesson assessment. Practice or diagnostics alone cannot satisfy them.
export const journeyAssessmentMasteryCriteria = Object.freeze({
  ...baseMasteryCriteria,
  requiredSources: Object.freeze(['lesson_assessment']),
  retention: baseMasteryCriteria.retention,
});

export function cloneMasteryCriteria(preset = baseMasteryCriteria) {
  return {
    ...preset,
    requiredSources: [...(preset.requiredSources || [])],
    retention: {
      ...preset.retention,
      sources: [...(preset.retention?.sources || [])],
    },
  };
}
