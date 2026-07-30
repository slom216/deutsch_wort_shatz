import type { Grade } from '@/schemas/progressSchema';
import type { Exercise } from '@/schemas/exerciseSchema';

/**
 * Automatic grading (§20).
 *
 * The learner is never asked how well they knew a word. The grade is derived entirely
 * from what happened during the exercise:
 *
 *   0 Failed    — final answer incorrect, answer revealed, or exercise abandoned
 *   1 Difficult — correct on a second attempt, after a hint, or significantly slow
 *   2 Correct   — correct first time, normal speed, no hint
 *   3 Strong    — correct first time, substantially faster than expected, on an active
 *                 production exercise, no hint
 */

export interface AttemptOutcome {
  readonly correct: boolean;
  readonly attempts: number;
  readonly revealed: boolean;
  readonly hintUsed: boolean;
  readonly abandoned?: boolean;
  readonly responseMs: number;
  readonly isProduction: boolean;
  readonly requiresTypedInput: boolean;
}

/**
 * Expected response time per exercise type, in milliseconds. Used to decide whether an
 * answer was "substantially faster" or "significantly slow" (§20). Typed and spoken
 * formats get more time because the learner has to produce, not just recognise.
 */
const EXPECTED_MS: Record<Exercise['type'], number> = {
  multipleChoice: 6_000,
  listening: 9_000,
  matching: 30_000,
  typedTranslation: 12_000,
  sentenceCompletion: 14_000,
  wordOrdering: 20_000,
  speaking: 12_000,
};

/** Faster than this fraction of the expected time counts as "substantially faster". */
const STRONG_SPEED_RATIO = 0.5;
/** Slower than this multiple of the expected time counts as "significantly slow". */
const SLOW_SPEED_RATIO = 2.5;

export function expectedResponseMs(type: Exercise['type']): number {
  return EXPECTED_MS[type];
}

export function gradeAttempt(outcome: AttemptOutcome, type: Exercise['type']): Grade {
  // Failed: incorrect, revealed, or abandoned — regardless of anything else.
  if (outcome.abandoned || outcome.revealed || !outcome.correct) return 0;

  const expected = expectedResponseMs(type);

  // Difficult: needed more than one attempt, needed a hint, or was very slow.
  if (outcome.attempts > 1 || outcome.hintUsed) return 1;
  if (outcome.responseMs > expected * SLOW_SPEED_RATIO) return 1;

  // Strong: first attempt, no hint, clearly fast, and genuine production.
  if (outcome.isProduction && outcome.responseMs <= expected * STRONG_SPEED_RATIO) return 3;

  return 2;
}

/** True when a grade counts as a successful review for mastery purposes (§22). */
export function isSuccess(grade: Grade): boolean {
  return grade >= 2;
}

/** True when a grade represents a lapse — a previously known word answered wrong. */
export function isLapse(grade: Grade): boolean {
  return grade === 0;
}
