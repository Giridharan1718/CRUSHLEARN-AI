// Learner-controlled explanation record.
//
// This is a small, bounded local record of which concepts a learner asked to
// have explained, at which level, and what the deterministic checks measured.
// It deliberately does not store source quotations or free-text responses.
//
// The learner can inspect, export and delete the record. Saving is explicit;
// the Text Understanding panel never saves silently.

export const EXPLANATION_RECORD_SCHEMA_VERSION = 1;
export const EXPLANATION_RECORD_KEY = 'crushlearn_explanation_records_v1';
export const MAX_EXPLANATION_RECORDS = 100;
export const MAX_RECORDS_PER_NOTEBOOK = 50;

function clean(value, max = 200) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeRecord(record) {
  if (!record || typeof record !== 'object') return null;
  if (record.schemaVersion !== EXPLANATION_RECORD_SCHEMA_VERSION) return null;
  const userId = clean(record.userId, 160);
  const notebookId = clean(record.notebookId, 160);
  const id = clean(record.id, 160);
  const at = typeof record.at === 'string' ? record.at : '';
  if (!userId || !notebookId || !id || !at) return null;

  return {
    schemaVersion: EXPLANATION_RECORD_SCHEMA_VERSION,
    id,
    userId,
    notebookId,
    subject: clean(record.subject, 80) || 'general',
    level: clean(record.level, 40) || 'eli10',
    mode: clean(record.mode, 40) || 'simplify',
    language: clean(record.language, 20) || 'en',
    concepts: Array.isArray(record.concepts)
      ? record.concepts.map((item) => clean(item, 80)).filter(Boolean).slice(0, 6)
      : [],
    factCount: Number.isFinite(record.factCount) ? Math.max(0, Math.round(record.factCount)) : 0,
    verificationOk: record.verificationOk === true,
    sourceId: clean(record.sourceId, 160),
    sourceTitle: clean(record.sourceTitle, 200),
    at,
    note:
      clean(record.note, 300) ||
      'Metadata only. Source quotations and free-text answers are not stored in this record.',
  };
}

function readAll(storage) {
  try {
    const raw = storage.getItem(EXPLANATION_RECORD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const records = Array.isArray(parsed?.records) ? parsed.records : [];
    return records.map(normalizeRecord).filter(Boolean);
  } catch {
    return [];
  }
}

function writeAll(storage, records) {
  const envelope = {
    schemaVersion: EXPLANATION_RECORD_SCHEMA_VERSION,
    records: records.slice(-MAX_EXPLANATION_RECORDS),
  };
  storage.setItem(EXPLANATION_RECORD_KEY, JSON.stringify(envelope));
}

export function createExplanationRecordStore(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return null;
  }

  const list = (userId, notebookId) =>
    readAll(storage)
      .filter(
        (record) =>
          record.userId === userId && record.notebookId === notebookId
      )
      .sort((left, right) => left.at.localeCompare(right.at));

  return {
    list,
    save(userId, notebookId, input = {}) {
      if (!userId || !notebookId) {
        return { ok: false, errors: ['A signed-in learner and notebook are required.'] };
      }
      const record = normalizeRecord({
        schemaVersion: EXPLANATION_RECORD_SCHEMA_VERSION,
        id: clean(input.id, 160) || `explanation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        notebookId,
        subject: input.subject,
        level: input.level,
        mode: input.mode,
        language: input.language,
        concepts: input.concepts,
        factCount: input.factCount,
        verificationOk: input.verificationOk,
        sourceId: input.sourceId,
        sourceTitle: input.sourceTitle,
        at: input.at || new Date().toISOString(),
        note: input.note,
      });
      if (!record) return { ok: false, errors: ['The explanation record was invalid.'] };

      const all = readAll(storage);
      const scoped = all.filter(
        (item) => item.userId === userId && item.notebookId === notebookId
      );
      if (scoped.length >= MAX_RECORDS_PER_NOTEBOOK) {
        const oldest = scoped[0];
        const index = all.findIndex((item) => item.id === oldest.id);
        if (index >= 0) all.splice(index, 1);
      }
      all.push(record);
      writeAll(storage, all);
      return { ok: true, record };
    },
    remove(userId, notebookId, recordId) {
      const all = readAll(storage);
      const next = all.filter(
        (record) =>
          !(
            record.userId === userId &&
            record.notebookId === notebookId &&
            record.id === recordId
          )
      );
      if (next.length === all.length) return { ok: false, errors: ['Record not found.'] };
      writeAll(storage, next);
      return { ok: true };
    },
    clear(userId, notebookId) {
      const all = readAll(storage);
      const next = all.filter(
        (record) => !(record.userId === userId && record.notebookId === notebookId)
      );
      writeAll(storage, next);
      return { ok: true, removed: all.length - next.length };
    },
    export(userId, notebookId) {
      const records = list(userId, notebookId);
      return {
        ok: true,
        json: JSON.stringify(
          {
            schemaVersion: EXPLANATION_RECORD_SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            note: 'Local explanation metadata. No source quotations or free-text answers are included.',
            records,
          },
          null,
          2
        ),
        count: records.length,
      };
    },
  };
}

/** Builds the metadata a caller may save, without source text. */
export function buildExplanationRecordInput({ explanation, sourceId, sourceTitle } = {}) {
  if (!explanation) return null;
  return {
    subject: explanation.subject?.id || 'general',
    level: explanation.level,
    mode: explanation.mode,
    language: explanation.language?.resolved || 'en',
    concepts: (explanation.difficultTerms || [])
      .map((item) => item.word)
      .slice(0, 6),
    factCount: explanation.factCount || 0,
    verificationOk: explanation.verification?.ok === true,
    sourceId: sourceId || '',
    sourceTitle: sourceTitle || '',
  };
}
