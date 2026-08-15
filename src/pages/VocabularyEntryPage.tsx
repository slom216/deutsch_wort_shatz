import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { loadEntry } from '@/content/vocabulary/registry';
import { topicSlug } from '@/content/vocabulary/topics';
import {
  isNounEntry,
  isPhraseEntry,
  isVerbEntry,
  type VocabularyEntry,
} from '@/schemas/vocabularySchema';
import '@/styles/lists.css';
import './VocabularyEntryPage.css';

/**
 * `/word/:entryId` — full detail for one entry (§14).
 *
 * Presentation rules are enforced here: nouns always show article and plural, verbs show
 * their full conjugation set and case requirements, phrases show register and are never
 * split apart.
 */
export default function VocabularyEntryPage(): ReactNode {
  const { entryId } = useParams<{ entryId: string }>();
  const [entry, setEntry] = useState<VocabularyEntry | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entryId) return;
    let cancelled = false;
    setState('loading');
    loadEntry(entryId)
      .then((loaded) => {
        if (cancelled) return;
        setEntry(loaded);
        setState(loaded ? 'ready' : 'missing');
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Could not load this entry.');
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  if (state === 'loading') {
    return (
      <>
        <PageHeader title={entryId ?? 'Entry'} />
        <LoadingScreen label="Loading entry…" />
      </>
    );
  }

  if (state === 'error') {
    return (
      <>
        <PageHeader title="Entry unavailable" />
        <p role="alert" className="page-alert">
          {error}
        </p>
      </>
    );
  }

  if (state === 'missing' || !entry) {
    return (
      <>
        <PageHeader title="Entry not found" />
        <p role="alert">
          No vocabulary entry has the ID &ldquo;{entryId}&rdquo;. Try the{' '}
          <Link to="/vocabulary">vocabulary browser</Link>.
        </p>
      </>
    );
  }

  // §14: a noun is never taught without its article.
  const headword =
    isNounEntry(entry) && entry.article ? `${entry.article} ${entry.german}` : entry.german;

  return (
    <>
      <PageHeader title={headword} description={entry.english.join(', ')} />

      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/vocabulary">Vocabulary</Link> <span aria-hidden="true">/</span>{' '}
        <Link to={`/learn/${entry.level.toLowerCase()}`}>{entry.level}</Link>{' '}
        <span aria-hidden="true">/</span> {entry.german}
      </nav>

      <dl className="entry-detail">
        <div>
          <dt>Word class</dt>
          <dd>{entry.wordClass}</dd>
        </div>
        <div>
          <dt>Level</dt>
          <dd>{entry.level}</dd>
        </div>
        <div>
          <dt>Frequency rank</dt>
          <dd>{entry.rank.toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt>Frequency band</dt>
          <dd>{entry.frequencyBand}</dd>
        </div>
        <div>
          <dt>Primary topic</dt>
          <dd>
            <Link to={`/topic/${topicSlug(entry.primaryTopic)}`}>{entry.primaryTopic}</Link>
          </dd>
        </div>
        {entry.secondaryTopics.length > 0 ? (
          <div>
            <dt>Also</dt>
            <dd>{entry.secondaryTopics.join(', ')}</dd>
          </div>
        ) : null}
      </dl>

      {/* The panels below appear only for entries whose dataset records the grammar. The
          current sources record a checked headword, gloss, word class and topic; a page of
          "not recorded" rows would be noise, not information. */}
      {isNounEntry(entry) && (entry.article || entry.plural) ? (
        <section aria-labelledby="noun-forms" className="entry-panel">
          <h2 id="noun-forms">Noun forms</h2>
          <dl className="entry-detail">
            {entry.article ? (
              <div>
                <dt>Article</dt>
                <dd>{entry.article}</dd>
              </div>
            ) : null}
            <div>
              <dt>Plural</dt>
              <dd>
                {entry.plural
                  ? `${entry.pluralArticle ?? 'die'} ${entry.plural}`
                  : entry.numberUsage === 'singularOnly'
                    ? 'Singular only'
                    : 'Not recorded'}
              </dd>
            </div>
            {entry.genitiveSingular ? (
              <div>
                <dt>Genitive singular</dt>
                <dd>{entry.genitiveSingular}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {isVerbEntry(entry) && entry.thirdPersonPresent ? (
        <section aria-labelledby="verb-forms" className="entry-panel">
          <h2 id="verb-forms">Verb forms</h2>
          <dl className="entry-detail">
            <div>
              <dt>Infinitive</dt>
              <dd>{entry.infinitive}</dd>
            </div>
            <div>
              <dt>Third person present</dt>
              <dd>er {entry.thirdPersonPresent}</dd>
            </div>
            <div>
              <dt>Simple past</dt>
              <dd>{entry.simplePast}</dd>
            </div>
            <div>
              <dt>Past participle</dt>
              <dd>
                {entry.auxiliary === 'sein' ? 'ist' : 'hat'} {entry.pastParticiple}
              </dd>
            </div>
            {entry.auxiliary ? (
              <div>
                <dt>Auxiliary</dt>
                <dd>{entry.auxiliary}</dd>
              </div>
            ) : null}
            <div>
              <dt>Separable</dt>
              <dd>{entry.separable ? 'Separable' : 'Inseparable'}</dd>
            </div>
            <div>
              <dt>Reflexive</dt>
              <dd>
                {entry.reflexive
                  ? `Reflexive${entry.reflexiveCase ? ` (${entry.reflexiveCase})` : ''}`
                  : 'Not reflexive'}
              </dd>
            </div>
            {entry.requiredCase ? (
              <div>
                <dt>Case</dt>
                <dd>{entry.requiredCase}</dd>
              </div>
            ) : null}
            {entry.fixedPrepositions.length > 0 ? (
              <div>
                <dt>Fixed prepositions</dt>
                <dd>
                  {entry.fixedPrepositions
                    .map((p) => `${p.preposition} + ${p.case}${p.meaning ? ` (${p.meaning})` : ''}`)
                    .join('; ')}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {isPhraseEntry(entry) ? (
        <section aria-labelledby="phrase-detail" className="entry-panel">
          <h2 id="phrase-detail">Phrase</h2>
          <p className="entry-phrase">{entry.german}</p>
          <dl className="entry-detail">
            <div>
              <dt>Register</dt>
              <dd>{entry.register}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{entry.phraseType}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section aria-labelledby="examples" className="entry-panel">
        <h2 id="examples">Example sentences</h2>
        {entry.exampleSentences.length === 0 ? (
          <p className="band-summary">
            None recorded for this entry — the datasets carry only checked material.
          </p>
        ) : null}
        <ul className="example-list">
          {entry.exampleSentences.map((example) => (
            <li key={example.id}>
              <p className="example-list__german" lang="de">
                {example.german}
              </p>
              <p className="example-list__english">{example.english}</p>
            </li>
          ))}
        </ul>
      </section>

      {entry.notes && entry.notes.length > 0 ? (
        <section aria-labelledby="notes" className="entry-panel">
          <h2 id="notes">Notes</h2>
          <ul className="example-list">
            {entry.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {entry.editorialReview?.status ? (
        <p className="entry-review-flag">
          Source status: {entry.editorialReview.status}. This entry has not yet passed the manual
          language review described in the release checklist.
        </p>
      ) : null}
    </>
  );
}
