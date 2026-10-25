import {
  getStateColor,
  getStateIcon,
  getStateLabel,
} from '../../utils/evidenceClassification.mjs';
import {
  READINESS_STATES,
  RECOMMENDATION_TYPES,
} from '../../learning/gapDetection.mjs';

const RECOMMENDATION_LABELS = {
  [RECOMMENDATION_TYPES.REVIEW_PREREQUISITE]: 'Review prerequisite',
  [RECOMMENDATION_TYPES.TARGETED_PRACTICE]: 'Targeted practice',
  [RECOMMENDATION_TYPES.TAKE_DIAGNOSTIC]: 'Take the short check',
  [RECOMMENDATION_TYPES.CONTINUE_LESSON]: 'Continue the lesson',
};

const PRIORITY_STYLES = {
  high: 'bg-danger-soft text-danger',
  medium: 'bg-warning-soft text-warning',
  low: 'bg-line-subtle text-ink-muted',
};

const READINESS_COPY = {
  [READINESS_STATES.READY]: {
    title: 'Ready to continue',
    className: 'border-success/40 bg-success-soft text-success',
  },
  [READINESS_STATES.NEEDS_SUPPORT]: {
    title: 'Support recommended before continuing',
    className: 'border-warning/40 bg-warning-soft text-warning',
  },
  [READINESS_STATES.UNKNOWN]: {
    title: 'More evidence needed',
    className: 'border-info-soft bg-info-soft text-info',
  },
};

const MODE_COPY = {
  diagnostic: {
    title: 'Readiness check',
    submit: 'Record my answers',
    note: 'Unanswered questions are not counted as wrong — they stay not assessed.',
  },
  practice: {
    title: 'Targeted practice',
    submit: 'Check my practice answers',
    note: 'Practice answers are added to your course evidence record.',
  },
  reassessment: {
    title: 'Reassessment',
    submit: 'Record reassessment',
    note: 'New evidence is added to the same course record. Older evidence is kept.',
  },
};

function ObjectiveCard({ result, showPrerequisiteLabel = false }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {showPrerequisiteLabel && (
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Prerequisite
            </p>
          )}
          <h4 className="font-medium text-ink">{result.title}</h4>
        </div>
        <span
          className={`px-2.5 py-1 text-xs font-bold rounded-full ${getStateColor(
            result.state
          )}`}
        >
          {getStateIcon(result.state)} {getStateLabel(result.state)}
        </span>
      </div>
      <p className="mt-2 text-sm text-ink-muted">{result.reason}</p>
      <p className="mt-2 text-xs text-ink-subtle">
        {result.evidenceSummary}
        {result.confidence > 0
          ? ` · evidence confidence: ${result.confidenceLabel}`
          : ''}
      </p>
    </div>
  );
}

function ItemField({ item, index, value, disabled, onChange }) {
  return (
    <fieldset className="rounded-lg border border-line p-4">
      <legend className="px-1 text-sm font-medium text-ink">
        {index + 1}. {item.prompt}
      </legend>
      {item.kind === 'single_choice' ? (
        <div className="mt-3 space-y-2">
          {item.options.map((option, optionIndex) => (
            <label
              key={optionIndex}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                value === optionIndex
                  ? 'border-primary-500 bg-primary-50 text-ink'
                  : 'border-line text-ink-muted hover:border-primary-300'
              } ${disabled ? 'cursor-default opacity-80' : ''}`}
            >
              <input
                type="radio"
                name={`diagnostic-item-${item.id}`}
                value={optionIndex}
                checked={value === optionIndex}
                disabled={disabled}
                onChange={() => onChange(item.id, optionIndex)}
                className="mt-0.5"
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      ) : (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(event) => onChange(item.id, event.target.value)}
          placeholder="Type your answer"
          className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        />
      )}
    </fieldset>
  );
}

function FeedbackCard({ item, index, result }) {
  const correct = result.isCorrect;
  return (
    <div
      className={`rounded-lg border p-4 ${
        correct ? 'border-success/40 bg-success-soft' : 'border-warning/40 bg-warning-soft'
      }`}
    >
      <p className="font-medium text-ink">
        {index + 1}. {item.prompt}
      </p>
      <p className={`mt-2 text-sm font-semibold ${correct ? 'text-success' : 'text-warning'}`}>
        {correct ? '✓ Correct' : '✗ Not quite'}
      </p>
      <p className="mt-1 text-sm text-ink-muted">{result.message}</p>
      {!correct && item.explanation && (
        <p className="mt-2 text-sm text-ink-muted">{item.explanation}</p>
      )}
    </div>
  );
}

const DiagnosticCheckView = ({
  courseId,
  spec,
  mode = 'summary',
  collapsed = false,
  analysis,
  evidenceSummary,
  items = [],
  answers = {},
  feedback = null,
  practiceCount = 0,
  canReassess = false,
  lastAttempt = null,
  onToggle,
  onAnswer,
  onSubmit,
  onStartDiagnostic,
  onStartPractice,
  onStartReassessment,
  onShowSummary,
}) => {
  if (!spec) return null;

  if (collapsed) {
    return (
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-5 py-4 shadow-sm">
        <div>
          <p className="font-semibold text-ink">Readiness check available</p>
          <p className="text-sm text-ink-muted">
            {evidenceSummary.attempts > 0
              ? `${evidenceSummary.attempts} recorded ${
                  evidenceSummary.attempts === 1 ? 'attempt' : 'attempts'
                }. Reopen to see the current evidence.`
              : 'Check prerequisite knowledge or set a starting point. Optional.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-accent-strong"
        >
          Open readiness check
        </button>
      </div>
    );
  }

  if (mode !== 'summary') {
    const copy = MODE_COPY[mode] || MODE_COPY.diagnostic;
    const answeredCount = items.filter((item) => {
      const value = answers[item.id];
      return !(
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '')
      );
    }).length;
    const requireAll = mode === 'practice';
    const submitDisabled =
      requireAll ? answeredCount < items.length : answeredCount === 0;
    const resultByItem = new Map(
      (feedback ? feedback.results : []).map((result) => [result.itemId, result])
    );

    return (
      <section className="mb-8 rounded-2xl border border-primary-100 bg-surface p-6 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
              {spec.title}
            </p>
            <h2 className="mt-1 text-xl font-bold text-ink">{copy.title}</h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              {mode === 'diagnostic' ? spec.instructions : copy.note}
            </p>
          </div>
          <button
            type="button"
            onClick={onShowSummary}
            className="text-sm font-medium text-ink-muted hover:text-ink"
          >
            ← Back
          </button>
        </div>

        {feedback ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-medium text-ink">
              {feedback.correctCount} of {feedback.answeredCount} answered
              correctly
              {feedback.answeredCount < feedback.total
                ? ` · ${feedback.total - feedback.answeredCount} left unassessed`
                : ''}
            </p>
            {items.map((item, index) => (
              <FeedbackCard
                key={item.id}
                item={item}
                index={index}
                result={resultByItem.get(item.id) || { isCorrect: false, message: '' }}
              />
            ))}
            <div className="flex flex-wrap gap-3 pt-2">
              {mode === 'practice' && canReassess && (
                <button
                  type="button"
                  onClick={onStartReassessment}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-accent-strong"
                >
                  Reassess now
                </button>
              )}
              <button
                type="button"
                onClick={onShowSummary}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-muted hover:bg-line-subtle"
              >
                Back to evidence summary
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {items.map((item, index) => (
              <ItemField
                key={item.id}
                item={item}
                index={index}
                value={answers[item.id]}
                onChange={onAnswer}
              />
            ))}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitDisabled}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copy.submit}
              </button>
              <p className="text-xs text-ink-subtle">{copy.note}</p>
            </div>
          </div>
        )}
      </section>
    );
  }

  const noEvidence = evidenceSummary.attempts === 0;
  const readinessCopy =
    READINESS_COPY[analysis.readiness] || READINESS_COPY[READINESS_STATES.UNKNOWN];
  const firstPracticeIndex = analysis.recommendations.findIndex(
    (entry) =>
      entry.type === RECOMMENDATION_TYPES.TARGETED_PRACTICE ||
      entry.type === RECOMMENDATION_TYPES.REVIEW_PREREQUISITE
  );

  return (
    <section className="mb-8 rounded-2xl border border-primary-100 bg-surface p-6 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
              {spec.title}
            </p>
            <span className="rounded-full bg-line-subtle px-2 py-0.5 text-xs font-semibold text-ink-muted">
              Optional
            </span>
          </div>
          <h2 className="mt-1 text-xl font-bold text-ink">Readiness check</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-muted">
            {noEvidence
              ? spec.instructions
              : 'The evidence below decides the recommendations. It is kept separately for this course and updated when you practise or reassess.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="text-sm font-medium text-ink-muted hover:text-ink"
        >
          Hide
        </button>
      </div>

      {lastAttempt && (
        <div className="mt-4 rounded-lg border border-info-soft bg-info-soft px-4 py-3 text-sm text-info">
          {lastAttempt.kind === 'practice' ||
          lastAttempt.kind === 'lesson_practice' ||
          lastAttempt.kind === 'adaptive_practice'
            ? 'Practice recorded. Reassess to see whether the evidence changed.'
            : lastAttempt.kind === 'reassessment' ||
                lastAttempt.kind === 'lesson_assessment'
              ? 'Assessment recorded. The states below include the new evidence.'
              : 'Check recorded. These states are evidence, not a verdict.'}
        </div>
      )}

      {noEvidence ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onStartDiagnostic}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-accent-strong"
          >
            Start short check ({spec.items.length} questions)
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-muted hover:bg-line-subtle"
          >
            Skip for now
          </button>
          <p className="text-sm text-ink-muted">
            {analysis.hasPrerequisites
              ? `${analysis.prerequisiteResults.length} prerequisite ${
                  analysis.prerequisiteResults.length === 1 ? 'objective' : 'objectives'
                } will be checked.`
              : 'No prerequisites are required for this lesson. The check is optional.'}
          </p>
        </div>
      ) : (
        <>
          <div className={`mt-5 rounded-lg border px-4 py-3 ${readinessCopy.className}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{readinessCopy.title}</p>
              <p className="text-xs font-medium">
                Evidence: {evidenceSummary.attempts}{' '}
                {evidenceSummary.attempts === 1 ? 'attempt' : 'attempts'} ·{' '}
                {evidenceSummary.observations}{' '}
                {evidenceSummary.observations === 1 ? 'answer' : 'answers'}
              </p>
            </div>
            <p className="mt-1 text-sm">
              {analysis.readiness === READINESS_STATES.NEEDS_SUPPORT
                ? 'A prerequisite shows repeated incorrect evidence. This is a confirmed difficulty, not a single-answer diagnosis.'
                : analysis.readiness === READINESS_STATES.READY
                  ? 'Not assessed is not a gap; this decision is based only on the evidence recorded so far.'
                  : 'Missing or partial evidence is not a gap. Check or practise to gather more evidence before deciding.'}
            </p>
          </div>

          {analysis.hasPrerequisites && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                Prerequisites
              </h3>
              <div className="mt-3 space-y-3">
                {analysis.prerequisiteResults.map((result) => (
                  <ObjectiveCard
                    key={`prerequisite-${result.objectiveId}`}
                    result={result}
                    showPrerequisiteLabel
                  />
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Lesson objectives
            </h3>
            <div className="mt-3 space-y-3">
              {analysis.lessonObjectiveResults.map((result) => (
                <ObjectiveCard key={`objective-${result.objectiveId}`} result={result} />
              ))}
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Recommended next step
            </h3>
            <div className="mt-3 space-y-3">
              {analysis.recommendations.map((entry, index) => (
                <div
                  key={`${entry.type}-${entry.objectiveId || 'course'}-${index}`}
                  className="rounded-lg border border-line bg-line-subtle p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">
                      {RECOMMENDATION_LABELS[entry.type] || entry.type}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        PRIORITY_STYLES[entry.priority] || PRIORITY_STYLES.low
                      }`}
                    >
                      {entry.priority} priority
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-ink-muted">{entry.reason}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {entry.type === RECOMMENDATION_TYPES.REVIEW_PREREQUISITE &&
                      entry.action.lessonId && (
                        <a
                          href={`/course/${courseId}/lesson/${entry.action.lessonId}`}
                          className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-ink-inverse hover:bg-accent-strong"
                        >
                          Review prerequisite lesson
                        </a>
                      )}
                    {index === firstPracticeIndex && practiceCount > 0 && (
                      <button
                        type="button"
                        onClick={onStartPractice}
                        className="rounded-lg border border-primary-300 px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-50"
                      >
                        Start targeted practice ({practiceCount} questions)
                      </button>
                    )}
                    {entry.type === RECOMMENDATION_TYPES.TAKE_DIAGNOSTIC &&
                      evidenceSummary.attempts === 0 && (
                        <button
                          type="button"
                          onClick={onStartDiagnostic}
                          className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-ink-inverse hover:bg-accent-strong"
                        >
                          Take the short check
                        </button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={onStartDiagnostic}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-line-subtle"
            >
              Retake check
            </button>
            {canReassess && (
              <button
                type="button"
                onClick={onStartReassessment}
                className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-line-subtle"
              >
                Reassess now
              </button>
            )}
            {practiceCount > 0 && firstPracticeIndex < 0 && (
              <button
                type="button"
                onClick={onStartPractice}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-ink-inverse hover:bg-accent-strong"
              >
                Practice these skills
              </button>
            )}
          </div>
        </>
      )}

      <details className="mt-5 rounded-lg border border-line bg-line-subtle p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          How this is decided
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>No evidence means Not Assessed. It is not a gap.</li>
          <li>One incorrect answer is an early signal, never a confirmed gap.</li>
          <li>
            Two or more incorrect answers with no correct evidence confirm
            difficulty; a prerequisite gets a review recommendation.
          </li>
          <li>Recent repeated correct answers demonstrate an objective.</li>
          <li>
            A previously demonstrated objective whose latest answer is wrong gets
            a review recommendation rather than being called a new gap.
          </li>
        </ul>
      </details>
    </section>
  );
};

export default DiagnosticCheckView;
