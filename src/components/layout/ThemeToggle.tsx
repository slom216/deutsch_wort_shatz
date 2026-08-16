import { useState, type ReactNode } from 'react';

/**
 * Light/dark switch, shared with the rest of the DeuLern suite.
 *
 * The choice lives in localStorage under the suite-wide key and is applied as
 * `data-theme` on <html>, which pins `color-scheme` and therefore every `light-dark()`
 * token. `index.html` reads the same key before first paint so an explicit choice never
 * flashes the other theme. No stored choice means "follow the OS".
 */

export const THEME_STORAGE_KEY = 'deulernTheme';

type Theme = 'light' | 'dark';

function currentTheme(): Theme {
  const pinned = document.documentElement.dataset.theme;
  if (pinned === 'light' || pinned === 'dark') return pinned;
  // `matchMedia` is missing in jsdom and in older embedded browsers; light is the safe
  // default there, and the toggle still works.
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle(): ReactNode {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  const toggle = (): void => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked (private mode, quota): the switch still works for this session.
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {/* One stateless half-disc in both themes — nothing to keep in sync. */}
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" />
      </svg>
    </button>
  );
}
