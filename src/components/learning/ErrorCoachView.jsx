import { getStateColor, getStateLabel } from '../../utils/evidenceClassification.mjs';

const PRIMARY_BUTTON =
  'inline-flex items-center justify-center px-4 py-2 rounded-lg bg-accent text-ink-inverse font-semibold hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed';
const SECONDARY_BUTTON =
  'inline-flex items-center justify-center px-4 py-2 rounded-lg border border-line text-ink font-semibold hover:bg-line-subtle disabled:opacity-50 disabled:cursor-not-allowed';

const EVIDENCE_BADGES = {
  insufficient: {
    label: 'Insufficient evidence',
    className: 'bg-warning-soft text-warning',
  },
  direct: {
    label: 'Direct observation',
    className: 'bg-info-soft text-info',
  },
  supported: {
    label: 'Supported by evidence',
    className: 'bg-warning-soft text-warning',
  },
};

function AnswerField({ item, name, value, onChange, disabled }) {
  if (item.kind === 'single_choice') {
    return (
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-base font-semibold text-ink mb-2">
          {item.prompt}
        </legend>
        {item.options.map((option, index) => (
          <label
            key={`${item.id}-${index}`}
            className={`flex items-start gap-3 rounded-lg border px-3 py-2 cursor-pointer ${
              value === index
                ? 'border-primary-500 bg-primary-50'
                : 'border-line hover:bg-line-subtle'
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={value === index}
              onChange={() => onChange(index)}
              className="mt-1"
            />
            <span className="text-sm text-ink">{option}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  return (
    <div>
      <label
        htmlFor={`${name}-input`}
        className="block text-base font-semibold text-ink mb-2"
      >
        {item.prompt}
      </label>
      <input
        id={`${name}-input`}
        type="text"
        value={value === null || value === undefined ? '' : value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type your answer..."
        className="w-full rounded-lg border border-line px-4 py-3 focus:border-primary-500 focus:outline-none"
      />
    </div>
  );
}

function PrerequisiteCheck({ analysis }) {
  const check = analysis.prerequisiteCheck;
  if (!check || !check.checked) return null;
  if (check.status === 'none') {
    return (
      <p className="text-sm text-ink-muted">
        <span className="font-semibold">Prerequisite check:</span>{' '}
        {check.summary}
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-line bg-line-subtle p-3">
      <p className="text-sm font-semibold text-ink">Prerequisite check</p>
      <p className="text-sm text-ink-muted mt-1">{check.summary}</p>
      {check.objectives.length > 0 && (
        <ul className="mt-2 space-y-1">
          {check.objectives.map((objective) => (
            <li
              key={objective.objectiveId}
              className="flex flex-wrap items-center gap-2 text-sm text-ink-muted"
            >
              <span>{objective.title}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getStateColor(
                  objective.state
                )}`}
              >
                {getStateLabel(objective.state)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdaptiveExercise({ item, name, selected, result, alternativesAvailable, onSelect, onSubmit, onTryAnotherExercise, onBack }) {
  return (
    <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h4 className="font-bold text-ink">Different exercise</h4>
        <span className="text-xs text-ink-muted">
          Same objective · new prompt
        </span>
      </div>

      {result ? (
        <div role="status">
          <p
            className={`text-sm font-semibold ${
              result.isCorrect ? 'text-success' : 'text-warning'
            }`}
          >
            {result.isCorrect
              ? '✅ Correct — the follow-up exercise was answered correctly.'
              : '❌ Not correct yet. This is new evidence, not a verdict.'}
          </p>
          {!result.isCorrect && result.categoryLabel && (
            <p className="text-sm text-ink-muted mt-2">
              <span className="font-semibold">Possible pattern:</span>{' '}
              {result.categoryLabel}. {result.summary}
            </p>
          )}
          {!result.isCorrect && result.feedback && (
            <p className="text-sm text-ink-muted mt-2">{result.feedback}</p>
          )}
          {result.improvement && (
            <p className="mt-3 rounded-lg bg-surface p-3 text-sm text-ink-muted border border-line">
              <span className="font-semibold">Performance check:</span>{' '}
              {result.improvement.note}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {alternativesAvailable && (
              <button
                type="button"
                className={PRIMARY_BUTTON}
                onClick={onTryAnotherExercise}
              >
                Try another exercise
              </button>
            )}
            <button type="button" className={SECONDARY_BUTTON} onClick={onBack}>
              Back to original feedback
            </button>
          </div>
        </div>
      ) : (
        <>
          <AnswerField
            item={item}
            name={name}
            value={selected}
            onChange={onSelect}
            disabled={Boolean(result)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={selected === null || selected === undefined}
              onClick={onSubmit}
            >
              Check this exercise
            </button>
            <button type="button" className={SECONDARY_BUTTON} onClick={onBack}>
              Back to original feedback
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const ErrorCoachView = ({
  courseId,
  analysis,
  mode,
  activeItem,
  selected,
  result,
  alternativesAvailable,
  onTryDifferentExercise,
  onSelect,
  onSubmit,
  onBack,
}) => {
  if (!analysis || analysis.isCorrect) return null;
  const badge =
    EVIDENCE_BADGES[analysis.evidenceStatus] || EVIDENCE_BADGES.insufficient;
  const recommendation = analysis.recommendation;

  return (
    <div
      className="mt-4 rounded-xl border border-warning/40 bg-warning-soft p-4"
      aria-labelledby="error-coach-heading"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="error-coach-heading" className="font-bold text-ink">
          Error analysis
        </h3>
        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-ink-muted border border-line">
          {analysis.categoryLabel}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      <p className="mt-2 text-sm text-ink-muted">{analysis.summary}</p>
      {analysis.objectiveTitle && (
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          Objective: {analysis.objectiveTitle}
        </p>
      )}

      {analysis.feedback && (
        <p className="mt-2 text-sm text-ink">
          <span className="font-semibold">Targeted feedback:</span>{' '}
          {analysis.feedback}
        </p>
      )}

      {analysis.hint && (
        <p className="mt-2 text-sm text-ink">
          <span className="font-semibold">Hint:</span> {analysis.hint}
        </p>
      )}

      {analysis.misconception && (
        <p className="mt-2 text-sm text-ink-muted">
          <span className="font-semibold">Possible misconception:</span>{' '}
          {analysis.misconception}
        </p>
      )}

      <div className="mt-3">
        <PrerequisiteCheck analysis={analysis} />
      </div>

      <div className="mt-3 rounded-lg bg-surface p-3 border border-line">
        <p className="text-sm font-semibold text-ink">
          Recommendation: {recommendation.label}
        </p>
        <p className="text-sm text-ink-muted mt-1">{recommendation.reason}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {recommendation.type === 'review_prerequisite' &&
            recommendation.lessonId && (
              <a
                className={PRIMARY_BUTTON}
                href={`/course/${courseId}/lesson/${recommendation.lessonId}`}
              >
                Review prerequisite lesson
              </a>
            )}
          {alternativesAvailable && (
            <button
              type="button"
              className={
                recommendation.type === 'review_prerequisite'
                  ? SECONDARY_BUTTON
                  : PRIMARY_BUTTON
              }
              onClick={onTryDifferentExercise}
            >
              {recommendation.type === 'review_prerequisite'
                ? 'Practise prerequisite exercise'
                : 'Try a different exercise'}
            </button>
          )}
          {!alternativesAvailable && (
            <p className="text-sm text-ink-muted">
              No alternative exercise is available for this objective yet. Use
              the retry option above or review the explanation.
            </p>
          )}
        </div>
      </div>

      {mode === 'adaptive' && activeItem && (
        <AdaptiveExercise
          item={activeItem}
          name={`adaptive-${activeItem.id}`}
          selected={selected}
          result={result}
          alternativesAvailable={alternativesAvailable}
          onSelect={onSelect}
          onSubmit={onSubmit}
          onTryAnotherExercise={onTryDifferentExercise}
          onBack={onBack}
        />
      )}
    </div>
  );
};

export default ErrorCoachView;
