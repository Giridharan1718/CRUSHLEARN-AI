import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SOURCE_STATUSES } from '../../notebooks/sourceSchema.mjs';
import { extractSourceConcepts } from '../../notebooks/sourceConcepts.mjs';
import { searchNotebookSources } from '../../notebooks/sourceRetrieval.mjs';
import { formatGeneratorLabel } from '../../notebooks/generators.mjs';
import PanelState from '../ui/PanelState';

/**
 * Contextual right panel for the notebook workspace.
 *
 * It only reports facts that are already stored in this browser: source
 * readiness, notes and materials, rule-based key terms, and the verified
 * learning-context summary. It never invents progress, mastery, or
 * recommendations beyond what exists.
 */
const NotebookContextPanel = ({
  notebook,
  sources = [],
  sourceContents = {},
  materials = [],
  learningContext = null,
  activeTab = 'study',
  onJumpTab,
  onOpenSource,
  onInspectCitation,
  headingId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchState, setSearchState] = useState({
    status: 'idle',
    results: [],
    error: '',
  });
  const readySourceCount = sources.filter(
    (source) => source.status === SOURCE_STATUSES.READY
  ).length;
  const processingSources = sources.length - readySourceCount;
  const notes = useMemo(
    () =>
      materials
        .filter((material) => material.kind === 'note')
        .sort((left, right) =>
          String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
        ),
    [materials]
  );
  const relatedMaterials = useMemo(
    () =>
      [...materials]
        .sort((left, right) =>
          String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
        )
        .slice(0, 5),
    [materials]
  );
  const noteCount = notes.length;
  const kitCount = materials.length - noteCount;
  const concepts = useMemo(
    () => extractSourceConcepts({ sources, sourceContents, limit: 6 }),
    [sources, sourceContents]
  );

  const context = learningContext;
  const answerVerified = Boolean(context?.answer);
  const practiceVerified = Boolean(context?.practice);
  const evidenceCount = Array.isArray(context?.evidence) ? context.evidence.length : 0;
  const visualCount = Array.isArray(context?.visual?.items) ? context.visual.items.length : 0;
  const adaptiveStatus = context?.adaptive?.status || null;

  const jump = (nextTab) => {
    if (nextTab !== activeTab && typeof onJumpTab === 'function') {
      onJumpTab(nextTab);
    }
  };

  const tabButton = (id, label) => (
    <button
      type="button"
      onClick={() => jump(id)}
      className="text-sm font-medium text-accent-strong underline-offset-2 transition hover:underline focus:outline-none focus:ring-2 focus:ring-accent/30"
    >
      {label}
    </button>
  );

  const runSearch = (event) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchState({
        status: 'error',
        results: [],
        error: 'Enter a word or phrase to search the stored sources.',
      });
      return;
    }
    const result = searchNotebookSources({
      sources,
      sourceContents,
      query,
      limit: 5,
    });
    setSearchState({
      status: result.ok && result.results.length > 0 ? 'success' : 'empty',
      results: result.results || [],
      error: result.errors?.[0] || '',
    });
  };

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5"
    >
      <h2 id={headingId} className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">
        Workspace context
      </h2>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-muted">Sources ready</dt>
          <dd className="font-semibold text-ink">
            {readySourceCount}/{sources.length}
          </dd>
        </div>
        {processingSources > 0 && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-muted">Processing</dt>
            <dd className="font-semibold text-warning">{processingSources}</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-muted">Saved study kits</dt>
          <dd className="font-semibold text-ink">{kitCount}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-muted">Saved notes</dt>
          <dd className="font-semibold text-ink">{noteCount}</dd>
        </div>
      </dl>

      <ContextGroup
        id="context-sources-heading"
        title="Sources"
        count={sources.length}
        empty="No sources yet."
      >
        {sources.length > 0 ? (
          <ul className="space-y-1.5">
            {sources.slice(0, 6).map((source) => (
              <li key={source.id}>
                {typeof onOpenSource === 'function' ? (
                  <button
                    type="button"
                    onClick={() => onOpenSource(source)}
                    className="w-full rounded-lg border border-line px-2.5 py-2 text-left text-xs font-medium text-ink hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30"
                  >
                    <span className="block truncate">{source.title}</span>
                    <span className="mt-0.5 block text-[11px] text-ink-subtle">
                      {source.status === SOURCE_STATUSES.READY
                        ? 'Ready · open and search'
                        : source.status || 'Stored source'}
                    </span>
                  </button>
                ) : (
                  <span className="block truncate text-xs text-ink-muted">{source.title}</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {sources.length > 6 ? (
          <p className="mt-1 text-[11px] text-ink-subtle">
            Showing 6 of {sources.length}. Open the source pane for all of them.
          </p>
        ) : null}

        <form onSubmit={runSearch} className="mt-3">
          <label htmlFor="context-source-search" className="text-xs font-semibold text-ink">
            Search stored source text
          </label>
          <div className="mt-1 flex gap-1.5">
            <input
              id="context-source-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="e.g. chlorophyll"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            <button
              type="submit"
              className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              Search
            </button>
          </div>
        </form>
        {searchState.status === 'error' ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {searchState.error}
          </p>
        ) : null}
        {searchState.status === 'empty' ? (
          <p role="status" className="mt-2 text-xs text-ink-muted">
            No stored passage matched. This does not prove the topic is absent.
          </p>
        ) : null}
        {searchState.results.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {searchState.results.map((result) => (
              <li key={result.id} className="rounded-lg border border-line bg-surface-muted p-2">
                <p className="text-[11px] font-semibold text-ink">{result.sourceTitle}</p>
                <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-ink-muted">
                  “{result.text}”
                </p>
                {typeof onInspectCitation === 'function' ? (
                  <button
                    type="button"
                    onClick={() => onInspectCitation(result.citation)}
                    className="mt-1 text-[11px] font-semibold text-accent-strong underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-accent/30"
                  >
                    Inspect in source
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </ContextGroup>

      <ContextGroup
        id="context-notes-heading"
        title="Notes"
        count={notes.length}
        empty="No notes saved yet."
      >
        {notes.length > 0 ? (
          <ul className="space-y-1">
            {notes.slice(0, 4).map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => jump('materials')}
                  className="w-full truncate rounded-lg px-1 py-1 text-left text-xs text-ink hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  {note.title}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-1 text-[11px] text-ink-subtle">
          {tabButton('materials', 'Open study materials')}
        </p>
      </ContextGroup>

      <ContextGroup
        id="context-concepts-heading"
        title="Concepts"
        count={concepts.length}
        empty="No recurring term is available yet."
      >
        {concepts.length > 0 ? (
          <>
            <p className="text-[11px] text-ink-subtle">
              Rule-based key terms from stored source text. Not model-generated topics.
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {concepts.map((concept) => (
                <li key={concept.id}>
                  <button
                    type="button"
                    onClick={() =>
                      concept.firstEvidence?.citation &&
                      onInspectCitation?.(concept.firstEvidence.citation)
                    }
                    disabled={!concept.firstEvidence?.citation}
                    title={
                      concept.firstEvidence?.citation
                        ? `Inspect the first quotation for “${concept.term}”`
                        : 'No verified quotation for this term'
                    }
                    className="rounded-full border border-line bg-surface-muted px-2 py-1 text-[11px] font-medium text-ink hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-default disabled:opacity-70"
                  >
                    {concept.term}
                    <span className="ml-1 text-ink-subtle">{concept.sourceCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : !sourceContents || Object.keys(sourceContents).length === 0 ? (
          <p className="text-[11px] text-ink-subtle">
            Concepts appear after a source has processed text stored on this device.
          </p>
        ) : null}
      </ContextGroup>

      <ContextGroup
        id="context-materials-heading"
        title="Related materials"
        count={materials.length}
        empty="No saved materials yet."
      >
        {relatedMaterials.length > 0 ? (
          <ul className="space-y-1">
            {relatedMaterials.map((material) => (
              <li key={material.id}>
                <button
                  type="button"
                  onClick={() => jump('materials')}
                  className="w-full rounded-lg px-1 py-1 text-left hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  <span className="block truncate text-xs text-ink">{material.title}</span>
                  <span className="block text-[11px] text-ink-subtle">
                    {formatGeneratorLabel(material.generator)} · {material.kind}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </ContextGroup>

      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-ink">Verified learning context</h3>
        {context ? (
          <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
            <li>
              Source-grounded answer:{' '}
              <span className={answerVerified ? 'font-semibold text-success' : 'text-ink-subtle'}>
                {answerVerified ? 'saved and citation-verified' : 'not earned yet'}
              </span>
            </li>
            <li>
              Retrieval practice:{' '}
              <span className={practiceVerified ? 'font-semibold text-success' : 'text-ink-subtle'}>
                {practiceVerified ? 'verified against a source' : 'not verified yet'}
              </span>
            </li>
            <li>
              Stored evidence items: <span className="font-semibold text-ink">{evidenceCount}</span>
            </li>
            <li>
              Visual explanations: <span className="font-semibold text-ink">{visualCount}</span>
            </li>
            {adaptiveStatus && (
              <li>
                Adaptive loop: <span className="font-semibold text-ink">{adaptiveStatus}</span>
              </li>
            )}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">
            No saved learning session yet. When you answer and practise in the
            Study desk, verified results are stored here on this device.
          </p>
        )}
        <p className="mt-3">
          {tabButton('study', 'Open study desk')} · {tabButton('materials', 'Study materials')}
        </p>
      </div>

      <p className="mt-4 border-t border-line pt-3 text-xs text-ink-subtle">
        Counts reflect only what is saved locally for “{notebook?.title}”. Deleted
        sources can remove unverifiable items on the next load.
      </p>
      <p className="mt-1 text-xs text-ink-subtle">
        AI tutoring is not connected in this build —{' '}
        <Link to="/about" className="underline-offset-2 hover:underline">
          learn what that means
        </Link>
        .
      </p>
    </section>
  );
};

function ContextGroup({ id, title, count, empty, children }) {
  return (
    <section aria-labelledby={id} className="mt-4 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id={id} className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          {title}
        </h3>
        <span className="rounded-full bg-line-subtle px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">
          {count}
        </span>
      </div>
      <div className="mt-2">
        {count === 0 ? <PanelState tone="empty" title={empty} className="text-xs" /> : children}
      </div>
    </section>
  );
}

export default NotebookContextPanel;
