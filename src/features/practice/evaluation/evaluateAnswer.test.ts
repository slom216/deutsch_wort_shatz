import { describe, expect, it } from 'vitest';

import { evaluateAnswer, evaluateChoice } from './evaluateAnswer';
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
