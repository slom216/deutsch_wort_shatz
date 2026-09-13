import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ExerciseRunner, type ExerciseOutcome } from '@/components/exercises/ExerciseRunner';
import { LevelBadge } from '@/components/gamification/LevelBadge';
import {
  bandBySlug,
  bandsForLevel,
  CEFR_LEVELS,
  isCefrLevel,
} from '@/content/vocabulary/frequencyBands';
import { loadBand, loadEntries, loadEntry, loadSearchIndex } from '@/content/vocabulary/registry';
import { topicFromSlug } from '@/content/vocabulary/topics';
import { loadAllProgress, loadQueueableProgress, introduceEntry } from '@/features/srs/repository';
import { dueEntries } from '@/features/srs/queue';
import { loadSkippedIds } from '@/features/srs/skipped';
import { useSettingsStore } from '@/features/settings/settingsStore';
import { introductionOrder } from '@/features/learning/introductionOrder';
import type { SessionMode } from '@/features/practice/session/buildSession';
import { availableExerciseTypes } from '@/features/practice/exerciseTypes';
import { createRandom } from '@/features/practice/random';
import { useSessionStore } from '@/features/practice/session/sessionStore';
import type { ExerciseType, VocabularyEntry } from '@/schemas/vocabularySchema';
import '@/components/exercises/exercises.css';
import '@/styles/lists.css';
import './PracticeSessionPage.css';

/** Entries a session draws its exercises from. A session needs dozens, not thousands. */
const WORKING_SET = 60;
/** Entries of a topic loaded for topic practice, highest-frequency first (§3). */
const TOPIC_WORKING_SET = 200;

/** A problem with what was asked for, worded for the learner. Anything else is not. */
class SelectionError extends Error {}

const STORAGE_FAILURE =
  'This session could not be started because your progress cannot be saved in this browser. Reload the page, and check that private browsing or site-data blocking is not switched on.';

const TITLES: Partial<Record<SessionMode, string>> = {
  review: 'Review session',
  new: 'New words',
  topic: 'Topic practice',
};

/**
 * A running practice session.
 *
 * The session id seeds generation, so reloading this URL rebuilds exactly the same
 * exercises. Outcomes are written to IndexedDB as each exercise is answered.
 */
export default function PracticeSessionPage(): ReactNode {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const exercises = useSessionStore((state) => state.exercises);
  const storedId = useSessionStore((state) => state.sessionId);
  const currentIndex = useSessionStore((state) => state.currentIndex);
  const status = useSessionStore((state) => state.status);
  const start = useSessionStore((state) => state.start);
  const recordAnswer = useSessionStore((state) => state.recordAnswer);
  const advance = useSessionStore((state) => state.advance);

  const mode = (params.get('mode') ?? 'free') as SessionMode;

  const newBatchSize = useSettingsStore((state) => state.settings.newWordBatchSize);
  const settings = useSettingsStore((state) => state.settings);
  const { strictAnswerChecking } = settings;
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  /** An answer whose save failed, kept so it can be sent again. */
  const [unsaved, setUnsaved] = useState<ExerciseOutcome | null>(null);
  // A word is met in its own first exercise rather than on an explanation card before it:
  // the first question for a new entry is a recognition one, and its feedback names the
  // answer. This departs from §18's "explain, then practise" — reading a card for every
  // new word costs more time than it teaches.

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const level = (params.get('level') ?? 'A1').toUpperCase();
    const bandSlug = params.get('band') ?? 'all';
    const length = Number(params.get('length') ?? '20');
    const typesParam = params.get('types');
    const requestedTypes = typesParam
      ? (typesParam.split(',').filter(Boolean) as ExerciseType[])
      : [];

    /** Entries for a band-scoped session (free and topic practice). */
    const loadFromBands = async (): Promise<VocabularyEntry[]> => {
      if (!isCefrLevel(level)) throw new SelectionError(`Unknown level: ${level}`);
      const bands =
        bandSlug === 'all'
          ? bandsForLevel(level)
          : [bandBySlug(bandSlug)].filter((b): b is NonNullable<typeof b> => b !== null);
      if (bands.length === 0) throw new SelectionError(`Unknown frequency band: ${bandSlug}`);
      const loaded = await Promise.all(bands.map((band) => loadBand(band.id)));
      return loaded.flat();
    };

    /**
     * Entries for a review session: whatever the SRS says is due, most overdue and
     * hardest first (§18). The queue is read from IndexedDB, so a refresh mid-session
     * reproduces the same set.
     */
    const loadDue = async (): Promise<VocabularyEntry[]> => {
      const queue = dueEntries((await loadQueueableProgress()).queueable);
      if (queue.length === 0) return [];
      const entries = await Promise.all(queue.slice(0, 40).map((p) => loadEntry(p.entryId)));
      return entries.filter((entry): entry is VocabularyEntry => entry !== null);
    };

    /**
     * Entries for a new-word session: the highest-frequency entries not yet introduced.
     *
     * Bands are walked in frequency order and, when the requested level runs out, the walk
     * continues into the next level (§3, §18). Stopping at one level is what produced an
     * empty batch — and so an instant 0-of-0 results page — for any learner past A1.
     *
     * Within a band the words are taken in introduction order, not rank order: the source
     * wordlist arrives in topical then alphabetical blocks, so a batch of five drawn
     * verbatim would be five consecutive numbers or five B-words.
     */
    const loadNew = async (batchSize: number): Promise<VocabularyEntry[]> => {
      if (!isCefrLevel(level)) throw new SelectionError(`Unknown level: ${level}`);
      const progress = await loadAllProgress();
      const seen = new Set(progress.map((p) => p.entryId));

      const candidateBands =
        bandSlug === 'all'
          ? CEFR_LEVELS.slice(CEFR_LEVELS.indexOf(level)).flatMap((each) => bandsForLevel(each))
          : [bandBySlug(bandSlug)].filter((b): b is NonNullable<typeof b> => b !== null);

      const batch: VocabularyEntry[] = [];
      for (const band of candidateBands) {
        for (const entry of introductionOrder(band.id, await loadBand(band.id))) {
          if (seen.has(entry.id)) continue;
          batch.push(entry);
          if (batch.length >= batchSize) return batch;
        }
      }
      return batch;
    };

    /**
     * Entries for a topic session (§18). The highest-frequency entries of the topic are
     * the working set; the session draws from them with its own seed so two sessions on
     * one topic are not identical.
     */
    const loadTopic = async (): Promise<VocabularyEntry[]> => {
      const slug = params.get('topic') ?? '';
      const topic = topicFromSlug(slug);
      if (!topic) throw new SelectionError(`Unknown topic: ${slug || '(none given)'}`);

      const index = await loadSearchIndex();
      const ids = index
        .filter((record) => record.primaryTopic === topic)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, TOPIC_WORKING_SET)
        .map((record) => record.id);
      if (ids.length === 0) throw new SelectionError(`No entries are filed under "${topic}" yet.`);

      const loaded = await loadEntries(ids);
      return [...loaded.values()].sort((a, b) => a.rank - b.rank);
    };

    /** Free-practice topic, word-class and exercise-type filters (§18). */
    const applyFilters = (
      candidates: readonly VocabularyEntry[],
      allowedTypes: readonly ExerciseType[],
    ): VocabularyEntry[] => {
      const topic = topicFromSlug(params.get('topic') ?? '');
      const wordClass = params.get('class');
      const filtered = candidates.filter(
        (entry) =>
          (!topic || entry.primaryTopic === topic) && (!wordClass || entry.wordClass === wordClass),
      );

      // The working set is sampled from these, so entries that cannot produce any of the
      // chosen formats have to go now — sampling first and filtering later is how a
      // session restricted to a rare format (word ordering needs a multi-word phrase)
      // ends up empty.
      return filtered.filter((entry) =>
        entry.exerciseConfig.enabledTypes.some((type) => allowedTypes.includes(type)),
      );
    };

    const load = async (): Promise<void> => {
      // Settings and browser support decide which formats are possible at all; a `types`
      // parameter can only narrow that, never widen it (§19).
      const available = await availableExerciseTypes(settings);
      const allowedTypes =
        requestedTypes.length > 0
          ? available.filter((type) => requestedTypes.includes(type))
          : available;

      let entries: VocabularyEntry[];
      let pool: VocabularyEntry[];

      if (mode === 'review') {
        entries = await loadDue();
        // Distractors still come from the same level so options stay plausible (§15).
        pool = entries.length > 0 ? await loadFromBands().catch(() => entries) : entries;
      } else if (mode === 'new') {
        entries = await loadNew(newBatchSize);
        // Distractors come from the level the batch actually landed in, which is not
        // necessarily the level in the URL once a level has been exhausted.
        const batchLevel = entries[0]?.level ?? level;
        pool = isCefrLevel(batchLevel)
          ? (await Promise.all(bandsForLevel(batchLevel).map((band) => loadBand(band.id)))).flat()
          : entries;
      } else {
        // Cap the working set: a session needs a few dozen entries, not thousands. Draw
        // them with the session's own seed, or every session on a band or topic would
        // drill the same first entries and the rest would be unreachable.
        const loaded = mode === 'topic' ? await loadTopic() : await loadFromBands();
        const all = applyFilters(loaded, allowedTypes);
        const random = createRandom(sessionId);
        entries = random.shuffle(all).slice(0, WORKING_SET);
        pool = all;
      }

      if (cancelled) return;

      // Set-aside words are set aside everywhere, not only in continuous learning: the
      // learner parked them, and a review session serving one back would read as a bug.
      // Filtered here, where every mode's working set has just been assembled.
      const skipped = await loadSkippedIds();
      if (skipped.size > 0) entries = entries.filter((entry) => !skipped.has(entry.id));

      // A new-word session introduces its entries before they can be scheduled (§18).
      if (mode === 'new') {
        await Promise.all(entries.map((entry) => introduceEntry(entry.id)));
      }

      await start({
        sessionId,
        mode,
        entries,
        pool,
        ...(mode === 'new'
          ? { newWordEntryCount: newBatchSize }
          : { targetExerciseCount: Number.isFinite(length) ? length : 20 }),
        allowedTypes,
        strictAnswerChecking,
      });
      if (!cancelled) setLoadState('ready');
    };

    void load().catch((cause: unknown) => {
      if (cancelled) return;
      // Library errors carry internal text and third-party links; only our own are shown.
      setError(cause instanceof SelectionError ? cause.message : STORAGE_FAILURE);
      setLoadState('error');
    });

    return () => {
      cancelled = true;
    };
    // `params` is intentionally read once per session id: changing filters starts a new
    // session with a new id rather than mutating the running one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleComplete = useCallback(
    async (outcome: ExerciseOutcome): Promise<void> => {
      const recorded = await recordAnswer({
        exerciseId: outcome.exercise.id,
        entryId: outcome.exercise.entryId,
        result: outcome.result,
        attempts: outcome.attempts,
        revealed: outcome.revealed,
        hintUsed: outcome.hintUsed,
        responseMs: outcome.responseMs,
        ...(outcome.selfAssessed ? { selfAssessed: true } : {}),
      });
      // Not recorded means another tab got there first and the store now shows its state.
      if (recorded) await advance();
    },
    [recordAnswer, advance],
  );

  const submit = (outcome: ExerciseOutcome): void => {
    setUnsaved(null);
    handleComplete(outcome).catch(() => setUnsaved(outcome));
  };

  useEffect(() => {
    if (status === 'completed' && loadState === 'ready' && sessionId && exercises.length > 0) {
      void navigate(`/results/${sessionId}`, { replace: true });
    }
  }, [status, loadState, sessionId, navigate, exercises.length]);

  if (loadState === 'loading') return <LoadingScreen label="Building your session…" />;

  if (loadState === 'error') {
    return (
      <>
        <PageHeader title="Session unavailable" />
        <p role="alert" className="page-alert">
          {error}
        </p>
        <p>
          <Link to="/learn">Back to Learn</Link> · <Link to="/practice">Practice</Link>
        </p>
      </>
    );
  }

  // Nothing could be built: every due word is set aside, the words no longer exist, or no
  // entry supports the chosen formats. Say so rather than showing an empty results page.
  // `storedId` guards against a previous session's exercises still being in the store.
  if (exercises.length === 0 && storedId === sessionId) {
    return mode === 'review' ? (
      <>
        <PageHeader title="Nothing to review right now" />
        <p>None of your words can be reviewed at the moment. Come back when more are due.</p>
        <p>
          <Link to="/learn">Learn new words</Link> · <Link to="/skipped">Words you set aside</Link>
        </p>
      </>
    ) : (
      <>
        <PageHeader title="No exercises match this selection" />
        <p>
          None of these words can be practised in the formats available here. Formats depend on your
          settings and on what this browser supports.
        </p>
        <p>
          <Link to="/learn">Back to Learn</Link> · <Link to="/settings">Settings</Link>
        </p>
      </>
    );
  }

  const exercise = exercises[currentIndex];

  if (!exercise) {
    return (
      <>
        <PageHeader title="Session finished" />
        <p>
          <Link to={`/results/${sessionId}`}>See your results</Link>
        </p>
      </>
    );
  }

  return (
    <div className="practice-session">
      <PageHeader title={TITLES[mode] ?? 'Practice session'} />
      <div className="level-badge-bar">
        <LevelBadge />
      </div>
      {unsaved ? (
        <div role="alert" className="page-alert">
          <p>Your answer could not be saved, so the session cannot move on yet.</p>
          <button type="button" className="page-action" onClick={() => submit(unsaved)}>
            Try again
          </button>
        </div>
      ) : null}
      <ExerciseRunner
        key={exercise.id}
        exercise={exercise}
        progressLabel={`Exercise ${currentIndex + 1} of ${exercises.length}`}
        onComplete={submit}
      />
      <p className="band-summary" style={{ marginTop: 'var(--space-4)' }}>
        <Link to="/practice">Leave session</Link> — answered exercises are already saved.
      </p>
    </div>
  );
}
