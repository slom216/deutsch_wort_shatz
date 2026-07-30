/**
 * Content build step.
 *
 * Reads the authoring datasets in `data/`, normalizes topics onto the controlled
 * registry, and emits one JSON bundle per frequency band plus a compact search index
 * into `src/content/vocabulary/generated/`.
 *
 * Splitting by band is what lets the app lazy-load vocabulary a band at a time (§29)
 * instead of pulling a 17 MB B1 file into the initial bundle. The generated directory
 * is git-ignored and rebuilt by `predev`, `prebuild` and `pretest`, so `data/` stays
 * the only committed copy of the vocabulary.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { FREQUENCY_BANDS } from '../src/content/vocabulary/frequencyBands.ts';
import { loadAllEntries, REPO_ROOT, ui } from './lib/loadDataset.mjs';

const OUT_DIR = path.join(REPO_ROOT, 'src/content/vocabulary/generated');

function bandFileName(band) {
  return `${band.slug}.json`;
}

function main() {
  const startedAt = Date.now();
  const { entries, unresolvedTopics } = loadAllEntries();

  if (unresolvedTopics.size > 0) {
    ui.fail('build:content aborted — unregistered topic labels found:');
    for (const [label, count] of unresolvedTopics) ui.info(`- ${label} (${count})`);
    ui.info('Add an alias in src/content/vocabulary/topics.ts, then re-run.');
    process.exit(1);
  }

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const byBand = new Map(FREQUENCY_BANDS.map((band) => [band.id, []]));
  for (const entry of entries) {
    const bucket = byBand.get(entry.frequencyBand);
    if (!bucket) {
      ui.fail(`Entry ${entry.id} has unknown frequency band "${entry.frequencyBand}"`);
      process.exit(1);
    }
    bucket.push(entry);
  }

  const manifestBands = [];
  for (const band of FREQUENCY_BANDS) {
    const bandEntries = byBand.get(band.id) ?? [];
    const levelDir = path.join(OUT_DIR, band.level.toLowerCase());
    mkdirSync(levelDir, { recursive: true });
    const target = path.join(levelDir, bandFileName(band));
    writeFileSync(target, JSON.stringify(bandEntries), 'utf8');
    manifestBands.push({
      id: band.id,
      slug: band.slug,
      level: band.level,
      from: band.from,
      to: band.to,
      entryCount: bandEntries.length,
    });
  }

  // Compact index: everything the vocabulary browser and search need, without the
  // example sentences, grammar tables and exercise config that dominate entry size.
  const index = entries.map((entry) => ({
    id: entry.id,
    rank: entry.rank,
    level: entry.level,
    german: entry.german,
    english: entry.english,
    wordClass: entry.wordClass,
    primaryTopic: entry.primaryTopic,
    frequencyBand: entry.frequencyBand,
    difficultyWeight: entry.difficultyWeight,
    searchableForms: entry.searchableForms,
  }));
  writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index), 'utf8');

  const byLevel = {};
  for (const entry of entries) byLevel[entry.level] = (byLevel[entry.level] ?? 0) + 1;

  writeFileSync(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalEntries: entries.length,
        entriesByLevel: byLevel,
        bands: manifestBands,
      },
      null,
      2,
    ),
    'utf8',
  );

  ui.ok(
    `build:content — ${entries.length} entries into ${manifestBands.length} band bundles ` +
      `(${Date.now() - startedAt} ms)`,
  );
}

main();
