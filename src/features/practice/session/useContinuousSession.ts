import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExerciseOutcome } from '@/components/exercises/ExerciseRunner';
import { CEFR_LEVELS, bandsForLevel } from '@/content/vocabulary/frequencyBands';
import { loadBand, loadEntry } from '@/content/vocabulary/registry';
import { generateAllForEntry } from '@/features/practice/generators';
import { createRandom } from '@/features/practice/random';
import { dueEntries } from '@/features/srs/queue';
import { introduceEntry, loadAllProgress, loadProgress } from '@/features/srs/repository';
import { useSettingsStore } from '@/features/settings/settingsStore';
import type { Exercise } from '@/schemas/exerciseSchema';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import { relaxStrictness } from './buildSession';
import { formatForScore, requeue, requeueOffset, takeReady, type Requeued } from './endless';
import { loadStreamSchedule, saveStreamSchedule } from './streamSchedule';
import { useSessionStore } from './sessionStore';

/**
 * Continuous learning: one endless stream of exercises the learner can leave at any time.
 *
 * Nothing is planned ahead. Each exercise is chosen when the previous one is answered,
 * from three sources in this order:
 *
 *   1. a word the stream itself put back — see `endless.ts` for the spacing;
 *   2. a word the SRS says is due today;
 *   3. a word the learner has never met, taken in frequency order (§3). New words are
 *      met in the exercise itself rather than on an explanation card first: the first
 *      question for a word is a recognition one, and its feedback teaches the answer.
 *
 * Sources 2 and 3 alternate so a large review backlog never blocks new vocabulary, and
 * vice versa. When both run dry the stream falls back to whatever the learner has already
 * started, least recently reviewed first — the stream is not allowed to end on its own.
 *
 * Every answer is written straight through to the SRS and to exercise history by the
 * session store, so stopping is just navigating away: there is no state to commit.
 */

/** The formats the score ladder uses; nothing else is generated for the stream. */
const LADDER_TYPES = ['multipleChoice', 'typedTranslation'] as const;

/** Variants that ask what a word means, in either direction. */
const TRANSLATION_VARIANTS: readonly string[] = ['germanToEnglish', 'englishToGerman'];

/** One in every N fresh words is a new one, the rest come from the review queue. */
const NEW_WORD_EVERY = 2;
/** Consecutive entries that may fail to produce an exercise before the stream gives up. */
const MAX_EMPTY_ENTRIES = 10;

export interface ContinuousSession {
  readonly loading: boolean;
  readonly error: string | null;
  /** The exercise on screen, or null while the next one is being chosen. */
  readonly exercise: Exercise | null;
  /**
   * Running quiz score of the word on screen, 0–`MASTERY_SCORE_TARGET`. Shown beside the
   * exercise: it is what picks the format and what decides whether the word comes back, so
   * it is the one number that explains why this question appeared.
   */
  readonly masteryScore: number;
  readonly answer: (outcome: ExerciseOutcome) => Promise<void>;
}

/** Every band in frequency order, A1 first — the order new words are introduced in. */
const ALL_BANDS = CEFR_LEVELS.flatMap((level) => bandsForLevel(level));

export function useContinuousSession(sessionId: string): ContinuousSession {
  const settings = useSettingsStore((state) => state.settings);
  const start = useSessionStore((state) => state.start);
  const serve = useSessionStore((state) => state.serve);
  const recordAnswer = useSessionStore((state) => state.recordAnswer);
  const exercise = useSessionStore((state) => state.exercises[state.currentIndex] ?? null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [masteryScore, setMasteryScore] = useState(0);

  const random = useRef(createRandom(sessionId));
  /** Exercises answered in this stream. The unit the spacing offsets are measured in. */
  const position = useRef(0);
  const served = useRef(0);
  const requeued = useRef<readonly Requeued[]>([]);
  const dueIds = useRef<string[]>([]);
  /** Introduced entries, least recently reviewed first — the last-resort source. */
  const startedIds = useRef<string[]>([]);
  /** Entry ids the learner has a progress record for, so new words skip them. */
  const seen = useRef<Set<string>>(new Set());
  const entries = useRef<Map<string, VocabularyEntry>>(new Map());
  /** Generated exercises per entry; the ladder picks from them by score. */
  const generated = useRef<Map<string, readonly Exercise[]>>(new Map());
  /** Distractor pool, grown one band at a time as the stream walks the vocabulary. */
  const pool = useRef<VocabularyEntry[]>([]);
  const loadedBands = useRef<Set<string>>(new Set());
  const cursor = useRef({ band: 0, offset: 0 });
  const freshCount = useRef(0);
  const startedOnce = useRef(false);

  // Strict checking is read through a ref so changing it mid-stream affects the exercises
  // built from then on without rebuilding the callbacks. The exercise-type settings do not
  // apply here: the score ladder decides the format (§ SCORE_FORMATS).
  const strict = useRef(settings.strictAnswerChecking);
  useEffect(() => {
    strict.current = settings.strictAnswerChecking;
  }, [settings]);

  /** Loads a band once, adding it to the distractor pool. */
  const bandEntries = useCallback(async (bandId: string): Promise<readonly VocabularyEntry[]> => {
    const list = await loadBand(bandId);
    if (!loadedBands.current.has(bandId)) {
      loadedBands.current.add(bandId);
      pool.current = [...pool.current, ...list];
    }
    return list;
  }, []);

  const entryById = useCallback(
    async (entryId: string): Promise<VocabularyEntry | null> => {
      const cached = entries.current.get(entryId);
      if (cached) return cached;

      const loaded = await loadEntry(entryId);
      if (!loaded) return null;

      entries.current.set(entryId, loaded);
      // Its whole band joins the distractor pool. A stream that opens on a requeued word —
      // which is what a resumed stream does — would otherwise generate that word's
      // exercises against an empty pool, and multiple choice with nothing to choose
      // between is no multiple choice at all: the ladder would fall through to typing.
      await bandEntries(loaded.frequencyBand);
      return loaded;
    },
    [bandEntries],
  );

  /**
   * The next word the learner has never met, in frequency order across every level.
   * Introducing it here — rather than in batches up front — is what lets the stream run
   * indefinitely without writing 10,000 progress records.
   */
  const nextNewEntry = useCallback(async (): Promise<VocabularyEntry | null> => {
    while (cursor.current.band < ALL_BANDS.length) {
      const band = ALL_BANDS[cursor.current.band];
      if (!band) break;
      const list = await bandEntries(band.id);

      while (cursor.current.offset < list.length) {
        const entry = list[cursor.current.offset] as VocabularyEntry;
        cursor.current.offset += 1;
        if (seen.current.has(entry.id)) continue;

        seen.current.add(entry.id);
        entries.current.set(entry.id, entry);
        await introduceEntry(entry.id);
        return entry;
      }

      cursor.current.band += 1;
      cursor.current.offset = 0;
    }
    return null;
  }, [bandEntries]);

  /** Which word comes next. */
  const nextEntry = useCallback(async (): Promise<VocabularyEntry | null> => {
    const ready = takeReady(requeued.current, position.current);
    if (ready) {
      requeued.current = ready.rest;
      const entry = await entryById(ready.entryId);
      if (entry) return entry;
    }

    freshCount.current += 1;
    const preferNew = freshCount.current % NEW_WORD_EVERY === 0;

    if (preferNew) {
      const fresh = await nextNewEntry();
      if (fresh) return fresh;
    }

    // A word already waiting in the requeue is spoken for, and the other two sources cannot
    // see it: `dueIds` is a snapshot taken at stream start, and a correct answer leaves an
    // entry due again in ten minutes, so a word requeued at exercise 70 was being served
    // from the due queue at 62 and then again at 70 — the same word, eight exercises apart.
    const pending = new Set(requeued.current.map((item) => item.entryId));

    while (dueIds.current.length > 0) {
      const dueId = dueIds.current.shift() as string;
      if (pending.has(dueId)) continue;
      const entry = await entryById(dueId);
      if (entry) return entry;
    }

    if (!preferNew) {
      const fresh = await nextNewEntry();
      if (fresh) return fresh;
    }

    // Nothing due and no vocabulary left: keep the stream running on words already met.
    for (let attempt = 0; attempt < startedIds.current.length; attempt += 1) {
      const entryId = startedIds.current.shift() as string;
      startedIds.current.push(entryId);
      if (pending.has(entryId)) continue;
      const entry = await entryById(entryId);
      if (entry) return entry;
    }

    return null;
  }, [entryById, nextNewEntry]);

  /**
   * The exercise for this entry, chosen by its running quiz score (`SCORE_FORMATS`).
   *
   * The score decides the format outright — recognition by choice while the word is new,
   * typed production once it is nearly learned — so a word met five times is met five
   * different ways, and the way it is asked says how well the learner knows it.
   *
   * The stream generates only the two formats the ladder uses. Listening and speaking are
   * still available in Practice, where the learner picks the formats themselves.
   */
  const exerciseFor = useCallback(
    async (entry: VocabularyEntry): Promise<Exercise | null> => {
      let generatedForEntry = generated.current.get(entry.id);

      if (!generatedForEntry) {
        const sameLevel = pool.current.filter((candidate) => candidate.level === entry.level);
        const distractorPool = sameLevel.length >= 20 ? sameLevel : pool.current;
        generatedForEntry = generateAllForEntry({
          entry,
          pool: distractorPool.length > 0 ? distractorPool : [entry],
          random: random.current,
          id: `${sessionId}-${entry.id}`,
          allowedTypes: LADDER_TYPES,
        });
        generated.current.set(entry.id, generatedForEntry);
      }

      if (generatedForEntry.length === 0) return null;

      const progress = await loadProgress(entry.id);
      const score = progress?.masteryScore ?? 0;
      setMasteryScore(score);
      const wanted = formatForScore(score);

      // Fall back within the ladder rather than dropping the word: an entry that cannot
      // produce the exact format — one whose gloss yields too few plausible distractors,
      // say — is still worth asking about. A translation in the other direction is a far
      // better substitute than a question about the word's class, which teaches nothing
      // about what it means, so the ranking prefers meaning over anything else.
      const rank = (candidate: Exercise): number => {
        const translates = TRANSLATION_VARIANTS.includes(candidate.variant);
        if (candidate.type === wanted.type && candidate.variant === wanted.variant) return 0;
        if (translates && candidate.type === wanted.type) return 1;
        if (translates) return 2;
        return 3;
      };
      const base = [...generatedForEntry].sort((a, b) => rank(a) - rank(b))[0] as Exercise;

      const adjusted = strict.current ? base : relaxStrictness(base);
      // A stream shows the same exercise more than once, and history rows are keyed by
      // exercise id — without a per-serving suffix the second showing would be recorded
      // as a duplicate of the first and never reach the SRS.
      served.current += 1;
      return { ...adjusted, id: `${adjusted.id}#${served.current}` };
    },
    [sessionId],
  );

  const serveNext = useCallback(async (): Promise<void> => {
    for (let attempt = 0; attempt < MAX_EMPTY_ENTRIES; attempt += 1) {
      const next = await nextEntry();
      if (!next) break;

      const built = await exerciseFor(next);
      if (!built) continue;

      await serve(built);
      return;
    }

    setError('There is nothing left to study right now. Try again once reviews come due.');
  }, [exerciseFor, nextEntry, serve]);

  useEffect(() => {
    // The ref is the only guard needed, and it must be the only one. React's development
    // StrictMode mounts, unmounts and remounts: a cancellation flag set by the cleanup
    // would abandon the first run half-way while the ref blocks the second, leaving the
    // page on "Starting your stream…" for ever. Starting is idempotent, so it simply runs
    // once and is allowed to finish.
    if (startedOnce.current) return;
    startedOnce.current = true;

    const begin = async (): Promise<void> => {
      const progress = await loadAllProgress();
      seen.current = new Set(progress.map((record) => record.entryId));
      dueIds.current = dueEntries(progress).map((record) => record.entryId);
      startedIds.current = [...progress]
        .sort((a, b) => (a.srs.lastReviewedAt ?? '').localeCompare(b.srs.lastReviewedAt ?? ''))
        .map((record) => record.entryId);

      await start({ sessionId, mode: 'continuous', entries: [] });

      // Spacing is stored, not per-session: offsets are measured in exercises, so a
      // learner who studies in short sittings would otherwise meet every word once and
      // never see it come back.
      const schedule = await loadStreamSchedule();
      position.current = schedule.position;
      requeued.current = schedule.requeued;
      // Continue the serving counter too: exercise ids carry it, and a repeat id would be
      // taken for an already-answered exercise and never reach the SRS.
      served.current = useSessionStore.getState().exercises.length;
      setLoading(false);

      if (!useSessionStore.getState().exercises[useSessionStore.getState().currentIndex]) {
        await serveNext();
      }
    };

    void begin().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Could not start continuous learning.');
      setLoading(false);
    });
  }, [sessionId, serveNext, start]);

  const answer = useCallback(
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

      position.current += 1;

      const progress = await loadProgress(outcome.exercise.entryId);
      const offset = requeueOffset(
        { correct: outcome.result.correct, masteryScore: progress?.masteryScore ?? 0 },
        random.current,
      );
      if (offset !== null) {
        requeued.current = requeue(
          requeued.current,
          outcome.exercise.entryId,
          position.current + offset,
        );
      }
      await saveStreamSchedule({ position: position.current, requeued: requeued.current });

      await serveNext();
    },
    [recordAnswer, serveNext],
  );

  return { loading, error, exercise, masteryScore, answer };
}
