import {
  JOURNEY_STAGES,
  isBlankValue,
  resolveJourneyPolicy,
} from '../../learning/journeyEngine';
import ErrorCoach from './ErrorCoach';
import MasteryCheckPanel from './MasteryCheckPanel';

const JOURNEY_STEPS = [
  { key: JOURNEY_STAGES.OBJECTIVES, label: 'Learning objectives' },
  { key: JOURNEY_STAGES.EXPLANATION, label: 'Explanation' },
  { key: JOURNEY_STAGES.WORKED_EXAMPLE, label: 'Worked example' },
  { key: JOURNEY_STAGES.GUIDED_PRACTICE, label: 'Guided practice' },
  { key: JOURNEY_STAGES.INDEPENDENT_PRACTICE, label: 'Independent practice' },
  { key: JOURNEY_STAGES.ASSESSMENT, label: 'Assessment' },
];

const CARD = 'bg-surface rounded-2xl shadow-lg p-8 mb-8';
const PRIMARY_BUTTON =
  'inline-flex items-center justify-center px-5 py-3 rounded-lg bg-accent text-ink-inverse font-semibold hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed';
const SECONDARY_BUTTON =
  'inline-flex items-center justify-center px-5 py-3 rounded-lg border border-line text-ink font-semibold hover:bg-line-subtle disabled:opacity-50 disabled:cursor-not-allowed';

function StepHeader({ stage }) {
  const index = JOURNEY_STEPS.findIndex((step) => step.key === stage);
  const label =
    index === -1
      ? 'Lesson complete'
      : `Step ${index + 1} of ${JOURNEY_STEPS.length}: ${JOURNEY_STEPS[index].label}`;
  return <p className="text-sm font-semibold text-primary-700 mb-3">{label}</p>;
}

function ObjectiveList({ objectives }) {
  return (
    <ul className="space-y-3">
      {objectives.map((objective) => (
        <li key={objective.id} className="flex items-start space-x-3">
          <span aria-hidden="true" className="text-primary-600 font-bold">
            ◆
          </span>
          <div>
            <p className="font-semibold text-ink">{objective.title}</p>
            {objective.description && (
              <p className="text-sm text-ink-muted">{objective.description}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ChoiceField({ item, name, value, onChange, locked }) {
  return (
    <fieldset disabled={locked}>
      <legend className="text-lg font-semibold text-ink mb-3">
        {item.prompt}
      </legend>
      <div className="space-y-2">
        {item.options.map((option, index) => {
          const inputId = `${name}-option-${index}`;
          const checked = value === index;
          return (
            <label
              key={inputId}
              htmlFor={inputId}
              className={`flex items-start space-x-3 rounded-lg border p-3 cursor-pointer ${
                checked
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-line hover:border-primary-200'
              }`}
            >
              <input
                id={inputId}
                type="radio"
                name={name}
                value={index}
                checked={checked}
                disabled={locked}
                onChange={() => onChange(index)}
                className="mt-1"
              />
              <span className="text-ink">{option}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function FeedbackPanel({ feedback, item }) {
  if (!feedback) return null;
  return (
    <div
      role="status"
      className={`mt-4 rounded-lg border p-4 ${
        feedback.isCorrect
          ? 'border-success/40 bg-success-soft'
          : 'border-warning/40 bg-warning-soft'
      }`}
    >
      <p
        className={`font-semibold ${
          feedback.isCorrect ? 'text-success' : 'text-warning'
        }`}
      >
        {feedback.isCorrect
          ? '✅ Correct'
          : feedback.revealed
            ? '📖 Answer revealed'
            : '✏️ Not quite yet'}
      </p>
      <p className="text-sm text-ink-muted mt-1">{feedback.message}</p>
      <p className="text-sm text-ink-muted mt-2">{item.explanation}</p>
      {feedback.revealed && !feedback.isCorrect && (
        <p className="text-sm text-ink mt-2">
          <span className="font-semibold">Correct answer:</span>{' '}
          {item.kind === 'single_choice'
            ? item.options[item.correctIndex]
            : item.answer}
        </p>
      )}
    </div>
  );
}

function ExplanationStage({ content, dispatch }) {
  const { explanation } = content;
  return (
    <section className={CARD} aria-labelledby="journey-explanation-heading">
      <StepHeader stage={JOURNEY_STAGES.EXPLANATION} />
      <h2
        id="journey-explanation-heading"
        className="text-2xl font-bold text-ink mb-4"
      >
        {explanation.title}
      </h2>
      <div className="space-y-3 mb-6">
        {explanation.paragraphs.map((paragraph, index) => (
          <p key={index} className="text-ink-muted">
            {paragraph}
          </p>
        ))}
      </div>
      <div className="bg-primary-50 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-primary-900 mb-2">Key points</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-primary-900">
          {explanation.keyPoints.map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        className={PRIMARY_BUTTON}
        onClick={() => dispatch({ type: 'CONTINUE' })}
      >
        Continue to worked example
      </button>
    </section>
  );
}

function WorkedExampleStage({ content, dispatch }) {
  const { workedExample } = content;
  return (
    <section className={CARD} aria-labelledby="journey-example-heading">
      <StepHeader stage={JOURNEY_STAGES.WORKED_EXAMPLE} />
      <h2
        id="journey-example-heading"
        className="text-2xl font-bold text-ink mb-2"
      >
        {workedExample.title}
      </h2>
      <p className="text-ink-muted mb-6">{workedExample.introduction}</p>
      <ol className="space-y-6 mb-6">
        {workedExample.steps.map((step, index) => (
          <li key={index} className="border border-line rounded-lg p-4">
            <p className="font-semibold text-ink mb-2">{step.title}</p>
            {step.code && (
              <pre className="bg-surface-dark text-line-subtle rounded-lg p-4 text-sm overflow-x-auto mb-2">
                <code>{step.code}</code>
              </pre>
            )}
            <p className="text-sm text-ink-muted">{step.note}</p>
          </li>
        ))}
      </ol>
      {workedExample.result && (
        <div className="mb-6">
          <h3 className="font-semibold text-ink mb-2">
            {workedExample.result.title}
          </h3>
          <pre className="bg-surface-dark text-line-subtle rounded-lg p-4 text-sm overflow-x-auto">
            <code>{workedExample.result.code}</code>
          </pre>
        </div>
      )}
      <button
        type="button"
        className={PRIMARY_BUTTON}
        onClick={() => dispatch({ type: 'CONTINUE' })}
      >
        Continue to guided practice
      </button>
    </section>
  );
}

function PracticeStage({ content, state, dispatch, errorSupport }) {
  const phase = state.stage;
  const config =
    phase === JOURNEY_STAGES.GUIDED_PRACTICE
      ? content.guidedPractice
      : content.independentPractice;
  const phaseState =
    phase === JOURNEY_STAGES.GUIDED_PRACTICE
      ? state.guidedPractice
      : state.independentPractice;
  const items = config.items;
  const item = items[phaseState.index];
  if (!item) return null;

  const record = phaseState.records[item.id];
  const feedback = phaseState.feedback;
  const isGuided = phase === JOURNEY_STAGES.GUIDED_PRACTICE;
  const isLast = phaseState.index >= items.length - 1;
  const nextLabel = isLast
    ? isGuided
      ? 'Continue to independent practice'
      : 'Continue to assessment'
    : 'Next question';
  const canSubmit = phaseState.selected !== null && !feedback;
  const canRetry = Boolean(feedback) && !feedback.isCorrect && !feedback.revealed;
  const canAdvance =
    Boolean(feedback) && (feedback.isCorrect || feedback.revealed);

  return (
    <section className={CARD} aria-labelledby="journey-practice-heading">
      <StepHeader stage={phase} />
      <h2
        id="journey-practice-heading"
        className="text-2xl font-bold text-ink mb-2"
      >
        {config.title}
      </h2>
      <p className="text-ink-muted mb-2">{config.instructions}</p>
      <p className="text-sm text-ink-subtle mb-6">
        Question {phaseState.index + 1} of {items.length}
        {record ? ` · Attempts on this question: ${record.attempts}` : ''}
      </p>

      {item.kind === 'single_choice' ? (
        <ChoiceField
          item={item}
          name={`${phase}-${item.id}`}
          value={phaseState.selected}
          onChange={(value) =>
            dispatch({ type: 'SELECT_PRACTICE_OPTION', value })
          }
          locked={Boolean(feedback)}
        />
      ) : (
        <div>
          <p className="text-lg font-semibold text-ink mb-3">
            {item.prompt}
          </p>
          <input
            type="text"
            value={phaseState.selected === null ? '' : phaseState.selected}
            disabled={Boolean(feedback)}
            onChange={(event) =>
              dispatch({
                type: 'SELECT_PRACTICE_OPTION',
                value: event.target.value,
              })
            }
            placeholder="Type your answer..."
            className="w-full rounded-lg border border-line px-4 py-3 focus:border-primary-500 focus:outline-none"
          />
        </div>
      )}

      {isGuided &&
        item.hint &&
        feedback &&
        !feedback.isCorrect &&
        !errorSupport && (
          <p className="mt-3 text-sm text-primary-700">
            <span className="font-semibold">Hint:</span> {item.hint}
          </p>
        )}

      <FeedbackPanel feedback={feedback} item={item} />

      {feedback && !feedback.isCorrect && errorSupport && (
        <ErrorCoach
          key={`${item.id}-${record ? record.attempts : 0}`}
          courseId={content.courseId}
          item={item}
          value={phaseState.selected}
          attemptNumber={record ? record.attempts : 1}
          courseMap={errorSupport.courseMap}
          evidence={errorSupport.evidence}
          onRecordAttempt={errorSupport.recordEvidenceAttempt}
        />
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {!feedback && (
          <button
            type="button"
            className={PRIMARY_BUTTON}
            disabled={!canSubmit}
            onClick={() => dispatch({ type: 'SUBMIT_PRACTICE' })}
          >
            Check answer
          </button>
        )}
        {canRetry && (
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() => dispatch({ type: 'RETRY_PRACTICE' })}
          >
            Try again
          </button>
        )}
        {canAdvance && (
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() => dispatch({ type: 'NEXT_PRACTICE_ITEM' })}
          >
            {nextLabel}
          </button>
        )}
      </div>
    </section>
  );
}

function AssessmentStage({
  content,
  state,
  dispatch,
  masteryDecision,
  onStartRemediation,
}) {
  const policy = resolveJourneyPolicy(content);
  const { assessment } = state;
  const items = content.assessment.items;

  if (!assessment.results) {
    const answeredCount = items.filter(
      (item) => !isBlankValue(assessment.answers[item.id])
    ).length;
    const allAnswered = answeredCount === items.length;

    return (
      <section className={CARD} aria-labelledby="journey-assessment-heading">
        <StepHeader stage={JOURNEY_STAGES.ASSESSMENT} />
        <h2
          id="journey-assessment-heading"
          className="text-2xl font-bold text-ink mb-2"
        >
          {content.assessment.title}
        </h2>
        <p className="text-ink-muted mb-2">{content.assessment.instructions}</p>
        <p className="text-sm text-ink-subtle mb-6">
          Pass score: {policy.passingScore}% · Answered {answeredCount} of{' '}
          {items.length}
        </p>
        <div className="space-y-8">
          {items.map((item) => (
            <ChoiceField
              key={item.id}
              item={item}
              name={`assessment-${item.id}`}
              value={assessment.answers[item.id]}
              onChange={(value) =>
                dispatch({
                  type: 'SET_ASSESSMENT_ANSWER',
                  itemId: item.id,
                  value,
                })
              }
              locked={false}
            />
          ))}
        </div>
        <div className="mt-6">
          <button
            type="button"
            className={PRIMARY_BUTTON}
            disabled={!allAnswered}
            onClick={() =>
              dispatch({
                type: 'SUBMIT_ASSESSMENT',
                now: new Date().toISOString(),
              })
            }
          >
            Submit assessment
          </button>
        </div>
      </section>
    );
  }

  const latestAttempt = assessment.attempts[assessment.attempts.length - 1] || {
    percentage: 0,
  };
  const attemptsLabel =
    assessment.attempts.length <= policy.maxAssessmentAttempts
      ? `Attempt ${assessment.attempts.length} of ${policy.maxAssessmentAttempts}`
      : `Attempt ${assessment.attempts.length} (recommended maximum ${policy.maxAssessmentAttempts})`;

  return (
    <section className={CARD} aria-labelledby="journey-assessment-heading">
      <StepHeader stage={JOURNEY_STAGES.ASSESSMENT} />
      <h2
        id="journey-assessment-heading"
        className="text-2xl font-bold text-ink mb-4"
      >
        Assessment results
      </h2>

      <div
        role="status"
        className={`rounded-lg border p-4 mb-6 ${
          assessment.passed
            ? 'border-success/40 bg-success-soft'
            : 'border-warning/40 bg-warning-soft'
        }`}
      >
        <p className="text-lg font-bold text-ink">
          {assessment.passed
            ? `🎉 Passed with ${latestAttempt.percentage}%`
            : `Score: ${latestAttempt.percentage}%`}
        </p>
        <p className="text-sm text-ink-muted mt-1">
          {assessment.passed
            ? 'You met the pass score and can complete the lesson.'
            : `You need ${policy.passingScore}% to pass. Review the feedback below and try again.`}
        </p>
        <p className="text-xs text-ink-subtle mt-2">
          {attemptsLabel} · Best score: {assessment.bestPercentage}%
        </p>
      </div>

      {masteryDecision && (
        <MasteryCheckPanel
          decision={masteryDecision}
          onStartRemediation={onStartRemediation}
          onReviewLesson={() => dispatch({ type: 'REVIEW_LESSON' })}
        />
      )}

      {assessment.exhausted && !assessment.passed && (
        <p className="text-sm text-warning bg-warning-soft border border-warning/40 rounded-lg p-3 mb-6">
          You have used all {policy.maxAssessmentAttempts} recommended attempts.
          Review the lesson materials, then try again when you are ready.
        </p>
      )}

      <ol className="space-y-6 mb-6">
        {assessment.results.map((result, index) => {
          const item = items.find((entry) => entry.id === result.itemId);
          const answerText =
            item.kind === 'single_choice'
              ? item.options[result.value]
              : String(result.value === null ? '' : result.value);
          const correctText =
            item.kind === 'single_choice'
              ? item.options[item.correctIndex]
              : item.answer;
          return (
            <li key={result.itemId} className="border border-line rounded-lg p-4">
              <p className="font-semibold text-ink">
                {index + 1}. {item.prompt}
              </p>
              <p
                className={`text-sm mt-1 ${
                  result.isCorrect ? 'text-success' : 'text-danger'
                }`}
              >
                {result.isCorrect
                  ? '✅ Correct'
                  : `❌ Your answer: ${answerText}`}
              </p>
              {!result.isCorrect && (
                <p className="text-sm text-ink-muted mt-1">
                  Correct answer: {correctText}
                </p>
              )}
              <p className="text-sm text-ink-muted mt-2">{item.explanation}</p>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-3">
        {!assessment.passed && (
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() => dispatch({ type: 'RETRY_ASSESSMENT' })}
          >
            Try assessment again
          </button>
        )}
        {!assessment.passed && (
          <button
            type="button"
            className={SECONDARY_BUTTON}
            onClick={() => dispatch({ type: 'REVIEW_LESSON' })}
          >
            Review the lesson
          </button>
        )}
        {assessment.passed && (
          <>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={Boolean(masteryDecision && !masteryDecision.allowed)}
              onClick={() =>
                dispatch({
                  type: 'COMPLETE_JOURNEY',
                  now: new Date().toISOString(),
                  masteryAllowed: masteryDecision
                    ? masteryDecision.allowed
                    : undefined,
                })
              }
            >
              Complete lesson
            </button>
            {masteryDecision && !masteryDecision.allowed && (
              <>
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  onClick={() =>
                    dispatch({
                      type: 'RETRY_ASSESSMENT',
                      masteryRetake: true,
                    })
                  }
                >
                  Retake assessment for mastery
                </button>
                <p className="self-center text-sm text-warning">
                  Complete the mastery requirements above before finishing the
                  lesson.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function CompleteStage({
  content,
  state,
  onBackToCourse,
  masteryDecision,
  onStartRemediation,
}) {
  const guidedAnswered = Object.keys(state.guidedPractice.records).length;
  const independentAnswered = Object.keys(state.independentPractice.records).length;

  return (
    <section className={CARD} aria-labelledby="journey-complete-heading">
      <StepHeader stage={JOURNEY_STAGES.COMPLETE} />
      <h2
        id="journey-complete-heading"
        className="text-2xl font-bold text-ink mb-2"
      >
        {content.completion.title}
      </h2>
      <p className="text-ink-muted mb-6">{content.completion.message}</p>

      <dl className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-line-subtle rounded-lg p-4">
          <dt className="text-sm text-ink-subtle">Practice questions answered</dt>
          <dd className="text-2xl font-bold text-ink">
            {guidedAnswered + independentAnswered}
          </dd>
        </div>
        <div className="bg-line-subtle rounded-lg p-4">
          <dt className="text-sm text-ink-subtle">Assessment attempts</dt>
          <dd className="text-2xl font-bold text-ink">
            {state.assessment.attempts.length}
          </dd>
        </div>
        <div className="bg-line-subtle rounded-lg p-4">
          <dt className="text-sm text-ink-subtle">Best assessment score</dt>
          <dd className="text-2xl font-bold text-ink">
            {state.assessment.bestPercentage}%
          </dd>
        </div>
      </dl>

      <h3 className="font-bold text-ink mb-3">Objectives covered</h3>
      <ObjectiveList objectives={content.objectives} />

      {masteryDecision && (
        <MasteryCheckPanel
          decision={masteryDecision}
          onStartRemediation={onStartRemediation}
        />
      )}

      {onBackToCourse && (
        <div className="mt-6">
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={onBackToCourse}
          >
            Back to course
          </button>
        </div>
      )}
    </section>
  );
}

const LessonJourneyView = ({
  content,
  state,
  dispatch,
  onBackToCourse,
  errorSupport,
  masteryDecision,
  onStartRemediation,
}) => {
  const { stage } = state;
  return (
    <div>
      <section className={CARD} aria-labelledby="journey-objectives-heading">
        <h2
          id="journey-objectives-heading"
          className="text-2xl font-bold text-ink mb-4"
        >
          Learning objectives
        </h2>
        <ObjectiveList objectives={content.objectives} />
      </section>

      {stage === JOURNEY_STAGES.OBJECTIVES && (
        <section className={CARD}>
          <StepHeader stage={stage} />
          <h2 className="text-2xl font-bold text-ink mb-2">
            Ready to learn {content.title}?
          </h2>
          <p className="text-ink-muted mb-6">
            This guided lesson takes you from a short explanation through
            guided and independent practice to a mastery check.
          </p>
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() => dispatch({ type: 'CONTINUE' })}
          >
            Start lesson
          </button>
        </section>
      )}

      {stage === JOURNEY_STAGES.EXPLANATION && (
        <ExplanationStage content={content} dispatch={dispatch} />
      )}

      {stage === JOURNEY_STAGES.WORKED_EXAMPLE && (
        <WorkedExampleStage content={content} dispatch={dispatch} />
      )}

      {(stage === JOURNEY_STAGES.GUIDED_PRACTICE ||
        stage === JOURNEY_STAGES.INDEPENDENT_PRACTICE) && (
        <PracticeStage
          content={content}
          state={state}
          dispatch={dispatch}
          errorSupport={errorSupport}
        />
      )}

      {stage === JOURNEY_STAGES.ASSESSMENT && (
        <AssessmentStage
          content={content}
          state={state}
          dispatch={dispatch}
          masteryDecision={masteryDecision}
          onStartRemediation={onStartRemediation}
        />
      )}

      {stage === JOURNEY_STAGES.COMPLETE && (
        <CompleteStage
          content={content}
          state={state}
          onBackToCourse={onBackToCourse}
          masteryDecision={masteryDecision}
          onStartRemediation={onStartRemediation}
        />
      )}
    </div>
  );
};

export default LessonJourneyView;
