import { describe, expect, it } from 'vitest';

import { isTopic, resolveTopic, TOPIC_ALIASES, TOPICS, topicFromSlug, topicSlug } from './topics';

describe('topic registry', () => {
  it('contains the 49 topics required by the specification', () => {
    expect(TOPICS).toHaveLength(49);
    expect(new Set(TOPICS).size).toBe(TOPICS.length);
  });

  it('recognises registered topics and rejects unregistered ones', () => {
    expect(isTopic('Food and drink')).toBe(true);
    expect(isTopic('Arbeit')).toBe(false);
  });

  it('resolves canonical topics to themselves', () => {
    expect(resolveTopic('Health')).toBe('Health');
  });

  it('resolves German-language dataset labels onto the registry', () => {
    expect(resolveTopic('Gesundheit')).toBe('Health');
    expect(resolveTopic('Verkehr')).toBe('Transport');
    expect(resolveTopic('Wohnen')).toBe('Housing');
  });

  it('resolves merged English labels onto the registry', () => {
    expect(resolveTopic('Work and professions')).toBe('Work');
    expect(resolveTopic('Travel and transport')).toBe('Travel');
  });

  it('matches aliases case-insensitively and ignores surrounding space', () => {
    expect(resolveTopic('  gesundheit ')).toBe('Health');
  });

  it('returns null for a label with no alias', () => {
    expect(resolveTopic('Underwater basket weaving')).toBeNull();
  });

  it('maps every alias onto a registered topic', () => {
    for (const canonical of Object.values(TOPIC_ALIASES)) {
      expect(isTopic(canonical)).toBe(true);
    }
  });

  it('never aliases a label that is already canonical', () => {
    for (const raw of Object.keys(TOPIC_ALIASES)) {
      expect(isTopic(raw)).toBe(false);
    }
  });

  it('produces unique, URL-safe slugs that round-trip', () => {
    const slugs = TOPICS.map(topicSlug);
    expect(new Set(slugs).size).toBe(TOPICS.length);
    for (const topic of TOPICS) {
      expect(topicSlug(topic)).toMatch(/^[a-z0-9-]+$/);
      expect(topicFromSlug(topicSlug(topic))).toBe(topic);
    }
  });

  it('returns null for an unknown slug', () => {
    expect(topicFromSlug('not-a-topic')).toBeNull();
  });
});
