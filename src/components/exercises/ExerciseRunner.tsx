import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { isNearMiss, wordVerdicts } from '@/features/practice/evaluation/evaluateAnswer';
import type { EvaluationResult, Exercise } from '@/schemas/exerciseSchema';
import { ExerciseFeedback } from './ExerciseFeedback';
import { ListeningExercise } from './ListeningExercise';
import { MatchingExercise } from './MatchingExercise';
import { MultipleChoiceExercise } from './MultipleChoiceExercise';
import { SentenceCompletionExercise } from './SentenceCompletionExercise';
import { SpeakingExercise } from './SpeakingExercise';
import { TypedTranslationExercise } from './TypedTranslationExercise';
import { WordOrderingExercise } from './WordOrderingExercise';
import { expectedAnswerOf } from './expectedAnswer';
import type { ExerciseComponentProps } from './exerciseProps';
import './exercises.css';

/**
 * Exercise runner.
 *
 * Owns the answer lifecycle that the automatic grading in §20 depends on:
 * one try per word — the answer locks the exercise whether it was right or wrong, and a
 * wrong answer costs XP (§23). The learner may reveal the answer instead, which scores zero.
 *
 * The hint is owned here too, and is opt-in. §20 caps a hinted answer at grade 1 and §21
 * weights hint usage at 10% of difficulty, neither of which means anything if the hint is
 * always on screen — a hint the learner cannot decline is not a hint.
 */

export interface ExerciseOutcome {
  readonly exercise: Exercise;
  readonly result: EvaluationResult;
  /** 1, or 2 when a near miss earned a second try — the SRS grades a retry as §20's "difficult". */
  readonly attempts: number;
  readonly revealed: boolean;
  readonly hintUsed: boolean;
  readonly responseMs: number;
}

/** Only typed answers can be a near miss; a picked option is either right or wrong. */
function acceptsTypedAnswer(exercise: Exercise): boolean {
  if (exercise.type === 'typedTranslation' || exercise.type === 'sentenceCompletion') return true;
  return exercise.type === 'listening' && exercise.options === undefined;
}

interface ExerciseRunnerProps {
  readonly exercise: Exercise;
  readonly onComplete: (outcome: ExerciseOutcome) => void;
  readonly progressLabel?: string;
  /**
   * Sets this word aside instead of answering it. Given only by modes that have somewhere
   * to put it — continuous learning — so no other caller grows a button it cannot honour.
   */
  readonly onSkip?: () => void;
}

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
  onSkip,
}: ExerciseRunnerProps): ReactNode {
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [locked, setLocked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [nearMiss, setNearMiss] = useState<EvaluationResult | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    setResult(null);
    setLocked(false);
    setRevealed(false);
    setHintShown(false);
    setAttempts(0);
    setNearMiss(null);
    startedAt.current = Date.now();
  }, [exercise.id]);

  const handleSubmit = useCallback(
    (submitted: EvaluationResult) => {
      const attempt = attempts + 1;
      setAttempts(attempt);
      // A typo is not a lost word: one — and only one — extra try when the answer is close.
      if (attempt === 1 && acceptsTypedAnswer(exercise) && isNearMiss(submitted)) {
        setNearMiss(submitted);
        return;
      }
      setNearMiss(null);
      setResult(submitted);
      setLocked(true);
    },
    [attempts, exercise],
  );

  const reveal = (): void => {
    setNearMiss(null);
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
      attempts: Math.max(attempts, 1),
      revealed,
      hintUsed: hintShown,
      responseMs: Date.now() - startedAt.current,
    });
  }, [result, onComplete, exercise, revealed, hintShown, attempts]);

  // Enter continues once the exercise is answered, so a whole session runs from the keyboard.
  useEffect(() => {
    if (!locked) return undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      // A focused button or a text field handles its own Enter; intercepting would either
      // fire the button twice or swallow a typed answer's submit.
      if (target instanceof HTMLButtonElement) return;
      if (target instanceof HTMLInputElement && target.type !== 'radio') return;
      if (target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      advance();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [locked, advance]);

  return (
    <section className="runner" aria-label="Exercise">
      {progressLabel ? <p className="runner__progress">{progressLabel}</p> : null}

      {renderExercise({
        exercise,
        onSubmit: handleSubmit,
        locked,
        revealed,
      })}

      {nearMiss ? (
        <div className="near-miss" role="status" aria-live="polite">
          <p className="near-miss__heading">
            <span aria-hidden="true">≈</span> So close — one more try.
          </p>
          <p className="near-miss__words" lang="de">
            {wordVerdicts(nearMiss.submittedAnswer, nearMiss.expectedAnswer).map(
              (verdict, index) => (
                <span
                  key={`${verdict.word}-${index}`}
                  className={
                    verdict.correct ? 'near-miss__word' : 'near-miss__word near-miss__word--wrong'
                  }
                >
                  {verdict.word}
                </span>
              ),
            )}
          </p>
        </div>
      ) : null}

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

        {/* Only before an answer: once one is in, the word is graded and Continue owns
            the way on. */}
        {onSkip && !locked ? (
          <button type="button" className="runner__skip" onClick={onSkip}>
            Skip this word
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
