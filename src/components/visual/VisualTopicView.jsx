import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getDomainStrategy } from '../../visual/domainStrategies.mjs';
import { VISUAL_TYPE_LABELS } from '../../visual/topicAnalysis.mjs';
import { LEVELS, LEVEL_LABELS } from '../../visual/visualSchema.mjs';
import VisualExplanationRenderer from './VisualExplanationRenderer';
import PracticeCheck from './PracticeCheck';

const VisualTopicView = ({ explanation }) => {
  const [level, setLevel] = useState('intermediate');
  const strategy = getDomainStrategy(explanation?.domainId);
  const levelIndex = LEVELS.indexOf(level);
  const steps = explanation?.process?.steps || [];

  if (!explanation) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div
          role="alert"
          className="rounded-2xl border border-danger/40 bg-danger-soft p-6 text-danger"
        >
          This visual explanation is unavailable.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        to="/visual"
        className="text-sm font-semibold text-primary-700 hover:text-primary-800"
      >
        ← Visual Learning
      </Link>

      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-primary-50 px-3 py-1 text-primary-700">
            {strategy.label}
          </span>
          <span className="rounded-full bg-line-subtle px-3 py-1 text-ink-muted">
            {VISUAL_TYPE_LABELS[explanation.visualType] || explanation.visualType}
          </span>
          <span className="rounded-full bg-line-subtle px-3 py-1 text-ink-muted">
            {explanation.durationMinutes} min
          </span>
        </div>

        <h1 className="mt-4 break-words text-3xl font-bold text-ink sm:text-4xl">
          {explanation.title}
        </h1>
        <p className="mt-2 max-w-3xl text-ink-muted">{explanation.topic}</p>

        <div className="mt-5 rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Learning objective
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {explanation.learningObjective}
          </p>
        </div>

        <div className="mt-3 rounded-xl border border-info-soft bg-info-soft p-4 text-sm text-info">
          <p className="font-semibold">Curated local explanation</p>
          <p className="mt-1">
            This explanation is authored content from the local catalog. It is not
            AI-generated at runtime, and no source-grounded visual generation is
            connected in this build.
          </p>
        </div>
      </header>

      <nav
        aria-label="Explanation controls"
        className="mt-6 rounded-2xl border border-line bg-surface p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Explanation level
            </p>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Explanation level"
            >
              {LEVELS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setLevel(option)}
                  aria-pressed={level === option}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    level === option
                      ? 'bg-accent text-ink-inverse'
                      : 'bg-line-subtle text-ink-muted hover:bg-line'
                  }`}
                >
                  {LEVEL_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Adapt now
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setLevel(LEVELS[Math.max(0, levelIndex - 1)])}
                disabled={levelIndex === 0}
                className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted hover:bg-line-subtle disabled:cursor-not-allowed disabled:opacity-50"
              >
                Simpler
              </button>
              <button
                type="button"
                onClick={() =>
                  setLevel(
                    LEVELS[Math.min(LEVELS.length - 1, levelIndex + 1)]
                  )
                }
                disabled={levelIndex === LEVELS.length - 1}
                className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted hover:bg-line-subtle disabled:cursor-not-allowed disabled:opacity-50"
              >
                Deeper
              </button>
              <a
                href="#process"
                className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted hover:bg-line-subtle"
              >
                More visual
              </a>
              <a
                href="#apply"
                className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted hover:bg-line-subtle"
              >
                Practical example
              </a>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-subtle">
          Changing the level updates the introduction and every step explanation.
          It does not discard your selected step.
        </p>
      </nav>

      <section aria-labelledby="big-picture-heading" className="mt-8">
        <h2
          id="big-picture-heading"
          className="text-xl font-bold text-ink"
        >
          See the big picture
        </h2>
        <div
          className="mt-3 rounded-2xl border border-line bg-surface p-6 shadow-sm"
          aria-live="polite"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">
            {LEVEL_LABELS[level]} explanation
          </p>
          <p className="mt-2 whitespace-pre-wrap text-ink-muted">
            {explanation.intro?.[level] ||
              explanation.intro?.intermediate ||
              'No introduction is available.'}
          </p>
        </div>
      </section>

      <section
        id="process"
        aria-labelledby="process-heading"
        className="mt-8 scroll-mt-24"
      >
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="process-heading" className="text-xl font-bold text-ink">
              Follow the process
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Select a step to see its explanation, then move forward through the
              sequence.
            </p>
          </div>
          <p className="text-sm text-ink-subtle">
            {steps.length} {steps.length === 1 ? 'step' : 'steps'}
          </p>
        </div>
        <div className="mt-4 rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">
          <VisualExplanationRenderer
            key={explanation.id}
            explanation={explanation}
            level={level}
          />
        </div>
      </section>

      <section aria-labelledby="worked-example-heading" className="mt-8">
        <h2
          id="worked-example-heading"
          className="text-xl font-bold text-ink"
        >
          Walk through an example
        </h2>
        <div className="mt-3 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <h3 className="font-semibold text-ink">
            {explanation.workedExample.title}
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-ink-muted">
            {explanation.workedExample.body}
          </p>
        </div>
      </section>

      <section
        id="practice"
        aria-labelledby="practice-heading"
        className="mt-8 scroll-mt-24"
      >
        <h2 id="practice-heading" className="text-xl font-bold text-ink">
          Try it
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Make a prediction before revealing the explanation.
        </p>
        <div className="mt-3">
          <PracticeCheck key={explanation.id} explanation={explanation} />
        </div>
      </section>

      <section
        id="apply"
        aria-labelledby="apply-heading"
        className="mt-8 scroll-mt-24"
      >
        <h2 id="apply-heading" className="text-xl font-bold text-ink">
          Apply it
        </h2>
        <div className="mt-3 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <h3 className="font-semibold text-ink">
            {explanation.application.title}
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-ink-muted">
            {explanation.application.body}
          </p>
        </div>
      </section>

      <section aria-labelledby="limits-heading" className="mt-8">
        <h2 id="limits-heading" className="text-xl font-bold text-ink">
          What this model leaves out
        </h2>
        <div className="mt-3 rounded-2xl border border-warning/40 bg-warning-soft p-6 text-warning">
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {explanation.process.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      </section>

      <details className="mt-8 rounded-2xl border border-line bg-surface p-5 text-sm text-ink-muted">
        <summary className="cursor-pointer font-semibold text-ink">
          Accessibility description
        </summary>
        <p className="mt-2">{explanation.accessibilityDescription}</p>
      </details>

      <div className="mt-6 rounded-xl border border-line bg-line-subtle p-4 text-xs text-ink-muted">
        <p className="font-semibold text-ink-muted">
          {explanation.provenance?.kind === 'source_grounded'
            ? 'Source-grounded explanation'
            : 'Authored explanation'}
        </p>
        <p className="mt-1">{explanation.provenance?.note}</p>
        {Array.isArray(explanation.sources) && explanation.sources.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {explanation.sources.map((source) => (
              <li key={source.sourceId}>
                {source.title}
                {source.locator ? ` — ${source.locator}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default VisualTopicView;
