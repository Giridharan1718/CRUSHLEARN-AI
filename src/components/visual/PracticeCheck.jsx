import { useId, useState } from 'react';
import { evaluatePracticeAnswer } from '../../visual/visualSchema.mjs';

const PracticeCheck = ({ explanation }) => {
  const groupName = useId();
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const practice = explanation?.practice;
  if (!practice) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (selected === null) {
      setError('Choose an answer before checking it.');
      return;
    }

    const evaluation = evaluatePracticeAnswer(explanation, selected);
    if (!evaluation.ok) {
      setError(evaluation.errors[0] || 'The answer could not be checked.');
      return;
    }

    setError('');
    setResult(evaluation);
  };

  const reset = () => {
    setSelected(null);
    setResult(null);
    setError('');
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend className="break-words text-lg font-semibold text-ink">
            {practice.question}
          </legend>
          <p className="mt-1 text-sm text-ink-muted">
            Predict first, then check your reasoning. Feedback stays in this view
            and does not update course mastery.
          </p>

          <div className="mt-4 space-y-2">
            {practice.options.map((option, index) => (
              <label
                key={option}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${
                  selected === index
                    ? 'border-primary-400 bg-primary-50'
                    : 'border-line hover:bg-line-subtle'
                }`}
              >
                <input
                  type="radio"
                  name={groupName}
                  value={index}
                  checked={selected === index}
                  onChange={() => {
                    setSelected(index);
                    setResult(null);
                    setError('');
                  }}
                  className="mt-1 h-4 w-4 border-line text-primary-600 focus:ring-primary-500"
                />
                <span className="break-words text-ink">{option}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-danger">
            {error}
          </p>
        )}

        {result && (
          <div
            role="status"
            className={`mt-5 rounded-xl border p-4 text-sm ${
              result.isCorrect
                ? 'border-success/40 bg-success-soft text-success'
                : 'border-warning/40 bg-warning-soft text-warning'
            }`}
          >
            <p className="font-semibold">
              {result.isCorrect ? 'Correct' : 'Not quite yet'}
            </p>
            {!result.isCorrect && (
              <p className="mt-1">
                Correct answer: {practice.options[result.correctIndex]}
              </p>
            )}
            <p className="mt-2">{result.explanation}</p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-ink-inverse hover:bg-accent-strong"
          >
            Check answer
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-muted hover:bg-line-subtle"
          >
            Try again
          </button>
        </div>
      </form>

      {practice.hint && (
        <details className="mt-4 text-sm text-ink-muted">
          <summary className="cursor-pointer font-medium text-ink-muted">
            Need a hint?
          </summary>
          <p className="mt-2">{practice.hint}</p>
        </details>
      )}
    </div>
  );
};

export default PracticeCheck;
