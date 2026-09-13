import type { Exercise } from '@/schemas/exerciseSchema';
import { xpMultiplier } from '@/features/srs/learningMode';

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
 * There is no second try: a wrong answer costs the same as a right one would have earned.
 * A revealed answer earns nothing — asking to see the answer is not guessing.
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
  readonly revealed: boolean;
}

/**
 * XP for a single answered exercise: the type's award if right, the same amount deducted
 * if wrong. Revealed answers score zero even when the learner then picks the right option.
 *
 * Scaled by the learning mode, so that mastering a word is worth the same XP whichever
 * mode the learner is in: ultra fast asks for two clean answers instead of four, and pays
 * double per answer to match. Without the scale the faster modes would quietly halve the
 * XP earned for learning the same vocabulary.
 *
 * Baked in at award time — total XP is derived by summing the stored `xpAwarded` — which
 * is sound because switching mode resets all history.
 */
export function exerciseXp(input: ExerciseXpInput): number {
  if (input.revealed) return 0;

  const base = Math.round((XP_BY_TYPE[input.exerciseType] ?? 0) * xpMultiplier());
  return input.correct ? base : -base;
}

/**
 * Learner levels (§23).
 *
 * Each level costs 25% more XP than the one before it, so reaching level 2 is 25% easier
 * than reaching level 3, and so on. `LEVEL_XP_BASE` is tuned so that level 20 lands at 90%
 * of the corpus: the last tenth is the long tail of rare B1 words, and a learner who never
 * finishes it should still top out. Levels past 20 keep the same curve — streak and
 * daily-goal bonuses carry the learner beyond.
 *
 * The corpus (3,444 entries: A1 799, A2 690, B1 1,955) is worth 126,684 XP once fully mastered:
 *
 *   3,444 entries × 36 XP   123,984   the four-step ladder (5+5+8+8) plus 10 for mastery
 *   12 bands × 100            1,200
 *   3 CEFR levels × 500       1,500
 *
 * 90% of that is 114,016, and `xpRequiredForLevel(20)` is 113,799 — just under, so the level
 * is actually reached there rather than one word short of it.
 *
 * The ladder is what sets the per-word figure, so shortening or lengthening it moves the
 * total and the base has to move with it — as does growing the corpus. `gamification.test.ts`
 * recomputes the whole sum from the manifest and fails if the base drifts out of step.
 *
 * Each flattening of the curve — 50% to 30% to today's 25% — makes the late levels cheaper
 * and so forces the base up: the same corpus total has to be spread over 19 steps that
 * grow more slowly, which the early levels pay for.
 *
 * Retune by moving `LEVEL_XP_BASE` alone; the curve's shape is `LEVEL_XP_GROWTH`.
 */
const LEVEL_XP_GROWTH = 1.25;
const LEVEL_XP_BASE = 416;

/** Share of the corpus that reaching `LEVEL_XP_TARGET` represents. */
export const CORPUS_MASTERY_TARGET = 0.9;

/** The level a learner reaches at `CORPUS_MASTERY_TARGET` of the corpus. */
export const LEVEL_XP_TARGET = 20;

/** Cumulative XP needed to *be* this level. Level 1 starts at 0. */
export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round((LEVEL_XP_BASE * (LEVEL_XP_GROWTH ** (level - 1) - 1)) / (LEVEL_XP_GROWTH - 1));
}

export function levelForXp(totalXp: number): number {
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

/**
 * Highest `public/img/avatar/level-N.webp` that exists. The level number is drawn into the
 * artwork, so a learner above this keeps the top card rather than being shown a wrong one.
 * The cards are 640×640 WebP: the largest display is 320 CSS px at 2× density.
 */
export const MAX_AVATAR_LEVEL = 20;

/** Intrinsic size of every rank card, for `width`/`height` attributes. */
export const AVATAR_SIZE = 640;

/** Word Wizard rank card for a level. */
export function avatarSrc(level: number): string {
  return `/img/avatar/level-${Math.min(Math.max(1, level), MAX_AVATAR_LEVEL)}.webp`;
}

export function levelProgress(totalXp: number): LevelProgress {
  const level = levelForXp(totalXp);
  const floor = xpRequiredForLevel(level);
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
