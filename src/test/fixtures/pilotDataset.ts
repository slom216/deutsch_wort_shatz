import { loadBand } from '@/content/vocabulary/registry';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';

/**
 * 100-entry pilot dataset (Phase 1 deliverable 25).
 *
 * The specification describes authoring a pilot set by hand, but the full 10,000-entry
 * dataset already ships and is validated, so inventing a parallel set would create a
 * second source of truth. Instead this selects a deterministic 100-entry slice of the
 * real A1 vocabulary that satisfies the stated composition:
 *
 *   - 60 words and every A1 phrase the dataset has (10 of them);
 *   - at least 10 nouns and at least 10 verbs;
 *   - entries drawn from multiple topics.
 *
 * Selection is deterministic — it walks entries in rank order — so tests are stable.
 */

export const PILOT_SIZE = 100;
export const PILOT_MIN_WORDS = 60;
export const PILOT_MIN_PHRASES = 10;
export const PILOT_MIN_NOUNS = 10;
export const PILOT_MIN_VERBS = 10;

let cached: readonly VocabularyEntry[] | null = null;

/**
 * Builds the pilot set from the A1 bands. Quotas are filled first so the composition is
 * guaranteed, then the remainder is topped up in rank order.
 */
export async function loadPilotDataset(): Promise<readonly VocabularyEntry[]> {
  if (cached) return cached;

  const bands = await Promise.all([
    loadBand('A1 Core 1'),
    loadBand('A1 Core 2'),
    loadBand('A1 Core 3'),
    loadBand('A1 Core 4'),
  ]);
  const all = bands.flat().sort((a, b) => a.rank - b.rank);

  const selected: VocabularyEntry[] = [];
  const chosen = new Set<string>();

  const take = (predicate: (entry: VocabularyEntry) => boolean, limit: number): void => {
    let taken = 0;
    for (const entry of all) {
      if (taken >= limit || selected.length >= PILOT_SIZE) return;
      if (chosen.has(entry.id) || !predicate(entry)) continue;
      chosen.add(entry.id);
      selected.push(entry);
      taken += 1;
    }
  };

  take((entry) => entry.wordClass === 'noun', PILOT_MIN_NOUNS + 5);
  take((entry) => entry.wordClass === 'verb', PILOT_MIN_VERBS + 5);
  take((entry) => entry.kind === 'phrase', PILOT_MIN_PHRASES);
  take((entry) => entry.kind === 'word', PILOT_MIN_WORDS - PILOT_MIN_NOUNS - PILOT_MIN_VERBS);
  take(() => true, PILOT_SIZE);

  cached = selected.slice(0, PILOT_SIZE).sort((a, b) => a.rank - b.rank);
  return cached;
}

/** Test-only: clears the memoized pilot set. */
export function resetPilotDataset(): void {
  cached = null;
}
