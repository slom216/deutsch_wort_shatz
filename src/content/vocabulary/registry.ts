/**
 * Vocabulary registry — the single entry point the application uses to reach content.
 *
 * Nothing here is imported eagerly. Each frequency band is a separate dynamic import,
 * so a session that studies "A1 Core 1" never downloads the 6,000 B1 entries (§29).
 * Loaded bands and the search index are memoized for the lifetime of the page.
 *
 * The `generated/` directory is produced by `npm run build:content` from `data/*.json`.
 */

import type { VocabularyEntry, VocabularyIndexRecord } from '@/schemas/vocabularySchema';
import {
  bandById,
  bandsForLevel,
  FREQUENCY_BANDS,
  type CefrLevel,
  type FrequencyBand,
} from './frequencyBands';

export interface ContentManifest {
  readonly generatedAt: string;
  readonly totalEntries: number;
  readonly entriesByLevel: Readonly<Record<CefrLevel, number>>;
  readonly bands: ReadonlyArray<{
    readonly id: string;
    readonly slug: string;
    readonly level: CefrLevel;
    readonly from: number;
    readonly to: number;
    readonly entryCount: number;
  }>;
}

/**
 * Vite resolves these globs at build time into a map of lazy chunk loaders, which keeps
 * the band bundles out of the initial payload while staying fully static (no fetch).
 */
const bandLoaders = import.meta.glob<{ default: VocabularyEntry[] }>(
  './generated/*/*.json',
) as Record<string, () => Promise<{ default: VocabularyEntry[] }>>;

const bandCache = new Map<string, Promise<readonly VocabularyEntry[]>>();
let manifestPromise: Promise<ContentManifest> | null = null;
let indexPromise: Promise<readonly VocabularyIndexRecord[]> | null = null;

function loaderKey(band: FrequencyBand): string {
  return `./generated/${band.level.toLowerCase()}/${band.slug}.json`;
}

export function loadManifest(): Promise<ContentManifest> {
  manifestPromise ??= import('./generated/manifest.json').then(
    (m) => m.default as unknown as ContentManifest,
  );
  return manifestPromise;
}

/** Compact records for every entry — used by the vocabulary browser and search (§16). */
export function loadSearchIndex(): Promise<readonly VocabularyIndexRecord[]> {
  indexPromise ??= import('./generated/index.json').then(
    (m) => m.default as unknown as VocabularyIndexRecord[],
  );
  return indexPromise;
}

/** Full entries for one frequency band. Memoized; safe to call repeatedly. */
export function loadBand(bandId: string): Promise<readonly VocabularyEntry[]> {
  const cached = bandCache.get(bandId);
  if (cached) return cached;

  const band = bandById(bandId);
  if (!band) {
    return Promise.reject(new Error(`Unknown frequency band: ${bandId}`));
  }

  const loader = bandLoaders[loaderKey(band)];
  if (!loader) {
    return Promise.reject(
      new Error(
        `Missing content bundle for "${band.id}". Run \`npm run build:content\` to generate it.`,
      ),
    );
  }

  const promise = loader().then((module) => module.default);
  bandCache.set(bandId, promise);
  return promise;
}

/** Full entries for every band in a CEFR level. */
export async function loadLevel(level: CefrLevel): Promise<readonly VocabularyEntry[]> {
  const bands = bandsForLevel(level);
  const loaded = await Promise.all(bands.map((band) => loadBand(band.id)));
  return loaded.flat();
}

/** Looks up a single entry by its stable ID, loading only the band that contains it. */
export async function loadEntry(entryId: string): Promise<VocabularyEntry | null> {
  const index = await loadSearchIndex();
  const record = index.find((r) => r.id === entryId);
  if (!record) return null;
  const entries = await loadBand(record.frequencyBand);
  return entries.find((e) => e.id === entryId) ?? null;
}

/** True when the generated bundles are present — used by the content self-check. */
export function hasGeneratedContent(): boolean {
  return FREQUENCY_BANDS.every((band) => loaderKey(band) in bandLoaders);
}

/** Clears memoized content. Test-only helper. */
export function resetContentCache(): void {
  bandCache.clear();
  manifestPromise = null;
  indexPromise = null;
}
