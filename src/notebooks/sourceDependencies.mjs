// Find the saved notebook records that cite one source.
//
// A source can be removed without removing the chat messages, study materials
// or learning-context records that quote it. This module lets the UI show that
// dependency before the learner confirms a deletion, so a citation never
// disappears silently.
//
// The scan is deliberately shape-based rather than tied to one record version:
// citations are stored on messages and materials directly, and nested inside
// the learning context (answer, evidence, visual items, practice and adaptive
// facts). A recursive scan finds all of them without inventing a second
// citation model.

function cleanExcerpt(value, maxLength = 140) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function isCitationFor(value, sourceId) {
  if (!value || typeof value !== 'object') return false;
  if (value.sourceId !== sourceId) return false;
  return (
    typeof value.quote === 'string' ||
    Boolean(value.locator && typeof value.locator === 'object')
  );
}

/**
 * Count the well-formed citation-shaped objects for `sourceId` anywhere in
 * `value`. Each citation is counted once, even when a wrapper repeats its
 * `sourceId` alongside a nested `citation` object.
 */
export function countSourceCitations(value, sourceId, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return 0;
  if (seen.has(value)) return 0;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.reduce(
      (total, item) => total + countSourceCitations(item, sourceId, seen),
      0
    );
  }

  if (isCitationFor(value, sourceId)) return 1;

  return Object.values(value).reduce(
    (total, child) => total + countSourceCitations(child, sourceId, seen),
    0
  );
}

/**
 * Collect every source id cited anywhere in a record.
 *
 * Used by import validation: a citation may only point at a source that is
 * part of the same export, otherwise the imported notebook would contain an
 * unverifiable reference from the moment it is created.
 */
export function collectSourceCitationIds(
  value,
  ids = new Set(),
  seen = new WeakSet()
) {
  if (!value || typeof value !== 'object') return ids;
  if (seen.has(value)) return ids;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) => collectSourceCitationIds(item, ids, seen));
    return ids;
  }

  const sourceId = value.sourceId;
  if (
    typeof sourceId === 'string' &&
    sourceId &&
    isCitationFor(value, sourceId)
  ) {
    ids.add(sourceId);
    return ids;
  }

  Object.values(value).forEach((child) =>
    collectSourceCitationIds(child, ids, seen)
  );
  return ids;
}

function materialDependent(material, sourceId) {
  const citationCount = countSourceCitations(material, sourceId);
  if (!citationCount) return null;
  return {
    kind: 'material',
    id: material.id,
    label: `Saved material: ${material.title}`,
    excerpt: cleanExcerpt(material.body),
    citationCount,
  };
}

function messageDependent(message, sourceId) {
  const citationCount = countSourceCitations(message, sourceId);
  if (!citationCount) return null;
  return {
    kind: 'chat',
    id: message.id,
    label: `Chat message (${message.role})`,
    excerpt: cleanExcerpt(message.content),
    citationCount,
  };
}

function contextDependent(context, sourceId) {
  const citationCount = countSourceCitations(context, sourceId);
  if (!citationCount) return null;
  return {
    kind: 'learning_context',
    id: 'learning-context',
    label: 'Saved learning context',
    excerpt: cleanExcerpt(
      context.currentQuestion ||
        context.resolvedQuestion ||
        context.answer?.text
    ),
    citationCount,
  };
}

/**
 * List every saved material, chat message and learning-context record that
 * cites `sourceId`.
 *
 * The order is stable: materials, then chat messages, then the learning
 * context. An entry is never returned for a record that does not cite the
 * source, so the ordinary delete confirmation stays ordinary.
 */
export function findSourceDependents({
  sourceId,
  materials = [],
  messages = [],
  learningContext = null,
} = {}) {
  if (typeof sourceId !== 'string' || !sourceId) return [];

  const dependents = [];

  (Array.isArray(materials) ? materials : []).forEach((material) => {
    if (!material) return;
    const dependent = materialDependent(material, sourceId);
    if (dependent) dependents.push(dependent);
  });

  (Array.isArray(messages) ? messages : []).forEach((message) => {
    if (!message) return;
    const dependent = messageDependent(message, sourceId);
    if (dependent) dependents.push(dependent);
  });

  if (learningContext) {
    const dependent = contextDependent(learningContext, sourceId);
    if (dependent) dependents.push(dependent);
  }

  return dependents;
}
