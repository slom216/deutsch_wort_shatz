/**
 * Seeded pseudo-random generator.
 *
 * Exercise generation must be reproducible: tests need deterministic distractors and
 * shuffles, and a session that is resumed after a refresh must rebuild identically.
 * Sessions seed this from their own id, so a given session always produces the same
 * exercises while different sessions differ.
 */

export interface Random {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** A new array with the elements shuffled. */
  shuffle<T>(items: readonly T[]): T[];
  /** `count` distinct elements, or fewer if the pool is smaller. */
  sample<T>(items: readonly T[], count: number): T[];
  /** One element, or undefined when the pool is empty. */
  pick<T>(items: readonly T[]): T | undefined;
}

/** 32-bit string hash, used to turn a session id into a numeric seed. */
export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, and good enough for shuffling exercise content. */
export function createRandom(seed: number | string): Random {
  let state = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (maxExclusive: number): number =>
    maxExclusive <= 0 ? 0 : Math.floor(next() * maxExclusive);

  const shuffle = <T>(items: readonly T[]): T[] => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = int(i + 1);
      const a = result[i] as T;
      const b = result[j] as T;
      result[i] = b;
      result[j] = a;
    }
    return result;
  };

  return {
    next,
    int,
    shuffle,
    sample: <T>(items: readonly T[], count: number): T[] => shuffle(items).slice(0, count),
    pick: <T>(items: readonly T[]): T | undefined => items[int(items.length)],
  };
}
