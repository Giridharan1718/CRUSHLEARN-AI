import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVIDENCE_STORAGE_VERSION,
  createEvidenceStore,
  getEvidenceStorageKey,
} from '../../src/learning/evidenceStore.mjs';
import {
  EVIDENCE_SOURCES,
  createEmptyEvidence,
  recordAttempt,
} from '../../src/learning/gapDetection.mjs';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const item = {
  id: 'check-1',
  kind: 'single_choice',
  objectiveId: 'objective-1',
  prompt: 'Question?',
  options: ['Right', 'Wrong'],
  correctIndex: 0,
};

function evidenceWithOneAnswer(courseAnswer = 0) {
  return recordAttempt(createEmptyEvidence(), {
    items: [item],
    answers: { 'check-1': courseAnswer },
    source: EVIDENCE_SOURCES.DIAGNOSTIC,
    at: '2026-01-01T00:00:00.000Z',
  }).evidence;
}

test('evidence round-trips through a course-scoped key', () => {
  const storage = new MemoryStorage();
  const store = createEvidenceStore(storage);
  const saved = store.save('web-dev-101', evidenceWithOneAnswer(), '2026-01-02T00:00:00.000Z');
  assert.equal(saved.schemaVersion, EVIDENCE_STORAGE_VERSION);
  assert.equal(saved.courseId, 'web-dev-101');
  assert.equal(saved.updatedAt, '2026-01-02T00:00:00.000Z');
  assert.equal(
    getEvidenceStorageKey('web-dev-101'),
    'crushlearn_evidence_web-dev-101'
  );

  const loaded = store.load('web-dev-101');
  assert.equal(loaded.observations.length, 1);
  assert.equal(loaded.observations[0].objectiveId, 'objective-1');
  assert.equal(loaded.attempts.length, 1);
  assert.equal(loaded.attempts[0].kind, EVIDENCE_SOURCES.DIAGNOSTIC);
});

test('evidence for different courses is isolated', () => {
  const storage = new MemoryStorage();
  const store = createEvidenceStore(storage);
  store.save('web-dev-101', evidenceWithOneAnswer(0));
  store.save('python-basics', evidenceWithOneAnswer(1));

  assert.equal(store.load('web-dev-101').observations[0].isCorrect, true);
  assert.equal(store.load('python-basics').observations[0].isCorrect, false);

  store.clear('web-dev-101');
  assert.equal(store.load('web-dev-101'), null);
  assert.notEqual(store.load('python-basics'), null);
});

test('corrupt or mismatched evidence is ignored rather than trusted', () => {
  const storage = new MemoryStorage();
  const store = createEvidenceStore(storage);
  const key = getEvidenceStorageKey('web-dev-101');

  storage.setItem(key, '{not json');
  assert.equal(store.load('web-dev-101'), null);

  storage.setItem(
    key,
    JSON.stringify({ schemaVersion: 999, courseId: 'web-dev-101', observations: [] })
  );
  assert.equal(store.load('web-dev-101'), null);

  storage.setItem(
    key,
    JSON.stringify({
      schemaVersion: EVIDENCE_STORAGE_VERSION,
      courseId: 'python-basics',
      observations: [],
    })
  );
  assert.equal(store.load('web-dev-101'), null);
});

test('the evidence store refuses an unusable storage adapter', () => {
  assert.throws(
    () => createEvidenceStore({}),
    /requires a storage adapter/i
  );
});
