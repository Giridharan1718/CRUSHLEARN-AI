import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildPassageContext,
  formatSearchResultLocation,
  searchNotebookSources,
} from '../../notebooks/sourceRetrieval.mjs';
import { formatCitationLabel, validateCitation } from '../../notebooks/citations.mjs';
import { SOURCE_STATUSES } from '../../notebooks/sourceSchema.mjs';
import { getSourcePreview, getSourceText } from '../../notebooks/sourceAccess.mjs';
import { findPageNumber } from '../../notebooks/sourceText.mjs';

const TYPE_LABELS = {
  text: 'Text',
  markdown: 'Markdown',
  pdf: 'PDF',
  docx: 'DOCX',
  pasted_text: 'Pasted text',
  web: 'Web page',
};

function locationLabel(result) {
  if (!result) return 'Source';
  if (Number.isInteger(result.page)) {
    return `${result.sourceTitle}, page ${result.page}`;
  }
  return formatCitationLabel(result.citation, { title: result.sourceTitle });
}

/**
 * Search inside a single source and read the passage in context.
 *
 * Everything shown here is the source's own stored text. The highlighted
 * span is the exact character range the citation verifier checked, so a
 * reader can confirm the quotation against the text around it.
 */
export default function SourceViewer({
  source,
  sourceContents = {},
  inspection = null,
  onUsePassage,
}) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ searched: false, results: [], errors: [] });
  const [selectedId, setSelectedId] = useState(null);
  const [showFullText, setShowFullText] = useState(false);
  const sectionRef = useRef(null);

  const isReady =
    source?.status === SOURCE_STATUSES.READY && source?.hasExtractedText;

  const preview = useMemo(
    () => getSourcePreview(sourceContents, source?.id),
    [sourceContents, source?.id]
  );

  const fullText = useMemo(
    () => getSourceText(sourceContents, source?.id) || '',
    [sourceContents, source?.id]
  );

  // A preview belongs to one source; do not carry an expanded reader or a
  // previous search result over when the learner opens a different source.
  useEffect(() => {
    setShowFullText(false);
    setQuery('');
    setState({ searched: false, results: [], errors: [] });
    setSelectedId(null);
  }, [source?.id]);

  const inspectionKey = inspection
    ? `${inspection.requestId || ''}:${inspection.sourceId || ''}:${
        inspection.locator?.start ?? ''
      }-${inspection.locator?.end ?? ''}`
    : '';

  // A citation click from chat, the context panel or the research tools opens
  // the exact offsets that were verified. The view never expands the citation
  // to a nearby paragraph without saying so; the surrounding text is shown
  // separately around the highlighted match.
  useEffect(() => {
    if (!source || !inspection || !isReady) return;
    if (inspection.sourceId && inspection.sourceId !== source.id) return;
    const sourceText = getSourceText(sourceContents, source.id) || '';
    const verification = validateCitation(inspection, {
      sourceIds: [source.id],
      sourceTexts: { [source.id]: sourceText },
      requireSourceText: true,
    });
    if (!verification.ok || !verification.verified) {
      setState({
        searched: true,
        results: [],
        errors: [
          verification.errors?.[0] ||
            'That quotation no longer matches the stored source text.',
        ],
      });
      setSelectedId(null);
      return;
    }
    const page = findPageNumber(
      sourceContents[source.id],
      verification.citation.locator.start
    );
    const result = {
      id: `inspection-${verification.citation.locator.start}-${verification.citation.locator.end}`,
      sourceId: source.id,
      sourceTitle: source.title,
      text: verification.citation.quote,
      page,
      matchedTerms: [],
      citation: verification.citation,
    };
    setQuery('');
    setState({ searched: true, results: [result], errors: [] });
    setSelectedId(result.id);
    window.requestAnimationFrame(() => sectionRef.current?.focus());
  }, [inspectionKey, source?.id, isReady, sourceContents]);

  const selected = useMemo(
    () => state.results.find((result) => result.id === selectedId) || null,
    [state.results, selectedId]
  );

  const context = useMemo(() => {
    if (!selected) return null;
    const locator = selected.citation?.locator;
    return buildPassageContext(
      sourceContents,
      selected.sourceId,
      locator?.start,
      locator?.end
    );
  }, [selected, sourceContents]);

  const runSearch = (event) => {
    event.preventDefault();
    if (!source) return;

    const result = searchNotebookSources({
      sources: [source],
      sourceContents,
      query,
      sourceId: source.id,
    });

    setState({
      searched: true,
      results: result.results,
      errors: result.errors || [],
    });
    setSelectedId(result.results[0]?.id || null);
  };

  if (!source) {
    return (
      <section className="rounded-2xl border border-dashed border-line bg-surface p-6 text-sm text-ink-muted">
        Choose a source to read and search it.
      </section>
    );
  }

  if (!isReady) {
    return (
      <section
        aria-labelledby="source-viewer-heading"
        className="rounded-2xl border border-line bg-surface p-6"
      >
        <h3
          id="source-viewer-heading"
          className="text-base font-semibold text-ink"
        >
          {source.title}
        </h3>
        <p className="mt-2 text-sm text-ink-muted">
          {source.error
            ? `This source could not be read: ${source.error}`
            : 'This source has no extracted text yet, so it cannot be searched or quoted.'}
        </p>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby="source-viewer-heading"
      className="rounded-2xl border border-line bg-surface p-5 shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="source-viewer-heading" className="font-semibold text-ink">
            {source.title}
          </h3>
          <p className="mt-1 text-xs text-ink-subtle">
            {TYPE_LABELS[source.sourceType] || source.sourceType} ·{' '}
            {source.characterCount.toLocaleString()} characters
            {source.pageCount
              ? ` · ${source.pageCount} page${source.pageCount === 1 ? '' : 's'}`
              : ''}
          </p>
        </div>
      </div>

      {preview.available ? (
        <div className="mt-4 rounded-xl border border-line bg-line-subtle/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Source preview
            </p>
            <span className="text-xs text-ink-subtle">
              {preview.hasMore
                ? `First ${preview.text.length.toLocaleString()} of ${preview.totalChars.toLocaleString()} characters`
                : `${preview.totalChars.toLocaleString()} characters`}
            </span>
          </div>

          <p
            id="source-preview-text"
            className={`mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink ${
              showFullText ? 'max-h-80 overflow-y-auto pr-1' : ''
            }`}
          >
            {showFullText ? fullText : preview.text}
            {!showFullText && preview.hasMore ? '…' : ''}
          </p>

          {preview.hasMore && (
            <button
              type="button"
              onClick={() => setShowFullText((current) => !current)}
              aria-expanded={showFullText}
              aria-controls="source-preview-text"
              className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              {showFullText ? 'Show preview' : 'View full text'}
            </button>
          )}
        </div>
      ) : (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger"
        >
          The stored text for this source could not be loaded, so no preview or
          search is available.
        </p>
      )}

      {preview.available && (
        <form onSubmit={runSearch} className="mt-4 flex flex-wrap gap-2">
          <label htmlFor="source-viewer-search" className="sr-only">
            Search inside {source.title}
          </label>
          <input
            id="source-viewer-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search inside this source"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-ink-inverse hover:bg-accent-strong"
          >
            Search
          </button>
        </form>
      )}

      {state.searched && state.errors.length > 0 && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger"
        >
          {state.errors[0]}
        </div>
      )}

      {state.searched && state.errors.length === 0 && state.results.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-line p-3 text-sm text-ink-muted">
          No passage in this source matches that search.
        </p>
      )}

      {state.results.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            {state.results.length} matching passage
            {state.results.length === 1 ? '' : 's'}
          </p>
          <ul className="mt-2 space-y-2">
            {state.results.map((result) => {
              const isSelected = result.id === selectedId;
              return (
                <li key={result.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(result.id)}
                    aria-pressed={isSelected}
                    className={`w-full rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-accent/20 ${
                      isSelected
                        ? 'border-accent bg-accent-soft/40'
                        : 'border-line hover:bg-line-subtle'
                    }`}
                  >
                    <span className="block truncate text-sm font-medium text-ink">
                      {result.text}
                    </span>
                    <span className="mt-1 block text-xs text-ink-subtle">
                      {formatSearchResultLocation(result)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {selected && context && (
        <div className="mt-5 rounded-xl border border-line bg-line-subtle/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Passage in context
            </p>
            <span className="rounded-full bg-success-soft px-2 py-1 text-xs font-semibold text-success">
              Citation verified
            </span>
          </div>

          <blockquote className="mt-3 text-sm leading-relaxed text-ink-muted">
            {context.before && (
              <span>
                …{context.before}
                <span className="sr-only"> (text before the match) </span>
              </span>
            )}
            <mark className="rounded bg-warning-soft px-0.5 font-medium text-ink">
              {context.match}
            </mark>
            {context.after && (
              <span>
                {context.after}…
                <span className="sr-only"> (text after the match) </span>
              </span>
            )}
          </blockquote>

          <p className="mt-3 text-xs font-medium text-ink-muted">
            {locationLabel(selected)}
            {Number.isInteger(context.page) && Number.isInteger(context.contextPage) &&
            context.contextPage !== context.page
              ? ` (the passage starts on page ${context.contextPage})`
              : ''}
          </p>

          {onUsePassage && (
            <button
              type="button"
              onClick={() => onUsePassage(selected)}
              className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              Use this passage
            </button>
          )}
        </div>
      )}
    </section>
  );
}
