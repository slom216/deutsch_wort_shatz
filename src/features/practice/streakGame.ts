import type { MultipleChoiceExercise } from '@/schemas/exerciseSchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import { generateMultipleChoice, type MultipleChoiceVariant } from './generators/multipleChoice';
import type { Random } from './random';

/**
 * Practice learned skills: the rules of the streak game.
 *
 * The game runs on words the learner has already mastered — score 4 in the SRS — and asks
 * them only in the two formats the score ladder uses at 0 and 1 (`SCORE_FORMATS` in
 * `session/endless.ts`): multiple choice, in one direction or the other. Nothing here is
 * written back to the SRS, so a slip in the game never demotes a word out of the pool the
 * game draws from.
 */

/** Seconds on the clock when the game starts. */
export const START_SECONDS = 20;
/** Seconds a correct answer adds. */
export const BONUS_SECONDS = 2;
/** At or below this, the countdown turns alarming. */
export const ALARM_SECONDS = 5;

/**
 * Fewest mastered words the game will run on: one question's worth of options.
 *
 * Distractors are drawn from the mastered set itself — a distractor the learner has never
 * met is a free elimination — so the pool size is also the option count.
 */
export const MIN_MASTERED = 6;

/**
 * Correct answers between one level and the next: ten for the first, then twenty, then
 * thirty. So the thresholds are 10, 30, 60, 100, 150, 210 — and level 7 lands at 210, which
 * is where `avatarSrc` runs out of rank cards anyway.
 */
const LEVEL_STEP = 10;

/** Correct answers needed to *be* this level. Level 1 starts at 0. */
export function levelThreshold(level: number): number {
  if (level <= 1) return 0;
  return (LEVEL_STEP * level * (level - 1)) / 2;
}

/** The level a streak of this length has reached. Mirrors `levelForXp` in `gamification/xp.ts`. */
export function streakLevel(correct: number): number {
  let level = 1;
  while (levelThreshold(level + 1) <= correct) level += 1;
  return level;
}

/** The two directions a question can be asked in, per `SCORE_FORMATS[0]` and `[1]`. */
const DIRECTIONS: readonly MultipleChoiceVariant[] = ['germanToEnglish', 'englishToGerman'];

/**
 * A question for this word, in a direction chosen at random.
 *
 * Null when the word cannot make one — an entry with no English gloss, or one whose gloss
 * finds no plausible distractors in a small pool. The caller moves on to the next word.
 */
export function questionFor(
  entry: VocabularyEntry,
  pool: readonly VocabularyEntry[],
  random: Random,
  id: string,
): MultipleChoiceExercise | null {
  const variant = DIRECTIONS[random.int(DIRECTIONS.length)] as MultipleChoiceVariant;
  return generateMultipleChoice({ entry, pool, random, id }, variant);
}

const BEST_STREAK_KEY = 'practice-best-streak';

/** The longest streak so far, or 0. Survives a reload; it is a scoreboard, not progress. */
export function loadBestStreak(): number {
  const stored = Number(localStorage.getItem(BEST_STREAK_KEY));
  return Number.isFinite(stored) && stored > 0 ? Math.trunc(stored) : 0;
}

/** Records a streak if it beats the stored best, and reports whether it did. */
export function saveBestStreak(streak: number): boolean {
  if (streak <= loadBestStreak()) return false;
  localStorage.setItem(BEST_STREAK_KEY, String(streak));
  return true;
}
