// Learner settings.
//
// Everything in this file is a real, persisted preference. Nothing here is
// decorative: the values are read by the components that act on them.
//
// A setting that the app cannot honour is not offered as a working option.
// Language is the clearest case: only English is implemented locally, so the
// other languages are listed as unavailable rather than presented as choices
// that would do something.

export const SETTINGS_STORAGE_KEY = 'crushlearn_settings';
export const SETTINGS_SCHEMA_VERSION = 1;

export const EXPLANATION_LEVELS = Object.freeze([
  'eli5',
  'eli10',
  'beginner',
  'intermediate',
  'advanced',
  'expert',
]);

export const EXPLANATION_LEVEL_LABELS = Object.freeze({
  eli5: 'ELI5',
  eli10: 'ELI10',
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
});

/**
 * The languages the app can actually produce an explanation in.
 *
 * Only English is implemented locally. A model-backed translation adapter is
 * not connected, so the other languages are marked `local: false` and the UI
 * says so rather than offering a switch that would silently do nothing.
 */
export const LANGUAGES = Object.freeze([
  { code: 'en', label: 'English', local: true },
  { code: 'es', label: 'Spanish', local: false },
  { code: 'fr', label: 'French', local: false },
  { code: 'hi', label: 'Hindi', local: false },
  { code: 'te', label: 'Telugu', local: false },
  { code: 'ar', label: 'Arabic', local: false },
]);

export const REDUCED_MOTION_OPTIONS = Object.freeze(['system', 'on', 'off']);

export const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  explanationLevel: 'intermediate',
  language: 'en',
  reducedMotion: 'system',
  showGeneratorLabels: true,
  showCitationDetail: true,
  showRecommendations: true,
  studyDeskAutoGenerate: false,
});

function safeStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * Validates a settings record.
 *
 * `fallback` supplies the value for a field the record does not contain or
 * contains something the app does not support. When a field is invalid the
 * previous value is kept rather than the default, so one bad value never
 * silently resets an unrelated preference.
 */
function normalizeSettings(record, fallback = DEFAULT_SETTINGS) {
  const base = { ...fallback };
  if (!record || typeof record !== 'object') return base;

  if (EXPLANATION_LEVELS.includes(record.explanationLevel)) {
    base.explanationLevel = record.explanationLevel;
  }
  if (LANGUAGES.some((language) => language.code === record.language)) {
    base.language = record.language;
  }
  if (REDUCED_MOTION_OPTIONS.includes(record.reducedMotion)) {
    base.reducedMotion = record.reducedMotion;
  }
  if (typeof record.showGeneratorLabels === 'boolean') {
    base.showGeneratorLabels = record.showGeneratorLabels;
  }
  if (typeof record.showCitationDetail === 'boolean') {
    base.showCitationDetail = record.showCitationDetail;
  }
  if (typeof record.showRecommendations === 'boolean') {
    base.showRecommendations = record.showRecommendations;
  }
  if (typeof record.studyDeskAutoGenerate === 'boolean') {
    base.studyDeskAutoGenerate = record.studyDeskAutoGenerate;
  }

  return base;
}

export function readSettings(storage = safeStorage()) {
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
      return { ...DEFAULT_SETTINGS };
    }
    return normalizeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(patch = {}, storage = safeStorage()) {
  if (!storage) return { ok: false, errors: ['Browser storage is unavailable.'] };
  const current = readSettings(storage);
  // A field the patch supplies but the app does not support is dropped; the
  // current value for that field survives.
  const next = normalizeSettings({ ...current, ...patch }, current);
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    return { ok: true, settings: next };
  } catch {
    return {
      ok: false,
      errors: ['The setting could not be saved. Browser storage may be full.'],
    };
  }
}

/**
 * Applies the reduced-motion preference to the document.
 *
 * `system` follows the operating system. `on` and `off` force the behaviour,
 * which matters for a learner who wants the app to stay still regardless of
 * the machine they are on.
 */
export function applyReducedMotion(preference, document = safeDocument()) {
  if (!document?.documentElement) return preference;
  const mode = REDUCED_MOTION_OPTIONS.includes(preference) ? preference : 'system';
  const root = document.documentElement;

  if (mode === 'system') {
    root.removeAttribute('data-reduced-motion');
  } else {
    root.setAttribute('data-reduced-motion', mode);
  }

  return mode;
}

function safeDocument() {
  try {
    return globalThis.document || null;
  } catch {
    return null;
  }
}
