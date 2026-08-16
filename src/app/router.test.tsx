import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { renderRoute } from '@/test/helpers/renderRoute';

/**
 * Phase 0 acceptance criterion: "all routes render".
 *
 * Each route from §5 is mounted through the real route table and asserted to produce a
 * heading, which also proves the lazy chunks resolve.
 */

const ROUTES: ReadonlyArray<{ path: string; heading: RegExp }> = [
  { path: '/', heading: /dashboard/i },
  { path: '/learn', heading: /^learn$/i },
  { path: '/learn/a1', heading: /a1 vocabulary/i },
  { path: '/learn/a1/a1-core-1', heading: /a1 core 1/i },
  { path: '/topic/food-and-drink', heading: /food and drink/i },
  { path: '/review', heading: /^review$/i },
  { path: '/practice', heading: /^practice$/i },
  // A deliberately small session: the full default session mounts a dnd-kit drag
  // context whose animation-frame loop starves later tests under jsdom. The heavy path
  // is covered end-to-end in a real browser instead.
  {
    path: '/practice/session/route-test-session?level=A1&band=a1-core-1&length=3&types=multipleChoice',
    heading: /practice session/i,
  },
  // A different id on purpose: starting a session persists a record, so reusing that id
  // here would find real results instead of exercising the not-found path.
  { path: '/results/no-such-session', heading: /results not found/i },
  { path: '/vocabulary', heading: /^vocabulary$/i },
  { path: '/word/a1-0662-sein', heading: /sein/i },
  { path: '/progress', heading: /^progress$/i },
  { path: '/achievements', heading: /^achievements$/i },
  { path: '/settings', heading: /^settings$/i },
  { path: '/data', heading: /^data$/i },
  { path: '/about', heading: /about deutsch wortschatz/i },
];

describe('application routes', () => {
  // Generous timeout: these routes lazily import their chunk, and the vocabulary screens
  // additionally parse the 2.8 MB search index, which is slow under jsdom.
  const FIND_TIMEOUT = { timeout: 15_000 };

  it.each(ROUTES)(
    'renders $path',
    async ({ path, heading }) => {
      renderRoute(path);
      expect(
        await screen.findByRole('heading', { level: 1, name: heading }, FIND_TIMEOUT),
      ).toBeInTheDocument();
    },
    30_000,
  );

  it('renders a not-found page for an unknown path', async () => {
    renderRoute('/no-such-page');
    expect(
      await screen.findByRole('heading', { level: 1, name: /page not found/i }),
    ).toBeInTheDocument();
  });

  it('rejects an invalid CEFR level', async () => {
    renderRoute('/learn/c2');
    expect(
      await screen.findByRole('heading', { level: 1, name: /level not found/i }),
    ).toBeInTheDocument();
  });

  it('rejects a band that does not belong to the requested level', async () => {
    renderRoute('/learn/a1/b1-high-1');
    expect(
      await screen.findByRole('heading', { level: 1, name: /frequency band not found/i }),
    ).toBeInTheDocument();
  });
});
