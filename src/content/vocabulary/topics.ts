/**
 * Controlled topic registry (DEVELOPMENT_INSTRUCTIONS §9).
 *
 * The registry below is the canonical, closed set of topics. It is the single
 * source of truth for both the application and the `audit:topics` script, which
 * imports this module directly via Node's native TypeScript support.
 *
 * The source datasets in `data/` were produced independently and use 91 distinct
 * topic labels, including German-language labels (`Arbeit`, `Gesundheit`) and
 * merged labels (`Work and professions`). `TOPIC_ALIASES` maps every one of those
 * onto a canonical topic so that content stays decoupled from the UI and the topic
 * audit can enforce a closed vocabulary. Raw dataset labels are preserved on each
 * entry as `sourceTopics` for editorial traceability.
 */

export const TOPICS = [
  'Personal information',
  'Family',
  'Home',
  'Daily routine',
  'Food and drink',
  'Shopping',
  'Clothing',
  'Health',
  'Body',
  'Work',
  'Professions',
  'School and education',
  'Travel',
  'Transport',
  'Directions',
  'City',
  'Housing',
  'Weather',
  'Time and dates',
  'Numbers and quantities',
  'Communication',
  'Technology',
  'Media',
  'Hobbies',
  'Sport',
  'Nature',
  'Animals',
  'Society',
  'Government and public services',
  'Banking and money',
  'Bureaucracy',
  'Relationships',
  'Emotions',
  'Character',
  'Descriptions',
  'Actions',
  'Movement',
  'Position',
  'Functional phrases',
  'Telephone',
  'Restaurant',
  'Appointments',
  'Emergencies',
  'Environment',
  'Culture',
  'News',
  'Abstract concepts',
  'Connectors',
  'Frequency and time expressions',
] as const;

export type Topic = (typeof TOPICS)[number];

const TOPIC_SET: ReadonlySet<string> = new Set<string>(TOPICS);

/**
 * Maps every non-canonical topic label found in `data/*.json` onto a registry topic.
 * Keys are matched case-insensitively after trimming.
 */
export const TOPIC_ALIASES: Readonly<Record<string, Topic>> = {
  // German-language labels used by the A2/B1 datasets.
  Arbeit: 'Work',
  Ausbildung: 'School and education',
  Bildung: 'School and education',
  Energie: 'Environment',
  Ernährung: 'Food and drink',
  Familie: 'Family',
  Finanzen: 'Banking and money',
  Forschung: 'School and education',
  Gesellschaft: 'Society',
  Gesundheit: 'Health',
  Kommunikation: 'Communication',
  Kultur: 'Culture',
  Medien: 'Media',
  Natur: 'Nature',
  Recht: 'Government and public services',
  Reisen: 'Travel',
  Sicherheit: 'Emergencies',
  Sprache: 'Communication',
  Technik: 'Technology',
  Umwelt: 'Environment',
  Verkehr: 'Transport',
  Verwaltung: 'Bureaucracy',
  Wirtschaft: 'Banking and money',
  Wohnen: 'Housing',

  // Merged or differently-worded English labels.
  Business: 'Work',
  'Communication and language': 'Communication',
  Data: 'Technology',
  'Data and digital life': 'Technology',
  Education: 'School and education',
  Energy: 'Environment',
  'Energy and industry': 'Environment',
  'Family and community': 'Family',
  'Food and agriculture': 'Food and drink',
  'General abstract concepts': 'Abstract concepts',
  Government: 'Government and public services',
  Language: 'Communication',
  Languages: 'Communication',
  'Law and safety': 'Government and public services',
  Leisure: 'Hobbies',
  'Media and culture': 'Media',
  Money: 'Banking and money',
  'Planning and time': 'Time and dates',
  'Public services': 'Government and public services',
  Research: 'School and education',
  'Science and research': 'School and education',
  'Shopping and consumer services': 'Shopping',
  'Social life': 'Society',
  'Society and relationships': 'Society',
  'Sport and leisure': 'Sport',
  'Travel and transport': 'Travel',
  'Work and professions': 'Work',

  // Labels used by the current a1/a2/b1 datasets.
  General: 'Abstract concepts',
  'Nature and weather': 'Nature',
  'Numbers and time': 'Numbers and quantities',
  'Services and bureaucracy': 'Bureaucracy',
};

const ALIAS_LOOKUP: ReadonlyMap<string, Topic> = new Map(
  Object.entries(TOPIC_ALIASES).map(([raw, canonical]) => [raw.toLowerCase(), canonical]),
);

export function isTopic(value: string): value is Topic {
  return TOPIC_SET.has(value);
}

/** Resolves a raw dataset topic label to a canonical topic, or `null` if unknown. */
export function resolveTopic(raw: string): Topic | null {
  const trimmed = raw.trim();
  if (isTopic(trimmed)) return trimmed;
  return ALIAS_LOOKUP.get(trimmed.toLowerCase()) ?? null;
}

/** URL-safe slug used by the `/topic/:topicSlug` route. */
export function topicSlug(topic: Topic): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const SLUG_LOOKUP: ReadonlyMap<string, Topic> = new Map(TOPICS.map((t) => [topicSlug(t), t]));

export function topicFromSlug(slug: string): Topic | null {
  return SLUG_LOOKUP.get(slug.toLowerCase()) ?? null;
}

export const TOPIC_SLUGS: readonly string[] = TOPICS.map(topicSlug);
