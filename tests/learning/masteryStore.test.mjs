import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MASTERY_STORAGE_VERSION,
  MAX_SAVED_DECISIONS,
  createEmptyMasteryLog,
  createMasteryStore,
  getMasteryStorageKey,
  loadMasteryLogOrDefault,
} from '../../src/learning/masteryStore.mjs';

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

function decision(overrides = {}) {
  return {
    decisionId: 'mastery:course-1:lesson-1:2026-03-01T12:00:00.000Z',
    courseId: 'course-1',
    lessonId: 'lesson-1',
    at: '2026-03-01T12:00:00.000Z',
    allowed: false,
    status: 'deferred',
    summary: 'Progression deferred for lesson "lesson-1".',
    reasons: ['Needs two different questions.'],
    checks: [
      {
        id: 'objective:obj-1',
        label: 'Mastery: Objective one',
        passed: false,
        actual: 'developing',
        required: 'demonstrated',
        reason: 'Only one question has correct evidence.',
        objectiveId: 'obj-1',
      },
    ],
    objectives: [
      {
        objectiveId: 'obj-1',
        title: 'Objective one',
        status: 'developing',
        criteriaMet: false,
        retentionMet: false,
        progressionEligible: false,
        reason: 'Only one question has correct evidence.',
      },
    ],
    prerequisites: [],
    activityComplete: true,
    evidenceAttempts: 1,
    evidenceObservations: 1,
    ...overrides,
  };
}

test('mastery decisions round-trip through a course-scoped key', () => {
  const storage = new MemoryStorage();
  const store = createMasteryStore(storage);
  const saved = store.saveDecision('course-1', decision());

  assert.equal(saved.allowed, false);
  assert.equal(saved.status, 'deferred');
  assert.ok(storage.getItem(getMasteryStorageKey('course-1')));

  const loaded = store.load('course-1');
  assert.equal(loaded.version, MASTERY_STORAGE_VERSION);
  assert.equal(loaded.decisions.length, 1);
  assert.equal(loaded.decisions[0].reasons[0], 'Needs two different questions.');
  assert.equal(loaded.decisions[0].checks[0].passed, false);
  assert.equal(
    store.getLatestDecision('course-1', 'lesson-1').lessonId,
    'lesson-1'
  );
  assert.equal(store.getLatestDecision('course-1', 'lesson-9'), null);
});

test('courses have isolated mastery logs and clear separately', () => {
  const storage = new MemoryStorage();
  const store = createMasteryStore(storage);
  store.saveDecision('course-1', decision());
  store.saveDecision(
    'course-2',
    decision({
      decisionId: 'mastery:course-2:lesson-1:2026-03-01T12:00:00.000Z',
      courseId: 'course-2',
      allowed: true,
      status: 'allowed',
    })
  );

  assert.equal(store.load('course-1').decisions[0].allowed, false);
  assert.equal(store.load('course-2').decisions[0].allowed, true);
  store.clear('course-1');
  assert.equal(store.load('course-1'), null);
  assert.equal(store.load('course-2').decisions.length, 1);
});

test('a decision with no explicit status derives one from allowed', () => {
  const storage = new MemoryStorage();
  const store = createMasteryStore(storage);
  const saved = store.saveDecision(
    'course-1',
    decision({
      allowed: true,
      status: undefined,
    })
  );
  assert.equal(saved.status, 'allowed');
});

test('saving rejects an invalid decision and a course mismatch', () => {
  const storage = new MemoryStorage();
  const store = createMasteryStore(storage);
  assert.throws(() => store.saveDecision('course-1', { allowed: true }));
  assert.throws(() =>
    store.saveDecision('course-1', decision({ courseId: 'course-2' }))
  );
});

test('corrupt, mismatched or incomplete envelopes are ignored safely', () => {
  const storage = new MemoryStorage();
  const store = createMasteryStore(storage);
  const key = getMasteryStorageKey('course-1');

  storage.setItem(key, '{not json');
  assert.equal(store.load('course-1'), null);

  storage.setItem(
    key,
    JSON.stringify({ schemaVersion: 99, courseId: 'course-1', decisions: [] })
  );
  assert.equal(store.load('course-1'), null);

  storage.setItem(
    key,
    JSON.stringify({
      schemaVersion: MASTERY_STORAGE_VERSION,
      courseId: 'other-course',
      decisions: [],
    })
  );
  assert.equal(store.load('course-1'), null);

  storage.setItem(
    key,
    JSON.stringify({
      schemaVersion: MASTERY_STORAGE_VERSION,
      courseId: 'course-1',
      decisions: 'not-an-array',
    })
  );
  assert.equal(store.load('course-1'), null);
});

test('malformed decisions are dropped while valid records survive', () => {
  const storage = new MemoryStorage();
  const store = createMasteryStore(storage);
  storage.setItem(
    getMasteryStorageKey('course-1'),
    JSON.stringify({
      schemaVersion: MASTERY_STORAGE_VERSION,
      courseId: 'course-1',
      decisions: [
        null,
        { courseId: 'course-1', lessonId: 'lesson-1' },
        decision({ decisionId: 'valid-1' }),
        decision({
          decisionId: 'valid-2',
          at: 'not-a-date',
        }),
      ],
    })
  );

  const loaded = store.load('course-1');
  assert.equal(loaded.decisions.length, 1);
  assert.equal(loaded.decisions[0].decisionId, 'valid-1');
});

test('the log keeps a bounded number of the newest decisions', () => {
  const storage = new MemoryStorage();
  const store = createMasteryStore(storage);
  for (let index = 0; index < MAX_SAVED_DECISIONS + 10; index += 1) {
    store.saveDecision(
      'course-1',
      decision({
        decisionId: `decision-${index}`,
        at: new Date(Date.parse('2026-03-01T12:00:00.000Z') + index * 1000).toISOString(),
      })
    );
  }
  const loaded = store.load('course-1');
  assert.equal(loaded.decisions.length, MAX_SAVED_DECISIONS);
  assert.equal(loaded.decisions[0].decisionId, 'decision-10');
  assert.equal(
    loaded.decisions[loaded.decisions.length - 1].decisionId,
    `decision-${MAX_SAVED_DECISIONS + 9}`
  );
});

test('a missing log loads as an empty log and storage is required', () => {
  const storage = new MemoryStorage();
  const store = createMasteryStore(storage);
  assert.deepEqual(loadMasteryLogOrDefault(store, 'course-1'), createEmptyMasteryLog());
  assert.throws(() => createMasteryStore(null));
});
