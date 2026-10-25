import { formatCitationLabel } from '../../notebooks/citations.mjs';
import {
  ADAPTIVE_ACTION_LABELS,
  ADAPTIVE_STATUSES,
  getAdaptiveActionLabel,
} from '../../intelligence/adaptiveState.mjs';

const STATUS_LABELS = {
  [ADAPTIVE_STATUSES.RUNNING]: 'Working',
  [ADAPTIVE_STATUSES.AWAITING_RESPONSE]: 'Waiting for your response',
  [ADAPTIVE_STATUSES.COMPLETE]: 'Loop complete',
  [ADAPTIVE_STATUSES.BLOCKED]: 'Needs review',
  [ADAPTIVE_STATUSES.FAILED]: 'Action failed',
  [ADAPTIVE_STATUSES.CANCELLED]: 'Cancelled',
};

const STATUS_CLASSES = {
  [ADAPTIVE_STATUSES.RUNNING]: 'bg-info-soft text-info',
  [ADAPTIVE_STATUSES.AWAITING_RESPONSE]: 'bg-info-soft text-info',
  [ADAPTIVE_STATUSES.COMPLETE]: 'bg-success-soft text-success',
  [ADAPTIVE_STATUSES.BLOCKED]: 'bg-warning-soft text-warning',
  [ADAPTIVE_STATUSES.FAILED]: 'bg-danger-soft text-danger',
  [ADAPTIVE_STATUSES.CANCELLED]: 'bg-line-subtle text-ink-muted',
};

function locationLabel(sourceTitle, citation, page) {
  if (Number.isInteger(page)) return `${sourceTitle || 'Source'}, page ${page}`;
  return formatCitationLabel(citation, { title: sourceTitle || 'Source' });
}

function measuredLines(measured = {}) {
  const lines = [];
  if (measured.citationVerified === true) {
    lines.push('The answer citation was verified against the current source text.');
  }
  if (Number.isFinite(measured.keywordOverlap) && measured.keywordOverlap > 0) {
    lines.push(
      `${measured.keywordOverlap} question term${
        measured.keywordOverlap === 1 ? '' : 's'
      } also occur in the verified answer. This is a keyword signal, not a semantic proof.`
    );
  }
  if (typeof measured.practiceCorrect === 'boolean') {
    lines.push(
      measured.practiceCorrect
        ? 'The exact-source recall check was answered correctly.'
        : 'The exact-source recall check did not match the source wording.'
    );
  }
  if (Number.isFinite(measured.wrongAttempts)) {
    lines.push(
      `${measured.wrongAttempts} incorrect attempt${
        measured.wrongAttempts === 1 ? '' : 's'
      } recorded in this check.`
    );
  }
  if (measured.visualStatus === 'invalid') {
    lines.push('Visual data failed validation and was not shown.');
  }
  if (measured.workedExampleShown === true) {
    lines.push('A worked example was assembled from a verified source sentence.');
  }
  if (measured.retrievalSucceeded === false) {
    lines.push('Source retrieval did not produce a verified answer.');
  }
  if (lines.length === 0) {
    lines.push('No measured outcome has been recorded yet.');
  }
  return lines;
}

function recordCounts(adaptive) {
  return [
    ['Source facts', adaptive.sourceFacts?.length || 0],
    ['Rule-based explanations', adaptive.generatedExplanations?.length || 0],
    ['Learner input', adaptive.userProvided?.length || 0],
    ['Assessment evidence', adaptive.assessmentEvidence?.length || 0],
    ['Hypotheses', adaptive.hypotheses?.length || 0],
    ['Experimental results', adaptive.experimentalResults?.length || 0],
    ['Unresolved questions', adaptive.unresolvedQuestions?.length || 0],
  ];
}

export default function AdaptiveLoopPanel({ adaptive }) {
  if (!adaptive) return null;

  const status = adaptive.status || ADAPTIVE_STATUSES.BLOCKED;
  const statusLabel = STATUS_LABELS[status] || 'Needs review';
  const statusClass = STATUS_CLASSES[status] || STATUS_CLASSES[ADAPTIVE_STATUSES.BLOCKED];
  const actionLabel = getAdaptiveActionLabel(adaptive.currentAction);
  const workedExample = [...(adaptive.generatedExplanations || [])]
    .reverse()
    .find(
      (item) =>
        item.generator === 'local_extractive_rule' && Boolean(item.citation)
    );
  const showWorkedExample =
    adaptive.currentAction === 'provide_worked_example' && workedExample;

  return (
    <section
      aria-labelledby="adaptive-loop-heading"
      className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
            Adaptive study loop
          </p>
          <h4 id="adaptive-loop-heading" className="mt-1 text-sm font-semibold">
            {actionLabel}
          </h4>
        </div>
        <span
          className={`w-fit shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>

      <p className="mt-2 text-violet-900">{adaptive.summary}</p>

      <div className="mt-3 rounded-lg border border-violet-200 bg-surface p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
          Measured this turn
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-violet-950">
          {measuredLines(adaptive.measured).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      {Array.isArray(adaptive.uncertainties) &&
        adaptive.uncertainties.length > 0 && (
          <div className="mt-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-warning">
            <p className="text-xs font-semibold uppercase tracking-wide text-warning">
              What remains uncertain
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
              {adaptive.uncertainties.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

      {showWorkedExample && (
        <div className="mt-3 rounded-lg border border-violet-300 bg-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
            Source-based worked example
          </p>
          <p className="mt-1 text-sm text-ink">{workedExample.text}</p>
          <p className="mt-2 text-xs font-medium text-violet-800">
            {locationLabel(
              workedExample.sourceTitle,
              workedExample.citation,
              workedExample.page
            )}
          </p>
          <p className="mt-1 text-xs text-violet-900">
            This is a rule-based assembly of a verified source sentence, not an
            AI-generated explanation and not a new assessment.
          </p>
        </div>
      )}

      <details className="mt-3 rounded-lg border border-violet-200 bg-violet-100/50 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-violet-900">
          Loop evidence and steps
        </summary>

        {adaptive.assumptions?.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
              Assumptions
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
              {adaptive.assumptions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {Array.isArray(adaptive.steps) && adaptive.steps.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
              Bounded steps
            </p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-xs">
              {adaptive.steps.map((step, index) => (
                <li key={`${step.action}-${step.status}-${index}`}>
                  {ADAPTIVE_ACTION_LABELS[step.action] || 'Adaptive action'} —{' '}
                  {step.status}
                  {step.reasonCode ? ` (${step.reasonCode})` : ''}
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
            Separately stored records
          </p>
          <ul className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            {recordCounts(adaptive).map(([label, count]) => (
              <li key={label}>
                {label}: {count}
              </li>
            ))}
          </ul>
        </div>

        {adaptive.corrections?.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
              Corrections
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
              {adaptive.corrections.map((correction, index) => (
                <li key={`${correction.text}-${index}`}>{correction.text}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-2 text-xs text-violet-800">
          This loop uses local deterministic rules. It does not call an AI model,
          so it cannot generate a new explanation beyond the source text.
        </p>
      </details>
    </section>
  );
}
