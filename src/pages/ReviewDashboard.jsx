import { useEffect, useMemo, useState } from 'react';
import { AuthService } from '../utils/auth';
import { getCourseById } from '../data/mockCourseData';
import {
  getCourseLearningMap,
  getCourseReviewItems,
} from '../data/courseLearningMaps';
import { buildReviewActivities } from '../learning/activeRecall.mjs';
import {
  buildReviewQueue,
  createEmptyReviewState,
  getReviewSummary,
  mergeReviewQueues,
} from '../learning/reviewScheduler.mjs';
import {
  REVIEW_UPDATED_EVENT,
  createReviewStore,
} from '../learning/reviewStore.mjs';
import {
  EVIDENCE_UPDATED_EVENT,
  createEvidenceStore,
  loadEvidenceOrDefault,
} from '../learning/evidenceStore.mjs';
import ReviewDashboardView from '../components/learning/ReviewDashboardView';

const ReviewDashboard = () => {
  const user = AuthService.getCurrentUser();
  const courseIds = user?.enrolledCourses || [];
  const courseKey = courseIds.join('|');
  const [revision, setRevision] = useState(0);

  const reviewStore = useMemo(
    () => createReviewStore(globalThis.localStorage),
    []
  );
  const evidenceStore = useMemo(
    () => createEvidenceStore(globalThis.localStorage),
    []
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(REVIEW_UPDATED_EVENT, refresh);
    window.addEventListener(EVIDENCE_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(REVIEW_UPDATED_EVENT, refresh);
      window.removeEventListener(EVIDENCE_UPDATED_EVENT, refresh);
    };
  }, []);

  const plan = useMemo(() => {
    const now = new Date().toISOString();
    const queues = courseIds
      .map((courseId) => {
        const course = getCourseById(courseId);
        const courseMap = getCourseLearningMap(courseId);
        if (!course || !courseMap) return null;

        const activities = buildReviewActivities({
          courseMap,
          items: getCourseReviewItems(courseId),
        }).map((activity) => ({
          ...activity,
          courseTitle: course.title,
        }));
        const reviewState =
          reviewStore.load(courseId) || createEmptyReviewState();
        const evidence = loadEvidenceOrDefault(evidenceStore, courseId);

        return buildReviewQueue({
          activities,
          reviewState,
          evidence,
          now,
        });
      })
      .filter(Boolean);

    const merged = mergeReviewQueues(queues);
    return {
      ...merged,
      summary: getReviewSummary(merged),
      now,
    };
  }, [courseKey, reviewStore, evidenceStore, revision]);

  return (
    <ReviewDashboardView
      due={plan.due}
      upcoming={plan.upcoming}
      summary={plan.summary}
      activityCount={plan.activityCount}
      unavailableCount={plan.unavailableCount}
    />
  );
};

export default ReviewDashboard;
