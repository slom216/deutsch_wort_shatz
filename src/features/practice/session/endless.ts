import { MASTERY_SCORE_TARGET } from '@/features/srs/repository';
import type { Random } from '../random';

/**
 * In-session spacing for continuous mode.
 *
 * The SRS decides when a word comes back on a *later day* (§20). This is the other half:
 * how soon it comes back within one endless stream, measured in exercises rather than
 * days. A word answered wrong is worth seeing again in the same sitting; a word answered
 * right is worth confirming once the learner has had time to forget it.
 *
 * A word whose running quiz score has reached `MASTERY_SCORE_TARGET` drops out of the
 * stream when answered correctly — it has been answered cleanly five times, and the
 * scheduler is a better judge of when it should reappear than a fixed offset is.
 */

/** Exercises to wait before a wrongly answered word returns. */
export const REQUEUE_AFTER_WRONG: readonly [number, number] = [25, 50];
/** Exercises to wait before a correctly answered, not-yet-learned word returns. */
export const REQUEUE_AFTER_CORRECT: readonly [number, number] = [50, 100];

export interface RequeueInput {
  readonly correct: boolean;
  /** The entry's running quiz score after this answer, 0–`MASTERY_SCORE_TARGET`. */
  readonly masteryScore: number;
}

/**
 * How many exercises from now this entry should reappear, or `null` to let the SRS take
 * over. Both bounds are inclusive.
 */
export function requeueOffset(input: RequeueInput, random: Random): number | null {
  if (input.correct && input.masteryScore >= MASTERY_SCORE_TARGET) return null;

  const [from, to] = input.correct ? REQUEUE_AFTER_CORRECT : REQUEUE_AFTER_WRONG;
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
 *   2  German shown, choose the English meaning again
 *   3  English shown, type the German word
 *   4  German shown, type the English meaning
 *
 * A score of 5 is mastery: the word leaves the stream and the SRS schedules it.
 */
export interface ExerciseFormat {
  readonly type: 'multipleChoice' | 'typedTranslation';
  readonly variant: 'germanToEnglish' | 'englishToGerman';
}

export const SCORE_FORMATS: readonly ExerciseFormat[] = [
  { type: 'multipleChoice', variant: 'germanToEnglish' },
  { type: 'multipleChoice', variant: 'englishToGerman' },
  { type: 'multipleChoice', variant: 'germanToEnglish' },
  { type: 'typedTranslation', variant: 'englishToGerman' },
  { type: 'typedTranslation', variant: 'germanToEnglish' },
];

/** The format for a score, clamped to the ladder at both ends. */
export function formatForScore(score: number): ExerciseFormat {
  const index = Math.min(Math.max(0, Math.trunc(score)), SCORE_FORMATS.length - 1);
  return SCORE_FORMATS[index] as ExerciseFormat;
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
