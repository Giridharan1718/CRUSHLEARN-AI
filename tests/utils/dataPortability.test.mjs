// Export, import and wipe are real operations, so the tests check the whole
// round trip rather than a single function.
//
// The rules under test:
//   - an export contains every app store the app writes
//   - an export never contains the credential file or the live session
//   - an import of a valid file restores the data
//   - an import of a foreign or unknown file is refused, and nothing is
//     written when it is refused
//   - a wipe leaves no app data behind

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXCLUDED_EXPORT_KEYS,
  EXPORT_FILE_PREFIX,
  EXPORT_FORMAT,
  EXPORT_SCHEMA_VERSION,
  applyImport,
  buildExport,
  listAppKeys,
  parseImport,
  serializeExport,
  wipeAccountData,
  wipeAllData,
} from '../../src/utils/dataPortability.mjs';
import { MemoryStorage } from '../notebooks/memoryStorage.mjs';

function seedStorage() {
  const storage = new MemoryStorage();
  storage.setItem('crushlearn_notebooks_user-1', JSON.stringify([{ id: 'n1' }]));
  storage.setItem(
    'crushlearn_notebook_sources_user-1::nb-1',
    JSON.stringify({ sources: ['s1'] })
  );
  storage.setItem('crushlearn_notebook_chat_user-1::nb-1', JSON.stringify([]));
  // A store the app does not know about yet, added later. It must still be
  // exported, because the key list is matched by prefix.
  storage.setItem('crushlearn_a_store_added_later', JSON.stringify({ ok: true }));
  // A key that does not belong to the app.
  storage.setItem('some_other_app_key', JSON.stringify({ keep: true }));
  return storage;
}

test('an export contains every app store and leaves other keys alone', () => {
  const storage = seedStorage();
  const result = buildExport(storage, '2026-10-21T12:00:00.000Z');

  assert.equal(result.ok, true);
  assert.equal(result.count, 4);
  const keys = result.envelope.entries.map((entry) => entry.key);
  assert.ok(keys.includes('crushlearn_notebooks_user-1'));
  assert.ok(keys.includes('crushlearn_notebook_sources_user-1::nb-1'));
  assert.ok(keys.includes('crushlearn_a_store_added_later'));
  assert.equal(keys.includes('some_other_app_key'), false);
  assert.equal(result.envelope.format, EXPORT_FORMAT);
  assert.equal(result.envelope.schemaVersion, EXPORT_SCHEMA_VERSION);
  assert.equal(result.envelope.exportedAt, '2026-10-21T12:00:00.000Z');
});

test('an export never contains the credentials or the live session', () => {
  const storage = seedStorage();
  storage.setItem('crushlearn_accounts', JSON.stringify({ accounts: [{ id: 'u1' }] }));
  storage.setItem('crushlearn_user', JSON.stringify({ id: 'user-1' }));

  const result = buildExport(storage);
  const keys = result.envelope.entries.map((entry) => entry.key);
  EXCLUDED_EXPORT_KEYS.forEach((key) => {
    assert.equal(keys.includes(key), false, `${key} must not be exported`);
  });
  // The password verifier must not appear anywhere in the file.
  assert.doesNotMatch(serializeExport(result.envelope), /password/i);
});

test('the listed keys are exactly the app-owned, non-credential keys', () => {
  const storage = seedStorage();
  const keys = listAppKeys(storage);
  assert.equal(keys.length, 4);
  keys.forEach((key) => assert.ok(key.startsWith(EXPORT_FILE_PREFIX)));
});

test('a value that is not JSON survives the export as raw text', () => {
  const storage = new MemoryStorage();
  storage.setItem('crushlearn_raw_value', 'not json at all');

  const result = buildExport(storage);
  assert.equal(result.ok, true);
  assert.equal(result.envelope.entries[0].value, 'not json at all');
  assert.equal(result.envelope.entries[0].raw, true);
});

test('an export that cannot be read completely refuses to export', () => {
  const storage = new MemoryStorage();
  storage.setItem('crushlearn_good', JSON.stringify({ a: 1 }));
  storage.setItem('crushlearn_broken', JSON.stringify({ b: 2 }));
  // A key that reports itself as unreadable.
  storage.getItem = (key) => {
    if (key === 'crushlearn_broken') return null;
    return JSON.stringify({ a: 1 });
  };

  const result = buildExport(storage);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes('could not be read'));
});

test('an export survives a round trip through a file', () => {
  const storage = seedStorage();
  const result = buildExport(storage);
  const text = serializeExport(result.envelope);

  const parsed = parseImport(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.entries.length, 4);
  assert.equal(parsed.exportedAt, result.envelope.exportedAt);
});

test('an import restores the exported data into a different browser', () => {
  const source = seedStorage();
  const exported = buildExport(source);
  const text = serializeExport(exported.envelope);

  const target = new MemoryStorage();
  const parsed = parseImport(text);
  assert.equal(parsed.ok, true);

  const applied = applyImport(parsed.entries, target);
  assert.equal(applied.ok, true);
  assert.equal(applied.written.length, 4);
  assert.equal(
    target.getItem('crushlearn_notebook_sources_user-1::nb-1'),
    JSON.stringify({ sources: ['s1'] })
  );
  assert.equal(
    target.getItem('crushlearn_a_store_added_later'),
    JSON.stringify({ ok: true })
  );
});

test('a replace import clears the previous data first', () => {
  const source = seedStorage();
  const exported = buildExport(source);

  const target = new MemoryStorage();
  target.setItem('crushlearn_old_store', JSON.stringify({ stale: true }));

  const parsed = parseImport(serializeExport(exported.envelope));
  const applied = applyImport(parsed.entries, target, { mode: 'replace' });

  assert.equal(applied.ok, true);
  assert.equal(target.getItem('crushlearn_old_store'), null);
  assert.ok(applied.removed.includes('crushlearn_old_store'));
});

test('a merge import leaves data the import does not mention', () => {
  const source = seedStorage();
  const exported = buildExport(source);

  const target = new MemoryStorage();
  target.setItem('crushlearn_old_store', JSON.stringify({ stale: true }));

  const parsed = parseImport(serializeExport(exported.envelope));
  const applied = applyImport(parsed.entries, target, { mode: 'merge' });

  assert.equal(applied.ok, true);
  assert.equal(target.getItem('crushlearn_old_store'), JSON.stringify({ stale: true }));
});

test('a foreign file is refused and nothing is written', () => {
  const storage = new MemoryStorage();
  storage.setItem('crushlearn_keep', JSON.stringify({ a: 1 }));

  const foreign = parseImport(JSON.stringify({ format: 'something-else', entries: [] }));
  assert.equal(foreign.ok, false);
  assert.match(foreign.errors[0], /not a CrushLearn export/i);

  const applied = applyImport(foreign.entries || [], storage);
  assert.equal(applied.ok, false);
  assert.equal(storage.getItem('crushlearn_keep'), JSON.stringify({ a: 1 }));
});

test('an export from a different schema version is refused', () => {
  const result = parseImport(
    JSON.stringify({
      format: EXPORT_FORMAT,
      schemaVersion: EXPORT_SCHEMA_VERSION + 1,
      entries: [{ key: 'crushlearn_x', value: 1 }],
    })
  );
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /different version/i);
});

test('a file that is not JSON is refused', () => {
  const result = parseImport('this is not json');
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /not valid JSON/i);
});

test('an import that targets a credential key is refused', () => {
  const result = parseImport(
    JSON.stringify({
      format: EXPORT_FORMAT,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      entries: [{ key: 'crushlearn_accounts', value: { accounts: [] } }],
    })
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /never written by an import/i);
});

test('an import that targets a key outside the app is refused', () => {
  const result = parseImport(
    JSON.stringify({
      format: EXPORT_FORMAT,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      entries: [{ key: 'some_other_app_key', value: 1 }],
    })
  );
  assert.equal(result.ok, false);
});

test('an import that lists the same key twice is refused', () => {
  const result = parseImport(
    JSON.stringify({
      format: EXPORT_FORMAT,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      entries: [
        { key: 'crushlearn_x', value: 1 },
        { key: 'crushlearn_x', value: 2 },
      ],
    })
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /more than once/i);
});

test('an empty import is refused rather than wiping the browser', () => {
  const storage = new MemoryStorage();
  storage.setItem('crushlearn_keep', JSON.stringify({ a: 1 }));
  const applied = applyImport([], storage, { mode: 'replace' });
  assert.equal(applied.ok, false);
  assert.equal(storage.getItem('crushlearn_keep'), JSON.stringify({ a: 1 }));
});

test('a wipe removes every app key and leaves other keys alone', () => {
  const storage = seedStorage();
  storage.setItem('crushlearn_accounts', JSON.stringify({ accounts: [] }));
  storage.setItem('crushlearn_user', JSON.stringify({ id: 'user-1' }));

  const result = wipeAllData(storage);
  assert.equal(result.ok, true);
  assert.equal(result.removed, 6);

  assert.equal(storage.getItem('crushlearn_notebooks_user-1'), null);
  assert.equal(storage.getItem('crushlearn_accounts'), null);
  assert.equal(storage.getItem('crushlearn_user'), null);
  // A key that is not ours is left where it is.
  assert.equal(storage.getItem('some_other_app_key'), JSON.stringify({ keep: true }));
});

test('wiping one account leaves the other account alone', () => {
  const storage = new MemoryStorage();
  storage.setItem('crushlearn_notebooks_user-1', JSON.stringify([{ id: 'n1' }]));
  storage.setItem('crushlearn_notebooks_user-2', JSON.stringify([{ id: 'n2' }]));
  storage.setItem(
    'crushlearn_notebook_sources_user-1::nb-1',
    JSON.stringify({ sources: ['s1'] })
  );
  storage.setItem(
    'crushlearn_notebook_sources_user-2::nb-1',
    JSON.stringify({ sources: ['s2'] })
  );

  const result = wipeAccountData('user-1', storage);
  assert.equal(result.ok, true);
  assert.equal(result.removed, 2);

  assert.equal(storage.getItem('crushlearn_notebooks_user-1'), null);
  assert.equal(
    storage.getItem('crushlearn_notebook_sources_user-1::nb-1'),
    null
  );
  assert.ok(storage.getItem('crushlearn_notebooks_user-2'));
  assert.ok(storage.getItem('crushlearn_notebook_sources_user-2::nb-1'));
});

test('an account wipe does not remove the credential file or the session', () => {
  const storage = new MemoryStorage();
  storage.setItem('crushlearn_accounts', JSON.stringify({ accounts: [] }));
  storage.setItem('crushlearn_user', JSON.stringify({ id: 'user-1' }));
  storage.setItem('crushlearn_notebooks_user-1', JSON.stringify([{ id: 'n1' }]));

  wipeAccountData('user-1', storage);
  assert.ok(storage.getItem('crushlearn_accounts'));
  assert.ok(storage.getItem('crushlearn_user'));
  assert.equal(storage.getItem('crushlearn_notebooks_user-1'), null);
});

test('a wipe with no account selected changes nothing', () => {
  const storage = seedStorage();
  const result = wipeAccountData('', storage);
  assert.equal(result.ok, false);
  assert.equal(storage.getItem('crushlearn_notebooks_user-1'), JSON.stringify([{ id: 'n1' }]));
});
