// The streak is derived from dated activity, never stored as a number.
//
// These tests pin the derivation rules:
//   - a streak counts consecutive days ending today, or ending yesterday when
//     today has no activity yet
//   - a gap ends the streak
//   - several entries on one day count once
//   - a learner can opt out, and the derived figures then disappear

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVITY_KINDS,
  ACTIVITY_STORAGE_PREFIX,
  calculateStreak,
  activeDays,
  createActivityStore,
  getActivityStorageKey,
} from '../../src/utils/activityStore.mjs';
import { MemoryStorage } from '../notebooks/memoryStorage.mjs';

const at = (day) => `${day}T12:00:00.000Z`;

function entriesFor(days) {
  return days.map((day) => ({ day, kind: 'lesson_completed', at: at(day) }));
}

test('a streak counts consecutive days ending today', () => {
  const now = new Date(2026, 9, 21, 12, 0, 0);
  const streak = calculateStreak(
    entriesFor(['2026-10-19', '2026-10-20', '2026-10-21']),
    now
  );
  assert.equal(streak, 3);
});

test('a streak still counts when today has no activity yet', () => {
  const now = new Date(2026, 9, 21, 8, 0, 0);
  const streak = calculateStreak(
    entriesFor(['2026-10-19', '2026-10-20']),
    now
  );
  assert.equal(streak, 2);
});

test('a gap ends the streak', () => {
  const now = new Date(2026, 9, 21, 12, 0, 0);
  const streak = calculateStreak(
    entriesFor(['2026-10-15', '2026-10-16', '2026-10-18', '2026-10-19', '2026-10-20']),
    now
  );
  // The 17th is missing, so the run stops after the 18th, 19th and 20th. The
  // earlier pair is a separate streak and is not counted.
  assert.equal(streak, 3);
});

test('activity that stopped days ago is not a streak', () => {
  const now = new Date(2026, 9, 21, 12, 0, 0);
  const streak = calculateStreak(
    entriesFor(['2026-10-17', '2026-10-18']),
    now
  );
  assert.equal(streak, 0);
});

test('several entries on one day count once', () => {
  const now = new Date(2026, 9, 21, 12, 0, 0);
  const entries = [
    { day: '2026-10-20', kind: 'lesson_completed', at: at('2026-10-20') },
    { day: '2026-10-20', kind: 'quiz_completed', at: at('2026-10-20') },
    { day: '2026-10-21', kind: 'note_saved', at: at('2026-10-21') },
  ];
  assert.equal(calculateStreak(entries, now), 2);
});

test('no activity is a zero streak, not a crash', () => {
  const now = new Date(2026, 9, 21, 12, 0, 0);
  assert.equal(calculateStreak([], now), 0);
  assert.equal(calculateStreak(null, now), 0);
  assert.equal(calculateStreak([{ kind: 'x' }], now), 0);
});

test('the active days are listed newest first with their counts', () => {
  const days = activeDays([
    { day: '2026-10-19', at: at('2026-10-19') },
    { day: '2026-10-21', at: at('2026-10-21') },
    { day: '2026-10-21', at: at('2026-10-21') },
  ]);
  assert.deepEqual(days, [
    { day: '2026-10-21', count: 2 },
    { day: '2026-10-19', count: 1 },
  ]);
});

test('recording activity stores a dated entry under the learner', () => {
  const storage = new MemoryStorage();
  const store = createActivityStore(storage);

  const entry = store.record(
    'user-1',
    'lesson_completed',
    'Finished the first lesson',
    at('2026-10-21')
  );
  assert.equal(entry.kind, 'lesson_completed');
  assert.equal(entry.day, '2026-10-21');
  assert.equal(entry.detail, 'Finished the first lesson');

  assert.equal(store.list('user-1').length, 1);
  assert.ok(storage.getItem(getActivityStorageKey('user-1')));
  assert.equal(getActivityStorageKey('user-1').startsWith(ACTIVITY_STORAGE_PREFIX), true);
});

test('activity is scoped to the learner', () => {
  const storage = new MemoryStorage();
  const store = createActivityStore(storage);
  store.record('user-1', 'lesson_completed', '', at('2026-10-21'));
  store.record('user-2', 'note_saved', '', at('2026-10-21'));

  assert.equal(store.list('user-1').length, 1);
  assert.equal(store.list('user-2').length, 1);
  assert.equal(store.list('user-1')[0].kind, 'lesson_completed');
});

test('an unknown activity kind is not stored', () => {
  const storage = new MemoryStorage();
  const store = createActivityStore(storage);
  assert.equal(store.record('user-1', 'not_a_real_kind', '', at('2026-10-21')), null);
  assert.equal(store.list('user-1').length, 0);
  assert.ok(ACTIVITY_KINDS.includes('lesson_completed'));
});

test('opting out stops new entries and can be turned back on', () => {
  const storage = new MemoryStorage();
  const store = createActivityStore(storage);
  store.record('user-1', 'lesson_completed', '', at('2026-10-21'));

  assert.equal(store.setTrackingEnabled('user-1', false), false);
  assert.equal(store.isTrackingEnabled('user-1'), false);
  assert.equal(store.record('user-1', 'note_saved', '', at('2026-10-21')), null);
  // The history already recorded is kept; only new writes stop.
  assert.equal(store.list('user-1').length, 1);

  assert.equal(store.setTrackingEnabled('user-1', true), true);
  assert.ok(store.record('user-1', 'note_saved', '', at('2026-10-21')));
});

test('the history can be cleared', () => {
  const storage = new MemoryStorage();
  const store = createActivityStore(storage);
  store.record('user-1', 'lesson_completed', '', at('2026-10-21'));
  store.clear('user-1');
  assert.deepEqual(store.list('user-1'), []);
});

test('a corrupted activity file is ignored rather than crashing the app', () => {
  const storage = new MemoryStorage();
  storage.setItem(getActivityStorageKey('user-1'), '{not json');
  const store = createActivityStore(storage);
  assert.deepEqual(store.list('user-1'), []);
  assert.equal(store.isTrackingEnabled('user-1'), true);
});
