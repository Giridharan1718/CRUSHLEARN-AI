import { getContentBlockTypeLabel } from '../../content/index.mjs';

export function TextContentBlock({ block }) {
  const paragraphs = Array.isArray(block.paragraphs)
    ? block.paragraphs
    : block.body
      ? [block.body]
      : [];
  return (
    <article className="bg-surface rounded-xl shadow-md p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 mb-2">
        {getContentBlockTypeLabel('text')}
      </p>
      <h3 className="text-xl font-bold text-ink mb-3">{block.title}</h3>
      <div className="space-y-3 text-ink-muted leading-7">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {Array.isArray(block.bullets) && block.bullets.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm text-ink-muted list-disc pl-5">
          {block.bullets.map((bullet, index) => (
            <li key={index}>{bullet}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function VideoContentBlock({ block }) {
  return (
    <article className="bg-surface rounded-xl shadow-md p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 mb-2">
        {getContentBlockTypeLabel('video')}
      </p>
      <h3 className="text-xl font-bold text-ink mb-4">{block.title}</h3>
      {block.src ? (
        <video
          className="w-full rounded-lg bg-ink"
          controls
          preload="metadata"
          poster={block.poster || undefined}
        >
          <source src={block.src} />
          Your browser does not support the video element.
        </video>
      ) : (
        <p className="rounded-lg bg-warning-soft p-4 text-sm text-warning">
          This video is unavailable right now.
        </p>
      )}
      {block.transcript && (
        <details className="mt-4 text-sm text-ink-muted">
          <summary className="cursor-pointer font-medium text-ink-muted">
            Read the transcript
          </summary>
          <p className="mt-2 leading-6">{block.transcript}</p>
        </details>
      )}
    </article>
  );
}

export function ImageContentBlock({ block }) {
  return (
    <figure className="bg-surface rounded-xl shadow-md p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 mb-2">
        {getContentBlockTypeLabel('image')}
      </p>
      {block.title && (
        <h3 className="text-xl font-bold text-ink mb-4">{block.title}</h3>
      )}
      {block.src ? (
        <img
          src={block.src}
          alt={block.alt || ''}
          className="w-full rounded-lg border border-line"
          loading="lazy"
        />
      ) : (
        <p className="rounded-lg bg-warning-soft p-4 text-sm text-warning">
          This image is unavailable right now.
        </p>
      )}
      {(block.caption || block.alt) && (
        <figcaption className="mt-3 text-sm text-ink-subtle">
          {block.caption || block.alt}
        </figcaption>
      )}
    </figure>
  );
}

export function MissingContentBlock({ block }) {
  return (
    <div
      role="note"
      className="rounded-xl border border-warning/40 bg-warning-soft p-5 text-sm text-warning"
    >
      <p className="font-semibold">Content unavailable</p>
      <p className="mt-1">
        {block?.type
          ? `No renderer is available for "${block.type}" content.`
          : 'This lesson content block is missing.'}
      </p>
    </div>
  );
}

const CONTENT_RENDERERS = {
  text: TextContentBlock,
  video: VideoContentBlock,
  image: ImageContentBlock,
};

export function getContentBlockRenderer(type) {
  return CONTENT_RENDERERS[type] || null;
}

export default function ContentBlockRenderer({ block }) {
  if (!block || typeof block !== 'object') {
    return <MissingContentBlock block={block} />;
  }
  const Renderer = getContentBlockRenderer(block.type);
  if (!Renderer) return <MissingContentBlock block={block} />;
  return <Renderer block={block} />;
}
