import type { ReactNode } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import '@/pages/SettingsPage.css';

/**
 * About and privacy (§26, §31).
 *
 * The speech wording is mandated by §26 and deliberately does not claim that recognition
 * is processed locally — several browsers send audio to a remote service.
 */
export default function AboutPage(): ReactNode {
  return (
    <>
      <PageHeader
        title="About Deutsch Wort Shatz"
        description="A German vocabulary trainer for CEFR levels A1, A2 and B1 that runs entirely in your browser."
      />

      <section className="settings-section" aria-labelledby="about-app">
        <h2 id="about-app">What this is</h2>
        <p>
          Deutsch Wort Shatz teaches 10,000 German words and phrases — 1,000 at A1, 3,000 at A2 and
          6,000 at B1 — ordered by frequency and grouped by topic. Nouns are always taught with
          their article and plural, verbs with their full conjugation, and phrases as complete
          chunks.
        </p>
        <p>
          Reviews are scheduled automatically using spaced repetition. You are never asked to rate
          how well you know a word.
        </p>
      </section>

      <section className="settings-section" aria-labelledby="about-privacy">
        <h2 id="about-privacy">Privacy</h2>
        <ul className="about-list">
          <li>No account and no login.</li>
          <li>No backend, no cloud storage and no synchronisation.</li>
          <li>All progress is stored locally in this browser using IndexedDB.</li>
          <li>No analytics.</li>
          <li>You can export your progress to a file, and delete it completely at any time.</li>
        </ul>
      </section>

      <section className="settings-section" aria-labelledby="about-speech">
        <h2 id="about-speech">Browser speech</h2>
        <p>
          Speaking exercises use your browser&rsquo;s speech recognition feature. The app does not
          record or store your voice. Browser behaviour may vary.
        </p>
        <p>
          Listening exercises use your browser&rsquo;s speech synthesis with a German (de-DE) voice
          when one is installed. If speech is unavailable, written fallbacks are always provided and
          you are never blocked from progressing.
        </p>
      </section>

      <section className="settings-section" aria-labelledby="about-content">
        <h2 id="about-content">Vocabulary content</h2>
        <p>
          Entries were assembled from public reference material and normalised for this application.
          Example sentences, topic assignments and morphology enrichment were generated for this app
          and are undergoing editorial review; some entries are still marked as needing a language
          check.
        </p>
      </section>
    </>
  );
}
