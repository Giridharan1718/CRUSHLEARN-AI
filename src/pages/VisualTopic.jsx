import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getVisualExplanationById } from '../visual/visualCatalog.mjs';
import { validateVisualExplanation } from '../visual/visualSchema.mjs';
import VisualTopicView from '../components/visual/VisualTopicView';

const VisualTopic = () => {
  const { topicId } = useParams();
  const [searchParams] = useSearchParams();
  const requestedNotebook = searchParams.get('fromNotebook') || '';
  const fromNotebook = /^notebook_[a-f0-9-]{36}$/.test(requestedNotebook)
    ? requestedNotebook
    : '';
  const requestedTab = searchParams.get('returnTab') || 'study';
  const returnTab = ['sources', 'study', 'chat', 'materials'].includes(
    requestedTab
  )
    ? requestedTab
    : 'study';
  const returnQuery = (searchParams.get('q') || '').slice(0, 300);
  const backParams = new URLSearchParams({ tab: returnTab });
  if (returnQuery) backParams.set('q', returnQuery);
  const backHref = `/notebooks/${fromNotebook}?${backParams.toString()}`;
  const explanation = getVisualExplanationById(topicId);

  if (!explanation) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
          <p className="text-4xl" aria-hidden="true">
            🧭
          </p>
          <h1 className="mt-3 text-2xl font-bold text-ink">
            Visual explanation not found
          </h1>
          <p className="mt-2 text-ink-muted">
            This topic is not in the verified local catalog. No explanation was
            invented for it.
          </p>
          <Link
            to="/visual"
            className="mt-5 inline-block rounded-lg bg-primary-600 px-4 py-2 font-semibold text-ink-inverse hover:bg-accent-strong"
          >
            Back to Visual Learning
          </Link>
        </div>
      </div>
    );
  }

  const validation = validateVisualExplanation(explanation);
  if (!validation.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <div
          role="alert"
          className="rounded-2xl border border-danger/40 bg-danger-soft p-6 text-danger"
        >
          <h1 className="text-lg font-semibold">
            This visual explanation failed validation
          </h1>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <Link
            to="/visual"
            className="mt-4 inline-block text-sm font-semibold underline"
          >
            Back to Visual Learning
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {fromNotebook && (
        <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
            <p className="font-semibold">Opened from your notebook</p>
            <p className="mt-1 text-xs">
              This visual is a curated, authored explanation. It is not
              generated from your uploaded source and does not cite it.
            </p>
            <Link
              to={backHref}
              className="mt-2 inline-block font-semibold underline"
            >
              ← Back to notebook
            </Link>
          </div>
        </div>
      )}
      <VisualTopicView explanation={explanation} />
    </>
  );
};

export default VisualTopic;
