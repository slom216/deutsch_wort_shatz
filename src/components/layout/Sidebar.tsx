import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import './Sidebar.css';

interface NavItem {
  readonly to: string;
  readonly label: string;
  /** `end` restricts matching to the exact path, needed for the dashboard at "/". */
  readonly end?: boolean;
}

interface NavSection {
  readonly heading: string;
  readonly items: readonly NavItem[];
}

const NAV_SECTIONS: readonly NavSection[] = [
  {
    heading: 'Study',
    items: [
      { to: '/', label: 'Dashboard', end: true },
      { to: '/learn', label: 'Learn' },
      { to: '/review', label: 'Review' },
      { to: '/practice', label: 'Practice' },
    ],
  },
  {
    heading: 'Explore',
    items: [
      { to: '/vocabulary', label: 'Vocabulary' },
      { to: '/progress', label: 'Progress' },
      { to: '/achievements', label: 'Achievements' },
    ],
  },
  {
    heading: 'Manage',
    items: [
      { to: '/settings', label: 'Settings' },
      { to: '/data', label: 'Data' },
      { to: '/about', label: 'About' },
    ],
  },
];

/**
 * Persistent desktop sidebar (Phase 0 deliverable 14).
 *
 * Semantic `<nav>` + lists so screen readers announce structure and item counts;
 * `aria-current="page"` marks the active route rather than relying on colour (§30).
 */
export function Sidebar(): ReactNode {
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="sidebar__brand">
        <span className="sidebar__brand-name">Deutsch Wort Shatz</span>
        <span className="sidebar__brand-tagline">German vocabulary · A1–B1</span>
      </div>

      {NAV_SECTIONS.map((section) => (
        <div key={section.heading} className="sidebar__section">
          <h2 className="sidebar__heading" id={`nav-${section.heading.toLowerCase()}`}>
            {section.heading}
          </h2>
          <ul className="sidebar__list" aria-labelledby={`nav-${section.heading.toLowerCase()}`}>
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link'
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <p className="sidebar__footer">
        Runs entirely in your browser.
        <br />
        No account, no server.
      </p>
    </nav>
  );
}
