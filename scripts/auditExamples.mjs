/**
 * `npm run audit:examples`
 *
 * Every entry needs at least one original example sentence, and every example needs at
 * least one target token that actually occurs in the sentence (§13). Also surfaces the
 * editorial-review backlog the datasets declare in their own metadata.
 */

import { finish, loadAllEntries, printSample, ui } from './lib/loadDataset.mjs';

/**
 * Formulaic examples the audit tolerates before failing.
 *
 * Set at the level the shipped datasets currently sit at, so the count can only go down.
 * Rewriting them is language work, not a code change — see README, "Known content issues".
 */
const MAX_FORMULAIC_EXAMPLES = 9600;

/**
 * Punctuation- and case-insensitive containment check, tolerant of short inflectional
 * endings so `Arbeitsplan` still matches `Arbeitsplans` in a sentence. Both sides are
 * normalized identically — normalizing only the token would make every phrase entry
 * whose sentence *is* the phrase (e.g. "Ja, bitte.") look like a mismatch.
 */
function normalizeForMatch(value) {
  return value
    .toLowerCase()
    .replace(/[.!?,;:„“"'()]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function occursIn(sentence, token) {
  const haystack = normalizeForMatch(sentence);
  const needle = normalizeForMatch(token);
  if (needle.length === 0) return false;
  if (haystack.includes(needle)) return true;
  // Allow a short inflectional tail (e.g. genitive -s, plural -e/-en, verb endings).
  const stem = needle.length > 4 ? needle.slice(0, Math.max(4, needle.length - 2)) : needle;
  return haystack.includes(stem);
}

function main() {
  const { entries } = loadAllEntries();
  const errors = [];
  const warnings = [];

  ui.heading(`audit:examples — ${entries.length} entries`);

  const noExample = [];
  const noTargetToken = [];
  const emptyText = [];
  const tokenNotFound = [];
  let exampleCount = 0;

  for (const entry of entries) {
    const examples = entry.exampleSentences ?? [];
    if (examples.length === 0) {
      noExample.push(`${entry.id} (${entry.german})`);
      continue;
    }
    for (const example of examples) {
      exampleCount += 1;
      if (!example.german?.trim() || !example.english?.trim()) {
        emptyText.push(`${example.id}: empty German or English text`);
      }
      const tokens = example.targetTokens ?? [];
      if (tokens.length === 0) {
        noTargetToken.push(`${example.id}: no target token`);
        continue;
      }
      const found = tokens.some((token) => occursIn(example.german ?? '', token));
      if (!found) {
        tokenNotFound.push(
          `${example.id}: target token ${JSON.stringify(tokens[0])} not found in "${example.german}"`,
        );
      }
    }
  }

  if (noExample.length > 0) {
    // The datasets record only checked material and carry no example sentences, so this
    // is the editorial backlog rather than a build failure. The checks below still run
    // over any examples that do exist.
    ui.warn(`${noExample.length} entries have no example sentence`);
    printSample(noExample, 5);
    warnings.push(...noExample);
  } else {
    ui.ok(`every entry has at least one example (${exampleCount} examples total)`);
  }

  if (emptyText.length > 0) {
    ui.fail(`${emptyText.length} examples have empty text`);
    printSample(emptyText);
    errors.push(...emptyText);
  } else {
    ui.ok('every example has both German and English text');
  }

  if (noTargetToken.length > 0) {
    ui.fail(`${noTargetToken.length} examples have no target token`);
    printSample(noTargetToken);
    errors.push(...noTargetToken);
  } else {
    ui.ok('every example declares at least one target token');
  }

  // A target token that does not occur in its own sentence makes sentence-completion
  // exercises unbuildable, but this is a content-authoring defect rather than a
  // structural one — it is reported for the Phase 18 language audit.
  if (tokenNotFound.length > 0) {
    ui.warn(`${tokenNotFound.length} target tokens do not occur in their own sentence`);
    printSample(tokenNotFound, 10);
    warnings.push(...tokenNotFound);
  } else {
    ui.ok('every target token occurs in its own sentence');
  }

  /* ---- formulaic example sentences ----
   *
   * An example sentence exists so the learner meets the word in use, and so sentence
   * completion has something to gap. A template does neither: "Das ist der ___" is
   * answerable from the article alone, and 6,000 B1 entries share one skeleton, so a
   * session's sentences differ only in the blank. This counts them so the debt is visible
   * on every run rather than discovered by a learner.
   */
  const TEMPLATES = [
    /^Das ist (der|die|das) /,
    /^(Heute|Wir) (üben|lernen|müssen|können|machen) /,
    /^Diese Lösung ist /,
    /^Ich möchte (heute|das|die|den|mich heute) /,
    /^Der Kurs ist /,
    /^Das Wort ist /,
    /^Hier sind die /,
    / ist in diesem Zusammenhang wichtig\.$/,
  ];

  const formulaic = entries.filter(
    (entry) =>
      (entry.exampleSentences ?? []).length > 0 &&
      entry.exampleSentences.every((example) =>
        TEMPLATES.some((pattern) => pattern.test(example.german ?? '')),
      ),
  );

  if (formulaic.length > MAX_FORMULAIC_EXAMPLES) {
    ui.fail(
      `${formulaic.length} entries have only formulaic example sentences ` +
        `(threshold ${MAX_FORMULAIC_EXAMPLES})`,
    );
    printSample(
      formulaic.slice(0, 5).map((e) => `${e.id}: "${e.exampleSentences[0].german}"`),
      5,
    );
    errors.push(`${formulaic.length} entries have only formulaic example sentences`);
  } else if (formulaic.length > 0) {
    ui.warn(`${formulaic.length} entries have only formulaic example sentences`);
    warnings.push(`${formulaic.length} formulaic example sentences`);
  } else {
    ui.ok('no entry relies on a formulaic example sentence');
  }

  /* ---- editorial-review backlog declared by the datasets ---- */
  const review = entries.filter((e) => e.editorialReview?.required || e.editorialReview?.status);
  if (review.length > 0) {
    ui.warn(`${review.length} entries are flagged for linguistic review by their source dataset`);
    const byStatus = new Map();
    for (const entry of review) {
      const key = entry.editorialReview.status ?? 'unspecified';
      byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
    }
    for (const [status, count] of byStatus) ui.info(`- ${status}: ${count}`);
  }

  finish('audit:examples', errors, warnings);
}

main();
