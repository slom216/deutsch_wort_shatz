import type { Exercise } from '@/schemas/exerciseSchema';

/**
 * XP rules (§23).
 *
 *   Correct multiple choice     5
 *   Correct typed answer        8
 *   Correct listening answer    7
 *   Successful speaking answer 10
 *   Perfect 20-exercise session +30
 *   Complete daily goal        +25
 *   Master an entry            +10
 *   Complete frequency band   +100
 *   Complete CEFR level       +500
 *
 * A second-attempt answer earns 50%; a revealed answer earns nothing.
 */

export const XP_BY_TYPE: Record<Exercise['type'], number> = {
  multipleChoice: 5,
  matching: 5,
  wordOrdering: 8,
  typedTranslation: 8,
  sentenceCompletion: 8,
  listening: 7,
  speaking: 10,
};

export const XP_PERFECT_SESSION = 30;
export const XP_DAILY_GOAL = 25;
export const XP_MASTER_ENTRY = 10;
export const XP_COMPLETE_BAND = 100;
export const XP_COMPLETE_LEVEL = 500;

/** A "perfect session" bonus requires a session of at least this many exercises (§23). */
export const PERFECT_SESSION_MIN_EXERCISES = 20;

export interface ExerciseXpInput {
  readonly exerciseType: Exercise['type'];
  readonly correct: boolean;
  readonly attempts: number;
  readonly revealed: boolean;
}

/**
 * XP for a single answered exercise.
 *
 * Revealed answers score zero even when the learner then picks the right option, and a
 * correct second attempt is halved — both are Phase 7 acceptance criteria.
 */
export function exerciseXp(input: ExerciseXpInput): number {
  if (input.revealed || !input.correct) return 0;

  const base = XP_BY_TYPE[input.exerciseType] ?? 0;
  if (input.attempts <= 1) return base;
  // Rounded down so a halved award can never exceed the full one.
  return Math.floor(base * 0.5);
}

/**
 * Learner level from total XP: `xpRequiredForLevel(level) = 100 * level * level` (§23).
 * Level 1 starts at 0 XP; level 2 needs 400, level 3 needs 900, and so on.
 */
export function xpRequiredForLevel(level: number): number {
  return 100 * level * level;
}

export function levelForXp(totalXp: number): number {
  if (totalXp < xpRequiredForLevel(2)) return 1;
  let level = 1;
  while (xpRequiredForLevel(level + 1) <= totalXp) level += 1;
  return level;
}

export interface LevelProgress {
  readonly level: number;
  readonly xpIntoLevel: number;
  readonly xpForNextLevel: number;
  /** 0–1 progress towards the next level. */
  readonly fraction: number;
}

export function levelProgress(totalXp: number): LevelProgress {
  const level = levelForXp(totalXp);
  const floor = level === 1 ? 0 : xpRequiredForLevel(level);
  const ceiling = xpRequiredForLevel(level + 1);
  const span = Math.max(1, ceiling - floor);
  const into = Math.max(0, totalXp - floor);
  return {
    level,
    xpIntoLevel: into,
    xpForNextLevel: ceiling - totalXp,
    fraction: Math.min(1, into / span),
  };
}
