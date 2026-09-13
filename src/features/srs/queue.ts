import type { EntryProgress } from '@/schemas/progressSchema';
import { daysUntilDue, isOverdue } from './scheduler';
import { addDays, localDateKey, startOfLocalDay } from './localDate';

/**
 * Review queue (§18, §19).
 *
 * Ordering rules: overdue words first, then high-difficulty words, then the longest
 * waiting. Sorting is a pure function of stored state, so the queue is identical after a
 * refresh — it is rebuilt from IndexedDB rather than held only in memory.
 */

export interface QueueCounts {
  readonly due: number;
  readonly overdue: number;
  readonly newAvailable: number;
  readonly learning: number;
  readonly review: number;
  readonly mastered: number;
}

/**
 * Priority score; higher is reviewed sooner.
 * Overdueness dominates, difficulty breaks ties, so a hard word that is barely due does
 * not jump ahead of an easy word that is a week late.
 */
export function priority(progress: EntryProgress, now: Date = new Date()): number {
  const overdueDays = Math.max(0, -daysUntilDue(progress.srs, now));
  return overdueDays * 10 + progress.srs.difficulty * 5;
}

export function dueEntries(all: readonly EntryProgress[], now: Date = new Date()): EntryProgress[] {
  const nowMs = now.getTime();
  // Priority is computed once per entry, not once per comparison.
  return all
    .filter((progress) => Date.parse(progress.srs.dueAt) <= nowMs)
    .map((progress) => ({ progress, score: priority(progress, now) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        // Stable final tie-break so the order never wobbles between renders.
        a.progress.entryId.localeCompare(b.progress.entryId),
    )
    .map(({ progress }) => progress);
}

export function overdueEntries(
  all: readonly EntryProgress[],
  now: Date = new Date(),
): EntryProgress[] {
  return dueEntries(all, now).filter((progress) => isOverdue(progress.srs, now));
}

/**
 * Status counts over `all`; due and overdue over `queueable` — the same records minus the
 * skipped words, which keep their status but are not waiting for review.
 */
export function queueCounts(
  all: readonly EntryProgress[],
  totalEntries: number,
  now: Date = new Date(),
  queueable: readonly EntryProgress[] = all,
): QueueCounts {
  const byStatus = { learning: 0, review: 0, mastered: 0 };
  for (const progress of all) {
    const status = progress.srs.status;
    if (status === 'learning' || status === 'relearning') byStatus.learning += 1;
    else if (status === 'review') byStatus.review += 1;
    else if (status === 'mastered') byStatus.mastered += 1;
  }

  const due = dueEntries(queueable, now);
  return {
    due: due.length,
    overdue: due.filter((progress) => isOverdue(progress.srs, now)).length,
    // Entries the learner has never been introduced to.
    newAvailable: Math.max(0, totalEntries - all.length),
    ...byStatus,
  };
}

/** Hardest words first — powers the dashboard's "hardest words" and the difficult view. */
export function hardestEntries(all: readonly EntryProgress[], limit = 10): EntryProgress[] {
  return [...all]
    .filter((progress) => progress.totalAttempts > 0)
    .sort((a, b) => b.srs.difficulty - a.srs.difficulty || a.entryId.localeCompare(b.entryId))
    .slice(0, limit);
}

export function masteredEntries(all: readonly EntryProgress[]): EntryProgress[] {
  return all
    .filter((progress) => progress.srs.status === 'mastered')
    .sort((a, b) => b.srs.intervalDays - a.srs.intervalDays);
}

export interface ForecastDay {
  readonly date: string;
  readonly count: number;
}

/**
 * Review forecast: how many entries fall due on each of the next `days` local days.
 * Anything already due is folded into today, which is what the learner actually faces.
 */
export function reviewForecast(
  all: readonly EntryProgress[],
  days = 14,
  now: Date = new Date(),
): ForecastDay[] {
  const buckets = new Map<string, number>();
  const today = startOfLocalDay(now);

  for (let offset = 0; offset < days; offset += 1) {
    buckets.set(localDateKey(addDays(today, offset)), 0);
  }

  for (const progress of all) {
    const due = new Date(progress.srs.dueAt);
    const key = localDateKey(due.getTime() < now.getTime() ? now : due);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}
