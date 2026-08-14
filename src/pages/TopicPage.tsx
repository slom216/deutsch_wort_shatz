import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { VirtualList } from '@/components/common/VirtualList';
import { loadSearchIndex } from '@/content/vocabulary/registry';
import { topicFromSlug, TOPICS, topicSlug } from '@/content/vocabulary/topics';
import type { VocabularyIndexRecord } from '@/schemas/vocabularySchema';
import '@/styles/lists.css';
import './SettingsPage.css';
import '@/components/exercises/exercises.css';

const ROW_HEIGHT = 44;

/** `/topic/:topicSlug` — entries whose primary topic is the requested registry topic (§9). */
export default function TopicPage(): ReactNode {
  const { topicSlug: slug } = useParams<{ topicSlug: string }>();
  const topic = topicFromSlug(slug ?? '');
  const navigate = useNavigate();

  const [index, setIndex] = useState<readonly VocabularyIndexRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!topic) return;
    let cancelled = false;
    loadSearchIndex()
      .then((loaded) => {
        if (!cancelled) setIndex(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load the vocabulary index.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [topic]);

  const matches = useMemo(
    () => (index && topic ? index.filter((record) => record.primaryTopic === topic) : []),
    [index, topic],
  );

  if (!topic) {
    return (
      <>
        <PageHeader title="Topic not found" description="Choose a topic from the registry below." />
        <ul className="topic-index">
          {TOPICS.map((registered) => (
            <li key={registered}>
              <Link to={`/topic/${topicSlug(registered)}`}>{registered}</Link>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={topic}
        description="Entries whose primary topic is this one, in frequency order."
      />

      {error ? (
        <p role="alert" className="page-alert">
          {error}
        </p>
      ) : null}

      {!index && !error ? <LoadingScreen label="Loading topic…" /> : null}

      {index ? (
        <>
          <p className="band-summary">
            {matches.length.toLocaleString('en-US')} entr{matches.length === 1 ? 'y' : 'ies'}.
          </p>
          {matches.length === 0 ? (
            <p>
              No entries currently use this topic as their primary topic. It remains part of the
              controlled registry for later vocabulary phases.
            </p>
          ) : (
            <>
              <section className="settings-section" aria-labelledby="topic-practice">
                <h2 id="topic-practice">Practise this topic</h2>
                <p className="band-summary">
                  A session drawn from this topic&rsquo;s highest-frequency entries (§18).
                </p>
                <button
                  type="button"
                  className="exercise__submit"
                  onClick={() => {
                    void navigate(
                      `/practice/session/topic-${Date.now().toString(36)}?mode=topic&topic=${
                        slug ?? ''
                      }`,
                    );
                  }}
                >
                  Practise {topic}
                </button>
              </section>

              <VirtualList
                items={matches}
                rowHeight={ROW_HEIGHT}
                ariaLabel={`${topic} entries`}
                keyOf={(record) => record.id}
                renderRow={(record) => (
                  <div className="entry-row" style={{ height: ROW_HEIGHT }}>
                    <span className="entry-row__rank">{record.rank.toLocaleString('en-US')}</span>
                    <Link className="entry-row__german" to={`/word/${record.id}`} lang="de">
                      {record.german}
                    </Link>
                    <span className="entry-row__english">{record.english.join(', ')}</span>
                    <span className="entry-row__class">{record.wordClass}</span>
                    <span className="entry-row__topic">{record.level}</span>
                  </div>
                )}
              />
            </>
          )}
        </>
      ) : null}
    </>
  );
}
