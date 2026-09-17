const ORIGIN = 'https://wortschatz.deulern.com';

/**
 * Routes worth indexing. Word detail pages are deliberately absent: there are
 * thousands, each a few lines about one word, none in the sitemap — precisely the
 * thin near-duplicates Google reports rather than ranks. Session routes carry a
 * generated id, so every crawl would mint another dead URL.
 */
const INDEXABLE = [
  /^\/$/u,
  /^\/learn$/u,
  /^\/learn\/[a-z0-9]+$/u,
  /^\/learn\/[a-z0-9]+\/[a-z0-9-]+$/u,
  /^\/topic\/[a-z0-9-]+$/u,
  /^\/vocabulary$/u,
  /^\/about$/u,
];

/**
 * What a crawler should do with a route. The app is client-rendered, so every path
 * serves the same shell and index.html carries no canonical — without this, deep
 * links read to Google as duplicates of each other.
 */
export function seoForPath(pathname: string): { canonical: string; index: boolean } {
  // Neither a trailing slash nor a query string is part of a route's identity.
  const path = pathname.replace(/\/+$/u, '') || '/';
  return {
    canonical: ORIGIN + path,
    index: INDEXABLE.some((route) => route.test(path)),
  };
}
