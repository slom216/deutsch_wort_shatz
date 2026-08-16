import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import './AppFooter.css';

interface FooterGroup {
  readonly heading: string;
  readonly links: readonly { readonly to: string; readonly label: string }[];
}

const GROUPS: readonly FooterGroup[] = [
  {
    heading: 'Study',
    links: [
      { to: '/learn', label: 'Learn' },
      { to: '/review', label: 'Review queue' },
      { to: '/practice', label: 'Practice' },
    ],
  },
  {
    heading: 'Progress',
    links: [
      { to: '/progress', label: 'Your progress' },
      { to: '/achievements', label: 'Achievements' },
      { to: '/vocabulary', label: 'Vocabulary browser' },
    ],
  },
  {
    heading: 'App',
    links: [
      { to: '/settings', label: 'Settings' },
      { to: '/data', label: 'Your data' },
      { to: '/about', label: 'About this app' },
    ],
  },
];

/** The other apps in the suite. External, so they stay plain anchors. */
const DEULERN_LINKS: readonly { readonly href: string; readonly label: string }[] = [
  { href: 'https://deulern.com', label: 'All DeuLern apps' },
  { href: 'https://grammatik.deulern.com', label: 'Grammatik mit System' },
  { href: 'https://verben.deulern.com', label: 'Verben Meistern' },
];

/** Site footer, shared in shape and colour with the rest of the DeuLern suite. */
export function AppFooter(): ReactNode {
  return (
    <footer className="app-footer">
      <div className="app-footer__inner">
        <div className="app-footer__groups">
          {GROUPS.map((group) => (
            <div key={group.heading} className="app-footer__group">
              <h2 className="app-footer__heading">{group.heading}</h2>
              {group.links.map((link) => (
                <Link key={link.to} to={link.to}>
                  {link.label}
                </Link>
              ))}
            </div>
          ))}

          <div className="app-footer__group">
            <h2 className="app-footer__heading">DeuLern</h2>
            {DEULERN_LINKS.map((link) => (
              <a key={link.href} href={link.href} rel="noopener">
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <p className="app-footer__note">
          Deutsch Wortschatz is part of{' '}
          <a href="https://deulern.com" rel="noopener">
            DeuLern
          </a>{' '}
          — free apps for learning German grammar, vocabulary and verbs. No account, no tracking;
          everything you answer stays in this browser.
        </p>
      </div>
    </footer>
  );
}
