import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import type { EvaluationResult, Exercise } from '@/schemas/exerciseSchema';
import { ExerciseFeedback } from './ExerciseFeedback';
import { ListeningExercise } from './ListeningExercise';
import { MatchingExercise } from './MatchingExercise';
import { MultipleChoiceExercise } from './MultipleChoiceExercise';
import { SentenceCompletionExercise } from './SentenceCompletionExercise';
import { SpeakingExercise } from './SpeakingExercise';
import { TypedTranslationExercise } from './TypedTranslationExercise';
import { WordOrderingExercise } from './WordOrderingExercise';
import type { ExerciseComponentProps } from './exerciseProps';
import './exercises.css';

/**
 * Exercise runner.
 *
 * Owns the attempt lifecycle that the automatic grading in §20 depends on:
 * a first wrong answer offers one retry, a second wrong answer locks the exercise, and
 * the learner may reveal the answer at any point (which scores zero, §23).
 *
 * The hint is owned here too, and is opt-in. §20 caps a hinted answer at grade 1 and §21
 * weights hint usage at 10% of difficulty, neither of which means anything if the hint is
 * always on screen — a hint the learner cannot decline is not a hint.
 */

export interface ExerciseOutcome {
  readonly exercise: Exercise;
  readonly result: EvaluationResult;
  readonly attempts: number;
  readonly revealed: boolean;
  readonly hintUsed: boolean;
  readonly responseMs: number;
}

interface ExerciseRunnerProps {
  readonly exercise: Exercise;
  readonly onComplete: (outcome: ExerciseOutcome) => void;
  readonly progressLabel?: string;
}

const MAX_ATTEMPTS = 2;

function renderExercise(props: ExerciseComponentProps): ReactNode {
  const { exercise } = props;
  switch (exercise.type) {
    case 'multipleChoice':
      return <MultipleChoiceExercise {...props} exercise={exercise} />;
    case 'typedTranslation':
      return <TypedTranslationExercise {...props} exercise={exercise} />;
    case 'sentenceCompletion':
      return <SentenceCompletionExercise {...props} exercise={exercise} />;
    case 'matching':
      return <MatchingExercise {...props} exercise={exercise} />;
    case 'wordOrdering':
      return <WordOrderingExercise {...props} exercise={exercise} />;
    case 'listening':
      return <ListeningExercise {...props} exercise={exercise} />;
    case 'speaking':
      return <SpeakingExercise {...props} exercise={exercise} />;
    default:
      return null;
  }
}

/** The full corrected sentence, shown after a sentence-completion answer (§15). */
function correctionFor(exercise: Exercise): string | undefined {
  return exercise.type === 'sentenceCompletion' ? exercise.fullSentence : undefined;
}

export function ExerciseRunner({
  exercise,
  onComplete,
  progressLabel,
}: ExerciseRunnerProps): ReactNode {
  const [attempt, setAttempt] = useState(1);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [locked, setLocked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    setAttempt(1);
    setResult(null);
    setLocked(false);
    setRevealed(false);
    setHintShown(false);
    startedAt.current = Date.now();
  }, [exercise.id]);

  const handleSubmit = useCallback(
    (submitted: EvaluationResult) => {
      setResult(submitted);
      // Correct, out of attempts, or already revealed: this exercise is finished.
      if (submitted.correct || attempt >= MAX_ATTEMPTS || revealed) {
        setLocked(true);
      }
    },
    [attempt, revealed],
  );

  const retry = useCallback((): void => {
    setAttempt((current) => current + 1);
    setResult(null);
  }, []);

  const reveal = (): void => {
    setRevealed(true);
    setLocked(true);
    setResult({
      correct: false,
      issues: [],
      submittedAnswer: '',
      expectedAnswer: expectedAnswerOf(exercise),
    });
  };

  const advance = useCallback((): void => {
    if (!result) return;
    onComplete({
      exercise,
      result: revealed ? { ...result, correct: false } : result,
      attempts: attempt,
      revealed,
      hintUsed: hintShown,
      responseMs: Date.now() - startedAt.current,
    });
  }, [result, onComplete, exercise, revealed, attempt, hintShown]);

  const canRetry = result !== null && !result.correct && !revealed && attempt < MAX_ATTEMPTS;

  // Enter takes whichever step the exercise is waiting for, so a whole session runs from
  // the keyboard: continue once it is answered, or try again after a first wrong answer.
  useEffect(() => {
    if (!locked && !canRetry) return undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      // A focused button or a text field handles its own Enter; intercepting would either
      // fire the button twice or swallow a typed answer's submit.
      if (target instanceof HTMLButtonElement) return;
      if (target instanceof HTMLInputElement && target.type !== 'radio') return;
      if (target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      if (locked) advance();
      else retry();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [locked, canRetry, advance, retry]);

  return (
    <section className="runner" aria-label="Exercise">
      {progressLabel ? <p className="runner__progress">{progressLabel}</p> : null}

      {renderExercise({
        exercise,
        onSubmit: handleSubmit,
        locked,
        attempt,
        revealed,
      })}

      {exercise.hint && hintShown ? (
        <p className="exercise__hint" role="status">
          {exercise.hint}
        </p>
      ) : null}

      {result ? (
        <ExerciseFeedback
          result={result}
          correction={locked ? correctionFor(exercise) : undefined}
          revealed={revealed}
        />
      ) : null}

      <div className="runner__actions">
        {canRetry ? (
          <button type="button" className="runner__retry" onClick={retry}>
            Try again
          </button>
        ) : null}

        {exercise.hint && !hintShown && !locked ? (
          <button
            type="button"
            className="runner__hint"
            onClick={() => {
              setHintShown(true);
            }}
          >
            Show hint
          </button>
        ) : null}

        {!locked && !revealed ? (
          <button type="button" className="runner__reveal" onClick={reveal}>
            Show answer
          </button>
        ) : null}

        {locked ? (
          <button type="button" className="runner__next" onClick={advance}>
            Continue <span aria-hidden="true">(Enter)</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}

function expectedAnswerOf(exercise: Exercise): string {
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
