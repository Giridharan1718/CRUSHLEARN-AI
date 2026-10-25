import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_PROGRESS_VERSION,
  createActivityProgressStore,
  getActivityProgressKey,
} from '../../src/learning/activityProgress.mjs';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
}

test('activity progress round-trips under a course-and-lesson key', () => {
  const storage = memoryStorage();
  const store = createActivityProgressStore(storage);
  const known = ['a', 'b', 'c'];

  assert.deepEqual(store.load('web-dev-101', 'lesson-2', known), []);
  assert.equal(store.save('web-dev-101', 'lesson-2', ['a', 'b', 'a']), true);
  assert.deepEqual(store.load('web-dev-101', 'lesson-2', known), ['a', 'b']);
  assert.ok(
    storage.values.has(getActivityProgressKey('web-dev-101', 'lesson-2'))
  );
});

test('activity progress ignores unknown ids and mismatched or corrupt data', () => {
  const storage = memoryStorage();
  const store = createActivityProgressStore(storage);
  store.save('web-dev-101', 'lesson-2', ['a', 'not-real']);
  assert.deepEqual(store.load('web-dev-101', 'lesson-2', ['a', 'b']), ['a']);

  storage.setItem(
    getActivityProgressKey('web-dev-101', 'lesson-2'),
    JSON.stringify({
      version: ACTIVITY_PROGRESS_VERSION,
      courseId: 'python-basics',
      lessonId: 'lesson-2',
      completedActivityIds: ['a'],
    })
  );
  assert.deepEqual(store.load('web-dev-101', 'lesson-2', ['a']), []);

  storage.setItem(
    getActivityProgressKey('web-dev-101', 'lesson-2'),
    '{not json'
  );
  assert.deepEqual(store.load('web-dev-101', 'lesson-2', ['a']), []);
});

test('activity progress saves and clears per course', () => {
  const storage = memoryStorage();
  const store = createActivityProgressStore(storage);

  store.save('web-dev-101', 'lesson-2', ['a']);
  store.save('python-basics', 'lesson-2', ['b']);

  assert.deepEqual(store.load('web-dev-101', 'lesson-2', ['a']), ['a']);
  assert.deepEqual(store.load('python-basics', 'lesson-2', ['b']), ['b']);

  assert.equal(store.clear('web-dev-101', 'lesson-2'), true);
  assert.deepEqual(store.load('web-dev-101', 'lesson-2', ['a']), []);
  assert.deepEqual(store.load('python-basics', 'lesson-2', ['b']), ['b']);
});

test('a missing storage adapter is a safe empty store', () => {
  const store = createActivityProgressStore(null);
  assert.deepEqual(store.load('web-dev-101', 'lesson-2', ['a']), []);
  assert.equal(store.save('web-dev-101', 'lesson-2', ['a']), false);
  assert.equal(store.clear('web-dev-101', 'lesson-2'), false);
});
