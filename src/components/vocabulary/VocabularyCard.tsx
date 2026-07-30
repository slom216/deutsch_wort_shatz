import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useSpeechSynthesis } from '@/features/speech/useSpeechSynthesis';
import { useSettingsStore } from '@/features/settings/settingsStore';
import {
  isNounEntry,
  isPhraseEntry,
  isVerbEntry,
  type VocabularyEntry,
} from '@/schemas/vocabularySchema';
import './VocabularyCard.css';

interface VocabularyCardProps {
  readonly entry: VocabularyEntry;
  /** Shown as the explanation card when a new entry is introduced (§18). */
  readonly showExample?: boolean;
  readonly linkToEntry?: boolean;
}

/**
 * Vocabulary card (§14).
 *
 * Applies the presentation rules directly: a noun always appears with its article and
 * plural, a verb with its full form set and case, and a phrase whole with its register.
 */
export function VocabularyCard({
  entry,
  showExample = true,
  linkToEntry = true,
}: VocabularyCardProps): ReactNode {
  const speechRate = useSettingsStore((state) => state.settings.speechRate);
  const { supported, speak } = useSpeechSynthesis(speechRate);

  const headword =
    isNounEntry(entry) && entry.article ? `${entry.article} ${entry.german}` : entry.german;
  const example = entry.exampleSentences[0];

  return (
    <article className="vocab-card" aria-labelledby={`card-${entry.id}`}>
      <header className="vocab-card__header">
        <h3 className="vocab-card__headword" id={`card-${entry.id}`} lang="de">
          {linkToEntry ? <Link to={`/word/${entry.id}`}>{headword}</Link> : headword}
        </h3>
        <button
          type="button"
          className="vocab-card__speak"
          onClick={() => speak(entry.german)}
          disabled={!supported}
          aria-label={`Hear ${entry.german} pronounced`}
        >
          🔊
        </button>
      </header>

      <p className="vocab-card__english">{entry.english.join(', ')}</p>

      <p className="vocab-card__meta">
        {entry.level} · rank {entry.rank.toLocaleString('en-US')} · {entry.wordClass} ·{' '}
        {entry.primaryTopic}
      </p>

      {isNounEntry(entry) ? (
        <p className="vocab-card__forms" lang="de">
          Plural:{' '}
          {entry.plural
            ? `${entry.pluralArticle ?? 'die'} ${entry.plural}`
            : entry.numberUsage === 'singularOnly'
              ? '— (singular only)'
              : '— (not recorded)'}
        </p>
      ) : null}

      {isVerbEntry(entry) ? (
        <p className="vocab-card__forms" lang="de">
          er {entry.thirdPersonPresent} · {entry.simplePast} ·{' '}
          {entry.auxiliary === 'sein' ? 'ist' : 'hat'} {entry.pastParticiple}
          {entry.requiredCase ? ` · case: ${entry.requiredCase}` : ''}
          {entry.separable ? ' · separable' : ''}
          {entry.reflexive ? ' · reflexive' : ''}
        </p>
      ) : null}

      {isPhraseEntry(entry) ? (
        <p className="vocab-card__forms">
          Register: {entry.register} · {entry.phraseType}
        </p>
      ) : null}

      {showExample && example ? (
        <div className="vocab-card__example">
          <p lang="de">{example.german}</p>
          <p className="vocab-card__example-english">{example.english}</p>
        </div>
      ) : null}
    </article>
  );
}
