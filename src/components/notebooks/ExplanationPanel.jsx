import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCitationLabel } from '../../notebooks/citations.mjs';
import {
  EXPLANATION_ACTIONS,
  EXPLANATION_LANGUAGES,
  EXPLANATION_LEVELS,
  EXPLANATION_LEVEL_LABELS,
  checkExplanationAnswer,
} from '../../notebooks/textExplanation.mjs';
import { orchestrateLearningRequest } from '../../ai/orchestrator.mjs';
import {
  buildExplanationRecordInput,
  createExplanationRecordStore,
} from '../../intelligence/explanationRecord.mjs';
import { readSettings, writeSettings } from '../../utils/settingsStore.mjs';
import ReadAloudButton from './ReadAloudButton.jsx';

const LEVEL_STORAGE_KEY = 'crushlearn_explain_level';

const MODE_LABELS = {
  simplify: 'Simplify this passage',
  word: 'Explain a word',
  example: 'Give me an example',
  steps: 'Explain step by step',
  sections: 'Break into sections',
  diagram: 'Show me a diagram',
  check: 'Test my understanding',
  another: 'Another explanation',
};

const ROLE_LABELS = {
  main: 'Main idea',
  support: 'Key detail',
  detail: 'From the selection',
  step: 'Step',
  example: 'Example from the source',
  'word-usage': 'How the selection uses it',
  limitation: 'Limitation or caveat',
  equation: 'Equation or symbolic relationship',
};

const LEVEL_STORAGE_VALUES = new Set(EXPLANATION_LEVELS);

function readStoredLevel() {
  try {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem(LEVEL_STORAGE_KEY);
    return LEVEL_STORAGE_VALUES.has(stored) ? stored : null;
  } catch {
    return null;
  }
}

function persistLevel(level) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LEVEL_STORAGE_KEY, level);
    }
  } catch {
    // Storage can be unavailable (private mode); the selector still works.
  }
  // The learner's chosen level is also their default in Settings, so the
  // next passage they open starts where they left off.
  writeSettings({ explanationLevel: level });
}

/**
 * selection: {
 *   text: string (verbatim selected text),
 *   sourceId?: string,
 *   sourceTitle?: string,
 *   page?: number | null,
 *   selectionStart?: number | null (offset inside the source text),
 * }
 */
const ExplanationPanel = ({
  selection,
  sourceTexts = null,
  notebookId = '',
  userId = '',
  returnTab = '',
}) => {
  // The learner's last used level wins; otherwise the default they set in
  // Settings is used.
  const [level, setLevel] = useState(
    () => readStoredLevel() || readSettings().explanationLevel
  );
  const [mode, setMode] = useState('simplify');
  const [wordDraft, setWordDraft] = useState('');
  const [submittedWord, setSubmittedWord] = useState('');
  const [language, setLanguage] = useState('en');
  const [checkDrafts, setCheckDrafts] = useState({});
  const [checkResults, setCheckResults] = useState({});
  const [ownWordsDraft, setOwnWordsDraft] = useState('');
  const [ownWordsResult, setOwnWordsResult] = useState(null);
  const [ownWordsError, setOwnWordsError] = useState('');
  const [recordNotice, setRecordNotice] = useState('');
  const [recordVersion, setRecordVersion] = useState(0);
  const [recordStore] = useState(() => {
    try {
      return typeof window === 'undefined'
        ? null
        : createExplanationRecordStore(window.localStorage);
    } catch {
      return null;
    }
  });

  const handleLevel = (nextLevel) => {
    setLevel(nextLevel);
    persistLevel(nextLevel);
  };

  const orchestration = useMemo(
    () =>
      orchestrateLearningRequest({
        task: 'explain',
        userId,
        notebookId,
        text: selection?.text || '',
        selection: selection || null,
        sourceTexts,
        sourceContents: sourceTexts,
        level,
        mode,
        word: submittedWord,
        language,
      }),
    [
      selection,
      sourceTexts,
      userId,
      notebookId,
      level,
      mode,
      submittedWord,
      language,
    ]
  );

  const result = orchestration?.data?.explanation || null;

  const handleMode = (nextMode) => {
    setMode(nextMode);
    if (nextMode === 'word') {
      setSubmittedWord('');
      setWordDraft('');
    }
    if (nextMode !== 'check') {
      setCheckDrafts({});
      setCheckResults({});
    }
  };

  const handleCheck = (question) => {
    const outcome = checkExplanationAnswer(question, checkDrafts[question.id]);
    setCheckResults((current) => ({
      ...current,
      [question.id]: outcome,
    }));
  };

  const handleOwnWords = () => {
    setOwnWordsError('');
    setOwnWordsResult(null);
    if (!ownWordsDraft.trim()) {
      setOwnWordsError('Write an explanation in your own words first.');
      return;
    }
    const response = orchestrateLearningRequest({
      task: 'assess',
      userId,
      notebookId,
      text: selection?.text || '',
      selection: selection || null,
      level,
      response: ownWordsDraft,
    });
    if (!response.ok) {
      setOwnWordsError(
        response.errors?.[0] || 'The response could not be evaluated.'
      );
      return;
    }
    setOwnWordsResult(response.data?.answerCheck || null);
  };

  const records = useMemo(() => {
    if (!recordStore || !userId || !notebookId) return [];
    // recordVersion is read so the list refreshes after save/delete.
    void recordVersion;
    return recordStore.list(userId, notebookId);
  }, [recordStore, userId, notebookId, recordVersion]);

  const handleSaveRecord = () => {
    if (!recordStore) {
      setRecordNotice('Learning records are unavailable in this browser.');
      return;
    }
    if (!userId || !notebookId) {
      setRecordNotice('Open this explanation inside a notebook to save it.');
      return;
    }
    const payload = buildExplanationRecordInput({
      explanation: result,
      sourceId: selection?.sourceId,
      sourceTitle: selection?.sourceTitle,
    });
    if (!payload) {
      setRecordNotice('There is no explanation to save.');
      return;
    }
    const saved = recordStore.save(userId, notebookId, payload);
    setRecordNotice(
      saved.ok
        ? 'Saved to your learning record on this device. Only metadata is stored.'
        : saved.errors?.[0] || 'The record could not be saved.'
    );
    if (saved.ok) setRecordVersion((value) => value + 1);
  };

  const handleDeleteRecord = (recordId) => {
    if (!recordStore) return;
    const removed = recordStore.remove(userId, notebookId, recordId);
    setRecordNotice(removed.ok ? 'Record deleted.' : 'The record could not be deleted.');
    if (removed.ok) setRecordVersion((value) => value + 1);
  };

  const handleClearRecords = () => {
    if (!recordStore) return;
    if (!window.confirm('Delete every saved explanation record for this notebook?')) {
      return;
    }
    const cleared = recordStore.clear(userId, notebookId);
    setRecordNotice(
      cleared.ok
        ? `Deleted ${cleared.removed} explanation record${cleared.removed === 1 ? '' : 's'}.`
        : 'The learning record could not be cleared.'
    );
    if (cleared.ok) setRecordVersion((value) => value + 1);
  };

  const handleExportRecords = () => {
    if (!recordStore) return;
    const exported = recordStore.export(userId, notebookId);
    if (!exported.ok) {
      setRecordNotice('The learning record could not be exported.');
      return;
    }
    try {
      const blob = new Blob([exported.json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'crushlearn-explanation-record.json';
      anchor.click();
      URL.revokeObjectURL(url);
      setRecordNotice(`Exported ${exported.count} record${exported.count === 1 ? '' : 's'}.`);
    } catch {
      setRecordNotice('The browser could not create the export file.');
    }
  };

  const diagramHref = useMemo(() => {
    if (!result?.diagram?.matched) return '';
    const params = new URLSearchParams();
    if (notebookId) {
      params.set('fromNotebook', notebookId);
      if (returnTab) params.set('returnTab', returnTab);
    }
    const search = params.toString();
    return `/visual/${result.diagram.id}${search ? `?${search}` : ''}`;
  }, [result?.diagram, notebookId, returnTab]);

  const explainedText = (result?.segments || [])
    .map((segment) => segment.text)
    .join(' ');
  const analysis = result?.analysis;
  const languageChoice =
    EXPLANATION_LANGUAGES.find((item) => item.code === language) ||
    EXPLANATION_LANGUAGES[0];

  return (
    <section
      aria-label="Explain difficult text simply"
      className="mt-4 rounded-xl border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-ink">Explain simply</h4>
        <ReadAloudButton text={explainedText} label="Read explanation" />
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        Extractive, not AI-generated: every sentence below is quoted verbatim
        from the text with its location. Nothing is added, and your original
        selection stays visible below.
      </p>
      <p className="mt-1 text-xs text-ink-subtle">
        Orchestrated locally as{' '}
        <span className="font-medium text-ink-muted">
          {orchestration?.workflow || 'direct explanation'}
        </span>
        {' · '}
        {orchestration?.servicesUsed?.join(', ') || 'text_understanding'}
        {' · '}
        {orchestration?.status || 'completed'}
      </p>

      {orchestration?.status === 'blocked' || orchestration?.status === 'failed' ? (
        <div role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
          <p>{orchestration.errors?.[0] || 'The explanation could not be produced.'}</p>
          <p className="mt-1 text-xs text-ink-muted">
            No notebook data was combined without authorization.
          </p>
        </div>
      ) : null}

      <div
        role="group"
        aria-label="Explanation level"
        className="mt-3 flex flex-wrap gap-2"
      >
        {EXPLANATION_LEVELS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={level === value}
            onClick={() => handleLevel(value)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              level === value
                ? 'bg-primary-600 text-ink-inverse hover:bg-accent-strong'
                : 'border border-line bg-line-subtle text-ink-muted hover:bg-surface'
            }`}
          >
            {EXPLANATION_LEVEL_LABELS[value]}
          </button>
        ))}
      </div>

      <div
        role="group"
        aria-label="Explanation actions"
        className="mt-2 flex flex-wrap gap-2"
      >
        {EXPLANATION_ACTIONS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => handleMode(value)}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
              mode === value
                ? 'bg-ink text-ink-inverse'
                : 'border border-line bg-surface text-ink hover:bg-line-subtle'
            }`}
          >
            {MODE_LABELS[value] || value}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="explanation-language" className="text-xs font-medium text-ink-muted">
          Explanation language
        </label>
        <select
          id="explanation-language"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500"
        >
          {EXPLANATION_LANGUAGES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
              {item.local ? '' : ' (not available locally)'}
            </option>
          ))}
        </select>
        {!languageChoice.local && (
          <p className="text-xs font-medium text-warning">
            Translation is not implemented. The explanation stays in English
            and this limitation is shown with the result.
          </p>
        )}
      </div>

      {mode === 'word' && (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedWord(wordDraft.trim());
          }}
        >
          <label htmlFor="explain-word-input" className="sr-only">
            Word to explain
          </label>
          <input
            id="explain-word-input"
            type="text"
            value={wordDraft}
            maxLength={60}
            onChange={(event) => setWordDraft(event.target.value)}
            placeholder="Type a word from the selection…"
            className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            disabled={!wordDraft.trim()}
            className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-ink-inverse hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            Explain word
          </button>
        </form>
      )}

      {!result ? (
        <div role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
          {orchestration?.errors?.[0] || 'The explanation could not be produced.'}
          <p className="mt-1 text-xs text-ink-muted">
            Your original selection is unchanged above and below.
          </p>
        </div>
      ) : !result.ok ? (
        <div role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
          {result.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
          <p className="mt-1 text-xs text-ink-muted">
            Your original selection is unchanged above and below.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-700">
              {result.subject?.label || 'General text'}
              {Number.isFinite(result.subject?.confidence)
                ? ` · ${Math.round(result.subject.confidence * 100)}% heuristic confidence`
                : ''}
            </span>
            <span className="rounded-full border border-line bg-line-subtle px-2 py-1 text-xs font-medium text-ink-muted">
              {result.levelNote}
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Strategy: {result.strategy?.focus}
          </p>
          {result.grounding === 'selection' && (
            <p className="mt-1 text-xs font-medium text-ink-muted">
              Grounding: your selection itself (no source text checked — the
              sentences below are quoted verbatim from it).
            </p>
          )}
          {result.language && !result.language.supported && (
            <p role="note" className="mt-2 rounded-lg border border-warning/40 bg-warning-soft p-2 text-xs font-medium text-warning">
              {result.language.note}
            </p>
          )}

          {analysis && (
            <details className="mt-3 rounded-lg border border-line bg-line-subtle p-3">
              <summary className="cursor-pointer text-xs font-semibold text-ink-muted">
                Content analysis before simplifying
              </summary>
              <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                    Main ideas
                  </p>
                  <ul className="mt-1 space-y-1">
                    {(analysis.mainIdeas || []).map((idea, index) => (
                      <li key={`main-${index}`} className="text-ink-muted">
                        “{idea.text}”
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                    Difficult terms
                  </p>
                  <p className="mt-1 text-ink-muted">
                    {(analysis.difficultTerms || []).map((item) => item.word).join(', ') || 'None detected.'}
                  </p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                    Prerequisite cues
                  </p>
                  <ul className="mt-1 space-y-1">
                    {(analysis.prerequisites || []).map((item, index) => (
                      <li key={`prereq-${index}`} className="text-ink-muted">
                        “{item.text}”
                      </li>
                    ))}
                    {(analysis.prerequisites || []).length === 0 && (
                      <li className="text-ink-subtle">No prerequisite cue detected.</li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                    Equations and quantities
                  </p>
                  <ul className="mt-1 space-y-1">
                    {(analysis.equations || []).map((item, index) => (
                      <li key={`equation-${index}`} className="text-ink-muted">
                        {item.text}
                      </li>
                    ))}
                    {(analysis.quantities || []).map((item, index) => (
                      <li key={`quantity-${index}`} className="text-ink">
                        {item.text}
                      </li>
                    ))}
                    {(analysis.equations || []).length === 0 &&
                      (analysis.quantities || []).length === 0 && (
                        <li className="text-ink-subtle">No equation or explicit quantity detected.</li>
                      )}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                    Ambiguities and limitations
                  </p>
                  <ul className="mt-1 space-y-1">
                    {(analysis.ambiguities || []).map((item, index) => (
                      <li key={`ambiguity-${index}`} className="text-ink-muted">
                        {item.reason} “{item.text}”
                      </li>
                    ))}
                    {(analysis.limitations || []).map((item, index) => (
                      <li key={`limit-${index}`} className="text-ink-muted">
                        {item.reason} “{item.text}”
                      </li>
                    ))}
                    {(analysis.ambiguities || []).length === 0 &&
                      (analysis.limitations || []).length === 0 && (
                        <li className="text-ink-subtle">No explicit ambiguity cue detected.</li>
                      )}
                  </ul>
                </div>
              </div>
              {analysis.table?.detected && (
                <p className="mt-2 text-xs text-ink-muted">
                  Table-like structure: {analysis.table.rows} rows ×{' '}
                  {analysis.table.columns} columns. Cell meaning is not inferred.
                </p>
              )}
            </details>
          )}

          {result.segments.length > 0 && (
            <ol className="mt-3 space-y-2">
              {result.segments.map((segment, index) => (
                <li
                  key={`${segment.start}-${segment.end}-${index}`}
                  className="rounded-lg border border-line bg-line-subtle p-3 text-sm text-ink"
                >
                  {segment.sectionTitle &&
                    (index === 0 || result.segments[index - 1].sectionTitle !== segment.sectionTitle) && (
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary-700">
                        {segment.sectionTitle}
                      </p>
                    )}
                  <p className="text-xs font-semibold text-ink-subtle">
                    {segment.role === 'step'
                      ? `${ROLE_LABELS.step} ${segment.stepNumber}`
                      : ROLE_LABELS[segment.role] || 'From the selection'}
                  </p>
                  <blockquote className="mt-1 border-l-4 border-primary-200 pl-2">
                    “{segment.text}”
                  </blockquote>
                  {segment.citation && (
                    <p className="mt-1 text-xs font-medium text-primary-700">
                      {formatCitationLabel(
                        segment.citation,
                        selection.sourceTitle
                          ? { title: selection.sourceTitle }
                          : undefined
                      )}
                    </p>
                  )}
                  {segment.verifiable && segment.verified && (
                    <p className="mt-1 text-xs font-medium text-success">
                      ✓ Verified against the source text.
                    </p>
                  )}
                  {segment.verifiable && !segment.verified && (
                    <p role="alert" className="mt-1 text-xs font-medium text-danger">
                      Citation check failed for this sentence — the original
                      text below is unchanged.
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}

          {result.why.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-ink-muted">
                Why it works (source sentences)
              </p>
              <ul className="mt-1 space-y-1">
                {result.why.map((item, index) => (
                  <li
                    key={`why-${item.start}-${index}`}
                    className="rounded-lg border border-info/40 bg-info-soft p-2 text-sm text-ink"
                  >
                    “{item.text}”
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.glossary.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-ink-muted">
                Terms defined in the selection
              </p>
              <dl className="mt-1 space-y-1">
                {result.glossary.map((entry, index) => (
                  <div
                    key={`${entry.term}-${index}`}
                    className="rounded-lg border border-line bg-surface p-2 text-sm"
                  >
                    <dt className="font-semibold text-ink">{entry.term}</dt>
                    <dd className="mt-1 text-ink-muted">“{entry.definition}”</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {result.facts.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-ink-muted">
                Numbers and facts kept exactly
              </p>
              <ul className="mt-1 flex flex-wrap gap-1" role="list">
                {result.facts.map((fact) => (
                  <li
                    key={`fact-${fact.start}-${fact.value}`}
                    className="rounded-full border border-line bg-line-subtle px-2 py-1 text-xs font-medium text-ink"
                  >
                    {fact.value}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.quantities.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-ink-muted">
                Quantities with units kept exactly
              </p>
              <ul className="mt-1 flex flex-wrap gap-1" role="list">
                {result.quantities.map((quantity) => (
                  <li
                    key={`quantity-${quantity.start}-${quantity.text}`}
                    className="rounded-full border border-info/40 bg-info-soft px-2 py-1 text-xs font-medium text-info"
                  >
                    {quantity.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.difficultWords.length > 0 && mode !== 'word' && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-ink-muted">
                Difficult words detected
              </p>
              <ul className="mt-1 flex flex-wrap gap-1" role="list">
                {(result.difficultTerms || []).map((item) => (
                  <li key={`word-${item.offset}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('word');
                        setWordDraft(item.word);
                        setSubmittedWord(item.word);
                      }}
                      className="rounded-full border border-primary-200 bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                    >
                      {item.word}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.verification?.checks?.length > 0 && (
            <details className="mt-3 rounded-lg border border-line bg-line-subtle p-3">
              <summary className="cursor-pointer text-xs font-semibold text-ink-muted">
                Accuracy checks ({result.verification.ok ? 'passed' : 'attention needed'})
              </summary>
              <ul className="mt-2 space-y-1 text-xs">
                {result.verification.checks.map((check) => (
                  <li
                    key={check.id}
                    className={check.ok ? 'text-success' : 'text-danger'}
                  >
                    {check.ok ? '✓' : '✕'} {check.detail}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-subtle">
                These checks cover preservation and quotation offsets. They do
                not prove the source claim is true.
              </p>
            </details>
          )}

          {result.limitations.length > 0 && (
            <div role="note" className="mt-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
              <p className="text-xs font-semibold uppercase tracking-wide">
                Honest limitations
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {result.limitations.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {result.questions.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-ink-muted">
                Fill in from memory, then verify
              </p>
              {result.questions.map((question) => (
                <div
                  key={question.id}
                  className="rounded-lg border border-line bg-line-subtle p-3 text-sm"
                >
                  <p className="text-ink">{question.prompt}</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <label htmlFor={`check-input-${question.id}`} className="sr-only">
                      Your answer
                    </label>
                    <input
                      id={`check-input-${question.id}`}
                      type="text"
                      value={checkDrafts[question.id] || ''}
                      maxLength={80}
                      onChange={(event) =>
                        setCheckDrafts((current) => ({
                          ...current,
                          [question.id]: event.target.value,
                        }))
                      }
                      className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleCheck(question)}
                      className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-ink-inverse hover:bg-accent-strong"
                    >
                      Check
                    </button>
                  </div>
                  {checkResults[question.id] && (
                    <div role="status" className="mt-2">
                      {checkResults[question.id].correct ? (
                        <p className="text-xs font-semibold text-success">
                          Correct — that matches the source sentence.
                        </p>
                      ) : (
                        <p className="text-xs font-semibold text-danger">
                          Not quite. The source sentence says: “
                          {question.sentence.text}”
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 rounded-lg border border-line bg-line-subtle p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Check your understanding
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Explain the idea in your own words. The app compares key-term
              coverage; it does not ask a model to grade you.
            </p>
            <label htmlFor="own-words-input" className="sr-only">
              Explain in your own words
            </label>
            <textarea
              id="own-words-input"
              value={ownWordsDraft}
              onChange={(event) => setOwnWordsDraft(event.target.value)}
              rows={3}
              maxLength={1200}
              className="mt-2 w-full rounded-lg border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500"
              placeholder="In my own words…"
            />
            <button
              type="button"
              onClick={handleOwnWords}
              className="mt-2 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-ink-inverse hover:bg-ink-muted"
            >
              Check my explanation
            </button>
            {ownWordsError && (
              <p role="alert" className="mt-2 text-xs text-danger">
                {ownWordsError}
              </p>
            )}
            {ownWordsResult && (
              <div role="status" className="mt-2 rounded-lg border border-info/40 bg-info-soft p-3 text-sm text-info">
                <p className="font-semibold">
                  Evidence: {ownWordsResult.understanding?.replaceAll('_', ' ')}
                </p>
                <p className="mt-1 text-xs">
                  Key-term coverage: {Math.round((ownWordsResult.coverage || 0) * 100)}%.
                  Missing terms: {ownWordsResult.missingTerms?.join(', ') || 'none'}.
                </p>
                <p className="mt-1 text-xs">{ownWordsResult.feedback}</p>
                <p className="mt-1 text-xs font-medium">
                  Next strategy: {ownWordsResult.nextStrategy?.replaceAll('_', ' ')}.
                  This is not mastery evidence.
                </p>
              </div>
            )}
          </div>

          {result.visualPlan && (
            <div className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                Visual learning
              </p>
              {result.diagram.matched && diagramHref ? (
                <>
                  <p className="mt-1 font-semibold">{result.diagram.title}</p>
                  <p className="mt-1 text-xs text-warning">
                    This visualization is authored in the app, not generated
                    from your source.
                  </p>
                  <Link
                    to={diagramHref}
                    className="mt-2 inline-block rounded-lg bg-warning px-3 py-2 text-xs font-semibold text-ink-inverse hover:bg-warning-strong"
                  >
                    Open curated visual
                  </Link>
                </>
              ) : (
                <>
                  <p className="mt-1 text-xs text-ink-muted">
                    {result.visualPlan.reason}
                  </p>
                  <p className="mt-1 text-xs text-ink-subtle">
                    No generated diagram, chart, animation or audio was produced.
                  </p>
                </>
              )}
            </div>
          )}

          {result.followUpQuestions?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-ink-muted">
                Questions to test the explanation
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-ink-muted">
                {result.followUpQuestions.map((item) => (
                  <li key={item.prompt}>{item.prompt}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-ink-subtle">
                These are generated study prompts, not source facts.
              </p>
            </div>
          )}

          {result.followUp && (
            <p className="mt-3 text-xs text-ink-muted">
              Next: {result.followUp}
            </p>
          )}

          <details className="mt-3 rounded-lg border border-line bg-line-subtle p-3">
            <summary className="cursor-pointer text-xs font-semibold text-ink-muted">
              Orchestration details
            </summary>
            <div className="mt-2 space-y-1 text-xs text-ink-muted">
              <p>Workflow: {orchestration.workflow}</p>
              <p>Status: {orchestration.status}</p>
              <p>Services: {orchestration.servicesUsed.join(', ')}</p>
              <p>
                Latency: {orchestration.metrics.latencyMs} ms · service calls:{' '}
                {orchestration.metrics.serviceCalls} · provider calls:{' '}
                {orchestration.metrics.providerCalls}
              </p>
              <p>
                Evidence items: {orchestration.evidence.source.length} · rule-based
                interpretations: {orchestration.interpretation.length}
              </p>
              {orchestration.unavailable.length > 0 && (
                <p>Unavailable: {orchestration.unavailable.join(', ')}</p>
              )}
            </div>
          </details>
        </>
      )}

      <details className="mt-3 rounded-lg border border-line bg-line-subtle p-3">
        <summary className="cursor-pointer text-xs font-semibold text-ink-muted">
          Compare original and explanation
        </summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Original selection
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
              {selection.text}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Explanation segments
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">
              {explainedText || 'No segments were shown.'}
            </p>
          </div>
        </div>
      </details>

      <details className="mt-3 rounded-lg border border-line bg-line-subtle p-3">
        <summary className="cursor-pointer text-xs font-semibold text-ink-muted">
          Show original selection
        </summary>
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
          {selection.text}
        </p>
      </details>

      <details className="mt-3 rounded-lg border border-line bg-line-subtle p-3">
        <summary className="cursor-pointer text-xs font-semibold text-ink-muted">
          Learning record ({records.length})
        </summary>
        <p className="mt-2 text-xs text-ink-muted">
          Opt-in and local. Only metadata (subject, level, concepts, checks) is
          stored — never source quotations or free-text answers.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSaveRecord}
            disabled={!result?.ok || !userId || !notebookId}
            className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-ink-inverse hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save this explanation
          </button>
          <button
            type="button"
            onClick={handleExportRecords}
            disabled={records.length === 0}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-line-subtle disabled:opacity-50"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={handleClearRecords}
            disabled={records.length === 0}
            className="rounded-lg border border-danger/40 px-3 py-2 text-xs font-semibold text-danger hover:bg-danger-soft disabled:opacity-50"
          >
            Delete all
          </button>
        </div>
        {recordNotice && (
          <p role="status" className="mt-2 text-xs text-ink-muted">
            {recordNotice}
          </p>
        )}
        {records.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-ink-muted">
            {records
              .slice(-5)
              .reverse()
              .map((record) => (
                <li
                  key={record.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface p-2"
                >
                  <span>
                    {record.subject} · {record.level} · {record.concepts.join(', ') || 'no concepts'} ·{' '}
                    {new Date(record.at).toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteRecord(record.id)}
                    className="font-semibold text-danger underline underline-offset-2"
                  >
                    Delete
                  </button>
                </li>
              ))}
          </ul>
        )}
        {!userId || !notebookId ? (
          <p className="mt-2 text-xs text-ink-subtle">
            Saving requires an open notebook and a signed-in learner.
          </p>
        ) : null}
      </details>
    </section>
  );
};

export default ExplanationPanel;
