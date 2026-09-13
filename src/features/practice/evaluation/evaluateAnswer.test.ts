import { describe, expect, it } from 'vitest';

import { evaluateAnswer, evaluateChoice, isNearMiss, wordVerdicts } from './evaluateAnswer';
import type { Strictness } from '@/schemas/exerciseSchema';

const STRICT: Strictness = {
  capitalization: true,
  umlauts: true,
  eszett: true,
  article: true,
  plural: true,
  punctuation: true,
  wordOrder: true,
};

const LENIENT: Strictness = {
  capitalization: false,
  umlauts: false,
  eszett: false,
  article: false,
  plural: false,
  punctuation: false,
  wordOrder: false,
};

function categories(submitted: string, accepted: string[], strictness = STRICT, extra = {}) {
  return evaluateAnswer(submitted, accepted, {
    strictness,
    language: 'de',
    ...extra,
  }).issues.map((i) => i.category);
}

describe('evaluateAnswer — correctness', () => {
  it('accepts an exact match', () => {
    const result = evaluateAnswer('die Straße', ['die Straße'], {
      strictness: STRICT,
      language: 'de',
    });
    expect(result.correct).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('ignores surrounding and repeated whitespace', () => {
    const result = evaluateAnswer('  die   Straße  ', ['die Straße'], {
      strictness: STRICT,
      language: 'de',
    });
    expect(result.correct).toBe(true);
  });

  it('accepts any configured alternative', () => {
    const result = evaluateAnswer('auto', ['das Auto', 'auto'], {
      strictness: STRICT,
      language: 'de',
    });
    expect(result.correct).toBe(true);
    expect(result.expectedAnswer).toBe('auto');
  });

  it('rejects an empty answer', () => {
    const result = evaluateAnswer('   ', ['die Straße'], { strictness: STRICT, language: 'de' });
    expect(result.correct).toBe(false);
    expect(result.issues[0]?.message).toMatch(/enter an answer/i);
  });
});

describe('evaluateAnswer — strict spelling dimensions', () => {
  it('reports both capitalization and ß, as §16 requires', () => {
    const result = evaluateAnswer('die strasse', ['die Straße'], {
      strictness: STRICT,
      language: 'de',
    });

    expect(result.correct).toBe(false);
    expect(result.issues.map((i) => i.category)).toEqual(
      expect.arrayContaining(['wrongCapitalization', 'ssInsteadOfEszett']),
    );
    expect(result.issues.map((i) => i.message).join(' ')).toMatch(/Straße is written with ß/);
  });

  it('flags a lowercase noun', () => {
    expect(categories('der tisch', ['der Tisch'])).toContain('wrongCapitalization');
  });

  it('flags a missing umlaut written as the base vowel', () => {
    expect(categories('schon', ['schön'])).toContain('missingUmlaut');
  });

  it('flags an umlaut written as a digraph', () => {
    expect(categories('schoen', ['schön'])).toContain('missingUmlaut');
  });

  it('flags ss written for ß', () => {
    expect(categories('Fuss', ['Fuß'])).toContain('ssInsteadOfEszett');
  });

  it('flags missing punctuation in a full phrase', () => {
    expect(categories('Wie geht es Ihnen', ['Wie geht es Ihnen?'])).toContain('punctuationError');
  });

  it('does not report a dimension the exercise treats as non-strict', () => {
    const result = evaluateAnswer('die strasse', ['die Straße'], {
      strictness: LENIENT,
      language: 'de',
    });
    expect(result.correct).toBe(true);
  });

  it('keeps capitalization significant even when umlauts are not', () => {
    const strictness: Strictness = { ...LENIENT, capitalization: true };
    const result = evaluateAnswer('strasse', ['Straße'], { strictness, language: 'de' });
    expect(result.correct).toBe(false);
    expect(result.issues.map((i) => i.category)).toContain('wrongCapitalization');
  });
});

describe('evaluateAnswer — articles', () => {
  it('flags a missing article', () => {
    const result = evaluateAnswer('Tisch', ['der Tisch'], {
      strictness: STRICT,
      language: 'de',
      answerRole: 'translation',
    });
    expect(result.correct).toBe(false);
    expect(result.issues.map((i) => i.category)).toContain('missingArticle');
    expect(result.issues[0]?.message).toMatch(/"der"/);
  });

  it('flags a wrong article and names the right one', () => {
    const result = evaluateAnswer('die Tisch', ['der Tisch'], {
      strictness: STRICT,
      language: 'de',
    });
    expect(result.issues.map((i) => i.category)).toContain('wrongArticle');
    expect(result.issues[0]?.message).toMatch(/"der".*"die"/);
  });

  it('ignores the article when the exercise does not require it', () => {
    const strictness: Strictness = { ...STRICT, article: false };
    const result = evaluateAnswer('Tisch', ['Tisch'], { strictness, language: 'de' });
    expect(result.correct).toBe(true);
  });

  it('still requires the article when the exercise explicitly asks for it', () => {
    const strictness: Strictness = { ...STRICT, article: false };
    const result = evaluateAnswer('Tisch', ['der Tisch'], {
      strictness,
      language: 'de',
      requireArticle: true,
    });
    expect(result.issues.map((i) => i.category)).toContain('missingArticle');
  });

  it('reports a wrong article and a lowercase noun together', () => {
    const result = evaluateAnswer('die tisch', ['der Tisch'], {
      strictness: STRICT,
      language: 'de',
    });
    expect(result.issues.map((i) => i.category)).toEqual(
      expect.arrayContaining(['wrongArticle', 'wrongCapitalization']),
    );
  });
});

describe('evaluateAnswer — plurals and verb forms', () => {
  it('classifies a wrong plural using the answer role', () => {
    expect(categories('die Tischs', ['die Tische'], STRICT, { answerRole: 'plural' })).toContain(
      'wrongPlural',
    );
  });

  it('classifies a wrong verb form using the answer role', () => {
    expect(categories('gehte', ['ging'], STRICT, { answerRole: 'verbForm' })).toContain(
      'wrongConjugation',
    );
  });

  it('accepts the correct participle', () => {
    const result = evaluateAnswer('gegangen', ['gegangen'], {
      strictness: STRICT,
      language: 'de',
      answerRole: 'verbForm',
    });
    expect(result.correct).toBe(true);
  });

  it('flags an umlaut mistake in a plural rather than calling it a wrong plural', () => {
    const result = evaluateAnswer('die Bucher', ['die Bücher'], {
      strictness: STRICT,
      language: 'de',
      answerRole: 'plural',
    });
    expect(result.issues.map((i) => i.category)).toContain('missingUmlaut');
  });
});

describe('evaluateAnswer — word order and tokens', () => {
  it('flags a reordering of the same words', () => {
    expect(categories('Ihnen geht es wie', ['wie geht es Ihnen'])).toContain('wordOrderError');
  });

  it('flags a missing word', () => {
    const result = evaluateAnswer('Wie geht Ihnen', ['Wie geht es Ihnen'], {
      strictness: STRICT,
      language: 'de',
    });
    expect(result.issues.map((i) => i.category)).toContain('missingToken');
    expect(result.issues.map((i) => i.message).join(' ')).toMatch(/es/);
  });

  it('flags an extra word', () => {
    const result = evaluateAnswer('Wie geht es dir Ihnen', ['Wie geht es Ihnen'], {
      strictness: STRICT,
      language: 'de',
    });
    expect(result.issues.map((i) => i.category)).toContain('extraToken');
  });

  it('reports a completely unrelated answer as a meaning error', () => {
    expect(categories('Guten Morgen', ['Wie geht es Ihnen'])).toEqual(['wrongMeaning']);
  });

  it('does not treat a single wrong word as a word-order error', () => {
    expect(categories('Haus', ['Tisch'])).not.toContain('wordOrderError');
  });
});

describe('evaluateAnswer — English direction', () => {
  it('accepts an English translation', () => {
    const result = evaluateAnswer('the table', ['the table', 'table'], {
      strictness: { ...STRICT, capitalization: false },
      language: 'en',
    });
    expect(result.correct).toBe(true);
  });

  it('rejects a wrong English translation', () => {
    const result = evaluateAnswer('the chair', ['the table'], {
      strictness: { ...STRICT, capitalization: false },
      language: 'en',
    });
    expect(result.correct).toBe(false);
  });
});

describe('evaluateAnswer — closest accepted answer', () => {
  it('compares against the nearest alternative, not the first', () => {
    const result = evaluateAnswer('die Strasse', ['der Weg', 'die Straße'], {
      strictness: STRICT,
      language: 'de',
    });
    expect(result.expectedAnswer).toBe('die Straße');
    expect(result.issues.map((i) => i.category)).toContain('ssInsteadOfEszett');
  });
});

describe('evaluateChoice', () => {
  it('accepts the correct index', () => {
    expect(evaluateChoice(2, 2, 'der Tisch', 'der Tisch').correct).toBe(true);
  });

  it('names the correct option when wrong', () => {
    const result = evaluateChoice(0, 2, 'der Tisch', 'die Lampe');
    expect(result.correct).toBe(false);
    expect(result.issues[0]?.message).toMatch(/der Tisch/);
    expect(result.submittedAnswer).toBe('die Lampe');
  });
});

describe('near miss', () => {
  const near = (submitted: string, expected: string) =>
    isNearMiss({
      correct: false,
      issues: [],
      submittedAnswer: submitted,
      expectedAnswer: expected,
    });

  it('accepts a one- or two-character typo and a capitalization slip', () => {
    expect(near('Strase', 'Straße')).toBe(true);
    expect(near('strasse', 'Straße')).toBe(true);
    expect(near('die Fentser', 'die Fenster')).toBe(true);
  });

  it('rejects a different word and an empty answer', () => {
    expect(near('Haus', 'Straße')).toBe(false);
    expect(near('', 'Straße')).toBe(false);
  });

  it('marks each submitted word right or wrong', () => {
    expect(wordVerdicts('die Fentser', 'das Fenster')).toEqual([
      { word: 'die', correct: false },
      { word: 'Fentser', correct: false },
    ]);
    expect(wordVerdicts('der fenster', 'der Fenster')).toEqual([
      { word: 'der', correct: true },
      { word: 'fenster', correct: true },
    ]);
  });
});

describe('articles and strictness (bug 4, S14)', () => {
  const noArticle: Strictness = { ...STRICT, article: false };

  it('accepts the bare noun when the article is not strict, but not a wrong article', () => {
    const opts = { strictness: noArticle, language: 'de' as const };
    expect(evaluateAnswer('Minute', ['die Minute'], opts).correct).toBe(true);
    const wrong = evaluateAnswer('der Minute', ['die Minute'], opts);
    expect(wrong.correct).toBe(false);
    expect(wrong.issues.map((i) => i.category)).toContain('wrongArticle');
  });

  it('never strips the article from a phrase', () => {
    const opts = { strictness: noArticle, language: 'de' as const };
    expect(evaluateAnswer('ist gut', ['das ist gut'], opts).correct).toBe(false);
  });

  it('gives a wrong article no second try', () => {
    const result = evaluateAnswer('der Minute', ['die Minute'], {
      strictness: STRICT,
      language: 'de',
    });
    expect(isNearMiss(result)).toBe(false);
  });

  it('accepts a sentence-start capital on the article', () => {
    expect(
      evaluateAnswer('Die Minute', ['die Minute'], { strictness: STRICT, language: 'de' }).correct,
    ).toBe(true);
  });
});

describe('near miss by length (S14)', () => {
  const near = (submitted: string, expected: string) =>
    isNearMiss({
      correct: false,
      issues: [],
      submittedAnswer: submitted,
      expectedAnswer: expected,
    });

  it('gives short words one edit, longer words two', () => {
    expect(near('drei', 'zwei')).toBe(false);
    expect(near('bei', 'zwei')).toBe(false);
    expect(near('nein', 'eins')).toBe(false);
    expect(near('zwie', 'zwei')).toBe(false);
    expect(near('zwe', 'zwei')).toBe(true);
    expect(near('Fentser', 'Fenster')).toBe(true);
  });

  it('never treats another real word as a typo', () => {
    const result = evaluateAnswer('mein', ['kein'], {
      strictness: STRICT,
      language: 'de',
      otherWords: ['mein'],
    });
    expect(result.issues[0]?.message).toMatch(/different word/);
    expect(isNearMiss(result)).toBe(false);
  });
});

describe('relaxed umlauts (S15)', () => {
  it('rejects a different real word that only a fold would match', () => {
    const result = evaluateAnswer('drücken', ['drucken'], {
      strictness: LENIENT,
      language: 'de',
      otherWords: ['drücken'],
    });
    expect(result.correct).toBe(false);
  });

  it('accepts a relaxed spelling but shows the correct one', () => {
    const result = evaluateAnswer('schon', ['schön'], { strictness: LENIENT, language: 'de' });
    expect(result.correct).toBe(true);
    expect(result.issues[0]?.message).toBe('It is spelled "schön".');
  });
});

describe('capitalization messages (S16)', () => {
  const message = (submitted: string, expected: string) =>
    evaluateAnswer(submitted, [expected], { strictness: STRICT, language: 'de' }).issues[0]
      ?.message;

  it('names the noun, not the article', () => {
    expect(message('Die minute', 'die Minute')).toBe('German nouns must be capitalized: Minute.');
  });

  it('says a non-noun is written in lower case', () => {
    expect(message('Hören', 'hören')).toBe('hören is written in lower case.');
  });

  it('does not call the formal pronoun a noun', () => {
    expect(message('sie', 'Sie')).toBe('Sie is written with a capital letter here.');
  });
});
