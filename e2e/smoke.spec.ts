import { expect, test } from '@playwright/test';

/**
 * Phase 0 end-to-end smoke tests.
 *
 * These run against the production build and cover the acceptance criteria that only a
 * real browser can prove: every route renders, IndexedDB initialises, settings survive a
 * reload, and the app is navigable by keyboard alone.
 */

const ROUTES: ReadonlyArray<{ path: string; heading: RegExp }> = [
  { path: '/', heading: /dashboard/i },
  { path: '/learn', heading: /^learn$/i },
  { path: '/learn/a1', heading: /a1 vocabulary/i },
  { path: '/learn/a1/a1-core-1', heading: /a1 core 1/i },
  { path: '/topic/food-and-drink', heading: /food and drink/i },
  { path: '/review', heading: /^review$/i },
  { path: '/practice', heading: /^practice$/i },
  { path: '/practice/session/demo', heading: /practice session/i },
  // No session with this id exists, so the results screen correctly reports that.
  { path: '/results/demo', heading: /results not found/i },
  { path: '/vocabulary', heading: /^vocabulary$/i },
  { path: '/word/a1-0662-sein', heading: /sein/i },
  { path: '/progress', heading: /^progress$/i },
  { path: '/achievements', heading: /^achievements$/i },
  { path: '/settings', heading: /^settings$/i },
  { path: '/data', heading: /^data$/i },
  { path: '/about', heading: /about deutsch wort shatz/i },
];

test.describe('routes', () => {
  for (const { path, heading } of ROUTES) {
    test(`renders ${path}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});

test('dashboard reports the vocabulary size and the review queue', async ({ page }) => {
  await page.goto('/');
  // The dashboard now leads with SRS figures; the dataset size appears as the
  // denominator of "Words started".
  await expect(page.getByText('Words started', { exact: true })).toBeVisible();
  await expect(page.getByText('of 3,460', { exact: true })).toBeVisible();
  await expect(page.getByText('Reviews due', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /continue learning/i })).toBeVisible();
});

test('vocabulary search finds an entry by its German headword', async ({ page }) => {
  await page.goto('/vocabulary');
  await page.getByLabel('Search', { exact: true }).fill('Tisch');

  await expect(page.getByRole('link', { name: 'Tisch' }).first()).toBeVisible();
});

test('an entry page shows only grammar the dataset actually records', async ({ page }) => {
  await page.goto('/vocabulary');
  await page.getByLabel('Search', { exact: true }).fill('Tisch');
  await page.getByRole('link', { name: 'Tisch' }).first().click();

  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Tisch/i);
  // No article or plural is recorded, so the noun-forms panel stays away rather than
  // printing placeholders — and nothing on the page claims a form that was never checked.
  await expect(page.getByRole('heading', { name: 'Noun forms' })).toHaveCount(0);
  await expect(page.getByText(/pending editorial review/i)).toHaveCount(0);
});

test('settings persist across a reload', async ({ page }) => {
  await page.goto('/settings');

  const dailyGoal = page.getByLabel('Daily goal');
  await expect(dailyGoal).toBeEnabled();
  await dailyGoal.selectOption('30');

  await page.reload();
  await expect(page.getByLabel('Daily goal')).toHaveValue('30');

  // The dashboard reads the same persisted value.
  await page.goto('/');
  await expect(page.getByText('30 exercises')).toBeVisible();
});

test('IndexedDB is created with the expected object stores', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByLabel('Daily goal')).toBeEnabled();

  const stores = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('deutsch-wort-shatz');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return Array.from(database.objectStoreNames);
  });

  expect(stores).toEqual(
    expect.arrayContaining([
      'entryProgress',
      'exerciseHistory',
      'sessions',
      'achievements',
      'settings',
      'metadata',
    ]),
  );
});

test('the app is navigable by keyboard alone', async ({ page }) => {
  await page.goto('/');

  // First tab stop is the skip link (§30).
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /skip to main content/i })).toBeFocused();

  // Tab into the navigation and follow a link with the keyboard.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { level: 1, name: /^learn$/i })).toBeVisible();
});

test('an unknown path shows the not-found page', async ({ page }) => {
  await page.goto('/definitely-not-a-route');
  await expect(page.getByRole('heading', { level: 1, name: /page not found/i })).toBeVisible();
});
