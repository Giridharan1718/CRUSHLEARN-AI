import {
  MASTERY_STATUSES,
  PROGRESSION_STATUSES,
} from '../../learning/mastery.mjs';

const STATUS_STYLES = {
  [MASTERY_STATUSES.UNASSESSED]: {
    label: 'Not assessed',
    icon: '⚪',
    className: 'bg-line-subtle text-ink-muted',
  },
  [MASTERY_STATUSES.DEVELOPING]: {
    label: 'Developing',
    icon: '🔵',
    className: 'bg-info-soft text-info',
  },
  [MASTERY_STATUSES.DEMONSTRATED]: {
    label: 'Demonstrated',
    icon: '🟢',
    className: 'bg-success-soft text-success',
  },
  [MASTERY_STATUSES.RETAINED]: {
    label: 'Retained after delay',
    icon: '🛡️',
    className: 'bg-success-soft text-success',
  },
};

const DECISION_STYLES = {
  [PROGRESSION_STATUSES.ALLOWED]: {
    title: 'Progression allowed',
    className: 'border-success/40 bg-success-soft text-success',
  },
  [PROGRESSION_STATUSES.DEFERRED]: {
    title: 'More evidence needed',
    className: 'border-warning/40 bg-warning-soft text-warning',
  },
};

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES[MASTERY_STATUSES.UNASSESSED];
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${style.className}`}
    >
      {style.icon} {style.label}
    </span>
  );
}

function CriteriaCheck({ check }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span
        aria-hidden="true"
        className={`mt-0.5 font-bold ${
          check.passed ? 'text-success' : 'text-warning'
        }`}
      >
        {check.passed ? '✓' : '○'}
      </span>
      <span className={check.passed ? 'text-ink-muted' : 'text-ink'}>
        <span className="font-medium">{check.label}:</span> {check.reason}
      </span>
    </li>
  );
}

function ObjectiveCard({ report }) {
  const coreChecks = report.coreChecks || [];
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold text-ink">{report.title}</h4>
          <p className="mt-1 text-xs text-ink-subtle">
            {report.evidenceSummary}
            {report.evidenceState
              ? ` · shared evidence state: ${report.evidenceState}`
              : ''}
          </p>
        </div>
        <StatusBadge status={report.status} />
      </div>
      <p className="mt-2 text-sm text-ink-muted">{report.reason}</p>
      <details className="mt-3 rounded-lg bg-line-subtle p-3">
        <summary className="cursor-pointer text-xs font-semibold text-ink-muted">
          Criteria and evidence
        </summary>
        <ul className="mt-2 space-y-1.5">
          {coreChecks.map((check) => (
            <CriteriaCheck key={check.id} check={check} />
          ))}
          <li className="flex items-start gap-2 text-sm">
            <span
              aria-hidden="true"
              className={`mt-0.5 font-bold ${
                report.retentionCheck.passed
                  ? 'text-success'
                  : report.retention.required
                    ? 'text-warning'
                    : 'text-ink-subtle'
              }`}
            >
              {report.retentionCheck.passed ? '✓' : '○'}
            </span>
            <span className="text-ink-muted">
              <span className="font-medium">Delayed retention:</span>{' '}
              {report.retentionCheck.reason}
              {!report.retention.required
                ? ' A delayed check is recommended but is not required for this course configuration.'
                : ''}
            </span>
          </li>
        </ul>
      </details>
    </div>
  );
}

const MasteryCheckPanel = ({
  decision,
  onStartRemediation,
  onReviewLesson,
}) => {
  if (!decision) return null;
  const style =
    DECISION_STYLES[decision.status] || DECISION_STYLES[PROGRESSION_STATUSES.DEFERRED];
  const hasPrerequisites = (decision.prerequisites || []).length > 0;
  const retentionPending = (decision.retention?.pendingObjectiveIds || []).length;
  const practiceCount = (decision.remediation?.practiceItemIds || []).length;

  return (
    <section
      className="mt-6 rounded-2xl border border-line bg-line-subtle p-5"
      aria-labelledby="mastery-check-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
            Configurable mastery check
          </p>
          <h3 id="mastery-check-heading" className="mt-1 text-xl font-bold text-ink">
            Progression decision
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-ink-muted">
            {decision.summary}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-sm font-semibold ${style.className}`}
        >
          {style.title}
        </span>
      </div>

      <div className={`mt-4 rounded-lg border p-4 ${style.className}`}>
        <p className="text-sm">{decision.reasons.join(' ')}</p>
      </div>

      <div className="mt-5 space-y-3">
        {(decision.objectives || []).map((report) => (
          <ObjectiveCard key={report.objectiveId} report={report} />
        ))}
      </div>

      {hasPrerequisites && (
        <div className="mt-5">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Prerequisites
          </h4>
          <div className="mt-3 space-y-2">
            {decision.prerequisites.map((report) => (
              <div
                key={report.objectiveId}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line bg-surface p-3"
              >
                <div>
                  <p className="font-medium text-ink">{report.title}</p>
                  <p className="mt-1 text-sm text-ink-muted">{report.reason}</p>
                </div>
                <StatusBadge status={report.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {retentionPending > 0 && (
        <div className="mt-4 rounded-lg border border-info-soft bg-info-soft p-4 text-sm text-info">
          <p className="font-semibold">Delayed retention check</p>
          <p className="mt-1">
            {retentionPending === 1
              ? 'One objective is demonstrated but has not yet had a delayed check.'
              : `${retentionPending} objectives are demonstrated but have not yet had a delayed check.`}{' '}
            {decision.retention.nextEligibleAt
              ? `The first becomes eligible at ${decision.retention.nextEligibleAt}.`
              : 'Complete a due review when one becomes available.'}
          </p>
          <a
            href="/review"
            className="mt-3 inline-flex rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-ink-inverse hover:bg-accent-strong"
          >
            Open review dashboard
          </a>
        </div>
      )}

      {!decision.allowed && decision.remediation?.requiresAssessmentRetake && (
        <div className="mt-4 rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
          <p className="font-semibold">Assessment evidence is still required</p>
          <p className="mt-1">
            Practice cannot replace the configured source requirement. Retake
            this lesson's assessment below, or revisit the linked prerequisite
            lesson when the missing evidence belongs to a prerequisite.
          </p>
        </div>
      )}

      {!decision.allowed && (
        <div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-4">
          {practiceCount > 0 && onStartRemediation && (
            <button
              type="button"
              onClick={() =>
                onStartRemediation(decision.remediation.objectiveIds)
              }
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-ink-inverse hover:bg-accent-strong"
            >
              Open targeted practice ({practiceCount}{' '}
              {practiceCount === 1 ? 'question' : 'questions'})
            </button>
          )}
          {onReviewLesson && (
            <button
              type="button"
              onClick={onReviewLesson}
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface"
            >
              Review this lesson
            </button>
          )}
          {(decision.remediation?.prerequisiteLessons || []).map((entry) =>
            entry.lessonId ? (
              <a
                key={entry.objectiveId}
                href={`/course/${decision.courseId}/lesson/${entry.lessonId}`}
                className="rounded-lg border border-primary-300 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50"
              >
                Review prerequisite lesson
              </a>
            ) : null
          )}
        </div>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink-muted">
          Why this decision is recorded
        </summary>
        <ul className="mt-2 space-y-1 pl-5 text-sm text-ink-muted">
          <li>
            The decision is derived from the current course evidence, not from
            course completion, time spent or a streak.
          </li>
          <li>
            A single correct answer never satisfies mastery. At least two correct
            answers on different questions are required, plus the configured
            recent accuracy and source requirements.
          </li>
          <li>
            The latest decision is saved separately from journey progress so its
            reasons can be reviewed later.
          </li>
        </ul>
      </details>
    </section>
  );
};

export default MasteryCheckPanel;
