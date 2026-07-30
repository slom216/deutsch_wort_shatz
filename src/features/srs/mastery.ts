import type { EntryProgress, ExerciseHistory, SrsState } from '@/schemas/progressSchema';
import { isSuccess } from './grading';

/**
 * Mastery (§22).
 *
 * An entry becomes mastered when all of:
 *   - at least 5 successful reviews;
 *   - at least 3 successful reviews were production exercises;
 *   - at least one typed answer was correct on the first attempt;
 *   - interval is at least 30 days;
 *   - difficulty is below 0.35;
 *   - no lapse occurred in the last 3 reviews.
 *
 * Mastered entries keep appearing at long intervals — mastery is a status, not an exit.
 */

export const MASTERY_MIN_SUCCESSES = 5;
export const MASTERY_MIN_PRODUCTION_SUCCESSES = 3;
export const MASTERY_MIN_INTERVAL_DAYS = 30;
export const MASTERY_MAX_DIFFICULTY = 0.35;
export const MASTERY_LAPSE_FREE_WINDOW = 3;

export interface MasteryEvidence {
  readonly successfulReviews: number;
  readonly successfulProductionReviews: number;
  readonly typedFirstAttemptCorrect: boolean;
  /** Grades of the most recent reviews, newest last. */
  readonly recentGrades: readonly number[];
}

export interface MasteryCheck {
  readonly mastered: boolean;
  /** Each criterion and whether it is met, for the progress screens. */
  readonly criteria: ReadonlyArray<{ label: string; met: boolean }>;
}

export function evaluateMastery(srs: SrsState, evidence: MasteryEvidence): MasteryCheck {
  const lapseWindow = evidence.recentGrades.slice(-MASTERY_LAPSE_FREE_WINDOW);
  const noRecentLapse = !lapseWindow.includes(0);

  const criteria = [
    {
      label: `${MASTERY_MIN_SUCCESSES} successful reviews`,
      met: evidence.successfulReviews >= MASTERY_MIN_SUCCESSES,
    },
    {
      label: `${MASTERY_MIN_PRODUCTION_SUCCESSES} successful production reviews`,
      met: evidence.successfulProductionReviews >= MASTERY_MIN_PRODUCTION_SUCCESSES,
    },
    {
      label: 'A typed answer correct on the first attempt',
      met: evidence.typedFirstAttemptCorrect,
    },
    {
      label: `Interval of at least ${MASTERY_MIN_INTERVAL_DAYS} days`,
      met: srs.intervalDays >= MASTERY_MIN_INTERVAL_DAYS,
    },
    {
      label: `Difficulty below ${MASTERY_MAX_DIFFICULTY}`,
      met: srs.difficulty < MASTERY_MAX_DIFFICULTY,
    },
    {
      label: `No lapse in the last ${MASTERY_LAPSE_FREE_WINDOW} reviews`,
      met: noRecentLapse,
    },
  ];

  return { mastered: criteria.every((criterion) => criterion.met), criteria };
}

/** Builds mastery evidence from an entry's stored exercise history. */
export function masteryEvidenceFrom(
  history: readonly ExerciseHistory[],
  productionTypes: (row: ExerciseHistory) => boolean,
): MasteryEvidence {
  const ordered = [...history].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));

  let successfulReviews = 0;
  let successfulProductionReviews = 0;
  let typedFirstAttemptCorrect = false;

  for (const row of ordered) {
    if (!isSuccess(row.grade)) continue;
    successfulReviews += 1;
    if (productionTypes(row)) successfulProductionReviews += 1;
    if (row.correct && row.firstAttempt && !row.revealed && isTypedType(row.exerciseType)) {
      typedFirstAttemptCorrect = true;
    }
  }

  return {
    successfulReviews,
    successfulProductionReviews,
    typedFirstAttemptCorrect,
    recentGrades: ordered.map((row) => row.grade),
  };
}

function isTypedType(exerciseType: string): boolean {
  return (
    exerciseType === 'typedTranslation' ||
    exerciseType === 'sentenceCompletion' ||
    exerciseType === 'listening'
  );
}

/** Applies the mastery decision to a progress record, returning the updated SRS state. */
export function withMasteryStatus(progress: EntryProgress, check: MasteryCheck): SrsState {
  if (check.mastered && progress.srs.status === 'review') {
    return { ...progress.srs, status: 'mastered' };
  }
  // A mastered entry that lapses is demoted by the scheduler, not here.
  return progress.srs;
}
