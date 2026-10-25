import { formatCitationLabel } from '../../notebooks/citations.mjs';

function locationLabel(item) {
  if (!item) return 'Source';
  if (Number.isInteger(item.page)) {
    return `${item.sourceTitle}, page ${item.page}`;
  }
  return formatCitationLabel(item.citation, { title: item.sourceTitle });
}

function quotationLabel(item, index, answerItem) {
  if (index === 0) return 'Answer quotation';
  const answerSpan = answerItem?.citation?.locator;
  const span = item?.citation?.locator;
  if (
    answerSpan &&
    span &&
    item.sourceId === answerItem.sourceId &&
    span.start <= answerSpan.start &&
    span.end >= answerSpan.end
  ) {
    return 'Context passage';
  }
  return 'Supporting quotation';
}

export default function SourceEvidenceMap({ visual }) {
  if (!visual || !Array.isArray(visual.items) || visual.items.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-line bg-line-subtle p-4 text-sm text-ink-muted">
        A source evidence map is unavailable because no verified quotation was
        found.
      </section>
    );
  }

  const sourceCount = new Set(visual.items.map((item) => item.sourceId)).size;

  return (
    <section
      aria-labelledby="source-evidence-map-heading"
      aria-describedby="source-evidence-map-description"
      className="rounded-2xl border border-info/40 bg-info-soft p-5 text-info"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-info">
            Source evidence map
          </p>
          <h4
            id="source-evidence-map-heading"
            className="mt-1 text-base font-semibold"
          >
            {visual.title || 'Verified evidence for this answer'}
          </h4>
          <p
            id="source-evidence-map-description"
            className="mt-1 max-w-2xl text-sm text-info"
          >
            {visual.description}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-info-soft px-3 py-1 text-xs font-semibold text-info">
          {visual.items.length} verified quotation
          {visual.items.length === 1 ? '' : 's'} · {sourceCount} source
          {sourceCount === 1 ? '' : 's'}
        </span>
      </div>

      {visual.question && (
        <div className="mt-4 rounded-xl border border-info/40 bg-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-info">
            Question
          </p>
          <p className="mt-1 text-sm font-medium text-ink">
            {visual.question}
          </p>
        </div>
      )}

      <ol className="mt-4 space-y-3">
        {visual.items.map((item, index) => (
          <li
            key={`${item.sourceId}:${item.citation?.locator?.start}:${item.citation?.locator?.end}`}
            className="rounded-xl border border-info/40 bg-surface p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-info">
                {quotationLabel(item, index, visual.items[0])}
              </p>
              <span className="rounded-full bg-success-soft px-2 py-1 text-xs font-semibold text-success">
                Citation verified
              </span>
            </div>
            <blockquote className="mt-2 border-l-4 border-info pl-3 text-sm text-ink">
              {item.quote}
            </blockquote>
            <p className="mt-2 break-words text-xs font-medium text-info">
              {locationLabel(item)}
            </p>
          </li>
        ))}
      </ol>

      {Array.isArray(visual.limitations) && visual.limitations.length > 0 && (
        <div className="mt-4 rounded-xl border border-info/40 bg-info-soft/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-info">
            Reading limits
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-info">
            {visual.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
