import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { LoadingScreen } from '@/components/common/LoadingScreen';
import { PageHeader } from '@/components/common/PageHeader';
import { ExerciseRunner } from '@/components/exercises/ExerciseRunner';
import { CEFR_LEVELS } from '@/content/vocabulary/frequencyBands';
import { useGamification } from '@/features/gamification/useGamification';
import { levelProgress } from '@/features/gamification/xp';
import { useSessionStore } from '@/features/practice/session/sessionStore';
import { useContinuousSession } from '@/features/practice/session/useContinuousSession';
import { levelCompletion } from '@/features/progress/analytics';
import { useReviewState } from '@/features/srs/useReviewState';
import '@/components/exercises/exercises.css';
import '@/styles/lists.css';
// `.meter` lives with the achievements screen, which is where it was first needed.
import './AchievementsPage.css';
import './ContinuousPage.css';

/** How long a level-up announcement stays on screen. */
const LEVEL_UP_MS = 8000;

/**
 * Continuous learning.
 *
 * One stream of exercises with no planned end: due reviews and new words are interleaved,
 * and words come back inside the same sitting according to how they were answered
 * (`endless.ts`). Every answer is already saved when it is given, so "stop" is just the
 * Finish button — or closing the tab.
 *
 * XP is shown as it is earned. The lifetime total is derived from stored history (§23) and
 * recomputing it after every answer would mean re-reading the whole history table, so the
 * bar adds this session's XP to the total read once at the start.
 */
export default function ContinuousPage(): ReactNode {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { snapshot: game } = useGamification();

  const stream = useContinuousSession(sessionId ?? 'continuous');

  const answers = useSessionStore((state) => state.answers);
  const bonusXp = useSessionStore((state) => state.bonusXp);
  const finish = useSessionStore((state) => state.finish);

  const sessionXp = useMemo(
    () => answers.reduce((sum, answer) => sum + (answer.xpAwarded ?? 0), 0) + bonusXp,
    [answers, bonusXp],
  );
  const correct = answers.filter((answer) => answer.result.correct).length;
  const lastXp = answers[answers.length - 1]?.xpAwarded ?? 0;

  /**
   * How far through each CEFR level the learner is, by mastery points rather than by words
   * met: a word seen once counts a fifth of a word answered cleanly five times.
   *
   * Re-read after every answer so the figure moves with the stream — this is the number the
   * learner watches while working, and a stale one defeats the point.
   */
  const { progress, refresh: refreshProgress } = useReviewState();
  useEffect(() => {
    // ponytail: full entryProgress read per answer. Apply the answer's delta locally if it drags.
    if (answers.length > 0) void refreshProgress();
  }, [answers.length, refreshProgress]);
  const completion = useMemo(() => levelCompletion(progress), [progress]);

  /** Lifetime XP before this session, captured from the first snapshot that arrives. */
  const [baseXp, setBaseXp] = useState<number | null>(null);
  useEffect(() => {
    if (baseXp !== null || !game) return;
    // Answers given before the snapshot loaded are already inside its total.
    setBaseXp(Math.max(0, game.totalXp - sessionXp));
  }, [game, baseXp, sessionXp]);

  const totalXp = (baseXp ?? 0) + sessionXp;
  const level = levelProgress(totalXp);

  const [levelUp, setLevelUp] = useState<number | null>(null);
  const previousLevel = useRef<number | null>(null);
  useEffect(() => {
    if (baseXp === null) return undefined;

    const seen = previousLevel.current;
    previousLevel.current = level.level;
    if (seen === null || level.level <= seen) return undefined;

    setLevelUp(level.level);
    const timer = setTimeout(() => setLevelUp(null), LEVEL_UP_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [level.level, baseXp]);

  const stop = async (): Promise<void> => {
    await finish();
    void navigate(`/results/${sessionId ?? ''}`);
  };

  if (!sessionId) return <LoadingScreen label="Starting…" />;
  if (stream.loading) return <LoadingScreen label="Starting your stream…" />;

  return (
    <>
      <PageHeader
        title="Continuous learning"
        description="Words keep coming — reviews when they are due, new vocabulary in between. Stop whenever you like; everything you answer is already saved."
      />

      <div className="stream-bar">
        <div className="stream-bar__level">
          <span className="stream-bar__badge">Level {level.level}</span>
          <div
            className="meter meter--goal"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(level.fraction * 100)}
            aria-label={`Progress to level ${level.level + 1}`}
          >
            <span style={{ width: `${level.fraction * 100}%` }} />
          </div>
          <span className="stream-bar__hint">{level.xpForNextLevel} XP to next level</span>
        </div>

        {/*
          All three levels, always — the stream mixes reviews from any level with new words,
          so a single figure following the word on screen would jump about for no reason.
        */}
        <div className="stream-bar__vocab">
          <span className="stream-bar__hint">Vocabulary</span>
          <ul className="stream-vocab">
            {CEFR_LEVELS.map((cefr) => {
              const percent = completion[cefr].fraction * 100;
              return (
                <li key={cefr}>
                  <span className="stream-vocab__label">
                    {cefr} <strong>{percent.toFixed(1)}%</strong>
                  </span>
                  <div
                    className="meter"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(percent)}
                    aria-label={`${cefr} complete`}
                  >
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <dl className="stream-bar__stats">
          <div>
            <dt>XP this session</dt>
            <dd>
              {sessionXp}
              {lastXp !== 0 ? (
                <span
                  className={lastXp > 0 ? 'stream-bar__gain' : 'stream-bar__gain stream-bar__loss'}
                  key={answers.length}
                >
                  {lastXp > 0 ? `+${lastXp}` : lastXp}
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Answered</dt>
            <dd>{answers.length}</dd>
          </div>
          <div>
            <dt>Correct</dt>
            <dd>
              {correct}
              {answers.length > 0 ? ` (${Math.round((correct / answers.length) * 100)}%)` : ''}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          className="page-action"
          onClick={() => {
            void stop();
          }}
        >
          Finish
        </button>
      </div>

      {/* Announced politely rather than as an alert: a level-up interrupts nothing. */}
      <div aria-live="polite">
        {levelUp !== null ? (
          <p className="stream-levelup">
            <strong>Level {levelUp}.</strong> {totalXp.toLocaleString('en-US')} XP in total.
          </p>
        ) : null}
      </div>

      {stream.error ? (
        <p role="alert" className="page-alert">
          {stream.error}
        </p>
      ) : null}

      {stream.exercise ? (
        <ExerciseRunner
          key={stream.exercise.id}
          exercise={stream.exercise}
          progressLabel={`Exercise ${answers.length + 1}`}
          onComplete={(outcome) => {
            void stream.answer(outcome);
          }}
        />
      ) : stream.error ? null : (
        <p className="band-summary">Choosing your next word…</p>
      )}
    </>
  );
}
