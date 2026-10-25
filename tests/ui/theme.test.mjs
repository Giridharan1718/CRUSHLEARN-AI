import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  THEME_MODES,
  applyTheme,
  getStoredTheme,
  resolveTheme,
} from '../../src/utils/theme.js';

function createFakeDocument() {
  const classes = new Set();
  const root = {
    classList: {
      toggle(name, force) {
        if (force === undefined) {
          if (classes.has(name)) {
            classes.delete(name);
            return false;
          }
          classes.add(name);
          return true;
        }
        if (force) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
        return force;
      },
    },
    dataset: {},
  };
  return { documentElement: root, hasDark: () => classes.has('dark') };
}

function createFakeStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
  };
}

test('resolveTheme defaults to the OS preference for unknown or system modes', () => {
  assert.deepEqual(resolveTheme(null, true), { mode: 'system', dark: true });
  assert.deepEqual(resolveTheme('system', false), { mode: 'system', dark: false });
  assert.deepEqual(resolveTheme('unknown-mode', true), { mode: 'system', dark: true });
});

test('resolveTheme honours an explicit stored choice over the OS preference', () => {
  assert.deepEqual(resolveTheme('light', true), { mode: 'light', dark: false });
  assert.deepEqual(resolveTheme('dark', false), { mode: 'dark', dark: true });
});

test('applyTheme toggles the dark class and persists the chosen mode', () => {
  const fake = createFakeDocument();
  const storage = createFakeStorage();

  const light = applyTheme('light', { document: fake, storage });
  assert.equal(light.dark, false);
  assert.equal(fake.hasDark(), false);
  assert.equal(getStoredTheme(storage), 'light');
  assert.equal(fake.documentElement.dataset.theme, 'light');

  const dark = applyTheme('dark', { document: fake, storage });
  assert.equal(dark.dark, true);
  assert.equal(fake.hasDark(), true);
  assert.equal(getStoredTheme(storage), 'dark');
  assert.equal(fake.documentElement.dataset.theme, 'dark');
});

test('applyTheme falls back to system and ignores invalid values', () => {
  const fake = createFakeDocument();
  const storage = createFakeStorage();

  const applied = applyTheme('banana', { document: fake, storage });
  assert.equal(applied.mode, 'system');
  assert.equal(applied.dark, false);
  assert.equal(getStoredTheme(storage), 'system');

  // A missing document must not throw (SSR and tests never have a DOM).
  assert.doesNotThrow(() => {
    applyTheme('dark', { document: null, storage });
  });
});

test('stored values outside the known modes are treated as unset', () => {
  const storage = createFakeStorage();
  storage.setItem('crushlearn_theme', 'turquoise');
  assert.equal(getStoredTheme(storage), null);
  assert.deepEqual(resolveTheme(null, false).dark, false, 'no OS preference reported');
  assert.ok(THEME_MODES.includes('light'));
  assert.ok(THEME_MODES.includes('dark'));
  assert.ok(THEME_MODES.includes('system'));
});

function readThemeTokens() {
  const css = readFileSync(
    new URL('../../src/index.css', import.meta.url),
    'utf8'
  );
  const parse = (selector) => {
    const start = css.indexOf(selector);
    assert.ok(start >= 0, `missing ${selector}`);
    const block = css.slice(start, css.indexOf('}', start));
    const tokens = {};
    for (const match of block.matchAll(
      /--([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g
    )) {
      tokens[match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])];
    }
    return tokens;
  };
  return { light: parse(':root {'), dark: parse('.dark {') };
}

function relativeLuminance(rgb) {
  const channels = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  );
}

function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('every text and control token pair meets WCAG AA contrast in both themes', () => {
  const { light, dark } = readThemeTokens();
  const pairs = [
    ['ink', 'surface'],
    ['ink', 'surface-muted'],
    ['ink-muted', 'surface'],
    ['ink-muted', 'surface-muted'],
    ['ink-subtle', 'surface'],
    ['ink-subtle', 'surface-muted'],
    ['ink-subtle', 'line-subtle'],
    ['accent', 'surface'],
    ['accent', 'accent-soft'],
    ['info', 'info-soft'],
    ['success', 'success-soft'],
    ['warning', 'warning-soft'],
    ['danger', 'danger-soft'],
    ['ink-inverse', 'accent'],
    ['ink-inverse', 'primary-600'],
    ['ink-inverse', 'primary-800'],
    ['primary-700', 'primary-50'],
  ];

  for (const [theme, tokens] of [
    ['light', light],
    ['dark', dark],
  ]) {
    for (const [foreground, background] of pairs) {
      assert.ok(
        tokens[foreground] && tokens[background],
        `${theme}: missing ${foreground} or ${background}`
      );
      const ratio = contrastRatio(tokens[foreground], tokens[background]);
      assert.ok(
        ratio >= 4.5,
        `${theme}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1`
      );
    }
  }
});
