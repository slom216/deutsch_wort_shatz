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
  nearMiss,
  nearMissCandidates,
  pluralForm,
} from './index';
import { exerciseSchema } from '@/schemas/exerciseSchema';
import { isNounEntry, isPhraseEntry, isVerbEntry } from '@/schemas/vocabularySchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import {
  loadPilotDataset,
  PILOT_MIN_NOUNS,
  PILOT_MIN_PHRASES,
  PILOT_MIN_VERBS,
  PILOT_MIN_WORDS,
  PILOT_SIZE,
} from '@/test/fixtures/pilotDataset';

let pilot: readonly VocabularyEntry[];
const random = () => createRandom('test-seed');

/** True when `option` is one of the near misses the rules can build from `correct`. */
function isNearMiss(correct: string, option: string): boolean {
  return option !== correct && nearMissCandidates(correct).includes(option);
}

/** Every distinct near miss `correct` yields over `seeds` draws — the rules are random. */
function drawNearMisses(correct: string, taken: readonly string[] = [], seeds = 60): Set<string> {
  const drawn = new Set<string>();
  for (let i = 0; i < seeds; i += 1) {
    const miss = nearMiss(correct, createRandom(`draw-${correct}-${i}`), taken);
    if (miss !== null) drawn.add(miss);
  }
  return drawn;
}

function find(predicate: (entry: VocabularyEntry) => boolean): VocabularyEntry {
  const entry = pilot.find(predicate);
  if (!entry) throw new Error('No matching entry in the pilot dataset');
  return entry;
}

/**
 * Hand-written entries carrying grammar the datasets do not.
 *
 * `data/*.json` records a checked headword, gloss, word class and topic and nothing else,
 * so no shipped entry has an article, a plural, a conjugation or an example sentence. The
 * generators still support all four, and the formats that need them are covered here
 * rather than dropped — this is the fixture those tests draw on.
 */
const NOUN_FORMS: ReadonlyArray<[string, string, string, 'der' | 'die' | 'das']> = [
  ['Hund', 'dog', 'Hunde', 'der'],
  ['Katze', 'cat', 'Katzen', 'die'],
  ['Haus', 'house', 'Häuser', 'das'],
  ['Buch', 'book', 'Bücher', 'das'],
  ['Stadt', 'city', 'Städte', 'die'],
  ['Tisch', 'table', 'Tische', 'der'],
  ['Blume', 'flower', 'Blumen', 'die'],
  ['Kind', 'child', 'Kinder', 'das'],
];

/** Nouns with article and plural, built on the shape of a real dataset noun. */
function grammarNouns(): VocabularyEntry[] {
  const base = find((entry) => entry.wordClass === 'noun');
  return NOUN_FORMS.map(([german, english, plural, article], index) => ({
    ...base,
    id: `test-${String(index + 1).padStart(4, '0')}-${german.toLowerCase()}`,
    german,
    english: [english],
    searchableForms: [german, plural],
    article,
    plural,
    pluralArticle: 'die',
  })) as VocabularyEntry[];
}

/** A verb with the full form set §10 describes. */
function grammarVerb(): VocabularyEntry {
  const base = find((entry) => entry.wordClass === 'verb');
  return {
    ...base,
    id: 'test-0100-gehen',
    german: 'gehen',
    english: ['to go'],
    infinitive: 'gehen',
    thirdPersonPresent: 'geht',
    simplePast: 'ging',
    pastParticiple: 'gegangen',
    auxiliary: 'sein',
    separable: false,
    reflexive: false,
    fixedPrepositions: [],
  } as VocabularyEntry;
}

/** An entry carrying one example sentence, for the sentence-based formats. */
function entryWithExample(german: string, english: string, targetToken: string): VocabularyEntry {
  const base = find((entry) => entry.wordClass === 'noun');
  return {
    ...base,
    id: 'test-0200-example',
    german: targetToken,
    english: ['house'],
    // The datasets enable only the formats they can feed; an entry with a sentence can
    // feed the other two.
    exerciseConfig: {
      ...base.exerciseConfig,
      enabledTypes: [...base.exerciseConfig.enabledTypes, 'sentenceCompletion', 'wordOrdering'],
    },
    exampleSentences: [
      {
        id: 'test-example-1',
        german,
        english,
        level: base.level,
        targetTokens: [targetToken],
      },
    ],
  } as VocabularyEntry;
}

beforeAll(async () => {
  pilot = await loadPilotDataset();
});

describe('pilot dataset', () => {
  it('contains exactly 100 entries with the required composition', () => {
    expect(pilot).toHaveLength(PILOT_SIZE);
    expect(pilot.filter((e) => e.wordClass === 'noun').length).toBeGreaterThanOrEqual(
      PILOT_MIN_NOUNS,
    );
    expect(pilot.filter((e) => e.wordClass === 'verb').length).toBeGreaterThanOrEqual(
      PILOT_MIN_VERBS,
    );
    expect(pilot.filter((e) => e.kind === 'phrase').length).toBeGreaterThanOrEqual(
      PILOT_MIN_PHRASES,
    );
    expect(pilot.filter((e) => e.kind === 'word').length).toBeGreaterThanOrEqual(PILOT_MIN_WORDS);
    expect(new Set(pilot.map((e) => e.primaryTopic)).size).toBeGreaterThan(1);
  });

  it('is deterministic across loads', async () => {
    const again = await loadPilotDataset();
    expect(again.map((e) => e.id)).toEqual(pilot.map((e) => e.id));
  });
});

describe('near miss', () => {
  it('only ever returns something the rules could have built', () => {
    const words = pilot.flatMap((entry) => [headword(entry), entry.german, ...entry.english]);
    for (const word of words) {
      const miss = nearMiss(word, random());
      if (miss === null) continue;
      expect(isNearMiss(word, miss)).toBe(true);
      expect(miss).not.toBe(word);
    }
  });

  it.each([
    // The reported case: "der Tüvke" was noise, these are mistakes learners make.
    ['der Türke', ['der Turke', 'der Tuerke', 'die Türke', 'das Türke', 'der Türken']],
    ['die Straße', ['die Strasse', 'die Strase', 'der Straße', 'die Straßen']],
    ['vielleicht', ['veilleicht', 'villeicht', 'vieleicht', 'fielleicht']],
    ['das Auto', ['das Audo', 'der Auto', 'die Auto']],
    ['der Käse', ['der Kese', 'der Kase', 'der Kaese', 'der Käze']],
    ['die Wohnung', ['die Wohnen', 'der Wohnung', 'die Wonung', 'die Wohnunk']],
    ['der Hund', ['der Hunt', 'die Hund']],
    ['gehen', ['gehe', 'gehn', 'geen']],
  ])('builds plausible misspellings of %s', (correct, expected) => {
    // Against the candidates, not a sample: the draw is random and would miss some.
    expect(nearMissCandidates(correct)).toEqual(expect.arrayContaining(expected));
  });

  it.each([
    // The families that used to fire in both directions and produced pure noise.
    ['sprechen', 'ßprechen'], // ß cannot start a word
    ['das Auto', 'das Äuto'], // umlauts get dropped, not invented
    ['der Türke', 'der Türkee'], // nor do doubled letters
    ['der Türke', 'där Türke'], // and the article is never misspelled, only swapped
  ])('never builds %s → %s', (correct, rejected) => {
    expect(nearMissCandidates(correct)).not.toContain(rejected);
  });

  it('never lands on a form that is also right', () => {
    // The plural and the alternate article are exactly what the ending and article rules
    // reach for, so the caller has to block them.
    const blocked = ['die Joghurts', 'das Joghurt'];
    expect(drawNearMisses('der Joghurt', blocked)).not.toContain('das Joghurt');
    expect(drawNearMisses('der Joghurt', blocked)).not.toContain('die Joghurts');
  });

  it('gives up when there is nowhere to edit', () => {
    // A two-letter word has no interior letter to change or remove, but one can still be
    // added between its two letters: 'ja' → 'jla'.
    expect(nearMiss('ja', random())).not.toBeNull();
    expect(nearMiss('a', random())).toBeNull();
    expect(nearMiss('', random())).toBeNull();
  });

  it('never returns an excluded value', () => {
    const blocked = ['Tag', 'Tak', 'Tagen', 'Tage'];
    for (let i = 0; i < 50; i += 1) {
      const miss = nearMiss('Tag', createRandom(`near-${i}`), blocked);
      if (miss !== null) expect(blocked).not.toContain(miss);
    }
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

  it('carries the word class beside the question, except when it is the answer', () => {
    const entry = find((e) => e.wordClass === 'noun');
    const context = { entry, pool: pilot, random: random(), id: 'mc-class' };

    expect(generateMultipleChoice(context, 'englishToGerman')?.wordClass).toBe('noun');
    expect(generateMultipleChoice(context, 'germanToEnglish')?.wordClass).toBe('noun');
    expect(generateMultipleChoice(context, 'wordClass')?.wordClass).toBeUndefined();
  });

  it('offers the right answer misspelled by one interior letter, but only sometimes', () => {
    let withMiss = 0;
    let total = 0;

    for (const entry of pilot) {
      const exercise = generateMultipleChoice(
        {
          entry,
          pool: pilot,
          random: createRandom(`mc-near-${entry.id}`),
          id: `mc-near-${entry.id}`,
        },
        'englishToGerman',
      );
      if (!exercise) continue;

      const correct = exercise.options[exercise.correctIndex] as string;
      const misses = exercise.options.filter((option) => isNearMiss(correct, option));
      // Never more than one: a second would make the pair meaningless.
      expect(misses.length).toBeLessThanOrEqual(1);
      total += 1;
      if (misses.length === 1) withMiss += 1;
    }

    // Roughly half, not all and not none. Loose bounds — this is a coin flip per question.
    expect(withMiss).toBeGreaterThan(total * 0.2);
    expect(withMiss).toBeLessThan(total * 0.8);
  });

  it('never misspells an English gloss', () => {
    for (const entry of pilot) {
      const exercise = generateMultipleChoice(
        {
          entry,
          pool: pilot,
          random: createRandom(`mc-gloss-${entry.id}`),
          id: `mc-gloss-${entry.id}`,
        },
        'germanToEnglish',
      );
      if (!exercise) continue;

      const correct = exercise.options[exercise.correctIndex] as string;
      expect(exercise.options.filter((option) => isNearMiss(correct, option))).toHaveLength(0);
    }
  });

  it('never offers a near miss that is also an accepted answer', () => {
    for (const entry of pilot) {
      const exercise = generateMultipleChoice(
        {
          entry,
          pool: pilot,
          random: createRandom(`mc-acc-${entry.id}`),
          id: `mc-acc-${entry.id}`,
        },
        'englishToGerman',
      );
      if (!exercise) continue;

      const correct = exercise.options[exercise.correctIndex] as string;
      const misses = exercise.options.filter((option) => isNearMiss(correct, option));
      for (const miss of misses) expect(entry.searchableForms).not.toContain(miss);
    }
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

      // ±2 is the goal; the window widens only when too few candidates qualify. With a
      // 100-entry pool a short gloss can have no near-length neighbour at all, so the
      // requirement is conditional on the pool actually containing one.
      const within = deltas.filter((delta) => delta <= 2).length;
      const poolHasNearLength = pilot.some(
        (other) => other.id !== entry.id && Math.abs((other.english[0] ?? '').length - target) <= 2,
      );
      if (poolHasNearLength) expect(within).toBeGreaterThan(0);
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
    const entry = grammarNouns()[0] as VocabularyEntry;
    const exercise = generateMultipleChoice(
      { entry, pool: grammarNouns(), random: random(), id: 'mc-2' },
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
    const nouns = grammarNouns();
    const entry = nouns[0] as VocabularyEntry;
    const exercise = generateMultipleChoice(
      { entry, pool: nouns, random: random(), id: 'mc-5' },
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
    const entry = grammarNouns()[0] as VocabularyEntry;
    const exercise = generateTypedTranslation(
      { entry, pool: grammarNouns(), random: random(), id: 'tt-1' },
      'nounWithArticle',
    );

    expect(exercise?.answerLanguage).toBe('de');
    expect(exercise?.canonicalAnswer).toBe(headword(entry));
    expect(exercise?.strictness.article).toBe(true);
    expect(exercise?.requiresTypedInput).toBe(true);
  });

  it('asks for the past participle of a verb', () => {
    const entry = grammarVerb();
    const exercise = generateTypedTranslation(
      { entry, pool: pilot, random: random(), id: 'tt-2' },
      'verbForm',
    );
    expect(exercise?.acceptedAnswers).toEqual([isVerbEntry(entry) ? entry.pastParticiple : '']);
  });

  it('produces no verb-form question when the dataset records no conjugation', () => {
    const entry = find((e) => e.wordClass === 'verb');
    expect(isVerbEntry(entry) ? entry.pastParticiple : 'x').toBeUndefined();
    expect(
      generateTypedTranslation({ entry, pool: pilot, random: random(), id: 'tt-2b' }, 'verbForm'),
    ).toBeNull();
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
  it('splits an example sentence around its target token', () => {
    const entry = entryWithExample(
      'Das Haus ist sehr alt und schön',
      'The house is very old and beautiful',
      'Haus',
    );

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
    const entry = entryWithExample(
      'Das Haus ist sehr alt und schön',
      'The house is very old and beautiful',
      'Haus',
    );
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
    const nouns = grammarNouns();
    expect(nouns.every((entry) => pluralForm(entry) !== null)).toBe(true);
    expect(availableMatchingVariants(nouns)).toContain('nounToPlural');
  });
});

describe('word ordering', () => {
  it('produces 4 to 12 shuffled tokens that rebuild the sentence', () => {
    const entry = entryWithExample(
      'Das Haus ist sehr alt und schön',
      'The house is very old and beautiful',
      'Haus',
    );

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
    const entry = entryWithExample(
      'Das Haus ist sehr alt und schön',
      'The house is very old and beautiful',
      'Haus',
    );
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

  it('covers every format the dataset can feed, across the pilot set', () => {
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
    // Sentence completion and word ordering need example sentences, which the datasets do
    // not carry (word ordering also runs on a long enough phrase, of which A1 has none).
    expect(types).toEqual(new Set(['multipleChoice', 'typedTranslation', 'listening', 'speaking']));
  });

  it('adds the sentence-based formats for an entry that has an example', () => {
    const entry = entryWithExample(
      'Das Haus ist sehr alt und schön',
      'The house is very old and beautiful',
      'Haus',
    );
    const types = new Set(
      generateAllForEntry({ entry, pool: pilot, random: random(), id: 'cover-example' }).map(
        (exercise) => exercise.type,
      ),
    );
    expect(types).toContain('sentenceCompletion');
    expect(types).toContain('wordOrdering');
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
    const noun = find((e) => isNounEntry(e));
    expect(canGenerate(noun, 'multipleChoice', pilot, random())).toBe(true);
    // No example sentences in the datasets, so no gap-fill for a shipped entry.
    expect(canGenerate(noun, 'sentenceCompletion', pilot, random())).toBe(false);
  });
});
