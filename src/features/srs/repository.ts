import { db, type VocabularyLearningDatabase } from '@/features/persistence/db';
import type { EntryProgress, ExerciseHistory, Grade } from '@/schemas/progressSchema';
import type { Exercise } from '@/schemas/exerciseSchema';
import { computeDifficulty, difficultyInputsFrom } from './difficulty';
import { expectedResponseMs, gradeAttempt, isSuccess, type AttemptOutcome } from './grading';
import { evaluateMastery, masteryEvidenceFrom, withMasteryStatus } from './mastery';
import { applyReview, createInitialSrsState, isDue } from './scheduler';
import { masteryTarget } from './learningMode';
import { loadSkippedIds } from './skipped';
import { loadSearchIndex } from '@/content/vocabulary/registry';

/**
 * Persistence for SRS state (§24).
 *
 * `entryProgress` is the durable record for each entry the learner has met. Everything
 * the scheduler needs is stored, so the due queue is rebuilt from IndexedDB on load and
 * survives a refresh. Progress is only ever updated in place, never deleted (§24).
 */

/**
 * True when a stored row has the fields every read path dereferences.
 *
 * A cheap structural guard rather than the full Zod schema: rows written by older versions
 * may predate optional counters, and one partial write (`srs: null`) must not take down
 * every screen that lists progress. Invalid rows are left in place for Data → Repair.
 */
export function isReadableProgress(row: unknown): row is EntryProgress {
  const record = row as Partial<EntryProgress> | null;
  const srs = record?.srs;
  return (
    typeof record?.entryId === 'string' &&
    typeof srs === 'object' &&
    srs !== null &&
    typeof srs.status === 'string' &&
    typeof srs.dueAt === 'string' &&
    !Number.isNaN(Date.parse(srs.dueAt)) &&
    Number.isFinite(srs.intervalDays) &&
    Number.isFinite(srs.easeFactor) &&
    Number.isFinite(srs.difficulty) &&
    typeof srs.exercisePerformance === 'object' &&
    srs.exercisePerformance !== null &&
    Number.isFinite(record.totalAttempts) &&
    typeof record.errorCounts === 'object' &&
    record.errorCounts !== null
  );
}

export async function loadAllProgress(
  database: VocabularyLearningDatabase = db,
): Promise<EntryProgress[]> {
  return (await database.entryProgress.toArray()).filter(isReadableProgress);
}

export async function loadProgress(
  entryId: string,
  database: VocabularyLearningDatabase = db,
): Promise<EntryProgress | undefined> {
  const row = await database.entryProgress.get(entryId);
  return isReadableProgress(row) ? row : undefined;
}

export interface QueueableProgress {
  /** Readable progress for entries that exist in the vocabulary. */
  readonly known: EntryProgress[];
  /** `known` minus skipped words: what due counts and review queues may serve. */
  readonly queueable: EntryProgress[];
  /** Number of entries in the vocabulary. */
  readonly totalEntries: number;
}

/**
 * The one read path for anything that counts or serves due words.
 *
 * Progress for an id the vocabulary no longer has would otherwise be due for ever and
 * produce empty review sessions, and a skipped word must not be counted as due on one
 * screen and left out of the session on the next.
 */
export async function loadQueueableProgress(
  database: VocabularyLearningDatabase = db,
): Promise<QueueableProgress> {
  const [stored, index, skipped] = await Promise.all([
    loadAllProgress(database),
    loadSearchIndex(),
    loadSkippedIds(database),
  ]);
  const knownIds = new Set(index.map((record) => record.id));
  const known = stored.filter((progress) => knownIds.has(progress.entryId));
  return {
    known,
    queueable: known.filter((progress) => !skipped.has(progress.entryId)),
    totalEntries: index.length,
  };
}

/**
 * Quiz score at which an entry leaves the continuous stream, for the learner's current mode.
 *
 * Answering correctly first time is +1, getting it wrong is −1, and the score never goes
 * below zero. Normal asks for four, fast for three, ultra fast for two. The score does not
 * make a word mastered: only the §22 evidence does.
 *
 * Re-exported here because this module is where the score itself is written; the table
 * lives in `learningMode.ts`.
 */
export { masteryTarget } from './learningMode';

/** Creates the progress record for a newly introduced entry (§18). */
export function createProgress(entryId: string, now: Date): EntryProgress {
  return {
    entryId,
    introducedAt: now.toISOString(),
    srs: createInitialSrsState(entryId, now),
    totalAttempts: 0,
    totalCorrect: 0,
    firstAttemptCorrect: 0,
    hintsUsed: 0,
    errorCounts: {},
    masteryScore: 0,
    totalResponseMs: 0,
  };
}

/**
 * The score after one answer: +1 clean, −1 wrong, floored at 0 and capped at the target.
 *
 * The cap is what makes the target mean something: a word mastered in the stream can still
 * be answered from the review queue, and without it the score would climb past the target
 * and the exercise header would read "score 6/4".
 *
 * Getting there in the end holds the score rather than dropping it. A second attempt earns
 * no progress — the word was not known — but it must not cost a rung either: a learner who
 * usually needs two tries at the typed formats could otherwise never reach the target, and
 * the word would stay in the stream for ever.
 */
export function nextMasteryScore(
  current: number,
  outcome: { correct: boolean; attempts: number; revealed: boolean },
  target: number = masteryTarget(),
): number {
  if (outcome.correct && outcome.attempts === 1 && !outcome.revealed) {
    return Math.min(target, current + 1);
  }
  if (outcome.correct && !outcome.revealed) return Math.min(target, current);
  return Math.max(0, current - 1);
}

export async function introduceEntry(
  entryId: string,
  now: Date = new Date(),
  database: VocabularyLearningDatabase = db,
): Promise<EntryProgress> {
  const existing = await loadProgress(entryId, database);
  if (existing) return existing;
  const created = createProgress(entryId, now);
  await database.entryProgress.put(created);
  return created;
}

export interface RecordReviewInput {
  readonly entryId: string;
  readonly exercise: Pick<Exercise, 'type' | 'isProduction' | 'requiresTypedInput'>;
  readonly correct: boolean;
  readonly attempts: number;
  readonly revealed: boolean;
  readonly hintUsed: boolean;
  readonly responseMs: number;
  readonly errorCategories: readonly string[];
  readonly reviewedAt?: Date;
  /**
   * The learner marked the answer themselves (speaking: "I said it correctly"). The answer
   * is recorded, but a success earns no quiz score and does not advance the schedule.
   */
  readonly selfAssessed?: boolean;
}

export interface RecordReviewResult {
  readonly progress: EntryProgress;
  readonly grade: Grade;
  readonly mastered: boolean;
}

/**
 * Records one answered exercise: grades it automatically, recomputes difficulty,
 * reschedules the entry and re-evaluates mastery. This is the single write path for SRS
 * state, so grading rules cannot drift between callers.
 *
 * Scheduling advances at most once per scheduled review (§20): a success on a word that is
 * not due yet — including one already rescheduled earlier in this sitting — updates the
 * counters and difficulty but leaves the learning step and interval alone. A failure
 * always counts.
 *
 * Only Dexie work happens here (reads `entryProgress` and `exerciseHistory`, writes
 * `entryProgress`), so callers may wrap it in an outer read-write transaction.
 */
export async function recordReview(
  input: RecordReviewInput,
  database: VocabularyLearningDatabase = db,
): Promise<RecordReviewResult> {
  const now = input.reviewedAt ?? new Date();
  // An unreadable row is replaced rather than crashing the session on it.
  const existing =
    (await loadProgress(input.entryId, database)) ?? createProgress(input.entryId, now);

  const outcome: AttemptOutcome = {
    correct: input.correct,
    attempts: input.attempts,
    revealed: input.revealed,
    hintUsed: input.hintUsed,
    responseMs: input.responseMs,
    isProduction: input.exercise.isProduction,
    requiresTypedInput: input.exercise.requiresTypedInput,
  };

  const grade = gradeAttempt(outcome, input.exercise.type);

  /* ---- accumulate raw counters ---- */
  const errorCounts = { ...existing.errorCounts };
  for (const category of input.errorCategories) {
    errorCounts[category] = (errorCounts[category] ?? 0) + 1;
  }

  const totalAttempts = existing.totalAttempts + 1;
  const totalResponseMs = (existing.totalResponseMs ?? 0) + input.responseMs;
  const withCounters: EntryProgress = {
    ...existing,
    totalAttempts,
    totalResponseMs,
    totalCorrect: existing.totalCorrect + (input.correct && !input.revealed ? 1 : 0),
    firstAttemptCorrect:
      existing.firstAttemptCorrect +
      (input.correct && input.attempts === 1 && !input.revealed ? 1 : 0),
    hintsUsed: existing.hintsUsed + (input.hintUsed ? 1 : 0),
    errorCounts,
    masteryScore:
      input.selfAssessed && input.correct
        ? Math.min(masteryTarget(), existing.masteryScore ?? 0)
        : nextMasteryScore(existing.masteryScore ?? 0, input),
  };

  /* ---- difficulty, then scheduling ---- */
  // §21 wants the *mean* response time relative to expectation. Using this one answer
  // would let a single distracted attempt swing difficulty by up to +0.13, which is
  // enough to shorten every future interval and to disqualify the entry from mastery.
  const responseTimeRatio =
    totalResponseMs / totalAttempts / expectedResponseMs(input.exercise.type);
  const difficulty = computeDifficulty(difficultyInputsFrom(withCounters, responseTimeRatio));

  const advances =
    !isSuccess(grade) ||
    (!input.selfAssessed && (existing.srs.status === 'new' || isDue(existing.srs, now)));
  const srs = advances
    ? applyReview(withCounters.srs, {
        grade,
        difficulty,
        isProduction: input.exercise.isProduction,
        reviewedAt: now,
      })
    : { ...withCounters.srs, difficulty };

  /* ---- per-exercise-type performance, for the analytics screens ---- */
  const typeKey = input.exercise.type;
  const previous = srs.exercisePerformance[typeKey] ?? {
    attempts: 0,
    correct: 0,
    firstAttemptCorrect: 0,
    averageResponseMs: 0,
  };
  const nextAttempts = previous.attempts + 1;
  const exercisePerformance = {
    ...srs.exercisePerformance,
    [typeKey]: {
      attempts: nextAttempts,
      correct: previous.correct + (input.correct ? 1 : 0),
      firstAttemptCorrect:
        previous.firstAttemptCorrect + (input.correct && input.attempts === 1 ? 1 : 0),
      averageResponseMs:
        (previous.averageResponseMs * previous.attempts + input.responseMs) / nextAttempts,
    },
  };

  let updated: EntryProgress = {
    ...withCounters,
    srs: { ...srs, exercisePerformance },
  };

  /* ---- mastery (§22) ---- */
  const history = await database.exerciseHistory.where('entryId').equals(input.entryId).toArray();
  const evidence = masteryEvidenceFrom(history, (row) => isProductionType(row));
  const countsAsSuccess = isSuccess(grade) && !input.selfAssessed;
  const check = evaluateMastery(updated.srs, {
    ...evidence,
    // Include the review just recorded, which is not yet in stored history.
    successfulReviews: evidence.successfulReviews + (countsAsSuccess ? 1 : 0),
    successfulProductionReviews:
      evidence.successfulProductionReviews +
      (countsAsSuccess && input.exercise.isProduction ? 1 : 0),
    typedFirstAttemptCorrect:
      evidence.typedFirstAttemptCorrect ||
      (input.correct &&
        input.attempts === 1 &&
        !input.revealed &&
        input.exercise.requiresTypedInput),
    recentGrades: [...evidence.recentGrades, grade],
  });

  // §22 is the only route to mastered. The quiz score drives the continuous stream's
  // formats; letting it master a word too made "mastered" reachable within a day.
  updated = { ...updated, srs: withMasteryStatus(updated, check) };

  await database.entryProgress.put(updated);
  return { progress: updated, grade, mastered: updated.srs.status === 'mastered' };
}

function isProductionType(row: ExerciseHistory): boolean {
  return (
    row.exerciseType === 'typedTranslation' ||
    row.exerciseType === 'sentenceCompletion' ||
    row.exerciseType === 'wordOrdering' ||
    row.exerciseType === 'speaking'
  );
}
