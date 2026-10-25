/**
 * Theme controller for CrushLearn AI.
 *
 * Persists the learner's choice in localStorage and mirrors it as the `dark`
 * class on <html> so every Tailwind token flips together. `system` follows the
 * OS preference and stays live while the app is running.
 *
 * All functions accept injected dependencies so they are safe to unit-test and
 * harmless in non-browser environments (SSR, tests).
 */

export const THEME_STORAGE_KEY = 'crushlearn_theme';
export const THEME_MODES = ['light', 'dark', 'system'];

const prefersDarkQuery = () =>
  typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia('(prefers-color-scheme: dark)')
    : null;

export function getStoredTheme(storage = safeStorage()) {
  if (!storage) return null;
  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);
    return THEME_MODES.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function resolveTheme(storedMode = getStoredTheme(), prefersDark) {
  const mode = THEME_MODES.includes(storedMode) ? storedMode : 'system';
  const dark =
    prefersDark !== undefined ? Boolean(prefersDark) : prefersDarkQuery()?.matches ?? false;
  return { mode, dark: mode === 'system' ? dark : mode === 'dark' };
}

/** Applies the resolved theme to a document and persists the chosen mode. */
export function applyTheme(mode, { document = safeDocument(), storage = safeStorage() } = {}) {
  const nextMode = THEME_MODES.includes(mode) ? mode : 'system';
  const { dark } = resolveTheme(nextMode);
  const root = document?.documentElement;
  if (root) {
    root.classList.toggle('dark', dark);
    root.dataset.theme = dark ? 'dark' : 'light';
  }
  if (storage) {
    try {
      storage.setItem(THEME_STORAGE_KEY, nextMode);
    } catch {
      // Persistence is best-effort; the session keeps the applied theme.
    }
  }
  return { mode: nextMode, dark };
}

/** Applies the stored (or OS-default) theme once at boot. */
export function initTheme({ document = safeDocument(), storage = safeStorage() } = {}) {
  const stored = getStoredTheme(storage);
  const applied = applyTheme(stored || 'system', { document, storage: null });
  const media = prefersDarkQuery();
  const handleChange = () => {
    const stillSystem = getStoredTheme(storage) !== 'light' && getStoredTheme(storage) !== 'dark';
    if (document && stillSystem) applyTheme('system', { document });
  };
  media?.addEventListener?.('change', handleChange);
  return { ...applied, media };
}

function safeStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function safeDocument() {
  return typeof globalThis.document !== 'undefined' ? globalThis.document : null;
}
