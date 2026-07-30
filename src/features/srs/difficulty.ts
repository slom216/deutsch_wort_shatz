import type { EntryProgress } from '@/schemas/progressSchema';
import type { ErrorCategory } from '@/schemas/exerciseSchema';

/**
 * Automatic difficulty model (§21).
 *
 *   difficulty = 0.30 * errorRate
 *              + 0.20 * normalizedResponseTime
 *              + 0.15 * lapseRate
 *              + 0.15 * spellingErrorRate
 *              + 0.10 * grammarPropertyErrorRate
 *              + 0.10 * hintUsageRate
 *
 * Clamped to 0–1. The learner never sets this; it is derived from stored history.
 */

export const DIFFICULTY_WEIGHTS = {
  errorRate: 0.3,
  responseTime: 0.2,
  lapseRate: 0.15,
  spellingErrorRate: 0.15,
  grammarPropertyErrorRate: 0.1,
  hintUsageRate: 0.1,
} as const;

/** Spelling-shaped mistakes (§16). */
const SPELLING_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  'wrongCapitalization',
  'missingUmlaut',
  'ssInsteadOfEszett',
  'punctuationError',
]);

/** Mistakes about a grammatical property of the word rather than its spelling. */
const GRAMMAR_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  'missingArticle',
  'wrongArticle',
  'wrongPlural',
  'wrongConjugation',
]);

export function isSpellingError(category: string): boolean {
  return SPELLING_CATEGORIES.has(category as ErrorCategory);
}

export function isGrammarPropertyError(category: string): boolean {
  return GRAMMAR_CATEGORIES.has(category as ErrorCategory);
}

export interface DifficultyInputs {
  readonly attempts: number;
  readonly errors: number;
  readonly lapses: number;
  readonly repetitions: number;
  readonly spellingErrors: number;
  readonly grammarErrors: number;
  readonly hintsUsed: number;
  /** Mean response time relative to the expected time for the exercise; 1 = as expected. */
  readonly responseTimeRatio: number;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function rate(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : clamp01(numerator / denominator);
}

export function computeDifficulty(inputs: DifficultyInputs): number {
  const {
    attempts,
    errors,
    lapses,
    repetitions,
    spellingErrors,
    grammarErrors,
    hintsUsed,
    responseTimeRatio,
  } = inputs;

  // A word with no history yet is treated as mid-difficulty rather than easy, so the
  // scheduler does not hand out long intervals before there is evidence.
  if (attempts === 0) return 0.5;

  // Ratio 1.0 (as expected) maps to 0.5; twice as slow saturates at 1.
  const normalizedResponseTime = clamp01((responseTimeRatio - 0.5) / 1.5);

  const difficulty =
    DIFFICULTY_WEIGHTS.errorRate * rate(errors, attempts) +
    DIFFICULTY_WEIGHTS.responseTime * normalizedResponseTime +
    DIFFICULTY_WEIGHTS.lapseRate * rate(lapses, Math.max(repetitions, 1)) +
    DIFFICULTY_WEIGHTS.spellingErrorRate * rate(spellingErrors, attempts) +
    DIFFICULTY_WEIGHTS.grammarPropertyErrorRate * rate(grammarErrors, attempts) +
    DIFFICULTY_WEIGHTS.hintUsageRate * rate(hintsUsed, attempts);

  return clamp01(difficulty);
}

/** Derives the difficulty inputs from a stored progress record. */
export function difficultyInputsFrom(
  progress: EntryProgress,
  responseTimeRatio: number,
): DifficultyInputs {
  let spellingErrors = 0;
  let grammarErrors = 0;
  for (const [category, count] of Object.entries(progress.errorCounts)) {
    if (isSpellingError(category)) spellingErrors += count;
    if (isGrammarPropertyError(category)) grammarErrors += count;
  }

  return {
    attempts: progress.totalAttempts,
    errors: progress.totalAttempts - progress.totalCorrect,
    lapses: progress.srs.lapses,
    repetitions: progress.srs.repetitions,
    spellingErrors,
    grammarErrors,
    hintsUsed: progress.hintsUsed,
    responseTimeRatio,
  };
}

export type DifficultyBand = 'low' | 'medium' | 'high';

/** Difficulty bands drive exercise adaptation (§21). */
export function difficultyBand(difficulty: number): DifficultyBand {
  if (difficulty < 0.35) return 'low';
  if (difficulty < 0.65) return 'medium';
  return 'high';
}
