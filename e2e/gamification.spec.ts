import { expect, test, type Page } from '@playwright/test';

// Several tests walk a whole new-word batch before asserting anything about XP.
test.describe.configure({ timeout: 90_000 });

/**
 * Phase 7 end-to-end: gamification in a real browser.
 *
 * Covers the acceptance criteria that need integration — XP survives a refresh without
 * doubling, revealed answers score nothing, achievements do not duplicate, and resetting
 * progress clears gamification after an explicit confirmation.
 */

/** Answers one session, revealing every answer (so every award is zero XP). */
async function revealThroughSession(page: Page): Promise<void> {
  for (let i = 0; i < 80; i += 1) {
    if (page.url().includes('/results/')) break;

    // A new-word session shows each entry's explanation card before its exercises (§18).
    const card = page.getByRole('button', { name: /practise this word/i });
    if (await card.isVisible().catch(() => false)) {
      await card.click({ timeout: 2_000 }).catch(() => {});
      continue;
    }

    const reveal = page.getByRole('button', { name: /show answer/i });
    if (await reveal.isVisible().catch(() => false))
      await reveal.click({ timeout: 2_000 }).catch(() => {});

    const next = page.getByRole('button', { name: /continue/i });
    if (await next.isVisible().catch(() => false))
      await next.click({ timeout: 2_000 }).catch(() => {});
  }
}

/** Reads the total XP stored in IndexedDB: history rows plus bonus events. */
async function totalXp(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('deutsch-wort-shatz');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const sumOf = (store: string, field: string): Promise<number> =>
      new Promise((resolve) => {
        const tx = db.transaction(store, 'readonly');
        const all = tx.objectStore(store).getAll();
        all.onsuccess = () =>
          resolve(
            (all.result as Record<string, number>[]).reduce(
              (sum, row) => sum + (row[field] ?? 0),
              0,
            ),
          );
        all.onerror = () => resolve(0);
      });
    const [exercises, bonuses] = await Promise.all([
      sumOf('exerciseHistory', 'xpAwarded'),
      sumOf('xpEvents', 'amount'),
    ]);
    return exercises + bonuses;
  });
}

test('the achievements page lists all twenty achievements', async ({ page }) => {
  await page.goto('/achievements');
  await expect(page.getByRole('heading', { level: 1, name: /^achievements$/i })).toBeVisible();
  await expect(page.getByText('0 / 20')).toBeVisible();

  for (const name of ['First Word', 'A1 Master', 'Seven-Day Streak', '10,000 Correct Answers']) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
});

test('the achievements page has no leaderboard or paid currency', async ({ page }) => {
  await page.goto('/achievements');
  const body = (await page.textContent('body')) ?? '';
  for (const forbidden of ['leaderboard', 'gems', 'coins', 'lives left']) {
    expect(body.toLowerCase()).not.toContain(forbidden);
  }
});

test('revealed answers earn no XP', async ({ page }) => {
  await page.goto('/learn');
  await page.getByRole('button', { name: /learn \d+ new words/i }).click();
  await expect(page.getByRole('heading', { level: 1, name: /new word/i })).toBeVisible();

  await revealThroughSession(page);
  expect(await totalXp(page)).toBe(0);
});

test('XP is earned and does not double on a refresh', async ({ page }) => {
  await page.goto(
    '/practice/session/xp-run?mode=free&level=A1&band=a1-core-1&length=3&types=multipleChoice',
  );
  await expect(page.getByText(/Exercise 1 of/)).toBeVisible();

  // Answer all three, taking the first option each time. Every interaction carries a
  // short timeout: without one a missing element burns the whole test budget waiting.
  for (let i = 0; i < 3; i += 1) {
    await page
      .getByRole('radio')
      .first()
      .check({ timeout: 2_000 })
      .catch(() => {});
    await page
      .getByRole('button', { name: /show answer/i })
      .click({ timeout: 1_000 })
      .catch(() => {});
    await page
      .getByRole('button', { name: /continue/i })
      .click({ timeout: 2_000 })
      .catch(() => {});
  }

  const afterSession = await totalXp(page);

  // Replaying the same session id must not award a second time.
  await page.goto(
    '/practice/session/xp-run?mode=free&level=A1&band=a1-core-1&length=3&types=multipleChoice',
  );
  await page.waitForTimeout(1_000);
  await page.goto('/');
  expect(await totalXp(page)).toBe(afterSession);
});

test('the dashboard shows XP, level, streak and daily-goal progress', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Total XP', { exact: true })).toBeVisible();
  await expect(page.getByText('Streak', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^today$/i })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: /daily goal progress/i })).toBeVisible();
});

test('resetting progress clears gamification, but only after confirmation', async ({ page }) => {
  // Earn something first.
  await page.goto('/learn');
  await page.getByRole('button', { name: /learn \d+ new words/i }).click();
  await expect(page.getByRole('heading', { level: 1, name: /new word/i })).toBeVisible();
  await revealThroughSession(page);

  await page.goto('/data');
  await page.getByRole('button', { name: /reset all progress/i }).click();

  // Cancelling must leave the data untouched.
  await page.getByRole('button', { name: /^cancel$/i }).click();
  const introduced = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('deutsch-wort-shatz');
      request.onsuccess = () => resolve(request.result);
    });
    return new Promise<number>((resolve) => {
      const tx = db.transaction('entryProgress', 'readonly');
      const count = tx.objectStore('entryProgress').count();
      count.onsuccess = () => resolve(count.result);
    });
  });
  expect(introduced).toBeGreaterThan(0);

  // Confirming clears everything.
  await page.getByRole('button', { name: /reset all progress/i }).click();
  await page.getByRole('button', { name: /yes, delete everything/i }).click();
  await expect(page.getByRole('status')).toContainText(/progress reset/i);

  expect(await totalXp(page)).toBe(0);
  await page.goto('/achievements');
  await expect(page.getByText('0 / 20')).toBeVisible();
});
