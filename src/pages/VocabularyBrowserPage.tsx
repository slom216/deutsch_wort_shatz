import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { VirtualList } from '@/components/common/VirtualList';
import { GermanCharacterHelper } from '@/components/exercises/GermanCharacterHelper';
import { handleGermanCharacterShortcut } from '@/components/exercises/germanCharacters';
import { CEFR_LEVELS, FREQUENCY_BANDS } from '@/content/vocabulary/frequencyBands';
import { TOPICS } from '@/content/vocabulary/topics';
import { loadSearchIndex } from '@/content/vocabulary/registry';
import { loadAllProgress } from '@/features/srs/repository';
import {
  EMPTY_FILTERS,
  prepareIndex,
  searchVocabulary,
  type SearchableRecord,
  type VocabularyFilters,
} from '@/features/search/searchIndex';
import type { EntryProgress } from '@/schemas/progressSchema';
import '@/styles/lists.css';
import './VocabularyBrowserPage.css';

const WORD_CLASSES = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'preposition',
  'conjunction',
  'article',
  'particle',
  'numeral',
  'interjection',
  'phrase',
  'other',
] as const;

const STATUSES = ['new', 'learning', 'review', 'relearning', 'mastered'] as const;

const ROW_HEIGHT = 44;

/**
 * Vocabulary browser (§16).
 *
 * All filters combine with AND. Search covers German, English and every stored inflected
 * form, so a participle, a plural or an article form all find their entry. Typing is
 * deferred rather than debounced by hand — React keeps the input responsive while the
 * Full-dataset filter runs at a lower priority.
 */
export default function VocabularyBrowserPage(): ReactNode {
  const [index, setIndex] = useState<SearchableRecord[] | null>(null);
  const [progressByEntry, setProgressByEntry] = useState<ReadonlyMap<string, EntryProgress>>(
    new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<VocabularyFilters>(EMPTY_FILTERS);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Keeps the text field responsive: the expensive filter runs against the deferred value.
  const deferredFilters = useDeferredValue(filters);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [records, progress] = await Promise.all([loadSearchIndex(), loadAllProgress()]);
        if (cancelled) return;
        setIndex(prepareIndex(records));
        setProgressByEntry(new Map(progress.map((record) => [record.entryId, record])));
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load the vocabulary.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(
    () => (index ? searchVocabulary(index, { filters: deferredFilters, progressByEntry }) : []),
    [index, deferredFilters, progressByEntry],
  );

  const set = <K extends keyof VocabularyFilters>(key: K, value: VocabularyFilters[K]): void => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const bandsForLevelFilter =
    filters.level === 'all'
      ? FREQUENCY_BANDS
      : FREQUENCY_BANDS.filter((band) => band.level === filters.level);

  if (error) {
    return (
      <>
        <PageHeader title="Vocabulary" />
        <p role="alert" className="page-alert">
          {error}
        </p>
      </>
    );
  }

  // The header renders immediately rather than behind the spinner: the index is 2.8 MB,
  // and a blank screen while it parses looks like a broken page.
  if (!index) {
    return (
      <>
        <PageHeader
          title="Vocabulary"
          description="Search every entry by German headword or English meaning."
        />
        <LoadingScreen label="Loading vocabulary index…" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Vocabulary"
        description="Search every entry by German headword or English meaning."
      />

      <div className="vocab-filters">
        <div className="vocab-filters__field">
          <label htmlFor="vocab-search">Search</label>
          <input
            id="vocab-search"
            ref={searchRef}
            type="search"
            value={filters.query}
            onChange={(event) => set('query', event.target.value)}
            onKeyDown={(event) => {
              handleGermanCharacterShortcut(event);
            }}
            placeholder="Straße, gegangen, die Bücher, to speak"
            autoComplete="off"
          />
          {/* §17: every text input offers these — including the box whose own
              placeholder is "Straße". */}
          <GermanCharacterHelper targetRef={searchRef} />
        </div>

        <Select
          id="vocab-level"
          label="Level"
          value={filters.level}
          onChange={(value) => {
            set('level', value as VocabularyFilters['level']);
            set('band', 'all');
          }}
          options={[['all', 'All levels'], ...CEFR_LEVELS.map((l) => [l, l] as const)]}
        />

        <Select
          id="vocab-band"
          label="Frequency band"
          value={filters.band}
          onChange={(value) => set('band', value)}
          options={[
            ['all', 'All bands'],
            ...bandsForLevelFilter.map((band) => [band.id, band.id] as const),
          ]}
        />

        <Select
          id="vocab-topic"
          label="Topic"
          value={filters.topic}
          onChange={(value) => set('topic', value as VocabularyFilters['topic'])}
          options={[['all', 'All topics'], ...TOPICS.map((t) => [t, t] as const)]}
        />

        <Select
          id="vocab-class"
          label="Word class"
          value={filters.wordClass}
          onChange={(value) => set('wordClass', value as VocabularyFilters['wordClass'])}
          options={[['all', 'All classes'], ...WORD_CLASSES.map((c) => [c, c] as const)]}
        />

        <Select
          id="vocab-status"
          label="Learning status"
          value={filters.status}
          onChange={(value) => set('status', value as VocabularyFilters['status'])}
          options={[['all', 'Any status'], ...STATUSES.map((s) => [s, s] as const)]}
        />

        <Select
          id="vocab-difficulty"
          label="Difficulty"
          value={filters.difficulty}
          onChange={(value) => set('difficulty', value as VocabularyFilters['difficulty'])}
          options={[
            ['any', 'Any difficulty'],
            ['low', 'Low'],
            ['medium', 'Medium'],
            ['high', 'High'],
          ]}
        />
      </div>

      <div className="vocab-summary">
        <p className="band-summary" role="status" aria-live="polite">
          {results.length.toLocaleString('en-US')} match{results.length === 1 ? '' : 'es'} of{' '}
          {index.length.toLocaleString('en-US')}
        </p>
        <button
          type="button"
          className="runner__retry"
          onClick={() => setFilters(EMPTY_FILTERS)}
          disabled={JSON.stringify(filters) === JSON.stringify(EMPTY_FILTERS)}
        >
          Clear filters
        </button>
      </div>

      {results.length === 0 ? (
        <p>No entries match those filters.</p>
      ) : (
        <VirtualList
          items={results}
          rowHeight={ROW_HEIGHT}
          ariaLabel="Vocabulary search results"
          keyOf={(record) => record.id}
          renderRow={(record) => {
            const status = progressByEntry.get(record.id)?.srs.status ?? 'new';
            return (
              <div className="entry-row" style={{ height: ROW_HEIGHT }}>
                <span className="entry-row__rank">{record.rank.toLocaleString('en-US')}</span>
                <Link className="entry-row__german" to={`/word/${record.id}`}>
                  {record.german}
                </Link>
                <span className="entry-row__english">{record.english.join(', ')}</span>
                <span className="entry-row__class">{record.wordClass}</span>
                <span className="entry-row__topic">
                  {record.level} · {status}
                </span>
              </div>
            );
          }}
        />
      )}
    </>
  );
}

interface SelectProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: ReadonlyArray<readonly [string, string]>;
}

function Select({ id, label, value, onChange, options }: SelectProps): ReactNode {
  return (
    <div className="vocab-filters__field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
