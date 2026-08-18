import type { Exercise } from '@/schemas/exerciseSchema';

/** The answer an exercise was looking for. Also used to show it again on the results page. */
export function expectedAnswerOf(exercise: Exercise): string {
  switch (exercise.type) {
    case 'multipleChoice':
      return exercise.options[exercise.correctIndex] ?? '';
    case 'matching':
      return exercise.pairs.map((pair) => `${pair.left} → ${pair.right}`).join('; ');
    case 'speaking':
      return exercise.targetText;
    case 'sentenceCompletion':
      return exercise.canonicalAnswer;
    default:
      return 'canonicalAnswer' in exercise ? exercise.canonicalAnswer : '';
  }
}

/**
 * What the exercise actually showed the learner. Paired with `expectedAnswerOf` on the
 * results page, where the entry's headword would otherwise repeat the answer for every
 * exercise whose answer *is* the German word.
 */
export function questionOf(exercise: Exercise): string {
  switch (exercise.type) {
    case 'multipleChoice':
      return exercise.question;
    case 'typedTranslation':
      return exercise.question;
    case 'sentenceCompletion':
      return `${exercise.sentenceBefore}___${exercise.sentenceAfter}`.trim();
    case 'speaking':
      return exercise.englishGloss;
    case 'wordOrdering':
      return exercise.tokens.join(' · ');
    default:
      // Listening and matching have nothing to show — the audio and the pairs are the question.
      return exercise.prompt;
  }
}
