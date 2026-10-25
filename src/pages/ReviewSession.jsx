import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCourseById } from '../data/mockCourseData';
import {
  getCourseLearningMap,
  getCourseReviewItems,
} from '../data/courseLearningMaps';
import {
  buildReviewActivities,
  createRecallItem,
  evaluateRecall,
} from '../learning/activeRecall.mjs';
import {
  createEmptyReviewState,
  scheduleReview,
} from '../learning/reviewScheduler.mjs';
import {
  createReviewStore,
  loadReviewOrDefault,
} from '../learning/reviewStore.mjs';
import {
  createEvidenceStore,
  loadEvidenceOrDefault,
} from '../learning/evidenceStore.mjs';
import {
  EVIDENCE_SOURCES,
  recordAttempt,
} from '../learning/gapDetection.mjs';
import ReviewSessionView from '../components/learning/ReviewSessionView';

const ReviewSession = () => {
  const { courseId, conceptId } = useParams();
  const course = getCourseById(courseId);
  const courseMap = getCourseLearningMap(courseId);
  const courseTitle = course ? course.title : courseId || 'Course';

  const reviewStore = useMemo(
    () => createReviewStore(globalThis.localStorage),
    []
  );
  const evidenceStore = useMemo(
    () => createEvidenceStore(globalThis.localStorage),
    []
  );
  const activities = useMemo(() => {
    if (!courseMap) return [];
    return buildReviewActivities({
      courseMap,
      items: getCourseReviewItems(courseId),
    });
  }, [courseMap, courseId]);

  const activity = activities.find((entry) => entry.id === conceptId) || null;

  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);
  const [savedRecord, setSavedRecord] = useState(null);
  const [saving, setSaving] = useState(false);

  if (!activity) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-warning/40 bg-warning-soft p-6">
          <h1 className="text-2xl font-bold text-warning">
            This review is unavailable
          </h1>
          <p className="mt-2 text-sm text-warning">
            The concept or its source question is missing, so it is not being
            scheduled. Saved schedule data is left untouched.
          </p>
          <Link
            to="/review"
            className="mt-4 inline-flex rounded-lg bg-primary-600 px-4 py-2 font-semibold text-ink-inverse hover:bg-accent-strong"
          >
            Back to review dashboard
          </Link>
        </div>
      </div>
    );
  }

  const handleCheck = () => {
    if (!answer.trim()) return;
    setResult(evaluateRecall(activity, answer));
  };

  const handleDontKnow = () => {
    setAnswer('');
    setResult(evaluateRecall(activity, ''));
  };

  const handleComplete = (selfAssessment) => {
    if (!result || savedRecord || saving) return;
    setSaving(true);

    const now = new Date().toISOString();
    const recallItem = createRecallItem(activity);
    const evidence = loadEvidenceOrDefault(evidenceStore, courseId);
    const outcome = result.isCorrect ? 'correct' : 'incorrect';
    const { evidence: nextEvidence } = recordAttempt(evidence, {
      items: [recallItem],
      answers: { [recallItem.id]: answer },
      source: EVIDENCE_SOURCES.REVIEW,
      at: now,
      metadata: {
        conceptId: activity.id,
        review: true,
        outcome,
        selfAssessment: selfAssessment || null,
      },
    });
    evidenceStore.save(courseId, nextEvidence, now);

    const reviewState = loadReviewOrDefault(reviewStore, courseId);
    const { state: nextReviewState, record } = scheduleReview({
      state: reviewState || createEmptyReviewState(),
      concept: activity,
      outcome,
      selfAssessment,
      now,
    });
    reviewStore.save(courseId, nextReviewState, now);
    setSavedRecord(record);
    setSaving(false);
  };

  return (
    <ReviewSessionView
      activity={activity}
      courseTitle={courseTitle}
      phase={savedRecord ? 'saved' : result ? 'checked' : 'recall'}
      answer={answer}
      result={result}
      savedRecord={savedRecord}
      onAnswerChange={setAnswer}
      onCheck={handleCheck}
      onDontKnow={handleDontKnow}
      onComplete={handleComplete}
    />
  );
};

export default ReviewSession;
