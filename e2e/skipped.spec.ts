import { expect, test } from '@playwright/test';

/**
 * Skipping a word, end to end.
 *
 * The unit tests cover the storage and the session bookkeeping; this covers the wiring
 * between them — that the button reaches the database, that the word turns up on its own
 * screen, and that returning it empties the list again.
 */
test('a word can be set aside, found again and returned', async ({ page }) => {
  await page.goto(`/continuous/skip-${Date.now().toString(36)}`);

  const question = page.locator('.exercise__question');
  await expect(question).toBeVisible();
  const skippedWord = (await question.textContent())?.trim() ?? '';

  // Second stat in the stream bar: exercises answered. A skip must not move it.
  const answered = page.locator('.stream-bar__stats dd').nth(1);
  await expect(answered).toHaveText('0');

  await page.getByRole('button', { name: /skip this word/i }).click();

  await expect(question).not.toHaveText(skippedWord);
  await expect(answered).toHaveText('0');

  await page.getByRole('link', { name: /^skipped$/i }).click();
  await expect(page.getByRole('heading', { level: 1, name: /skipped words/i })).toBeVisible();
  await expect(page.getByText(/1 word is set aside/i)).toBeVisible();

  await page.getByRole('button', { name: /^return .+ to learning$/i }).click();
  await expect(page.getByText(/nothing is set aside/i)).toBeVisible();

  // The list lives in IndexedDB, so an emptied list stays empty across a reload.
  await page.reload();
  await expect(page.getByText(/nothing is set aside/i)).toBeVisible();
});
