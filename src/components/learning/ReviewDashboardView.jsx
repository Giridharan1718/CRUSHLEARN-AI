import { Link } from 'react-router-dom';
import {
  ASSESSMENT_STATES,
  getStateColor,
  getStateLabel,
} from '../../utils/evidenceClassification.mjs';

const PRIORITY_STYLES = {
  high: 'bg-danger-soft text-danger',
  medium: 'bg-warning-soft text-warning',
  low: 'bg-line-subtle text-ink-muted',
};

const PRIORITY_LABELS = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

const CARD = 'rounded-xl border border-line bg-surface p-5 shadow-sm';
const PRIMARY_BUTTON =
  'inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-ink-inverse transition hover:bg-accent-strong';
const SECONDARY_BUTTON =
  'inline-flex items-center justify-center rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink transition hover:bg-line-subtle';

function dueLabel(item) {
  if (item.isNew) return 'New concept';
  if (item.overdueDays > 0) {
    return `Overdue by ${item.overdueDays} ${item.overdueDays === 1 ? 'day' : 'days'}`;
  }
  return 'Due now';
}

function upcomingLabel(item) {
  if (item.daysUntilDue <= 0) return 'Due now';
  return `In ${item.daysUntilDue} ${item.daysUntilDue === 1 ? 'day' : 'days'}`;
}

function EvidenceBadge({ item }) {
  const state = item.objectiveState || ASSESSMENT_STATES.NOT_ASSESSED;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getStateColor(
        state
      )}`}
    >
      {state === ASSESSMENT_STATES.NOT_ASSESSED
        ? 'No evidence yet'
        : getStateLabel(state)}
    </span>
  );
}

function DueReviewCard({ item }) {
  return (
    <article className={CARD}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.low
              }`}
            >
              {PRIORITY_LABELS[item.priority] || 'Review'}
            </span>
            <span className="rounded-full bg-info-soft px-2.5 py-1 text-xs font-semibold text-info">
              {dueLabel(item)}
            </span>
            {item.weakEvidence && (
              <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">
                Weak evidence priority
              </span>
            )}
          </div>

          <h3 className="text-lg font-bold text-ink">{item.title}</h3>
          <p className="mt-1 text-sm text-ink-muted">
            {item.courseTitle}
            {item.objectiveTitle ? ` · ${item.objectiveTitle}` : ''}
          </p>
          <p className="mt-1 text-xs text-ink-subtle">
            Lesson {item.lessonId || 'not specified'}
            {item.sourceItemId ? ` · based on question ${item.sourceItemId}` : ''}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <EvidenceBadge item={item} />
            {item.objectiveState !== ASSESSMENT_STATES.NOT_ASSESSED && (
              <span className="text-xs text-ink-subtle">
                {item.evidenceSummary}
              </span>
            )}
          </div>
          {item.evidenceReason && (
            <p className="mt-2 text-sm text-ink-muted">{item.evidenceReason}</p>
          )}
          {item.lastOutcome && (
            <p className="mt-2 text-xs text-ink-subtle">
              Last recall:{' '}
              {item.lastOutcome === 'correct' ? 'correct' : 'not correct yet'}
              {item.lastSelfAssessment
                ? ` · rated ${item.lastSelfAssessment}`
                : ''}
            </p>
          )}
        </div>

        <Link
          to={`/review/${item.courseId}/${item.conceptId}`}
          className={`${PRIMARY_BUTTON} shrink-0`}
        >
          Review now →
        </Link>
      </div>
    </article>
  );
}

function UpcomingReviewRow({ item }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-ink">{item.title}</p>
        <p className="text-sm text-ink-muted">
          {item.courseTitle}
          {item.objectiveTitle ? ` · ${item.objectiveTitle}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm font-medium text-ink-muted">
          {upcomingLabel(item)}
        </span>
        <Link
          to={`/review/${item.courseId}/${item.conceptId}`}
          className={SECONDARY_BUTTON}
        >
          Open
        </Link>
      </div>
    </li>
  );
}

const ReviewDashboardView = ({
  due = [],
  upcoming = [],
  summary = {},
  activityCount,
  unavailableCount = 0,
}) => {
  const dueCount =
    typeof summary.dueCount === 'number' ? summary.dueCount : due.length;
  const upcomingCount =
    typeof summary.upcomingCount === 'number'
      ? summary.upcomingCount
      : upcoming.length;
  const highPriorityCount =
    typeof summary.highPriorityCount === 'number'
      ? summary.highPriorityCount
      : due.filter((item) => item.priority === 'high').length;
  const totalActivities =
    typeof activityCount === 'number'
      ? activityCount
      : typeof summary.activityCount === 'number'
        ? summary.activityCount
        : due.length + upcoming.length;
  const upcomingPreview = upcoming.slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-wide text-primary-600">
          Active recall
        </p>
        <h1 className="mt-1 text-3xl font-bold text-ink">
          Review what you have learned
        </h1>
        <p className="mt-2 max-w-3xl text-ink-muted">
          Answer from memory first, then check the explanation. Reviews are
          scheduled again later, with priority for weak or outdated evidence.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-ink-subtle">
          One correct answer is useful evidence, not proof of permanent memory.
          The schedule deliberately brings concepts back for another check.
        </p>
      </header>

      <section className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className={CARD}>
          <p className="text-sm font-medium text-ink-subtle">Due now</p>
          <p className="mt-1 text-3xl font-bold text-primary-600">{dueCount}</p>
        </div>
        <div className={CARD}>
          <p className="text-sm font-medium text-ink-subtle">High priority</p>
          <p className="mt-1 text-3xl font-bold text-warning">
            {highPriorityCount}
          </p>
        </div>
        <div className={CARD}>
          <p className="text-sm font-medium text-ink-subtle">Upcoming</p>
          <p className="mt-1 text-3xl font-bold text-info">
            {upcomingCount}
          </p>
        </div>
      </section>

      <section className="mb-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-ink">Due now</h2>
            <p className="text-sm text-ink-subtle">
              Start with the highest-priority concept.
            </p>
          </div>
        </div>

        {due.length > 0 ? (
          <div className="space-y-4">
            {due.map((item) => (
              <DueReviewCard key={`${item.courseId}:${item.conceptId}`} item={item} />
            ))}
          </div>
        ) : (
          <div className={`${CARD} text-center`}>
            {totalActivities === 0 ? (
              <>
                <p className="text-lg font-semibold text-ink">
                  No review activities are available yet.
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  Course authors need to designate review concepts with
                  validated questions before recall can be scheduled.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold text-ink">
                  Nothing due right now.
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  Keep learning or wait for an upcoming review. Reviews never
                  disappear just because they were answered once.
                </p>
              </>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-ink">Upcoming</h2>
            <p className="text-sm text-ink-subtle">
              Future reviews are scheduled from your latest recall and
              self-assessment.
            </p>
          </div>
          {upcomingCount > upcomingPreview.length && (
            <span className="text-sm text-ink-subtle">
              Showing {upcomingPreview.length} of {upcomingCount}
            </span>
          )}
        </div>

        {upcomingPreview.length > 0 ? (
          <ul className="space-y-3">
            {upcomingPreview.map((item) => (
              <UpcomingReviewRow
                key={`${item.courseId}:${item.conceptId}`}
                item={item}
              />
            ))}
          </ul>
        ) : (
          <div className={`${CARD} text-center`}>
            <p className="text-sm text-ink-muted">
              Completed reviews will appear here with their next due date.
            </p>
          </div>
        )}
      </section>

      {unavailableCount > 0 && (
        <p className="mt-6 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
          {unavailableCount === 1
            ? 'One saved review record has no matching reviewable content anymore. It is ignored instead of being scheduled repeatedly.'
            : `${unavailableCount} saved review records have no matching reviewable content anymore. They are ignored instead of being scheduled repeatedly.`}
        </p>
      )}
    </div>
  );
};

export default ReviewDashboardView;
