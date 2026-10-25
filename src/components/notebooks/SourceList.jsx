import { useRef } from 'react';
import { SOURCE_STATUSES } from '../../notebooks/sourceSchema.mjs';

const STATUS_STYLES = {
  queued: 'bg-line-subtle text-ink-muted',
  processing: 'bg-info-soft text-info',
  ready: 'bg-success-soft text-success',
  failed: 'bg-danger-soft text-danger',
};

const TYPE_LABELS = {
  text: 'Text',
  markdown: 'Markdown',
  pdf: 'PDF',
  docx: 'DOCX',
  pasted_text: 'Pasted text',
  web: 'Web page',
};

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function RetrySourceControl({ source, onRetry, retrying = false }) {
  const inputRef = useRef(null);

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={retrying}
        className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={`Retry source ${source.title} with a file`}
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.markdown,.pdf,.docx"
        className="sr-only"
        tabIndex={-1}
        disabled={retrying}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onRetry?.(source, file);
        }}
      />
    </>
  );
}

const SourceList = ({
  sources = [],
  onDelete,
  onOpen,
  onRetry,
  retryingSourceId = null,
  openSourceId = null,
}) => {
  if (sources.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
        <p className="text-3xl mb-2" aria-hidden="true">
          📄
        </p>
        <h3 className="font-semibold text-ink">No sources yet</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Add pasted text, Markdown, a text file, a PDF or a DOCX document to
          start this notebook.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {sources.map((source) => (
        <li
          key={source.id}
          className="rounded-2xl border border-line bg-surface p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-ink break-words">
                  {source.title}
                </h3>
                <span className="rounded-full bg-line-subtle px-2 py-0.5 text-xs font-medium text-ink-muted">
                  {TYPE_LABELS[source.sourceType] || source.sourceType}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    STATUS_STYLES[source.status] || STATUS_STYLES.queued
                  }`}
                >
                  {source.status}
                </span>
              </div>

              {source.fileName && source.fileName !== source.title && (
                <p className="mt-1 text-xs text-ink-subtle">{source.fileName}</p>
              )}

              {source.url && (
                <p className="mt-1 break-all text-xs text-ink-subtle">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline-offset-2 hover:underline"
                  >
                    {source.url}
                  </a>
                  {source.retrievedAt
                    ? ` · retrieved ${formatDate(source.retrievedAt)}`
                    : ' · not retrieved'}
                </p>
              )}

              <p className="mt-2 text-sm text-ink-muted">
                {source.hasExtractedText
                  ? `Extracted text available · ${source.characterCount.toLocaleString()} characters${
                      source.pageCount
                        ? ` · ${source.pageCount} page${
                            source.pageCount === 1 ? '' : 's'
                          }`
                        : ''
                    }`
                  : 'No extracted text available'}
              </p>

              {source.error && (
                <p className="mt-2 rounded-lg border border-danger/40 bg-danger-soft p-2 text-sm text-danger">
                  {source.error}
                </p>
              )}

              <p className="mt-2 text-xs text-ink-subtle">
                Added {formatDate(source.createdAt)}
                {Number.isFinite(source.sizeBytes) && source.sizeBytes > 0
                  ? ` · ${source.sizeBytes.toLocaleString()} bytes`
                  : ''}
              </p>
            </div>

            <div className="flex shrink-0 flex-col gap-2">
              {onOpen && (
                <button
                  type="button"
                  onClick={() => onOpen(source)}
                  aria-pressed={openSourceId === source.id}
                  className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/20"
                  aria-label={`${
                    openSourceId === source.id ? 'Reading' : 'Read'
                  } source ${source.title}`}
                >
                  {openSourceId === source.id ? 'Reading' : 'Read'}
                </button>
              )}
              {onRetry && source.status === SOURCE_STATUSES.FAILED && (
                <RetrySourceControl
                  source={source}
                  onRetry={onRetry}
                  retrying={retryingSourceId === source.id}
                />
              )}
              <button
                type="button"
                onClick={() => onDelete?.(source)}
                className="rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft"
                aria-label={`Delete source ${source.title}`}
              >
                Delete
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
};

export default SourceList;
