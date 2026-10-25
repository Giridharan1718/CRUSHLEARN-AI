import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_STORAGE_VERSION,
  createReviewStore,
  getReviewStorageKey,
  loadReviewOrDefault,
} from '../../src/learning/reviewStore.mjs';
import {
  buildNextReview,
  createEmptyReviewState,
} from '../../src/learning/reviewScheduler.mjs';

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

const concept = {
  id: 'concept-1',
  courseId: 'web-dev-101',
  objectiveId: 'objective-1',
  lessonId: 'lesson-1',
  title: 'Concept one',
};

function reviewedState() {
  return buildNextReview({
    concept,
    outcome: 'correct',
    selfAssessment: 'easy',
    now: '2026-03-01T12:00:00.000Z',
  }).state;
}

test('review schedules round-trip through a course-scoped key', () => {
  const storage = new MemoryStorage();
  const store = createReviewStore(storage);
  const state = reviewedState();

  const saved = store.save(
    'web-dev-101',
    state,
    '2026-03-02T00:00:00.000Z'
  );
  assert.equal(saved.schemaVersion, REVIEW_STORAGE_VERSION);
  assert.equal(saved.courseId, 'web-dev-101');
  assert.equal(saved.updatedAt, '2026-03-02T00:00:00.000Z');
  assert.equal(
    getReviewStorageKey('web-dev-101'),
    'crushlearn_review_web-dev-101'
  );

  const loaded = store.load('web-dev-101');
  assert.equal(loaded.records['concept-1'].intervalDays, 3);
  assert.equal(loaded.records['concept-1'].lastOutcome, 'correct');
  assert.equal(loaded.records['concept-1'].lastSelfAssessment, 'easy');
  assert.equal(
    loaded.records['concept-1'].dueAt,
    '2026-03-04T12:00:00.000Z'
  );
});

test('review schedules for different courses are isolated and clear separately', () => {
  const storage = new MemoryStorage();
  const store = createReviewStore(storage);
  const state = reviewedState();

  store.save('web-dev-101', state);
  store.save('python-basics', createEmptyReviewState());

  assert.notEqual(store.load('web-dev-101'), null);
  assert.deepEqual(store.load('python-basics').records, {});

  store.clear('web-dev-101');
  assert.equal(store.load('web-dev-101'), null);
  assert.notEqual(store.load('python-basics'), null);
});

test('corrupt, mismatched or incomplete envelopes are ignored safely', () => {
  const storage = new MemoryStorage();
  const store = createReviewStore(storage);
  const key = getReviewStorageKey('web-dev-101');

  storage.setItem(key, '{not json');
  assert.equal(store.load('web-dev-101'), null);

  storage.setItem(
    key,
    JSON.stringify({
      schemaVersion: 999,
      courseId: 'web-dev-101',
      records: {},
    })
  );
  assert.equal(store.load('web-dev-101'), null);

  storage.setItem(
    key,
    JSON.stringify({
      schemaVersion: REVIEW_STORAGE_VERSION,
      courseId: 'python-basics',
      records: {},
    })
  );
  assert.equal(store.load('web-dev-101'), null);

  storage.setItem(
    key,
    JSON.stringify({
      schemaVersion: REVIEW_STORAGE_VERSION,
      courseId: 'web-dev-101',
      records: [],
    })
  );
  assert.equal(store.load('web-dev-101'), null);
});

test('malformed records are dropped while valid records survive', () => {
  const storage = new MemoryStorage();
  const store = createReviewStore(storage);
  const valid = reviewedState().records['concept-1'];
  const key = getReviewStorageKey('web-dev-101');

  storage.setItem(
    key,
    JSON.stringify({
      schemaVersion: REVIEW_STORAGE_VERSION,
      courseId: 'web-dev-101',
      records: {
        'concept-1': valid,
        bad: { conceptId: 'bad', dueAt: 'not a date' },
        mismatched: {
          conceptId: 'different-id',
          dueAt: '2026-03-04T12:00:00.000Z',
        },
        notAnObject: 'nope',
      },
    })
  );

  const loaded = store.load('web-dev-101');
  assert.deepEqual(Object.keys(loaded.records), ['concept-1']);
  assert.equal(loaded.records.bad, undefined);
  assert.equal(loaded.records.mismatched, undefined);
});

test('a missing saved schedule loads as an empty review state', () => {
  const storage = new MemoryStorage();
  const store = createReviewStore(storage);
  assert.equal(store.load('web-dev-101'), null);
  assert.deepEqual(loadReviewOrDefault(store, 'web-dev-101').records, {});
});

test('the review store refuses an unusable storage adapter', () => {
  assert.throws(() => createReviewStore({}), /requires a storage adapter/i);
});
