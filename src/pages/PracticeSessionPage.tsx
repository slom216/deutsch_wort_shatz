import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ExerciseRunner, type ExerciseOutcome } from '@/components/exercises/ExerciseRunner';
import { bandBySlug, bandsForLevel, isCefrLevel } from '@/content/vocabulary/frequencyBands';
import { loadBand, loadEntry } from '@/content/vocabulary/registry';
import { loadAllProgress, introduceEntry } from '@/features/srs/repository';
import { dueEntries } from '@/features/srs/queue';
import { useSettingsStore } from '@/features/settings/settingsStore';
import type { SessionMode } from '@/features/practice/session/buildSession';
import { useSessionStore } from '@/features/practice/session/sessionStore';
import type { ExerciseType, VocabularyEntry } from '@/schemas/vocabularySchema';
import '@/components/exercises/exercises.css';
import '@/styles/lists.css';

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

  const newBatchSize = useSettingsStore((state) => state.settings.newWordBatchSize);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

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

    const mode = (params.get('mode') ?? 'free') as SessionMode;

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

    /** Entries for a new-word session: the highest-frequency entries not yet introduced. */
    const loadNew = async (batchSize: number): Promise<VocabularyEntry[]> => {
      const [progress, pool] = await Promise.all([loadAllProgress(), loadFromBands()]);
      const seen = new Set(progress.map((p) => p.entryId));
      return pool.filter((entry) => !seen.has(entry.id)).slice(0, batchSize);
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
        pool = await loadFromBands();
      } else {
        const all = await loadFromBands();
        // Cap the working set: a session needs a few dozen entries, not thousands.
        entries = all.slice(0, 60);
        pool = all.slice(0, 400);
      }

      if (cancelled) return;

      // A new-word session introduces its entries before they can be scheduled (§18).
      if (mode === 'new') {
        await Promise.all(entries.map((entry) => introduceEntry(entry.id)));
      }

      await start({
        sessionId,
        mode,
        entries,
        pool,
        ...(mode === 'new' ? {} : { targetExerciseCount: Number.isFinite(length) ? length : 20 }),
        ...(allowedTypes && allowedTypes.length > 0 ? { allowedTypes } : {}),
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
