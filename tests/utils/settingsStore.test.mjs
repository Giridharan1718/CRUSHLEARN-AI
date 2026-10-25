// Settings are real preferences, so the tests check that they persist, that
// unknown values are refused rather than stored, and that the ones the app
// cannot honour are not presented as working.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SETTINGS,
  EXPLANATION_LEVELS,
  LANGUAGES,
  SETTINGS_STORAGE_KEY,
  SETTINGS_SCHEMA_VERSION,
  applyReducedMotion,
  readSettings,
  writeSettings,
} from '../../src/utils/settingsStore.mjs';
import { MemoryStorage } from '../notebooks/memoryStorage.mjs';

test('the default settings are complete and safe', () => {
  assert.equal(DEFAULT_SETTINGS.schemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.ok(EXPLANATION_LEVELS.includes(DEFAULT_SETTINGS.explanationLevel));
  assert.ok(LANGUAGES.some((language) => language.code === DEFAULT_SETTINGS.language));
  assert.equal(DEFAULT_SETTINGS.reducedMotion, 'system');
});

test('a setting is written and read back', () => {
  const storage = new MemoryStorage();
  const result = writeSettings({ explanationLevel: 'eli5' }, storage);
  assert.equal(result.ok, true);
  assert.equal(result.settings.explanationLevel, 'eli5');
  assert.equal(readSettings(storage).explanationLevel, 'eli5');
});

test('an unknown value is refused and the previous value is kept', () => {
  const storage = new MemoryStorage();
  writeSettings({ explanationLevel: 'eli10' }, storage);

  const result = writeSettings({ explanationLevel: 'wizard' }, storage);
  assert.equal(result.ok, true);
  // The unknown value is dropped rather than stored.
  assert.equal(result.settings.explanationLevel, 'eli10');
  assert.equal(readSettings(storage).explanationLevel, 'eli10');
});

test('every explanation level the app offers can be stored', () => {
  const storage = new MemoryStorage();
  EXPLANATION_LEVELS.forEach((level) => {
    const result = writeSettings({ explanationLevel: level }, storage);
    assert.equal(result.ok, true);
    assert.equal(result.settings.explanationLevel, level);
  });
});

test('a boolean setting is stored and restored', () => {
  const storage = new MemoryStorage();
  writeSettings({ showGeneratorLabels: false, showRecommendations: false }, storage);
  const settings = readSettings(storage);
  assert.equal(settings.showGeneratorLabels, false);
  assert.equal(settings.showRecommendations, false);
});

test('an empty storage returns the defaults rather than failing', () => {
  const storage = new MemoryStorage();
  assert.deepEqual(readSettings(storage), { ...DEFAULT_SETTINGS });
});

test('a corrupted settings file is ignored rather than crashing the app', () => {
  const storage = new MemoryStorage();
  storage.setItem(SETTINGS_STORAGE_KEY, '{not json');
  assert.deepEqual(readSettings(storage), { ...DEFAULT_SETTINGS });
});

test('settings from a different schema version are ignored', () => {
  const storage = new MemoryStorage();
  storage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: SETTINGS_SCHEMA_VERSION + 1,
      explanationLevel: 'eli5',
    })
  );
  assert.deepEqual(readSettings(storage), { ...DEFAULT_SETTINGS });
});

test('only English is offered as a local language', () => {
  const local = LANGUAGES.filter((language) => language.local);
  assert.equal(local.length, 1);
  assert.equal(local[0].code, 'en');
  // The other languages are listed so a learner can see what would be
  // possible, and each one says it is not connected.
  LANGUAGES.filter((language) => !language.local).forEach((language) => {
    assert.equal(language.local, false);
  });
});

test('the motion preference is applied to the document', () => {
  const attributes = {};
  const fakeDocument = {
    documentElement: {
      setAttribute(name, value) {
        attributes[name] = value;
      },
      removeAttribute(name) {
        delete attributes[name];
      },
    },
  };

  applyReducedMotion('on', fakeDocument);
  assert.equal(attributes['data-reduced-motion'], 'on');

  applyReducedMotion('off', fakeDocument);
  assert.equal(attributes['data-reduced-motion'], 'off');

  applyReducedMotion('system', fakeDocument);
  assert.equal('data-reduced-motion' in attributes, false);
});

test('an unknown motion preference falls back to the system setting', () => {
  const attributes = {};
  const fakeDocument = {
    documentElement: {
      setAttribute(name, value) {
        attributes[name] = value;
      },
      removeAttribute(name) {
        delete attributes[name];
      },
    },
  };

  applyReducedMotion('nonsense', fakeDocument);
  assert.equal('data-reduced-motion' in attributes, false);
});
