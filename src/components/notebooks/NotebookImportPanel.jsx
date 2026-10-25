import { useRef, useState } from 'react';

/**
 * Import a notebook from a CrushLearn JSON export.
 *
 * The file is read and parsed in the browser only. The parent decides whether
 * the payload is valid; this panel reports the errors it receives and never
 * creates a notebook by itself.
 */
export default function NotebookImportPanel({ onImport }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [errors, setErrors] = useState([]);
  const [importing, setImporting] = useState(false);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    setFileName(file?.name || '');
    setErrors([]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setErrors(['Choose a CrushLearn JSON export first.']);
      return;
    }

    setImporting(true);
    setErrors([]);

    let payload;
    try {
      const text = await file.text();
      payload = JSON.parse(text);
    } catch {
      setImporting(false);
      setErrors([
        'That file is not valid JSON. Choose a notebook export downloaded from CrushLearn.',
      ]);
      return;
    }

    try {
      const result = await onImport?.(payload);
      if (!result?.ok) {
        setErrors(
          result?.errors || ['The notebook could not be imported.']
        );
        return;
      }
      setFileName('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (error) {
      setErrors([
        error?.message || 'The notebook could not be imported in this browser.',
      ]);
    } finally {
      setImporting(false);
    }
  };

  return (
    <section
      aria-labelledby="import-notebook-heading"
      className="mt-6 rounded-2xl border border-line bg-surface p-6 shadow-sm"
    >
      <h2
        id="import-notebook-heading"
        className="text-lg font-semibold text-ink"
      >
        Import a notebook
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Choose a JSON file exported from CrushLearn. The import creates a new
        notebook and never overwrites an existing one.
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

      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        <label
          htmlFor="notebook-import-file"
          className="block text-sm font-medium text-ink-muted"
        >
          Notebook JSON export
        </label>
        <input
          ref={inputRef}
          id="notebook-import-file"
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-line-subtle file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-muted hover:file:bg-line"
        />
        {fileName && (
          <p className="text-xs text-ink-subtle">Selected: {fileName}</p>
        )}
        <button
          type="submit"
          disabled={importing || !fileName}
          className="w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-ink-inverse transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {importing ? 'Importing…' : 'Import notebook'}
        </button>
      </form>
    </section>
  );
}
