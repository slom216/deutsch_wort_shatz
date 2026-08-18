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
