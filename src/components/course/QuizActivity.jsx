import { useState } from 'react';

function percent(score) {
  return Math.round(score * 100);
}

export default function QuizActivity({ activity, completed, onComplete }) {
  const questions = Array.isArray(activity?.questions)
    ? activity.questions
    : [];
  const passingScore = Number.isFinite(activity?.passingScore)
    ? activity.passingScore
    : 80;
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);

  if (questions.length === 0) {
    return (
      <p className="rounded-lg bg-warning-soft p-4 text-sm text-warning">
        This quiz has no questions yet.
      </p>
    );
  }

  const allAnswered = questions.every(
    (question) => answers[question.id] !== undefined
  );

  function choose(questionId, optionIndex) {
    if (completed) return;
    setAnswers((current) => ({ ...current, [questionId]: optionIndex }));
    setResult(null);
  }

  function submit(event) {
    event.preventDefault();
    if (!allAnswered || completed) return;
    const correct = questions.filter(
      (question) => answers[question.id] === question.correctIndex
    ).length;
    const score = questions.length > 0 ? correct / questions.length : 0;
    const nextResult = {
      correct,
      total: questions.length,
      score,
      passed: percent(score) >= passingScore,
    };
    setResult(nextResult);
    if (nextResult.passed) onComplete?.();
  }

  if (completed) {
    const completedScore = result
      ? `${result.correct} of ${result.total} correct (${percent(result.score)}%)`
      : `Passing score ${passingScore}% met`;
    return (
      <div className="rounded-lg border border-success/40 bg-success-soft p-4 text-sm text-success">
        <p className="font-semibold">Quiz completed</p>
        <p className="mt-1">{completedScore}</p>
        {result && (
          <ul className="mt-3 space-y-2">
            {questions.map((question) => (
              <li key={question.id}>
                <span className="font-medium">{question.prompt}</span>{' '}
                {answers[question.id] === question.correctIndex
                  ? 'Correct.'
                  : `Review: ${question.options[question.correctIndex]}.`}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {activity?.instructions && (
        <p className="text-sm text-ink-muted">{activity.instructions}</p>
      )}

      {questions.map((question, questionIndex) => (
        <fieldset key={question.id} className="space-y-2">
          <legend className="font-medium text-ink">
            {questionIndex + 1}. {question.prompt}
          </legend>
          <div className="space-y-2">
            {question.options.map((option, optionIndex) => {
              const selected = answers[question.id] === optionIndex;
              return (
                <button
                  key={optionIndex}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => choose(question.id, optionIndex)}
                  className={`w-full rounded-lg border px-4 py-2 text-left text-sm transition ${
                    selected
                      ? 'border-primary-500 bg-primary-50 text-primary-800'
                      : 'border-line bg-surface text-ink-muted hover:border-line'
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!allAnswered}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-ink-inverse disabled:cursor-not-allowed disabled:bg-line"
        >
          Submit quiz
        </button>
        {!allAnswered && (
          <span className="text-xs text-ink-subtle">
            Answer every question to submit.
          </span>
        )}
      </div>

      {result && (
        <div
          role="status"
          className={`rounded-lg p-4 text-sm ${
            result.passed
              ? 'border border-success/40 bg-success-soft text-success'
              : 'border border-warning/40 bg-warning-soft text-warning'
          }`}
        >
          <p className="font-semibold">
            {result.passed
              ? `Passed with ${percent(result.score)}%`
              : `Not yet: ${percent(result.score)}% (need ${passingScore}%)`}
          </p>
          <p className="mt-1">
            {result.correct} of {result.total} answers were correct.
          </p>
          <ul className="mt-3 space-y-2">
            {questions.map((question) => (
              <li key={question.id}>
                <span className="font-medium">{question.prompt}</span>{' '}
                {answers[question.id] === question.correctIndex
                  ? 'Correct.'
                  : `The expected answer is "${
                      question.options[question.correctIndex]
                    }".`}
                {question.explanation && (
                  <span className="block text-xs opacity-80">
                    {question.explanation}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!result.passed && (
            <p className="mt-2 text-xs">
              Change one or more answers and submit again.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
