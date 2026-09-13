import { describe, expect, it } from 'vitest';

import type { EntryProgress } from '@/schemas/progressSchema';
import { dueEntries, queueCounts, reviewForecast } from './queue';
import { createProgress } from './repository';

const NOW = new Date('2026-05-01T12:00:00.000Z');
const DAY = 86_400_000;

function entry(entryId: string, dueInDays: number, difficulty = 0.5): EntryProgress {
  const base = createProgress(entryId, NOW);
  return {
    ...base,
    srs: {
      ...base.srs,
      status: 'review',
      difficulty,
      dueAt: new Date(NOW.getTime() + dueInDays * DAY).toISOString(),
    },
  };
}

describe('queue', () => {
  it('orders due entries overdue first, then hardest, then by id', () => {
    const all = [entry('c', -0.1, 0.9), entry('a', -3), entry('b', -0.1, 0.2), entry('z', 2)];
    expect(dueEntries(all, NOW).map((p) => p.entryId)).toEqual(['a', 'c', 'b']);
  });

  it('counts status over every record but due only over the queueable ones', () => {
    const all = [entry('a', -3), entry('b', -3), entry('c', 5)];
    const counts = queueCounts(all, 10, NOW, [all[0] as EntryProgress]);
    expect(counts).toMatchObject({ due: 1, overdue: 1, review: 3, newAvailable: 7 });
  });

  it('folds anything already due into today', () => {
    const forecast = reviewForecast([entry('a', -3), entry('b', 1.2)], 3, NOW);
    expect(forecast.map((day) => day.count)).toEqual([1, 1, 0]);
  });
});
