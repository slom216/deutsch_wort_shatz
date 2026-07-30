import { beforeEach, describe, expect, it } from 'vitest';

import {
  hasGeneratedContent,
  loadBand,
  loadEntry,
  loadManifest,
  loadSearchIndex,
  resetContentCache,
} from './registry';
import { FREQUENCY_BANDS } from './frequencyBands';
import { isTopic } from './topics';
import { vocabularyEntrySchema } from '@/schemas/vocabularySchema';

/**
 * Integration test over the generated bundles. It requires `npm run build:content`
 * to have run, which `pretest` guarantees.
 */
describe('vocabulary registry', () => {
  beforeEach(() => {
    resetContentCache();
  });

  it('has a generated bundle for every frequency band', () => {
    expect(hasGeneratedContent()).toBe(true);
  });

  it('reports 10,000 entries split 1,000 / 3,000 / 6,000 across levels', async () => {
    const manifest = await loadManifest();
    expect(manifest.totalEntries).toBe(10_000);
    expect(manifest.entriesByLevel).toEqual({ A1: 1000, A2: 3000, B1: 6000 });
    expect(manifest.bands).toHaveLength(FREQUENCY_BANDS.length);
  });

  it('loads a band with exactly the entries its rank range allows', async () => {
    const entries = await loadBand('A1 Core 1');
    expect(entries).toHaveLength(250);
    for (const entry of entries) {
      expect(entry.rank).toBeGreaterThanOrEqual(1);
      expect(entry.rank).toBeLessThanOrEqual(250);
      expect(entry.level).toBe('A1');
      expect(entry.frequencyBand).toBe('A1 Core 1');
    }
  });

  it('memoizes a band so repeated loads return the same array', async () => {
    const [first, second] = await Promise.all([loadBand('A1 Core 2'), loadBand('A1 Core 2')]);
    expect(first).toBe(second);
  });

  it('rejects an unknown band', async () => {
    await expect(loadBand('A9 Core 1')).rejects.toThrow(/Unknown frequency band/);
  });

  it('validates every entry of a band against the vocabulary schema', async () => {
    const entries = await loadBand('A1 Core 1');
    for (const entry of entries) {
      const result = vocabularyEntrySchema.safeParse(entry);
      if (!result.success) {
        throw new Error(`${entry.id}: ${result.error.issues[0]?.message}`);
      }
    }
  });

  it('normalizes every topic onto the controlled registry', async () => {
    const entries = await loadBand('A2 High 1');
    for (const entry of entries) {
      expect(isTopic(entry.primaryTopic)).toBe(true);
      for (const topic of entry.secondaryTopics) {
        expect(isTopic(topic)).toBe(true);
      }
    }
  });

  it('exposes a search index covering all 10,000 entries with unique ids', async () => {
    const index = await loadSearchIndex();
    expect(index).toHaveLength(10_000);
    expect(new Set(index.map((r) => r.id)).size).toBe(10_000);
  });

  it('finds a single entry by id, loading only its band', async () => {
    const entry = await loadEntry('a1-0003-sein');
    expect(entry).not.toBeNull();
    expect(entry?.german).toBe('sein');
    expect(entry?.wordClass).toBe('verb');
  });

  it('returns null for an unknown entry id', async () => {
    expect(await loadEntry('a1-9999-nonexistent')).toBeNull();
  });
});
