import type { Grade, SrsState, SrsStatus } from '@/schemas/progressSchema';
import { isLapse } from './grading';
import { MINUTE_IN_DAYS } from './localDate';

/**
 * Modified SM-2 scheduler (§20).
 *
 *   nextInterval = currentInterval * easeFactor * performanceMultiplier * difficultyMultiplier
 *
 * Learning steps come first: a newly introduced entry is not put on a multiplicative
 * schedule until it has been recognised and then produced correctly.
 *
 *   First successful recognition → 10 minutes
 *   First successful production  → 1 day
 *   Next success                 → 3 days
 *   Next success                 → 7 days
 *
 * After the steps the interval grows multiplicatively. A failure resets to relearning.
 */

export const MIN_INTERVAL_DAYS = 10 * MINUTE_IN_DAYS;
export const MAX_INTERVAL_DAYS = 365;
export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
export const DEFAULT_EASE = 2.5;

/** Ordered learning steps, in days (§20). */
export const LEARNING_STEPS_DAYS: readonly number[] = [
  10 * MINUTE_IN_DAYS, // first successful recognition
  1, // first successful production
  3,
  7,
];

/** Interval multipliers by grade (§20). Grade 0 resets rather than multiplying. */
export const PERFORMANCE_MULTIPLIER: Record<Exclude<Grade, 0>, number> = {
  1: 0.6,
  2: 1.0,
  3: 1.35,
};

/** Ease adjustments per grade, applied after each review and then clamped. */
const EASE_DELTA: Record<Grade, number> = {
  0: -0.2,
  1: -0.15,
  2: 0,
  3: 0.1,
};

export interface ReviewInput {
  readonly grade: Grade;
  /** Automatic difficulty for this entry, 0–1 (§21). */
  readonly difficulty: number;
  /** True when the answered exercise required producing German. */
  readonly isProduction: boolean;
  readonly reviewedAt: Date;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Harder words get shorter intervals and easier words longer ones (§21 adaptation).
 * Difficulty 0 → 1.15, difficulty 0.5 → 1.0, difficulty 1 → 0.85.
 */
export function difficultyMultiplier(difficulty: number): number {
  return 1.15 - 0.3 * clamp(difficulty, 0, 1);
}

export function createInitialSrsState(entryId: string, now: Date): SrsState {
  return {
    entryId,
    status: 'new',
    dueAt: now.toISOString(),
    intervalDays: 0,
    easeFactor: DEFAULT_EASE,
    difficulty: 0.5,
    repetitions: 0,
    lapses: 0,
    consecutiveCorrect: 0,
    exercisePerformance: {},
  };
}

/**
 * Which learning step an entry is on. `-1` means it has graduated to review.
 * Steps are tracked by interval rather than a separate counter so the state stays
 * self-describing and a migration cannot lose it.
 */
function currentStepIndex(state: SrsState): number {
  if (state.status === 'review' || state.status === 'mastered') return -1;
  const index = LEARNING_STEPS_DAYS.findIndex((step) => Math.abs(step - state.intervalDays) < 1e-9);
  return index;
}

function nextStatus(
  previous: SrsStatus,
  grade: Grade,
  stepIndex: number,
  graduated: boolean,
): SrsStatus {
  if (isLapse(grade)) {
    // A word that had graduated goes to relearning; one still in the steps stays learning.
    return previous === 'review' || previous === 'mastered' ? 'relearning' : 'learning';
  }
  if (graduated) return 'review';
  return stepIndex >= 0 || previous === 'new' ? 'learning' : previous;
}

/**
 * Applies one review outcome and returns the updated SRS state.
 * Pure: the caller persists the result.
 */
export function applyReview(state: SrsState, input: ReviewInput): SrsState {
  const { grade, difficulty, isProduction, reviewedAt } = input;

  const easeFactor = clamp(state.easeFactor + EASE_DELTA[grade], MIN_EASE, MAX_EASE);
  const repetitions = state.repetitions + 1;

  /* ---- failure: reset to the first step and relearn ---- */
  if (isLapse(grade)) {
    const intervalDays = LEARNING_STEPS_DAYS[0] as number;
    return {
      ...state,
      status: nextStatus(state.status, grade, currentStepIndex(state), false),
      intervalDays,
      dueAt: addIntervalDays(reviewedAt, intervalDays).toISOString(),
      easeFactor,
      difficulty,
      repetitions,
      lapses: state.lapses + 1,
      consecutiveCorrect: 0,
      lastReviewedAt: reviewedAt.toISOString(),
      lastGrade: grade,
      exercisePerformance: state.exercisePerformance,
    };
  }

  // Grade 0 returned above, so only the multiplying grades remain. TypeScript cannot
  // narrow the union across the early return, so state it once here.
  const successGrade = grade as Exclude<Grade, 0>;

  const consecutiveCorrect = state.consecutiveCorrect + 1;
  const stepIndex = currentStepIndex(state);
  const inLearningSteps =
    stepIndex >= 0 ||
    state.status === 'new' ||
    state.status === 'learning' ||
    state.status === 'relearning';

  let intervalDays: number;
  let graduated = false;

  if (inLearningSteps) {
    // The very first step is only completed by a *recognition* success; the second step
    // requires a *production* success, per §20's initial steps.
    let target = stepIndex + 1;
    if (state.status === 'new' || stepIndex < 0) target = 0;

    if (target === 1 && !isProduction) {
      // Still on the recognition step until the learner produces the word correctly.
      target = 0;
    }

    if (target >= LEARNING_STEPS_DAYS.length) {
      graduated = true;
      const last = LEARNING_STEPS_DAYS[LEARNING_STEPS_DAYS.length - 1] as number;
      intervalDays =
        last * easeFactor * PERFORMANCE_MULTIPLIER[successGrade] * difficultyMultiplier(difficulty);
    } else {
      intervalDays = LEARNING_STEPS_DAYS[target] as number;
      // Reaching the final step graduates the entry to the review schedule.
      graduated = target === LEARNING_STEPS_DAYS.length - 1;
    }
  } else {
    const base = state.intervalDays > 0 ? state.intervalDays : 1;
    intervalDays =
      base * easeFactor * PERFORMANCE_MULTIPLIER[successGrade] * difficultyMultiplier(difficulty);
    graduated = true;
  }

  intervalDays = clamp(intervalDays, MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS);

  return {
    ...state,
    status: nextStatus(state.status, grade, stepIndex, graduated),
    intervalDays,
    dueAt: addIntervalDays(reviewedAt, intervalDays).toISOString(),
    easeFactor,
    difficulty,
    repetitions,
    lapses: state.lapses,
    consecutiveCorrect,
    lastReviewedAt: reviewedAt.toISOString(),
    lastGrade: grade,
    exercisePerformance: state.exercisePerformance,
  };
}

export function addIntervalDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

/** Days until due; negative means overdue. */
export function daysUntilDue(state: SrsState, now: Date = new Date()): number {
  return (new Date(state.dueAt).getTime() - now.getTime()) / 86_400_000;
}

export function isDue(state: SrsState, now: Date = new Date()): boolean {
  return new Date(state.dueAt).getTime() <= now.getTime();
}

export function isOverdue(state: SrsState, now: Date = new Date()): boolean {
  // "Overdue" means due by more than a full day, not merely due.
  return daysUntilDue(state, now) < -1;
}
