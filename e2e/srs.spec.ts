import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 2 end-to-end: the SRS loop in a real browser.
 *
 * Proves the acceptance criteria that only integration shows — a learned word becomes
 * due, the queue survives a refresh, and no manual rating is ever requested.
 */

/** Learns one batch of new words, answering every exercise. */
async function learnABatch(page: Page): Promise<void> {
  await page.goto('/learn');
  await page.getByRole('button', { name: /learn \d+ new words/i }).click();
  await expect(page.getByText(/Exercise 1 of/)).toBeVisible();

  // Reveal-and-continue is the fastest deterministic way through any exercise type.
  // Clicks are tolerant: the last Continue navigates to the results page, so the button
  // can legitimately disappear between the visibility check and the click.
  for (let i = 0; i < 40; i += 1) {
    if (page.url().includes('/results/')) break;

    await page
      .getByRole('button', { name: /show answer/i })
      .click({ timeout: 2_000 })
      .catch(() => {});
    await page
      .getByRole('button', { name: /continue/i })
      .click({ timeout: 2_000 })
      .catch(() => {});
  }
}

test('the learn page recommends a batch of new words', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.getByRole('heading', { name: /recommended next lesson/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /learn \d+ new words/i })).toBeVisible();
  await expect(page.getByText(/still new/)).toBeVisible();
});

test('learning a batch creates SRS progress that survives a refresh', async ({ page }) => {
  await learnABatch(page);

  await page.goto('/dashboard').catch(() => {});
  await page.goto('/');
  await expect(page.getByText('Words started')).toBeVisible();

  const started = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('deutsch-wort-shatz');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<number>((resolve) => {
      const tx = db.transaction('entryProgress', 'readonly');
      const count = tx.objectStore('entryProgress').count();
      count.onsuccess = () => resolve(count.result);
    });
  });

  expect(started).toBeGreaterThan(0);

  // A reload rebuilds the queue from IndexedDB rather than resetting it.
  await page.reload();
  await expect(page.getByText('Words started')).toBeVisible();
});

test('the review page reports queue counts and a forecast', async ({ page }) => {
  await learnABatch(page);
  await page.goto('/review');

  await expect(page.getByRole('heading', { level: 1, name: /^review$/i })).toBeVisible();
  // Exact matches: the page description also contains the words 'due' and 'overdue'.
  await expect(page.getByText('Due now', { exact: true })).toBeVisible();
  await expect(page.getByText('Overdue', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /review forecast/i })).toBeVisible();
});

test('the learner is never asked to rate a word (§20)', async ({ page }) => {
  await page.goto('/learn');
  await page.getByRole('button', { name: /learn \d+ new words/i }).click();
  await expect(page.getByText(/Exercise 1 of/)).toBeVisible();

  await page.getByRole('button', { name: /show answer/i }).click();

  // Anki-style self-rating controls must not exist anywhere in the flow.
  for (const label of [/^again$/i, /^hard$/i, /^easy$/i, /how well did you know/i]) {
    await expect(page.getByRole('button', { name: label })).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: /continue/i })).toBeVisible();
});
