import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';

import { continuousSessionPath } from '@/features/practice/session/endless';
import { ThemeToggle } from './ThemeToggle';
import './AppHeader.css';

interface NavItem {
  readonly to: string;
  readonly label: string;
  /** `end` restricts matching to the exact path, needed for the dashboard at "/". */
  readonly end?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/learn', label: 'Learn' },
  { to: '/review', label: 'Review' },
  { to: '/practice', label: 'Practice' },
  { to: '/vocabulary', label: 'Vocabulary' },
  { to: '/skipped', label: 'Skipped' },
  { to: '/progress', label: 'Progress' },
  { to: '/settings', label: 'Settings' },
];

/**
 * Sticky top bar, matching the other DeuLern apps: wordmark, horizontal nav, theme
 * switch and one lime call to action.
 *
 * Semantic `<nav>` plus `aria-current="page"` marks the active route rather than relying
 * on the underline alone (§30).
 */
export function AppHeader(): ReactNode {
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link className="app-brand" to="/">
          Deu<span className="app-brand__accent">Lern</span> Wortschatz
          <span className="app-brand__subtitle">German vocabulary, A1–B1</span>
        </Link>

        <nav className="app-nav" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} className="app-nav__link" to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <ThemeToggle />

        <button
          type="button"
          className="app-header__action"
          onClick={() => void navigate(continuousSessionPath())}
        >
          {/* Not "Continue": the exercise runner already owns that label, and two buttons
              with one name is ambiguous to a screen reader. */}
          Keep learning
        </button>
      </div>
    </header>
  );
}
