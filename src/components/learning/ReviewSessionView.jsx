import { Link } from 'react-router-dom';

const CARD = 'rounded-2xl border border-line bg-surface p-6 shadow-lg';
const PRIMARY_BUTTON =
  'inline-flex items-center justify-center rounded-lg bg-primary-600 px-5 py-3 font-semibold text-ink-inverse transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BUTTON =
  'inline-flex items-center justify-center rounded-lg border border-line px-5 py-3 font-semibold text-ink transition hover:bg-line-subtle';
const EASY_BUTTON =
  'inline-flex items-center justify-center rounded-lg border border-success bg-success-soft px-5 py-3 font-semibold text-success transition hover:bg-success-soft';
const HARD_BUTTON =
  'inline-flex items-center justify-center rounded-lg border border-warning bg-warning-soft px-5 py-3 font-semibold text-warning transition hover:bg-warning-soft';

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'soon';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function RecallHeader({ activity, courseTitle }) {
  return (
    <header className="mb-6">
      <p className="text-xs font-bold uppercase tracking-wide text-primary-600">
        Active recall · answer from memory
      </p>
      <h1 className="mt-2 text-3xl font-bold text-ink">{activity.title}</h1>
      <p className="mt-2 text-sm text-ink-muted">
        {courseTitle}
        {activity.objectiveTitle ? ` · ${activity.objectiveTitle}` : ''}
      </p>
      <p className="mt-1 text-xs text-ink-subtle">
        Based on a validated question from lesson {activity.lessonId || 'the course'}
        {activity.sourceItemId ? ` (${activity.sourceItemId})` : ''}.
      </p>
    </header>
  );
}

const ReviewSessionView = ({
  activity,
  courseTitle = 'Course',
  phase = 'recall',
  answer = '',
  result = null,
  savedRecord = null,
  onAnswerChange = () => {},
  onCheck = () => {},
  onDontKnow = () => {},
  onComplete = () => {},
}) => {
  const hasAnswer = typeof answer === 'string' && answer.trim() !== '';

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <RecallHeader activity={activity} courseTitle={courseTitle} />

      <div className={CARD}>
        {phase === 'recall' && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Recall prompt
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              {activity.prompt}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Write the answer from memory. Do not open the lesson first. The
              explanation stays hidden until you check your answer.
            </p>

            <label
              htmlFor="review-answer"
              className="mt-6 block text-sm font-semibold text-ink"
            >
              Your answer
            </label>
            <textarea
              id="review-answer"
              rows={4}
              value={answer}
              onChange={(event) => onAnswerChange(event.target.value)}
              placeholder="Type what you remember..."
              className="mt-2 w-full rounded-lg border border-line px-4 py-3 text-ink focus:border-primary-500 focus:outline-none"
            />

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className={PRIMARY_BUTTON}
                onClick={onCheck}
                disabled={!hasAnswer}
              >
                Check from memory
              </button>
              <button
                type="button"
                className={SECONDARY_BUTTON}
                onClick={onDontKnow}
              >
                I don&apos;t know — show the answer
              </button>
            </div>
            <p className="mt-4 text-xs text-ink-subtle">
              After checking, rate how the recall felt. That rating adjusts the
              next interval; it does not change whether the answer was correct.
            </p>
          </div>
        )}

        {phase === 'checked' && result && (
          <div>
            <div
              className={`rounded-xl border p-4 ${
                result.isCorrect
                  ? 'border-success/40 bg-success-soft'
                  : 'border-warning/40 bg-warning-soft'
              }`}
              role="status"
            >
              <p
                className={`font-semibold ${
                  result.isCorrect ? 'text-success' : 'text-warning'
                }`}
              >
                {result.isCorrect
                  ? 'Correct recall'
                  : result.answered
                    ? 'Not recalled correctly yet'
                    : 'No answer given'}
              </p>
              <p className="mt-2 text-sm text-ink-muted">
                <span className="font-semibold">Your answer:</span>{' '}
                {result.answered ? answer : 'No answer given'}
              </p>
              <p className="mt-1 text-sm text-ink">
                <span className="font-semibold">Expected answer:</span>{' '}
                {activity.answer}
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-line-subtle p-4">
              <h3 className="font-semibold text-ink">Explanation</h3>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                {activity.explanation}
              </p>
            </div>

            <div className="mt-6 border-t border-line pt-5">
              <h3 className="font-semibold text-ink">
                How did that recall feel?
              </h3>
              <p className="mt-1 text-sm text-ink-muted">
                Choose one option to save this review and schedule the next
                check. This is a self-assessment, not a claim about permanent
                memory.
              </p>

              {activity.selfAssessment === false ? (
                <button
                  type="button"
                  className={`${PRIMARY_BUTTON} mt-4`}
                  onClick={() => onComplete(null)}
                >
                  Save review
                </button>
              ) : (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    className={EASY_BUTTON}
                    onClick={() => onComplete('easy')}
                  >
                    Easy
                  </button>
                  <button
                    type="button"
                    className={HARD_BUTTON}
                    onClick={() => onComplete('hard')}
                  >
                    Hard
                  </button>
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    onClick={() => onComplete(null)}
                  >
                    Save without rating
                  </button>
                </div>
              )}
            </div>

            <p className="mt-4 text-xs text-ink-subtle">
              One correct answer is evidence of recall today, not proof of
              permanent memory. The concept will be scheduled again.
            </p>
          </div>
        )}

        {phase === 'saved' && savedRecord && (
          <div>
            <div className="rounded-xl border border-success/40 bg-success-soft p-5">
              <p className="text-lg font-bold text-success">Review recorded</p>
              <p className="mt-1 text-sm text-success">
                {savedRecord.lastOutcome === 'correct'
                  ? 'Your recall was correct this time.'
                  : 'This concept needs another look. It will come back soon.'}
              </p>
              <p className="mt-3 text-sm text-ink">
                <span className="font-semibold">Next review:</span>{' '}
                {formatDate(savedRecord.dueAt)}
                {savedRecord.intervalDays
                  ? ` · in ${savedRecord.intervalDays} ${
                      savedRecord.intervalDays === 1 ? 'day' : 'days'
                    }`
                  : ''}
              </p>
              {savedRecord.lastSelfAssessment && (
                <p className="mt-1 text-sm text-ink-muted">
                  Self-assessment: {savedRecord.lastSelfAssessment}
                </p>
              )}
            </div>

            <p className="mt-4 rounded-lg border border-info-soft bg-info-soft p-3 text-sm text-info">
              The next date is a scheduling decision, not proof that you
              remember this concept permanently. A later review will check it
              again.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to="/review" className={PRIMARY_BUTTON}>
                Back to review dashboard
              </Link>
              <Link
                to={`/course/${activity.courseId}/lesson/${activity.lessonId}`}
                className={SECONDARY_BUTTON}
              >
                Open the lesson
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewSessionView;
