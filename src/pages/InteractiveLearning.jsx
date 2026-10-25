import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CircuitExperience from '../components/learning/CircuitExperience';
import CodeTraceExperience from '../components/learning/CodeTraceExperience';
import { findVisualExplanationForTopic } from '../visual/visualCatalog.mjs';

/**
 * Registry of built interactive experiences. Anything that is not in this
 * list is honestly reported as unavailable — the app never generates a fake
 * experience for an unknown topic.
 */
export const INTERACTIVE_EXPERIENCES = [
  {
    id: 'simple-circuit',
    title: 'Electricity in a simple circuit',
    domain: 'Science',
    blurb:
      'Explore a circuit, control voltage and resistance, predict outcomes, solve a calculation and check your understanding with real Ohm’s-law math.',
    Component: CircuitExperience,
  },
  {
    id: 'code-trace',
    title: 'Tracing and debugging a small program',
    domain: 'Programming',
    blurb:
      'Step through a loop line by line, predict its output, find and fix a realistic accumulation bug, and apply the same reasoning to a changed program.',
    Component: CodeTraceExperience,
  },
];

const MAX_TOPIC_LENGTH = 300; // Mirrors TOPIC_MAX_LENGTH in topicAnalysis.mjs

const InteractiveHome = () => (
  <div className="mb-8">
    <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
      Interactive learning
    </p>
    <h1 className="mt-1 text-3xl font-bold text-ink">
      Explore concepts by doing
    </h1>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
      Interactive experiences are hands-on lessons: you control a system,
      predict what happens, solve problems and get feedback explained. Only
      experiences with complete, verified implementations appear here.
    </p>
  </div>
);

const ExperienceCard = ({ experience }) => (
  <Link
    to={`/interactive/${experience.id}`}
    className="block rounded-2xl border border-line bg-surface p-5 shadow-sm transition hover:border-primary-200 hover:shadow-md"
  >
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-info-soft px-2 py-0.5 text-xs font-semibold text-info">
        {experience.domain}
      </span>
    </div>
    <h2 className="mt-2 text-lg font-semibold text-ink">{experience.title}</h2>
    <p className="mt-1 text-sm leading-6 text-ink-muted">{experience.blurb}</p>
    <p className="mt-3 text-sm font-semibold text-accent-strong">Start →</p>
  </Link>
);

const GeneralPurposeExplore = () => {
  const navigate = useNavigate();
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState(null);

  const handleSubmit = (event) => {
    event.preventDefault();
    setMessage(null);

    const value = String(topic || '')
      .trim()
      .slice(0, MAX_TOPIC_LENGTH);
    if (!value) {
      setMessage({
        tone: 'warn',
        text: 'Describe a topic to look for — for example, “how a compiler turns code into a program”.',
      });
      return;
    }

    // General-purpose strategy: match the topic against the curated visual
    // catalog. Only curated, real content is claimed; unknown topics receive
    // an honest "not built yet" answer instead of a fabricated lesson.
    const result = findVisualExplanationForTopic(value);
    if (!result.ok) {
      setMessage({
        tone: 'warn',
        text: result.errors?.[0] || 'That topic could not be checked. Try describing it differently.',
      });
      return;
    }
    if (result.explanation) {
      navigate(`/visual/${result.explanation.id}`);
      return;
    }
    setMessage({
      tone: 'warn',
      text: 'No curated visual explanation matches that topic yet. Interactive experiences are added domain by domain when a full implementation exists — nothing is invented in the meantime.',
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4">
      <label
        htmlFor="interactive-topic-input"
        className="block text-xs font-semibold uppercase tracking-wide text-ink-subtle"
      >
        Check any topic
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="interactive-topic-input"
          type="text"
          maxLength={MAX_TOPIC_LENGTH}
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="e.g. how a compiler turns code into a program"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink-inverse transition hover:bg-accent-strong"
        >
          Look up
        </button>
      </div>
      {message && (
        <p
          className={`mt-3 text-sm font-medium ${
            message.tone === 'warn' ? 'text-warning' : 'text-success'
          }`}
          aria-live="polite"
        >
          {message.text}
        </p>
      )}
    </form>
  );
};

const UnknownExperience = () => (
  <div className="rounded-2xl border border-line bg-surface p-6">
    <h2 className="text-xl font-bold text-ink">
      That experience is not built yet
    </h2>
    <p className="mt-2 text-sm leading-6 text-ink-muted">
      Interactive experiences are added when a full, verifiable implementation
      exists — the list on{' '}
      <Link to="/interactive" className="text-accent-strong underline-offset-2 hover:underline">
        the interactive learning page
      </Link>{' '}
      is everything currently available. Curated visual explanations may still
      cover the topic.
    </p>
    <Link
      to="/visual"
      className="mt-4 inline-block rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-line-subtle"
    >
      Browse visual learning
    </Link>
  </div>
);

const InteractiveLearning = () => {
  const { experienceId } = useParams();
  const experience = INTERACTIVE_EXPERIENCES.find(
    (item) => item.id === experienceId
  );

  if (!experienceId) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <InteractiveHome />
        <ul className="grid gap-4 sm:grid-cols-2">
          {INTERACTIVE_EXPERIENCES.map((item) => (
            <li key={item.id}>
              <ExperienceCard experience={item} />
            </li>
          ))}
        </ul>
        <section className="mt-8 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-lg font-semibold text-ink">
            A topic we do not cover yet?
          </h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">
            Type a topic to check the curated visual catalog. Topics without any
            curated interactive experience stay clearly marked as unavailable.
          </p>
          <GeneralPurposeExplore />
        </section>
      </div>
    );
  }

  if (!experience) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <UnknownExperience />
      </div>
    );
  }

  const { Component } = experience;
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Component />
    </div>
  );
};

export default InteractiveLearning;
