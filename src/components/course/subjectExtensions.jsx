import { useState } from 'react';
import { registerActivityRenderer } from './activityRegistry';

function normalize(value) {
  return String(value ?? '').trim();
}

// Example subject-specific activity type. The Python course declares
// `python_trace` in its content and this module supplies the React renderer.
// Adding another subject-specific type follows the same pattern without
// changing the generic activity renderer.
export function PythonTraceActivity({ activity, completed, onComplete }) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState(null);

  if (!activity?.code || activity?.expectedOutput === undefined) {
    return (
      <p className="rounded-lg bg-warning-soft p-4 text-sm text-warning">
        This Python trace activity is missing its code or expected output.
      </p>
    );
  }

  function check(event) {
    event.preventDefault();
    if (completed) return;
    const passed = normalize(value) === normalize(activity.expectedOutput);
    setResult(passed);
    if (passed) onComplete?.();
  }

  if (completed) {
    return (
      <div className="rounded-lg border border-success/40 bg-success-soft p-4 text-sm text-success">
        <p className="font-semibold">Python trace completed</p>
        <p className="mt-1">
          {activity.explanation || 'You predicted the output correctly.'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={check} className="space-y-4">
      {activity.instructions && (
        <p className="text-sm text-ink-muted">{activity.instructions}</p>
      )}
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm text-slate-100">
        <code>{activity.code}</code>
      </pre>
      <label className="block text-sm font-medium text-ink">
        Expected output
        <input
          type="text"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setResult(null);
          }}
          placeholder="Type what the program prints..."
          className="mt-2 w-full rounded-lg border border-line px-3 py-2 font-mono text-sm text-ink focus:border-primary-500 focus:outline-none"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={value.trim().length === 0}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-ink-inverse disabled:cursor-not-allowed disabled:bg-line"
        >
          Check output
        </button>
        {result === false && (
          <span role="status" className="text-sm text-warning">
            That is not the output yet. Trace the loop one iteration at a time.
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

registerActivityRenderer('python_trace', PythonTraceActivity);
