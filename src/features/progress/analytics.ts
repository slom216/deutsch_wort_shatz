import {
  CEFR_LEVELS,
  FREQUENCY_BANDS,
  LEVEL_ENTRY_COUNTS,
  type CefrLevel,
} from '@/content/vocabulary/frequencyBands';
import type { EntryProgress, ExerciseHistory } from '@/schemas/progressSchema';
import type { VocabularyIndexRecord } from '@/schemas/vocabularySchema';
import { localDateKey } from '@/features/srs/localDate';
import { MASTERY_SCORE_TARGET } from '@/features/srs/repository';

/**
 * Progress analytics (§6, §16).
 *
 * Everything is derived from the two stored tables — `entryProgress` and
 * `exerciseHistory` — joined against the static index. Nothing is cached in the database,
 * so the figures can never disagree with the underlying record.
 */

export interface Breakdown {
  readonly key: string;
  readonly label: string;
  readonly total: number;
  readonly introduced: number;
  readonly mastered: number;
  /** Introduced share, 0–1. */
  readonly fraction: number;
  /** Sum of mastery points, each entry capped at `MASTERY_SCORE_TARGET`. */
  readonly points: number;
  /** Points share of the maximum, 0–1 — how far through this group the learner is. */
  readonly pointsFraction: number;
}

/**
 * Mastery points for one entry.
 *
 * Capped because `nextMasteryScore` only floors at zero — nothing stops a score climbing
 * past the target, and an uncapped sum would report more than 100%.
 */
function pointsOf(progress: EntryProgress): number {
  return Math.min(progress.masteryScore, MASTERY_SCORE_TARGET);
}

function buildBreakdown(
  records: readonly VocabularyIndexRecord[],
  progressByEntry: ReadonlyMap<string, EntryProgress>,
  keyOf: (record: VocabularyIndexRecord) => string,
  labelOf: (key: string) => string = (key) => key,
): Breakdown[] {
  const totals = new Map<
    string,
    { total: number; introduced: number; mastered: number; points: number }
  >();

  for (const record of records) {
    const key = keyOf(record);
    const bucket = totals.get(key) ?? { total: 0, introduced: 0, mastered: 0, points: 0 };
    bucket.total += 1;
    const progress = progressByEntry.get(record.id);
    if (progress) {
      bucket.introduced += 1;
      if (progress.srs.status === 'mastered') bucket.mastered += 1;
      bucket.points += pointsOf(progress);
    }
    totals.set(key, bucket);
  }

  return [...totals.entries()]
    .map(([key, bucket]) => ({
      key,
      label: labelOf(key),
      total: bucket.total,
      introduced: bucket.introduced,
      mastered: bucket.mastered,
      fraction: bucket.total === 0 ? 0 : bucket.introduced / bucket.total,
      points: bucket.points,
      pointsFraction:
        bucket.total === 0 ? 0 : bucket.points / (bucket.total * MASTERY_SCORE_TARGET),
    }))
    .sort((a, b) => b.introduced - a.introduced || a.label.localeCompare(b.label));
}

export function progressByLevel(
  records: readonly VocabularyIndexRecord[],
  progressByEntry: ReadonlyMap<string, EntryProgress>,
): Breakdown[] {
  return buildBreakdown(records, progressByEntry, (record) => record.level).sort((a, b) =>
    a.key.localeCompare(b.key),
  );
}

export interface LevelCompletion {
  readonly points: number;
  readonly max: number;
  /** Points share of the maximum, 0–1. */
  readonly fraction: number;
}

/**
 * Points-weighted completion per CEFR level, read straight from progress records.
 *
 * The index-free twin of `progressByLevel(…).pointsFraction`: entry ids carry the level
 * (`a1-0001-eins`, §12) and the totals are static, so the learning stream can show how far
 * through each level the learner is without loading the vocabulary index for it.
 */
export function levelCompletion(
  progress: readonly EntryProgress[],
): Record<CefrLevel, LevelCompletion> {
  const points: Record<CefrLevel, number> = { A1: 0, A2: 0, B1: 0 };

  for (const record of progress) {
    const level = record.entryId.slice(0, 2).toUpperCase() as CefrLevel;
    // Ids the datasets never produced — imported or hand-edited — are simply skipped.
    if (!(level in points)) continue;
    points[level] += pointsOf(record);
  }

  return Object.fromEntries(
    CEFR_LEVELS.map((level) => {
      const max = LEVEL_ENTRY_COUNTS[level] * MASTERY_SCORE_TARGET;
      return [level, { points: points[level], max, fraction: max === 0 ? 0 : points[level] / max }];
    }),
  ) as Record<CefrLevel, LevelCompletion>;
}

export function progressByBand(
  records: readonly VocabularyIndexRecord[],
  progressByEntry: ReadonlyMap<string, EntryProgress>,
): Breakdown[] {
  const order = new Map(FREQUENCY_BANDS.map((band, index) => [band.id, index]));
  return buildBreakdown(records, progressByEntry, (record) => record.frequencyBand).sort(
    (a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99),
  );
}

export function progressByTopic(
  records: readonly VocabularyIndexRecord[],
  progressByEntry: ReadonlyMap<string, EntryProgress>,
): Breakdown[] {
  return buildBreakdown(records, progressByEntry, (record) => record.primaryTopic);
}

export function progressByWordClass(
  records: readonly VocabularyIndexRecord[],
  progressByEntry: ReadonlyMap<string, EntryProgress>,
): Breakdown[] {
  return buildBreakdown(records, progressByEntry, (record) => record.wordClass);
}

/** Topics the learner has started but performs worst on — the dashboard's weak spots. */
export function weakestTopics(
  records: readonly VocabularyIndexRecord[],
  progressByEntry: ReadonlyMap<string, EntryProgress>,
  limit = 5,
): Array<{ topic: string; difficulty: number; entries: number }> {
  const byTopic = new Map<string, { sum: number; count: number }>();

  for (const record of records) {
    const progress = progressByEntry.get(record.id);
    if (!progress || progress.totalAttempts === 0) continue;
    const bucket = byTopic.get(record.primaryTopic) ?? { sum: 0, count: 0 };
    bucket.sum += progress.srs.difficulty;
    bucket.count += 1;
    byTopic.set(record.primaryTopic, bucket);
  }

  return [...byTopic.entries()]
    .map(([topic, bucket]) => ({
      topic,
      difficulty: bucket.sum / bucket.count,
      entries: bucket.count,
    }))
    .sort((a, b) => b.difficulty - a.difficulty)
    .slice(0, limit);
}

export interface ExerciseTypeStats {
  readonly type: string;
  readonly attempts: number;
  readonly correct: number;
  readonly firstAttemptCorrect: number;
  readonly accuracy: number;
  readonly averageResponseMs: number;
}

/** Per-format performance (§6 "exercise-type performance"). */
export function exerciseTypePerformance(history: readonly ExerciseHistory[]): ExerciseTypeStats[] {
  const byType = new Map<
    string,
    { attempts: number; correct: number; first: number; totalMs: number }
  >();

  for (const row of history) {
    const bucket = byType.get(row.exerciseType) ?? {
      attempts: 0,
      correct: 0,
      first: 0,
      totalMs: 0,
    };
    bucket.attempts += 1;
    if (row.correct) bucket.correct += 1;
    if (row.correct && row.firstAttempt && !row.revealed) bucket.first += 1;
    bucket.totalMs += row.responseMs;
    byType.set(row.exerciseType, bucket);
  }

  return [...byType.entries()]
    .map(([type, bucket]) => ({
      type,
      attempts: bucket.attempts,
      correct: bucket.correct,
      firstAttemptCorrect: bucket.first,
      accuracy: bucket.attempts === 0 ? 0 : bucket.correct / bucket.attempts,
      averageResponseMs: bucket.attempts === 0 ? 0 : bucket.totalMs / bucket.attempts,
    }))
    .sort((a, b) => b.attempts - a.attempts);
}

/** Error-category totals (§16), most frequent first. */
export function errorCategoryStats(
  history: readonly ExerciseHistory[],
): Array<{ category: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of history) {
    for (const category of row.errorCategories) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export interface ActivityDay {
  readonly date: string;
  readonly exercises: number;
  readonly correct: number;
}

/** Day-by-day activity for the last `days` local days, oldest first (§16). */
export function activitySummary(
  history: readonly ExerciseHistory[],
  days = 30,
  now: Date = new Date(),
): ActivityDay[] {
  const buckets = new Map<string, { exercises: number; correct: number }>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getTime() - offset * 86_400_000);
    buckets.set(localDateKey(date), { exercises: 0, correct: 0 });
  }

  for (const row of history) {
    const key = localDateKey(new Date(row.answeredAt));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.exercises += 1;
    if (row.correct) bucket.correct += 1;
  }

  return [...buckets.entries()].map(([date, bucket]) => ({ date, ...bucket }));
}

export interface OverallStats {
  readonly introduced: number;
  readonly learning: number;
  readonly review: number;
  readonly mastered: number;
  readonly totalAttempts: number;
  readonly totalCorrect: number;
  readonly firstAttemptCorrect: number;
  readonly accuracy: number;
  readonly firstAttemptAccuracy: number;
  readonly averageResponseMs: number;
  readonly sessions: number;
}

export function overallStats(
  progress: readonly EntryProgress[],
  history: readonly ExerciseHistory[],
): OverallStats {
  const totalAttempts = history.length;
  const totalCorrect = history.filter((row) => row.correct).length;
  const firstAttemptCorrect = history.filter(
    (row) => row.correct && row.firstAttempt && !row.revealed,
  ).length;

  return {
    introduced: progress.length,
    learning: progress.filter((p) => p.srs.status === 'learning' || p.srs.status === 'relearning')
      .length,
    review: progress.filter((p) => p.srs.status === 'review').length,
    mastered: progress.filter((p) => p.srs.status === 'mastered').length,
    totalAttempts,
    totalCorrect,
    firstAttemptCorrect,
    accuracy: totalAttempts === 0 ? 0 : totalCorrect / totalAttempts,
    firstAttemptAccuracy: totalAttempts === 0 ? 0 : firstAttemptCorrect / totalAttempts,
    averageResponseMs:
      totalAttempts === 0
        ? 0
        : history.reduce((sum, row) => sum + row.responseMs, 0) / totalAttempts,
    sessions: new Set(history.map((row) => row.sessionId)).size,
  };
}

export type { CefrLevel };
