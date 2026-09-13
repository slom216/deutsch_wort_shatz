/**
 * Frequency-band registry (DEVELOPMENT_INSTRUCTIONS §8).
 *
 * Frequency rank always has priority over topic order. Each band is a contiguous,
 * non-overlapping global rank range; together the twelve bands cover ranks 1–3,444
 * exactly. Bands are also the unit of code splitting for the vocabulary bundles (§29).
 *
 * The datasets in `data/` rank each level from 1, so the build lays the levels end to end
 * — A1, then A2, then B1 — to produce the global rank these ranges are stated in. The
 * band boundaries below and the counts in `LEVEL_ENTRY_COUNTS` are therefore two views of
 * the same fact, and `build:content` fails loudly when a dataset stops matching them.
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
  band('A1 Core 1', 'A1', 1, 200),
  band('A1 Core 2', 'A1', 201, 400),
  band('A1 Core 3', 'A1', 401, 600),
  band('A1 Core 4', 'A1', 601, 799),
  band('A2 High 1', 'A2', 800, 974),
  band('A2 High 2', 'A2', 975, 1149),
  band('A2 Medium 1', 'A2', 1150, 1324),
  band('A2 Medium 2', 'A2', 1325, 1489),
  band('B1 High 1', 'B1', 1490, 1978),
  band('B1 High 2', 'B1', 1979, 2467),
  band('B1 Medium 1', 'B1', 2468, 2956),
  band('B1 Medium 2', 'B1', 2957, 3444),
];

/** Total number of entries the datasets contain (§2). */
export const TOTAL_ENTRY_COUNT = 3_444;

export const LEVEL_RANK_RANGES: Readonly<Record<CefrLevel, { from: number; to: number }>> = {
  A1: { from: 1, to: 799 },
  A2: { from: 800, to: 1489 },
  B1: { from: 1490, to: 3444 },
};

export const LEVEL_ENTRY_COUNTS: Readonly<Record<CefrLevel, number>> = {
  A1: 799,
  A2: 690,
  B1: 1955,
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
