import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ExerciseRunner, type ExerciseOutcome } from '@/components/exercises/ExerciseRunner';
import { VocabularyCard } from '@/components/vocabulary/VocabularyCard';
import {
  bandBySlug,
  bandsForLevel,
  CEFR_LEVELS,
  isCefrLevel,
} from '@/content/vocabulary/frequencyBands';
import { loadBand, loadEntries, loadEntry, loadSearchIndex } from '@/content/vocabulary/registry';
import { topicFromSlug } from '@/content/vocabulary/topics';
import { loadAllProgress, introduceEntry } from '@/features/srs/repository';
import { dueEntries } from '@/features/srs/queue';
import { useSettingsStore } from '@/features/settings/settingsStore';
import type { SessionMode } from '@/features/practice/session/buildSession';
import { createRandom } from '@/features/practice/random';
import { useSessionStore } from '@/features/practice/session/sessionStore';
import type { ExerciseType, VocabularyEntry } from '@/schemas/vocabularySchema';
import '@/components/exercises/exercises.css';
import '@/styles/lists.css';

/** Entries a session draws its exercises from. A session needs dozens, not thousands. */
const WORKING_SET = 60;
/** Entries of a topic loaded for topic practice, highest-frequency first (§3). */
const TOPIC_WORKING_SET = 200;

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
  const currentIndex = useSessionStore((state) => state.currentIndex);
  const status = useSessionStore((state) => state.status);
  const start = useSessionStore((state) => state.start);
  const recordAnswer = useSessionStore((state) => state.recordAnswer);
  const advance = useSessionStore((state) => state.advance);

  const mode = (params.get('mode') ?? 'free') as SessionMode;

  const newBatchSize = useSettingsStore((state) => state.settings.newWordBatchSize);
  const strictAnswerChecking = useSettingsStore((state) => state.settings.strictAnswerChecking);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [sessionEntries, setSessionEntries] = useState<Map<string, VocabularyEntry>>(new Map());
  /**
   * Entries whose explanation card the learner has already read (§18). A new word is
   * shown and explained before it is ever graded — being tested on a word you have not
   * met is not learning.
   */
  const [explained, setExplained] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const level = (params.get('level') ?? 'A1').toUpperCase();
    const bandSlug = params.get('band') ?? 'all';
    const length = Number(params.get('length') ?? '20');
    const typesParam = params.get('types');
    const allowedTypes = typesParam
      ? (typesParam.split(',').filter(Boolean) as ExerciseType[])
      : undefined;

    /** Entries for a band-scoped session (free and topic practice). */
    const loadFromBands = async (): Promise<VocabularyEntry[]> => {
      if (!isCefrLevel(level)) throw new Error(`Unknown level: ${level}`);
      const bands =
        bandSlug === 'all'
          ? bandsForLevel(level)
          : [bandBySlug(bandSlug)].filter((b): b is NonNullable<typeof b> => b !== null);
      if (bands.length === 0) throw new Error(`Unknown frequency band: ${bandSlug}`);
      const loaded = await Promise.all(bands.map((band) => loadBand(band.id)));
      return loaded.flat();
    };

    /**
     * Entries for a review session: whatever the SRS says is due, most overdue and
     * hardest first (§18). The queue is read from IndexedDB, so a refresh mid-session
     * reproduces the same set.
     */
    const loadDue = async (): Promise<VocabularyEntry[]> => {
      const progress = await loadAllProgress();
      const queue = dueEntries(progress);
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
     */
    const loadNew = async (batchSize: number): Promise<VocabularyEntry[]> => {
      if (!isCefrLevel(level)) throw new Error(`Unknown level: ${level}`);
      const progress = await loadAllProgress();
      const seen = new Set(progress.map((p) => p.entryId));

      const candidateBands =
        bandSlug === 'all'
          ? CEFR_LEVELS.slice(CEFR_LEVELS.indexOf(level)).flatMap((each) => bandsForLevel(each))
          : [bandBySlug(bandSlug)].filter((b): b is NonNullable<typeof b> => b !== null);

      const batch: VocabularyEntry[] = [];
      for (const band of candidateBands) {
        for (const entry of await loadBand(band.id)) {
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
      if (!topic) throw new Error(`Unknown topic: ${slug || '(none given)'}`);

      const index = await loadSearchIndex();
      const ids = index
        .filter((record) => record.primaryTopic === topic)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, TOPIC_WORKING_SET)
        .map((record) => record.id);
      if (ids.length === 0) throw new Error(`No entries are filed under "${topic}" yet.`);

      const loaded = await loadEntries(ids);
      return [...loaded.values()].sort((a, b) => a.rank - b.rank);
    };

    /** Free-practice topic and word-class filters (§18). */
    const applyFilters = (candidates: readonly VocabularyEntry[]): VocabularyEntry[] => {
      const topic = topicFromSlug(params.get('topic') ?? '');
      const wordClass = params.get('class');
      return candidates.filter(
        (entry) =>
          (!topic || entry.primaryTopic === topic) && (!wordClass || entry.wordClass === wordClass),
      );
    };

    const load = async (): Promise<void> => {
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
        const all = applyFilters(loaded);
        if (all.length === 0) {
          throw new Error('No entries match those filters. Try a wider level, topic or band.');
        }
        const random = createRandom(sessionId);
        entries = random.shuffle(all).slice(0, WORKING_SET);
        pool = all;
      }

      if (cancelled) return;

      setSessionEntries(new Map(entries.map((entry) => [entry.id, entry])));

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
        ...(allowedTypes && allowedTypes.length > 0 ? { allowedTypes } : {}),
        strictAnswerChecking,
      });
      if (!cancelled) setLoadState('ready');
    };

    void load().catch((cause: unknown) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : 'Could not start this session.');
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
      await recordAnswer({
        exerciseId: outcome.exercise.id,
        entryId: outcome.exercise.entryId,
        result: outcome.result,
        attempts: outcome.attempts,
        revealed: outcome.revealed,
        hintUsed: outcome.hintUsed,
        responseMs: outcome.responseMs,
      });
      await advance();
    },
    [recordAnswer, advance],
  );

  useEffect(() => {
    if (status === 'completed' && loadState === 'ready' && sessionId) {
      void navigate(`/results/${sessionId}`, { replace: true });
    }
  }, [status, loadState, sessionId, navigate]);

  if (loadState === 'loading') return <LoadingScreen label="Building your session…" />;

  if (loadState === 'error') {
    return (
      <>
        <PageHeader title="Session unavailable" />
        <p role="alert" className="page-alert">
          {error}
        </p>
        <Link to="/practice">Back to practice</Link>
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

  // §18: a new-word batch is one explanation card, then recognition, then production.
  // The card appears once per entry, immediately before its first exercise.
  const introducing = sessionEntries.get(exercise.entryId);
  if (mode === 'new' && introducing && !explained.has(exercise.entryId)) {
    return (
      <>
        <PageHeader title="New word" />
        <p className="runner__progress">
          Word {explained.size + 1} of {new Set(exercises.map((e) => e.entryId)).size}
        </p>
        <VocabularyCard entry={introducing} linkToEntry={false} />
        <div className="runner__actions">
          <button
            type="button"
            className="runner__next"
            onClick={() => {
              setExplained((current) => new Set(current).add(exercise.entryId));
            }}
          >
            Practise this word
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Practice session" />
      <ExerciseRunner
        key={exercise.id}
        exercise={exercise}
        progressLabel={`Exercise ${currentIndex + 1} of ${exercises.length}`}
        onComplete={(outcome) => {
          void handleComplete(outcome);
        }}
      />
      <p className="band-summary" style={{ marginTop: 'var(--space-4)' }}>
        <Link to="/practice">Leave session</Link> — answered exercises are already saved.
      </p>
    </>
  );
}
