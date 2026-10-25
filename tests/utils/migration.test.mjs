// The migration runs once, on a learner's first load after the update, and
// it is the only thing standing between a returning learner and their work.
//
// The rules under test:
//   - the learner's original id is kept, so notebooks keyed by it stay
//     reachable
//   - their real work (enrolled courses, real completed lessons, the skill
//     passport) is carried over
//   - the fabricated numbers are not carried over
//   - the migration runs only once, and a second run cannot undo the first

import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryStorage } from '../notebooks/memoryStorage.mjs';
import {
  MIGRATION_STORAGE_KEY,
  MIGRATION_VERSION,
  hasMigrated,
  migrateLegacyUser,
} from '../../src/utils/migration.mjs';
import { ACCOUNTS_STORAGE_KEY, SESSION_STORAGE_KEY } from '../../src/utils/accountStore.mjs';

const LEGACY_USER_KEY = 'crushlearn_user';

function seedLegacyUser(storage, overrides = {}) {
  const legacy = {
    id: 'user_legacy_42',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    bio: 'Studies engines.',
    learningGoal: 'Ship the notebook pipeline.',
    enrolledCourses: ['web-dev-101'],
    completedLessons: ['lesson-1', 'lesson-2', 'lesson-7'],
    skillPassport: { skills: ['javascript'], certificates: ['cert-1'] },
    learningStreak: 7,
    ...overrides,
  };
  storage.setItem(LEGACY_USER_KEY, JSON.stringify(legacy));
  return legacy;
}

function readAccounts(storage) {
  const raw = storage.getItem(ACCOUNTS_STORAGE_KEY);
  assert.ok(raw, 'the migration should create an account');
  return JSON.parse(raw).accounts;
}

test('the legacy profile becomes a real account with the original id', async () => {
  const storage = new MemoryStorage();
  seedLegacyUser(storage);

  const result = await migrateLegacyUser(storage);
  assert.equal(result.ok, true);
  assert.equal(result.migrated, true);

  const accounts = readAccounts(storage);
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].id, 'user_legacy_42');
  assert.equal(accounts[0].email, 'ada@example.com');
  assert.equal(accounts[0].profile.name, 'Ada Lovelace');
  assert.equal(accounts[0].profile.bio, 'Studies engines.');
});

test('the real work is carried over and the fabricated numbers are not', async () => {
  const storage = new MemoryStorage();
  seedLegacyUser(storage);

  await migrateLegacyUser(storage);
  const profile = readAccounts(storage)[0].profile;

  // Real work is kept.
  assert.deepEqual(profile.enrolledCourses, ['web-dev-101']);
  assert.ok(profile.completedLessons.includes('lesson-7'));
  assert.deepEqual(profile.skillPassport.skills, ['javascript']);
  assert.deepEqual(profile.skillPassport.certificates, ['cert-1']);

  // The two lessons the old build marked complete without the learner
  // earning them are not migrated.
  assert.equal(profile.completedLessons.includes('lesson-1'), false);
  assert.equal(profile.completedLessons.includes('lesson-2'), false);
  assert.deepEqual(profile.completedLessons, ['lesson-7']);

  // The fabricated streak is not carried over, and no streak is stored.
  assert.equal(profile.learningStreak, undefined);
  assert.equal(readAccounts(storage)[0].lastActivityDate, null);
});

test('the learner stays signed in after the migration', async () => {
  const storage = new MemoryStorage();
  seedLegacyUser(storage);

  await migrateLegacyUser(storage);
  const session = JSON.parse(storage.getItem(SESSION_STORAGE_KEY));
  assert.equal(session.id, 'user_legacy_42');
  assert.equal(session.email, 'ada@example.com');
  assert.equal(session.migrated, true);
});

test('the migration runs only once', async () => {
  const storage = new MemoryStorage();
  seedLegacyUser(storage);

  await migrateLegacyUser(storage);
  const marker = JSON.parse(storage.getItem(MIGRATION_STORAGE_KEY));
  assert.equal(marker.version, MIGRATION_VERSION);

  // The learner changes their name after the migration.
  const accounts = readAccounts(storage);
  accounts[0].profile.name = 'Ada L.';
  storage.setItem(
    ACCOUNTS_STORAGE_KEY,
    JSON.stringify({ schemaVersion: 1, accounts, updatedAt: new Date().toISOString() })
  );

  const second = await migrateLegacyUser(storage);
  assert.equal(second.migrated, false);
  assert.equal(second.reason, 'already migrated');
  assert.equal(readAccounts(storage)[0].profile.name, 'Ada L.');
  assert.equal(readAccounts(storage).length, 1);
});

test('a learner with no legacy profile is marked migrated and gets no account', async () => {
  const storage = new MemoryStorage();
  const result = await migrateLegacyUser(storage);

  assert.equal(result.ok, true);
  assert.equal(result.migrated, false);
  assert.equal(result.reason, 'no legacy user');
  assert.equal(storage.getItem(ACCOUNTS_STORAGE_KEY), null);
  assert.equal(hasMigrated(storage), true);
});

test('a learner with a legacy profile but no email gets a local one', async () => {
  const storage = new MemoryStorage();
  seedLegacyUser(storage, { email: '' });

  const result = await migrateLegacyUser(storage);
  assert.equal(result.ok, true);
  assert.equal(result.migrated, true);
  assert.match(readAccounts(storage)[0].email, /@crushlearn\.local$/);
});

test('the migrated account cannot be signed into with a guessed password', async () => {
  const storage = new MemoryStorage();
  seedLegacyUser(storage);

  await migrateLegacyUser(storage);
  const account = readAccounts(storage)[0];

  // The migration created the account with a password the learner does not
  // know, so the verifier must not accept a plain guess.
  assert.notEqual(account.password.hash, 'analytical-engine');
  assert.ok(account.password.salt);
  assert.equal(account.password.algorithm, 'pbkdf2');
});

test('a corrupted legacy profile does not stop the app from loading', async () => {
  const storage = new MemoryStorage();
  storage.setItem(LEGACY_USER_KEY, '{not json');

  const result = await migrateLegacyUser(storage);
  assert.equal(result.ok, true);
  assert.equal(result.migrated, false);
});

test('hasMigrated reports the marker state', () => {
  const storage = new MemoryStorage();
  assert.equal(hasMigrated(storage), false);
  storage.setItem(MIGRATION_STORAGE_KEY, JSON.stringify({ version: MIGRATION_VERSION }));
  assert.equal(hasMigrated(storage), true);
  storage.setItem(MIGRATION_STORAGE_KEY, JSON.stringify({ version: 99 }));
  assert.equal(hasMigrated(storage), false);
});
