import { describe, expect, it } from 'vitest';

import { vocabularyEntrySchema } from '@/schemas/vocabularySchema';
// @ts-expect-error -- untyped Node build script
import { expandEntry } from '../../../scripts/lib/loadDataset.mjs';

const row = (fields: Record<string, unknown>) => ({
  rank: 1,
  level: 'A1',
  kind: 'word',
  primaryTopic: 'Daily routine',
  ...fields,
});

const expand = (fields: Record<string, unknown>, sentences: object[] = []) => {
  const entry = expandEntry(row(fields), 1, 100, sentences);
  expect(vocabularyEntrySchema.safeParse(entry).error?.issues).toBeUndefined();
  return entry;
};

describe('expandEntry', () => {
  it('ships a noun bare, with article, plural and the plural in its search forms', () => {
    const entry = expand(
      {
        id: 'a1-das-buch',
        german: 'das Buch',
        english: ['book'],
        wordClass: 'noun',
        article: 'das',
        plural: 'Bücher',
        numberUsage: 'both',
      },
      [{ de: 'Die Bücher liegen auf dem Tisch.', en: 'The books are on the table.' }],
    );
    expect(entry).toMatchObject({
      id: 'a1-das-buch',
      german: 'Buch',
      article: 'das',
      plural: 'Bücher',
      pluralArticle: 'die',
      numberUsage: 'both',
    });
    expect(entry.searchableForms).toEqual(['das Buch', 'Buch', 'Bücher', 'die Bücher']);
    expect(entry.exampleSentences[0].targetTokens).toEqual(['Bücher']);
    expect(entry.exerciseConfig.strictness).toMatchObject({ article: true, plural: true });
    expect(entry.exerciseConfig.requiredRecall).toMatchObject({ article: true, plural: true });
    expect(entry.exerciseConfig.acceptedAnswers.plural).toEqual(['die Bücher']);
    expect(entry.exerciseConfig.enabledTypes).toEqual(
      expect.arrayContaining(['sentenceCompletion', 'wordOrdering']),
    );
  });

  it('keeps a plural-only noun without a plural', () => {
    const entry = expand({
      id: 'a1-die-eltern',
      german: 'die Eltern',
      english: ['parents'],
      wordClass: 'noun',
      article: 'die',
      plural: null,
      numberUsage: 'pluralOnly',
    });
    expect(entry).toMatchObject({ german: 'Eltern', plural: null, pluralArticle: null });
    expect(entry.exerciseConfig.strictness).toMatchObject({ article: true, plural: false });
  });

  it('finds either half of a separable verb form in its example', () => {
    const entry = expand(
      {
        id: 'a1-abfahren',
        german: 'abfahren',
        english: ['to depart'],
        wordClass: 'verb',
        thirdPersonPresent: 'fährt ab',
        simplePast: 'fuhr ab',
        pastParticiple: 'abgefahren',
        auxiliary: 'sein',
        separable: true,
        reflexive: false,
      },
      [{ de: 'Der Zug fährt um acht Uhr ab.', en: 'The train leaves at eight.' }],
    );
    expect(entry).toMatchObject({ infinitive: 'abfahren', auxiliary: 'sein', separable: true });
    expect(entry.exampleSentences[0].targetTokens).toEqual(['fährt']);
    expect(entry.searchableForms).toEqual(['abfahren', 'fährt ab', 'fuhr ab', 'abgefahren']);
    expect(entry.exerciseConfig.acceptedAnswers.pastParticiple).toEqual(['abgefahren']);
    expect(entry.exerciseConfig.requiredRecall).toMatchObject({
      pastParticiple: true,
      auxiliary: true,
    });
  });

  it('accepts and searches a phrase by its alternate forms', () => {
    const entry = expand({
      id: 'a1-wie-geht-es-dir',
      kind: 'phrase',
      german: 'Wie geht es dir?',
      english: ['How are you?'],
      wordClass: 'phrase',
      alternateForms: ['Wie geht’s dir?'],
    });
    expect(entry.exerciseConfig.acceptedAnswers.german).toEqual([
      'Wie geht es dir?',
      'Wie geht’s dir?',
    ]);
    expect(entry.searchableForms).toContain('Wie geht’s dir?');
    expect(entry.exerciseConfig.enabledTypes).toContain('wordOrdering');
  });

  it('targets the inflected verb in an example, or the recorded form', () => {
    const verb = {
      id: 'a1-gehen',
      german: 'gehen',
      english: ['to go'],
      wordClass: 'verb',
      thirdPersonPresent: 'geht',
      simplePast: 'ging',
      pastParticiple: 'gegangen',
      auxiliary: 'sein',
      separable: false,
      reflexive: false,
    };
    const inflected = expand(verb, [
      { de: 'Wir sind ins Kino gegangen.', en: 'We went to the cinema.' },
    ]);
    expect(inflected.exampleSentences[0].targetTokens).toEqual(['gegangen']);
    const recorded = expand(verb, [{ de: 'Gehst du mit?', en: 'Are you coming?', form: 'Gehst' }]);
    expect(recorded.exampleSentences[0].targetTokens).toEqual(['Gehst']);
  });

  it('refuses a row without an id', () => {
    expect(() =>
      expandEntry(row({ german: 'ja', english: ['yes'], wordClass: 'other' }), 1, 1),
    ).toThrow(/no id/);
  });
});
