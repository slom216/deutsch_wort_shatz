import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderRoute } from '@/test/helpers/renderRoute';

describe('application shell', () => {
  it('exposes a main navigation landmark with every top-level destination', () => {
    renderRoute('/');
    const nav = screen.getByRole('navigation', { name: /main/i });

    for (const label of [
      'Dashboard',
      'Learn',
      'Review',
      'Practice',
      'Vocabulary',
      'Progress',
      'Achievements',
      'Settings',
      'Data',
      'About',
    ]) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('marks the active route with aria-current rather than colour alone', () => {
    renderRoute('/settings');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the dashboard link inactive on nested routes', () => {
    renderRoute('/learn/a1');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Learn' })).toHaveAttribute('aria-current', 'page');
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
});
