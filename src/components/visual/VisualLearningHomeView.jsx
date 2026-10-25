import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { VISUAL_TYPE_LABELS } from '../../visual/topicAnalysis.mjs';

const EXAMPLE_TOPICS = [
  'How does electricity flow through a circuit?',
  'How does a compiler turn code into a program?',
  'How does a startup make money?',
];

const VisualLearningHomeView = ({
  topics = [],
  analysis = null,
  strategy = null,
  searchedTopic = '',
  onAnalyze,
}) => {
  const [topic, setTopic] = useState('');
  const [error, setError] = useState('');

  const analyze = (value) => {
    const result = onAnalyze?.(value);
    if (result && result.ok === false) {
      setError(result.errors?.[0] || 'Enter a topic to continue.');
      return;
    }
    setError('');
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    analyze(topic);
  };

  const handleExample = (example) => {
    setTopic(example);
    analyze(example);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <p className="text-sm font-semibold text-primary-700">
          Universal Visual Learning Engine
        </p>
        <h1 className="mt-2 text-3xl font-bold text-ink sm:text-4xl">
          Choose an explanation that fits the idea
        </h1>
        <p className="mt-3 max-w-3xl text-ink-muted">
          Enter a topic to analyse its likely domain and the representation that
          would explain it best. This build contains a small, verified catalog of
          interactive process explanations; it does not invent an explanation for
          an unknown topic.
        </p>
      </header>

      <section
        aria-labelledby="topic-heading"
        className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-sm"
      >
        <h2 id="topic-heading" className="text-lg font-semibold text-ink">
          What do you want to understand?
        </h2>
        <form onSubmit={handleSubmit} className="mt-4">
          <label htmlFor="visual-topic" className="sr-only">
            Topic or question
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="visual-topic"
              type="text"
              value={topic}
              onChange={(event) => {
                setTopic(event.target.value);
                if (error) setError('');
              }}
              maxLength={300}
              placeholder="e.g. How does a compiler work?"
              className="min-w-0 flex-1 rounded-lg border border-line px-4 py-3 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-primary-600 px-5 py-3 font-semibold text-ink-inverse hover:bg-accent-strong"
            >
              Analyse topic
            </button>
          </div>
        </form>

        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Try a verified topic
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLE_TOPICS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handleExample(example)}
                className="rounded-full border border-line bg-line-subtle px-3 py-1.5 text-sm text-ink-muted hover:border-primary-200 hover:bg-primary-50"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-info-soft bg-info-soft p-4 text-sm text-info">
          <p className="font-semibold">Honest scope</p>
          <p className="mt-1">
            Only step-by-step process diagrams are implemented. Topic analysis is
            a transparent keyword heuristic, not an AI model. AI generation and
            source-grounded visual explanations are not connected.
          </p>
        </div>
      </section>

      {analysis && (
        <section
          aria-labelledby="analysis-heading"
          className="mt-6 rounded-2xl border border-line bg-surface p-6 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="analysis-heading"
                className="text-lg font-semibold text-ink"
              >
                Topic analysis preview
              </h2>
              <p className="mt-1 break-words text-sm text-ink-muted">
                “{searchedTopic}”
              </p>
            </div>
            <span className="rounded-full bg-line-subtle px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Heuristic, not AI
            </span>
          </div>

          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                Likely domain
              </dt>
              <dd className="mt-1 font-medium text-ink">
                {analysis.domainLabel}
              </dd>
              <dd className="text-xs text-ink-subtle">
                Confidence: {analysis.confidence}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                Explanation goal
              </dt>
              <dd className="mt-1 font-medium text-ink">
                {analysis.explanationGoal}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                Recommended first
              </dt>
              <dd className="mt-1 font-medium text-ink">
                {analysis.primaryVisualType
                  ? VISUAL_TYPE_LABELS[analysis.primaryVisualType] ||
                    analysis.primaryVisualType
                  : 'No representation selected'}
              </dd>
            </div>
          </dl>

          <div className="mt-5 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
            <p className="font-semibold">
              {strategy?.supported
                ? 'A suitable representation is supported, but this topic has no verified explanation yet.'
                : 'The recommended representation is not available in this build.'}
            </p>
            <p className="mt-1">
              {strategy?.reason} No AI provider is connected, so the app will not
              fabricate steps, examples, or practice feedback for this topic.
            </p>
            {analysis.supportedVisualTypes.length > 0 && (
              <p className="mt-2">
                Supported for this topic:{' '}
                {analysis.supportedVisualTypes
                  .map((type) => VISUAL_TYPE_LABELS[type] || type)
                  .join(', ')}
                .
              </p>
            )}
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              All recommended representations
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {analysis.recommendedVisualTypes.map((type) => (
                <span
                  key={type}
                  className="rounded-full bg-line-subtle px-3 py-1 text-xs font-medium text-ink-muted"
                >
                  {VISUAL_TYPE_LABELS[type] || type}
                </span>
              ))}
            </div>
          </div>

          {analysis.strategy?.pitfalls?.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                Domain pitfalls to watch for
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
                {analysis.strategy.pitfalls.slice(0, 3).map((pitfall) => (
                  <li key={pitfall}>{pitfall}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="catalog-heading" className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="catalog-heading"
              className="text-xl font-bold text-ink"
            >
              Verified explanations in this build
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Each topic includes a process diagram, level variants, a worked
              example and one practice check.
            </p>
          </div>
          <span className="text-sm text-ink-subtle">
            {topics.length} {topics.length === 1 ? 'topic' : 'topics'}
          </span>
        </div>

        {topics.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-ink-muted">
            No verified visual explanations are available.
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {topics.map((topicItem) => (
              <li key={topicItem.id}>
                <article className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span className="rounded-full bg-primary-50 px-2.5 py-1 text-primary-700">
                      {topicItem.domainLabel}
                    </span>
                    <span className="rounded-full bg-line-subtle px-2.5 py-1 text-ink-muted">
                      {VISUAL_TYPE_LABELS[topicItem.visualType] ||
                        topicItem.visualType}
                    </span>
                  </div>
                  <h3 className="mt-3 break-words text-lg font-semibold text-ink">
                    <Link
                      to={`/visual/${topicItem.id}`}
                      className="hover:text-primary-700"
                    >
                      {topicItem.title}
                    </Link>
                  </h3>
                  <p className="mt-1 text-sm text-ink-muted">{topicItem.topic}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-3 pt-4 text-xs text-ink-subtle">
                    <span>{topicItem.stepCount} steps</span>
                    <span>{topicItem.durationMinutes} min</span>
                    <Link
                      to={`/visual/${topicItem.id}`}
                      className="font-semibold text-primary-700 hover:text-primary-800"
                    >
                      Open explanation →
                    </Link>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="implemented-heading"
        className="mt-8 grid gap-4 md:grid-cols-2"
      >
        <div className="rounded-2xl border border-success/40 bg-success-soft p-5 text-sm text-success">
          <h2
            id="implemented-heading"
            className="font-semibold text-success"
          >
            Working in this vertical slice
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Deterministic domain and explanation-goal analysis</li>
            <li>Validated, typed process explanation data</li>
            <li>Responsive, keyboard-accessible step exploration</li>
            <li>Beginner, intermediate and advanced text variants</li>
            <li>Practice feedback with a deterministic answer check</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 text-sm text-ink-muted">
          <h2 className="font-semibold text-ink">
            Not implemented or claimed
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>AI generation for arbitrary topics</li>
            <li>Concept-map, timeline, chart, code-trace or simulation renderers</li>
            <li>Source-grounded visual explanations</li>
            <li>Persistent visual-learning progress or mastery updates</li>
            <li>Arbitrary HTML or executable visual content</li>
          </ul>
        </div>
      </section>
    </div>
  );
};

export default VisualLearningHomeView;
