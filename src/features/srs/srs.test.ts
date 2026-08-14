import { describe, expect, it } from 'vitest';

import { expectedResponseMs, gradeAttempt, isLapse, isSuccess } from './grading';
import {
  computeDifficulty,
  difficultyBand,
  isGrammarPropertyError,
  isSpellingError,
} from './difficulty';
import { evaluateMastery, masteryEvidenceFrom } from './mastery';
import { dueEntries, hardestEntries, priority, queueCounts, reviewForecast } from './queue';
import { planFor, scoreExercise, weakestProperty } from './adaptation';
import {
  addDays,
  isPreviousLocalDay,
  isSameLocalDay,
  localDateKey,
  localDaysBetween,
  startOfLocalDay,
} from './localDate';
import { createInitialSrsState } from './scheduler';
import type { EntryProgress, ExerciseHistory, SrsState } from '@/schemas/progressSchema';

const NOW = new Date('2026-03-10T12:00:00.000Z');

type ProgressOverrides = Omit<Partial<EntryProgress>, 'srs'> & { srs?: Partial<SrsState> };

function progress(overrides: ProgressOverrides = {}): EntryProgress {
  const { srs: srsOverrides, ...rest } = overrides;
  const base = createInitialSrsState(overrides.entryId ?? 'e1', NOW);
  return {
    entryId: 'e1',
    introducedAt: NOW.toISOString(),
    totalAttempts: 0,
    totalCorrect: 0,
    firstAttemptCorrect: 0,
    hintsUsed: 0,
    errorCounts: {},
    masteryScore: 0,
    totalResponseMs: 0,
    ...rest,
    srs: { ...base, ...(srsOverrides ?? {}) },
  };
}

/* ------------------------------------------------------------------ grading */

describe('automatic grading (§20)', () => {
  const base = {
    correct: true,
    attempts: 1,
    revealed: false,
    hintUsed: false,
    responseMs: 5_000,
    isProduction: false,
    requiresTypedInput: false,
  };

  it('grades an incorrect answer as Failed', () => {
    expect(gradeAttempt({ ...base, correct: false }, 'multipleChoice')).toBe(0);
  });

  it('grades a revealed answer as Failed even if marked correct', () => {
    expect(gradeAttempt({ ...base, revealed: true }, 'multipleChoice')).toBe(0);
  });

  it('grades an abandoned exercise as Failed', () => {
    expect(gradeAttempt({ ...base, abandoned: true }, 'multipleChoice')).toBe(0);
  });

  it('grades a correct second attempt as Difficult', () => {
    expect(gradeAttempt({ ...base, attempts: 2 }, 'multipleChoice')).toBe(1);
  });

  it('grades a hinted answer as Difficult', () => {
    expect(gradeAttempt({ ...base, hintUsed: true }, 'multipleChoice')).toBe(1);
  });

  it('grades a very slow answer as Difficult', () => {
    const slow = expectedResponseMs('multipleChoice') * 3;
    expect(gradeAttempt({ ...base, responseMs: slow }, 'multipleChoice')).toBe(1);
  });

  it('grades a normal first-attempt answer as Correct', () => {
    expect(gradeAttempt(base, 'multipleChoice')).toBe(2);
  });

  it('grades a fast production answer as Strong', () => {
    const fast = expectedResponseMs('typedTranslation') * 0.3;
    expect(
      gradeAttempt({ ...base, isProduction: true, responseMs: fast }, 'typedTranslation'),
    ).toBe(3);
  });

  it('does not grade a fast recognition answer as Strong', () => {
    const fast = expectedResponseMs('multipleChoice') * 0.3;
    expect(gradeAttempt({ ...base, responseMs: fast }, 'multipleChoice')).toBe(2);
  });

  it('classifies successes and lapses', () => {
    expect(isSuccess(2)).toBe(true);
    expect(isSuccess(3)).toBe(true);
    expect(isSuccess(1)).toBe(false);
    expect(isLapse(0)).toBe(true);
  });
});

/* --------------------------------------------------------------- difficulty */

describe('difficulty model (§21)', () => {
  const clean = {
    attempts: 10,
    errors: 0,
    lapses: 0,
    repetitions: 10,
    spellingErrors: 0,
    grammarErrors: 0,
    hintsUsed: 0,
    responseTimeRatio: 0.5,
  };

  it('gives an unseen entry mid difficulty rather than easy', () => {
    expect(computeDifficulty({ ...clean, attempts: 0 })).toBe(0.5);
  });

  it('gives a flawless fast entry near-zero difficulty', () => {
    expect(computeDifficulty(clean)).toBeCloseTo(0, 5);
  });

  it('gives a consistently failed slow entry near-maximum difficulty', () => {
    expect(
      computeDifficulty({
        attempts: 10,
        errors: 10,
        lapses: 10,
        repetitions: 10,
        spellingErrors: 10,
        grammarErrors: 10,
        hintsUsed: 10,
        responseTimeRatio: 5,
      }),
    ).toBeCloseTo(1, 5);
  });

  it('weights the error rate most heavily', () => {
    const errors = computeDifficulty({ ...clean, errors: 10 });
    const hints = computeDifficulty({ ...clean, hintsUsed: 10 });
    expect(errors).toBeGreaterThan(hints);
  });

  it('raises difficulty as response time grows', () => {
    const fast = computeDifficulty({ ...clean, responseTimeRatio: 0.5 });
    const slow = computeDifficulty({ ...clean, responseTimeRatio: 2 });
    expect(slow).toBeGreaterThan(fast);
  });

  it('always stays within 0 and 1', () => {
    const extreme = computeDifficulty({
      attempts: 1,
      errors: 100,
      lapses: 100,
      repetitions: 1,
      spellingErrors: 100,
      grammarErrors: 100,
      hintsUsed: 100,
      responseTimeRatio: 100,
    });
    expect(extreme).toBeLessThanOrEqual(1);
    expect(extreme).toBeGreaterThanOrEqual(0);
  });

  it('bands difficulty for adaptation', () => {
    expect(difficultyBand(0.2)).toBe('low');
    expect(difficultyBand(0.5)).toBe('medium');
    expect(difficultyBand(0.8)).toBe('high');
  });

  it('separates spelling from grammar-property errors', () => {
    expect(isSpellingError('missingUmlaut')).toBe(true);
    expect(isSpellingError('wrongArticle')).toBe(false);
    expect(isGrammarPropertyError('wrongArticle')).toBe(true);
    expect(isGrammarPropertyError('missingUmlaut')).toBe(false);
  });
});

/* ------------------------------------------------------------------ mastery */

describe('mastery (§22)', () => {
  const readySrs = { intervalDays: 40, difficulty: 0.2 };
  const readyEvidence = {
    successfulReviews: 5,
    successfulProductionReviews: 3,
    typedFirstAttemptCorrect: true,
    recentGrades: [2, 3, 2],
  };

  it('masters an entry meeting every criterion', () => {
    const check = evaluateMastery(progress({ srs: readySrs }).srs, readyEvidence);
    expect(check.mastered).toBe(true);
    expect(check.criteria.every((c) => c.met)).toBe(true);
  });

  it('withholds mastery below 5 successful reviews', () => {
    const check = evaluateMastery(progress({ srs: readySrs }).srs, {
      ...readyEvidence,
      successfulReviews: 4,
    });
    expect(check.mastered).toBe(false);
  });

  it('withholds mastery below 3 production successes', () => {
    const check = evaluateMastery(progress({ srs: readySrs }).srs, {
      ...readyEvidence,
      successfulProductionReviews: 2,
    });
    expect(check.mastered).toBe(false);
  });

  it('withholds mastery without a typed first-attempt success', () => {
    const check = evaluateMastery(progress({ srs: readySrs }).srs, {
      ...readyEvidence,
      typedFirstAttemptCorrect: false,
    });
    expect(check.mastered).toBe(false);
  });

  it('withholds mastery below a 30-day interval', () => {
    const check = evaluateMastery(
      progress({ srs: { ...readySrs, intervalDays: 20 } }).srs,
      readyEvidence,
    );
    expect(check.mastered).toBe(false);
  });

  it('withholds mastery at or above 0.35 difficulty', () => {
    const check = evaluateMastery(
      progress({ srs: { ...readySrs, difficulty: 0.4 } }).srs,
      readyEvidence,
    );
    expect(check.mastered).toBe(false);
  });

  it('withholds mastery after a recent lapse', () => {
    const check = evaluateMastery(progress({ srs: readySrs }).srs, {
      ...readyEvidence,
      recentGrades: [2, 0, 2],
    });
    expect(check.mastered).toBe(false);
  });

  it('ignores a lapse older than the last three reviews', () => {
    const check = evaluateMastery(progress({ srs: readySrs }).srs, {
      ...readyEvidence,
      recentGrades: [0, 2, 2, 2],
    });
    expect(check.mastered).toBe(true);
  });

  it('reports each criterion for the progress screens', () => {
    const check = evaluateMastery(progress({ srs: readySrs }).srs, {
      ...readyEvidence,
      successfulReviews: 1,
    });
    expect(check.criteria).toHaveLength(6);
    expect(check.criteria.filter((c) => !c.met)).toHaveLength(1);
  });

  it('builds evidence from stored history', () => {
    const history: ExerciseHistory[] = [
      row('1', 'typedTranslation', 2, { correct: true, firstAttempt: true }),
      row('2', 'multipleChoice', 2),
      row('3', 'typedTranslation', 0),
    ];
    const evidence = masteryEvidenceFrom(history, (r) => r.exerciseType === 'typedTranslation');
    expect(evidence.successfulReviews).toBe(2);
    expect(evidence.successfulProductionReviews).toBe(1);
    expect(evidence.typedFirstAttemptCorrect).toBe(true);
    expect(evidence.recentGrades).toEqual([2, 2, 0]);
  });
});

function row(
  id: string,
  exerciseType: string,
  grade: 0 | 1 | 2 | 3,
  overrides: Partial<ExerciseHistory> = {},
): ExerciseHistory {
  return {
    id,
    entryId: 'e1',
    sessionId: 's1',
    exerciseType,
    correct: grade >= 2,
    firstAttempt: true,
    revealed: false,
    hintUsed: false,
    responseMs: 4000,
    grade,
    errorCategories: [],
    answeredAt: new Date(NOW.getTime() + Number(id) * 1000).toISOString(),
    xpAwarded: 0,
    ...overrides,
  };
}

/* -------------------------------------------------------------------- queue */

describe('review queue', () => {
  const overdueHard = progress({
    entryId: 'overdue-hard',
    srs: {
      dueAt: new Date(NOW.getTime() - 10 * 86_400_000).toISOString(),
      difficulty: 0.9,
      status: 'review',
    },
  });
  const overdueEasy = progress({
    entryId: 'overdue-easy',
    srs: {
      dueAt: new Date(NOW.getTime() - 9 * 86_400_000).toISOString(),
      difficulty: 0.1,
      status: 'review',
    },
  });
  const dueNow = progress({
    entryId: 'due-now',
    srs: { dueAt: NOW.toISOString(), difficulty: 0.8, status: 'review' },
  });
  const notDue = progress({
    entryId: 'not-due',
    srs: {
      dueAt: new Date(NOW.getTime() + 5 * 86_400_000).toISOString(),
      status: 'review',
    },
  });

  const all = [notDue, dueNow, overdueEasy, overdueHard];

  it('returns only entries that are due', () => {
    const due = dueEntries(all, NOW);
    expect(due.map((p) => p.entryId)).not.toContain('not-due');
    expect(due).toHaveLength(3);
  });

  it('puts the most overdue entry first', () => {
    expect(dueEntries(all, NOW)[0]?.entryId).toBe('overdue-hard');
  });

  it('breaks ties by difficulty', () => {
    const a = progress({
      entryId: 'a',
      srs: { dueAt: NOW.toISOString(), difficulty: 0.2, status: 'review' },
    });
    const b = progress({
      entryId: 'b',
      srs: { dueAt: NOW.toISOString(), difficulty: 0.9, status: 'review' },
    });
    expect(dueEntries([a, b], NOW)[0]?.entryId).toBe('b');
  });

  it('orders deterministically for identical priorities', () => {
    const a = progress({ entryId: 'zzz', srs: { dueAt: NOW.toISOString(), status: 'review' } });
    const b = progress({ entryId: 'aaa', srs: { dueAt: NOW.toISOString(), status: 'review' } });
    expect(dueEntries([a, b], NOW).map((p) => p.entryId)).toEqual(['aaa', 'zzz']);
    expect(dueEntries([b, a], NOW).map((p) => p.entryId)).toEqual(['aaa', 'zzz']);
  });

  it('scores overdueness above difficulty', () => {
    expect(priority(overdueEasy, NOW)).toBeGreaterThan(priority(dueNow, NOW));
  });

  it('counts due, overdue and new-available', () => {
    const counts = queueCounts(all, 1000, NOW);
    expect(counts.due).toBe(3);
    expect(counts.overdue).toBe(2);
    expect(counts.newAvailable).toBe(996);
    expect(counts.review).toBe(4);
  });

  it('lists the hardest entries first', () => {
    const seen = [
      progress({ entryId: 'easy', totalAttempts: 5, srs: { difficulty: 0.1 } }),
      progress({ entryId: 'hard', totalAttempts: 5, srs: { difficulty: 0.95 } }),
      progress({ entryId: 'never-tried', totalAttempts: 0, srs: { difficulty: 0.99 } }),
    ];
    const hardest = hardestEntries(seen);
    expect(hardest[0]?.entryId).toBe('hard');
    // An entry with no attempts has no evidence and is excluded.
    expect(hardest.map((p) => p.entryId)).not.toContain('never-tried');
  });

  it('forecasts reviews per local day', () => {
    const forecast = reviewForecast(all, 7, NOW);
    expect(forecast).toHaveLength(7);
    // The three already-due entries all land on today.
    expect(forecast[0]?.count).toBe(3);
    expect(forecast.reduce((sum, day) => sum + day.count, 0)).toBe(4);
  });
});

/* --------------------------------------------------------------- adaptation */

describe('exercise adaptation (§21)', () => {
  it('pushes an easy entry towards typed production', () => {
    const plan = planFor(progress({ srs: { difficulty: 0.1 } }));
    expect(plan.band).toBe('low');
    expect(plan.preferredTypes[0]).toBe('typedTranslation');
    expect(plan.discouragedTypes).toContain('multipleChoice');
  });

  it('returns a hard entry to recognition with simpler choices', () => {
    const plan = planFor(progress({ srs: { difficulty: 0.9 } }));
    expect(plan.band).toBe('high');
    expect(plan.preferredTypes[0]).toBe('multipleChoice');
    expect(plan.multipleChoiceOptions).toBe(3);
    expect(plan.showMetadataAfterError).toBe(true);
  });

  it('keeps a mixed diet for a medium entry', () => {
    const plan = planFor(progress({ srs: { difficulty: 0.5 } }));
    expect(plan.band).toBe('medium');
    expect(plan.discouragedTypes).toHaveLength(0);
  });

  it('identifies the weakest grammatical property', () => {
    const entry = progress({ errorCounts: { wrongArticle: 5, wrongPlural: 1, missingUmlaut: 9 } });
    expect(weakestProperty(entry)).toBe('article');
  });

  it('returns no weak property when there are no grammar errors', () => {
    expect(weakestProperty(progress({ errorCounts: { missingUmlaut: 4 } }))).toBeNull();
  });

  it('promotes exercises targeting the weak property', () => {
    const plan = planFor(progress({ srs: { difficulty: 0.5 }, errorCounts: { wrongArticle: 5 } }));
    const articleQuestion = scoreExercise(plan, {
      type: 'multipleChoice',
      variant: 'article',
      isProduction: true,
    });
    const generic = scoreExercise(plan, {
      type: 'multipleChoice',
      variant: 'germanToEnglish',
      isProduction: false,
    });
    expect(articleQuestion).toBeGreaterThan(generic);
  });

  it('scores discouraged types below preferred ones', () => {
    const plan = planFor(progress({ srs: { difficulty: 0.9 } }));
    const preferred = scoreExercise(plan, {
      type: 'multipleChoice',
      variant: 'germanToEnglish',
      isProduction: false,
    });
    const discouraged = scoreExercise(plan, {
      type: 'wordOrdering',
      variant: 'sentenceReconstruction',
      isProduction: true,
    });
    expect(preferred).toBeGreaterThan(discouraged);
  });
});

/* -------------------------------------------------------------- local dates */

describe('local calendar dates (§23)', () => {
  it('formats the local day, not the UTC day', () => {
    // 23:30 local on the 5th is still the 5th locally, whatever UTC says.
    const late = new Date(2026, 2, 5, 23, 30, 0);
    expect(localDateKey(late)).toBe('2026-03-05');
  });

  it('treats two times on the same local day as one day', () => {
    expect(isSameLocalDay(new Date(2026, 2, 5, 1), new Date(2026, 2, 5, 23))).toBe(true);
  });

  it('detects consecutive local days across midnight', () => {
    const before = new Date(2026, 2, 5, 23, 59);
    const after = new Date(2026, 2, 6, 0, 1);
    expect(isSameLocalDay(before, after)).toBe(false);
    expect(isPreviousLocalDay(before, after)).toBe(true);
  });

  it('counts whole local days between instants', () => {
    expect(localDaysBetween(new Date(2026, 2, 1, 22), new Date(2026, 2, 4, 3))).toBe(3);
  });

  it('starts a local day at midnight', () => {
    const start = startOfLocalDay(new Date(2026, 2, 5, 17, 45));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getDate()).toBe(5);
  });

  it('adds days without drifting across a DST boundary', () => {
    const before = new Date(2026, 2, 28, 12, 0);
    expect(localDaysBetween(before, addDays(before, 3))).toBe(3);
  });
});
