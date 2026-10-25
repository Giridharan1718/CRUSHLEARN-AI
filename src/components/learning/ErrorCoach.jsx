import { useState } from 'react';
import { ASSESSMENT_STATES } from '../../utils/evidenceClassification.mjs';
import { EVIDENCE_SOURCES } from '../../learning/gapDetection.mjs';
import {
  ERROR_RECOMMENDATIONS,
  analyzeError,
  evaluateRemediation,
  selectAdaptiveExercise,
} from '../../learning/errorAnalysis.mjs';
import ErrorCoachView from './ErrorCoachView';

// Container: owns the adaptive exercise session. The original journey answer
// has already been written to the shared evidence store by LessonJourney.
const ErrorCoach = ({
  courseId,
  item,
  value,
  attemptNumber = 1,
  courseMap = null,
  evidence,
  onRecordAttempt,
}) => {
  // The analysis is frozen for this wrong answer. New evidence from an
  // adaptive exercise must not rewrite the explanation of the original error.
  const [analysis] = useState(() =>
    analyzeError({
      item,
      value,
      attemptNumber,
      courseMap,
      evidence,
    })
  );
  const [mode, setMode] = useState('analysis');
  const [activeItem, setActiveItem] = useState(null);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [attemptedIds, setAttemptedIds] = useState([]);

  if (!analysis || analysis.isCorrect) return null;

  const targetObjectiveIds = [];
  if (
    analysis.recommendation.type === ERROR_RECOMMENDATIONS.REVIEW_PREREQUISITE &&
    analysis.recommendation.objectiveId
  ) {
    targetObjectiveIds.push(analysis.recommendation.objectiveId);
  }
  if (item.objectiveId && !targetObjectiveIds.includes(item.objectiveId)) {
    targetObjectiveIds.push(item.objectiveId);
  }
  (analysis.prerequisiteCheck.objectives || []).forEach((objective) => {
    if (
      objective.state === ASSESSMENT_STATES.REVIEW_RECOMMENDED &&
      !targetObjectiveIds.includes(objective.objectiveId)
    ) {
      targetObjectiveIds.push(objective.objectiveId);
    }
  });

  const pickAlternative = () => {
    const excluded = [item.id, ...attemptedIds];
    for (const objectiveId of targetObjectiveIds) {
      const alternative = selectAdaptiveExercise({
        courseMap,
        objectiveId,
        evidence,
        excludeItemIds: excluded,
      });
      if (alternative) return alternative;
    }
    return null;
  };

  const alternativesAvailable = Boolean(pickAlternative());

  const handleTryDifferentExercise = () => {
    const alternative = pickAlternative();
    if (!alternative) return;
    setActiveItem(alternative);
    setSelected(null);
    setResult(null);
    setMode('adaptive');
  };

  const handleSubmit = () => {
    if (!activeItem || selected === null || selected === undefined) return;

    const after = analyzeError({
      item: activeItem,
      value: selected,
      attemptNumber: 1,
      courseMap,
      evidence,
    });
    const improvement = evaluateRemediation({ before: analysis, after });

    if (typeof onRecordAttempt === 'function') {
      onRecordAttempt({
        items: [activeItem],
        answers: { [activeItem.id]: selected },
        source: EVIDENCE_SOURCES.ADAPTIVE_PRACTICE,
        metadata: {
          remediationFor: item.id,
          improved: improvement.improved,
          sameError: improvement.sameError,
          categoryBefore: improvement.beforeCategory,
          categoryAfter: improvement.afterCategory,
        },
      });
    }

    setAttemptedIds((previous) => [...previous, activeItem.id]);
    setResult({ ...after, improvement });
  };

  const handleBackToFeedback = () => {
    setMode('analysis');
    setActiveItem(null);
    setResult(null);
    setSelected(null);
  };

  return (
    <ErrorCoachView
      courseId={courseId}
      analysis={analysis}
      mode={mode}
      activeItem={activeItem}
      selected={selected}
      result={result}
      alternativesAvailable={alternativesAvailable}
      onTryDifferentExercise={handleTryDifferentExercise}
      onSelect={setSelected}
      onSubmit={handleSubmit}
      onBack={handleBackToFeedback}
    />
  );
};

export default ErrorCoach;
