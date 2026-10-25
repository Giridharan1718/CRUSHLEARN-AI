import { useMemo, useState } from 'react';

const ProcessExplorer = ({ explanation, level = 'intermediate' }) => {
  const steps = explanation?.process?.steps || [];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [visited, setVisited] = useState(() => new Set([0]));

  const selectedStep = steps[selectedIndex] || null;
  const progress = useMemo(
    () => ({
      visited: visited.size,
      total: steps.length,
    }),
    [visited, steps.length]
  );

  if (!selectedStep) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger-soft p-6 text-sm text-danger">
        This process has no steps to display.
      </div>
    );
  }

  const selectStep = (index) => {
    setSelectedIndex(index);
    setVisited((current) => {
      const next = new Set(current);
      next.add(index);
      return next;
    });
  };

  const reset = () => {
    setSelectedIndex(0);
    setVisited(new Set([0]));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink-muted">
            Explore the process
          </p>
          <p className="text-xs text-ink-subtle" aria-live="polite">
            Explored {progress.visited} of {progress.total} steps
          </p>
        </div>

        <ol
          className="space-y-0"
          aria-label={`Process steps for ${explanation.title}`}
        >
          {steps.map((step, index) => {
            const selected = index === selectedIndex;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => selectStep(index)}
                  aria-current={selected ? 'step' : undefined}
                  aria-label={`Step ${index + 1}: ${step.title}`}
                  className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${
                    selected
                      ? 'border-primary-500 bg-primary-50 shadow-sm'
                      : 'border-line bg-surface hover:border-primary-200 hover:bg-line-subtle'
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      selected
                        ? 'bg-accent text-ink-inverse'
                        : visited.has(index)
                          ? 'bg-primary-100 text-primary-700'
                          : 'bg-line-subtle text-ink-muted'
                    }`}
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block break-words font-semibold text-ink">
                      {step.title}
                    </span>
                    <span className="mt-1 block break-words text-sm text-ink-muted">
                      {step.summary}
                    </span>
                  </span>
                </button>
                {index < steps.length - 1 && (
                  <div className="flex h-6 items-center pl-7" aria-hidden="true">
                    <span className="text-lg leading-none text-ink-subtle">↓</span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => selectStep(Math.max(0, selectedIndex - 1))}
            disabled={selectedIndex === 0}
            className="rounded-lg bg-line-subtle px-3 py-2 text-sm font-medium text-ink-muted hover:bg-line disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous step
          </button>
          <button
            type="button"
            onClick={() =>
              selectStep(Math.min(steps.length - 1, selectedIndex + 1))
            }
            disabled={selectedIndex === steps.length - 1}
            className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-ink-inverse hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next step
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted hover:bg-line-subtle"
          >
            Start over
          </button>
        </div>
      </div>

      <div
        className="rounded-2xl border border-line bg-line-subtle p-5"
        aria-live="polite"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
          Step {selectedIndex + 1} of {steps.length}
        </p>
        <h3 className="mt-2 break-words text-xl font-bold text-ink">
          {selectedStep.title}
        </h3>
        <p className="mt-2 text-sm font-medium text-ink-muted">
          {selectedStep.summary}
        </p>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-ink-muted">
          {selectedStep.details?.[level] ||
            selectedStep.details?.intermediate ||
            'No explanation is available for this step.'}
        </p>

        {Array.isArray(selectedStep.annotations) &&
          selectedStep.annotations.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                Keep in mind
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
                {selectedStep.annotations.map((annotation) => (
                  <li key={annotation}>{annotation}</li>
                ))}
              </ul>
            </div>
          )}

        <p className="mt-4 border-t border-line pt-3 text-xs text-ink-subtle">
          {explanation.accessibilityDescription}
        </p>
      </div>
    </div>
  );
};

export default ProcessExplorer;
