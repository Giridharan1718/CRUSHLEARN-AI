import { useState } from 'react';

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export default function ExerciseActivity({ activity, completed, onComplete }) {
  const acceptedAnswers = Array.isArray(activity?.acceptedAnswers)
    ? activity.acceptedAnswers
    : [];
  const [value, setValue] = useState('');
  const [result, setResult] = useState(null);

  if (!activity?.prompt) {
    return (
      <p className="rounded-lg bg-warning-soft p-4 text-sm text-warning">
        This exercise is missing a prompt.
      </p>
    );
  }

  function check(event) {
    event.preventDefault();
    if (completed) return;
    const normalizedValue = normalize(value);
    const passed =
      normalizedValue.length > 0 &&
      acceptedAnswers.some((answer) => normalize(answer) === normalizedValue);
    setResult(passed);
    if (passed) onComplete?.();
  }

  if (completed) {
    return (
      <div className="rounded-lg border border-success/40 bg-success-soft p-4 text-sm text-success">
        <p className="font-semibold">Exercise completed</p>
        <p className="mt-1">
          {activity.explanation || 'You answered this exercise correctly.'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={check} className="space-y-3">
      <label className="block text-sm font-medium text-ink">
        {activity.prompt}
        <input
          type="text"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setResult(null);
          }}
          placeholder={activity.placeholder || 'Type your answer...'}
          className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-primary-500 focus:outline-none"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={value.trim().length === 0}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-ink-inverse disabled:cursor-not-allowed disabled:bg-line"
        >
          Check answer
        </button>
        {result === false && (
          <span role="status" className="text-sm text-warning">
            That answer is not quite right. Try again.
          </span>
        )}
      </div>

      {result === true && (
        <p
          role="status"
          className="rounded-lg border border-success/40 bg-success-soft p-4 text-sm text-success"
        >
          <span className="font-semibold">Correct.</span>{' '}
          {activity.explanation || ''}
        </p>
      )}
    </form>
  );
}
