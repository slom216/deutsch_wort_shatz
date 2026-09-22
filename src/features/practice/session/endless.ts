import { masteryTarget } from '@/features/srs/learningMode';
import type { Random } from '../random';

/**
 * In-session spacing for continuous mode.
 *
 * The SRS decides when a word comes back on a *later day* (§20). This is the other half:
 * how soon it comes back within one endless stream, measured in exercises rather than
 * days. A word answered wrong is worth seeing again in the same sitting; a word answered
 * right is worth confirming once the learner has had time to forget it.
 *
 * A word whose running quiz score has reached the mode's mastery target drops out of the
 * stream when answered correctly — it has been answered cleanly as often as the learning
 * mode asks for, and the scheduler is a better judge of when it should reappear than a
 * fixed offset is.
 */

/** Exercises to wait before a word with a score below `LOW_SCORE` returns, right or wrong. */
export const REQUEUE_WHILE_NEW: readonly [number, number] = [5, 10];
/** Scores below this are words still being met, which need a quick first repeat. */
export const LOW_SCORE = 2;
/** Exercises to wait before a wrongly answered word returns. */
export const REQUEUE_AFTER_WRONG: readonly [number, number] = [25, 50];
/** Exercises to wait before a correctly answered, not-yet-learned word returns. */
export const REQUEUE_AFTER_CORRECT: readonly [number, number] = [50, 100];

export interface RequeueInput {
  readonly correct: boolean;
  /** The entry's running quiz score after this answer, 0–`masteryTarget()`. */
  readonly masteryScore: number;
  /** Mastery target to judge against. Defaults to the learner's current mode. */
  readonly target?: number;
}

/**
 * How many exercises from now this entry should reappear, or `null` to let the SRS take
 * over. Both bounds are inclusive.
 */
export function requeueOffset(input: RequeueInput, random: Random): number | null {
  if (input.correct && input.masteryScore >= (input.target ?? masteryTarget())) return null;

  // A brand-new word waiting 25–100 exercises meant a new learner met dozens of words
  // before any repeat; known words keep the longer gaps.
  const [from, to] =
    input.masteryScore < LOW_SCORE
      ? REQUEUE_WHILE_NEW
      : input.correct
        ? REQUEUE_AFTER_CORRECT
        : REQUEUE_AFTER_WRONG;
  return from + random.int(to - from + 1);
}

/**
 * The exercise format a word gets, by its running quiz score (`masteryScore`).
 *
 * The ladder walks from recognition to production, alternating direction so neither
 * German→English nor English→German is ever practised alone:
 *
 *   0  German shown, choose the English meaning
 *   1  English shown, choose the German word
 *   2  English shown, type the German word
 *   3  German shown, type the English meaning
 *
 * Reaching the mode's target is mastery: the word leaves the stream and the SRS schedules
 * it. Fast drops the last rung but still demands one typed production. Ultra fast is
 * recognition only: the first two rungs, six choices each way, no typing.
 */
export interface ExerciseFormat {
  readonly type: 'multipleChoice' | 'typedTranslation';
  readonly variant: 'germanToEnglish' | 'englishToGerman';
}

const MC_DE_EN: ExerciseFormat = { type: 'multipleChoice', variant: 'germanToEnglish' };
const MC_EN_DE: ExerciseFormat = { type: 'multipleChoice', variant: 'englishToGerman' };
const TYPED_EN_DE: ExerciseFormat = { type: 'typedTranslation', variant: 'englishToGerman' };
const TYPED_DE_EN: ExerciseFormat = { type: 'typedTranslation', variant: 'germanToEnglish' };

export const SCORE_FORMATS: readonly ExerciseFormat[] = [
  MC_DE_EN,
  MC_EN_DE,
  TYPED_EN_DE,
  TYPED_DE_EN,
];

/** The ladder for a mastery target: one rung per score below it. */
export function ladderForTarget(target: number = masteryTarget()): readonly ExerciseFormat[] {
  if (target <= 2) return [MC_DE_EN, MC_EN_DE];
  if (target === 3) return [MC_DE_EN, MC_EN_DE, TYPED_EN_DE];
  return SCORE_FORMATS;
}

/** The format for a score, clamped to the ladder at both ends. */
export function formatForScore(score: number, target: number = masteryTarget()): ExerciseFormat {
  const ladder = ladderForTarget(target);
  const index = Math.min(Math.max(0, Math.trunc(score)), ladder.length - 1);
  return ladder[index] as ExerciseFormat;
}

/**
 * URL for a fresh stream. The id is in the path, so a refresh mid-stream resumes the same
 * session rather than starting a second one.
 */
export function continuousSessionPath(now: number = Date.now()): string {
  return `/continuous/stream-${now.toString(36)}`;
}

/** An entry waiting to come round again, at a stream position. */
export interface Requeued {
  readonly entryId: string;
  readonly at: number;
}

/**
 * The entry whose turn has come, earliest first, with the rest of the queue.
 *
 * Kept as a plain array and scanned linearly: the queue holds the words in flight, which
 * is bounded by the longest offset — a hundred or so, never thousands.
 */
export function takeReady(
  queue: readonly Requeued[],
  position: number,
): { readonly entryId: string; readonly rest: Requeued[] } | null {
  let bestIndex = -1;
  for (let index = 0; index < queue.length; index += 1) {
    const candidate = queue[index] as Requeued;
    if (candidate.at > position) continue;
    const best = queue[bestIndex];
    if (!best || candidate.at < best.at) bestIndex = index;
  }

  const ready = queue[bestIndex];
  if (!ready) return null;

  return {
    entryId: ready.entryId,
    rest: queue.filter((_, index) => index !== bestIndex),
  };
}

/**
 * The queue with `entryId` waiting at `at`, replacing any turn it was already given.
 *
 * Appending instead would leave a word in the queue twice, because the due queue can serve
 * it while an older turn is still pending: requeued for 70, served from the due list at 62,
 * requeued again — and from then on it comes round twice every cycle.
 */
export function requeue(queue: readonly Requeued[], entryId: string, at: number): Requeued[] {
  return [...queue.filter((item) => item.entryId !== entryId), { entryId, at }];
}
