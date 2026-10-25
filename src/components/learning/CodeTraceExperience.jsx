import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BUG_FIX_OPTIONS,
  BUGGY_LINE_INDEX,
  PREDICTION_OPTIONS,
  buildTrace,
  evaluateExtensionAnswer,
  evaluatePrediction,
  progressPercent,
} from '../../learning/codeTrace.mjs';

const STORAGE_KEY = 'crushlearn_interactive_experience_code_trace_v1';

const HINTS = [
  'Watch one variable only: how many times does total change, and by how much each time?',
  'Compare the buggy program with the trace of the correct one. Which line changes total differently?',
];

function loadProgress() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveProgress(progress) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Progress persistence is best-effort only.
  }
}

const CodeTraceExperience = () => {
  const restored = useRef(loadProgress());
  const [stepIndex, setStepIndex] = useState(
    restored.current?.stepIndex ?? 0
  );
  const [predictionChoice, setPredictionChoice] = useState(
    restored.current?.predictionChoice ?? ''
  );
  const [predictionResult, setPredictionResult] = useState(
    restored.current?.predictionResult ?? null
  );
  const [foundLine, setFoundLine] = useState(
    restored.current?.foundLine ?? null
  );
  const [lineResult, setLineResult] = useState(
    restored.current?.lineResult ?? null
  );
  const [fixChoice, setFixChoice] = useState(
    restored.current?.fixChoice ?? ''
  );
  const [fixResult, setFixResult] = useState(
    restored.current?.fixResult ?? null
  );
  const [hintLevel, setHintLevel] = useState(
    restored.current?.hintLevel ?? 0
  );
  const [extensionInput, setExtensionInput] = useState(
    restored.current?.extensionInput ?? ''
  );
  const [extensionResult, setExtensionResult] = useState(
    restored.current?.extensionResult ?? null
  );
  const [quizChoice, setQuizChoice] = useState(
    restored.current?.quizChoice ?? ''
  );
  const [quizResult, setQuizResult] = useState(
    restored.current?.quizResult ?? null
  );

  const correctTrace = useMemo(() => buildTrace('correct'), []);
  const buggyTrace = useMemo(() => buildTrace('buggy'), []);

  const completedSteps = [
    predictionResult?.correct === true,
    extensionResult?.correct === true,
    lineResult?.foundLine === true,
    fixResult?.fixCorrect === true,
    quizResult?.correct === true,
  ].filter(Boolean).length;
  const progress = progressPercent(completedSteps, 5);

  useEffect(() => {
    saveProgress({
      stepIndex,
      predictionChoice,
      predictionResult,
      foundLine,
      lineResult,
      fixChoice,
      fixResult,
      hintLevel,
      extensionInput,
      extensionResult,
      quizChoice,
      quizResult,
    });
  }, [
    stepIndex,
    predictionChoice,
    predictionResult,
    foundLine,
    lineResult,
    fixChoice,
    fixResult,
    hintLevel,
    extensionInput,
    extensionResult,
    quizChoice,
    quizResult,
  ]);

  const reset = () => {
    setStepIndex(0);
    setPredictionChoice('');
    setPredictionResult(null);
    setFoundLine(null);
    setLineResult(null);
    setFixChoice('');
    setFixResult(null);
    setHintLevel(0);
    setExtensionInput('');
    setExtensionResult(null);
    setQuizChoice('');
    setQuizResult(null);
  };

  const codeLines = buggyTrace.lines;
  const steps = buggyTrace.steps;
  const at = steps[Math.min(stepIndex, steps.length - 1)];
  const atEnd = stepIndex >= steps.length - 1;

  if (!at) return null;

  const handlePrediction = (choice) => {
    setPredictionChoice(choice);
    setPredictionResult(evaluatePrediction(choice));
  };

  const handlePickLine = (lineIndex) => {
    const found = lineIndex === BUGGY_LINE_INDEX;
    setFoundLine(lineIndex);
    setLineResult({
      foundLine: found,
      explanation: found
        ? 'Right. Line 4 is `total = reading;` — it overwrites the running total instead of accumulating.'
        : 'Not this line. The defect is in the line that mutates total during the loop iteration.',
    });
  };

  const handlePickFix = (fixId) => {
    setFixChoice(fixId);
    const option = BUG_FIX_OPTIONS.find((candidate) => candidate.id === fixId);
    setFixResult({
      fixCorrect: fixId === 'accumulate',
      explanation: option?.explanation || '',
    });
  };

  const handleExtension = (event) => {
    event.preventDefault();
    setExtensionResult(evaluateExtensionAnswer(extensionInput));
  };

  const handleQuiz = (choice) => {
    setQuizChoice(choice);
    setQuizResult({
      correct: choice === 'accumulate-reviewed',
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
              Interactive learning experience
            </p>
            <h2 className="mt-1 text-2xl font-bold text-ink">
              Tracing and debugging a small program
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              Step through a loop line by line, predict its output, find a
              realistic bug, and apply the same reasoning to a changed program.
              Every value you see is produced by actually executing the machine.
            </p>
          </div>
          <div className="w-full sm:w-48">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Progress
            </p>
            <div className="mt-1 h-2 rounded-full bg-line">
              <div
                className="h-2 rounded-full bg-primary-600 transition-all"
                style={{ width: `${progress}%` }}
                aria-hidden="true"
              />
            </div>
            <p className="mt-1 text-xs text-ink-muted" aria-live="polite">
              {completedSteps} of 5 milestones complete
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">
          1. Opening question
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          A teammate's version of this program prints{' '}
          <span className="font-semibold">9</span> instead of{' '}
          <span className="font-semibold">22</span>. Before tracing anything:
          what would the *correct* program print, and why?
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">
          2. Interactive code trace
        </h3>
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,260px)]">
          <div className="rounded-xl border border-line bg-surface-dark p-4">
            <pre
              className="font-mono text-sm leading-6 text-slate-200"
              aria-label="Program source code, one statement per line"
            >
              <code>
                {codeLines.map((line, index) => (
                  <span
                    key={index}
                    className={`block rounded px-2 ${
                      index === at.lineIndex
                        ? 'bg-primary-500/30'
                        : ''
                    }`}
                    aria-current={index === at.lineIndex ? 'step' : undefined}
                  >
                    <span className="select-none pr-4 text-slate-400">
                      {index + 1}
                    </span>
                    {line}
                  </span>
                ))}
              </code>
            </pre>
          </div>
          <div>
            <div
              className="rounded-xl border border-line bg-surface p-4 text-sm"
              aria-live="polite"
            >
              <p className="font-semibold text-ink">Variables</p>
              <p className="mt-1 font-mono text-ink-muted">
                total = {at.variables.total} · reading ={' '}
                {at.variables.reading === null ? '—' : at.variables.reading}
              </p>
              <p className="mt-2 text-xs text-ink-subtle">{at.note}</p>
              {atEnd && (
                <p className="mt-2 text-xs font-semibold text-ink">
                  Output: {buggyTrace.finalOutput}
                </p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
                disabled={stepIndex === 0}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-line-subtle disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous step
              </button>
              <button
                type="button"
                onClick={() =>
                  setStepIndex((value) => Math.min(steps.length - 1, value + 1))
                }
                disabled={atEnd}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink-inverse transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next step
              </button>
              <button
                type="button"
                onClick={() => setStepIndex(steps.length - 1)}
                disabled={atEnd}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-muted transition hover:bg-line-subtle disabled:cursor-not-allowed disabled:opacity-40"
              >
                Run to end
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-muted transition hover:bg-line-subtle"
              >
                Reset experience
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-subtle">
              Step {stepIndex + 1} of {steps.length}. This program is the buggy
              variant your teammate ran — that is why the printed total is
              wrong.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">
          3. Prediction challenge
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          If the bug were fixed, what would the program print?
        </p>
        <div className="mt-3 grid gap-2">
          {PREDICTION_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => handlePrediction(option.id)}
              aria-pressed={predictionChoice === option.id}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                predictionChoice === option.id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-line bg-surface hover:border-primary-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {predictionResult && (
          <p
            className={`mt-3 text-sm font-medium ${
              predictionResult.correct ? 'text-success' : 'text-warning'
            }`}
            aria-live="polite"
          >
            {predictionResult.explanation}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">
          4. Guided debugging with hints
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Which source line is defective, and which replacement fixes it?
        </p>

        <fieldset className="mt-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Defective line
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {codeLines.map((line, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handlePickLine(index)}
                aria-pressed={foundLine === index}
                className="rounded-lg border px-3 py-2 text-sm transition border-line bg-surface hover:border-primary-200"
              >
                Line {index + 1}
              </button>
            ))}
          </div>
        </fieldset>
        {lineResult && (
          <p
            className={`mt-3 text-sm font-medium ${
              lineResult.foundLine ? 'text-success' : 'text-warning'
            }`}
            aria-live="polite"
          >
            {lineResult.explanation}
          </p>
        )}

        <fieldset className="mt-5">
          <legend className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Replacement line
          </legend>
          <div className="mt-2 grid gap-2">
            {BUG_FIX_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handlePickFix(option.id)}
                aria-pressed={fixChoice === option.id}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                  fixChoice === option.id
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-line bg-surface hover:border-primary-200'
                }`}
              >
                <span className="font-mono">{option.label}</span>
              </button>
            ))}
          </div>
        </fieldset>
        {fixResult && (
          <p
            className={`mt-3 text-sm font-medium ${
              fixResult.fixCorrect ? 'text-success' : 'text-warning'
            }`}
            aria-live="polite"
          >
            {fixResult.explanation}
          </p>
        )}

        <button
          type="button"
          onClick={() => setHintLevel((level) => (level + 1) % (HINTS.length + 1))}
          aria-expanded={hintLevel > 0}
          className="mt-4 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-muted transition hover:bg-line-subtle"
        >
          {hintLevel > 0
            ? 'Cycle hints'
            : 'Show hint'}
        </button>
        {hintLevel > 0 && (
          <p className="mt-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
            {HINTS[(hintLevel - 1) % HINTS.length]}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">
          5. Practical application
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          A new sensor adds one more reading, so the array becomes{' '}
          <span className="font-mono">[4, 7, 2, 9, 5]</span>. With the bug
          fixed, what does the program print now?
        </p>
        <form onSubmit={handleExtension} className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            type="number"
            step="1"
            value={extensionInput}
            onChange={(event) => setExtensionInput(event.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            aria-label="Predicted printed total for the extended array"
          />
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink-inverse transition hover:bg-accent-strong"
          >
            Check
          </button>
        </form>
        {extensionResult && (
          <p
            className={`mt-3 text-sm font-medium ${
              extensionResult.correct ? 'text-success' : 'text-warning'
            }`}
            aria-live="polite"
          >
            {extensionResult.correct
              ? `Correct. The corrected program prints ${extensionResult.expected}.`
              : extensionResult.reason === 'not-a-number'
                ? 'Enter a number to check your prediction.'
                : `Close — the corrected program prints ${extensionResult.expected}. Five readings in total: the original four plus the new one.`}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">
          6. Understanding check
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Why is <span className="font-mono">total = total + reading;</span>{' '}
          different from writing the sum by hand for this data set?
        </p>
        <div className="mt-3 grid gap-2">
          {[
            ['accumulate-reviewed', 'It accumulates during the loop, so it works for any number of readings without rewriting the expression.'],
            ['faster', 'It runs faster, which is why the printed total is more accurate.'],
            ['shorter', 'It always produces a smaller number, which is easier to read.'],
            ['type-safe', 'It prevents the loop from ever finishing.'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => handleQuiz(id)}
              aria-pressed={quizChoice === id}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                quizChoice === id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-line bg-surface hover:border-primary-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {quizResult && (
          <p
            className={`mt-3 text-sm font-medium ${
              quizResult.correct ? 'text-success' : 'text-warning'
            }`}
            aria-live="polite"
          >
            {quizResult.correct
              ? 'Correct — accumulation inside the loop scales to any list length.'
              : 'Not quite. The choice has nothing to do with speed or readability; each iteration folds one reading into the running total.'}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">
          Suggested next activity
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          See how a compiler turns source code into a running program, or try
          another interactive experience.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to="/visual"
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-line-subtle"
          >
            Explore visual learning
          </Link>
          <Link
            to="/interactive"
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-line-subtle"
          >
            Other interactive experiences
          </Link>
        </div>
        <p className="mt-3 text-xs text-ink-subtle">
          Completing this experience records milestones locally; it does not
          change course mastery or grant any certificate.
        </p>
      </section>
    </div>
  );
};

export default CodeTraceExperience;
