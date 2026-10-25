import { useRef, useState } from 'react';
import {
  MAX_SOURCE_BYTES,
  MAX_SOURCE_TEXT_CHARS,
  validateFileInput,
  validatePastedInput,
  validateWebInput,
} from '../../notebooks/sourceSchema.mjs';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SourceIngestionPanel = ({ onIngest, initialMode = 'paste' }) => {
  const [mode, setMode] = useState(initialMode);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState([]);
  const [notice, setNotice] = useState(null);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef(null);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setErrors([]);
    setNotice(null);
  };

  const handlePasteSubmit = async (event) => {
    event.preventDefault();
    const validation = validatePastedInput({ title, text });
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setErrors([]);
    setNotice(null);
    setProcessing(true);
    try {
      const result = await onIngest?.({
        kind: 'pasted',
        title: validation.value.title,
        text: validation.value.text,
      });
      if (!result?.ok) {
        setErrors(result?.errors || ['The pasted text could not be added.']);
        return;
      }
      if (result.source?.status === 'failed') {
        setNotice({
          tone: 'warning',
          message: result.source.error || 'The source could not be processed.',
        });
      } else {
        setNotice({
          tone: 'success',
          message: `Added "${result.source.title}" (${result.source.characterCount.toLocaleString()} characters).`,
        });
        setTitle('');
        setText('');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleFileSubmit = async (event) => {
    event.preventDefault();
    const validation = validateFileInput(file);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setErrors([]);
    setNotice(null);
    setProcessing(true);
    try {
      const result = await onIngest?.({ kind: 'file', file });
      if (!result?.ok) {
        setErrors(result?.errors || ['The file could not be added.']);
        return;
      }
      if (result.source?.status === 'failed') {
        setNotice({
          tone: 'warning',
          message:
            result.source.error ||
            'The file was registered, but its text could not be extracted.',
        });
      } else {
        setNotice({
          tone: 'success',
          message: `Added "${result.source.title}" (${result.source.characterCount.toLocaleString()} characters).`,
        });
      }
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setProcessing(false);
    }
  };

  const handleWebSubmit = async (event) => {
    event.preventDefault();
    const validation = validateWebInput({ url });
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setErrors([]);
    setNotice(null);
    setProcessing(true);
    try {
      const result = await onIngest?.({ kind: 'web', url: validation.value.url });
      if (!result?.ok) {
        setErrors(
          result?.errors || ['The web page could not be added as a source.']
        );
        return;
      }
      if (result.source?.status === 'failed') {
        setNotice({
          tone: 'warning',
          message:
            result.source.error ||
            'The URL was saved, but no readable page text could be fetched.',
        });
      } else {
        setNotice({
          tone: 'success',
          message: `Fetched "${result.source.title}" from ${
            result.source.url
          } (${result.source.characterCount.toLocaleString()} characters).`,
        });
        setUrl('');
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <section
      aria-labelledby="add-source-heading"
      className="rounded-2xl border border-line bg-surface p-6 shadow-sm"
    >
      <h2 id="add-source-heading" className="text-lg font-semibold text-ink">
        Add a source
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Text, Markdown, PDF and DOCX files are processed locally in this browser.
        Uploaded files are read as data and never executed. Web pages are fetched
        by the local gateway, never by a browser fetch.
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Source type">
        {[
          { id: 'paste', label: 'Paste text' },
          { id: 'file', label: 'Upload file' },
          { id: 'web', label: 'Web page' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            onClick={() => switchMode(item.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/20 ${
              mode === item.id
                ? 'bg-accent text-ink-inverse'
                : 'bg-line-subtle text-ink-muted hover:bg-line'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

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

      {notice && (
        <div
          role="status"
          className={`mt-4 rounded-lg border p-3 text-sm ${
            notice.tone === 'success'
              ? 'border-success/40 bg-success-soft text-success'
              : 'border-warning/40 bg-warning-soft text-warning'
          }`}
        >
          {notice.message}
        </div>
      )}

      {mode === 'paste' ? (
        <form onSubmit={handlePasteSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="source-title"
              className="block text-sm font-medium text-ink-muted mb-2"
            >
              Source title <span className="text-ink-subtle">(optional)</span>
            </label>
            <input
              id="source-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              placeholder="Lecture notes"
              className="w-full rounded-lg border border-line px-4 py-3 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label
              htmlFor="source-text"
              className="block text-sm font-medium text-ink-muted mb-2"
            >
              Text
            </label>
            <textarea
              id="source-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={7}
              placeholder="Paste notes, an article excerpt or Markdown here…"
              className="w-full rounded-lg border border-line px-4 py-3 font-mono text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary-500"
            />
            <p className="mt-1 text-xs text-ink-subtle">
              {text.length.toLocaleString()}/{MAX_SOURCE_TEXT_CHARS.toLocaleString()}{' '}
              characters
            </p>
          </div>

          <button
            type="submit"
            disabled={processing}
            className="rounded-lg bg-primary-600 px-4 py-3 font-semibold text-ink-inverse transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {processing ? 'Processing…' : 'Add pasted text'}
          </button>
        </form>
      ) : mode === 'web' ? (
        <form onSubmit={handleWebSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="source-url"
              className="block text-sm font-medium text-ink-muted mb-2"
            >
              Web page URL
            </label>
            <input
              id="source-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/article"
              autoComplete="url"
              className="w-full rounded-lg border border-line px-4 py-3 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary-500"
            />
            <p className="mt-1 text-xs text-ink-subtle">
              Only public http:// and https:// pages can be fetched. The gateway
              records the final URL and retrieval time with the source.
            </p>
          </div>

          <div className="rounded-lg border border-line bg-line-subtle p-3 text-xs text-ink-muted">
            <p className="font-semibold text-ink-muted">Server-side fetch</p>
            <p className="mt-1">
              Your browser does not contact the site. The local gateway rejects
              localhost, private addresses and non-web schemes, limits redirects,
              time and page size, and extracts readable text. If the gateway is
              not running, the URL is added as a failed source with the real
              reason instead of pretending the page was read.
            </p>
          </div>

          <button
            type="submit"
            disabled={processing}
            className="rounded-lg bg-primary-600 px-4 py-3 font-semibold text-ink-inverse transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {processing ? 'Fetching…' : 'Fetch web page'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleFileSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="source-file"
              className="block text-sm font-medium text-ink-muted mb-2"
            >
              File
            </label>
            <input
              ref={fileInputRef}
              id="source-file"
              type="file"
              accept=".txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setErrors([]);
                setNotice(null);
              }}
              className="block w-full rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-muted file:mr-4 file:rounded-md file:border-0 file:bg-line-subtle file:px-3 file:py-2 file:font-medium file:text-ink-muted"
            />
            {file && (
              <p className="mt-2 text-xs text-ink-subtle">
                {file.name}
                {file.size ? ` · ${formatBytes(file.size)}` : ''}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-line bg-line-subtle p-3 text-xs text-ink-muted">
            <p className="font-semibold text-ink-muted">Supported in this build</p>
            <p className="mt-1">
              .txt, .md, .markdown, .pdf and .docx are extracted locally. Max{' '}
              {Math.floor(MAX_SOURCE_BYTES / (1024 * 1024))} MB and{' '}
              {MAX_SOURCE_TEXT_CHARS.toLocaleString()} characters.
            </p>
            <p className="mt-1">
              Scanned PDFs need OCR and will be marked failed if no selectable
              text is found. Legacy .doc files are not supported; use the Web
              page tab for an article.
            </p>
            <p className="mt-1">
              Document text stays in this browser. AI chat and generated
              explanations are only available when the optional gateway is
              running with a provider key.
            </p>
          </div>

          <button
            type="submit"
            disabled={processing || !file}
            className="rounded-lg bg-primary-600 px-4 py-3 font-semibold text-ink-inverse transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {processing ? 'Processing…' : 'Add file source'}
          </button>
        </form>
      )}
    </section>
  );
};

export default SourceIngestionPanel;
