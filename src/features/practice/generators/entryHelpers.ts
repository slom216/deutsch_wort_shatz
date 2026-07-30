import {
  isNounEntry,
  isPhraseEntry,
  isVerbEntry,
  type VocabularyEntry,
} from '@/schemas/vocabularySchema';
import type { Strictness } from '@/schemas/exerciseSchema';

/** Shared accessors that apply the presentation rules from §14. */

/** The form a noun is always taught in: article + noun. Other classes are unchanged. */
export function headword(entry: VocabularyEntry): string {
  if (isNounEntry(entry) && entry.article) return `${entry.article} ${entry.german}`;
  return entry.german;
}

/** Accepted German answers, always including the article form for nouns. */
export function acceptedGerman(entry: VocabularyEntry): string[] {
  const configured = entry.exerciseConfig.acceptedAnswers.german;
  const forms = new Set<string>(configured);
  forms.add(entry.german);
  if (isNounEntry(entry) && entry.article) forms.add(`${entry.article} ${entry.german}`);
  return [...forms].filter((form) => form.trim().length > 0);
}

export function acceptedEnglish(entry: VocabularyEntry): string[] {
  const forms = new Set<string>([
    ...entry.exerciseConfig.acceptedAnswers.english,
    ...entry.english,
  ]);
  return [...forms].filter((form) => form.trim().length > 0);
}

export function primaryEnglish(entry: VocabularyEntry): string {
  return entry.english[0] ?? '';
}

/** The plural as it is taught: "die" + plural form. Null when the entry has no plural. */
export function pluralForm(entry: VocabularyEntry): string | null {
  if (!isNounEntry(entry) || !entry.plural) return null;
  return `${entry.pluralArticle ?? 'die'} ${entry.plural}`;
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
