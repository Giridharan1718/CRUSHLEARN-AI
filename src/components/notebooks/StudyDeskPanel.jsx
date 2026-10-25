import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatSearchResultLocation } from '../../notebooks/sourceRetrieval.mjs';
import {
  buildStudyKit,
  checkQuizAnswer,
  formatStudyKitForStorage,
} from '../../notebooks/studyTools.mjs';
import {
  CITATION_LOCATOR_KINDS,
  formatCitationLabel,
} from '../../notebooks/citations.mjs';
import { SOURCE_STATUSES } from '../../notebooks/sourceSchema.mjs';
import { GENERATORS } from '../../notebooks/generators.mjs';
import { runAdaptiveLoop } from '../../intelligence/adaptiveLoop.mjs';
import AdaptiveLoopPanel from './AdaptiveLoopPanel';
import ExplanationPanel from './ExplanationPanel';
import SourceEvidenceMap from './SourceEvidenceMap';
import ReadAloudButton from './ReadAloudButton';

function locationLabel(sourceTitle, citation, page) {
  if (Number.isInteger(page)) return `${sourceTitle}, page ${page}`;
  return formatCitationLabel(citation, { title: sourceTitle });
}

const StudyDeskPanel = ({
  sources = [],
  sourceContents = {},
  notebookId = '',
  userId = '',
  initialQuery = '',
  initialContext = null,
  onSaveStudyKit,
  onSaveLearningContext,
  onClearLearningContext,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const didInitialSearch = useRef(false);
  const [searchState, setSearchState] = useState({
    searched: false,
    results: [],
    errors: [],
  });
  const [answerState, setAnswerState] = useState({
    searched: false,
    answered: false,
    answer: null,
    message: '',
  });
  const [visualMatch, setVisualMatch] = useState(null);
  const [evidenceVisual, setEvidenceVisual] = useState(null);
  const [explainSelection, setExplainSelection] = useState(null);

  const toggleExplain = (target) => {
    setExplainSelection((current) =>
      current?.id === target.id ? null : target
    );
  };
  const [sessionContext, setSessionContext] = useState(initialContext);
  const [adaptive, setAdaptive] = useState(initialContext?.adaptive || null);
  const [turnMeta, setTurnMeta] = useState({
    usedContextTerms: [],
    resolvedQuestion: '',
  });
  const [practice, setPractice] = useState(initialContext?.practice || null);
  const [practiceResponse, setPracticeResponse] = useState('');
  const [practiceResult, setPracticeResult] = useState(
    initialContext?.practice?.lastResult || null
  );
  const [nextAction, setNextAction] = useState(initialContext?.nextAction || null);
  const [contextNotice, setContextNotice] = useState('');
  const searchInputRef = useRef(null);
  const practiceInputRef = useRef(null);
  const evidenceRef = useRef(null);
  const passagesRef = useRef(null);
  const [kit, setKit] = useState(null);
  const [kitError, setKitError] = useState('');
  const [buildNotice, setBuildNotice] = useState('');
  const [revealedCards, setRevealedCards] = useState({});
  const [answers, setAnswers] = useState({});
  const [quizResults, setQuizResults] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');

  const readySources = useMemo(
    () =>
      sources.filter(
        (source) =>
          source.status === SOURCE_STATUSES.READY &&
          source.hasExtractedText &&
          sourceContents[source.id]
      ),
    [sources, sourceContents]
  );
  const sourceSignature = useMemo(
    () =>
      sources
        .map(
          (source) =>
            `${source.id}:${source.status}:${source.characterCount}:${source.hasExtractedText}`
        )
        .join('|'),
    [sources]
  );
  const lastSourceSignature = useRef(sourceSignature);

  useEffect(() => {
    // The workspace revalidates the saved context after source changes. Keep the
    // local session pointer in sync so a removed source cannot leave a stale
    // "restore last answer" action on screen.
    setSessionContext(initialContext || null);
    setAdaptive(initialContext?.adaptive || null);
    if (initialContext?.answer) return;
    setPractice(null);
    setPracticeResponse('');
    setPracticeResult(null);
    setNextAction(initialContext?.nextAction || null);
    setTurnMeta({ usedContextTerms: [], resolvedQuestion: '' });
  }, [initialContext]);

  useEffect(() => {
    if (lastSourceSignature.current === sourceSignature) return;
    lastSourceSignature.current = sourceSignature;
    setKit(null);
    setKitError('');
    setBuildNotice('');
    setSearchState({ searched: false, results: [], errors: [] });
    setAnswerState({
      searched: false,
      answered: false,
      answer: null,
      message: '',
    });
    setVisualMatch(null);
    setEvidenceVisual(null);
    setPractice(null);
    setPracticeResponse('');
    setPracticeResult(null);
    setNextAction(null);
    setAdaptive(null);
    setTurnMeta({ usedContextTerms: [], resolvedQuestion: '' });
    setRevealedCards({});
    setAnswers({});
    setQuizResults({});
    setSaveNotice('');
    setContextNotice('');
  }, [sourceSignature]);

  const persistContext = async (context) => {
    if (!context || typeof onSaveLearningContext !== 'function') return;
    try {
      const result = await onSaveLearningContext(context);
      if (result?.ok === false) {
        setContextNotice(
          result?.errors?.[0] || 'The learning session could not be saved.'
        );
      } else {
        setContextNotice('Learning session saved on this device.');
      }
    } catch {
      setContextNotice('The learning session could not be saved.');
    }
  };

  const contextResults = (context) =>
    (context?.evidence || []).map((item, index) => ({
      id: `context-evidence-${index}`,
      sourceId: item.sourceId,
      sourceTitle: item.sourceTitle,
      text: item.quote,
      page: item.page,
      score: 0,
      matchedTerms: [],
      citation: item.citation,
    }));

  const showContext = (context) => {
    if (!context?.answer) return;
    setQuery(context.currentQuestion || '');
    setAnswerState({
      searched: true,
      ok: true,
      answered: true,
      answer: context.answer.text,
      citation: context.answer.citation,
      sourceTitle: context.answer.sourceTitle,
      page: context.answer.page,
      note: context.answer.note,
      message: '',
      errors: [],
    });
    setSearchState({
      searched: true,
      results: contextResults(context),
      errors: [],
    });
    setVisualMatch(context.relatedVisual || null);
    setEvidenceVisual(context.visual || null);
    setPractice(context.practice || null);
    setPracticeResponse('');
    setPracticeResult(context.practice?.lastResult || null);
    setNextAction(context.nextAction || null);
    setAdaptive(context.adaptive || null);
    setTurnMeta({
      usedContextTerms: context.usedContextTerms || [],
      resolvedQuestion: context.resolvedQuestion || '',
    });
    setContextNotice(
      typeof onSaveLearningContext === 'function'
        ? 'Restored from the learning session saved on this device.'
        : ''
    );
  };

  const applyTurnResult = (result) => {
    setSessionContext(result.context);
    setAnswerState({
      searched: true,
      ok: result.ok,
      answered: Boolean(result.answered),
      answer: result.answer || null,
      citation: result.citation || null,
      sourceTitle: result.sourceTitle || '',
      page: result.page || null,
      note: result.note || '',
      message: result.message || '',
      errors: result.errors || [],
    });
    setSearchState({
      searched: true,
      results: result.results || [],
      errors: result.errors || [],
    });
    setVisualMatch(result.relatedVisual || null);
    setEvidenceVisual(result.visual || null);
    setExplainSelection(null);
    setPractice(result.practice || null);
    setPracticeResponse('');
    setPracticeResult(result.practice?.lastResult || null);
    setNextAction(result.nextAction || null);
    setAdaptive(result.adaptive || result.context?.adaptive || null);
    setTurnMeta({
      usedContextTerms: result.usedContextTerms || [],
      resolvedQuestion: result.resolvedQuestion || '',
    });
    setContextNotice('');
    void persistContext(result.context);
  };

  const runSearch = async (question, previousContext = sessionContext) => {
    const result = await runAdaptiveLoop({
      event: { type: 'question', question },
      userId: userId || initialContext?.userId || '',
      notebookId: notebookId || initialContext?.notebookId || '',
      sources: readySources,
      sourceContents,
      previousContext,
    });

    if (result.status === 'cancelled') return;
    if (!result.context) {
      setContextNotice(
        result.errorCode === 'permission_denied'
          ? 'This notebook is not available for the current user.'
          : 'The adaptive study loop could not start.'
      );
      return;
    }

    applyTurnResult(result);
  };

  useEffect(() => {
    if (didInitialSearch.current) return;
    if (!initialQuery.trim()) return;

    if (
      initialContext?.answer &&
      initialContext.currentQuestion === initialQuery
    ) {
      didInitialSearch.current = true;
      setSessionContext(initialContext);
      showContext(initialContext);
      return;
    }

    if (readySources.length === 0) return;
    didInitialSearch.current = true;
    void runSearch(initialQuery, initialContext);
    // The initial query is intentionally consumed once. Later saves update the
    // parent context but must not re-run the search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, readySources, initialContext]);

  const handleSearch = async (event) => {
    event.preventDefault();
    if (!query.trim()) return;
    await runSearch(query);
  };

  let visualHref = '';
  if (visualMatch) {
    const params = new URLSearchParams();
    if (notebookId) {
      params.set('fromNotebook', notebookId);
      params.set('returnTab', 'study');
    }
    if (query.trim()) params.set('q', query.trim().slice(0, 300));
    const search = params.toString();
    visualHref = `/visual/${visualMatch.id}${search ? `?${search}` : ''}`;
  }

  const practiceClosed =
    Boolean(practiceResult?.correct) || adaptive?.status === 'blocked';

  const handlePracticeSubmit = async (event) => {
    event.preventDefault();
    if (!practice || practiceClosed) return;

    const result = await runAdaptiveLoop({
      event: { type: 'practice_response', response: practiceResponse },
      userId: userId || initialContext?.userId || '',
      notebookId: notebookId || initialContext?.notebookId || '',
      sources: readySources,
      sourceContents,
      previousContext: sessionContext,
    });

    if (result.status === 'cancelled') return;

    if (!result.context) {
      setContextNotice(
        result.errorCode === 'permission_denied'
          ? 'This notebook is not available for the current user.'
          : result.summary || 'The answer could not be checked.'
      );
      return;
    }

    if (result.practice) {
      setPractice(result.practice);
    } else if (result.attempt && practice) {
      setPractice({
        ...practice,
        attempts: [...(practice.attempts || []), result.attempt].slice(-10),
        lastResult: result.attempt,
      });
    }
    setPracticeResult(
      result.attempt || result.practice?.lastResult || practiceResult
    );
    setNextAction(result.nextAction || null);
    setSessionContext(result.context);
    setAdaptive(result.adaptive || result.context.adaptive || null);
    setContextNotice(
      result.feedbackMessage ||
        (result.ok ? '' : result.summary || 'The answer could not be checked.')
    );
    void persistContext(result.context);
  };

  const handleNextAction = () => {
    if (!nextAction) return;
    if (nextAction.target === 'practice') {
      practiceInputRef.current?.focus();
      practiceInputRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      return;
    }
    if (nextAction.target === 'evidence') {
      const target = evidenceRef.current || passagesRef.current;
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (nextAction.target === 'question') {
      searchInputRef.current?.focus();
      searchInputRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      return;
    }
    if (nextAction.target === 'related_visual') {
      evidenceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleRestoreSession = () => {
    if (sessionContext?.answer) showContext(sessionContext);
  };

  const handleClearSession = async () => {
    if (
      typeof onClearLearningContext !== 'function' ||
      !window.confirm('Clear the saved learning session for this notebook?')
    ) {
      return;
    }

    const result = await onClearLearningContext();
    if (result?.ok === false) {
      setContextNotice(
        result?.errors?.[0] || 'The learning session could not be cleared.'
      );
      return;
    }

    setSessionContext(null);
    setQuery('');
    setAnswerState({
      searched: false,
      answered: false,
      answer: null,
      message: '',
    });
    setSearchState({ searched: false, results: [], errors: [] });
    setVisualMatch(null);
    setEvidenceVisual(null);
    setPractice(null);
    setPracticeResponse('');
    setPracticeResult(null);
    setNextAction(null);
    setAdaptive(null);
    setTurnMeta({ usedContextTerms: [], resolvedQuestion: '' });
    setContextNotice('Saved learning session cleared.');
  };

  const handleBuildStudyKit = () => {
    setKitError('');
    setBuildNotice('');
    setSaveNotice('');
    const result = buildStudyKit({
      sources: readySources,
      sourceContents,
    });
    if (!result.ok) {
      setKit(null);
      setKitError(result.errors.join(' '));
      return;
    }
    setKit(result.kit);
    setBuildNotice(
      `Built from ${readySources.length} ready source${
        readySources.length === 1 ? '' : 's'
      } with local extractive tools.`
    );
    setRevealedCards({});
    setAnswers({});
    setQuizResults({});
  };

  const toggleCard = (cardId) => {
    setRevealedCards((current) => ({
      ...current,
      [cardId]: !current[cardId],
    }));
  };

  const handleCheckAnswer = (question) => {
    setQuizResults((current) => ({
      ...current,
      [question.id]: {
        correct: checkQuizAnswer(question, answers[question.id] || ''),
        checked: true,
      },
    }));
  };

  const handleSaveStudyKit = async () => {
    if (!kit || typeof onSaveStudyKit !== 'function') return;
    setSaving(true);
    setSaveNotice('');
    try {
      const result = await onSaveStudyKit({
        title: `Source study kit (${readySources.length} source${
          readySources.length === 1 ? '' : 's'
        })`,
        kind: 'study_kit',
        body: formatStudyKitForStorage(kit),
        citations: kit.citations,
        generator: GENERATORS.LOCAL_EXTRACTIVE,
        createdAt: new Date().toISOString(),
      });
      if (!result?.ok) {
        setSaveNotice(
          result?.errors?.[0] || 'The study kit could not be saved.'
        );
      } else {
        setSaveNotice('Saved to Study materials on this device.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="study-desk-heading"
      className="rounded-2xl border border-line bg-surface p-6 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary-700">
            Source study desk
          </p>
          <h2 id="study-desk-heading" className="mt-1 text-xl font-semibold text-ink">
            Search, recall and revise
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-ink-muted">
            These tools search and quote the sources you added. They run locally
            and do not call an AI model, so they cannot explain anything beyond
            the text you supplied.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-line-subtle px-3 py-1 text-xs font-semibold text-ink-muted">
          {readySources.length} ready source
          {readySources.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-info-soft bg-info-soft p-3 text-sm text-info">
        Local extractive mode: summaries and cards copy or quote source text and
        always keep a source reference. Scanned PDFs are not OCR&apos;d. AI chat
        and AI-generated explanations remain unavailable until a provider is
        configured.
      </div>

      {contextNotice && (
        <div
          role="status"
          className="mt-3 rounded-lg border border-line bg-line-subtle p-3 text-sm text-ink-muted"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>{contextNotice}</p>
            {sessionContext?.currentQuestion &&
              typeof onClearLearningContext === 'function' && (
                <button
                  type="button"
                  onClick={handleClearSession}
                  className="shrink-0 text-xs font-semibold text-ink-muted underline hover:text-ink"
                >
                  Clear saved session
                </button>
              )}
          </div>
        </div>
      )}

      {sessionContext?.currentQuestion &&
        sessionContext?.answer &&
        !answerState.searched && (
        <section
          aria-labelledby="saved-session-heading"
          className="mt-4 rounded-xl border border-info/40 bg-info-soft p-4 text-sm text-info"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-info">
            Saved learning session
          </p>
          <h3 id="saved-session-heading" className="mt-1 font-semibold">
            Continue from your last source question
          </h3>
          <p className="mt-1 text-info">
            {sessionContext.currentQuestion}
          </p>
          {sessionContext.answer && (
            <blockquote className="mt-2 border-l-4 border-info pl-3 text-sm">
              {sessionContext.answer.text}
            </blockquote>
          )}
          {sessionContext.nextAction && (
            <p className="mt-2 text-xs text-info">
              Recommended next step: {sessionContext.nextAction.title}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {sessionContext.answer && (
              <button
                type="button"
                onClick={handleRestoreSession}
                className="rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-ink-inverse hover:bg-ink"
              >
                Restore last answer
              </button>
            )}
            {typeof onClearLearningContext === 'function' && (
              <button
                type="button"
                onClick={handleClearSession}
                className="rounded-lg border border-info px-3 py-2 text-xs font-semibold text-info hover:bg-info-soft"
              >
                Clear session
              </button>
            )}
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <h3 className="font-semibold text-ink">Ask your sources</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Ask a question or search for a phrase. The answer is the most
            relevant exact source sentence, not a generated explanation, and
            matching passages remain visible for checking.
          </p>

          <form onSubmit={handleSearch} className="mt-3">
            <label
              htmlFor="source-search"
              className="block text-sm font-medium text-ink-muted"
            >
              Question or search phrase
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="source-search"
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={300}
                placeholder="e.g. What does chlorophyll absorb?"
                className="min-w-0 flex-1 rounded-lg border border-line px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500"
              />
              <button
                type="submit"
                disabled={readySources.length === 0 || !query.trim()}
                className="rounded-lg bg-primary-600 px-4 py-3 text-sm font-semibold text-ink-inverse hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ask sources
              </button>
            </div>
          </form>

          {answerState.searched &&
            answerState.ok &&
            answerState.answered &&
            answerState.answer && (
              <section
                aria-label="Extractive source answer"
                className="mt-4 rounded-xl border border-primary-200 bg-primary-50 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
                    Extractive source answer
                  </p>
                  <ReadAloudButton
                    text={answerState.answer}
                    label="Read answer"
                  />
                </div>
                <blockquote className="mt-2 border-l-4 border-primary-300 pl-3 text-sm text-ink">
                  {answerState.answer}
                </blockquote>
                <p className="mt-2 text-xs font-medium text-primary-700">
                  {locationLabel(
                    answerState.sourceTitle,
                    answerState.citation,
                    answerState.page
                  )}
                </p>
                <p className="mt-2 text-xs text-ink-muted">
                  {answerState.note}
                </p>
                {turnMeta.usedContextTerms.length > 0 && (
                  <p className="mt-2 rounded-lg border border-info/40 bg-info-soft p-2 text-xs text-info">
                    Resolved this follow-up with prior session context:{" "}
                    {turnMeta.usedContextTerms.join(', ')}.
                  </p>
                )}
                <div className="mt-3">
                  <button
                    type="button"
                    aria-pressed={explainSelection?.id === 'answer'}
                    onClick={() =>
                      toggleExplain({
                        id: 'answer',
                        text: answerState.answer,
                        sourceId: answerState.citation?.sourceId || '',
                        sourceTitle: answerState.sourceTitle,
                        page: Number.isInteger(answerState.page)
                          ? answerState.page
                          : null,
                        selectionStart:
                          answerState.citation?.locator?.kind === CITATION_LOCATOR_KINDS.OFFSET
                            ? answerState.citation.locator.start
                            : null,
                      })
                    }
                    className="rounded-lg border border-primary-200 bg-surface px-3 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-50"
                  >
                    {explainSelection?.id === 'answer'
                      ? 'Hide explanation'
                      : 'Explain this simply'}
                  </button>
                  {explainSelection?.id === 'answer' && (
                    <ExplanationPanel
                      selection={explainSelection}
                      sourceTexts={sourceContents}
                      notebookId={notebookId}
                      userId={userId}
                      returnTab="study"
                    />
                  )}
                </div>
              </section>
            )}

          {answerState.searched && answerState.answered && evidenceVisual && (
            <div ref={evidenceRef} className="mt-4">
              <SourceEvidenceMap visual={evidenceVisual} />
            </div>
          )}

          {answerState.searched &&
            answerState.ok &&
            !answerState.answered &&
            answerState.message && (
              <p className="mt-4 rounded-lg border border-dashed border-line bg-line-subtle p-4 text-sm text-ink-muted">
                {answerState.message}
              </p>
            )}

          {searchState.errors.length > 0 && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger"
            >
              {searchState.errors.join(' ')}
            </div>
          )}

          {answerState.answered && visualMatch && (
            <div className="mt-4 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
              <p className="text-xs font-semibold uppercase tracking-wide text-warning">
                Related authored visual
              </p>
              <p className="mt-1 font-semibold">{visualMatch.title}</p>
              <p className="mt-1 text-xs text-warning">
                This process visualization is authored in the app. It is not
                generated from, or evidence for, your uploaded source. The
                source evidence map above is the only source-grounded visual.
              </p>
              <Link
                to={visualHref}
                className="mt-3 inline-block rounded-lg bg-warning px-3 py-2 text-xs font-semibold text-ink-inverse hover:bg-warning-strong"
              >
                Open authored visual
              </Link>
            </div>
          )}

          {practice && answerState.answered && (
            <section
              aria-labelledby="source-practice-heading"
              className="mt-4 rounded-xl border border-success/40 bg-success-soft p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-success">
                Practice check
              </p>
              <h4
                id="source-practice-heading"
                className="mt-1 text-sm font-semibold text-success-soft"
              >
                {practice.prompt}
              </h4>
              <form onSubmit={handlePracticeSubmit} className="mt-3">
                <label
                  htmlFor="source-practice-answer"
                  className="block text-sm font-medium text-success-soft"
                >
                  Your answer
                </label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="source-practice-answer"
                    ref={practiceInputRef}
                    type="text"
                    value={practiceResponse}
                    onChange={(event) => setPracticeResponse(event.target.value)}
                    disabled={practiceClosed}
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded-lg border border-success bg-surface px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-success disabled:bg-success-soft"
                  />
                  <button
                    type="submit"
                    disabled={practiceClosed || !practiceResponse.trim()}
                    className="rounded-lg bg-success px-4 py-3 text-sm font-semibold text-ink-inverse hover:bg-success-strong disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Check answer
                  </button>
                </div>
              </form>

              {practiceResult && (
                <div
                  role="status"
                  className={`mt-3 rounded-lg border p-3 text-sm ${
                    practiceResult.correct
                      ? 'border-success bg-surface text-success-soft'
                      : 'border-warning bg-warning-soft text-warning'
                  }`}
                >
                  <p className="font-semibold">
                    {practiceResult.correct ? 'Correct' : 'Not quite yet'}
                  </p>
                  <p className="mt-1">
                    {practiceResult.correct
                      ? 'Your answer matches the source word.'
                      : adaptive?.status === 'blocked'
                        ? 'This check is closed without measured mastery. The verified source-based worked example is shown in the adaptive report below.'
                        : 'Review the exact verified passage above, then try the source wording again.'}
                  </p>
                  {practiceResult.correct && (
                    <>
                      <p className="mt-2 text-xs">{practice.explanation}</p>
                      <p className="mt-1 text-xs font-medium">
                        {locationLabel(
                          practice.sourceTitle,
                          practice.citation,
                          practice.page
                        )}
                      </p>
                    </>
                  )}
                </div>
              )}

              <p className="mt-2 text-xs text-success">{practice.note}</p>
            </section>
          )}

          {adaptive && answerState.searched && (
            <AdaptiveLoopPanel adaptive={adaptive} />
          )}

          {nextAction && answerState.searched && (
            <section
              aria-labelledby="next-action-heading"
              className="mt-4 rounded-xl border border-info/40 bg-info-soft p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-info">
                Recommended next step
              </p>
              <h4
                id="next-action-heading"
                className="mt-1 text-sm font-semibold text-info"
              >
                {nextAction.title}
              </h4>
              <p className="mt-1 text-sm text-info">{nextAction.reason}</p>
              {nextAction.id === 'open_related_visual' && visualHref ? (
                <Link
                  to={visualHref}
                  className="mt-3 inline-block rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-ink-inverse hover:bg-ink"
                >
                  Open authored visual
                </Link>
              ) : nextAction.target !== 'sources' ? (
                <button
                  type="button"
                  onClick={handleNextAction}
                  className="mt-3 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-ink-inverse hover:bg-ink"
                >
                  {nextAction.target === 'practice'
                    ? 'Go to practice'
                    : nextAction.target === 'evidence'
                      ? 'Review evidence'
                      : 'Continue'}
                </button>
              ) : null}
            </section>
          )}

          {searchState.results.length > 0 && (
            <div ref={passagesRef} className="mt-5">
              <h4 className="text-sm font-semibold text-ink">
                Matching passages ({searchState.results.length})
              </h4>
              <ol className="mt-2 space-y-3">
                {searchState.results.map((result) => (
                  <li
                    key={result.id}
                    className="rounded-xl border border-line bg-line-subtle p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
                        {formatSearchResultLocation(result)}
                      </p>
                      <ReadAloudButton text={result.text} label="Read result" />
                    </div>
                    <blockquote className="mt-2 border-l-4 border-primary-200 pl-3 text-sm text-ink-muted">
                      {result.text}
                    </blockquote>
                    <p className="mt-2 text-xs text-ink-subtle">
                      Exact source span verified before display.
                    </p>
                    <div className="mt-3">
                      <button
                        type="button"
                        aria-pressed={explainSelection?.id === result.id}
                        onClick={() =>
                          toggleExplain({
                            id: result.id,
                            text: result.text,
                            sourceId: result.citation?.sourceId || '',
                            sourceTitle: result.sourceTitle || '',
                            page: Number.isInteger(result.page)
                              ? result.page
                              : null,
                            selectionStart:
                              result.citation?.locator?.kind === CITATION_LOCATOR_KINDS.OFFSET
                                ? result.citation.locator.start
                                : null,
                          })
                        }
                        className="rounded-lg border border-primary-200 bg-surface px-3 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-50"
                      >
                        {explainSelection?.id === result.id
                          ? 'Hide explanation'
                          : 'Explain simply'}
                      </button>
                      {explainSelection?.id === result.id && (
                        <ExplanationPanel
                          selection={explainSelection}
                          sourceTexts={sourceContents}
                          notebookId={notebookId}
                          userId={userId}
                          returnTab="study"
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <div>
          <h3 className="font-semibold text-ink">Build a study kit</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Create a short extractive summary, recall cards and a
            fill-in-the-blank quiz from your ready sources. Nothing is invented;
            every card and question points back to a source span.
          </p>
          <button
            type="button"
            onClick={handleBuildStudyKit}
            disabled={readySources.length === 0}
            className="mt-3 rounded-lg bg-primary-600 px-4 py-3 text-sm font-semibold text-ink-inverse hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            Build study kit
          </button>

          {kitError && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger"
            >
              {kitError}
            </div>
          )}

          {buildNotice && !kitError && (
            <p
              role="status"
              className="mt-4 rounded-lg border border-success/40 bg-success-soft p-3 text-sm text-success"
            >
              {buildNotice}
            </p>
          )}

          {kit && (
            <div className="mt-5 space-y-5">
              {kit.summary && (
                <section aria-labelledby="summary-heading">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 id="summary-heading" className="font-semibold text-ink">
                      Extractive summary
                    </h4>
                    <ReadAloudButton
                      text={kit.summary.body}
                      label="Read summary"
                    />
                  </div>
                  <ul className="mt-2 space-y-2">
                    {kit.summary.sentences.map((sentence, index) => (
                      <li
                        key={`${sentence.sourceId}-${sentence.citation.locator.start}-${index}`}
                        className="rounded-lg border border-line bg-line-subtle p-3 text-sm text-ink-muted"
                      >
                        <p>{sentence.text}</p>
                        <p className="mt-2 text-xs font-medium text-primary-700">
                          {locationLabel(
                            sentence.sourceTitle,
                            sentence.citation,
                            sentence.page
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section aria-labelledby="flashcards-heading">
                <h4 id="flashcards-heading" className="font-semibold text-ink">
                  Recall cards ({kit.flashcards.length})
                </h4>
                <ul className="mt-2 space-y-2">
                  {kit.flashcards.map((card) => {
                    const revealed = revealedCards[card.id];
                    return (
                      <li
                        key={card.id}
                        className="rounded-lg border border-line bg-surface p-3"
                      >
                        <button
                          type="button"
                          onClick={() => toggleCard(card.id)}
                          aria-expanded={Boolean(revealed)}
                          className="w-full text-left text-sm font-medium text-ink"
                        >
                          {card.front}
                          <span className="ml-2 text-xs font-normal text-primary-700">
                            {revealed ? 'Hide answer' : 'Show answer'}
                          </span>
                        </button>
                        {revealed && (
                          <div
                            role="region"
                            aria-label={`Answer to ${card.front}`}
                            className="mt-3 border-t border-line pt-3"
                          >
                            <p className="text-sm text-ink-muted">{card.back}</p>
                            <p className="mt-2 text-xs font-medium text-primary-700">
                              {locationLabel(
                                card.sourceTitle,
                                card.citation,
                                card.page
                              )}
                            </p>
                            <ReadAloudButton text={card.back} label="Read answer" />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section aria-labelledby="quiz-heading">
                <h4 id="quiz-heading" className="font-semibold text-ink">
                  Recall quiz ({kit.quiz.length})
                </h4>
                <p className="mt-1 text-xs text-ink-subtle">
                  Answers are checked against the exact source term. This does
                  not update course mastery.
                </p>
                <ol className="mt-2 space-y-3">
                  {kit.quiz.map((question) => {
                    const result = quizResults[question.id];
                    return (
                      <li
                        key={question.id}
                        className="rounded-lg border border-line bg-line-subtle p-3"
                      >
                        <label
                          htmlFor={`quiz-answer-${question.id}`}
                          className="block text-sm text-ink"
                        >
                          {question.prompt}
                        </label>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <input
                            id={`quiz-answer-${question.id}`}
                            type="text"
                            value={answers[question.id] || ''}
                            onChange={(event) =>
                              setAnswers((current) => ({
                                ...current,
                                [question.id]: event.target.value,
                              }))
                            }
                            className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleCheckAnswer(question)}
                            className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-ink-inverse hover:bg-ink-muted"
                          >
                            Check answer
                          </button>
                        </div>
                        {result?.checked && (
                          <div
                            role="status"
                            className={`mt-2 rounded-lg p-3 text-sm ${
                              result.correct
                                ? 'border border-success/40 bg-success-soft text-success'
                                : 'border border-warning/40 bg-warning-soft text-warning'
                            }`}
                          >
                            <p className="font-semibold">
                              {result.correct
                                ? 'Correct.'
                                : `Not quite. Source answer: ${question.answer}`}
                            </p>
                            <p className="mt-1">{question.explanation}</p>
                            <p className="mt-2 text-xs font-medium text-primary-700">
                              {locationLabel(
                                question.sourceTitle,
                                question.citation,
                                question.page
                              )}
                            </p>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>

              {typeof onSaveStudyKit === 'function' && (
                <div className="border-t border-line pt-4">
                  <button
                    type="button"
                    onClick={handleSaveStudyKit}
                    disabled={saving}
                    className="rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-ink-inverse hover:bg-ink-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save study kit'}
                  </button>
                  {saveNotice && (
                    <p role="status" className="mt-2 text-sm text-ink-muted">
                      {saveNotice}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default StudyDeskPanel;
