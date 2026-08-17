import { beforeEach, describe, expect, it } from 'vitest';

import {
  introduceEntry,
  loadAllProgress,
  loadProgress,
  MASTERY_SCORE_TARGET,
  recordReview,
} from './repository';
import { dueEntries, queueCounts } from './queue';
import { db, VocabularyLearningDatabase } from '@/features/persistence/db';

const NOW = new Date('2026-04-01T09:00:00.000Z');

const recognitionExercise = {
  type: 'multipleChoice' as const,
  isProduction: false,
  requiresTypedInput: false,
};
const productionExercise = {
  type: 'typedTranslation' as const,
  isProduction: true,
  requiresTypedInput: true,
};

async function answer(
  entryId: string,
  correct: boolean,
  options: Partial<Parameters<typeof recordReview>[0]> = {},
) {
  return recordReview({
    entryId,
    exercise: recognitionExercise,
    correct,
    attempts: 1,
    revealed: false,
    hintUsed: false,
    responseMs: 4_000,
    errorCategories: [],
    reviewedAt: NOW,
    ...options,
  });
}

beforeEach(async () => {
  await db.entryProgress.clear();
  await db.exerciseHistory.clear();
});

describe('SRS repository', () => {
  it('creates a progress record when an entry is introduced', async () => {
    const created = await introduceEntry('a1-0001-hallo', NOW);
    expect(created.srs.status).toBe('new');
    expect(await loadProgress('a1-0001-hallo')).toBeDefined();
  });

  it('does not overwrite an existing record on re-introduction', async () => {
    await introduceEntry('a1-0001-hallo', NOW);
    await answer('a1-0001-hallo', true);
    const again = await introduceEntry('a1-0001-hallo', NOW);
    expect(again.totalAttempts).toBe(1);
  });

  it('grades and schedules a correct answer without asking the learner', async () => {
    const { grade, progress } = await answer('a1-0001-hallo', true);
    expect(grade).toBe(2);
    expect(progress.srs.status).toBe('learning');
    expect(progress.srs.intervalDays).toBeGreaterThan(0);
  });

  it('grades a wrong answer as failed and counts a lapse', async () => {
    const { grade, progress } = await answer('a1-0001-hallo', false);
    expect(grade).toBe(0);
    expect(progress.srs.lapses).toBe(1);
    expect(progress.totalCorrect).toBe(0);
  });

  it('accumulates error categories for the difficulty model', async () => {
    await answer('a1-0001-hallo', false, {
      errorCategories: ['wrongArticle', 'wrongCapitalization'],
    });
    await answer('a1-0001-hallo', false, { errorCategories: ['wrongArticle'] });

    const stored = await loadProgress('a1-0001-hallo');
    expect(stored?.errorCounts).toEqual({ wrongArticle: 2, wrongCapitalization: 1 });
  });

  it('raises difficulty as the learner keeps failing', async () => {
    const first = await answer('a1-0001-hallo', true);
    for (let i = 0; i < 5; i += 1) {
      await answer('a1-0001-hallo', false, { errorCategories: ['wrongArticle'] });
    }
    const last = await loadProgress('a1-0001-hallo');
    expect(last!.srs.difficulty).toBeGreaterThan(first.progress.srs.difficulty);
  });

  it('does not count a revealed answer as correct', async () => {
    const { grade, progress } = await answer('a1-0001-hallo', true, { revealed: true });
    expect(grade).toBe(0);
    expect(progress.totalCorrect).toBe(0);
  });

  it('tracks first-attempt correctness separately', async () => {
    await answer('a1-0001-hallo', true, { attempts: 2 });
    const stored = await loadProgress('a1-0001-hallo');
    expect(stored?.totalCorrect).toBe(1);
    expect(stored?.firstAttemptCorrect).toBe(0);
  });

  it('records per-exercise-type performance', async () => {
    await answer('a1-0001-hallo', true);
    await answer('a1-0001-hallo', true, { exercise: productionExercise });

    const stored = await loadProgress('a1-0001-hallo');
    expect(stored?.srs.exercisePerformance.multipleChoice?.attempts).toBe(1);
    expect(stored?.srs.exercisePerformance.typedTranslation?.attempts).toBe(1);
  });

  it('rebuilds the due queue from storage, so it survives a refresh', async () => {
    await answer('a1-0001-hallo', true);
    await answer('a1-0002-ich', true);
    await answer('a1-0003-sein', false);

    // A fresh database handle over the same data stands in for a page reload.
    const reopened = new VocabularyLearningDatabase();
    await reopened.open();
    const reloaded = await reopened.entryProgress.toArray();
    reopened.close();

    expect(reloaded).toHaveLength(3);
    const later = new Date(NOW.getTime() + 2 * 86_400_000);
    expect(dueEntries(reloaded, later)).toHaveLength(3);
  });

  it('reports queue counts against the full vocabulary size', async () => {
    await answer('a1-0001-hallo', true);
    const all = await loadAllProgress();
    const counts = queueCounts(all, 10_000, NOW);
    expect(counts.newAvailable).toBe(9_999);
    expect(counts.learning).toBe(1);
  });

  it('promotes an entry to mastered once every criterion is met', async () => {
    const entryId = 'a1-0006-der-tag';
    let at = new Date(NOW);

    // Walk the learning steps, then keep succeeding on typed production until the
    // interval passes 30 days and difficulty stays low.
    for (let i = 0; i < 12; i += 1) {
      const result = await recordReview({
        entryId,
        exercise: productionExercise,
        correct: true,
        attempts: 1,
        revealed: false,
        hintUsed: false,
        responseMs: 2_000,
        errorCategories: [],
        reviewedAt: at,
      });
      // Mirror the review into history, which is where mastery evidence is read from.
      await db.exerciseHistory.put({
        id: `h-${i}`,
        entryId,
        sessionId: 's1',
        exerciseType: 'typedTranslation',
        correct: true,
        firstAttempt: true,
        revealed: false,
        hintUsed: false,
        responseMs: 2_000,
        grade: result.grade,
        errorCategories: [],
        answeredAt: at.toISOString(),
        xpAwarded: 0,
      });
      at = new Date(at.getTime() + result.progress.srs.intervalDays * 86_400_000);
    }

    const stored = await loadProgress(entryId);
    expect(stored?.srs.intervalDays).toBeGreaterThanOrEqual(30);
    expect(stored?.srs.status).toBe('mastered');
  });

  it('never deletes progress when updating it', async () => {
    await answer('a1-0001-hallo', true);
    const before = await loadProgress('a1-0001-hallo');
    await answer('a1-0001-hallo', false);
    const after = await loadProgress('a1-0001-hallo');

    expect(after?.introducedAt).toBe(before?.introducedAt);
    expect(after?.totalAttempts).toBe(2);
  });
});

describe('quiz score', () => {
  const entryId = 'a1-0001-hallo';

  it('adds one for a clean answer and subtracts one for a wrong one', async () => {
    expect((await answer(entryId, true)).progress.masteryScore).toBe(1);
    expect((await answer(entryId, true)).progress.masteryScore).toBe(2);
    expect((await answer(entryId, false)).progress.masteryScore).toBe(1);
  });

  it('never goes below zero', async () => {
    for (let i = 0; i < 3; i += 1) await answer(entryId, false);
    expect((await loadProgress(entryId))?.masteryScore).toBe(0);
  });

  it('does not count a second-attempt or revealed answer as clean', async () => {
    await answer(entryId, true, { attempts: 2 });
    expect((await loadProgress(entryId))?.masteryScore).toBe(0);

    await answer(entryId, true, { revealed: true });
    expect((await loadProgress(entryId))?.masteryScore).toBe(0);
  });

  it('holds the score for a second-attempt answer rather than dropping a rung', async () => {
    // Getting there in the end earns nothing, but must not cost anything either: a learner
    // who usually needs two tries at the typed formats could otherwise never reach the
    // target, and the word would never leave the continuous stream.
    await answer(entryId, true);
    await answer(entryId, true);
    expect((await answer(entryId, true, { attempts: 3 })).progress.masteryScore).toBe(2);

    // A revealed answer is a different thing: the learner did not produce it at all.
    expect((await answer(entryId, true, { revealed: true })).progress.masteryScore).toBe(1);
  });

  it('masters an entry once the score reaches the target', async () => {
    // The score only promotes an entry that has reached `review`; a word still in its
    // learning steps is not mastered by four quick answers on the same day.
    let at = NOW;
    for (let i = 0; i < 8; i += 1) {
      const result = await answer(entryId, true, {
        exercise: productionExercise,
        reviewedAt: at,
      });
      if (result.progress.srs.status === 'mastered') break;
      at = new Date(at.getTime() + result.progress.srs.intervalDays * 86_400_000);
    }

    const stored = await loadProgress(entryId);
    expect(stored?.masteryScore).toBeGreaterThanOrEqual(MASTERY_SCORE_TARGET);
    expect(stored?.srs.status).toBe('mastered');
  });

  it('averages response time rather than reacting to the last answer', async () => {
    // Multiple choice expects 6s. Five answers at 3s, then one distracted 15s answer.
    for (let i = 0; i < 5; i += 1) await answer(entryId, true, { responseMs: 3_000 });
    const steady = (await loadProgress(entryId))?.srs.difficulty ?? 0;

    await answer(entryId, true, { responseMs: 15_000 });
    const afterOneSlow = (await loadProgress(entryId))?.srs.difficulty ?? 0;

    // Instantaneous, 15s is 2.5× expected and saturates the response-time term, adding
    // its full 0.20 weight. Averaged, the mean is 5s — under expectation — so the term
    // barely moves. Difficulty gates both scheduling and mastery, so this matters.
    expect(afterOneSlow - steady).toBeLessThan(0.1);
  });
});
