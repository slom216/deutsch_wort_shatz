import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 1 end-to-end coverage: a real session in a real browser.
 *
 * These prove the acceptance criteria that only integration can show — the seven
 * formats render and can be answered, strict checking runs, speech degrades gracefully,
 * and session results persist across a reload.
 */

/** Starts a free-practice session restricted to one exercise type. */
async function startSession(page: Page, types: string, length = 10): Promise<void> {
  const sessionId = `e2e-${types}-${Date.now().toString(36)}`;
  await page.goto(
    `/practice/session/${sessionId}?mode=free&level=A1&band=all&length=${length}&types=${types}`,
  );
  await expect(page.getByText(/Exercise 1 of/)).toBeVisible();
}

test('practice setup starts a session', async ({ page }) => {
  await page.goto('/practice');
  await expect(page.getByRole('heading', { level: 1, name: /^practice$/i })).toBeVisible();

  await page.getByRole('button', { name: /start practice/i }).click();

  await expect(page).toHaveURL(/\/practice\/session\//);
  await expect(page.getByText(/Exercise 1 of/)).toBeVisible();
});

test('multiple choice can be answered and gives feedback', async ({ page }) => {
  await startSession(page, 'multipleChoice');

  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: /check answer/i }).click();

  await expect(page.getByRole('status')).toBeVisible();
  await expect(
    page
      .getByRole('button', { name: /continue/i })
      .or(page.getByRole('button', { name: /try again/i })),
  ).toBeVisible();
});

test('typed translation enforces strict German spelling', async ({ page }) => {
  await startSession(page, 'typedTranslation');

  const input = page.getByLabel('Your answer');
  await input.fill('definitely not the answer');
  await page.getByRole('button', { name: /check answer/i }).click();

  const status = page.getByRole('status');
  await expect(status).toContainText(/not correct/i);
  await expect(status).toContainText(/correct answer/i);
});

test('the German character helper inserts into the answer field', async ({ page }) => {
  // Sentence completion always asks for German, so the helper is always present. A
  // typed-translation session can open on a German-to-English item, where the helper is
  // correctly absent because the answer is English.
  await startSession(page, 'sentenceCompletion');

  const input = page.getByLabel('Missing word in the sentence');
  await input.click();
  await input.fill('Stra');
  await page.getByRole('button', { name: 'Insert eszett ß' }).click();

  await expect(input).toHaveValue('Straß');
  // Focus must stay in the field so typing can continue (§17).
  await expect(input).toBeFocused();
});

test('word ordering can be solved with the move buttons alone', async ({ page }) => {
  await startSession(page, 'wordOrdering');

  const moveRight = page.getByRole('button', { name: /move .* right/i }).first();
  await moveRight.click();

  await page.getByRole('button', { name: /check answer/i }).click();
  await expect(page.getByRole('status').first()).toBeVisible();
});

test('matching is solvable by clicking, with no dragging', async ({ page }) => {
  await startSession(page, 'matching', 5);

  // The session may open on any exercise; find the matching one.
  const german = page.locator('.matching__column').first().getByRole('button');
  const english = page.locator('.matching__column').last().getByRole('button');

  const count = await german.count();
  for (let i = 0; i < count; i += 1) {
    await german.nth(i).click();
    await english.nth(i).click();
  }

  await expect(page.getByRole('button', { name: /check answers/i })).toBeEnabled();
});

test('listening falls back to text when speech synthesis is unavailable', async ({ page }) => {
  // Remove speech synthesis before any app code runs.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { get: () => undefined });
  });

  await startSession(page, 'listening');

  await expect(page.getByRole('note')).toContainText(/does not support speech synthesis/i);
  await expect(page.getByRole('button', { name: /play audio/i })).toBeDisabled();
});

test('speaking offers self-assessment and never blocks progress', async ({ page }) => {
  await startSession(page, 'speaking');

  await expect(page.getByText(/does not record or store your voice/i)).toBeVisible();

  await page.getByRole('button', { name: /i said it correctly/i }).click();
  await page.getByRole('button', { name: /continue/i }).click();

  await expect(page.getByText(/Exercise 2 of/)).toBeVisible();
});

test('a completed session persists its results across a reload', async ({ page }) => {
  const sessionId = `e2e-persist-${Date.now().toString(36)}`;
  await page.goto(
    `/practice/session/${sessionId}?mode=free&level=A1&band=all&length=3&types=multipleChoice`,
  );

  // Answer all three exercises.
  for (let i = 0; i < 3; i += 1) {
    await expect(page.getByText(new RegExp(`Exercise ${i + 1} of 3`))).toBeVisible();
    await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: /check answer/i }).click();
    const retry = page.getByRole('button', { name: /try again/i });
    if (await retry.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /show answer/i }).click();
    }
    await page.getByRole('button', { name: /continue/i }).click();
  }

  await expect(page).toHaveURL(new RegExp(`/results/${sessionId}`));
  await expect(page.getByRole('heading', { level: 1, name: /session results/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /every answer/i })).toBeVisible();

  // Reload: the results come back from IndexedDB, not from memory.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /session results/i })).toBeVisible();
  await expect(page.getByText('Accuracy')).toBeVisible();
});

test('an unknown session id shows a friendly results page', async ({ page }) => {
  await page.goto('/results/does-not-exist');
  await expect(page.getByRole('heading', { level: 1, name: /results not found/i })).toBeVisible();
});
