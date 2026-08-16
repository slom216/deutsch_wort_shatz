import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderRoute } from '@/test/helpers/renderRoute';
import { THEME_STORAGE_KEY } from './ThemeToggle';

function mainNav(): HTMLElement {
  return screen.getByRole('navigation', { name: /main/i });
}

describe('application shell', () => {
  it('exposes a main navigation landmark with every top-level destination', () => {
    renderRoute('/');
    const nav = mainNav();

    for (const label of [
      'Dashboard',
      'Learn',
      'Review',
      'Practice',
      'Vocabulary',
      'Progress',
      'Settings',
    ]) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('marks the active route with aria-current rather than colour alone', () => {
    renderRoute('/settings');
    const nav = mainNav();
    expect(within(nav).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('keeps the dashboard link inactive on nested routes', () => {
    renderRoute('/learn/a1');
    const nav = mainNav();
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(within(nav).getByRole('link', { name: 'Learn' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('offers a skip link as the first tab stop', async () => {
    const user = userEvent.setup();
    renderRoute('/');

    await user.tab();
    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveFocus();
  });

  it('renders exactly one main landmark', () => {
    renderRoute('/');
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('links back to DeuLern and the sibling apps from the footer', () => {
    renderRoute('/');
    const footer = screen.getByRole('contentinfo');

    expect(within(footer).getByRole('link', { name: 'All DeuLern apps' })).toHaveAttribute(
      'href',
      'https://deulern.com',
    );
    expect(within(footer).getByRole('link', { name: 'Grammatik mit System' })).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: 'Verben Meistern' })).toBeInTheDocument();
  });

  it('pins the chosen theme on the document and remembers it', async () => {
    const user = userEvent.setup();
    localStorage.removeItem(THEME_STORAGE_KEY);
    delete document.documentElement.dataset.theme;
    renderRoute('/');

    // jsdom reports no dark preference, so the first press must land on dark.
    await user.click(screen.getByRole('button', { name: /switch to dark theme/i }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    await user.click(screen.getByRole('button', { name: /switch to light theme/i }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });
});
