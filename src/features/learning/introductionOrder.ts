import { createRandom } from '@/features/practice/random';

/**
 * The order new words are introduced in, within one frequency band.
 *
 * The source list is a Goethe wordlist: its `rank` is topical for the first ~150 entries
 * (all the numbers, then time, then colours) and plain alphabetical after that. Walking it
 * verbatim means meeting thirty numbers in a row, then a run of B-words — words that are
 * hard to tell apart precisely because they arrive together.
 *
 * Shuffling inside the band breaks both clusters while keeping the band order itself
 * intact, so A1 Core 1 is still finished before A1 Core 2 and level progression is
 * untouched. The seed is the band id, so the introduction order is stable across sessions
 * and reloads — the same convention the session generators use.
 *
 * Not applied in `registry.loadBand`: the vocabulary browser and the band pages list words
 * and must stay in rank order.
 */
export function introductionOrder<T>(bandId: string, entries: readonly T[]): T[] {
  return createRandom(`introduce-${bandId}`).shuffle(entries);
}
