import type { ExerciseHistory } from '@/schemas/progressSchema';
import { localDateKey, localDaysBetween } from '@/features/srs/localDate';

/**
 * Streaks and daily goals (§23).
 *
 * A day counts towards the streak when the learner completes at least 10 graded exercises
 * or earns at least 50 XP, measured against the **local** calendar date.
 *
 * The streak is derived from stored history rather than kept as a running counter, so it
 * cannot drift, cannot be double-counted by a refresh, and repairs itself if history is
 * imported or edited.
 */

export const STREAK_MIN_EXERCISES = 10;
export const STREAK_MIN_XP = 50;

export interface DailyActivity {
  /** Local date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly exercises: number;
  readonly xp: number;
  readonly countsForStreak: boolean;
}

/** Groups history into local days. Newest last. */
export function dailyActivity(history: readonly ExerciseHistory[]): DailyActivity[] {
  const byDay = new Map<string, { exercises: number; xp: number }>();

  for (const row of history) {
    const key = localDateKey(new Date(row.answeredAt));
    const bucket = byDay.get(key) ?? { exercises: 0, xp: 0 };
    bucket.exercises += 1;
    bucket.xp += row.xpAwarded;
    byDay.set(key, bucket);
  }

  return [...byDay.entries()]
    .map(([date, bucket]) => ({
      date,
      exercises: bucket.exercises,
      xp: bucket.xp,
      countsForStreak: bucket.exercises >= STREAK_MIN_EXERCISES || bucket.xp >= STREAK_MIN_XP,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface StreakState {
  readonly current: number;
  readonly longest: number;
  /** True when today already counts, so the learner knows the streak is safe. */
  readonly todayCounts: boolean;
  /** Local date of the most recent qualifying day, or null. */
  readonly lastQualifyingDate: string | null;
}

/**
 * Current and longest streak.
 *
 * `freezesAvailable` lets a single missed day be bridged (the streak-freeze deliverable):
 * one freeze covers one gap day, and freezes are consumed oldest-gap-first.
 */
export function computeStreak(
  history: readonly ExerciseHistory[],
  now: Date = new Date(),
  freezesAvailable = 0,
): StreakState {
  const qualifying = dailyActivity(history).filter((day) => day.countsForStreak);

  if (qualifying.length === 0) {
    return { current: 0, longest: 0, todayCounts: false, lastQualifyingDate: null };
  }

  const dates = qualifying.map((day) => new Date(`${day.date}T12:00:00`));
  const today = localDateKey(now);
  const todayCounts = qualifying.some((day) => day.date === today);

  /* ---- longest run of consecutive local days ---- */
  let longest = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i += 1) {
    const gap = localDaysBetween(dates[i - 1] as Date, dates[i] as Date);
    run = gap === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  /* ---- current streak, walking backwards from today ---- */
  const last = dates[dates.length - 1] as Date;
  const daysSinceLast = localDaysBetween(last, now);

  // More than one day since the last qualifying day (allowing for freezes) breaks it.
  let freezes = freezesAvailable;
  if (daysSinceLast > 1) {
    const missed = daysSinceLast - 1;
    if (missed > freezes) {
      return {
        current: 0,
        longest,
        todayCounts: false,
        lastQualifyingDate: last ? localDateKey(last) : null,
      };
    }
    freezes -= missed;
  }

  let current = 1;
  for (let i = dates.length - 1; i > 0; i -= 1) {
    const gap = localDaysBetween(dates[i - 1] as Date, dates[i] as Date);
    if (gap === 1) {
      current += 1;
      continue;
    }
    // A gap larger than one day may be bridged by the remaining freezes.
    const missed = gap - 1;
    if (missed > 0 && missed <= freezes) {
      freezes -= missed;
      current += 1;
      continue;
    }
    break;
  }

  return {
    current,
    longest: Math.max(longest, current),
    todayCounts,
    lastQualifyingDate: localDateKey(last),
  };
}

export interface DailyGoalState {
  readonly goal: number;
  readonly completed: number;
  readonly met: boolean;
  readonly fraction: number;
}

/** Progress towards today's goal, counted in graded exercises (§23). */
export function dailyGoalState(
  history: readonly ExerciseHistory[],
  goal: number,
  now: Date = new Date(),
): DailyGoalState {
  const today = localDateKey(now);
  const completed = history.filter(
    (row) => localDateKey(new Date(row.answeredAt)) === today,
  ).length;
  return {
    goal,
    completed,
    met: completed >= goal,
    fraction: goal <= 0 ? 1 : Math.min(1, completed / goal),
  };
}
