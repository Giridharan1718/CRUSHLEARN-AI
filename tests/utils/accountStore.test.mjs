// The credential store is the foundation of every real-auth behaviour in the
// app, so these tests are deliberately about what the store refuses to do as
// much as about what it allows.
//
// The rules under test:
//   - a password is never stored in the clear
//   - a wrong password never signs in
//   - one email address is one account
//   - the stored record survives a reload
//   - deleting an account removes its record

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCOUNTS_STORAGE_KEY,
  ACCOUNT_SCHEMA_VERSION,
  MIN_PASSWORD_LENGTH,
  createAccountStore,
  hashPassword,
  normalizeEmail,
  validateEmail,
  validateName,
  validatePassword,
  verifiersMatch,
} from '../../src/utils/accountStore.mjs';
import { MemoryStorage } from '../notebooks/memoryStorage.mjs';

function readRawAccounts(storage) {
  const raw = storage.getItem(ACCOUNTS_STORAGE_KEY);
  assert.ok(raw, 'the credential file should exist');
  return JSON.parse(raw);
}

test('registration stores a derived verifier and never the password', async () => {
  const storage = new MemoryStorage();
  const store = createAccountStore(storage);

  const result = await store.register({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'analytical-engine',
  });

  assert.equal(result.ok, true);
  assert.equal(result.account.email, 'ada@example.com');
  assert.equal(result.account.profile.name, 'Ada Lovelace');
  // A new account starts with no progress, so nothing is invented.
  assert.deepEqual(result.account.profile.completedLessons, []);
  assert.deepEqual(result.account.profile.enrolledCourses, []);

  const raw = storage.getItem(ACCOUNTS_STORAGE_KEY);
  assert.doesNotMatch(raw, /analytical-engine/);
  assert.notEqual(result.account.password.hash, 'analytical-engine');
  assert.ok(result.account.password.salt);
  assert.ok(result.account.password.hash.length >= 32);
});

test('a new account carries no fabricated streak or progress', async () => {
  const storage = new MemoryStorage();
  const store = createAccountStore(storage);
  const result = await store.register({
    name: 'Ada',
    email: 'ada@example.com',
    password: 'analytical-engine',
  });

  assert.equal(result.account.profile.learningStreak, undefined);
  assert.equal(result.account.lastActivityDate, null);
});

test('the correct password verifies and a wrong one does not', async () => {
  const storage = new MemoryStorage();
  const store = createAccountStore(storage);
  await store.register({
    name: 'Ada',
    email: 'ada@example.com',
    password: 'analytical-engine',
  });

  const good = await store.verify('ada@example.com', 'analytical-engine');
  assert.equal(good.ok, true);
  assert.equal(good.account.email, 'ada@example.com');

  const bad = await store.verify('ada@example.com', 'analytical-engin');
  assert.equal(bad.ok, false);
  assert.equal(bad.account, undefined);
  assert.match(bad.errors[0], /incorrect/i);

  const missing = await store.verify('nobody@example.com', 'analytical-engine');
  assert.equal(missing.ok, false);
  // The same message for both, so a wrong password does not reveal whether
  // the address has an account.
  assert.equal(missing.errors[0], bad.errors[0]);
});

test('an email address is matched case-insensitively and only once', async () => {
  const storage = new MemoryStorage();
  const store = createAccountStore(storage);

  const first = await store.register({
    name: 'Ada',
    email: 'Ada@Example.COM',
    password: 'analytical-engine',
  });
  assert.equal(first.ok, true);
  assert.equal(first.account.email, 'ada@example.com');

  const duplicate = await store.register({
    name: 'Someone Else',
    email: '  ADA@example.com  ',
    password: 'another-password',
  });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.errors[0], /already uses this email/i);
  assert.equal(store.list().length, 1);
});

test('registration rejects invalid input before it writes anything', async () => {
  const storage = new MemoryStorage();
  const store = createAccountStore(storage);

  const noName = await store.register({
    name: '  ',
    email: 'ada@example.com',
    password: 'analytical-engine',
  });
  assert.equal(noName.ok, false);

  const badEmail = await store.register({
    name: 'Ada',
    email: 'not-an-email',
    password: 'analytical-engine',
  });
  assert.equal(badEmail.ok, false);

  const shortPassword = await store.register({
    name: 'Ada',
    email: 'ada@example.com',
    password: 'short',
  });
  assert.equal(shortPassword.ok, false);
  assert.match(shortPassword.errors.join(' '), new RegExp(`${MIN_PASSWORD_LENGTH} characters`));

  assert.equal(store.list().length, 0);
  assert.equal(storage.getItem(ACCOUNTS_STORAGE_KEY), null);
});

test('an explicit id is kept so migrated data stays reachable', async () => {
  const storage = new MemoryStorage();
  const store = createAccountStore(storage);
  const result = await store.register({
    name: 'Ada',
    email: 'ada@example.com',
    password: 'analytical-engine',
    id: 'user_legacy_1',
  });

  assert.equal(result.ok, true);
  assert.equal(result.account.id, 'user_legacy_1');
  assert.equal(store.findById('user_legacy_1').email, 'ada@example.com');
});

test('the record survives a reload of the store', async () => {
  const storage = new MemoryStorage();
  await createAccountStore(storage).register({
    name: 'Ada',
    email: 'ada@example.com',
    password: 'analytical-engine',
  });

  // A second store over the same storage is what a page reload looks like.
  const reloaded = createAccountStore(storage);
  assert.equal(reloaded.list().length, 1);
  const verified = await reloaded.verify('ada@example.com', 'analytical-engine');
  assert.equal(verified.ok, true);
});

test('a corrupted credential file is ignored rather than crashing the app', async () => {
  const storage = new MemoryStorage();
  storage.setItem(ACCOUNTS_STORAGE_KEY, '{not json');
  const store = createAccountStore(storage);
  assert.deepEqual(store.list(), []);
  assert.equal(store.findByEmail('ada@example.com'), null);
});

test('a record from a different schema version is not loaded', async () => {
  const storage = new MemoryStorage();
  storage.setItem(
    ACCOUNTS_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: ACCOUNT_SCHEMA_VERSION + 1,
      accounts: [
        {
          id: 'u1',
          email: 'ada@example.com',
          password: { algorithm: 'pbkdf2', salt: 'x', hash: 'y' },
          profile: {},
        },
      ],
    })
  );
  assert.deepEqual(createAccountStore(storage).list(), []);
});

test('a profile update is persisted and a missing account is reported', async () => {
  const storage = new MemoryStorage();
  const store = createAccountStore(storage);
  const { account } = await store.register({
    name: 'Ada',
    email: 'ada@example.com',
    password: 'analytical-engine',
  });

  const updated = store.updateProfile(account.id, {
    bio: 'Studies engines.',
    learningGoal: 'Ship the notebook pipeline.',
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.account.profile.bio, 'Studies engines.');
  assert.equal(
    createAccountStore(storage).findById(account.id).profile.learningGoal,
    'Ship the notebook pipeline.'
  );

  const missing = store.updateProfile('nobody', { bio: 'x' });
  assert.equal(missing.ok, false);
});

test('activity is recorded as a date and an account can be removed', async () => {
  const storage = new MemoryStorage();
  const store = createAccountStore(storage);
  const { account } = await store.register({
    name: 'Ada',
    email: 'ada@example.com',
    password: 'analytical-engine',
  });

  const recorded = store.recordActivity(account.id, '2026-10-20T10:00:00.000Z');
  assert.equal(recorded.lastActivityDate, '2026-10-20T10:00:00.000Z');

  assert.equal(store.remove(account.id), true);
  assert.equal(store.findById(account.id), null);
  assert.equal(store.remove(account.id), false);
});

test('the sign-in address can be changed and the old one stops working', async () => {
  const storage = new MemoryStorage();
  const store = createAccountStore(storage);
  const { account } = await store.register({
    name: 'Ada',
    email: 'ada@example.com',
    password: 'analytical-engine',
  });

  const changed = await store.updateEmail(account.id, 'Ada.Lovelace@Example.com');
  assert.equal(changed.ok, true);
  assert.equal(changed.account.email, 'ada.lovelace@example.com');

  const withNewAddress = await store.verify('ada.lovelace@example.com', 'analytical-engine');
  assert.equal(withNewAddress.ok, true);

  const withOldAddress = await store.verify('ada@example.com', 'analytical-engine');
  assert.equal(withOldAddress.ok, false);
});

test('an address change is refused when it is invalid or already taken', async () => {
  const storage = new MemoryStorage();
  const store = createAccountStore(storage);
  const { account } = await store.register({
    name: 'Ada',
    email: 'ada@example.com',
    password: 'analytical-engine',
  });
  await store.register({
    name: 'Grace',
    email: 'grace@example.com',
    password: 'cobol-compiler',
  });

  const invalid = await store.updateEmail(account.id, 'not-an-email');
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors[0], /valid email/i);

  const taken = await store.updateEmail(account.id, 'grace@example.com');
  assert.equal(taken.ok, false);
  assert.match(taken.errors[0], /already uses this email/i);

  // Nothing was written.
  assert.equal(store.findById(account.id).email, 'ada@example.com');
});

test('an address change for a missing account is reported', async () => {
  const storage = new MemoryStorage();
  const store = createAccountStore(storage);
  const result = await store.updateEmail('nobody', 'ada@example.com');
  assert.equal(result.ok, false);
});

test('two accounts in one browser do not see each other', async () => {  const storage = new MemoryStorage();
  const store = createAccountStore(storage);
  await store.register({
    name: 'Ada',
    email: 'ada@example.com',
    password: 'analytical-engine',
  });
  await store.register({
    name: 'Grace',
    email: 'grace@example.com',
    password: 'cobol-compiler',
  });

  const grace = await store.verify('grace@example.com', 'cobol-compiler');
  assert.equal(grace.ok, true);
  assert.equal(grace.account.profile.name, 'Grace');
  assert.equal(store.list().length, 2);
});

test('a verifier only matches its own password and salt', async () => {
  const verifier = await hashPassword('analytical-engine');
  assert.equal(await verifiersMatch(verifier, 'analytical-engine'), true);
  assert.equal(await verifiersMatch(verifier, 'analytical-engines'), false);
  assert.equal(await verifiersMatch(null, 'analytical-engine'), false);
  assert.equal(await verifiersMatch(verifier, undefined), false);
});

test('the same password registered twice produces different verifiers', async () => {
  const first = await hashPassword('analytical-engine');
  const second = await hashPassword('analytical-engine');
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
});

test('the validators reject what they should and accept what they should', () => {
  assert.equal(validateEmail('ada@example.com'), '');
  assert.notEqual(validateEmail('nope'), '');
  assert.notEqual(validateEmail(''), '');
  assert.equal(validatePassword('12345678'), '');
  assert.notEqual(validatePassword('1234567'), '');
  assert.equal(validateName('Ada'), '');
  assert.notEqual(validateName('   '), '');
  assert.notEqual(validateName('x'.repeat(81)), '');
  assert.equal(normalizeEmail('  ADA@Example.com '), 'ada@example.com');
});
