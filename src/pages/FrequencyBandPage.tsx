import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { VirtualList } from '@/components/common/VirtualList';
import { bandBySlug, isCefrLevel } from '@/content/vocabulary/frequencyBands';
import { loadBand } from '@/content/vocabulary/registry';
import type { VocabularyEntry } from '@/schemas/vocabularySchema';
import '@/pages/LearnPage.css';
import '@/styles/lists.css';

const ROW_HEIGHT = 44;

/**
 * `/learn/:level/:frequencyBand` — the entries in one frequency band.
 *
 * This is the first screen to load actual vocabulary, and it proves the lazy-loading
 * path end to end: only this band's bundle is fetched, not the whole dataset (§29).
 */
export default function FrequencyBandPage(): ReactNode {
  const { level: levelParam, frequencyBand: bandParam } = useParams<{
    level: string;
    frequencyBand: string;
  }>();

  const level = (levelParam ?? '').toUpperCase();
  const band = bandBySlug(bandParam ?? '');

  const [entries, setEntries] = useState<readonly VocabularyEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!band) return;
    let cancelled = false;
    setEntries(null);
    setError(null);
    loadBand(band.id)
      .then((loaded) => {
        if (!cancelled) setEntries(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load this band.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [band]);

  if (!isCefrLevel(level) || !band || band.level !== level) {
    return (
      <>
        <PageHeader title="Frequency band not found" />
        <p role="alert">
          No frequency band matches that address. Choose one from <Link to="/learn">Learn</Link>.
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={band.id}
        description={`Global ranks ${band.from.toLocaleString('en-US')}–${band.to.toLocaleString('en-US')}. Entries are listed in frequency order.`}
      />

      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/learn">Learn</Link> <span aria-hidden="true">/</span>{' '}
        <Link to={`/learn/${level.toLowerCase()}`}>{level}</Link> <span aria-hidden="true">/</span>{' '}
        {band.id}
      </nav>

      {error ? (
        <p role="alert" className="page-alert">
          {error}
        </p>
      ) : null}

      {!entries && !error ? <LoadingScreen label="Loading vocabulary…" /> : null}

      {entries ? (
        <>
          <p className="band-summary">
            {entries.length.toLocaleString('en-US')} entries, in frequency order.
          </p>
          {/* Virtualized rather than truncated: a B1 band is 1,500 entries, and showing
              the first 50 made the rest of the band unreachable from here (§29). */}
          <VirtualList
            items={entries}
            rowHeight={ROW_HEIGHT}
            ariaLabel={`${band.id} entries`}
            keyOf={(entry) => entry.id}
            renderRow={(entry) => (
              <div className="entry-row" style={{ height: ROW_HEIGHT }}>
                <span className="entry-row__rank">{entry.rank.toLocaleString('en-US')}</span>
                <Link className="entry-row__german" to={`/word/${entry.id}`} lang="de">
                  {entry.wordClass === 'noun' && entry.article ? `${entry.article} ` : ''}
                  {entry.german}
                </Link>
                <span className="entry-row__english">{entry.english.join(', ')}</span>
                <span className="entry-row__class">{entry.wordClass}</span>
                <span className="entry-row__topic">{entry.primaryTopic}</span>
              </div>
            )}
          />
        </>
      ) : null}
    </>
  );
}
