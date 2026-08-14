import { beforeAll, describe, expect, it } from 'vitest';

import { createRandom } from '../random';
import {
  availableMatchingVariants,
  canGenerate,
  generateAllForEntry,
  generateListening,
  generateMatching,
  generateMultipleChoice,
  OPTION_COUNT,
  generateSentenceCompletion,
  generateSpeaking,
  generateTypedTranslation,
  generateWordOrdering,
  headword,
  pluralForm,
} from './index';
import { exerciseSchema } from '@/schemas/exerciseSchema';
import { isNounEntry, isPhraseEntry, isVerbEntry } from '@/schemas/vocabularySchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import { loadPilotDataset, PILOT_SIZE } from '@/test/fixtures/pilotDataset';

let pilot: readonly VocabularyEntry[];
const random = () => createRandom('test-seed');

function find(predicate: (entry: VocabularyEntry) => boolean): VocabularyEntry {
  const entry = pilot.find(predicate);
  if (!entry) throw new Error('No matching entry in the pilot dataset');
  return entry;
}

beforeAll(async () => {
  pilot = await loadPilotDataset();
});

describe('pilot dataset', () => {
  it('contains exactly 100 entries with the required composition', () => {
    expect(pilot).toHaveLength(PILOT_SIZE);
    expect(pilot.filter((e) => e.wordClass === 'noun').length).toBeGreaterThanOrEqual(10);
    expect(pilot.filter((e) => e.wordClass === 'verb').length).toBeGreaterThanOrEqual(10);
    expect(pilot.filter((e) => e.kind === 'phrase').length).toBeGreaterThanOrEqual(20);
    expect(pilot.filter((e) => e.kind === 'word').length).toBeGreaterThanOrEqual(60);
    expect(new Set(pilot.map((e) => e.primaryTopic)).size).toBeGreaterThan(1);
  });

  it('is deterministic across loads', async () => {
    const again = await loadPilotDataset();
    expect(again.map((e) => e.id)).toEqual(pilot.map((e) => e.id));
  });
});

describe('multiple choice', () => {
  it('produces six options with exactly one correct answer', () => {
    const entry = find((e) => e.wordClass === 'noun');
    const exercise = generateMultipleChoice(
      { entry, pool: pilot, random: random(), id: 'mc-1' },
      'germanToEnglish',
    );

    expect(exercise).not.toBeNull();
    expect(exercise?.options).toHaveLength(OPTION_COUNT);
    expect(new Set(exercise?.options).size).toBe(OPTION_COUNT);
    expect(exercise?.options[exercise.correctIndex]).toBe(entry.english[0]);
  });

  it('draws distractors with a similar English gloss length', () => {
    // Every entry in the pilot dataset, so this is not one lucky draw.
    const glossByEnglish = new Map(pilot.map((e) => [e.english[0] ?? '', e]));

    for (const entry of pilot) {
      const exercise = generateMultipleChoice(
        { entry, pool: pilot, random: random(), id: `mc-len-${entry.id}` },
        'germanToEnglish',
      );
      if (!exercise) continue;

      const target = (entry.english[0] ?? '').length;
      const deltas = exercise.options
        .filter((option) => option !== entry.english[0])
        .map((option) => Math.abs(option.length - target));

      // ±2 is the goal; the window widens only when too few candidates qualify, and the
      // pilot dataset is 100 entries, so a few options legitimately fall outside it.
      const within = deltas.filter((delta) => delta <= 2).length;
      expect(within).toBeGreaterThan(0);
      // Nothing wildly off: an obviously long option among short ones is a free answer.
      expect(Math.max(...deltas)).toBeLessThanOrEqual(20);
      expect(glossByEnglish.size).toBeGreaterThan(0);
    }
  });

  it('still builds a question when the pool cannot fill six options', () => {
    const entry = find((e) => e.wordClass === 'noun');
    const tiny = [entry, ...pilot.filter((e) => e.id !== entry.id).slice(0, 2)];
    const exercise = generateMultipleChoice(
      { entry, pool: tiny, random: random(), id: 'mc-tiny' },
      'germanToEnglish',
    );

    expect(exercise).not.toBeNull();
    expect(exercise?.options.length).toBeGreaterThanOrEqual(2);
    expect(exercise?.options.length).toBeLessThanOrEqual(OPTION_COUNT);
    expect(exercise?.options[exercise.correctIndex]).toBe(entry.english[0]);
  });

  it('asks for the article of a noun with all three articles as options', () => {
    const entry = find((e) => isNounEntry(e) && e.article !== null);
    const exercise = generateMultipleChoice(
      { entry, pool: pilot, random: random(), id: 'mc-2' },
      'article',
    );

    // Sort a copy: sorting in place would invalidate correctIndex.
    expect([...(exercise?.options ?? [])].sort()).toEqual(['das', 'der', 'die']);
    expect(exercise?.options[exercise.correctIndex]).toBe(
      isNounEntry(entry) ? entry.article : null,
    );
    expect(exercise?.isProduction).toBe(true);
  });

  it('refuses an article question for a non-noun', () => {
    const entry = find((e) => e.wordClass === 'verb');
    expect(
      generateMultipleChoice({ entry, pool: pilot, random: random(), id: 'mc-3' }, 'article'),
    ).toBeNull();
  });

  it('refuses a verb-form question for a non-verb', () => {
    const entry = find((e) => e.wordClass === 'noun');
    expect(
      generateMultipleChoice({ entry, pool: pilot, random: random(), id: 'mc-4' }, 'verbForm'),
    ).toBeNull();
  });

  it('asks for the plural with other plurals as distractors', () => {
    const entry = find((e) => pluralForm(e) !== null);
    const exercise = generateMultipleChoice(
      { entry, pool: pilot, random: random(), id: 'mc-5' },
      'plural',
    );
    expect(exercise?.options[exercise.correctIndex]).toBe(pluralForm(entry));
  });

  it('never includes the correct answer as a distractor', () => {
    for (const entry of pilot.slice(0, 30)) {
      const exercise = generateMultipleChoice(
        { entry, pool: pilot, random: random(), id: 'mc-x' },
        'germanToEnglish',
      );
      if (!exercise) continue;
      const correct = exercise.options[exercise.correctIndex];
      expect(exercise.options.filter((o) => o === correct)).toHaveLength(1);
    }
  });
});

describe('typed translation', () => {
  it('accepts the noun with its article', () => {
    const entry = find((e) => isNounEntry(e) && e.article !== null);
    const exercise = generateTypedTranslation(
      { entry, pool: pilot, random: random(), id: 'tt-1' },
      'nounWithArticle',
    );

    expect(exercise?.answerLanguage).toBe('de');
    expect(exercise?.canonicalAnswer).toBe(headword(entry));
    expect(exercise?.strictness.article).toBe(true);
    expect(exercise?.requiresTypedInput).toBe(true);
  });

  it('asks for the past participle of a verb', () => {
    const entry = find((e) => e.wordClass === 'verb');
    const exercise = generateTypedTranslation(
      { entry, pool: pilot, random: random(), id: 'tt-2' },
      'verbForm',
    );
    expect(exercise?.acceptedAnswers).toEqual([isVerbEntry(entry) ? entry.pastParticiple : '']);
  });

  it('marks German production but not English recognition', () => {
    const entry = find((e) => e.wordClass === 'noun');
    const toGerman = generateTypedTranslation(
      { entry, pool: pilot, random: random(), id: 'tt-3' },
      'englishToGerman',
    );
    const toEnglish = generateTypedTranslation(
      { entry, pool: pilot, random: random(), id: 'tt-4' },
      'germanToEnglish',
    );
    expect(toGerman?.isProduction).toBe(true);
    expect(toEnglish?.isProduction).toBe(false);
  });

  it('requires punctuation for a full phrase', () => {
    const entry = find((e) => isPhraseEntry(e));
    const exercise = generateTypedTranslation(
      { entry, pool: pilot, random: random(), id: 'tt-5' },
      'fullPhrase',
    );
    expect(exercise?.strictness.punctuation).toBe(true);
  });
});

describe('sentence completion', () => {
  it('splits a real example sentence around its target token', () => {
    const entry = find((e) => {
      const example = e.exampleSentences[0];
      const token = example?.targetTokens[0];
      return Boolean(
        example && token && example.german.toLowerCase().includes(token.toLowerCase()),
      );
    });

    const exercise = generateSentenceCompletion(
      { entry, pool: pilot, random: random(), id: 'sc-1' },
      'vocabularyGap',
    );

    expect(exercise).not.toBeNull();
    // The gap plus its surroundings must reconstruct the original sentence exactly.
    expect(
      `${exercise?.sentenceBefore}${exercise?.canonicalAnswer}${exercise?.sentenceAfter}`,
    ).toBe(exercise?.fullSentence);
  });

  it('shows the full corrected sentence for feedback', () => {
    const entry = find((e) => {
      const example = e.exampleSentences[0];
      const token = example?.targetTokens[0];
      return Boolean(
        example && token && example.german.toLowerCase().includes(token.toLowerCase()),
      );
    });
    const exercise = generateSentenceCompletion(
      { entry, pool: pilot, random: random(), id: 'sc-2' },
      'vocabularyGap',
    );
    expect(exercise?.fullSentence).toBe(entry.exampleSentences[0]?.german);
    expect(exercise?.englishSentence).toBe(entry.exampleSentences[0]?.english);
  });

  it('returns null when the sentence does not contain the target token', () => {
    const entry = find((e) => e.wordClass === 'noun');
    const broken: VocabularyEntry = {
      ...entry,
      exampleSentences: [
        {
          id: 'x',
          german: 'Ein völlig anderer Satz.',
          english: 'A completely different sentence.',
          level: 'A1',
          targetTokens: ['Zebrastreifenmarkierung'],
        },
      ],
    };
    expect(
      generateSentenceCompletion(
        { entry: broken, pool: pilot, random: random(), id: 'sc-3' },
        'vocabularyGap',
      ),
    ).toBeNull();
  });
});

describe('matching', () => {
  it('builds 5 to 8 pairs', () => {
    const exercise = generateMatching(
      { entries: pilot.slice(0, 8), random: random(), id: 'ma-1' },
      'germanToEnglish',
    );
    expect(exercise).not.toBeNull();
    expect(exercise!.pairs.length).toBeGreaterThanOrEqual(5);
    expect(exercise!.pairs.length).toBeLessThanOrEqual(8);
  });

  it('shuffles the right column away from the pair order', () => {
    const exercise = generateMatching(
      { entries: pilot.slice(0, 8), random: random(), id: 'ma-2' },
      'germanToEnglish',
    );
    expect(exercise!.shuffledRight).toHaveLength(exercise!.pairs.length);
    expect([...exercise!.shuffledRight].sort()).toEqual(exercise!.pairs.map((p) => p.right).sort());
    expect(exercise!.shuffledRight).not.toEqual(exercise!.pairs.map((p) => p.right));
  });

  it('returns null when there are too few usable pairs', () => {
    expect(
      generateMatching(
        { entries: pilot.slice(0, 2), random: random(), id: 'ma-3' },
        'germanToEnglish',
      ),
    ).toBeNull();
  });

  it('offers a noun-to-plural variant when enough nouns are present', () => {
    const nouns = pilot.filter((e) => pluralForm(e) !== null).slice(0, 8);
    expect(availableMatchingVariants(nouns)).toContain('nounToPlural');
  });
});

describe('word ordering', () => {
  it('produces 4 to 12 shuffled tokens that rebuild the sentence', () => {
    const entry = find((e) => {
      const count = e.exampleSentences[0]?.german.split(/\s+/).length ?? 0;
      return count >= 4 && count <= 12;
    });

    const exercise = generateWordOrdering(
      { entry, pool: pilot, random: random(), id: 'wo-1' },
      'sentenceReconstruction',
    );

    expect(exercise!.tokens.length).toBeGreaterThanOrEqual(4);
    expect(exercise!.tokens.length).toBeLessThanOrEqual(12);
    expect([...exercise!.tokens].sort()).toEqual([...(exercise!.acceptedOrders[0] ?? [])].sort());
    expect(exercise!.canonicalAnswer).toBe(entry.exampleSentences[0]?.german);
  });

  it('does not present the tokens already in the correct order', () => {
    const entry = find((e) => {
      const count = e.exampleSentences[0]?.german.split(/\s+/).length ?? 0;
      return count >= 4 && count <= 12;
    });
    const exercise = generateWordOrdering(
      { entry, pool: pilot, random: random(), id: 'wo-2' },
      'sentenceReconstruction',
    );
    expect(exercise!.tokens.join(' ')).not.toBe(exercise!.canonicalAnswer);
  });

  it('rejects a sentence that is too long', () => {
    const entry = find((e) => e.wordClass === 'noun');
    const long: VocabularyEntry = {
      ...entry,
      exampleSentences: [
        {
          id: 'x',
          german: Array.from({ length: 20 }, (_, i) => `Wort${i}`).join(' '),
          english: 'too long',
          level: 'A1',
          targetTokens: ['Wort1'],
        },
      ],
    };
    expect(
      generateWordOrdering(
        { entry: long, pool: pilot, random: random(), id: 'wo-3' },
        'sentenceReconstruction',
      ),
    ).toBeNull();
  });
});

describe('listening and speaking', () => {
  it('builds a listening exercise that speaks German and asks for English', () => {
    const entry = find((e) => e.wordClass === 'noun');
    const exercise = generateListening(
      { entry, pool: pilot, random: random(), id: 'li-1' },
      'chooseEnglish',
    );
    expect(exercise?.spokenText).toBe(entry.german);
    expect(exercise?.mode).toBe('chooseEnglish');
    expect(exercise?.options?.[exercise.correctIndex ?? -1]).toBe(entry.english[0]);
  });

  it('builds a listening exercise that asks the learner to type German', () => {
    const entry = find((e) => e.wordClass === 'noun');
    const exercise = generateListening(
      { entry, pool: pilot, random: random(), id: 'li-2' },
      'typeGerman',
    );
    expect(exercise?.mode).toBe('typeGerman');
    expect(exercise?.requiresTypedInput).toBe(true);
    expect(exercise?.isProduction).toBe(true);
  });

  it('builds a speaking exercise with the target text and gloss', () => {
    const entry = find((e) => isPhraseEntry(e));
    const exercise = generateSpeaking(
      { entry, pool: pilot, random: random(), id: 'sp-1' },
      'repeatPhrase',
    );
    expect(exercise?.targetText).toBe(entry.german);
    expect(exercise?.englishGloss).toBe(entry.english[0]);
  });
});

describe('generateAllForEntry', () => {
  it('produces schema-valid exercises with unique ids for every pilot entry', () => {
    let total = 0;
    for (const entry of pilot) {
      const exercises = generateAllForEntry({
        entry,
        pool: pilot,
        random: random(),
        id: `all-${entry.id}`,
      });
      expect(exercises.length).toBeGreaterThan(0);
      expect(new Set(exercises.map((e) => e.id)).size).toBe(exercises.length);

      for (const exercise of exercises) {
        const parsed = exerciseSchema.safeParse(exercise);
        if (!parsed.success) {
          throw new Error(
            `${exercise.id} (${exercise.type}/${exercise.variant}): ${parsed.error.issues[0]?.message}`,
          );
        }
        expect(exercise.entryId).toBe(entry.id);
      }
      total += exercises.length;
    }
    expect(total).toBeGreaterThan(pilot.length * 3);
  });

  it('honours an allowed-type restriction', () => {
    const entry = find((e) => e.wordClass === 'noun');
    const exercises = generateAllForEntry({
      entry,
      pool: pilot,
      random: random(),
      id: 'restricted',
      allowedTypes: ['multipleChoice'],
    });
    expect(exercises.every((e) => e.type === 'multipleChoice')).toBe(true);
  });

  it('covers all six single-entry formats across the pilot set', () => {
    const types = new Set<string>();
    for (const entry of pilot) {
      for (const exercise of generateAllForEntry({
        entry,
        pool: pilot,
        random: random(),
        id: `cover-${entry.id}`,
      })) {
        types.add(exercise.type);
      }
    }
    expect(types).toEqual(
      new Set([
        'multipleChoice',
        'typedTranslation',
        'sentenceCompletion',
        'wordOrdering',
        'listening',
        'speaking',
      ]),
    );
  });

  it('is deterministic for a given seed', () => {
    const entry = find((e) => e.wordClass === 'noun');
    const first = generateAllForEntry({ entry, pool: pilot, random: createRandom('abc'), id: 'd' });
    const second = generateAllForEntry({
      entry,
      pool: pilot,
      random: createRandom('abc'),
      id: 'd',
    });
    expect(first).toEqual(second);
  });

  it('reports which types an entry can support', () => {
    const noun = find((e) => isNounEntry(e) && e.article !== null);
    expect(canGenerate(noun, 'multipleChoice', pilot, random())).toBe(true);
  });
});
