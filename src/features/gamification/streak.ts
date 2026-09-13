import type { ExerciseHistory } from '@/schemas/progressSchema';
import { localDateKey, localDaysBetween } from '@/features/srs/localDate';

/**
 * Streaks and daily goals (§23).
 *
 * A day counts towards the streak when the learner gets at least 10 answers right or earns
 * at least 50 XP, measured against the **local** calendar date. Wrong answers do not count:
 * clicking through a session should not keep a streak alive.
 *
 * The streak is derived from stored history rather than kept as a running counter, so it
 * cannot drift, cannot be double-counted by a refresh, and repairs itself if history is
 * imported or edited. Streak freezes are derived the same way (see `streakFromActivity`).
 */

export const STREAK_MIN_EXERCISES = 10;
export const STREAK_MIN_XP = 50;
/** One freeze is earned for every this many study days in a row. */
export const FREEZE_EARN_DAYS = 7;
export const MAX_FREEZES = 2;

export interface DailyActivity {
  /** Local date, `YYYY-MM-DD`. */
  readonly date: string;
  /** Correct answers that day. */
  readonly exercises: number;
  readonly xp: number;
  readonly countsForStreak: boolean;
}

type ActivityRow = Pick<ExerciseHistory, 'answeredAt' | 'correct' | 'xpAwarded'>;

/** Groups history into local days. Newest last. */
export function dailyActivity(history: readonly ActivityRow[]): DailyActivity[] {
  const byDay = new Map<string, { exercises: number; xp: number }>();

  for (const row of history) {
    const key = localDateKey(new Date(row.answeredAt));
    const bucket = byDay.get(key) ?? { exercises: 0, xp: 0 };
    if (row.correct) bucket.exercises += 1;
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
  /** Streak freezes held right now, after covering any days missed since the last study day. */
  readonly freezes: number;
}

export function computeStreak(
  history: readonly ActivityRow[],
  now: Date = new Date(),
): StreakState {
  return streakFromActivity(dailyActivity(history), now);
}

/**
 * Current and longest streak, with earned streak freezes.
 *
 * Walking the qualifying days in order: every `FREEZE_EARN_DAYS` study days in a row earn a
 * freeze (at most `MAX_FREEZES` held). A gap of missed days is bridged when enough freezes
 * are held, and bridging spends them for good; otherwise the run starts again and the
 * freezes are kept. Current and longest streak come from the same walk, so a bridged run
 * counts the same once it is no longer current.
 */
export function streakFromActivity(
  activity: readonly DailyActivity[],
  now: Date = new Date(),
): StreakState {
  const qualifying = activity.filter((day) => day.countsForStreak);
  const last = qualifying[qualifying.length - 1];
  if (!last) {
    return { current: 0, longest: 0, todayCounts: false, lastQualifyingDate: null, freezes: 0 };
  }

  let run = 0;
  let studyRun = 0;
  let freezes = 0;
  let longest = 0;
  let previous: Date | null = null;

  for (const day of qualifying) {
    const date = new Date(`${day.date}T12:00:00`);
    const missed = previous ? localDaysBetween(previous, date) - 1 : 0;
    if (previous === null || missed > freezes) {
      run = 1;
      studyRun = 1;
    } else if (missed === 0) {
      run += 1;
      studyRun += 1;
    } else {
      freezes -= missed;
      run += 1;
      studyRun = 1;
    }
    if (studyRun % FREEZE_EARN_DAYS === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
    longest = Math.max(longest, run);
    previous = date;
  }

  // Today and yesterday miss nothing; a clock set back before the last day misses nothing.
  const missedSinceLast = Math.max(0, localDaysBetween(previous as Date, now) - 1);
  const alive = missedSinceLast <= freezes;

  return {
    current: alive ? run : 0,
    longest,
    todayCounts: last.date === localDateKey(now),
    lastQualifyingDate: last.date,
    freezes: alive ? freezes - missedSinceLast : freezes,
  };
}

export interface DailyGoalState {
  readonly goal: number;
  readonly completed: number;
  readonly met: boolean;
  readonly fraction: number;
}

/** Progress towards today's goal, counted in correct answers (§23). */
export function dailyGoalState(
  history: readonly ActivityRow[],
  goal: number,
  now: Date = new Date(),
): DailyGoalState {
  const today = localDateKey(now);
  const completed = history.filter(
    (row) => row.correct && localDateKey(new Date(row.answeredAt)) === today,
  ).length;
  return {
    goal,
    completed,
    met: completed >= goal,
    fraction: goal <= 0 ? 1 : Math.min(1, completed / goal),
  };
}
