import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getRequiredActivityIds } from '../../content/index.mjs';
import { createActivityProgressStore } from '../../learning/activityProgress.mjs';
import ActivityRenderer from './ActivityRenderer';
import ContentBlockRenderer from './ContentBlockRenderer';

const LEVEL_STYLES = {
  Beginner: 'bg-success-soft text-success',
  Intermediate: 'bg-warning-soft text-warning',
  Advanced: 'bg-danger-soft text-danger',
};

function MissingLesson() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="rounded-xl border border-warning/40 bg-warning-soft p-6">
        <h1 className="text-xl font-bold text-warning">Lesson unavailable</h1>
        <p className="mt-2 text-sm text-warning">
          This lesson is missing its content or course context.
        </p>
        <Link
          to="/dashboard"
          className="mt-4 inline-block text-sm font-semibold text-primary-700"
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export default function StructuredLesson({
  context,
  completed = false,
  onComplete,
  readinessPanel = null,
}) {
  const course = context?.course;
  const lesson = context?.lesson;
  const store = useMemo(() => {
    let storage = null;
    try {
      storage =
        typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
    } catch {
      storage = null;
    }
    return createActivityProgressStore(storage);
  }, []);
  const activityIds = useMemo(
    () => (lesson?.activities || []).map((activity) => activity.id),
    [lesson]
  );
  const [completedActivityIds, setCompletedActivityIds] = useState(
    () => new Set(store.load(course?.id, lesson?.id, activityIds))
  );

  if (!context || !course || !lesson) return <MissingLesson />;

  const requiredActivityIds = getRequiredActivityIds(lesson);
  const requiredActivities = requiredActivityIds
    .map((id) => lesson.activities.find((activity) => activity.id === id))
    .filter(Boolean);
  const completedRequiredCount = requiredActivityIds.filter((id) =>
    completedActivityIds.has(id)
  ).length;
  const effectiveCompletedCount = completed
    ? requiredActivityIds.length
    : completedRequiredCount;
  const allRequiredComplete =
    completed ||
    requiredActivityIds.length === 0 ||
    completedRequiredCount === requiredActivityIds.length;

  function markActivityComplete(activityId) {
    setCompletedActivityIds((current) => {
      if (current.has(activityId)) return current;
      const next = new Set(current).add(activityId);
      store.save(course.id, lesson.id, [...next]);
      return next;
    });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-ink-subtle">
        <Link to="/dashboard" className="hover:text-primary-600">
          Dashboard
        </Link>
        <span>/</span>
        <Link
          to={`/course/${course.id}`}
          className="hover:text-primary-600"
        >
          {course.title}
        </Link>
        <span>/</span>
        <span className="text-ink-muted">{lesson.title}</span>
      </nav>

      <header className="rounded-2xl bg-surface p-8 shadow-lg mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-700">
            {context.module?.title || 'Lesson'}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              LEVEL_STYLES[lesson.level] || 'bg-line-subtle text-ink-muted'
            }`}
          >
            {lesson.level}
          </span>
          <span className="text-sm text-ink-subtle">
            Lesson {context.lessonNumber} of {context.totalLessons}
          </span>
          <span className="text-sm text-ink-subtle">· {lesson.duration}</span>
        </div>
        <h1 className="text-3xl font-bold text-ink mb-3">
          {lesson.title}
        </h1>
        <p className="max-w-3xl text-ink-muted leading-7">{lesson.summary}</p>
        {context.objectives.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {context.objectives.map((objective) => (
              <span
                key={objective.id}
                className="rounded-full bg-line-subtle px-3 py-1 text-xs text-ink-muted"
              >
                {objective.title}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {context.prerequisiteLessons.length > 0 && (
            <section className="rounded-xl border border-info-soft bg-info-soft p-5">
              <h2 className="font-semibold text-info">
                Recommended prerequisites
              </h2>
              <p className="mt-1 text-sm text-info">
                This lesson builds on earlier work. Review these lessons if the
                ideas feel unfamiliar.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {context.prerequisiteLessons.map((prerequisite) => (
                  <Link
                    key={prerequisite.id}
                    to={`/course/${course.id}/lesson/${prerequisite.id}`}
                    className="rounded-full bg-surface px-3 py-1 text-sm font-medium text-info shadow-sm hover:bg-info-soft"
                  >
                    {prerequisite.title}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {readinessPanel}

          <section>
            <h2 className="text-2xl font-bold text-ink mb-4">
              Lesson content
            </h2>
            <div className="space-y-5">
              {(lesson.blocks || []).map((block) => (
                <ContentBlockRenderer key={block.id} block={block} />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-2xl font-bold text-ink">
                Practice and assessment
              </h2>
              <span className="text-sm text-ink-subtle">
                {effectiveCompletedCount} of {requiredActivityIds.length}{' '}
                required activities complete
              </span>
            </div>
            <div className="space-y-5">
              {lesson.activities.map((activity) => (
                <ActivityRenderer
                  key={activity.id}
                  activity={activity}
                  course={course}
                  scope={`${course.id}:${lesson.id}`}
                  completed={completed || completedActivityIds.has(activity.id)}
                  onComplete={() => markActivityComplete(activity.id)}
                />
              ))}
            </div>
          </section>

          <section
            className={`rounded-xl p-6 shadow-md ${
              completed
                ? 'border border-success/40 bg-success-soft'
                : 'border border-line bg-surface'
            }`}
          >
            {completed ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-success">
                    Lesson complete
                  </h2>
                  <p className="text-sm text-success">
                    Your progress and activity results are saved for this
                    course.
                  </p>
                </div>
                {context.nextLesson ? (
                  <Link
                    to={`/course/${course.id}/lesson/${context.nextLesson.id}`}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-ink-inverse hover:bg-accent-strong"
                  >
                    Next: {context.nextLesson.title}
                  </Link>
                ) : (
                  <Link
                    to={`/course/${course.id}`}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-ink-inverse hover:bg-accent-strong"
                  >
                    Back to course
                  </Link>
                )}
              </div>
            ) : allRequiredComplete ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-ink">
                    Ready to complete
                  </h2>
                  <p className="text-sm text-ink-muted">
                    Every required activity is complete. Mark the lesson when
                    you are ready.
                  </p>
                </div>
                {onComplete && (
                  <button
                    type="button"
                    onClick={onComplete}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-ink-inverse hover:bg-accent-strong"
                  >
                    Mark lesson complete
                  </button>
                )}
              </div>
            ) : (
              <div>
                <h2 className="text-lg font-bold text-ink">
                  Finish the required activities
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Complete each item below to unlock lesson completion.
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                  {requiredActivities.map((activity) => {
                    const done = completedActivityIds.has(activity.id);
                    return (
                      <li
                        key={activity.id}
                        className="flex items-center gap-2 text-ink-muted"
                      >
                        <span
                          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                            done
                              ? 'bg-success-soft text-success'
                              : 'bg-line-subtle text-ink-subtle'
                          }`}
                        >
                          {done ? '✓' : '•'}
                        </span>
                        {activity.title}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <div className="rounded-xl bg-surface p-6 shadow-md lg:sticky lg:top-24">
            <h2 className="text-lg font-bold text-ink mb-3">
              Activity progress
            </h2>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-line-subtle">
              <div
                className="h-full bg-primary-500 transition-all"
                style={{
                  width: `${
                    requiredActivityIds.length === 0
                      ? 100
                      : (effectiveCompletedCount /
                          requiredActivityIds.length) *
                        100
                  }%`,
                }}
              />
            </div>
            <p className="text-sm text-ink-muted">
              {effectiveCompletedCount} of {requiredActivityIds.length} required
              activities complete
            </p>

            <div className="mt-6 border-t border-line pt-5">
              <h3 className="font-semibold text-ink mb-3">
                Learning objectives
              </h3>
              <ul className="space-y-3 text-sm text-ink-muted">
                {context.objectives.map((objective) => (
                  <li key={objective.id}>
                    <p className="font-medium text-ink">
                      {objective.title}
                    </p>
                    <p className="mt-1 text-xs leading-5">
                      {objective.description}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5 text-sm">
              {context.previousLesson ? (
                <Link
                  to={`/course/${course.id}/lesson/${context.previousLesson.id}`}
                  className="font-medium text-primary-700 hover:text-primary-800"
                >
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              {completed && context.nextLesson && (
                <Link
                  to={`/course/${course.id}/lesson/${context.nextLesson.id}`}
                  className="font-medium text-primary-700 hover:text-primary-800"
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
