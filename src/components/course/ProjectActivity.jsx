import { useState } from 'react';
import { RUBRIC_LEVELS } from '../../content/index.mjs';

const LEVEL_LABELS = {
  emerging: 'Emerging',
  proficient: 'Proficient',
  advanced: 'Advanced',
};

function BulletList({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <ul className="space-y-2 text-sm text-ink-muted list-disc pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export default function ProjectActivity({ activity, completed, onComplete }) {
  const rubric = Array.isArray(activity?.rubric) ? activity.rubric : [];
  const [ratings, setRatings] = useState({});
  const [reflection, setReflection] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (rubric.length === 0) {
    return (
      <p className="rounded-lg bg-warning-soft p-4 text-sm text-warning">
        This project is missing its rubric.
      </p>
    );
  }

  const allRated = rubric.every((criterion) => ratings[criterion.id]);
  const canSubmit = allRated && reflection.trim().length > 0 && !completed;

  function submit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitted(true);
    onComplete?.();
  }

  if (completed || submitted) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-success/40 bg-success-soft p-4 text-sm text-success">
          <p className="font-semibold">Project self-review recorded</p>
          <p className="mt-1">
            Your ratings and reflection are saved for this activity.
          </p>
        </div>
        <div className="rounded-lg bg-line-subtle p-4 text-sm text-ink-muted">
          <p className="font-semibold mb-2">Rubric self-assessment</p>
          <ul className="space-y-1">
            {rubric.map((criterion) => (
              <li key={criterion.id}>
                {criterion.title}:{' '}
                {LEVEL_LABELS[ratings[criterion.id]] || 'Not rated'}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {activity.brief && (
        <p className="text-sm leading-6 text-ink-muted">{activity.brief}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="font-semibold text-ink mb-2">Requirements</h4>
          <BulletList items={activity.requirements} />
        </div>
        <div>
          <h4 className="font-semibold text-ink mb-2">Deliverables</h4>
          <BulletList items={activity.deliverables} />
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-semibold text-ink">
          Self-assess against the rubric
        </h4>
        {rubric.map((criterion) => (
          <fieldset
            key={criterion.id}
            className="rounded-lg border border-line p-4"
          >
            <legend className="px-1 font-medium text-ink">
              {criterion.title}
            </legend>
            {criterion.description && (
              <p className="mb-3 text-sm text-ink-muted">
                {criterion.description}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              {RUBRIC_LEVELS.map((level) => {
                const selected = ratings[criterion.id] === level;
                return (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setRatings((current) => ({
                        ...current,
                        [criterion.id]: level,
                      }))
                    }
                    className={`rounded-lg border p-3 text-left text-xs transition ${
                      selected
                        ? 'border-primary-500 bg-primary-50 text-primary-800'
                        : 'border-line bg-surface text-ink-muted hover:border-line'
                    }`}
                  >
                    <span className="block font-semibold">
                      {LEVEL_LABELS[level]}
                    </span>
                    <span className="mt-1 block">
                      {criterion.levels?.[level] || ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <label className="block text-sm font-medium text-ink">
        {activity.reflectionPrompt || 'Reflection'}
        <textarea
          value={reflection}
          onChange={(event) => setReflection(event.target.value)}
          rows={4}
          placeholder="Explain your choices and one improvement..."
          className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-primary-500 focus:outline-none"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-ink-inverse disabled:cursor-not-allowed disabled:bg-line"
        >
          Submit project review
        </button>
        {!allRated && (
          <span className="text-xs text-ink-subtle">
            Rate every rubric criterion first.
          </span>
        )}
        {allRated && reflection.trim().length === 0 && (
          <span className="text-xs text-ink-subtle">
            Add a short reflection to submit.
          </span>
        )}
      </div>
    </form>
  );
}
