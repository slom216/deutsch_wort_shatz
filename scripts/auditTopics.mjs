/**
 * `npm run audit:topics`
 *
 * Enforces the controlled topic registry (§9, §13): every primary and secondary topic
 * must resolve to a registered topic, and every entry must have exactly one primary
 * topic. Also reports registry coverage so unused topics stay visible.
 */

import { isTopic, resolveTopic, TOPICS } from '../src/content/vocabulary/topics.ts';
import { finish, loadAllEntries, printSample, ui } from './lib/loadDataset.mjs';

function main() {
  const { entries } = loadAllEntries();
  const errors = [];
  const warnings = [];

  ui.heading(`audit:topics — ${entries.length} entries, ${TOPICS.length} registered topics`);

  /* ---- every normalized topic must be registered ---- */
  const unregistered = [];
  const missingPrimary = [];
  for (const entry of entries) {
    if (!entry.primaryTopic) {
      missingPrimary.push(entry.id);
    } else if (!isTopic(entry.primaryTopic)) {
      unregistered.push(`${entry.id}: primary topic "${entry.primaryTopic}"`);
    }
    for (const topic of entry.secondaryTopics ?? []) {
      if (!isTopic(topic)) unregistered.push(`${entry.id}: secondary topic "${topic}"`);
    }
  }

  if (missingPrimary.length > 0) {
    ui.fail(`${missingPrimary.length} entries have no primary topic`);
    printSample(missingPrimary);
    errors.push(...missingPrimary);
  } else {
    ui.ok('every entry has exactly one primary topic');
  }

  if (unregistered.length > 0) {
    ui.fail(`${unregistered.length} unregistered topics after normalization`);
    printSample(unregistered);
    errors.push(...unregistered);
  } else {
    ui.ok('all topics resolve to the controlled registry');
  }

  /* ---- raw source labels must all be mappable ---- */
  const rawLabels = new Map();
  for (const entry of entries) {
    for (const label of entry.sourceTopics ?? []) {
      rawLabels.set(label, (rawLabels.get(label) ?? 0) + 1);
    }
  }
  const unmapped = [...rawLabels.keys()].filter((label) => resolveTopic(label) === null);
  if (unmapped.length > 0) {
    ui.fail(`${unmapped.length} raw dataset labels have no alias`);
    printSample(unmapped);
    errors.push(...unmapped);
  } else {
    ui.ok(`all ${rawLabels.size} raw dataset labels map onto the registry`);
  }

  /* ---- registry coverage ---- */
  const used = new Set();
  for (const entry of entries) {
    if (entry.primaryTopic) used.add(entry.primaryTopic);
    for (const topic of entry.secondaryTopics ?? []) used.add(topic);
  }
  const unused = TOPICS.filter((t) => !used.has(t));
  if (unused.length > 0) {
    ui.warn(`${unused.length} registered topics have no entries yet`);
    printSample(unused, 50);
    warnings.push(...unused);
  } else {
    ui.ok('every registered topic has at least one entry');
  }

  finish('audit:topics', errors, warnings);
}

main();
