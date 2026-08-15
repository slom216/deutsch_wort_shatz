import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { StatCard } from '@/components/common/StatCard';
import { loadSessionHistory, loadSessionRecord } from '@/features/practice/session/sessionStore';
import { loadAllProgress, MASTERY_SCORE_TARGET } from '@/features/srs/repository';
import { useEntryLabels } from '@/features/learning/useEntryLabels';
import type { ExerciseHistory } from '@/schemas/progressSchema';
import type { PracticeSessionRecord } from '@/schemas/sessionSchema';
import '@/styles/lists.css';

/**
 * Session results (§19).
 *
 * Everything shown here is read back from IndexedDB rather than from memory, which is
 * what demonstrates that session results genuinely persist.
 */
export default function ResultsPage(): ReactNode {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [record, setRecord] = useState<PracticeSessionRecord | null>(null);
  const [history, setHistory] = useState<ExerciseHistory[]>([]);
  const [scores, setScores] = useState<Map<string, number>>(new Map());
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const labels = useEntryLabels([...new Set(history.map((row) => row.entryId))]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    void (async () => {
      const [session, rows] = await Promise.all([
        loadSessionRecord(sessionId),
        loadSessionHistory(sessionId),
      ]);
      if (cancelled) return;
      setRecord(session ?? null);
      setHistory(rows.sort((a, b) => a.answeredAt.localeCompare(b.answeredAt)));
      setState(session ? 'ready' : 'missing');

      // The quiz score each entry now stands at, so the session reads as progress made.
      const progress = await loadAllProgress();
      if (cancelled) return;
      setScores(new Map(progress.map((row) => [row.entryId, row.masteryScore])));
    })().catch(() => {
      // If local storage is unavailable there are no results to show. Fall through to
      // the "not found" screen rather than leaving the page on a spinner forever.
      if (!cancelled) setState('missing');
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (state === 'loading') return <LoadingScreen label="Loading results…" />;

  if (state === 'missing' || !record) {
    return (
      <>
        <PageHeader title="Results not found" />
        <p role="alert">
          No session with the id &ldquo;{sessionId}&rdquo; is stored in this browser.
        </p>
        <Link to="/practice">Start a new session</Link>
      </>
    );
  }

  const answered = history.length;
  const correct = history.filter((row) => row.correct).length;
  const accuracy = answered === 0 ? 0 : Math.round((correct / answered) * 100);
  const firstAttempt = history.filter((row) => row.correct && row.firstAttempt).length;
  const revealed = history.filter((row) => row.revealed).length;
  const averageMs =
    answered === 0
      ? 0
      : Math.round(history.reduce((sum, row) => sum + row.responseMs, 0) / answered);

  // Error categories aggregated across the session, most frequent first (§16).
  const errorCounts = new Map<string, number>();
  for (const row of history) {
    for (const category of row.errorCategories) {
      errorCounts.set(category, (errorCounts.get(category) ?? 0) + 1);
    }
  }
  const topErrors = [...errorCounts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader
        title="Session results"
        description={`${record.mode} session · ${answered} of ${record.plannedExerciseCount} exercises answered`}
      />

      <dl className="stat-grid">
        <StatCard label="Accuracy" value={`${accuracy}%`} hint={`${correct} of ${answered}`} />
        <StatCard label="Correct first time" value={firstAttempt} hint="No hint used" />
        <StatCard
          label="XP earned"
          value={record.xpEarned}
          hint="Bonuses are added on the dashboard"
        />
        <StatCard label="Revealed" value={revealed} hint="Answers you asked to see" />
        <StatCard
          label="Average time"
          value={`${(averageMs / 1000).toFixed(1)}s`}
          hint="Per exercise"
        />
      </dl>

      {topErrors.length > 0 ? (
        <section className="entry-panel" aria-labelledby="results-errors">
          <h2 id="results-errors">What to work on</h2>
          <ul className="example-list">
            {topErrors.map(([category, count]) => (
              <li key={category}>
                {humanizeCategory(category)} — {count}×
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="entry-panel" aria-labelledby="results-detail">
        <h2 id="results-detail">Every answer</h2>
        <ol className="entry-list">
          {history.map((row) => (
            <li key={row.id} className="entry-row">
              <span className="entry-row__rank">{row.correct ? '✓' : '✗'}</span>
              <Link className="entry-row__german" to={`/word/${row.entryId}`} lang="de">
                {labels.get(row.entryId) ?? row.entryId}
              </Link>
              <span className="entry-row__english">{row.exerciseType}</span>
              <span className="entry-row__class">
                {row.revealed ? 'revealed' : row.firstAttempt ? 'first try' : 'retried'}
              </span>
              <span className="entry-row__topic">
                {scores.has(row.entryId)
                  ? `score ${scores.get(row.entryId)}/${MASTERY_SCORE_TARGET}`
                  : `${(row.responseMs / 1000).toFixed(1)}s`}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <p>
        <Link to="/practice">Practise again</Link>
      </p>
    </>
  );
}

function humanizeCategory(category: string): string {
  const labels: Record<string, string> = {
    wrongMeaning: 'Wrong meaning',
    missingArticle: 'Missing article',
    wrongArticle: 'Wrong article',
    wrongCapitalization: 'Capitalization',
    wrongPlural: 'Plural form',
    wrongConjugation: 'Verb form',
    missingUmlaut: 'Umlauts',
    ssInsteadOfEszett: 'ss instead of ß',
    punctuationError: 'Punctuation',
    wordOrderError: 'Word order',
    missingToken: 'Missing word',
    extraToken: 'Extra word',
  };
  return labels[category] ?? category;
}
