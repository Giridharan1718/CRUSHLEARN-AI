import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createJourneyProgressStore,
  getJourneyStorageKey,
} from '../../src/learning/journeyProgressStore.mjs';

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      data.set(key, String(value));
    },
    removeItem: (key) => {
      data.delete(key);
    },
    keys: () => [...data.keys()],
  };
}

const sampleState = {
  schemaVersion: 1,
  stage: 'guided_practice',
  guidedPractice: { index: 1, records: { 'gp-1': { attempts: 1 } } },
  completed: false,
};

test('round-trips journey progress through storage', () => {
  const storage = createMemoryStorage();
  const store = createJourneyProgressStore(storage);

  assert.equal(store.load('web-dev-101', 'lesson-1'), null);

  store.save('web-dev-101', 'lesson-1', sampleState, '2026-01-01T00:00:00.000Z');
  const loaded = store.load('web-dev-101', 'lesson-1');

  assert.equal(loaded.stage, 'guided_practice');
  assert.equal(loaded.courseId, 'web-dev-101');
  assert.equal(loaded.lessonId, 'lesson-1');
  assert.equal(loaded.updatedAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(loaded.guidedPractice.records['gp-1'], { attempts: 1 });
});

test('progress keys are scoped by course and lesson so reused ids cannot collide', () => {
  const storage = createMemoryStorage();
  const store = createJourneyProgressStore(storage);

  assert.notEqual(
    getJourneyStorageKey('web-dev-101', 'lesson-1'),
    getJourneyStorageKey('python-basics', 'lesson-1')
  );

  store.save(
    'web-dev-101',
    'lesson-1',
    { ...sampleState, stage: 'assessment' },
    '2026-01-01T00:00:00.000Z'
  );
  store.save(
    'python-basics',
    'lesson-1',
    { ...sampleState, stage: 'explanation' },
    '2026-01-01T00:00:00.000Z'
  );

  assert.equal(store.load('web-dev-101', 'lesson-1').stage, 'assessment');
  assert.equal(store.load('python-basics', 'lesson-1').stage, 'explanation');
  assert.equal(store.load('web-dev-101', 'lesson-2'), null);
});

test('corrupt or foreign payloads are ignored instead of crashing', () => {
  const storage = createMemoryStorage();
  const store = createJourneyProgressStore(storage);

  storage.setItem(
    getJourneyStorageKey('web-dev-101', 'lesson-1'),
    '{not valid json'
  );
  assert.equal(store.load('web-dev-101', 'lesson-1'), null);

  storage.setItem(
    getJourneyStorageKey('web-dev-101', 'lesson-2'),
    JSON.stringify({
      schemaVersion: 999,
      courseId: 'web-dev-101',
      lessonId: 'lesson-2',
    })
  );
  assert.equal(store.load('web-dev-101', 'lesson-2'), null);

  storage.setItem(
    getJourneyStorageKey('web-dev-101', 'lesson-3'),
    JSON.stringify({
      schemaVersion: 1,
      courseId: 'python-basics',
      lessonId: 'lesson-1',
    })
  );
  assert.equal(store.load('web-dev-101', 'lesson-3'), null);
});

test('clear removes only the requested lesson journey', () => {
  const storage = createMemoryStorage();
  const store = createJourneyProgressStore(storage);

  store.save('web-dev-101', 'lesson-1', sampleState, '2026-01-01T00:00:00.000Z');
  store.save('web-dev-101', 'lesson-2', sampleState, '2026-01-01T00:00:00.000Z');

  store.clear('web-dev-101', 'lesson-1');
  assert.equal(store.load('web-dev-101', 'lesson-1'), null);
  assert.notEqual(store.load('web-dev-101', 'lesson-2'), null);
});

test('the store refuses to be created without a storage adapter', () => {
  assert.throws(
    () => createJourneyProgressStore(null),
    /requires a storage adapter/
  );
});
