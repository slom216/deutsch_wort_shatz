import { expect, test } from '@playwright/test';

/**
 * Phase 18 accessibility, keyboard-navigation and performance audits (§30, §29).
 *
 * These assert the structural guarantees the specification names: one main landmark and
 * one h1 per screen, a logical heading order, visible focus, labelled controls, keyboard
 * operability, and no reliance on colour alone.
 */

const SCREENS = [
  '/',
  '/learn',
  '/learn/a1',
  '/learn/a1/a1-core-1',
  '/topic/food-and-drink',
  '/review',
  '/practice',
  '/vocabulary',
  '/word/a1-0662-sein',
  '/progress',
  '/achievements',
  '/settings',
  '/data',
  '/about',
];

test.describe('structure', () => {
  for (const path of SCREENS) {
    test(`${path} has one main landmark and one h1`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('navigation', { name: /main/i })).toHaveCount(1);
    });
  }
});

test('heading order never skips a level', async ({ page }) => {
  for (const path of ['/', '/progress', '/achievements', '/data']) {
    await page.goto(path);
    const levels = await page
      .locator('h1, h2, h3, h4')
      .evaluateAll((nodes) => nodes.map((node) => Number(node.tagName.slice(1))));
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
    }
  }
});

test('every form control on Settings has an accessible name', async ({ page }) => {
  await page.goto('/settings');
  // Wait for the lazy route chunk to render before counting; `goto` resolves on load,
  // which happens before React has mounted the page.
  await expect(page.getByLabel('Daily goal')).toBeVisible();

  const controls = page.locator('select, input:not([type=hidden])');
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    const name = await controls.nth(i).evaluate((node) => {
      const el = node as HTMLInputElement;
      if (el.labels && el.labels.length > 0) return el.labels[0]?.textContent ?? '';
      return el.getAttribute('aria-label') ?? '';
    });
    expect(name.trim().length).toBeGreaterThan(0);
  }
});

test('the vocabulary filters are all labelled', async ({ page }) => {
  await page.goto('/vocabulary');
  for (const label of [
    'Search',
    'Level',
    'Frequency band',
    'Topic',
    'Word class',
    'Learning status',
    'Difficulty',
  ]) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
});

test('focus is visible when tabbing', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');

  const outline = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return null;
    const style = getComputedStyle(active);
    return { outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle };
  });

  expect(outline).not.toBeNull();
  expect(outline?.outlineStyle).not.toBe('none');
});

test('the whole app is reachable by keyboard from the sidebar', async ({ page }) => {
  await page.goto('/');
  // Tab past the skip link into the navigation, then walk with the keyboard.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /skip to main content/i })).toBeFocused();

  for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('correctness is never conveyed by colour alone', async ({ page }) => {
  await page.goto(
    '/practice/session/a11y-run?mode=free&level=A1&band=a1-core-1&length=3&types=multipleChoice',
  );
  await expect(page.getByText(/Exercise 1 of/)).toBeVisible();

  await page.getByRole('radio').first().check();

  // The feedback panel states the outcome in words, in a live region.
  const status = page.getByRole('status').first();
  await expect(status).toHaveAttribute('aria-live', 'polite');
  await expect(status).toHaveText(/correct|not correct/i);
});

test('achievement lock state is stated in words', async ({ page }) => {
  await page.goto('/achievements');
  await expect(page.getByText('Locked').first()).toBeVisible();
});

test('the vocabulary list virtualizes the whole vocabulary without mounting them all', async ({ page }) => {
  await page.goto('/vocabulary');
  await expect(page.getByText(/3,460 matches of/)).toBeVisible();

  // Virtualization means the DOM holds a window, not the whole result set (§16).
  const rows = await page.locator('.entry-row').count();
  expect(rows).toBeGreaterThan(0);
  expect(rows).toBeLessThan(200);
});

test('a typical search responds quickly', async ({ page }) => {
  await page.goto('/vocabulary');
  await expect(page.getByText(/3,460 matches of/)).toBeVisible();

  const started = Date.now();
  await page.getByLabel('Search', { exact: true }).fill('haus');
  await expect(page.getByText(/matches of 3,460/)).toBeVisible();
  expect(Date.now() - started).toBeLessThan(3_000);
});

test('reduced motion is respected', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const duration = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--duration-normal').trim(),
  );
  expect(duration).toBe('0ms');
});
