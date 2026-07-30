/**
 * Local calendar-date helpers (§23: "Use local calendar date").
 *
 * Streaks and daily goals are counted against the learner's own calendar day, not UTC.
 * Someone studying at 23:30 and again at 00:30 has studied on two days; someone studying
 * at 01:00 UTC-5 has not yet reached the next UTC day. Everything here therefore works
 * from the local components of a `Date`, never from its ISO/UTC form.
 */

/** Local calendar day as `YYYY-MM-DD`. Never use `toISOString()` for this — it is UTC. */
export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Midnight at the start of the given local day. */
export function startOfLocalDay(date: Date = new Date()): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/** Whole local days between two instants; positive when `later` is after `earlier`. */
export function localDaysBetween(earlier: Date, later: Date): number {
  const a = startOfLocalDay(earlier).getTime();
  const b = startOfLocalDay(later).getTime();
  // Round rather than floor: DST transitions make some days 23 or 25 hours long.
  return Math.round((b - a) / 86_400_000);
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return localDateKey(a) === localDateKey(b);
}

/** True when `date` falls on the local day immediately before `reference`. */
export function isPreviousLocalDay(date: Date, reference: Date): boolean {
  return localDaysBetween(date, reference) === 1;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setTime(result.getTime() + days * 86_400_000);
  return result;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** Days expressed as a fraction, used for sub-day learning steps (10 minutes = 1/144 d). */
export const MINUTE_IN_DAYS = 1 / (24 * 60);
