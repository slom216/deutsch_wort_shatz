import { describe, expect, it } from 'vitest';

import {
  applyReview,
  createInitialSrsState,
  DEFAULT_EASE,
  daysUntilDue,
  difficultyMultiplier,
  isDue,
  isOverdue,
  LEARNING_STEPS_DAYS,
  MAX_EASE,
  MAX_INTERVAL_DAYS,
  MIN_EASE,
  MIN_INTERVAL_DAYS,
} from './scheduler';
import type { Grade, SrsState } from '@/schemas/progressSchema';

/**
 * Scheduling scenarios (Phase 2 acceptance: at least 30 scenarios).
 *
 * Every case fixes `reviewedAt` so the assertions are deterministic and independent of
 * the machine clock.
 */

const NOW = new Date('2026-03-01T12:00:00.000Z');
const TEN_MINUTES = LEARNING_STEPS_DAYS[0] as number;

function fresh(overrides: Partial<SrsState> = {}): SrsState {
  return { ...createInitialSrsState('a1-0001-hallo', NOW), ...overrides };
}

function review(
  state: SrsState,
  grade: Grade,
  options: { difficulty?: number; isProduction?: boolean; at?: Date } = {},
): SrsState {
  return applyReview(state, {
    grade,
    difficulty: options.difficulty ?? 0.5,
    isProduction: options.isProduction ?? false,
    reviewedAt: options.at ?? NOW,
  });
}

/** Walks an entry through the learning steps to a graduated review state. */
function graduate(difficulty = 0.3): SrsState {
  let state = fresh();
  state = review(state, 2); // recognition → 10 minutes
  state = review(state, 2, { isProduction: true, difficulty }); // → 1 day
  state = review(state, 2, { isProduction: true, difficulty }); // → 3 days
  state = review(state, 2, { isProduction: true, difficulty }); // → 7 days, graduates
  return state;
}

describe('initial state', () => {
  it('1. starts new, due immediately, with the default ease', () => {
    const state = fresh();
    expect(state.status).toBe('new');
    expect(state.easeFactor).toBe(DEFAULT_EASE);
    expect(state.repetitions).toBe(0);
    expect(isDue(state, NOW)).toBe(true);
  });

  it('2. starts at mid difficulty, not easy', () => {
    expect(fresh().difficulty).toBe(0.5);
  });
});

describe('learning steps (§20)', () => {
  it('3. first successful recognition schedules 10 minutes', () => {
    const state = review(fresh(), 2);
    expect(state.intervalDays).toBeCloseTo(TEN_MINUTES, 10);
    expect(state.status).toBe('learning');
  });

  it('4. a recognition success does not advance past the first step', () => {
    let state = review(fresh(), 2);
    state = review(state, 2, { isProduction: false });
    expect(state.intervalDays).toBeCloseTo(TEN_MINUTES, 10);
  });

  it('5. first successful production schedules 1 day', () => {
    let state = review(fresh(), 2);
    state = review(state, 2, { isProduction: true });
    expect(state.intervalDays).toBe(1);
  });

  it('6. the next success schedules 3 days', () => {
    let state = review(fresh(), 2);
    state = review(state, 2, { isProduction: true });
    state = review(state, 2, { isProduction: true });
    expect(state.intervalDays).toBe(3);
  });

  it('7. the next success schedules 7 days and graduates to review', () => {
    const state = graduate();
    expect(state.intervalDays).toBe(7);
    expect(state.status).toBe('review');
  });

  it('8. each step sets dueAt to reviewedAt plus the interval', () => {
    const state = review(fresh(), 2);
    const expected = NOW.getTime() + TEN_MINUTES * 86_400_000;
    expect(new Date(state.dueAt).getTime()).toBeCloseTo(expected, -2);
  });
});

describe('failure and relearning', () => {
  it('9. a failed new word returns in 10 minutes', () => {
    const state = review(fresh(), 0);
    expect(state.intervalDays).toBeCloseTo(TEN_MINUTES, 10);
  });

  it('10. failing a graduated word sends it to relearning', () => {
    const state = review(graduate(), 0);
    expect(state.status).toBe('relearning');
  });

  it('11. failing resets the interval to the first step, however long it was', () => {
    let state = graduate();
    state = review(state, 2, { isProduction: true }); // long interval
    expect(state.intervalDays).toBeGreaterThan(7);
    state = review(state, 0);
    expect(state.intervalDays).toBeCloseTo(TEN_MINUTES, 10);
  });

  it('12. failing increments lapses', () => {
    expect(review(graduate(), 0).lapses).toBe(1);
  });

  it('13. failing resets the consecutive-correct counter', () => {
    const state = review(graduate(), 0);
    expect(state.consecutiveCorrect).toBe(0);
  });

  it('14. a failed word comes back sooner than a passed one', () => {
    const passed = review(graduate(), 2, { isProduction: true });
    const failed = review(graduate(), 0);
    expect(daysUntilDue(failed, NOW)).toBeLessThan(daysUntilDue(passed, NOW));
  });

  it('15. relearning climbs back through the steps', () => {
    let state = review(graduate(), 0);
    expect(state.status).toBe('relearning');
    state = review(state, 2, { isProduction: true });
    expect(state.intervalDays).toBe(1);
  });
});

describe('interval growth (§20 formula)', () => {
  it('16. a graduated success multiplies by ease, performance and difficulty', () => {
    const base = graduate(0.3);
    const next = review(base, 2, { isProduction: true, difficulty: 0.3 });
    const expected = base.intervalDays * next.easeFactor * 1.0 * difficultyMultiplier(0.3);
    expect(next.intervalDays).toBeCloseTo(expected, 6);
  });

  it('17. grade 3 grows faster than grade 2', () => {
    const base = graduate();
    const strong = review(base, 3, { isProduction: true });
    const correct = review(base, 2, { isProduction: true });
    expect(strong.intervalDays).toBeGreaterThan(correct.intervalDays);
  });

  it('18. grade 1 grows more slowly than grade 2', () => {
    const base = graduate();
    const difficult = review(base, 1, { isProduction: true });
    const correct = review(base, 2, { isProduction: true });
    expect(difficult.intervalDays).toBeLessThan(correct.intervalDays);
  });

  it('19. successive successes lengthen the interval', () => {
    let state = graduate();
    const first = state.intervalDays;
    state = review(state, 2, { isProduction: true });
    const second = state.intervalDays;
    state = review(state, 2, { isProduction: true });
    expect(second).toBeGreaterThan(first);
    expect(state.intervalDays).toBeGreaterThan(second);
  });

  it('20. a hard word gets a shorter interval than an easy one', () => {
    const base = graduate();
    const easy = review(base, 2, { isProduction: true, difficulty: 0.1 });
    const hard = review(base, 2, { isProduction: true, difficulty: 0.9 });
    expect(hard.intervalDays).toBeLessThan(easy.intervalDays);
  });

  it('21. the interval never exceeds 365 days', () => {
    let state = graduate(0);
    for (let i = 0; i < 40; i += 1) {
      state = review(state, 3, { isProduction: true, difficulty: 0 });
    }
    expect(state.intervalDays).toBeLessThanOrEqual(MAX_INTERVAL_DAYS);
  });

  it('22. the interval never drops below 10 minutes', () => {
    let state = graduate();
    for (let i = 0; i < 20; i += 1) {
      state = review(state, 0);
    }
    expect(state.intervalDays).toBeGreaterThanOrEqual(MIN_INTERVAL_DAYS);
  });
});

describe('ease factor', () => {
  it('23. failing lowers the ease factor', () => {
    const base = graduate();
    expect(review(base, 0).easeFactor).toBeLessThan(base.easeFactor);
  });

  it('24. a strong answer raises the ease factor', () => {
    const base = graduate();
    expect(review(base, 3, { isProduction: true }).easeFactor).toBeGreaterThan(base.easeFactor);
  });

  it('25. a plain correct answer leaves the ease factor unchanged', () => {
    const base = graduate();
    expect(review(base, 2, { isProduction: true }).easeFactor).toBeCloseTo(base.easeFactor, 10);
  });

  it('26. the ease factor never falls below 1.3', () => {
    let state = graduate();
    for (let i = 0; i < 30; i += 1) state = review(state, 0);
    expect(state.easeFactor).toBeGreaterThanOrEqual(MIN_EASE);
  });

  it('27. the ease factor never rises above 3.0', () => {
    let state = graduate();
    for (let i = 0; i < 30; i += 1) state = review(state, 3, { isProduction: true });
    expect(state.easeFactor).toBeLessThanOrEqual(MAX_EASE);
  });
});

describe('bookkeeping', () => {
  it('28. every review increments repetitions', () => {
    let state = fresh();
    state = review(state, 2);
    state = review(state, 0);
    expect(state.repetitions).toBe(2);
  });

  it('29. successes increment the consecutive-correct counter', () => {
    let state = fresh();
    state = review(state, 2);
    state = review(state, 2, { isProduction: true });
    expect(state.consecutiveCorrect).toBe(2);
  });

  it('30. the last grade and review time are recorded', () => {
    const at = new Date('2026-03-02T08:30:00.000Z');
    const state = review(fresh(), 3, { isProduction: true, at });
    expect(state.lastGrade).toBe(3);
    expect(state.lastReviewedAt).toBe(at.toISOString());
  });

  it('31. difficulty is stored on the state', () => {
    expect(review(fresh(), 2, { difficulty: 0.75 }).difficulty).toBe(0.75);
  });

  it('32. the entry id is preserved across reviews', () => {
    expect(review(fresh(), 2).entryId).toBe('a1-0001-hallo');
  });
});

describe('due and overdue', () => {
  it('33. an entry is due once its dueAt has passed', () => {
    const state = review(fresh(), 2, { isProduction: true });
    const later = new Date(NOW.getTime() + 2 * 86_400_000);
    expect(isDue(state, NOW)).toBe(false);
    expect(isDue(state, later)).toBe(true);
  });

  it('34. an entry is overdue only when more than a day late', () => {
    // A 7-day interval, so "late" is measured against a real review-stage schedule
    // rather than the 10-minute first learning step.
    const state = graduate();
    const barelyLate = new Date(NOW.getTime() + 7.5 * 86_400_000);
    const wayLate = new Date(NOW.getTime() + 12 * 86_400_000);
    expect(isDue(state, barelyLate)).toBe(true);
    expect(isOverdue(state, barelyLate)).toBe(false);
    expect(isOverdue(state, wayLate)).toBe(true);
  });

  it('35. daysUntilDue is negative for a late entry', () => {
    const state = graduate();
    const late = new Date(NOW.getTime() + 10 * 86_400_000);
    expect(daysUntilDue(state, late)).toBeLessThan(0);
  });
});

describe('difficulty multiplier', () => {
  it('36. an easy word stretches the interval and a hard word shortens it', () => {
    expect(difficultyMultiplier(0)).toBeGreaterThan(1);
    expect(difficultyMultiplier(1)).toBeLessThan(1);
    expect(difficultyMultiplier(0.5)).toBeCloseTo(1, 10);
  });

  it('37. difficulty outside 0–1 is clamped', () => {
    expect(difficultyMultiplier(-5)).toBeCloseTo(difficultyMultiplier(0), 10);
    expect(difficultyMultiplier(5)).toBeCloseTo(difficultyMultiplier(1), 10);
  });
});

describe('no manual rating', () => {
  it('38. applyReview takes only observed facts, never a learner self-rating', () => {
    // The signature is the guarantee: grade, difficulty, production flag and a timestamp,
    // all derived from what happened (§20: "Do not ask the learner to rate words").
    const state = review(fresh(), 2);
    expect(Object.keys(state)).not.toContain('userRating');
    expect(Object.keys(state)).not.toContain('selfAssessment');
  });
});
