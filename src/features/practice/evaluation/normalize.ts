/**
 * Normalization helpers for German answer checking (§16).
 *
 * Important: none of these are applied to decide correctness by default. Strict mode is
 * the default and capitalization, umlauts, ß and punctuation are all significant. These
 * transforms exist to *diagnose* which dimension a wrong answer differs in, so feedback
 * can name the actual mistake. §16 explicitly forbids globally lowercasing answers.
 */

/** Trims and collapses runs of whitespace. Always safe — never changes letters. */
export function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

/** Case folding, used only for diagnosis or when `strictness.capitalization` is false. */
export function foldCase(value: string): string {
  return value.toLocaleLowerCase('de-DE');
}

/** Maps umlauts to their base vowel: ä→a, ö→o, ü→u. Catches "schon" for "schön". */
export function foldUmlautsToBase(value: string): string {
  return value
    .replace(/ä/gu, 'a')
    .replace(/ö/gu, 'o')
    .replace(/ü/gu, 'u')
    .replace(/Ä/gu, 'A')
    .replace(/Ö/gu, 'O')
    .replace(/Ü/gu, 'U');
}

/** Expands umlauts to digraphs: ä→ae. Catches "schoen" for "schön". */
export function expandUmlautsToDigraphs(value: string): string {
  return value
    .replace(/ä/gu, 'ae')
    .replace(/ö/gu, 'oe')
    .replace(/ü/gu, 'ue')
    .replace(/Ä/gu, 'Ae')
    .replace(/Ö/gu, 'Oe')
    .replace(/Ü/gu, 'Ue');
}

/**
 * Collapses every way of writing an umlaut onto one form: ä, ae and a all become a.
 *
 * Applied to both sides of a comparison, so the fact that it also rewrites innocent
 * letter pairs (the "ue" inside "neue") cannot cause a false mismatch — both sides are
 * mangled identically. It only risks equating two genuinely different words, which at
 * worst downgrades a meaning error to an umlaut hint.
 */
export function foldUmlautVariants(value: string): string {
  return foldUmlautsToBase(value)
    .replace(/ae/gu, 'a')
    .replace(/oe/gu, 'o')
    .replace(/ue/gu, 'u')
    .replace(/Ae/gu, 'A')
    .replace(/Oe/gu, 'O')
    .replace(/Ue/gu, 'U');
}

/** Maps ß to ss. Catches "Strasse" for "Straße". */
export function foldEszett(value: string): string {
  return value.replace(/ß/gu, 'ss');
}

/** Removes punctuation that German exercises treat as significant only in phrases. */
export function stripPunctuation(value: string): string {
  return collapseWhitespace(value.replace(/[.,!?;:„“”"'()\-–—]/gu, ' '));
}

export const GERMAN_ARTICLES = ['der', 'die', 'das'] as const;
export type GermanArticle = (typeof GERMAN_ARTICLES)[number];

/** Splits a leading definite article off an answer, if present. */
export function splitLeadingArticle(value: string): {
  article: GermanArticle | null;
  rest: string;
} {
  const match = /^(der|die|das)\s+(.*)$/iu.exec(collapseWhitespace(value));
  if (!match) return { article: null, rest: collapseWhitespace(value) };
  const article = match[1]?.toLocaleLowerCase('de-DE') as GermanArticle;
  return { article, rest: match[2] ?? '' };
}

/** Word tokens, punctuation stripped. Used for word-order and token diffing. */
export function tokenize(value: string): string[] {
  return stripPunctuation(value)
    .split(' ')
    .filter((token) => token.length > 0);
}

/** True when two token lists contain the same tokens, ignoring order. */
export function sameTokenMultiset(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const token of a) counts.set(token, (counts.get(token) ?? 0) + 1);
  for (const token of b) {
    const remaining = counts.get(token);
    if (!remaining) return false;
    counts.set(token, remaining - 1);
  }
  return true;
}

/**
 * Fully normalized form, used to decide whether two answers differ *only* in the
 * dimensions strict mode cares about. Applies every fold.
 */
export function fullyNormalize(value: string): string {
  return collapseWhitespace(foldCase(foldEszett(foldUmlautVariants(stripPunctuation(value)))));
}

/** Levenshtein distance, capped implicitly by string length. Used for near-miss detection. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] as number) + 1,
        (previous[j] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] as number;
}
