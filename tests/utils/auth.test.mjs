// The auth service is the seam every page uses to read "who is signed in".
// These tests cover the behaviour that changed when the demo sign-in was
// replaced with a real credential check:
//
//   - a wrong password does not sign anyone in
//   - a session survives a reload
//   - signing out keeps the account and the learner's data
//   - the profile starts empty instead of carrying a fabricated streak

import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryStorage } from '../notebooks/memoryStorage.mjs';

const originalLocalStorage = globalThis.localStorage;

function installStorage() {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  return storage;
}

function restoreStorage() {
  if (originalLocalStorage === undefined) {
    delete globalThis.localStorage;
  } else {
    globalThis.localStorage = originalLocalStorage;
  }
}

// The module reads `globalThis.localStorage` on every call, so the storage
// can be swapped between tests without re-importing it.
async function withStorage(run) {
  const storage = installStorage();
  try {
    const { AuthService } = await import(`../../src/utils/auth.js?case=${Math.random()}`);
    await run({ AuthService, storage });
  } finally {
    restoreStorage();
  }
}

test('registering signs the learner in with a real account', async () => {
  await withStorage(async ({ AuthService, storage }) => {
    const result = await AuthService.register('Ada', 'ada@example.com', 'analytical-engine');
    assert.equal(result.success, true);
    assert.equal(result.user.email, 'ada@example.com');
    assert.equal(result.user.name, 'Ada');
    assert.equal(AuthService.isAuthenticated(), true);
    assert.ok(storage.getItem('crushlearn_user'));
  });
});

test('a wrong password does not sign anyone in', async () => {
  await withStorage(async ({ AuthService }) => {
    await AuthService.register('Ada', 'ada@example.com', 'analytical-engine');
    AuthService.logout();

    const result = await AuthService.login('ada@example.com', 'wrong-password');
    assert.equal(result.success, false);
    assert.match(result.error, /incorrect/i);
    assert.equal(AuthService.isAuthenticated(), false);
    assert.equal(AuthService.getCurrentUser(), null);
  });
});

test('a failed sign-in does not tear down a session that already exists', async () => {
  await withStorage(async ({ AuthService }) => {
    await AuthService.register('Ada', 'ada@example.com', 'analytical-engine');

    // The learner is signed in and mistypes their password. They are still
    // signed in as themselves; the failed attempt created nothing.
    const result = await AuthService.login('ada@example.com', 'wrong-password');
    assert.equal(result.success, false);
    assert.equal(AuthService.isAuthenticated(), true);
    assert.equal(AuthService.getCurrentUser().email, 'ada@example.com');
  });
});

test('signing in again with the right password works', async () => {
  await withStorage(async ({ AuthService }) => {
    await AuthService.register('Ada', 'ada@example.com', 'analytical-engine');
    AuthService.logout();
    assert.equal(AuthService.isAuthenticated(), false);

    const result = await AuthService.login('ADA@example.com', 'analytical-engine');
    assert.equal(result.success, true);
    assert.equal(AuthService.isAuthenticated(), true);
  });
});

test('a session survives a reload and points at a real account', async () => {
  const storage = installStorage();
  try {
    const { AuthService } = await import(`../../src/utils/auth.js?reload=${Math.random()}`);
    await AuthService.register('Ada', 'ada@example.com', 'analytical-engine');
  } finally {
    restoreStorage();
  }

  // A second module instance over the same storage is what a page reload
  // looks like.
  globalThis.localStorage = storage;
  try {
    const { AuthService } = await import(`../../src/utils/auth.js?reload2=${Math.random()}`);
    assert.equal(AuthService.isAuthenticated(), true);
    const user = AuthService.getCurrentUser();
    assert.equal(user.email, 'ada@example.com');
    assert.equal(user.name, 'Ada');
  } finally {
    restoreStorage();
  }
});

test('a session pointing at a deleted account is not authenticated', async () => {
  await withStorage(async ({ AuthService, storage }) => {
    await AuthService.register('Ada', 'ada@example.com', 'analytical-engine');
    // The account file is replaced with an empty one, as a wipe would.
    storage.setItem('crushlearn_accounts', JSON.stringify({ schemaVersion: 1, accounts: [] }));
    assert.equal(AuthService.isAuthenticated(), false);
    assert.equal(AuthService.getCurrentUser(), null);
  });
});

test('signing out keeps the account so the learner can sign back in', async () => {
  await withStorage(async ({ AuthService, storage }) => {
    await AuthService.register('Ada', 'ada@example.com', 'analytical-engine');
    AuthService.logout();

    assert.equal(AuthService.isAuthenticated(), false);
    assert.ok(storage.getItem('crushlearn_accounts'), 'the account must be kept');

    const result = await AuthService.login('ada@example.com', 'analytical-engine');
    assert.equal(result.success, true);
  });
});

test('a new learner is given no fabricated streak or completed lessons', async () => {
  await withStorage(async ({ AuthService }) => {
    const result = await AuthService.register('Ada', 'ada@example.com', 'analytical-engine');
    assert.equal(result.user.learningStreak, undefined);
    assert.deepEqual(result.user.completedLessons, []);
    assert.deepEqual(result.user.enrolledCourses, []);
    assert.equal(result.user.skillPassport.skills.length, 0);
  });
});

test('the profile fields a page edits are saved and read back', async () => {
  await withStorage(async ({ AuthService }) => {
    await AuthService.register('Ada', 'ada@example.com', 'analytical-engine');
    const updated = AuthService.updateUser({
      name: 'Ada Lovelace',
      bio: 'Studies engines.',
      learningGoal: 'Ship the notebook pipeline.',
    });

    assert.equal(updated.name, 'Ada Lovelace');
    assert.equal(AuthService.getCurrentUser().bio, 'Studies engines.');
    assert.equal(
      AuthService.getCurrentUser().learningGoal,
      'Ship the notebook pipeline.'
    );
  });
});

test('updating a profile while signed out changes nothing', async () => {
  await withStorage(async ({ AuthService }) => {
    assert.equal(AuthService.updateUser({ name: 'Nobody' }), null);
  });
});

test('the user id is available for the stores that scope data by learner', async () => {
  await withStorage(async ({ AuthService }) => {
    assert.equal(AuthService.getUserId(), null);
    const result = await AuthService.register('Ada', 'ada@example.com', 'analytical-engine');
    assert.equal(AuthService.getUserId(), result.user.id);
  });
});

test('registering the same email twice is refused', async () => {
  await withStorage(async ({ AuthService }) => {
    await AuthService.register('Ada', 'ada@example.com', 'analytical-engine');
    const second = await AuthService.register('Someone', 'ada@example.com', 'another-password');
    assert.equal(second.success, false);
    assert.match(second.error, /already uses this email/i);
  });
});
