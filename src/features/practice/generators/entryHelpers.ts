import {
  isNounEntry,
  isPhraseEntry,
  isVerbEntry,
  type VocabularyEntry,
} from '@/schemas/vocabularySchema';
import type { Strictness } from '@/schemas/exerciseSchema';
import { collapseWhitespace, editDistance, foldCase } from '../evaluation/normalize';

/** Shared accessors that apply the presentation rules from §14. */

const ARTICLE_PREFIX = /^(?:der|die|das)\s+/iu;

/**
 * The form a noun is always taught in: article + noun. Other classes are unchanged. Headwords
 * that already carry their article ("die Minute") are not given a second one.
 */
export function headword(entry: VocabularyEntry): string {
  if (isNounEntry(entry) && entry.article && !ARTICLE_PREFIX.test(entry.german)) {
    return `${entry.article} ${entry.german}`;
  }
  return entry.german;
}

/** A noun without its article ("die Minute" → "Minute"). Other classes are unchanged. */
export function bareNoun(entry: VocabularyEntry): string {
  return isNounEntry(entry) ? entry.german.replace(ARTICLE_PREFIX, '') : entry.german;
}

/** Strips a leading article from any string. */
export function withoutArticle(value: string): string {
  return value.replace(ARTICLE_PREFIX, '');
}

/**
 * Every full form a compressed headword stands for. Defensive: the datasets list alternatives
 * separately, but a headword like "die Soße/Sauce", "der/die Deutsche", "Zahncreme/-pasta",
 * "der Chat(room)" or "(Fach-)Hochschule" must not become the only accepted string.
 */
export function expandForms(form: string): string[] {
  const paren = /\(([^()]*)\)/u.exec(form);
  if (paren) {
    const inner = paren[1] as string;
    const before = form.slice(0, paren.index);
    const after = form.slice(paren.index + paren[0].length);
    // "(Fach-)Hochschule" joins into one word: "Fachhochschule".
    const joined = inner.endsWith('-')
      ? `${before}${inner.slice(0, -1)}${after.charAt(0).toLocaleLowerCase('de-DE')}${after.slice(1)}`
      : `${before}${inner}${after}`;
    return [...expandForms(`${before}${after}`), ...expandForms(joined)];
  }

  const tokens = form.split(' ');
  const index = tokens.findIndex((token) => token.includes('/'));
  if (index < 0) return [collapseWhitespace(form)].filter((value) => value.length > 0);

  const [first = '', ...alternatives] = (tokens[index] as string).split('/');
  const options = [
    first,
    // "Zahncreme/-pasta" swaps the tail of the first word.
    // ponytail: the tail is guessed by length; a data-side alternateForms entry is the real fix.
    ...alternatives.map((alt) =>
      alt.startsWith('-')
        ? `${first.slice(0, Math.max(1, first.length - (alt.length - 1)))}${alt.slice(1)}`
        : alt,
    ),
  ].filter((option) => option.length > 0);
  return options.flatMap((option) =>
    expandForms([...tokens.slice(0, index), option, ...tokens.slice(index + 1)].join(' ')),
  );
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].filter((value) => value.trim().length > 0);
}

/**
 * Accepted German answers. The headword comes first — it is the word the card asks for —
 * followed by configured answers, alternate forms and alternate articles, all expanded.
 */
export function acceptedGerman(entry: VocabularyEntry): string[] {
  const forms = [
    headword(entry),
    entry.german,
    ...entry.exerciseConfig.acceptedAnswers.german,
    ...(entry.alternateForms ?? []),
  ];
  if (!isNounEntry(entry) || !entry.article) return unique(forms.flatMap(expandForms));
  for (const article of entry.alternateArticles ?? []) forms.push(`${article} ${bareNoun(entry)}`);
  // The datasets store the bare noun ("Minute"). A noun is taught with its article, so a bare
  // form gets it; the evaluator still accepts the bare noun when the article is not strict.
  const article = entry.article;
  return unique(
    forms
      .flatMap(expandForms)
      .map((form) =>
        !ARTICLE_PREFIX.test(form) && /^\p{Lu}/u.test(form) ? `${article} ${form}` : form,
      ),
  );
}

export function acceptedEnglish(entry: VocabularyEntry): string[] {
  const forms = new Set<string>([
    ...entry.exerciseConfig.acceptedAnswers.english,
    ...entry.english,
  ]);
  // A parenthetical qualifier tells senses apart; nobody has to type it: "you (formal)".
  for (const form of [...forms]) forms.add(stripQualifiers(form));
  // English infinitives are written "to answer" but nobody types the "to" when the German
  // side already says it is a verb, so both forms count. Added after the configured ones,
  // so the canonical answer stays the form the dataset teaches.
  if (isVerbEntry(entry)) {
    for (const form of [...forms]) {
      const bare = form.replace(/^to\s+/iu, '');
      forms.add(bare);
      forms.add(`to ${bare}`);
    }
  }
  // "minute", "the minute" and "a minute" all translate "die Minute".
  if (isNounEntry(entry)) {
    for (const form of [...forms]) {
      const bare = form.replace(/^(?:the|a|an)\s+/iu, '');
      for (const variant of [bare, `the ${bare}`, `a ${bare}`, `an ${bare}`]) forms.add(variant);
    }
  }
  return unique([...forms]);
}

const ENGLISH_ARTICLE = /^(a|an|the) /u;

function stripQualifiers(gloss: string): string {
  return collapseWhitespace(gloss.replace(/\([^)]*\)/gu, ' '));
}

/** Per-entry caches: entries are immutable, and the pool-wide scans below run per exercise. */
function cached<T>(cache: WeakMap<VocabularyEntry, T>, entry: VocabularyEntry, build: () => T): T {
  let value = cache.get(entry);
  if (value === undefined) {
    value = build();
    cache.set(entry, value);
  }
  return value;
}

const glossKeyCache = new WeakMap<VocabularyEntry, Set<string>>();

/** Normalized glosses, for telling whether two entries can mean the same thing. */
export function glossKeys(entry: VocabularyEntry): Set<string> {
  return cached(
    glossKeyCache,
    entry,
    () =>
      new Set(
        [...entry.english, ...entry.exerciseConfig.acceptedAnswers.english].map((gloss) =>
          foldCase(stripQualifiers(gloss)).replace(ENGLISH_ARTICLE, ''),
        ),
      ),
  );
}

const wordFormCache = new WeakMap<VocabularyEntry, (readonly [string, string])[]>();

/** The entry's headword and bare noun, each paired with its case-folded form. */
function wordForms(entry: VocabularyEntry): (readonly [string, string])[] {
  return cached(wordFormCache, entry, () =>
    [...new Set([headword(entry), bareNoun(entry)])].map((word) => [word, foldCase(word)] as const),
  );
}

export function sharesGloss(a: VocabularyEntry, b: VocabularyEntry): boolean {
  const keys = glossKeys(a);
  return [...glossKeys(b)].some((key) => keys.has(key));
}

/**
 * Other entries' German forms that also answer this entry's prompt gloss — "at" is an, bei
 * and um. Same word class only, since the card shows the class beside the prompt.
 */
export function sameMeaningWords(
  entry: VocabularyEntry,
  pool: readonly VocabularyEntry[],
): string[] {
  const prompt = foldCase(stripQualifiers(primaryEnglish(entry))).replace(ENGLISH_ARTICLE, '');
  const own = new Set(acceptedGerman(entry));
  return unique(
    pool
      .filter(
        (other) =>
          other.id !== entry.id &&
          other.wordClass === entry.wordClass &&
          glossKeys(other).has(prompt),
      )
      .flatMap(acceptedGerman)
      .filter((form) => !own.has(form)),
  );
}

/** Edits within which another real word counts as a lookalike (the near-miss ceiling). */
const LOOKALIKE_DISTANCE = 2;

/**
 * Real words from the pool spelled like one of `answers` (drucken/drücken, Ende/Ente), with and
 * without their article. The evaluator rejects them as different words rather than typos.
 */
export function lookalikeWords(
  entry: VocabularyEntry,
  pool: readonly VocabularyEntry[],
  answers: readonly string[],
): string[] {
  const own = new Set([...answers, ...acceptedGerman(entry)]);
  const keys = answers.map(foldCase);
  const words = new Set<string>();
  for (const other of pool) {
    if (other.id === entry.id) continue;
    for (const [word, folded] of wordForms(other)) {
      if (own.has(word) || words.has(word)) continue;
      const close = keys.some(
        (key) =>
          Math.abs(key.length - folded.length) <= LOOKALIKE_DISTANCE &&
          editDistance(key, folded) <= LOOKALIKE_DISTANCE,
      );
      if (close) words.add(word);
    }
  }
  return [...words];
}

/** Proper nouns carry no article ("Deutschland", "Türkei"): no misspelled option for them. */
export function isProperNoun(entry: VocabularyEntry): boolean {
  return (
    isNounEntry(entry) && !ARTICLE_PREFIX.test(headword(entry)) && /^\p{Lu}/u.test(entry.german)
  );
}

export function primaryEnglish(entry: VocabularyEntry): string {
  return entry.english[0] ?? '';
}

/**
 * The plural as it is taught: "die" + plural form. Null when the entry has no plural, and for
 * nouns used in one number only — a plural-only noun has no separate plural to ask for.
 */
export function pluralForm(entry: VocabularyEntry): string | null {
  if (!isNounEntry(entry) || !entry.plural) return null;
  if (entry.numberUsage === 'singularOnly' || entry.numberUsage === 'pluralOnly') return null;
  return `${entry.pluralArticle ?? 'die'} ${withoutArticle(entry.plural)}`;
}

/** Accepted plural forms with their article, the taught one first. */
export function acceptedPlurals(entry: VocabularyEntry): string[] {
  const plural = pluralForm(entry);
  if (plural === null || !isNounEntry(entry)) return [];
  const article = entry.pluralArticle ?? 'die';
  const configured = (entry.exerciseConfig.acceptedAnswers.plural ?? []).map(
    (form) => `${article} ${withoutArticle(form)}`,
  );
  return unique([plural, ...configured].flatMap(expandForms));
}

/** True when an article question makes sense: a plural-only noun always takes "die". */
export function asksForArticle(entry: VocabularyEntry): boolean {
  return isNounEntry(entry) && Boolean(entry.article) && entry.numberUsage !== 'pluralOnly';
}

export type VerbFormName = 'thirdPersonPresent' | 'simplePast' | 'pastParticiple';

/** Accepted spellings of one recorded verb form, the dataset's own first. Empty when unrecorded. */
export function acceptedVerbForms(entry: VocabularyEntry, form: VerbFormName): string[] {
  if (!isVerbEntry(entry) || !entry[form]) return [];
  return unique(
    [entry[form] as string, ...(entry.exerciseConfig.acceptedAnswers[form] ?? [])].flatMap(
      expandForms,
    ),
  );
}

export function hasPlural(entry: VocabularyEntry): boolean {
  return pluralForm(entry) !== null;
}

export function strictnessFor(entry: VocabularyEntry): Strictness {
  return entry.exerciseConfig.strictness;
}

/**
 * Strictness for an answer that must include the article, used by the noun-with-article
 * variants regardless of what the entry's own configuration says.
 */
export function articleStrictness(entry: VocabularyEntry): Strictness {
  return { ...strictnessFor(entry), article: true };
}

/** English strictness: capitalization is not meaningful in the interface language. */
export function englishStrictness(entry: VocabularyEntry): Strictness {
  return {
    ...strictnessFor(entry),
    capitalization: false,
    umlauts: false,
    eszett: false,
    article: false,
    punctuation: false,
  };
}

export function firstExample(entry: VocabularyEntry) {
  return entry.exampleSentences[0];
}

export function supports(entry: VocabularyEntry, type: string): boolean {
  return entry.exerciseConfig.enabledTypes.includes(
    type as (typeof entry.exerciseConfig.enabledTypes)[number],
  );
}

export function wordClassLabel(entry: VocabularyEntry): string {
  return entry.wordClass;
}

export { isNounEntry, isPhraseEntry, isVerbEntry };
