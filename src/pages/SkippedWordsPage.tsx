import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { LoadingScreen } from '@/components/common/LoadingScreen';
import { PageHeader } from '@/components/common/PageHeader';
import { loadEntries } from '@/content/vocabulary/registry';
import { continuousSessionPath } from '@/features/practice/session/endless';
import { loadSkipped, unskipEntry } from '@/features/srs/skipped';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import '@/components/exercises/exercises.css';
import '@/styles/lists.css';

/**
 * Skipped words.
 *
 * The words the learner set aside during continuous learning, most recent first, with what
 * they mean and which level they belong to — the two things worth knowing before deciding
 * whether to take one back. Nothing here is lost progress: a skipped word keeps its score
 * and its schedule, and returning it puts it straight back where it was.
 */
export default function SkippedWordsPage(): ReactNode {
  const [entries, setEntries] = useState<readonly VocabularyEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      const skipped = await loadSkipped();
      const loaded = await loadEntries(skipped.map((row) => row.entryId));
      // Skip order, not frequency order: the last word put aside is the one being wondered
      // about. Ids the content no longer has simply drop out of the list.
      setEntries(
        skipped
          .map((row) => loaded.get(row.entryId))
          .filter((entry): entry is VocabularyEntry => entry !== undefined),
      );
    };

    void load().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Could not load your skipped words.');
      setEntries([]);
    });
  }, []);

  const returnWord = async (entryId: string): Promise<void> => {
    await unskipEntry(entryId);
    setEntries((current) => current?.filter((entry) => entry.id !== entryId) ?? null);
  };

  if (!entries && !error) return <LoadingScreen label="Finding what you set aside…" />;

  return (
    <>
      <PageHeader
        title="Skipped words"
        description="Words you set aside while learning. They keep everything they had earned — score and schedule both — and stay out of your practice until you send them back."
      />

      {error ? (
        <p role="alert" className="page-alert">
          {error}
        </p>
      ) : null}

      {entries && entries.length === 0 ? (
        <p className="band-summary">
          Nothing is set aside right now. Use <strong>Skip this word</strong> in{' '}
          <Link to={continuousSessionPath()}>continuous learning</Link> to park a word you would
          rather not work on yet.
        </p>
      ) : null}

      {entries && entries.length > 0 ? (
        <>
          <p className="band-summary" role="status" aria-live="polite">
            {entries.length} {entries.length === 1 ? 'word is' : 'words are'} set aside.
          </p>

          <ul className="entry-list">
            {entries.map((entry) => (
              <li key={entry.id} className="entry-row">
                <span className="entry-row__rank">{entry.level}</span>
                <Link className="entry-row__german" to={`/word/${entry.id}`} lang="de">
                  {entry.wordClass === 'noun' && entry.article ? `${entry.article} ` : ''}
                  {entry.german}
                </Link>
                <span className="entry-row__english">{entry.english.join(', ')}</span>
                <span className="entry-row__class">{entry.wordClass}</span>
                <button
                  type="button"
                  className="page-action"
                  // Every button on the page reads "Return", so the word goes in the label:
                  // a screen reader announces which one it is about.
                  aria-label={`Return ${entry.german} to learning`}
                  onClick={() => {
                    void returnWord(entry.id);
                  }}
                >
                  Return
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
