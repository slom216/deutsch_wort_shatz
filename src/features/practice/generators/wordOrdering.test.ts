import { beforeAll, describe, expect, it } from 'vitest';

import { createRandom } from '../random';
import { availableWordOrderingVariants, generateWordOrdering } from './wordOrdering';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import { loadPilotDataset } from '@/test/fixtures/pilotDataset';

let pilot: readonly VocabularyEntry[];

beforeAll(async () => {
  pilot = await loadPilotDataset();
});

function base(wordClass: string): VocabularyEntry {
  const entry = pilot.find((candidate) => candidate.wordClass === wordClass);
  if (!entry) throw new Error(`No ${wordClass} in the pilot dataset`);
  return entry;
}

describe('generateWordOrdering', () => {
  it('shows tokens without punctuation and accepts the order without it', () => {
    const entry = {
      ...base('noun'),
      exampleSentences: [
        {
          id: 'x',
          german: 'Ich lerne, weil ich die E-Mail lese.',
          english: 'I learn because I read the e-mail.',
          level: base('noun').level,
          targetTokens: ['E-Mail'],
        },
      ],
    } as VocabularyEntry;

    const exercise = generateWordOrdering(
      { entry, pool: pilot, random: createRandom('wo'), id: 'wo-1' },
      'sentenceReconstruction',
    );

    expect(exercise!.tokens).not.toContain('lerne,');
    expect(exercise!.acceptedOrders[0]).toEqual([
      'Ich',
      'lerne',
      'weil',
      'ich',
      'die',
      'E-Mail',
      'lese',
    ]);
    expect(exercise!.canonicalAnswer).toBe('Ich lerne, weil ich die E-Mail lese.');
  });

  it('never splits headword alternatives on "/" into tokens', () => {
    const entry = { ...base('phrase'), german: 'so viel/so viel wie' } as VocabularyEntry;

    expect(availableWordOrderingVariants(entry)).not.toContain('phraseReconstruction');
    expect(
      generateWordOrdering(
        { entry, pool: pilot, random: createRandom('wo'), id: 'wo-2' },
        'phraseReconstruction',
      ),
    ).toBeNull();
  });
});
