import { useEffect, useState } from 'react';
import { applyTheme, getStoredTheme } from '../utils/theme';

/**
 * Two-state theme control. 'system' behaves as the current OS preference until
 * the learner picks a side; the explicit choice is then stored.
 */
const ThemeToggle = ({ className = '' }) => {
  const stored = getStoredTheme();
  const systemPrefersDark =
    typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia('(prefers-color-scheme: dark)').matches
      : false;
  const [dark, setDark] = useState(
    stored ? stored === 'dark' : systemPrefersDark
  );

  // Keep multiple Navbar instances in sync without duplicating listeners on
  // the matchMedia object.
  useEffect(() => {
    const sync = () => {
      const mode = getStoredTheme();
      setDark(mode ? mode === 'dark' : systemPrefersDark);
    };
    window.addEventListener('storage', sync);
    window.addEventListener('crushlearn-theme-change', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('crushlearn-theme-change', sync);
    };
  }, [systemPrefersDark]);

  const toggle = () => {
    const next = !dark;
    applyTheme(next ? 'dark' : 'light');
    setDark(next);
    window.dispatchEvent(new Event('crushlearn-theme-change'));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-lg transition hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30 ${className}`}
    >
      <span aria-hidden="true">{dark ? '☀️' : '🌙'}</span>
    </button>
  );
};

export default ThemeToggle;
