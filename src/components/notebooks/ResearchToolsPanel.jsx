import { useEffect, useRef, useState } from 'react';
import { formatCitationLabel } from '../../notebooks/citations.mjs';
import { MATERIAL_GENERATORS } from '../../notebooks/generators.mjs';
import { askResearchGateway } from '../../notebooks/gatewayClient.mjs';
import {
  buildResearchAnswer,
  buildResearchPlan,
  compareNotebookEvidence,
  compareNotebookFindings,
  detectNotebookDisagreements,
  exploreNotebookTopic,
  mapGatewayConflicts,
  runGroundedResearch,
} from '../../ai/researchService.mjs';
import PanelState from '../ui/PanelState';

const CLASSIFICATION_STYLES = {
  supported: 'bg-success-soft text-success',
  partially_supported: 'bg-warning-soft text-warning',
  unsupported: 'bg-danger-soft text-danger',
};

function locationText(quote) {
  if (!quote) return 'Source';
  if (Number.isInteger(quote.page)) {
    return `page ${quote.page}`;
  }
  return formatCitationLabel(quote.citation, {
    title: quote.sourceTitle || 'Source',
  });
}

function InspectCitation({ quote, sourceTitle, onInspectCitation }) {
  if (!quote?.citation) return null;
  const label = sourceTitle || quote.sourceTitle || 'source';
  return (
    <button
      type="button"
      onClick={() => onInspectCitation?.(quote.citation)}
      className="mt-2 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-muted hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30"
      aria-label={`Inspect exact quotation in ${label}`}
    >
      Inspect exact quotation
    </button>
  );
}

function QuoteCard({
  quote,
  citation,
  sourceTitle,
  page,
  classification,
  reason,
  matchedTerms = [],
  onInspectCitation,
}) {
  return (
    <li className="rounded-xl border border-line bg-surface p-3">
      <blockquote className="border-l-2 border-accent/40 pl-3 text-sm leading-6 text-ink">
        “{quote}”
      </blockquote>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <span className="font-semibold text-ink">{sourceTitle || 'Source'}</span>
        <span aria-hidden="true">·</span>
        <span>{locationText({ citation, page, sourceTitle })}</span>
        {classification ? (
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${
              CLASSIFICATION_STYLES[classification] || 'bg-line-subtle text-ink-muted'
            }`}
          >
            {classification.replace(/_/g, ' ')}
          </span>
        ) : null}
      </div>
      {reason ? <p className="mt-2 text-xs leading-5 text-ink-muted">{reason}</p> : null}
      {matchedTerms.length > 0 ? (
        <p className="mt-1 text-xs text-ink-subtle">
          Matched terms: {matchedTerms.join(', ')}
        </p>
      ) : null}
      <InspectCitation
        quote={{ citation, sourceTitle, page }}
        sourceTitle={sourceTitle}
        onInspectCitation={onInspectCitation}
      />
    </li>
  );
}

function TrustLegend() {
  return (
    <div className="rounded-xl border border-line bg-surface-muted p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
        Trust categories in this result
      </p>
      <dl className="mt-2 grid gap-2 text-xs leading-5 sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-success">Notebook evidence</dt>
          <dd className="text-ink-muted">Exact quotations checked against stored source text.</dd>
        </div>
        <div>
          <dt className="font-semibold text-info">External information</dt>
          <dd className="text-ink-muted">Content supplied from outside the notebook. No lookup is run here.</dd>
        </div>
        <div>
          <dt className="font-semibold text-warning">Model interpretation</dt>
          <dd className="text-ink-muted">Provider-written wording, citation-checked but not source evidence.</dd>
        </div>
        <div>
          <dt className="font-semibold text-danger">Unverified hypothesis</dt>
          <dd className="text-ink-muted">A possible explanation the sources do not establish.</dd>
        </div>
      </dl>
    </div>
  );
}

function PlanStepList({ steps = [] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="mt-2 space-y-2">
      {steps.map((step) => (
        <li key={step.id} className="rounded-xl border border-line bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">{step.action}</span>
            <span className="rounded-full bg-line-subtle px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {step.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-ink-muted">{step.whatYouDo}</p>
          <p className="mt-1 text-xs leading-5 text-ink-subtle">
            Cannot: {step.whatTheAppCannotDo}
          </p>
        </li>
      ))}
    </ol>
  );
}

const ResearchToolsPanel = ({
  sources = [],
  sourceContents = {},
  gatewayStatus = null,
  onInspectCitation,
  onSaveMaterial,
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState(null);
  const [plan, setPlan] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [exploration, setExploration] = useState(null);
  const [conflicts, setConflicts] = useState(null);
  const [providerConflicts, setProviderConflicts] = useState([]);
  const [providerConflictNote, setProviderConflictNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [providerNote, setProviderNote] = useState('');
  const panelRef = useRef(null);
  const toggleRef = useRef(null);
  const resultsHeadingRef = useRef(null);
  const panelId = 'research-tools-panel';
  const headingId = 'research-tools-heading';
  const readyCount = sources.filter(
    (source) => source?.status === 'ready' && source?.hasExtractedText !== false
  ).length;
  const providerReady = Boolean(
    gatewayStatus?.available && gatewayStatus?.providerConfigured
  );

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    panelRef.current
      ?.querySelector('textarea, input, button, select, a[href]')
      ?.focus();
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const validate = () => {
    if (!question.trim()) {
      setError('Enter the research question you want the notebook checked against.');
      return false;
    }
    if (readyCount === 0) {
      setError('Add and process at least one source before using the research tools.');
      return false;
    }
    return true;
  };

  const finish = (callback) => {
    setBusy(true);
    setError('');
    setProviderNote('');
    setSaved(false);
    try {
      callback();
      window.setTimeout(() => resultsHeadingRef.current?.focus(), 0);
    } catch (runError) {
      setError(runError?.message || 'The research operation failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleAnswer = () => {
    if (!validate()) return;
    finish(() => {
      setAnswer(buildResearchAnswer({ question, sources, sourceContents }));
      setPlan(buildResearchPlan({ question, sources, sourceContents }));
      setConflicts(
        detectNotebookDisagreements({ question, sources, sourceContents })
      );
      setComparison(null);
      setExploration(null);
      setProviderConflicts([]);
      setProviderConflictNote('');
    });
  };

  const handleExplore = () => {
    if (!validate()) return;
    finish(() => {
      setExploration(
        exploreNotebookTopic({ topic: question, sources, sourceContents })
      );
      setComparison(null);
      setAnswer(null);
      setPlan(null);
      setProviderConflicts([]);
      setProviderConflictNote('');
    });
  };

  const handleCompare = (mode) => {
    if (!validate()) return;
    finish(() => {
      setComparison(
        mode === 'findings'
          ? compareNotebookFindings({ question, sources, sourceContents })
          : compareNotebookEvidence({ question, sources, sourceContents })
      );
      setAnswer(null);
      setPlan(null);
      setExploration(null);
      setProviderConflicts([]);
      setProviderConflictNote('');
    });
  };

  const handleConflicts = () => {
    if (!validate()) return;
    finish(() => {
      setConflicts(
        detectNotebookDisagreements({ question, sources, sourceContents })
      );
      setAnswer(null);
      setPlan(null);
      setComparison(null);
      setExploration(null);
      setProviderConflicts([]);
      setProviderConflictNote('');
    });
  };

  const handleProvider = async () => {
    if (!validate()) return;
    if (!providerReady) {
      setProviderNote(
        'The AI gateway is not available or has no provider key. The local tools still work; no model claim was requested.'
      );
      return;
    }
    setBusy(true);
    setError('');
    setProviderNote('');
    setProviderConflicts([]);
    setProviderConflictNote('');
    setSaved(false);
    try {
      const result = await runGroundedResearch({
        question,
        sources,
        sourceContents,
        gateway: (payload) =>
          askResearchGateway({
            ...payload,
            baseUrl: '',
          }),
      });
      setAnswer(result);
      setPlan(null);
      setComparison(null);
      setExploration(null);
      setConflicts({ ok: true, conflicts: result.data?.conflicts || [] });
      setProviderNote(
        result.data?.gateway?.used
          ? 'Provider claims were added below and every citation was checked in the browser.'
          : result.data?.gateway?.reason || result.errors?.[0] || 'No provider claims were added.'
      );
      window.setTimeout(() => resultsHeadingRef.current?.focus(), 0);
    } catch (providerError) {
      setProviderNote(
        providerError?.message ||
          'The provider request failed. The local answer was not replaced.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleProviderConflicts = async () => {
    if (!validate()) return;
    if (!providerReady) {
      setProviderConflictNote(
        'The AI gateway is not available or has no provider key. No model conflict review was requested.'
      );
      return;
    }

    const localAnswer = buildResearchAnswer({ question, sources, sourceContents });
    const spans = (localAnswer.evidence || [])
      .filter((item) => item.citation?.locator)
      .slice(0, 12)
      .map((item) => ({
        sourceId: item.sourceId,
        sourceTitle: item.sourceTitle || '',
        text: item.citation.quote,
        start: item.citation.locator.start,
        end: item.citation.locator.end,
        page: Number.isInteger(item.page) ? item.page : null,
      }));

    if (new Set(spans.map((span) => span.sourceId)).size < 2) {
      setProviderConflictNote(
        'At least two ready sources must match this question before a provider can review a possible cross-source conflict.'
      );
      return;
    }

    setBusy(true);
    setError('');
    setProviderConflictNote('');
    try {
      const response = await askResearchGateway({
        question,
        spans,
        operation: 'conflicts',
        baseUrl: '',
      });
      if (!response.ok) {
        setProviderConflicts([]);
        setProviderConflictNote(
          response.error ||
            'The provider conflict review failed. The local conflict signals are unchanged.'
        );
        return;
      }
      const mapped = mapGatewayConflicts({
        conflicts: response.data?.conflicts,
        spans,
      });
      setProviderConflicts(mapped);
      setProviderConflictNote(
        mapped.length > 0
          ? `${mapped.length} provider conflict signal${
              mapped.length === 1 ? '' : 's'
            } below. Each passage was mapped back to a verified span and citation-checked in the browser.`
          : 'The provider returned no cross-source conflict signal. This is not proof that the sources agree.'
      );
      window.setTimeout(() => resultsHeadingRef.current?.focus(), 0);
    } catch (providerError) {
      setProviderConflicts([]);
      setProviderConflictNote(
        providerError?.message ||
          'The provider conflict review failed. The local conflict signals are unchanged.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () => {
    if (!onSaveMaterial) {
      setProviderNote('Saving research material is not available on this screen.');
      return;
    }
    if (!answer?.ok) {
      setProviderNote('Run the local research answer before saving a brief.');
      return;
    }
    onSaveMaterial({
      result: answer,
      generator: answer.data?.modelClaims?.length
        ? MATERIAL_GENERATORS.AI_ASSISTED
        : MATERIAL_GENERATORS.LOCAL_EXTRACTIVE,
    });
    setSaved(true);
  };

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-line bg-surface-muted/60 p-3 sm:p-4"
    >
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        <span>
          <span id={headingId} className="block text-sm font-semibold text-ink">
            Research tools
          </span>
          <span className="mt-0.5 block text-xs text-ink-muted">
            Advanced: evidence table, comparison, conflicts, gaps and plan. Collapsed by default.
          </span>
        </span>
        <span
          aria-hidden="true"
          className="flex-none rounded-full border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink-muted"
        >
          {open ? 'Hide' : 'Show'}
        </span>
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          className="mt-4 border-t border-line pt-4"
        >
          <label htmlFor="research-question" className="text-sm font-semibold text-ink">
            Research question
          </label>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            The tools search only the {readyCount} ready source
            {readyCount === 1 ? '' : 's'} in this notebook. No external literature search is performed.
          </p>
          <textarea
            id="research-question"
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);
              setSaved(false);
              setProviderConflicts([]);
              setProviderConflictNote('');
            }}
            rows={2}
            maxLength={300}
            className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="What do the sources establish about …?"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleAnswer}
              disabled={busy}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-ink-inverse hover:bg-accent-strong focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
            >
              Analyze sources
            </button>
            <button
              type="button"
              onClick={handleExplore}
              disabled={busy}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
            >
              Explore topic
            </button>
            <button
              type="button"
              onClick={() => handleCompare('positions')}
              disabled={busy}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
            >
              Compare positions
            </button>
            <button
              type="button"
              onClick={() => handleCompare('findings')}
              disabled={busy}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
            >
              Compare findings
            </button>
            <button
              type="button"
              onClick={handleConflicts}
              disabled={busy}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
            >
              Find explicit conflicts
            </button>
            <button
              type="button"
              onClick={handleProvider}
              disabled={busy || !providerReady}
              title={
                providerReady
                  ? 'Ask the configured provider for citation-checked claims'
                  : 'The gateway provider is not configured'
              }
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink-muted hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add provider claims
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-subtle">
            Provider state:{' '}
            {providerReady
              ? `ready${gatewayStatus?.model ? ` (${gatewayStatus.model})` : ''}`
              : gatewayStatus?.available
                ? 'gateway running without a provider key'
                : 'gateway not available'}
            . Local tools work without it.
          </p>

          {error ? (
            <PanelState tone="error" title="Research tool could not run" className="mt-3">
              {error}
            </PanelState>
          ) : null}
          {busy ? (
            <PanelState tone="loading" title="Checking stored sources…" className="mt-3">
              Searching the notebook and verifying citations.
            </PanelState>
          ) : null}
          {providerNote ? (
            <PanelState tone="info" title="Provider note" className="mt-3">
              {providerNote}
            </PanelState>
          ) : null}
          {!busy && !error && !answer && !plan && !comparison && !exploration && !conflicts ? (
            <PanelState tone="empty" title="Nothing run yet" className="mt-3">
              Enter a question and choose one local research operation. Results quote only verified
              stored passages.
            </PanelState>
          ) : null}

          <div
            ref={resultsHeadingRef}
            tabIndex={-1}
            className="mt-4 focus:outline-none"
            aria-live="polite"
          >
            {answer ? (
              <ResearchAnswer
                answer={answer}
                plan={plan}
                conflicts={conflicts}
                onInspectCitation={onInspectCitation}
                onSave={handleSave}
                saved={saved}
                providerReady={providerReady}
                onAskProvider={handleProvider}
                providerConflicts={providerConflicts}
                providerConflictNote={providerConflictNote}
                onAskProviderConflicts={handleProviderConflicts}
                reviewingConflicts={busy}
              />
            ) : null}

            {exploration ? (
              <section aria-labelledby="explore-results-heading">
                <h3 id="explore-results-heading" className="text-base font-semibold text-ink">
                  Topic exploration
                </h3>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  {exploration.data?.label}
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-success/30 bg-success-soft/20 p-3">
                    <h4 className="text-sm font-semibold text-success">
                      Covered aspects ({exploration.data?.coveredAspects?.length || 0})
                    </h4>
                    {exploration.data?.coveredAspects?.length ? (
                      <ul className="mt-2 space-y-2">
                        {exploration.data.coveredAspects.map((aspect) => (
                          <li key={aspect.id} className="rounded-lg border border-line bg-surface p-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-ink">{aspect.aspect}</span>
                              <span className="text-xs text-ink-muted">
                                {aspect.sourceCount} source{aspect.sourceCount === 1 ? '' : 's'}
                              </span>
                            </div>
                            <p className="text-xs text-ink-muted">{aspect.label}</p>
                            <InspectCitation
                              quote={aspect.citation ? { citation: aspect.citation } : null}
                              onInspectCitation={onInspectCitation}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-ink-muted">No recurring aspect was found.</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-warning/30 bg-warning-soft/20 p-3">
                    <h4 className="text-sm font-semibold text-warning">
                      Not covered ({exploration.data?.uncoveredAspects?.length || 0})
                    </h4>
                    {exploration.data?.uncoveredAspects?.length ? (
                      <ul className="mt-2 space-y-2">
                        {exploration.data.uncoveredAspects.map((aspect) => (
                          <li key={aspect.id} className="rounded-lg border border-line bg-surface p-2">
                            <p className="text-sm font-semibold text-ink">{aspect.aspect}</p>
                            <p className="text-xs leading-5 text-ink-muted">{aspect.reason}</p>
                            <p className="text-[11px] text-ink-subtle">{aspect.label}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-ink-muted">
                        No uncovered question term or unmatched source was detected. This is not proof
                        that no gap exists.
                      </p>
                    )}
                  </div>
                </div>
                <GapList gaps={exploration.data?.gaps || []} onInspectCitation={onInspectCitation} />
                <QuestionList
                  questions={exploration.data?.questions || []}
                  heading="Research questions from this collection"
                />
              </section>
            ) : null}

            {comparison ? (
              <ComparisonResult
                result={comparison}
                onInspectCitation={onInspectCitation}
              />
            ) : null}

            {conflicts && !answer ? (
              <ConflictList
                conflicts={conflicts.conflicts || []}
                onInspectCitation={onInspectCitation}
                limitations={conflicts.limitations}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
};

function ResearchAnswer({
  answer,
  plan,
  conflicts,
  onInspectCitation,
  onSave,
  saved,
  providerReady,
  onAskProvider,
  providerConflicts = [],
  providerConflictNote = '',
  onAskProviderConflicts,
  reviewingConflicts = false,
}) {
  const data = answer.data || {};
  const claims = data.claims || [];
  const modelClaims = data.modelClaims || [];
  const assessment = data.claimAssessment || {};
  const evidenceRows = plan?.data?.evidenceTable?.rows || data.evidenceTable?.rows || [];

  return (
    <div className="space-y-4">
      <TrustLegend />
      <section aria-labelledby="research-answer-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="research-answer-heading" className="text-base font-semibold text-ink">
            Source-grounded claims
          </h3>
          <span className="rounded-full bg-surface px-2 py-1 text-xs font-semibold text-ink-muted">
            {assessment.supported || 0} supported · {assessment.partially_supported || 0} partial ·{' '}
            {assessment.unsupported || 0} unsupported
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-ink-muted">{data.label || answer.limitations?.[0]}</p>
        {claims.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {claims.map((claim) => (
              <QuoteCard
                key={claim.id}
                quote={claim.text}
                citation={claim.citation}
                sourceTitle={claim.sourceTitle}
                page={claim.page}
                classification={claim.classification}
                reason={claim.classificationReason}
                matchedTerms={claim.matchedTerms || []}
                onInspectCitation={onInspectCitation}
              />
            ))}
          </ul>
        ) : (
          <PanelState tone="empty" title="No verified claim was found" className="mt-2">
            The stored sources contain no passage that could be verified for this question. Add a
            source or try a term that occurs in the text.
          </PanelState>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={claims.length === 0}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
          >
            {modelClaims.length
              ? 'Save AI-assisted research brief'
              : 'Save extractive research brief'}
          </button>
          {saved ? <span className="self-center text-xs text-success">Saved to materials.</span> : null}
        </div>
      </section>

      <section
        aria-labelledby="external-information-heading"
        className="rounded-xl border border-info/30 bg-info-soft/20 p-3"
      >
        <h3 id="external-information-heading" className="text-sm font-semibold text-info">
          External information
        </h3>
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          {data.externalInformation?.note ||
            'No external web search or literature database was used.'}
        </p>
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          {plan?.data?.externalSearch?.reason ||
            'Any web pages already stored in this notebook are notebook evidence; this tool does not independently verify them.'}
        </p>
      </section>

      <section
        aria-labelledby="model-interpretation-heading"
        className="rounded-xl border border-warning/30 bg-warning-soft/20 p-3"
      >
        <h3 id="model-interpretation-heading" className="text-sm font-semibold text-warning">
          Model interpretation
        </h3>
        {modelClaims.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {modelClaims.map((claim) => (
              <QuoteCard
                key={claim.id}
                quote={claim.text}
                citation={claim.citation}
                sourceTitle={claim.sourceTitle}
                page={claim.page}
                classification={claim.classification}
                reason={claim.classificationReason}
                matchedTerms={claim.matchedTerms || []}
                onInspectCitation={onInspectCitation}
              />
            ))}
          </ul>
        ) : (
          <>
            <p className="mt-1 text-xs leading-5 text-ink-muted">
              No model interpretation is present. The claims above are local exact quotations, not
              model-generated prose.
            </p>
            {!providerReady ? (
              <p className="mt-1 text-xs text-ink-subtle">
                The gateway provider is not configured, so no provider claims were requested.
              </p>
            ) : (
              <button
                type="button"
                onClick={onAskProvider}
                className="mt-2 rounded-lg border border-current px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                Request provider claims
              </button>
            )}
          </>
        )}
      </section>

      <section
        aria-labelledby="provider-conflict-heading"
        className="rounded-xl border border-warning/30 bg-warning-soft/20 p-3"
      >
        <h3 id="provider-conflict-heading" className="text-sm font-semibold text-warning">
          Provider conflict review
        </h3>
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          This optional review asks the configured provider to compare the cited passages for an
          explicit disagreement. It is model interpretation, not a judgment about which source is
          correct, and it never changes the local rule-based conflict signal.
        </p>
        {providerReady ? (
          <button
            type="button"
            onClick={onAskProviderConflicts}
            disabled={reviewingConflicts}
            className="mt-2 rounded-lg border border-current px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
          >
            {providerConflicts.length > 0
              ? 'Review conflicts with provider again'
              : 'Ask provider to review conflicts'}
          </button>
        ) : (
          <p className="mt-1 text-xs text-ink-subtle">
            The gateway provider is not configured, so no provider conflict review was requested.
          </p>
        )}
        {providerConflictNote ? (
          <p className="mt-2 text-xs leading-5 text-ink-muted">{providerConflictNote}</p>
        ) : null}
        {providerConflicts.length > 0 ? (
          <ConflictList
            conflicts={providerConflicts}
            onInspectCitation={onInspectCitation}
            heading="Provider-surfaced conflict signals"
            headingId="provider-conflict-list-heading"
            limitations={[
              'A provider conflict signal is a model interpretation. It is not a source quotation and it does not settle which passage is correct.',
            ]}
          />
        ) : null}
      </section>

      <section
        aria-labelledby="hypotheses-heading"
        className="rounded-xl border border-danger/30 bg-danger-soft/20 p-3"
      >
        <h3 id="hypotheses-heading" className="text-sm font-semibold text-danger">
          Unverified hypotheses
        </h3>
        {answer.hypotheses?.length ? (
          <ul className="mt-2 space-y-2">
            {answer.hypotheses.map((hypothesis, index) => (
              <li key={`hypothesis-${index}`} className="rounded-lg border border-line bg-surface p-2">
                <p className="text-xs leading-5 text-ink">{hypothesis.text}</p>
                <p className="mt-1 text-[11px] text-ink-subtle">{hypothesis.basis}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            No unverified hypothesis was generated for this question.
          </p>
        )}
      </section>

      <section aria-labelledby="cannot-establish-heading">
        <h3 id="cannot-establish-heading" className="text-sm font-semibold text-ink">
          What the sources cannot establish
        </h3>
        <GapList gaps={data.cannotEstablish || data.gaps || []} onInspectCitation={onInspectCitation} />
      </section>

      <section aria-labelledby="followups-heading">
        <h3 id="followups-heading" className="text-sm font-semibold text-ink">
          Follow-up questions
        </h3>
        <QuestionList questions={data.followUps || []} heading="" />
      </section>

      {plan ? (
        <>
          <details className="rounded-xl border border-line bg-surface p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-accent/30">
              Search plan ({plan.data?.searchPlan?.length || 0} steps)
            </summary>
            <PlanStepList steps={plan.data?.searchPlan || []} />
            <p className="mt-2 text-xs text-ink-subtle">
              {plan.data?.externalSearch?.reason}
            </p>
          </details>

          <details className="rounded-xl border border-line bg-surface p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-accent/30">
              Evidence table ({evidenceRows.length} verified quotation
              {evidenceRows.length === 1 ? '' : 's'})
            </summary>
            <EvidenceTable rows={evidenceRows} onInspectCitation={onInspectCitation} />
          </details>

          <details className="rounded-xl border border-line bg-surface p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-accent/30">
              Source relevance ({plan.data?.sources?.length || 0} ready sources)
            </summary>
            <SourceRelevance rows={plan.data?.sources || []} onInspectCitation={onInspectCitation} />
          </details>
        </>
      ) : null}

      {conflicts?.conflicts?.length ? (
        <ConflictList
          conflicts={conflicts.conflicts}
          onInspectCitation={onInspectCitation}
          limitations={conflicts.limitations}
        />
      ) : null}
    </div>
  );
}

function EvidenceTable({ rows = [], onInspectCitation }) {
  if (rows.length === 0) {
    return <p className="mt-2 text-xs text-ink-muted">No verified evidence row was found.</p>;
  }
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr className="border-b border-line text-ink-muted">
            <th scope="col" className="px-2 py-2 font-semibold">Claim / exact quotation</th>
            <th scope="col" className="px-2 py-2 font-semibold">Source</th>
            <th scope="col" className="px-2 py-2 font-semibold">Location</th>
            <th scope="col" className="px-2 py-2 font-semibold">Status</th>
            <th scope="col" className="px-2 py-2 font-semibold">Inspect</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-line align-top">
              <td className="px-2 py-2 text-ink">“{row.quote}”</td>
              <td className="px-2 py-2 text-ink-muted">{row.sourceTitle}</td>
              <td className="px-2 py-2 text-ink-muted">
                {Number.isInteger(row.location?.page)
                  ? `page ${row.location.page}`
                  : `characters ${row.location?.start}-${row.location?.end}`}
              </td>
              <td className="px-2 py-2">
                <span className="rounded-full bg-success-soft px-2 py-0.5 font-semibold text-success">
                  {row.status}
                </span>
              </td>
              <td className="px-2 py-2">
                <InspectCitation quote={row} onInspectCitation={onInspectCitation} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourceRelevance({ rows = [], onInspectCitation }) {
  if (rows.length === 0) return null;
  return (
    <ul className="mt-2 space-y-2">
      {rows.map((row) => (
        <li key={row.sourceId} className="rounded-lg border border-line bg-surface-muted p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink">{row.title}</span>
            <span className="rounded-full bg-line-subtle px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
              {row.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-ink-muted">{row.reason}</p>
          {row.quote ? (
            <>
              <blockquote className="mt-1 border-l-2 border-line pl-2 text-xs leading-5 text-ink">
                “{row.quote}”
              </blockquote>
              <InspectCitation
                quote={row}
                sourceTitle={row.title}
                onInspectCitation={onInspectCitation}
              />
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ComparisonResult({ result, onInspectCitation }) {
  const rows = result.data?.rows || [];
  return (
    <section aria-labelledby="comparison-heading">
      <h3 id="comparison-heading" className="text-base font-semibold text-ink">
        {result.data?.mode === 'findings' ? 'Findings comparison' : 'Position comparison'}
      </h3>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{result.data?.note}</p>
      {rows.length > 0 ? (
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th scope="col" className="px-2 py-2 font-semibold">Source</th>
                {rows[0].dimensions.map((dimension) => (
                  <th key={dimension.dimension} scope="col" className="px-2 py-2 font-semibold">
                    {dimension.dimension}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.sourceId} className="border-b border-line align-top">
                  <th scope="row" className="px-2 py-2 text-left font-semibold text-ink">
                    {row.sourceTitle}
                  </th>
                  {row.dimensions.map((dimension) => (
                    <td key={dimension.dimension} className="px-2 py-2 text-ink-muted">
                      {dimension.quote ? (
                        <>
                          <span className="block text-ink">“{dimension.quote}”</span>
                          <span className="mt-1 block text-[11px] text-ink-subtle">
                            {dimension.note}
                          </span>
                          <InspectCitation
                            quote={dimension}
                            sourceTitle={row.sourceTitle}
                            onInspectCitation={onInspectCitation}
                          />
                        </>
                      ) : (
                        <span>{dimension.note}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <PanelState tone="empty" title="No comparison row was found" className="mt-2">
          No ready source had a passage matching this comparison question.
        </PanelState>
      )}
      <p className="mt-2 text-xs text-ink-subtle">
        Agreement inferred: no. {result.data?.agreement?.note}
      </p>
      <ConflictList
        conflicts={result.data?.conflicts || []}
        onInspectCitation={onInspectCitation}
        limitations={result.limitations}
      />
    </section>
  );
}

function ConflictList({
  conflicts = [],
  onInspectCitation,
  limitations = [],
  heading = 'Explicit conflict signals',
  headingId = 'conflict-heading',
}) {
  return (
    <section aria-labelledby={headingId} className="mt-4">
      <h3 id={headingId} className="text-sm font-semibold text-ink">
        {heading} ({conflicts.length})
      </h3>
      {conflicts.length === 0 ? (
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          No explicit negation or listed opposite-pair conflict was detected between different
          sources. This does not prove the sources agree.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {conflicts.map((conflict) => (
            <li key={conflict.id} className="rounded-xl border border-warning/30 bg-warning-soft/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-warning">
                {conflict.label}
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">{conflict.explanation}</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {[conflict.sourceA, conflict.sourceB].map((side) => (
                  <div key={`${conflict.id}-${side.sourceId}-${side.citation.locator.start}`}>
                    <p className="text-xs font-semibold text-ink">{side.sourceTitle}</p>
                    <blockquote className="mt-1 border-l-2 border-warning/50 pl-2 text-xs leading-5 text-ink">
                      “{side.quote}”
                    </blockquote>
                    <InspectCitation
                      quote={side}
                      sourceTitle={side.sourceTitle}
                      onInspectCitation={onInspectCitation}
                    />
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {limitations?.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-subtle">
          {limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1 text-xs text-ink-subtle">
        A conflict signal is not a judgment about which source is correct.
      </p>
    </section>
  );
}

function GapList({ gaps = [], onInspectCitation }) {
  if (gaps.length === 0) {
    return (
      <p className="mt-1 text-xs leading-5 text-ink-muted">
        No retrieval gap was detected. This is not proof that the collection has no gaps.
      </p>
    );
  }
  return (
    <ul className="mt-2 space-y-2">
      {gaps.map((gap) => (
        <li key={gap.id} className="rounded-xl border border-line bg-surface p-3">
          <p className="text-sm font-semibold text-ink">{gap.title}</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">{gap.detail}</p>
          <p className="mt-1 text-[11px] text-ink-subtle">{gap.label}</p>
          {gap.citations?.length ? (
            <ul className="mt-2 space-y-2">
              {gap.citations.map((citation, index) => (
                <li key={`${gap.id}-citation-${index}`}>
                  <blockquote className="border-l-2 border-line pl-2 text-xs leading-5 text-ink">
                    “{citation.quote}”
                  </blockquote>
                  <InspectCitation
                    quote={{ citation }}
                    onInspectCitation={onInspectCitation}
                  />
                </li>
              ))}
            </ul>
          ) : gap.trigger ? (
            <p className="mt-1 text-[11px] text-ink-subtle">
              Prompted by: {gap.trigger.kind === 'question_term'
                ? `the question term “${gap.trigger.term}”`
                : gap.trigger.kind === 'retrieval'
                  ? 'the retrieval result for this question'
                  : 'the stored source search result'}
              .
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function QuestionList({ questions = [], heading }) {
  if (questions.length === 0) return null;
  return (
    <div className="mt-2">
      {heading ? <h4 className="text-sm font-semibold text-ink">{heading}</h4> : null}
      <ul className="mt-1 space-y-2">
        {questions.map((question) => (
          <li key={question.id || question.question} className="rounded-lg border border-line bg-surface p-2">
            <p className="text-sm text-ink">{question.question}</p>
            <p className="mt-1 text-[11px] text-ink-subtle">
              {question.sourceTitle ? `Source: ${question.sourceTitle}. ` : ''}
              {question.basis}
              {question.expectedAnswerable === false ? ' Not answerable from the current collection.' : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ResearchToolsPanel;
