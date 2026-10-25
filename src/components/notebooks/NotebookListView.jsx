import { useState } from 'react';
import { Link } from 'react-router-dom';
import NotebookImportPanel from './NotebookImportPanel';
import {
  NOTEBOOK_DESCRIPTION_MAX_LENGTH,
  NOTEBOOK_KIND_LABELS,
  NOTEBOOK_KIND_VALUES,
  NOTEBOOK_TITLE_MAX_LENGTH,
  validateNotebookInput,
} from '../../notebooks/notebookSchema.mjs';

function formatDate(value) {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString();
}

const NotebookListView = ({
  notebooks = [],
  archivedNotebooks = [],
  showArchived = false,
  sourceCounts = {},
  loading = false,
  error = '',
  onCreate,
  onDelete,
  onArchive,
  onRestore,
  onToggleArchived,
  onImport,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState('subject');
  const [tags, setTags] = useState('');
  const [errors, setErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validation = validateNotebookInput({
      title,
      description,
      kind,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    setErrors([]);
    try {
      const result = await onCreate?.(validation.value);
      if (result && result.ok === false) {
        setErrors(result.errors || ['The notebook could not be created.']);
        return;
      }
      setTitle('');
      setDescription('');
      setKind('subject');
      setTags('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (notebook) => {
    if (
      !window.confirm(
        `Delete "${notebook.title}" and all of its sources, chat history and study materials?`
      )
    ) {
      return;
    }
    await onDelete?.(notebook.id);
  };

  const visibleNotebooks = showArchived ? archivedNotebooks : notebooks;

  const renderNotebook = (notebook) => {
    // A record that predates the organisation fields still has to render.
    const tags = Array.isArray(notebook.tags) ? notebook.tags : [];

    return (
      <li key={notebook.id}>
        <article className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-ink">
                <Link
                  to={`/notebooks/${notebook.id}`}
                  className="hover:text-primary-700"
                >
                  {notebook.title}
                </Link>
              </h3>
              <p className="mt-1 text-sm text-ink-muted">
                {notebook.description || 'No description added yet.'}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {showArchived ? (
                <button
                  type="button"
                  onClick={() => onRestore?.(notebook.id)}
                  className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted hover:bg-line-subtle"
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onArchive?.(notebook.id)}
                  className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted hover:bg-line-subtle"
                >
                  Archive
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDelete(notebook)}
                className="rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-ink-subtle">
            <span className="rounded-full bg-line-subtle px-3 py-1 font-medium text-ink-muted">
              {NOTEBOOK_KIND_LABELS[notebook.kind] || 'Subject'}
            </span>
            <span className="rounded-full bg-line-subtle px-3 py-1 font-medium text-ink-muted">
              {sourceCounts[notebook.id] || 0}{' '}
              {(sourceCounts[notebook.id] || 0) === 1 ? 'source' : 'sources'}
            </span>
            <span>Updated {formatDate(notebook.updatedAt)}</span>
          </div>

          {tags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Notebook tags">
              {tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted"
                >
                  #{tag}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4">
            <Link
              to={`/notebooks/${notebook.id}`}
              className="text-sm font-semibold text-primary-700 hover:text-primary-800"
            >
              Open workspace →
            </Link>
          </div>
        </article>
      </li>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <p className="text-sm font-semibold text-primary-700 mb-2">
          Personal learning workspace
        </p>
        <h1 className="text-3xl font-bold text-ink mb-2">Notebooks</h1>
        <p className="text-ink-muted max-w-3xl">
          Collect sources, keep your place and prepare for source-grounded study.
          Notebook metadata, source text, chat history and study materials are
          stored separately in this browser.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
        <p className="font-semibold">Local source tools are enabled</p>
        <p className="mt-1">
          PDF/DOCX ingestion, source search and extractive study kits work
          locally in this browser. Source-grounded AI chat and AI-generated study
          materials are not enabled until a real provider is configured.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-danger/40 bg-danger-soft p-4 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="notebook-list-heading">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="notebook-list-heading"
              className="text-lg font-semibold text-ink"
            >
              {showArchived ? 'Archived notebooks' : 'Your notebooks'}
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-ink-subtle">
                {visibleNotebooks.length}{' '}
                {visibleNotebooks.length === 1 ? 'notebook' : 'notebooks'}
              </span>
              <button
                type="button"
                onClick={() => onToggleArchived?.(!showArchived)}
                aria-pressed={showArchived}
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                {showArchived ? 'Show active' : 'Show archived'}
              </button>
            </div>
          </div>

          {loading ? (
            <div
              role="status"
              className="rounded-2xl border border-line bg-surface p-8 text-ink-muted"
            >
              Loading notebooks…
            </div>
          ) : visibleNotebooks.length === 0 ? (
            showArchived ? (
              <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
                <p className="text-4xl mb-3" aria-hidden="true">
                  🗄️
                </p>
                <h3 className="text-lg font-semibold text-ink">
                  No archived notebooks
                </h3>
                <p className="mt-2 text-sm text-ink-muted">
                  Archiving hides a notebook from this list without deleting its
                  sources, chat history or study materials.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
                <p className="text-4xl mb-3" aria-hidden="true">
                  📓
                </p>
                <h3 className="text-lg font-semibold text-ink">
                  Start with your first notebook
                </h3>
                <p className="mt-2 text-sm text-ink-muted">
                  Create a notebook for a course, project or topic, then add text,
                  Markdown, PDF or DOCX sources.
                </p>
              </div>
            )
          ) : (
            <ul className="space-y-4">
              {visibleNotebooks.map(renderNotebook)}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="new-notebook-heading"
          className="h-fit rounded-2xl border border-line bg-surface p-6 shadow-sm"
        >
          <h2
            id="new-notebook-heading"
            className="text-lg font-semibold text-ink"
          >
            New notebook
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Give the workspace a clear title. You can change it later.
          </p>

          {errors.length > 0 && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger"
            >
              <ul className="list-disc space-y-1 pl-4">
                {errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="notebook-title"
                className="block text-sm font-medium text-ink-muted mb-2"
              >
                Title
              </label>
              <input
                id="notebook-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={NOTEBOOK_TITLE_MAX_LENGTH}
                placeholder="Biology final exam"
                className="w-full rounded-lg border border-line px-4 py-3 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label
                htmlFor="notebook-description"
                className="block text-sm font-medium text-ink-muted mb-2"
              >
                Description <span className="text-ink-subtle">(optional)</span>
              </label>
              <textarea
                id="notebook-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={NOTEBOOK_DESCRIPTION_MAX_LENGTH}
                rows={4}
                placeholder="What are you studying, and what should this notebook help you do?"
                className="w-full rounded-lg border border-line px-4 py-3 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary-500"
              />
              <p className="mt-1 text-xs text-ink-subtle">
                {description.length}/{NOTEBOOK_DESCRIPTION_MAX_LENGTH}
              </p>
            </div>

            <div>
              <label
                htmlFor="notebook-kind"
                className="block text-sm font-medium text-ink-muted mb-2"
              >
                This notebook is for
              </label>
              <select
                id="notebook-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-ink outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary-500"
              >
                {NOTEBOOK_KIND_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {NOTEBOOK_KIND_LABELS[value]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-subtle">
                The kind groups your notebook in the sidebar. It does not change
                how sources are read or answers are produced.
              </p>
            </div>

            <div>
              <label
                htmlFor="notebook-tags"
                className="block text-sm font-medium text-ink-muted mb-2"
              >
                Tags <span className="text-ink-subtle">(optional)</span>
              </label>
              <input
                id="notebook-tags"
                type="text"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="exam, genetics, week 3"
                className="w-full rounded-lg border border-line px-4 py-3 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary-500"
              />
              <p className="mt-1 text-xs text-ink-subtle">
                Separate tags with commas.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-ink-inverse transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Creating…' : 'Create notebook'}
            </button>
          </form>
        </section>
      </div>

      {onImport && <NotebookImportPanel onImport={onImport} />}
    </div>
  );
};

export default NotebookListView;
