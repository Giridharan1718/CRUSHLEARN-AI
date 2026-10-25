import {
  formatCitationLabel,
  validateCitation,
} from '../../notebooks/citations.mjs';
import {
  formatGeneratorLabel,
  isModelGenerated,
} from '../../notebooks/generators.mjs';

function formatKind(kind) {
  return String(kind || 'material')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const StudyMaterialsPanel = ({
  materials = [],
  sources = [],
  sourceContents = {},
  onInspectCitation,
}) => {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const sourceIds = sources.map((source) => source.id);
  const sourceTexts = {};
  sources.forEach((source) => {
    const text = sourceContents[source.id]?.text;
    if (typeof text === 'string' && text) sourceTexts[source.id] = text;
  });
  const hasModelMaterial = materials.some((material) =>
    isModelGenerated(material.generator)
  );

  return (
    <section
      aria-labelledby="study-materials-heading"
      className="rounded-2xl border border-line bg-surface p-6 shadow-sm"
    >
      <h2
        id="study-materials-heading"
        className="text-lg font-semibold text-ink"
      >
        Saved study materials
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Saved materials stay on this device. Local study kits quote source
        passages and keep their citations. A material that used a model is
        labelled AI-assisted and is never presented as source evidence.
      </p>

      {hasModelMaterial ? (
        <div className="mt-4 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
          AI-assisted materials are model-written drafts. They are labelled as
          such, their citations are re-verified against stored source text on
          load, and the model wording is not treated as source evidence.
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-info-soft bg-info-soft p-3 text-sm text-info">
          Local extractive study kits are available. AI-generated summaries,
          flashcards, quizzes and audio overviews remain unavailable until a real
          provider is configured.
        </div>
      )}

      {materials.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-line p-8 text-center">
          <p className="text-3xl mb-2" aria-hidden="true">
            🧠
          </p>
          <h3 className="font-semibold text-ink">Nothing saved yet</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Open the Study desk and build a study kit from your ready sources.
          </p>
        </div>
      ) : (
        <ul className="mt-5 space-y-4">
          {materials.map((material) => {
            const rawCitations = Array.isArray(material.citations)
              ? material.citations
              : [];
            const citations = rawCitations
              .map((citation) =>
                validateCitation(citation, {
                  sourceIds,
                  sourceTexts,
                  requireSourceText: true,
                })
              )
              .filter((verification) => verification.verified)
              .map((verification) => verification.citation);
            const removedCitations = rawCitations.length - citations.length;
            const modelGenerated = isModelGenerated(material.generator);

            return (
              <li
                key={material.id}
                className={`rounded-xl border p-4 ${
                  modelGenerated
                    ? 'border-warning/30 bg-warning-soft/20'
                    : 'border-line bg-line-subtle'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink">{material.title}</h3>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-ink-muted">
                    {formatKind(material.kind)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      modelGenerated
                        ? 'bg-warning-soft text-warning'
                        : 'bg-info-soft text-info'
                    }`}
                  >
                    {formatGeneratorLabel(material.generator)}
                  </span>
                </div>
                {modelGenerated ? (
                  <p className="mt-2 text-xs leading-5 text-warning">
                    Model-written draft. The wording is not source evidence; the
                    verified citations below are.
                  </p>
                ) : null}
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">
                  {material.body}
                </p>

                {removedCitations > 0 ? (
                  <p role="alert" className="mt-2 text-xs text-danger">
                    {removedCitations} citation
                    {removedCitations === 1 ? '' : 's'} could not be re-verified
                    against the stored source text and {removedCitations === 1 ? 'was' : 'were'} removed.
                  </p>
                ) : null}

                {citations.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-ink-muted">
                      Verified source spans
                    </p>
                    <ul className="mt-1 space-y-1">
                      {citations.map((citation, index) => (
                        <li
                          key={`${material.id}-citation-${index}`}
                          className="text-xs text-ink-muted"
                        >
                          <span className="font-medium text-primary-700">
                            {formatCitationLabel(
                              citation,
                              sourceById.get(citation.sourceId)
                            )}
                          </span>
                          : “{citation.quote}”
                          {typeof onInspectCitation === 'function' ? (
                            <button
                              type="button"
                              onClick={() => onInspectCitation(citation)}
                              className="ml-1 font-semibold text-accent-strong underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-accent/30"
                            >
                              Inspect
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default StudyMaterialsPanel;
