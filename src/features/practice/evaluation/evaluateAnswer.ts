import type {
  AnswerLanguage,
  ErrorCategory,
  EvaluationIssue,
  EvaluationResult,
  Strictness,
} from '@/schemas/exerciseSchema';
import {
  collapseWhitespace,
  editDistance,
  expandUmlautsToDigraphs,
  foldCase,
  foldEszett,
  foldUmlautVariants,
  fullyNormalize,
  GERMAN_ARTICLES,
  sameTokenMultiset,
  splitLeadingArticle,
  stripPunctuation,
  tokenize,
} from './normalize';

/**
 * German answer-evaluation engine (§16).
 *
 * Strict mode is the default: capitalization, article, umlauts, ß, spelling, punctuation,
 * word order, verb form and plural form are all significant.
 *
 * Feedback reports *every* dimension that is wrong, not just the first. §16's own example
 * — `die strasse` against `die Straße` — must produce both a capitalization issue and an
 * ß issue, so the engine works out which normalizations were each strictly necessary to
 * reconcile the two strings.
 */

/** What the exercise asked the learner to produce. Sharpens the error category. */
export type AnswerRole =
  'translation' | 'article' | 'plural' | 'verbForm' | 'phrase' | 'sentenceGap';

export interface EvaluationOptions {
  readonly strictness: Strictness;
  readonly language: AnswerLanguage;
  readonly answerRole?: AnswerRole;
  /** Set when the exercise explicitly requires the article, e.g. "noun with article". */
  readonly requireArticle?: boolean;
  /**
   * Real words from the vocabulary pool that look like the answer. Typing one of them exactly
   * is a different word: never accepted through a relaxed fold and never a near miss. A word
   * listed here *and* in `accepted` is another entry with the prompt's meaning: accepted, with
   * a note naming the word the card asked for (`accepted[0]`).
   */
  readonly otherWords?: readonly string[];
}

/** Prefix of the issue that marks a typed answer as another real word. */
const DIFFERENT_WORD = 'That is a different word';

const MESSAGES: Record<ErrorCategory, string> = {
  wrongMeaning: 'That is not the expected answer.',
  missingArticle: 'German nouns are learned with their article.',
  wrongArticle: 'That is the wrong article.',
  wrongCapitalization: 'Check the capitalization.',
  wrongPlural: 'That is not the correct plural form.',
  wrongConjugation: 'That is not the correct verb form.',
  missingUmlaut: 'Check the umlauts (ä, ö, ü).',
  ssInsteadOfEszett: 'This word is written with ß, not ss.',
  punctuationError: 'Check the punctuation.',
  wordOrderError: 'The words are in the wrong order.',
  missingToken: 'Something is missing from your answer.',
  extraToken: 'Your answer contains something extra.',
};

function issue(category: ErrorCategory, message?: string): EvaluationIssue {
  return { category, message: message ?? MESSAGES[category] };
}

/**
 * Picks the accepted answer closest to what the learner wrote, so feedback compares
 * against the most charitable target rather than an arbitrary first entry.
 */
function chooseClosest(submitted: string, accepted: readonly string[]): string {
  const normalizedSubmitted = fullyNormalize(submitted);
  let best = accepted[0] ?? '';
  let bestScore = -1;

  for (const candidate of accepted) {
    const normalizedCandidate = fullyNormalize(candidate);
    let score = 0;
    if (normalizedCandidate === normalizedSubmitted) score = 1000;
    else {
      const submittedTokens = new Set(tokenize(normalizedSubmitted));
      const shared = tokenize(normalizedCandidate).filter((t) => submittedTokens.has(t)).length;
      // Prefer more shared tokens, then a closer length.
      score = shared * 10 - Math.abs(normalizedCandidate.length - normalizedSubmitted.length) / 100;
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/** True when `a` and `b` differ only by umlaut spelling (either base vowel or digraph). */
function differsOnlyByUmlaut(a: string, b: string): boolean {
  if (foldUmlautVariants(a) === foldUmlautVariants(b)) return true;
  return expandUmlautsToDigraphs(a) === expandUmlautsToDigraphs(b);
}

/**
 * Works out which surface dimensions must be normalized away for the two strings to
 * match, by removing one transform at a time and testing whether equality survives.
 */
function diagnoseSurfaceIssues(
  submitted: string,
  expected: string,
  strictness: Strictness,
): EvaluationIssue[] {
  // Surface diagnosis is only meaningful when these folds actually reconcile the two
  // strings. Without this guard, a completely unrelated answer would be reported as a
  // capitalization *and* ß *and* punctuation mistake, which explains nothing.
  if (fullyNormalize(submitted) !== fullyNormalize(expected)) return [];

  const issues: EvaluationIssue[] = [];

  // Case: does ignoring case (and nothing else beyond the other folds) fix it?
  const caseSensitiveMatch =
    foldEszett(foldUmlautVariants(stripPunctuation(submitted))) ===
    foldEszett(foldUmlautVariants(stripPunctuation(expected)));
  if (!caseSensitiveMatch && strictness.capitalization) {
    issues.push(issue('wrongCapitalization', capitalizationMessage(submitted, expected)));
  }

  // Umlauts: compare with case folded but umlauts intact.
  const umlautSensitiveMatch =
    foldCase(foldEszett(stripPunctuation(submitted))) ===
    foldCase(foldEszett(stripPunctuation(expected)));
  if (
    !umlautSensitiveMatch &&
    strictness.umlauts &&
    differsOnlyByUmlaut(
      foldCase(foldEszett(stripPunctuation(submitted))),
      foldCase(foldEszett(stripPunctuation(expected))),
    )
  ) {
    issues.push(issue('missingUmlaut', umlautMessage(expected)));
  }

  // ß: compare with case and umlauts folded but ß intact.
  const eszettSensitiveMatch =
    foldCase(foldUmlautVariants(stripPunctuation(submitted))) ===
    foldCase(foldUmlautVariants(stripPunctuation(expected)));
  if (!eszettSensitiveMatch && strictness.eszett) {
    issues.push(issue('ssInsteadOfEszett', eszettMessage(expected)));
  }

  // Punctuation: compare with everything folded except punctuation.
  const punctuationSensitiveMatch =
    foldCase(foldEszett(foldUmlautVariants(collapseWhitespace(submitted)))) ===
    foldCase(foldEszett(foldUmlautVariants(collapseWhitespace(expected))));
  if (!punctuationSensitiveMatch && strictness.punctuation) {
    issues.push(issue('punctuationError'));
  }

  return issues;
}

/** Words written with a capital that are not nouns: the formal "Sie" family. */
const CAPITALIZED_PRONOUNS = new Set([
  'sie',
  'ihnen',
  'ihr',
  'ihre',
  'ihren',
  'ihrem',
  'ihrer',
  'ihres',
]);

/** Names the first word whose case is wrong. Only called when the two differ in folds alone. */
function capitalizationMessage(submitted: string, expected: string): string {
  const submittedWords = submitted.split(' ');
  const expectedWords = expected.split(' ');
  for (const [index, want] of expectedWords.entries()) {
    const got = submittedWords[index];
    if (got === undefined || got === want || foldCase(got) !== foldCase(want)) continue;
    const word = stripPunctuation(want);
    const lower = foldCase(word);
    if (/^\p{Ll}/u.test(want)) {
      // "Die Minute": a capital article at the start reads as a sentence start, not a mistake.
      if (index === 0 && expectedWords.length > 1 && isArticle(lower)) continue;
      return `${word} is written in lower case.`;
    }
    if (isArticle(lower) || CAPITALIZED_PRONOUNS.has(lower)) {
      return `${word} is written with a capital letter here.`;
    }
    return `German nouns must be capitalized: ${word}.`;
  }
  return MESSAGES.wrongCapitalization;
}

function isArticle(word: string): boolean {
  return (GERMAN_ARTICLES as readonly string[]).includes(word);
}

function umlautMessage(expected: string): string {
  const withUmlaut = expected.split(' ').find((word) => /[äöüÄÖÜ]/u.test(word));
  return withUmlaut ? `${withUmlaut} is written with an umlaut.` : MESSAGES.missingUmlaut;
}

function eszettMessage(expected: string): string {
  const withEszett = expected.split(' ').find((word) => word.includes('ß'));
  return withEszett ? `${withEszett} is written with ß.` : MESSAGES.ssInsteadOfEszett;
}

/** Structural differences: article, word order, missing/extra tokens, or plain wrongness. */
function diagnoseStructuralIssues(
  submitted: string,
  expected: string,
  options: EvaluationOptions,
): EvaluationIssue[] {
  const issues: EvaluationIssue[] = [];
  const { strictness, answerRole } = options;

  const submittedParts = splitLeadingArticle(submitted);
  const expectedParts = splitLeadingArticle(expected);

  const articleMatters = strictness.article || options.requireArticle || answerRole === 'article';

  if (expectedParts.article) {
    if (!submittedParts.article) {
      if (articleMatters)
        issues.push(
          issue('missingArticle', `The article is missing: it is "${expectedParts.article}".`),
        );
    } else if (submittedParts.article !== expectedParts.article) {
      issues.push(
        issue(
          'wrongArticle',
          `The article is "${expectedParts.article}", not "${submittedParts.article}".`,
        ),
      );
    }
  }

  // Compare the remainder after the article so an article mistake is not double-counted.
  const submittedRest = fullyNormalize(submittedParts.rest);
  const expectedRest = fullyNormalize(expectedParts.rest);

  if (submittedRest === expectedRest) {
    return issues;
  }

  const submittedTokens = tokenize(submittedRest);
  const expectedTokens = tokenize(expectedRest);

  if (
    submittedTokens.length > 1 &&
    sameTokenMultiset(submittedTokens, expectedTokens) &&
    strictness.wordOrder
  ) {
    issues.push(issue('wordOrderError'));
    return issues;
  }

  const expectedSet = new Set(expectedTokens);
  const submittedSet = new Set(submittedTokens);
  const missing = expectedTokens.filter((token) => !submittedSet.has(token));
  const extra = submittedTokens.filter((token) => !expectedSet.has(token));
  const overlap = expectedTokens.length - missing.length;

  // No shared vocabulary at all: this is a meaning error, not a token slip.
  if (overlap === 0) {
    issues.push(issue(roleToCategory(answerRole)));
    return issues;
  }

  if (missing.length > 0) {
    issues.push(issue('missingToken', `Missing from your answer: "${missing.join(' ')}".`));
  }
  if (extra.length > 0) {
    issues.push(issue('extraToken', `Not part of the answer: "${extra.join(' ')}".`));
  }
  if (missing.length === 0 && extra.length === 0) {
    issues.push(issue(roleToCategory(answerRole)));
  }

  return issues;
}

function roleToCategory(role: AnswerRole | undefined): ErrorCategory {
  switch (role) {
    case 'plural':
      return 'wrongPlural';
    case 'verbForm':
      return 'wrongConjugation';
    case 'article':
      return 'wrongArticle';
    default:
      return 'wrongMeaning';
  }
}

/**
 * Evaluates a typed answer against the accepted answers for an exercise.
 *
 * An answer is correct only when it matches an accepted answer exactly, once leading and
 * trailing whitespace is removed. Dimensions the exercise marks as not strict are folded
 * before that comparison, so a non-strict exercise still accepts the looser form.
 */
export function evaluateAnswer(
  submitted: string,
  accepted: readonly string[],
  options: EvaluationOptions,
): EvaluationResult {
  const cleaned = collapseWhitespace(submitted);
  const { strictness } = options;

  if (cleaned.length === 0) {
    return {
      correct: false,
      issues: [issue('missingToken', 'Enter an answer.')],
      submittedAnswer: cleaned,
      expectedAnswer: accepted[0] ?? '',
    };
  }

  // Relax exactly the dimensions this exercise does not treat as significant.
  const relax = (value: string): string => {
    let result = collapseWhitespace(value);
    if (!strictness.capitalization) result = foldCase(result);
    if (!strictness.umlauts) result = foldUmlautVariants(result);
    if (!strictness.eszett) result = foldEszett(result);
    if (!strictness.punctuation) result = stripPunctuation(result);
    return result;
  };

  const otherWords = new Set(options.otherWords ?? []);
  // Typing another real word is never "close enough" (drücken for drucken, Sie for sie).
  const typedOtherWord = otherWords.has(cleaned) && !accepted.includes(cleaned);
  const articleOptional =
    !strictness.article && !options.requireArticle && options.answerRole !== 'article';

  for (const candidate of accepted) {
    const submittedForm = lowerLeadingArticle(cleaned, candidate);
    // Article not significant: the bare noun matches the noun without its article.
    // Only before a capitalized noun, so "ist gut" never passes for the phrase "das ist gut".
    const candidateRest = splitLeadingArticle(candidate).rest;
    const target =
      articleOptional &&
      !splitLeadingArticle(submittedForm).article &&
      /^\p{Lu}/u.test(candidateRest)
        ? candidateRest
        : candidate;
    if (relax(target) !== relax(submittedForm)) continue;
    const exact = stripPunctuation(submittedForm) === stripPunctuation(target);
    if (!exact && typedOtherWord) continue;
    return {
      correct: true,
      issues: acceptanceNotes(candidate, target, exact, accepted, otherWords, options.language),
      submittedAnswer: cleaned,
      expectedAnswer: candidate,
    };
  }

  const expected = chooseClosest(cleaned, accepted);
  const differentWord = typedOtherWord
    ? [issue(roleToCategory(options.answerRole), `${DIFFERENT_WORD}: "${cleaned}".`)]
    : [];

  // Surface-only difference: the two strings agree once every fold is applied.
  if (fullyNormalize(cleaned) === fullyNormalize(expected)) {
    const surfaceIssues = diagnoseSurfaceIssues(cleaned, expected, strictness);
    const issues = [...differentWord, ...surfaceIssues];
    return {
      correct: false,
      // Fall back to a meaning issue if every differing dimension was non-strict, which
      // would otherwise leave the learner with no explanation at all.
      issues: issues.length > 0 ? issues : [issue(roleToCategory(options.answerRole))],
      submittedAnswer: cleaned,
      expectedAnswer: expected,
    };
  }

  const structuralIssues = diagnoseStructuralIssues(cleaned, expected, options);

  // Diagnose surface mistakes on the remainder after the article, so that an answer like
  // "die tisch" for "der Tisch" reports both the wrong article and the lowercase noun.
  const surfaceIssues = diagnoseSurfaceIssues(
    splitLeadingArticle(cleaned).rest,
    splitLeadingArticle(expected).rest,
    strictness,
  );

  // Surface issues are reported alongside structural ones only when they are genuinely
  // separate, e.g. a missing article *and* a lowercase noun.
  const merged = [...differentWord, ...structuralIssues];
  for (const surfaceIssue of surfaceIssues) {
    if (!merged.some((existing) => existing.category === surfaceIssue.category)) {
      merged.push(surfaceIssue);
    }
  }

  return {
    correct: false,
    issues: merged.length > 0 ? merged : [issue(roleToCategory(options.answerRole))],
    submittedAnswer: cleaned,
    expectedAnswer: expected,
  };
}

/** "Die Minute" for "die Minute": a sentence-start capital on the article is not a mistake. */
function lowerLeadingArticle(submitted: string, candidate: string): string {
  const typed = splitLeadingArticle(submitted).article;
  if (!typed || !candidate.startsWith(`${typed} `)) return submitted;
  return `${typed}${submitted.slice(typed.length)}`;
}

/**
 * Notes on an accepted answer: another word with the same meaning names the one the card
 * asked for, and a German spelling that only matched through a relaxed fold shows the real one.
 */
function acceptanceNotes(
  candidate: string,
  target: string,
  exact: boolean,
  accepted: readonly string[],
  otherWords: ReadonlySet<string>,
  language: AnswerLanguage,
): EvaluationIssue[] {
  const notes: EvaluationIssue[] = [];
  const asked = accepted[0];
  if (otherWords.has(candidate) && asked !== undefined && asked !== candidate) {
    notes.push(
      issue('wrongMeaning', `"${candidate}" is also right. This card asks for "${asked}".`),
    );
  }
  if (!exact && language === 'de')
    notes.push(issue(spellingCategory(target), `It is spelled "${target}".`));
  return notes;
}

function spellingCategory(target: string): ErrorCategory {
  if (/[äöüÄÖÜ]/u.test(target)) return 'missingUmlaut';
  return /ß/u.test(target) ? 'ssInsteadOfEszett' : 'wrongCapitalization';
}

/** Answers up to this many letters (article aside) get one edit of slack; longer ones two. */
export const SHORT_WORD_LENGTH = 6;

export function nearMissDistance(expected: string): number {
  return splitLeadingArticle(expected).rest.length <= SHORT_WORD_LENGTH ? 1 : 2;
}

/**
 * True when a wrong answer is a typo rather than a different word — close enough that
 * locking it in would punish spelling, not knowledge. Case is folded and ß written as ss
 * first, so a capitalization or ß slip also earns the second chance. A wrong article and
 * another real word are knowledge mistakes, never typos.
 */
export function isNearMiss(result: EvaluationResult): boolean {
  if (result.correct) return false;
  const knowledgeMistake = result.issues.some(
    (found) => found.category === 'wrongArticle' || found.message.startsWith(DIFFERENT_WORD),
  );
  if (knowledgeMistake) return false;
  const fold = (value: string): string => foldEszett(foldCase(collapseWhitespace(value)));
  const submitted = fold(result.submittedAnswer);
  if (submitted.length === 0) return false;
  return (
    editDistance(submitted, fold(result.expectedAnswer)) <= nearMissDistance(result.expectedAnswer)
  );
}

/**
 * Word-by-word verdict for the near-miss hint: each submitted word is right when the
 * expected answer contains it (ignoring case, umlaut spelling, ß and punctuation).
 */
export function wordVerdicts(
  submitted: string,
  expected: string,
): { readonly word: string; readonly correct: boolean }[] {
  const expectedWords = new Set(tokenize(fullyNormalize(expected)));
  return collapseWhitespace(submitted)
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word) => ({ word, correct: expectedWords.has(fullyNormalize(word)) }));
}

/** Convenience for multiple-choice and matching, where correctness is an index match. */
export function evaluateChoice(
  chosenIndex: number,
  correctIndex: number,
  correctLabel: string,
  chosenLabel: string,
): EvaluationResult {
  const correct = chosenIndex === correctIndex;
  return {
    correct,
    issues: correct ? [] : [issue('wrongMeaning', `The correct answer is "${correctLabel}".`)],
    submittedAnswer: chosenLabel,
    expectedAnswer: correctLabel,
  };
}
