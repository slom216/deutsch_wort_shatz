import { describe, expect, it } from 'vitest';
import { seoForPath } from './seo';

describe('seoForPath', () => {
  it('gives every route a self-referential canonical', () => {
    expect(seoForPath('/').canonical).toBe('https://wortschatz.deulern.com/');
    expect(seoForPath('/learn/a1').canonical).toBe(
      'https://wortschatz.deulern.com/learn/a1',
    );
    expect(seoForPath('/learn/a1/').canonical).toBe(
      'https://wortschatz.deulern.com/learn/a1',
    );
  });

  it('indexes the browsable vocabulary routes', () => {
    for (const path of [
      '/',
      '/learn',
      '/learn/a1',
      '/learn/b1/core',
      '/topic/food-and-drink',
      '/vocabulary',
      '/about',
    ]) {
      expect(seoForPath(path).index, path).toBe(true);
    }
  });

  it('keeps thin and per-session routes out of the index', () => {
    for (const path of [
      '/word/haus-n-1',
      '/practice/session/abc123',
      '/continuous/abc123',
      '/results/abc123',
      '/settings',
      '/progress',
      '/data',
      '/skipped',
    ]) {
      expect(seoForPath(path).index, path).toBe(false);
    }
  });
});
