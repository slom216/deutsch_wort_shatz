import type { MultipleChoiceExercise } from '@/schemas/exerciseSchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import {
  generateMultipleChoice,
  OPTION_COUNT,
  type MultipleChoiceVariant,
} from './generators/multipleChoice';
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
export const BONUS_SECONDS = 3;
/** At or below this, the countdown turns alarming. */
export const ALARM_SECONDS = 5;
/** Seconds of "get ready" between pressing start and the first question. */
export const READY_SECONDS = 3;

/** The clock as mm:ss. Negative time reads as zero; the run is over either way. */
export function formatClock(seconds: number): string {
  const left = Math.max(0, Math.trunc(seconds));
  const minutes = Math.floor(left / 60);
  return `${String(minutes).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
}

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
 * How many wrong options a run shows. The question is always built at full width and then
 * trimmed, so an easier level is the same question with fewer things to eliminate — the
 * near miss, when one was drawn, is as likely to survive the cut as any other distractor.
 */
export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', wrong: 2 },
  { id: 'medium', label: 'Medium', wrong: 3 },
  { id: 'hard', label: 'Hard', wrong: 4 },
  { id: 'master', label: 'Word master', wrong: OPTION_COUNT - 1 },
] as const;

export type Difficulty = (typeof DIFFICULTIES)[number]['id'];

/** Drops distractors at random until only `wrong` are left. Fewer than that is left alone. */
function trimOptions(
  question: MultipleChoiceExercise,
  wrong: number,
  random: Random,
): MultipleChoiceExercise {
  const correct = question.options[question.correctIndex] as string;
  const distractors = question.options.filter((_, index) => index !== question.correctIndex);
  if (distractors.length <= wrong) return question;

  const options = random.shuffle([correct, ...random.sample(distractors, wrong)]);
  return { ...question, options, correctIndex: options.indexOf(correct) };
}

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
  wrong: number = OPTION_COUNT - 1,
): MultipleChoiceExercise | null {
  const variant = DIRECTIONS[random.int(DIRECTIONS.length)] as MultipleChoiceVariant;
  const built = generateMultipleChoice({ entry, pool, random, id }, variant);
  return built && trimOptions(built, wrong, random);
}

const BEST_STREAK_KEY = 'practice-best-streak';

/** Word master keeps the original key, so a best set before the levels existed survives. */
function bestKey(difficulty: Difficulty): string {
  return difficulty === 'master' ? BEST_STREAK_KEY : `${BEST_STREAK_KEY}-${difficulty}`;
}

/** The longest streak so far, or 0. Survives a reload; it is a scoreboard, not progress. */
export function loadBestStreak(difficulty: Difficulty): number {
  const stored = Number(localStorage.getItem(bestKey(difficulty)));
  return Number.isFinite(stored) && stored > 0 ? Math.trunc(stored) : 0;
}

/** Records a streak if it beats the stored best for that level, and reports whether it did. */
export function saveBestStreak(difficulty: Difficulty, streak: number): boolean {
  if (streak <= loadBestStreak(difficulty)) return false;
  localStorage.setItem(bestKey(difficulty), String(streak));
  return true;
}
