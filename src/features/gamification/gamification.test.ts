import { beforeEach, describe, expect, it } from 'vitest';

import { exerciseXp, levelForXp, levelProgress, xpRequiredForLevel, XP_BY_TYPE } from './xp';
import { computeStreak, dailyActivity, dailyGoalState } from './streak';
import {
  ACHIEVEMENTS,
  evaluateAchievements,
  newlyUnlocked,
  type AchievementStats,
} from './achievements';
import {
  awardBonus,
  awardDailyGoalBonus,
  awardMasteryBonus,
  awardSessionBonuses,
  loadGamification,
  syncAchievements,
} from './repository';
import { db, resetAllProgress } from '@/features/persistence/db';
import type { ExerciseHistory } from '@/schemas/progressSchema';

const TOTALS = { A1: 1000, A2: 3000, B1: 6000 } as const;

/** A history row on a given local day. */
function row(
  id: string,
  overrides: Partial<ExerciseHistory> & { day?: string } = {},
): ExerciseHistory {
  const { day = '2026-05-10', ...rest } = overrides;
  return {
    id,
    entryId: 'a1-0001-hallo',
    sessionId: 's1',
    exerciseType: 'multipleChoice',
    correct: true,
    firstAttempt: true,
    revealed: false,
    hintUsed: false,
    responseMs: 3000,
    grade: 2,
    errorCategories: [],
    // Midday local time, so the local-date bucket is unambiguous.
    answeredAt: new Date(`${day}T12:00:00`).toISOString(),
    xpAwarded: 5,
    ...rest,
  };
}

/* ------------------------------------------------------------------------ XP */

describe('XP rules (§23)', () => {
  it('awards the documented amount per exercise type', () => {
    expect(XP_BY_TYPE.multipleChoice).toBe(5);
    expect(XP_BY_TYPE.typedTranslation).toBe(8);
    expect(XP_BY_TYPE.listening).toBe(7);
    expect(XP_BY_TYPE.speaking).toBe(10);
  });

  it('deducts the same amount for a wrong answer', () => {
    expect(
      exerciseXp({ exerciseType: 'typedTranslation', correct: false, revealed: false }),
    ).toBe(-8);
    expect(exerciseXp({ exerciseType: 'typedTranslation', correct: true, revealed: false })).toBe(8);
  });

  it('awards nothing for a revealed answer', () => {
    expect(exerciseXp({ exerciseType: 'typedTranslation', correct: true, revealed: true })).toBe(0);
    expect(exerciseXp({ exerciseType: 'typedTranslation', correct: false, revealed: true })).toBe(0);
  });
});

describe('learner levels (§23)', () => {
  it('makes each level cost 30% more than the one before', () => {
    expect(xpRequiredForLevel(1)).toBe(0);
    expect(xpRequiredForLevel(2)).toBe(413);
    for (let level = 2; level < 20; level += 1) {
      const previousStep = xpRequiredForLevel(level) - xpRequiredForLevel(level - 1);
      const step = xpRequiredForLevel(level + 1) - xpRequiredForLevel(level);
      // Rounding to whole XP wobbles the ratio on the cheapest levels (413 → 537 is 1.30).
      expect(step / previousStep).toBeCloseTo(1.3, 1);
    }
  });

  // The whole 3,460-entry corpus yields roughly 200,000 XP once mastered; the curve is
  // tuned so that lands on level 20 rather than somewhere arbitrary.
  it('puts level 20 within reach of a fully mastered corpus', () => {
    expect(xpRequiredForLevel(20)).toBeLessThanOrEqual(200_000);
    expect(xpRequiredForLevel(21)).toBeGreaterThan(200_000);
    expect(levelForXp(200_000)).toBe(20);
  });

  it('starts every learner at level 1', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(412)).toBe(1);
  });

  it('advances a level once the threshold is reached', () => {
    expect(levelForXp(413)).toBe(2);
    expect(levelForXp(950)).toBe(3);
    expect(levelForXp(2555)).toBe(5);
  });

  it('reports progress towards the next level', () => {
    const progress = levelProgress(1200);
    expect(progress.level).toBe(3);
    expect(progress.xpForNextLevel).toBe(448);
    expect(progress.fraction).toBeGreaterThan(0);
    expect(progress.fraction).toBeLessThan(1);
  });

  it('never reports a fraction above 1', () => {
    expect(levelProgress(1_000_000).fraction).toBeLessThanOrEqual(1);
  });
});

/* -------------------------------------------------------------------- streaks */

describe('streaks (§23)', () => {
  const manyOn = (day: string, count: number): ExerciseHistory[] =>
    Array.from({ length: count }, (_, i) => row(`${day}-${i}`, { day }));

  it('counts a day with at least 10 graded exercises', () => {
    const activity = dailyActivity(manyOn('2026-05-10', 10));
    expect(activity[0]?.countsForStreak).toBe(true);
  });

  it('does not count a day with too few exercises and too little XP', () => {
    const activity = dailyActivity(
      Array.from({ length: 3 }, (_, i) => row(`x${i}`, { xpAwarded: 5 })),
    );
    expect(activity[0]?.countsForStreak).toBe(false);
  });

  it('counts a day that reaches 50 XP with fewer exercises', () => {
    const activity = dailyActivity(
      Array.from({ length: 5 }, (_, i) => row(`x${i}`, { xpAwarded: 10 })),
    );
    expect(activity[0]?.countsForStreak).toBe(true);
  });

  it('counts consecutive local days', () => {
    const history = [
      ...manyOn('2026-05-08', 10),
      ...manyOn('2026-05-09', 10),
      ...manyOn('2026-05-10', 10),
    ];
    const streak = computeStreak(history, new Date('2026-05-10T18:00:00'));
    expect(streak.current).toBe(3);
    expect(streak.todayCounts).toBe(true);
  });

  it('breaks the streak after a missed day', () => {
    const history = [...manyOn('2026-05-05', 10), ...manyOn('2026-05-06', 10)];
    const streak = computeStreak(history, new Date('2026-05-10T12:00:00'));
    expect(streak.current).toBe(0);
    expect(streak.longest).toBe(2);
  });

  it('keeps yesterday-only streaks alive', () => {
    const history = [...manyOn('2026-05-09', 10), ...manyOn('2026-05-10', 10)];
    const streak = computeStreak(history, new Date('2026-05-11T09:00:00'));
    expect(streak.current).toBe(2);
    expect(streak.todayCounts).toBe(false);
  });

  it('bridges a single missed day with a streak freeze', () => {
    const history = [
      ...manyOn('2026-05-08', 10),
      // 2026-05-09 missed
      ...manyOn('2026-05-10', 10),
    ];
    const withoutFreeze = computeStreak(history, new Date('2026-05-10T18:00:00'), 0);
    const withFreeze = computeStreak(history, new Date('2026-05-10T18:00:00'), 1);
    expect(withoutFreeze.current).toBe(1);
    expect(withFreeze.current).toBe(2);
  });

  it('uses local dates, not UTC', () => {
    // 23:30 local: still the same local day even where UTC has already rolled over.
    const late = Array.from({ length: 10 }, (_, i) => ({
      ...row(`late-${i}`),
      answeredAt: new Date(2026, 4, 10, 23, 30).toISOString(),
    }));
    const activity = dailyActivity(late);
    expect(activity).toHaveLength(1);
    expect(activity[0]?.date).toBe('2026-05-10');
  });

  it('reports no streak with no history', () => {
    expect(computeStreak([], new Date()).current).toBe(0);
  });
});

describe('daily goal (§23)', () => {
  it('counts only today', () => {
    const history = [row('a', { day: '2026-05-10' }), row('b', { day: '2026-05-09' })];
    const state = dailyGoalState(history, 20, new Date('2026-05-10T12:00:00'));
    expect(state.completed).toBe(1);
  });

  it('is met once the goal is reached', () => {
    const history = Array.from({ length: 20 }, (_, i) => row(`x${i}`, { day: '2026-05-10' }));
    const state = dailyGoalState(history, 20, new Date('2026-05-10T12:00:00'));
    expect(state.met).toBe(true);
    expect(state.fraction).toBe(1);
  });
});

/* --------------------------------------------------------------- achievements */

describe('achievements (§23)', () => {
  const empty: AchievementStats = {
    wordsIntroduced: 0,
    wordsMastered: 0,
    totalCorrect: 0,
    reviewsCompleted: 0,
    currentStreak: 0,
    longestStreak: 0,
    perfectSessions: 0,
    listeningAnswers: 0,
    speakingAnswers: 0,
    articleCorrect: 0,
    pluralCorrect: 0,
    verbFormCorrect: 0,
    introducedByLevel: { A1: 0, A2: 0, B1: 0 },
    masteredByLevel: { A1: 0, A2: 0, B1: 0 },
    totalByLevel: TOTALS,
  };

  it('defines all twenty required achievements', () => {
    expect(ACHIEVEMENTS).toHaveLength(20);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(20);
  });

  it('includes every achievement named in the specification', () => {
    const names = ACHIEVEMENTS.map((a) => a.name);
    for (const required of [
      'First Word',
      'First Review',
      '100 Words Introduced',
      '100 Words Mastered',
      'A1 Explorer',
      'A1 Master',
      'A2 Explorer',
      'A2 Master',
      'B1 Explorer',
      'B1 Master',
      'Seven-Day Streak',
      'Thirty-Day Streak',
      'Article Expert',
      'Plural Expert',
      'Verb Expert',
      'Perfect Session',
      'Listening Practice',
      'Speaking Practice',
      '1,000 Correct Answers',
      '10,000 Correct Answers',
    ]) {
      expect(names).toContain(required);
    }
  });

  it('unlocks nothing for a brand-new learner', () => {
    expect(evaluateAchievements(empty).filter((a) => a.unlocked)).toHaveLength(0);
  });

  it('unlocks First Word after one entry', () => {
    const statuses = evaluateAchievements({ ...empty, wordsIntroduced: 1 });
    expect(statuses.find((a) => a.definition.id === 'first-word')?.unlocked).toBe(true);
  });

  it('reports partial progress', () => {
    const statuses = evaluateAchievements({ ...empty, wordsIntroduced: 50 });
    const hundred = statuses.find((a) => a.definition.id === 'words-introduced-100');
    expect(hundred?.progress).toBeCloseTo(0.5, 5);
    expect(hundred?.unlocked).toBe(false);
  });

  it('unlocks A1 Master only when the whole level is mastered', () => {
    const partial = evaluateAchievements({
      ...empty,
      masteredByLevel: { A1: 999, A2: 0, B1: 0 },
    });
    expect(partial.find((a) => a.definition.id === 'a1-master')?.unlocked).toBe(false);

    const complete = evaluateAchievements({
      ...empty,
      masteredByLevel: { A1: 1000, A2: 0, B1: 0 },
    });
    expect(complete.find((a) => a.definition.id === 'a1-master')?.unlocked).toBe(true);
  });

  it('keeps an achievement unlocked even if the stat later drops', () => {
    const unlockedAt = new Map([['first-word', '2026-01-01T00:00:00.000Z']]);
    const statuses = evaluateAchievements(empty, unlockedAt);
    expect(statuses.find((a) => a.definition.id === 'first-word')?.unlocked).toBe(true);
  });

  it('reports only genuinely new unlocks', () => {
    const stats = { ...empty, wordsIntroduced: 1 };
    expect(newlyUnlocked(stats, new Map()).map((a) => a.id)).toContain('first-word');
    const already = new Map([['first-word', '2026-01-01T00:00:00.000Z']]);
    expect(newlyUnlocked(stats, already).map((a) => a.id)).not.toContain('first-word');
  });

  it('has no leaderboard, currency or lives concept', () => {
    const text = ACHIEVEMENTS.map((a) => `${a.name} ${a.description}`)
      .join(' ')
      .toLowerCase();
    for (const forbidden of ['leaderboard', 'coin', 'gem', 'lives', 'loot']) {
      expect(text).not.toContain(forbidden);
    }
  });
});

/* ----------------------------------------------------------------- persistence */

describe('gamification persistence', () => {
  beforeEach(async () => {
    await resetAllProgress();
  });

  it('derives total XP from stored history and bonuses', async () => {
    await db.exerciseHistory.bulkPut([row('a'), row('b'), row('c')]);
    await awardBonus({ id: 'daily:2026-05-10', type: 'dailyGoal', amount: 25 });

    const snapshot = await loadGamification(20, TOTALS, new Date('2026-05-10T18:00:00'));
    expect(snapshot.totalXp).toBe(5 * 3 + 25);
  });

  it('cannot duplicate a bonus, however many times it is awarded', async () => {
    for (let i = 0; i < 5; i += 1) {
      await awardBonus({ id: 'daily:2026-05-10', type: 'dailyGoal', amount: 25 });
    }
    const snapshot = await loadGamification(20, TOTALS, new Date('2026-05-10T18:00:00'));
    expect(snapshot.totalXp).toBe(25);
  });

  it('cannot duplicate exercise XP when the same exercise is re-recorded', async () => {
    await db.exerciseHistory.put(row('session:ex-1'));
    await db.exerciseHistory.put(row('session:ex-1'));

    const snapshot = await loadGamification(20, TOTALS, new Date('2026-05-10T18:00:00'));
    expect(snapshot.totalXp).toBe(5);
  });

  it('awards the mastery bonus once per entry', async () => {
    await awardMasteryBonus('a1-0001-hallo');
    await awardMasteryBonus('a1-0001-hallo');
    const snapshot = await loadGamification(20, TOTALS, new Date('2026-05-10T18:00:00'));
    expect(snapshot.totalXp).toBe(10);
  });

  it('awards the perfect-session bonus only for a flawless full session', async () => {
    const perfect = Array.from({ length: 20 }, (_, i) =>
      row(`p:${i}`, { sessionId: 'perfect', xpAwarded: 0 }),
    );
    await db.exerciseHistory.bulkPut(perfect);
    await awardSessionBonuses('perfect');

    let snapshot = await loadGamification(20, TOTALS, new Date('2026-05-10T18:00:00'));
    expect(snapshot.totalXp).toBe(30);

    // A session with one mistake earns nothing extra.
    const flawed = Array.from({ length: 20 }, (_, i) =>
      row(`f:${i}`, { sessionId: 'flawed', xpAwarded: 0, correct: i !== 3 }),
    );
    await db.exerciseHistory.bulkPut(flawed);
    await awardSessionBonuses('flawed');

    snapshot = await loadGamification(20, TOTALS, new Date('2026-05-10T18:00:00'));
    expect(snapshot.totalXp).toBe(30);
  });

  it('awards the daily-goal bonus once per local day', async () => {
    const today = Array.from({ length: 20 }, (_, i) =>
      row(`d:${i}`, { day: '2026-05-10', xpAwarded: 0 }),
    );
    await db.exerciseHistory.bulkPut(today);

    const now = new Date('2026-05-10T18:00:00');
    await awardDailyGoalBonus(20, now);
    await awardDailyGoalBonus(20, now);

    const snapshot = await loadGamification(20, TOTALS, now);
    expect(snapshot.totalXp).toBe(25);
  });

  it('does not award the daily-goal bonus before the goal is met', async () => {
    await db.exerciseHistory.bulkPut([row('a', { xpAwarded: 0 })]);
    const now = new Date('2026-05-10T18:00:00');
    await awardDailyGoalBonus(20, now);
    expect((await loadGamification(20, TOTALS, now)).totalXp).toBe(0);
  });

  it('records an unlocked achievement exactly once', async () => {
    await db.entryProgress.put({
      entryId: 'a1-0001-hallo',
      introducedAt: new Date().toISOString(),
      srs: {
        entryId: 'a1-0001-hallo',
        status: 'learning',
        dueAt: new Date().toISOString(),
        intervalDays: 1,
        easeFactor: 2.5,
        difficulty: 0.5,
        repetitions: 1,
        lapses: 0,
        consecutiveCorrect: 1,
        exercisePerformance: {},
      },
      totalAttempts: 1,
      totalCorrect: 1,
      firstAttemptCorrect: 1,
      hintsUsed: 0,
      errorCounts: {},
      masteryScore: 0,
      totalResponseMs: 0,
    });

    const snapshot = await loadGamification(20, TOTALS, new Date());
    const first = await syncAchievements(snapshot.stats);
    const second = await syncAchievements(snapshot.stats);

    expect(first).toContain('first-word');
    expect(second).not.toContain('first-word');
    expect(await db.achievements.count()).toBe(first.length);
  });

  it('clears XP and achievements when progress is reset (§23)', async () => {
    await db.exerciseHistory.bulkPut([row('a'), row('b')]);
    await awardBonus({ id: 'daily:x', type: 'dailyGoal', amount: 25 });
    await db.achievements.put({
      id: 'first-word',
      unlockedAt: new Date().toISOString(),
      progress: 1,
    });

    await resetAllProgress();

    const snapshot = await loadGamification(20, TOTALS, new Date());
    expect(snapshot.totalXp).toBe(0);
    expect(snapshot.unlockedCount).toBe(0);
    expect(await db.xpEvents.count()).toBe(0);
  });
});
