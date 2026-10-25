import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  JOURNEY_STAGES,
  canCompleteJourney,
  createInitialJourneyState,
  createJourneyReducer,
  isBlankValue,
} from '../../learning/journeyEngine';
import { createJourneyProgressStore } from '../../learning/journeyProgressStore';
import {
  EVIDENCE_UPDATED_EVENT,
  createEvidenceStore,
  loadEvidenceOrDefault,
} from '../../learning/evidenceStore';
import { EVIDENCE_SOURCES, recordAttempt } from '../../learning/gapDetection.mjs';
import { evaluateProgression } from '../../learning/mastery.mjs';
import { createMasteryStore } from '../../learning/masteryStore.mjs';
import {
  getCourseLearningMap,
  getCourseReviewItems,
} from '../../data/courseLearningMaps.mjs';
import LessonJourneyView from './LessonJourneyView';

// Container: owns persistence and completion side effects; the view stays pure.
const LessonJourney = ({
  content,
  onComplete,
  onBackToCourse,
  onStartRemediation,
}) => {
  const store = useMemo(
    () => createJourneyProgressStore(globalThis.localStorage),
    []
  );
  const savedState = useMemo(
    () => store.load(content.courseId, content.lessonId),
    [store, content.courseId, content.lessonId]
  );
  const reducer = useMemo(() => createJourneyReducer(content), [content]);
  const [state, dispatch] = useReducer(reducer, null, () =>
    createInitialJourneyState(content, {}, savedState)
  );

  // Course-scoped evidence is the shared knowledge state. Journey practice and
  // assessment answers are recorded there so diagnostics, readiness checks and
  // the error coach all read one model.
  const evidenceStore = useMemo(
    () => createEvidenceStore(globalThis.localStorage),
    []
  );
  const masteryStore = useMemo(
    () => createMasteryStore(globalThis.localStorage),
    []
  );
  const [evidence, setEvidence] = useState(() =>
    loadEvidenceOrDefault(evidenceStore, content.courseId)
  );
  const evidenceRef = useRef(evidence);
  const lastRecordKeyRef = useRef(null);
  const courseMap = useMemo(
    () => getCourseLearningMap(content.courseId),
    [content.courseId]
  );
  const remediationItems = useMemo(
    () => getCourseReviewItems(content.courseId),
    [content.courseId]
  );

  useEffect(() => {
    evidenceRef.current = evidence;
  }, [evidence]);

  // Targeted remediation happens in the readiness panel, which writes to the
  // same course-scoped evidence store. Reload it here so the mastery decision
  // reflects the new evidence without a page reload.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleEvidenceUpdate = (event) => {
      if (
        event &&
        event.detail &&
        event.detail.courseId &&
        event.detail.courseId !== content.courseId
      ) {
        return;
      }
      const nextEvidence = loadEvidenceOrDefault(
        evidenceStore,
        content.courseId
      );
      evidenceRef.current = nextEvidence;
      setEvidence(nextEvidence);
    };
    window.addEventListener(EVIDENCE_UPDATED_EVENT, handleEvidenceUpdate);
    return () =>
      window.removeEventListener(
        EVIDENCE_UPDATED_EVENT,
        handleEvidenceUpdate
      );
  }, [evidenceStore, content.courseId]);

  const recordEvidenceAttempt = useCallback(
    ({ items, answers, source, metadata }) => {
      const result = recordAttempt(evidenceRef.current, {
        items,
        answers,
        source,
        metadata,
      });
      evidenceRef.current = result.evidence;
      evidenceStore.save(content.courseId, result.evidence);
      setEvidence(result.evidence);
      return result;
    },
    [evidenceStore, content.courseId]
  );

  // Persist after every change so a reload restores the exact stage.
  useEffect(() => {
    store.save(content.courseId, content.lessonId, state);
  }, [store, content.courseId, content.lessonId, state]);

  // Notify the page when the journey flips to completed. `onComplete` may be a
  // new function identity each render, so it is intentionally not a dependency.
  useEffect(() => {
    if (state.completed && typeof onComplete === 'function') {
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.completed]);

  // The journey engine remains the source of truth for activity completion.
  // The mastery layer only receives that result and adds objective criteria,
  // prerequisite readiness and delayed-retention requirements.
  const activityComplete = canCompleteJourney(state, content);
  const masteryDecision = useMemo(() => {
    if (!courseMap) return null;
    return evaluateProgression({
      courseMap,
      lessonId: content.lessonId,
      evidence,
      now: new Date(),
      activityComplete,
      remediationItems,
    });
  }, [
    courseMap,
    content.lessonId,
    evidence,
    activityComplete,
    remediationItems,
  ]);
  const decisionFingerprint = masteryDecision
    ? [
        state.assessment.attempts.length,
        evidence.attempts.length,
        state.completed,
        masteryDecision.allowed,
        masteryDecision.retention.pendingObjectiveIds.join(','),
      ].join('|')
    : '';

  // Record the explanation for decisions after the learner has produced
  // evidence. A fresh, unassessed visit does not need an audit record.
  useEffect(() => {
    if (!masteryDecision) return;
    if (state.assessment.attempts.length === 0 && !state.completed) return;
    masteryStore.saveDecision(content.courseId, masteryDecision);
    // The fingerprint captures the inputs that can change a decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionFingerprint]);

  const dispatchWithEvidence = (action) => {
    if (
      action &&
      action.type === 'COMPLETE_JOURNEY' &&
      masteryDecision &&
      !masteryDecision.allowed
    ) {
      masteryStore.saveDecision(content.courseId, masteryDecision);
      return;
    }
    if (action && action.type === 'SUBMIT_PRACTICE') {
      const isGuided = state.stage === JOURNEY_STAGES.GUIDED_PRACTICE;
      const phaseState = isGuided
        ? state.guidedPractice
        : state.independentPractice;
      const items = isGuided
        ? content.guidedPractice.items
        : content.independentPractice.items;
      const item = items[phaseState.index];
      const selected = phaseState.selected;
      if (item && selected !== null && !phaseState.feedback) {
        const record = phaseState.records[item.id];
        const key = `${state.stage}-${item.id}-${
          record ? record.attempts : 0
        }-${String(selected)}`;
        if (lastRecordKeyRef.current !== key) {
          lastRecordKeyRef.current = key;
          recordEvidenceAttempt({
            items: [item],
            answers: { [item.id]: selected },
            source: EVIDENCE_SOURCES.LESSON_PRACTICE,
            metadata: { lessonId: content.lessonId, stage: state.stage },
          });
        }
      }
    } else if (
      action &&
      action.type === 'SUBMIT_ASSESSMENT' &&
      !state.assessment.results
    ) {
      const items = content.assessment.items || [];
      const allAnswered = items.every(
        (item) => !isBlankValue(state.assessment.answers[item.id])
      );
      const key = `assessment-${state.assessment.attempts.length}`;
      if (allAnswered && lastRecordKeyRef.current !== key) {
        lastRecordKeyRef.current = key;
        recordEvidenceAttempt({
          items,
          answers: state.assessment.answers,
          source: EVIDENCE_SOURCES.LESSON_ASSESSMENT,
          metadata: { lessonId: content.lessonId },
        });
      }
    }
    dispatch(action);
  };

  const errorSupport = useMemo(
    () => ({
      courseMap,
      evidence,
      recordEvidenceAttempt,
    }),
    [courseMap, evidence, recordEvidenceAttempt]
  );

  return (
    <LessonJourneyView
      content={content}
      state={state}
      dispatch={dispatchWithEvidence}
      onBackToCourse={onBackToCourse}
      errorSupport={errorSupport}
      masteryDecision={masteryDecision}
      onStartRemediation={onStartRemediation}
    />
  );
};

export default LessonJourney;
