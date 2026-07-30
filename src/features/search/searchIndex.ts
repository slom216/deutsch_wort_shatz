import { bandForRank } from '@/content/vocabulary/frequencyBands';
import type { CefrLevel } from '@/content/vocabulary/frequencyBands';
import type { Topic } from '@/content/vocabulary/topics';
import type { EntryProgress, SrsStatus } from '@/schemas/progressSchema';
import type { VocabularyIndexRecord, WordClass } from '@/schemas/vocabularySchema';

/**
 * Vocabulary search and filtering (§16).
 *
 * The compact index already carries `searchableForms`, which the datasets populate with
 * inflected forms — a verb's participle and simple past, a noun's plural, and the article
 * form. Searching those fields therefore satisfies "search by inflected verb", "search by
 * plural" and "search by article" without a separate morphology pass.
 *
 * Everything here is pure and synchronous so the browser can memoize it (§29).
 */

export type LearningStatus = 'new' | SrsStatus;
export type DifficultyBandFilter = 'any' | 'low' | 'medium' | 'high';

export interface VocabularyFilters {
  readonly query: string;
  readonly level: CefrLevel | 'all';
  readonly band: string | 'all';
  readonly topic: Topic | 'all';
  readonly wordClass: WordClass | 'all';
  readonly status: LearningStatus | 'all';
  readonly difficulty: DifficultyBandFilter;
}

export const EMPTY_FILTERS: VocabularyFilters = {
  query: '',
  level: 'all',
  band: 'all',
  topic: 'all',
  wordClass: 'all',
  status: 'all',
  difficulty: 'any',
};

/** Case- and umlaut-insensitive haystack for a record, built once per record. */
function normalize(value: string): string {
  return value
    .toLocaleLowerCase('de-DE')
    .replace(/ä/gu, 'a')
    .replace(/ö/gu, 'o')
    .replace(/ü/gu, 'u')
    .replace(/ß/gu, 'ss');
}

export interface SearchableRecord extends VocabularyIndexRecord {
  /** Pre-normalized concatenation of every searchable form and translation. */
  readonly haystack: string;
}

/**
 * Prepares the index for repeated searching. Normalizing once here is what keeps a
 * keystroke under the 100 ms budget over 10,000 entries (§29).
 */
export function prepareIndex(records: readonly VocabularyIndexRecord[]): SearchableRecord[] {
  return records.map((record) => ({
    ...record,
    haystack: normalize([record.german, ...record.english, ...record.searchableForms].join('  ')),
  }));
}

function statusOf(progress: EntryProgress | undefined): LearningStatus {
  return progress ? progress.srs.status : 'new';
}

function difficultyBandOf(progress: EntryProgress | undefined): DifficultyBandFilter {
  if (!progress) return 'any';
  const value = progress.srs.difficulty;
  if (value < 0.35) return 'low';
  if (value < 0.65) return 'medium';
  return 'high';
}

export interface SearchOptions {
  readonly filters: VocabularyFilters;
  readonly progressByEntry?: ReadonlyMap<string, EntryProgress>;
}

/** Applies every active filter. Filters combine with AND, as §16 requires. */
export function searchVocabulary(
  records: readonly SearchableRecord[],
  { filters, progressByEntry }: SearchOptions,
): SearchableRecord[] {
  const needle = normalize(filters.query.trim());

  return records.filter((record) => {
    if (needle.length > 0 && !record.haystack.includes(needle)) return false;
    if (filters.level !== 'all' && record.level !== filters.level) return false;
    if (filters.band !== 'all' && record.frequencyBand !== filters.band) return false;
    if (filters.topic !== 'all' && record.primaryTopic !== filters.topic) return false;
    if (filters.wordClass !== 'all' && record.wordClass !== filters.wordClass) return false;

    if (filters.status !== 'all' || filters.difficulty !== 'any') {
      const progress = progressByEntry?.get(record.id);
      if (filters.status !== 'all' && statusOf(progress) !== filters.status) return false;
      if (filters.difficulty !== 'any' && difficultyBandOf(progress) !== filters.difficulty) {
        return false;
      }
    }

    return true;
  });
}

/** Counts by facet, so the UI can show how many entries each filter would leave. */
export interface FacetCounts {
  readonly byLevel: Readonly<Record<string, number>>;
  readonly byWordClass: Readonly<Record<string, number>>;
  readonly byTopic: Readonly<Record<string, number>>;
}

export function facetCounts(records: readonly SearchableRecord[]): FacetCounts {
  const byLevel: Record<string, number> = {};
  const byWordClass: Record<string, number> = {};
  const byTopic: Record<string, number> = {};

  for (const record of records) {
    byLevel[record.level] = (byLevel[record.level] ?? 0) + 1;
    byWordClass[record.wordClass] = (byWordClass[record.wordClass] ?? 0) + 1;
    byTopic[record.primaryTopic] = (byTopic[record.primaryTopic] ?? 0) + 1;
  }

  return { byLevel, byWordClass, byTopic };
}

/** The frequency band a record belongs to, derived from its rank. */
export function bandOf(record: VocabularyIndexRecord): string {
  return bandForRank(record.rank)?.id ?? record.frequencyBand;
}
