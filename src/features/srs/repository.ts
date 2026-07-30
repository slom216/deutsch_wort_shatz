import { db, type VocabularyLearningDatabase } from '@/features/persistence/db';
import type { EntryProgress, ExerciseHistory, Grade } from '@/schemas/progressSchema';
import type { Exercise } from '@/schemas/exerciseSchema';
import { computeDifficulty, difficultyInputsFrom } from './difficulty';
import { expectedResponseMs, gradeAttempt, isSuccess, type AttemptOutcome } from './grading';
import { evaluateMastery, masteryEvidenceFrom } from './mastery';
import { applyReview, createInitialSrsState } from './scheduler';

/**
 * Persistence for SRS state (§24).
 *
 * `entryProgress` is the durable record for each entry the learner has met. Everything
 * the scheduler needs is stored, so the due queue is rebuilt from IndexedDB on load and
 * survives a refresh. Progress is only ever updated in place, never deleted (§24).
 */

export async function loadAllProgress(
  database: VocabularyLearningDatabase = db,
): Promise<EntryProgress[]> {
  return database.entryProgress.toArray();
}

export async function loadProgress(
  entryId: string,
  database: VocabularyLearningDatabase = db,
): Promise<EntryProgress | undefined> {
  return database.entryProgress.get(entryId);
}

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
  };
}

export async function introduceEntry(
  entryId: string,
  now: Date = new Date(),
  database: VocabularyLearningDatabase = db,
): Promise<EntryProgress> {
  const existing = await database.entryProgress.get(entryId);
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
 */
export async function recordReview(
  input: RecordReviewInput,
  database: VocabularyLearningDatabase = db,
): Promise<RecordReviewResult> {
  const now = input.reviewedAt ?? new Date();
  const existing =
    (await database.entryProgress.get(input.entryId)) ?? createProgress(input.entryId, now);

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
  const withCounters: EntryProgress = {
    ...existing,
    totalAttempts,
    totalCorrect: existing.totalCorrect + (input.correct && !input.revealed ? 1 : 0),
    firstAttemptCorrect:
      existing.firstAttemptCorrect +
      (input.correct && input.attempts === 1 && !input.revealed ? 1 : 0),
    hintsUsed: existing.hintsUsed + (input.hintUsed ? 1 : 0),
    errorCounts,
  };

  /* ---- difficulty, then scheduling ---- */
  const responseTimeRatio = input.responseMs / expectedResponseMs(input.exercise.type);
  const difficulty = computeDifficulty(difficultyInputsFrom(withCounters, responseTimeRatio));

  const srs = applyReview(withCounters.srs, {
    grade,
    difficulty,
    isProduction: input.exercise.isProduction,
    reviewedAt: now,
  });

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
  const check = evaluateMastery(updated.srs, {
    ...evidence,
    // Include the review just recorded, which is not yet in stored history.
    successfulReviews: evidence.successfulReviews + (isSuccess(grade) ? 1 : 0),
    successfulProductionReviews:
      evidence.successfulProductionReviews +
      (isSuccess(grade) && input.exercise.isProduction ? 1 : 0),
    typedFirstAttemptCorrect:
      evidence.typedFirstAttemptCorrect ||
      (input.correct &&
        input.attempts === 1 &&
        !input.revealed &&
        input.exercise.requiresTypedInput),
    recentGrades: [...evidence.recentGrades, grade],
  });

  if (check.mastered && updated.srs.status === 'review') {
    updated = { ...updated, srs: { ...updated.srs, status: 'mastered' } };
  }

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
