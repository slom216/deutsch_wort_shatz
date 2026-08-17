import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { LoadingScreen } from '@/components/common/LoadingScreen';
import { PageHeader } from '@/components/common/PageHeader';
import { MultipleChoiceExercise } from '@/components/exercises/MultipleChoiceExercise';
import { loadEntries } from '@/content/vocabulary/registry';
import { avatarSrc } from '@/features/gamification/xp';
import { createRandom } from '@/features/practice/random';
import { continuousSessionPath } from '@/features/practice/session/endless';
import {
  ALARM_SECONDS,
  BONUS_SECONDS,
  DIFFICULTIES,
  formatClock,
  loadBestStreak,
  MIN_MASTERED,
  questionFor,
  READY_SECONDS,
  saveBestStreak,
  START_SECONDS,
  streakLevel,
  type Difficulty,
} from '@/features/practice/streakGame';
import { loadAllProgress, MASTERY_SCORE_TARGET } from '@/features/srs/repository';
import type { MultipleChoiceExercise as Question } from '@/schemas/exerciseSchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import '@/components/exercises/exercises.css';
import '@/styles/lists.css';
import './PracticePage.css';

/**
 * Practice learned skills.
 *
 * Not a study screen: everything here is a word the learner has already mastered, asked in
 * the two recognition formats and nothing else. The point is the streak — one wrong answer
 * ends the run, and the clock only ever grows by answering. Nothing is written to the SRS,
 * so a bad run costs nothing but the score.
 *
 * The exercise component is used directly rather than through `ExerciseRunner`: the runner
 * offers to reveal the answer, which is a cheat code here, and makes the learner click
 * Continue, which would burn the clock it exists to defend.
 */

/** Entries that may fail to make a question before the run gives up. */
const MAX_SKIPS = 10;
/** How long the level-up flash stays on screen. */
const LEVEL_UP_MS = 2000;

type Status = 'loading' | 'ready' | 'countdown' | 'playing' | 'over';

interface GameOver {
  readonly reason: 'wrong' | 'time' | 'exhausted';
  /** The question that ended it, for a game lost on a wrong answer. */
  readonly missed: Question | null;
  readonly streak: number;
  readonly best: boolean;
}

export default function PracticePage(): ReactNode {
  const [status, setStatus] = useState<Status>('loading');
  const [mastered, setMastered] = useState<readonly VocabularyEntry[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [streak, setStreak] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>('master');
  const [bests, setBests] = useState<Partial<Record<Difficulty, number>>>({});
  const [seconds, setSeconds] = useState(START_SECONDS);
  const [countdown, setCountdown] = useState(READY_SECONDS);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [over, setOver] = useState<GameOver | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** The shuffled deck and where we are in it. Refs: advancing must not wait for a render. */
  const deck = useRef<readonly VocabularyEntry[]>([]);
  const cursor = useRef(0);
  const asked = useRef(0);
  // Seeded from the clock, not from a fixed string: the rest of the app seeds from session
  // ids so a refresh rebuilds the same exercises, but a game that dealt the same order every
  // time you opened the page would be memorisable.
  const random = useRef(createRandom(`streak-${Date.now()}`));

  /* ---- the mastered pool, loaded once ---- */
  useEffect(() => {
    const load = async (): Promise<void> => {
      const progress = await loadAllProgress();
      const ids = progress
        .filter((record) => (record.masteryScore ?? 0) >= MASTERY_SCORE_TARGET)
        .map((record) => record.entryId);
      const entries = await loadEntries(ids);

      setMastered([...entries.values()]);
      setBests(
        Object.fromEntries(DIFFICULTIES.map((level) => [level.id, loadBestStreak(level.id)])),
      );
      setStatus('ready');
    };

    void load().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Could not load your mastered words.');
      setStatus('ready');
    });
  }, []);

  /**
   * The next question, taken from the deck. The deck is reshuffled and walked again when it
   * runs out, so a learner with twelve mastered words still gets an endless run.
   *
   * Distractors come from the mastered set itself: an option the learner has never met is a
   * free elimination, and their own vocabulary is what the mode is about.
   */
  const nextQuestion = useCallback((wrong: number): Question | null => {
    for (let skip = 0; skip < MAX_SKIPS; skip += 1) {
      if (cursor.current >= deck.current.length) {
        deck.current = random.current.shuffle(deck.current);
        cursor.current = 0;
      }

      const entry = deck.current[cursor.current] as VocabularyEntry | undefined;
      cursor.current += 1;
      if (!entry) break;

      asked.current += 1;
      const built = questionFor(
        entry,
        deck.current,
        random.current,
        `streak-${asked.current}`,
        wrong,
      );
      if (built) return built;
    }
    return null;
  }, []);

  const startGame = useCallback(
    (level: Difficulty): void => {
      deck.current = random.current.shuffle(mastered);
      cursor.current = 0;
      const first = nextQuestion(wrongCount(level));
      if (!first) {
        setError('None of your mastered words can make a question right now.');
        return;
      }

      setDifficulty(level);
      setQuestion(first);
      setStreak(0);
      setSeconds(START_SECONDS);
      setCountdown(READY_SECONDS);
      setLevelUp(null);
      setOver(null);
      setError(null);
      setStatus('countdown');
    },
    [mastered, nextQuestion],
  );

  const endGame = useCallback(
    (reason: GameOver['reason'], missed: Question | null, finalStreak: number): void => {
      const isBest = saveBestStreak(difficulty, finalStreak);
      if (isBest) setBests((current) => ({ ...current, [difficulty]: finalStreak }));
      setOver({ reason, missed, streak: finalStreak, best: isBest });
      setStatus('over');
    },
    [difficulty],
  );

  /* ---- three, two, one: the question is already on screen behind it ---- */
  useEffect(() => {
    if (status !== 'countdown') return undefined;
    const timer = setTimeout(() => {
      if (countdown <= 0) setStatus('playing');
      else setCountdown((left) => left - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [status, countdown]);

  /* ---- the clock ---- */
  useEffect(() => {
    if (status !== 'playing') return undefined;
    const timer = setInterval(() => {
      setSeconds((left) => left - 1);
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [status]);

  useEffect(() => {
    if (status === 'playing' && seconds <= 0) endGame('time', null, streak);
  }, [seconds, status, streak, endGame]);

  /* ---- the level flash; the rank card beside it swaps on its own ---- */
  const level = streakLevel(streak);
  const previousLevel = useRef(1);
  useEffect(() => {
    if (status !== 'playing') return undefined;
    if (level <= previousLevel.current) {
      previousLevel.current = level;
      return undefined;
    }

    previousLevel.current = level;
    setLevelUp(level);
    const timer = setTimeout(() => {
      setLevelUp(null);
    }, LEVEL_UP_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [level, status]);

  const answer = (correct: boolean): void => {
    if (!question) return;

    if (!correct) {
      endGame('wrong', question, streak);
      return;
    }

    const next = nextQuestion(wrongCount(difficulty));
    if (!next) {
      // The deck cycles, so this needs every remaining word in a row to fail to make a
      // question. The answer still counted.
      endGame('exhausted', null, streak + 1);
      return;
    }

    setStreak((current) => current + 1);
    setSeconds((left) => left + BONUS_SECONDS);
    setQuestion(next);
  };

  if (status === 'loading') return <LoadingScreen label="Finding what you have learned…" />;

  return (
    <>
      <PageHeader
        title="Practice"
        description={`Words you have already mastered, one after another. Answer wrong and the run is over — every right answer buys you ${BONUS_SECONDS} more seconds.`}
      />

      {error ? (
        <p role="alert" className="page-alert">
          {error}
        </p>
      ) : null}

      {status === 'ready' ? (
        <ReadyScreen count={mastered.length} bests={bests} onStart={startGame} />
      ) : null}

      {status === 'countdown' ? (
        <section className="streak-panel" aria-live="assertive">
          <p className="streak-countdown">{countdown > 0 ? countdown : 'Los!'}</p>
        </section>
      ) : null}

      {status === 'playing' && question ? (
        <>
          <div className="streak-bar">
            <img className="streak-bar__rank" src={avatarSrc(level)} alt={`Level ${level}`} />
            <dl className="streak-bar__stats">
              <div>
                <dt>Level</dt>
                <dd>{level}</dd>
              </div>
              <div>
                <dt>Streak</dt>
                <dd aria-live="polite">{streak}</dd>
              </div>
              <div>
                <dt>Best</dt>
                <dd>{bests[difficulty] ?? 0}</dd>
              </div>
              <div>
                <dt>Mode</dt>
                <dd>{labelOf(difficulty)}</dd>
              </div>
            </dl>
            <Clock seconds={seconds} />
          </div>

          {/* Fixed, not in the flow: a banner appearing above the options would shove them
              out from under the pointer mid-run. */}
          <div aria-live="polite">
            {levelUp === null ? null : (
              <p className="streak-levelup streak-levelup--toast">
                <strong>Level {levelUp}!</strong> {streak} in a row.
              </p>
            )}
          </div>

          <MultipleChoiceExercise
            key={question.id}
            exercise={question}
            locked={false}
            revealed={false}
            onSubmit={(result) => {
              answer(result.correct);
            }}
          />
        </>
      ) : null}

      {status === 'over' && over ? (
        <OverScreen
          over={over}
          difficulty={difficulty}
          onAgain={() => {
            startGame(difficulty);
          }}
          onChange={() => {
            setStatus('ready');
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The countdown.
 *
 * `aria-live` is off deliberately: a screen reader announcing every second would drown out
 * the question. The alarm threshold is announced once instead, by the region below it.
 */
function Clock({ seconds }: { seconds: number }): ReactNode {
  const left = Math.max(0, seconds);
  const alarm = left <= ALARM_SECONDS;

  return (
    <div className="streak-clock">
      <p
        className={alarm ? 'streak-clock__time streak-clock__time--alarm' : 'streak-clock__time'}
        role="timer"
        aria-live="off"
        aria-label={`${left} seconds left`}
      >
        {formatClock(left)}
      </p>
      <div aria-live="polite" className="streak-clock__announce">
        {alarm ? `${ALARM_SECONDS} seconds left` : ''}
      </div>
    </div>
  );
}

/** Wrong options a level shows, and its name. Unknown ids cannot happen; the cast is the price. */
function levelOf(difficulty: Difficulty): (typeof DIFFICULTIES)[number] {
  return DIFFICULTIES.find((level) => level.id === difficulty) ?? DIFFICULTIES[3];
}

function wrongCount(difficulty: Difficulty): number {
  return levelOf(difficulty).wrong;
}

function labelOf(difficulty: Difficulty): string {
  return levelOf(difficulty).label;
}

function ReadyScreen({
  count,
  bests,
  onStart,
}: {
  count: number;
  bests: Partial<Record<Difficulty, number>>;
  onStart: (difficulty: Difficulty) => void;
}): ReactNode {
  if (count < MIN_MASTERED) {
    return (
      <section className="streak-panel">
        <h2>Not enough learned words yet</h2>
        <p>
          You have mastered {count} {count === 1 ? 'word' : 'words'}. This game needs {MIN_MASTERED}{' '}
          to make a question worth answering.
        </p>
        <p className="band-summary">
          Keep going in <Link to={continuousSessionPath()}>continuous learning</Link> — a word
          counts as mastered once you have answered it cleanly {MASTERY_SCORE_TARGET} times.
        </p>
      </section>
    );
  }

  return (
    <section className="streak-panel">
      <h2>{count} words are ready for you</h2>
      <ul className="streak-rules">
        <li>
          You start with {START_SECONDS} seconds. Each correct answer adds {BONUS_SECONDS}.
        </li>
        <li>One wrong answer, or the clock reaching zero, ends the run.</li>
        <li>Levels come after 10 in a row, then 20 more, then 30 more.</li>
        <li>Pick how many wrong answers you want to sift through. Each keeps its own best.</li>
      </ul>
      <ul className="streak-modes">
        {DIFFICULTIES.map((level) => (
          <li key={level.id}>
            {/* The hardest is focused on arrival, so Enter still starts the original game. */}
            <button
              type="button"
              className="exercise__submit"
              autoFocus={level.id === 'master'}
              onClick={() => {
                onStart(level.id);
              }}
            >
              {level.label}
              <span className="streak-modes__detail">
                {level.wrong + 1} options
                {(bests[level.id] ?? 0) > 0 ? ` · best ${String(bests[level.id])}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OverScreen({
  over,
  difficulty,
  onAgain,
  onChange,
}: {
  over: GameOver;
  difficulty: Difficulty;
  onAgain: () => void;
  onChange: () => void;
}): ReactNode {
  const level = streakLevel(over.streak);

  return (
    <section className="streak-panel" aria-live="polite">
      <img className="streak-panel__rank" src={avatarSrc(level)} alt={`Level ${level}`} />
      <h2>
        {over.reason === 'wrong'
          ? 'That one got away'
          : over.reason === 'time'
            ? 'Time is up'
            : 'That is every word you know'}
      </h2>

      <p className="streak-panel__score">
        <strong>{over.streak}</strong> in a row · level {level}
      </p>

      {over.best ? (
        <p className="streak-levelup">A new best streak on {labelOf(difficulty)}!</p>
      ) : null}

      {over.missed ? (
        <p className="band-summary">
          <span lang={over.missed.variant === 'germanToEnglish' ? 'de' : 'en'}>
            {over.missed.question}
          </span>{' '}
          is{' '}
          <strong lang={over.missed.variant === 'germanToEnglish' ? 'en' : 'de'}>
            {over.missed.options[over.missed.correctIndex]}
          </strong>
          .
        </p>
      ) : null}

      <button type="button" className="exercise__submit" autoFocus onClick={onAgain}>
        Play {labelOf(difficulty)} again
      </button>
      <button type="button" className="streak-panel__switch" onClick={onChange}>
        Pick another level
      </button>
    </section>
  );
}
