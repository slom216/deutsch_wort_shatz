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
}

const MESSAGES: Record<ErrorCategory, string> = {
  wrongMeaning: 'That is not the expected answer.',
  missingArticle: 'German nouns are learned with their article.',
  wrongArticle: 'That is the wrong article.',
  wrongCapitalization: 'German nouns must be capitalized.',
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

function capitalizationMessage(submitted: string, expected: string): string {
  const expectedWord = expected.split(' ').find((word) => /^[A-ZÄÖÜ]/u.test(word));
  const submittedHasLowerNoun =
    expectedWord !== undefined &&
    submitted.toLocaleLowerCase('de-DE').includes(foldCase(expectedWord));
  if (expectedWord && submittedHasLowerNoun) {
    return `German nouns must be capitalized: ${expectedWord}.`;
  }
  return MESSAGES.wrongCapitalization;
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

  if (articleMatters && expectedParts.article) {
    if (!submittedParts.article) {
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

  const relaxedSubmitted = relax(cleaned);
  for (const candidate of accepted) {
    if (relax(candidate) === relaxedSubmitted) {
      return {
        correct: true,
        issues: [],
        submittedAnswer: cleaned,
        expectedAnswer: candidate,
      };
    }
  }

  const expected = chooseClosest(cleaned, accepted);

  // Surface-only difference: the two strings agree once every fold is applied.
  if (fullyNormalize(cleaned) === fullyNormalize(expected)) {
    const surfaceIssues = diagnoseSurfaceIssues(cleaned, expected, strictness);
    return {
      correct: false,
      // Fall back to a meaning issue if every differing dimension was non-strict, which
      // would otherwise leave the learner with no explanation at all.
      issues:
        surfaceIssues.length > 0 ? surfaceIssues : [issue(roleToCategory(options.answerRole))],
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
  const merged = [...structuralIssues];
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

/** A near miss gets one more try instead of a lost word: at most this many edits away. */
export const NEAR_MISS_DISTANCE = 2;

/**
 * True when a wrong answer is a typo rather than a different word — close enough that
 * locking it in would punish spelling, not knowledge. Case is folded first, so a purely
 * capitalization mistake also earns the second chance.
 */
export function isNearMiss(result: EvaluationResult): boolean {
  if (result.correct) return false;
  const submitted = foldCase(collapseWhitespace(result.submittedAnswer));
  if (submitted.length === 0) return false;
  return editDistance(submitted, foldCase(result.expectedAnswer)) <= NEAR_MISS_DISTANCE;
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
