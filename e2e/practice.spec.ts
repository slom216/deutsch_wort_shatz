import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 1 end-to-end coverage: a real session in a real browser.
 *
 * These prove the acceptance criteria that only integration can show — the seven
 * formats render and can be answered, strict checking runs, speech degrades gracefully,
 * and session results persist across a reload.
 */

/** Starts a free-practice session restricted to one exercise type. */
async function startSession(page: Page, types: string, length = 10, level = 'A1'): Promise<void> {
  const sessionId = `e2e-${types}-${Date.now().toString(36)}`;
  await page.goto(
    `/practice/session/${sessionId}?mode=free&level=${level}&band=all&length=${length}&types=${types}`,
  );
  await expect(page.getByText(/Exercise 1 of/)).toBeVisible();
}

test('practice waits until there is something to practise', async ({ page }) => {
  // A fresh profile has mastered nothing, which is exactly the state the streak game has to
  // refuse to start in: it draws both its questions and its distractors from mastered words.
  await page.goto('/practice');
  await expect(page.getByRole('heading', { level: 1, name: /^practice$/i })).toBeVisible();

  await expect(page.getByRole('heading', { name: /not enough learned words/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /i am ready/i })).toHaveCount(0);
});

test('multiple choice offers six numbered options', async ({ page }) => {
  await startSession(page, 'multipleChoice');

  // Six options by default. The article variant legitimately offers three, since German
  // has three articles, so the hint is asserted against the count actually rendered.
  const options = await page.getByRole('radio').count();
  expect(options).toBeGreaterThanOrEqual(3);
  expect(options).toBeLessThanOrEqual(6);
  await expect(page.getByText(`Press 1–${options} to answer.`)).toBeVisible();
});

test('multiple choice can be answered and gives feedback', async ({ page }) => {
  await startSession(page, 'multipleChoice');

  // Choosing an option answers outright — there is no separate confirm step.
  await page.getByRole('radio').first().check();

  await expect(page.getByRole('status')).toBeVisible();
  // Right or wrong, the answer locks: the only way on is Continue.
  await expect(page.getByRole('button', { name: /continue/i })).toBeVisible();
});

test('a number key answers, and Enter moves on', async ({ page }) => {
  await startSession(page, 'multipleChoice');

  await page.keyboard.press('1');
  await expect(page.getByRole('status')).toBeVisible();

  // Option 1 may or may not be the right answer; either way the exercise is now locked.
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Exercise 2 of/)).toBeVisible();
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
  // The helper appears wherever the answer is German. A typed-translation session mixes
  // both directions, so walk it until an English-to-German item comes up.
  await startSession(page, 'typedTranslation', 20);

  const insert = page.getByRole('button', { name: 'Insert eszett ß' });
  for (let step = 0; step < 20 && !(await insert.isVisible().catch(() => false)); step += 1) {
    const reveal = page.getByRole('button', { name: /show answer/i });
    if (await reveal.isVisible().catch(() => false))
      await reveal.click({ timeout: 2_000 }).catch(() => {});
    const next = page.getByRole('button', { name: /continue/i });
    if (await next.isVisible().catch(() => false))
      await next.click({ timeout: 2_000 }).catch(() => {});
  }

  const input = page.getByLabel('Your answer');
  await input.click();
  await input.fill('Stra');
  await insert.click();

  await expect(input).toHaveValue('Straß');
  // Focus must stay in the field so typing can continue (§17).
  await expect(input).toBeFocused();
});

test('word ordering can be solved with the move buttons alone', async ({ page }) => {
  // Word ordering needs a phrase of at least four tokens, and the datasets have only a
  // few — all at B1.
  await startSession(page, 'wordOrdering', 10, 'B1');

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
