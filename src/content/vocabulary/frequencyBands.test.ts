import { describe, expect, it } from 'vitest';

import {
  bandBySlug,
  bandForRank,
  bandById,
  bandsForLevel,
  CEFR_LEVELS,
  FREQUENCY_BANDS,
  isCefrLevel,
  LEVEL_ENTRY_COUNTS,
  LEVEL_RANK_RANGES,
  TOTAL_ENTRY_COUNT,
} from './frequencyBands';

describe('frequency band registry', () => {
  it('defines twelve bands, four per level', () => {
    expect(FREQUENCY_BANDS).toHaveLength(12);
    for (const level of CEFR_LEVELS) {
      expect(bandsForLevel(level)).toHaveLength(4);
    }
  });

  it('covers ranks 1–10,000 contiguously with no overlap or gap', () => {
    const sorted = [...FREQUENCY_BANDS].sort((a, b) => a.from - b.from);
    expect(sorted[0]?.from).toBe(1);
    expect(sorted.at(-1)?.to).toBe(TOTAL_ENTRY_COUNT);

    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]?.from).toBe((sorted[i - 1]?.to ?? 0) + 1);
    }
  });

  it('band capacities sum to the per-level entry targets', () => {
    for (const level of CEFR_LEVELS) {
      const capacity = bandsForLevel(level).reduce((sum, b) => sum + (b.to - b.from + 1), 0);
      expect(capacity).toBe(LEVEL_ENTRY_COUNTS[level]);
    }
  });

  it('band ranges sit inside their level range', () => {
    for (const band of FREQUENCY_BANDS) {
      const range = LEVEL_RANK_RANGES[band.level];
      expect(band.from).toBeGreaterThanOrEqual(range.from);
      expect(band.to).toBeLessThanOrEqual(range.to);
    }
  });

  it('maps boundary ranks to the correct band', () => {
    expect(bandForRank(1)?.id).toBe('A1 Core 1');
    expect(bandForRank(250)?.id).toBe('A1 Core 1');
    expect(bandForRank(251)?.id).toBe('A1 Core 2');
    expect(bandForRank(1000)?.id).toBe('A1 Core 4');
    expect(bandForRank(1001)?.id).toBe('A2 High 1');
    expect(bandForRank(4000)?.id).toBe('A2 Medium 2');
    expect(bandForRank(4001)?.id).toBe('B1 High 1');
    expect(bandForRank(10_000)?.id).toBe('B1 Medium 2');
  });

  it('returns null for ranks outside the dataset', () => {
    expect(bandForRank(0)).toBeNull();
    expect(bandForRank(10_001)).toBeNull();
  });

  it('looks bands up by id and by slug', () => {
    expect(bandById('B1 High 1')?.slug).toBe('b1-high-1');
    expect(bandBySlug('b1-high-1')?.id).toBe('B1 High 1');
    expect(bandBySlug('B1-HIGH-1')?.id).toBe('B1 High 1');
    expect(bandById('nope')).toBeNull();
    expect(bandBySlug('nope')).toBeNull();
  });

  it('validates CEFR level strings', () => {
    expect(isCefrLevel('A1')).toBe(true);
    expect(isCefrLevel('C1')).toBe(false);
  });
});
