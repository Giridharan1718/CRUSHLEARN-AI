import { useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeLessonReadiness,
  getReassessmentItems,
  recordAttempt,
  selectPracticeItems,
  summarizeEvidence,
} from '../../learning/gapDetection.mjs';
import {
  EVIDENCE_UPDATED_EVENT,
  createEvidenceStore,
  loadEvidenceOrDefault,
} from '../../learning/evidenceStore.mjs';
import { selectRemediationItems } from '../../learning/mastery.mjs';
import DiagnosticCheckView from './DiagnosticCheckView';

// Container: owns evidence persistence and the short assessment flows. All
// classification and recommendation logic stays in the pure gap-detection
// engine; the view is presentational and subject-agnostic.
const DiagnosticCheck = ({
  courseId,
  lessonId,
  courseMap,
  lessonSpec,
  focusObjectiveIds = [],
  practiceRequestToken = 0,
}) => {
  const spec = lessonSpec && lessonSpec.diagnostic;
  const store = useMemo(
    () => createEvidenceStore(globalThis.localStorage),
    []
  );
  const initialEvidence = useMemo(
    () => loadEvidenceOrDefault(store, courseId),
    [store, courseId]
  );

  const [evidence, setEvidence] = useState(initialEvidence);
  const [mode, setMode] = useState('summary');
  const [collapsed, setCollapsed] = useState(false);
  const [answers, setAnswers] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [practiceItems, setPracticeItems] = useState([]);
  const [lastAttempt, setLastAttempt] = useState(
    initialEvidence.attempts[initialEvidence.attempts.length - 1] || null
  );

  // Lesson practice writes to the same course-scoped store. Reload the panel's
  // evidence when another component saves a new attempt for this course.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleEvidenceUpdate = (event) => {
      if (event && event.detail && event.detail.courseId !== courseId) return;
      const nextEvidence = loadEvidenceOrDefault(store, courseId);
      setEvidence(nextEvidence);
      setLastAttempt(
        nextEvidence.attempts[nextEvidence.attempts.length - 1] || null
      );
    };
    window.addEventListener(EVIDENCE_UPDATED_EVENT, handleEvidenceUpdate);
    return () =>
      window.removeEventListener(EVIDENCE_UPDATED_EVENT, handleEvidenceUpdate);
  }, [store, courseId]);

  const analysis = useMemo(() => {
    if (!courseMap || !lessonSpec) return null;
    return analyzeLessonReadiness({ courseMap, lessonId, evidence });
  }, [courseMap, lessonId, lessonSpec, evidence]);

  const evidenceSummary = useMemo(() => summarizeEvidence(evidence), [evidence]);
  const focusKey = focusObjectiveIds.join('|');
  const masteryPractice = useMemo(
    () =>
      focusObjectiveIds.length === 0
        ? []
        : selectRemediationItems({
            courseMap,
            lessonId,
            objectiveIds: focusObjectiveIds,
            maxItems: 5,
          }),
    // focusKey keeps the dependency stable when callers pass a new array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courseMap, lessonId, focusKey]
  );
  const suggestedPractice = useMemo(() => {
    const selected = selectPracticeItems(
      spec,
      analysis ? analysis.recommendations : [],
      { maxItems: 5 }
    );
    const seen = new Set(selected.map((item) => item.id));
    masteryPractice.forEach((item) => {
      if (!seen.has(item.id) && selected.length < 5) {
        seen.add(item.id);
        selected.push(item);
      }
    });
    return selected;
  }, [analysis, spec, masteryPractice]);
  const reassessmentItems = useMemo(() => getReassessmentItems(spec), [spec]);
  const lastPracticeRequestRef = useRef(0);

  // A deferred mastery decision in the lesson journey can ask this existing
  // readiness panel to open its targeted-practice flow. The token prevents an
  // evidence update from restarting practice unexpectedly. Keep the hook
  // before the early return so hook order stays stable for missing content.
  useEffect(() => {
    if (
      !practiceRequestToken ||
      practiceRequestToken === lastPracticeRequestRef.current
    ) {
      return;
    }
    lastPracticeRequestRef.current = practiceRequestToken;
    setCollapsed(false);
    if (suggestedPractice.length === 0) return;
    setPracticeItems(suggestedPractice);
    setMode('practice');
    setAnswers({});
    setFeedback(null);
  }, [practiceRequestToken, suggestedPractice]);

  if (!spec || !analysis) return null;

  const currentItems =
    mode === 'diagnostic'
      ? spec.items
      : mode === 'practice'
        ? practiceItems
        : mode === 'reassessment'
          ? reassessmentItems
          : [];

  const startDiagnostic = () => {
    setMode('diagnostic');
    setAnswers({});
    setFeedback(null);
  };

  const startPractice = () => {
    if (suggestedPractice.length === 0) return;
    setPracticeItems(suggestedPractice);
    setMode('practice');
    setAnswers({});
    setFeedback(null);
  };

  const startReassessment = () => {
    if (reassessmentItems.length === 0) return;
    setMode('reassessment');
    setAnswers({});
    setFeedback(null);
  };

  const showSummary = () => {
    setMode('summary');
    setAnswers({});
    setFeedback(null);
  };

  const handleAnswer = (itemId, value) => {
    setAnswers((previous) => ({ ...previous, [itemId]: value }));
  };

  const handleSubmit = () => {
    if (!currentItems.length) return;
    const {
      evidence: nextEvidence,
      attempt,
      outcome,
    } = recordAttempt(evidence, {
      items: currentItems,
      answers,
      source: mode,
      at: new Date().toISOString(),
    });

    store.save(courseId, nextEvidence);
    setEvidence(nextEvidence);
    setLastAttempt(attempt);

    if (mode === 'practice') {
      setFeedback(outcome);
      return;
    }

    setFeedback(null);
    setAnswers({});
    setMode('summary');
  };

  const handleSkip = () => {
    if (!currentItems.length) return;
    const { evidence: nextEvidence, attempt } = recordAttempt(evidence, {
      items: currentItems,
      answers: {},
      source: mode,
      at: new Date().toISOString(),
      metadata: { skipped: true },
    });
    store.save(courseId, nextEvidence);
    setEvidence(nextEvidence);
    setLastAttempt(attempt);
    setFeedback(null);
    setAnswers({});
    setMode('summary');
  };

  return (
    <DiagnosticCheckView
      courseId={courseId}
      spec={spec}
      mode={mode}
      collapsed={collapsed}
      analysis={analysis}
      evidenceSummary={evidenceSummary}
      items={currentItems}
      answers={answers}
      feedback={feedback}
      practiceCount={suggestedPractice.length}
      canReassess={evidenceSummary.attempts > 0 && reassessmentItems.length > 0}
      lastAttempt={lastAttempt}
      onToggle={() => setCollapsed((value) => !value)}
      onAnswer={handleAnswer}
      onSubmit={handleSubmit}
      onSkip={handleSkip}
      onStartDiagnostic={startDiagnostic}
      onStartPractice={startPractice}
      onStartReassessment={startReassessment}
      onShowSummary={showSummary}
    />
  );
};

export default DiagnosticCheck;
