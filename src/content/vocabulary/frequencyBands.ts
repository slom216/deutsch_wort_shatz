/**
 * Frequency-band registry (DEVELOPMENT_INSTRUCTIONS §8).
 *
 * Frequency rank always has priority over topic order. Each band is a contiguous,
 * non-overlapping global rank range; together the twelve bands cover ranks 1–10,000
 * exactly. Bands are also the unit of code splitting for the vocabulary bundles (§29).
 */

export const CEFR_LEVELS = ['A1', 'A2', 'B1'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export interface FrequencyBand {
  /** Display name, matching the `frequencyBand` field in the source datasets. */
  readonly id: string;
  /** URL-safe slug used by the `/learn/:level/:frequencyBand` route. */
  readonly slug: string;
  readonly level: CefrLevel;
  readonly from: number;
  readonly to: number;
}

function band(id: string, level: CefrLevel, from: number, to: number): FrequencyBand {
  return {
    id,
    slug: id
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
    level,
    from,
    to,
  };
}

export const FREQUENCY_BANDS: readonly FrequencyBand[] = [
  band('A1 Core 1', 'A1', 1, 250),
  band('A1 Core 2', 'A1', 251, 500),
  band('A1 Core 3', 'A1', 501, 750),
  band('A1 Core 4', 'A1', 751, 1000),
  band('A2 High 1', 'A2', 1001, 1750),
  band('A2 High 2', 'A2', 1751, 2500),
  band('A2 Medium 1', 'A2', 2501, 3250),
  band('A2 Medium 2', 'A2', 3251, 4000),
  band('B1 High 1', 'B1', 4001, 5500),
  band('B1 High 2', 'B1', 5501, 7000),
  band('B1 Medium 1', 'B1', 7001, 8500),
  band('B1 Medium 2', 'B1', 8501, 10000),
];

/** Total number of entries the finished dataset must contain (§2). */
export const TOTAL_ENTRY_COUNT = 10_000;

export const LEVEL_RANK_RANGES: Readonly<Record<CefrLevel, { from: number; to: number }>> = {
  A1: { from: 1, to: 1000 },
  A2: { from: 1001, to: 4000 },
  B1: { from: 4001, to: 10000 },
};

export const LEVEL_ENTRY_COUNTS: Readonly<Record<CefrLevel, number>> = {
  A1: 1000,
  A2: 3000,
  B1: 6000,
};

const BY_ID = new Map(FREQUENCY_BANDS.map((b) => [b.id, b]));
const BY_SLUG = new Map(FREQUENCY_BANDS.map((b) => [b.slug, b]));

export function isCefrLevel(value: string): value is CefrLevel {
  return (CEFR_LEVELS as readonly string[]).includes(value);
}

export function bandById(id: string): FrequencyBand | null {
  return BY_ID.get(id) ?? null;
}

export function bandBySlug(slug: string): FrequencyBand | null {
  return BY_SLUG.get(slug.toLowerCase()) ?? null;
}

export function bandsForLevel(level: CefrLevel): readonly FrequencyBand[] {
  return FREQUENCY_BANDS.filter((b) => b.level === level);
}

/** The band a global rank belongs to, or `null` when the rank is out of range. */
export function bandForRank(rank: number): FrequencyBand | null {
  return FREQUENCY_BANDS.find((b) => rank >= b.from && rank <= b.to) ?? null;
}

export function bandEntryCount(band: FrequencyBand): number {
  return band.to - band.from + 1;
}
