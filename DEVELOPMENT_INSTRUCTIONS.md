# DEVELOPMENT_INSTRUCTIONS.md

## 1. Project Objective

Build a desktop-first German vocabulary learning application for CEFR levels **A1, A2, and B1**.

The application must:

- use React, Vite, and TypeScript;
- be strictly frontend-only;
- use an English-language interface;
- support words and phrases;
- organize vocabulary by CEFR level, then frequency, then topic;
- contain 1,000 A1 entries, 3,000 additional A2 entries, and 6,000 additional B1 entries;
- contain exactly 10,000 vocabulary entries in total;
- use browser-local persistence only;
- use automatic spaced repetition;
- automatically estimate word difficulty;
- include gamification;
- include multiple-choice, typed translation, sentence completion, matching, word-ordering, listening, and speaking exercises;
- require correct spelling, capitalization, articles, umlauts, ß, and punctuation where applicable;
- allow no custom user word lists;
- require no backend, account, login, cloud storage, or external AI service.

Listening must use the browser Speech Synthesis API.

Speaking must use the browser Speech Recognition API when available and provide a manual fallback when unavailable.

---

## 2. Core Vocabulary Targets

```text
A1:
- 1,000 entries
- global ranks 1–1,000

A2:
- 3,000 additional entries
- global ranks 1,001–4,000

B1:
- 6,000 additional entries
- global ranks 4,001–10,000

Total:
- 10,000 words and phrases
```

Each rank must be unique.

Each vocabulary entry must have one stable identifier.

---

## 3. Product Principles

1. Teach high-frequency vocabulary before lower-frequency vocabulary.
2. Organize entries by CEFR level, frequency band, and topic.
3. Teach nouns with article and plural.
4. Teach verbs with conjugation and grammar metadata.
5. Teach phrases as complete lexical chunks.
6. Use active recall as the main learning method.
7. Use spaced repetition automatically.
8. Do not ask learners to rate words manually.
9. Store all learner data locally.
10. Keep vocabulary content independent from UI code.
11. Validate all content automatically.
12. Do not require audio files or external speech APIs.
13. Preserve learner progress across releases through migrations.
14. Keep all permanent vocabulary IDs stable.
15. Do not copy proprietary vocabulary lists or textbook exercises.

---

## 4. Technology Stack

Required:

- React;
- Vite;
- TypeScript with `strict: true`;
- React Router;
- Zustand;
- Dexie;
- IndexedDB;
- Zod;
- Vitest;
- React Testing Library;
- Playwright;
- ESLint;
- Prettier;
- `@dnd-kit` for matching and word-order exercises.

Do not add:

- Next.js;
- backend services;
- Node API;
- authentication;
- cloud database;
- cloud synchronization;
- external AI APIs;
- paid speech APIs;
- server-side rendering.

---

## 5. Application Routes

```text
/
 /learn
 /learn/:level
 /learn/:level/:frequencyBand
 /topic/:topicSlug
 /review
 /practice
 /practice/session/:sessionId
 /results/:sessionId
 /vocabulary
 /word/:entryId
 /progress
 /achievements
 /settings
 /data
 /about
```

---

## 6. Main Screens

### Dashboard

Display:

- continue-learning action;
- reviews due;
- new words available;
- daily goal;
- current streak;
- total XP;
- learner level;
- A1 progress;
- A2 progress;
- B1 progress;
- hardest words;
- weakest topics;
- recent achievements.

### Learn

Display:

- CEFR levels;
- frequency bands;
- topic breakdown;
- introduced words;
- mastered words;
- recommended next lesson.

### Review

Display:

- due count;
- overdue count;
- estimated session size;
- selected exercise mix;
- start-review button.

### Vocabulary Browser

Support:

- German search;
- English search;
- article search;
- plural search;
- verb-form search;
- filtering by level;
- filtering by frequency band;
- filtering by topic;
- filtering by word class;
- filtering by learning status;
- filtering by difficulty.

### Progress

Display:

- introduced entries;
- learning entries;
- review entries;
- mastered entries;
- due today;
- overdue;
- first-attempt accuracy;
- total accuracy;
- response time;
- current streak;
- longest streak;
- exercise count;
- study sessions;
- XP;
- progress by level;
- progress by frequency;
- progress by topic;
- progress by word class;
- exercise-type performance.

---

## 7. Recommended Project Structure

```text
src/
  app/
    App.tsx
    router.tsx
    providers.tsx
    ErrorBoundary.tsx

  components/
    layout/
    common/
    vocabulary/
    exercises/
    progress/
    gamification/

  content/
    vocabulary/
      a1/
      a2/
      b1/
      registry.ts
      frequencyBands.ts
      topics.ts

  features/
    learning/
    practice/
    srs/
    progress/
    gamification/
    speech/
    persistence/
    settings/
    search/

  pages/
    DashboardPage.tsx
    LearnPage.tsx
    LevelPage.tsx
    FrequencyBandPage.tsx
    TopicPage.tsx
    ReviewPage.tsx
    PracticePage.tsx
    PracticeSessionPage.tsx
    ResultsPage.tsx
    VocabularyBrowserPage.tsx
    VocabularyEntryPage.tsx
    ProgressPage.tsx
    AchievementsPage.tsx
    SettingsPage.tsx
    DataPage.tsx
    AboutPage.tsx

  schemas/
    vocabularySchema.ts
    exerciseSchema.ts
    progressSchema.ts
    sessionSchema.ts
    settingsSchema.ts

  test/
    fixtures/
    helpers/
```

---

## 8. Vocabulary Organization

The content hierarchy must be:

```text
CEFR Level
  Frequency Band
    Topic
      Vocabulary Entry
```

### A1 Frequency Bands

```text
A1 Core 1: ranks 1–250
A1 Core 2: ranks 251–500
A1 Core 3: ranks 501–750
A1 Core 4: ranks 751–1,000
```

### A2 Frequency Bands

```text
A2 High 1: ranks 1,001–1,750
A2 High 2: ranks 1,751–2,500
A2 Medium 1: ranks 2,501–3,250
A2 Medium 2: ranks 3,251–4,000
```

### B1 Frequency Bands

```text
B1 High 1: ranks 4,001–5,500
B1 High 2: ranks 5,501–7,000
B1 Medium 1: ranks 7,001–8,500
B1 Medium 2: ranks 8,501–10,000
```

Frequency rank always has priority over topic order.

---

## 9. Topic Taxonomy

Use a controlled topic registry.

Required initial topics:

- Personal information;
- Family;
- Home;
- Daily routine;
- Food and drink;
- Shopping;
- Clothing;
- Health;
- Body;
- Work;
- Professions;
- School and education;
- Travel;
- Transport;
- Directions;
- City;
- Housing;
- Weather;
- Time and dates;
- Numbers and quantities;
- Communication;
- Technology;
- Media;
- Hobbies;
- Sport;
- Nature;
- Animals;
- Society;
- Government and public services;
- Banking and money;
- Bureaucracy;
- Relationships;
- Emotions;
- Character;
- Descriptions;
- Actions;
- Movement;
- Position;
- Functional phrases;
- Telephone;
- Restaurant;
- Appointments;
- Emergencies;
- Environment;
- Culture;
- News;
- Abstract concepts;
- Connectors;
- Frequency and time expressions.

Every entry must have:

- one primary topic;
- zero or more secondary topics.

---

## 10. Vocabulary Data Model

```ts
export type CefrLevel = 'A1' | 'A2' | 'B1';

export type VocabularyKind = 'word' | 'phrase';

export type WordClass =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'preposition'
  | 'conjunction'
  | 'article'
  | 'particle'
  | 'numeral'
  | 'interjection'
  | 'phrase'
  | 'other';

export interface VocabularyEntryBase {
  id: string;
  rank: number;
  level: CefrLevel;
  kind: VocabularyKind;
  german: string;
  english: string[];
  wordClass: WordClass;
  primaryTopic: string;
  secondaryTopics: string[];
  frequencyBand: string;
  difficultyWeight: number;
  searchableForms: string[];
  tags: string[];
  exampleSentences: ExampleSentence[];
  exerciseConfig: ExerciseConfig;
}

export interface ExampleSentence {
  id: string;
  german: string;
  english: string;
  level: CefrLevel;
  targetTokens: string[];
}

export interface NounEntry extends VocabularyEntryBase {
  wordClass: 'noun';
  article: 'der' | 'die' | 'das';
  plural: string;
  pluralArticle: 'die';
  genitiveSingular?: string;
  notes?: string[];
}

export interface VerbEntry extends VocabularyEntryBase {
  wordClass: 'verb';
  infinitive: string;
  thirdPersonPresent: string;
  simplePast: string;
  pastParticiple: string;
  auxiliary: 'haben' | 'sein' | 'haben/sein';
  separable: boolean;
  reflexive: boolean;
  reflexiveCase?: 'accusative' | 'dative';
  requiredCase?: 'nominative' | 'accusative' | 'dative' | 'genitive';
  fixedPrepositions: VerbPrepositionPattern[];
  notes?: string[];
}

export interface VerbPrepositionPattern {
  preposition: string;
  case: 'accusative' | 'dative' | 'genitive';
  meaning?: string;
}

export interface PhraseEntry extends VocabularyEntryBase {
  wordClass: 'phrase';
  register: 'neutral' | 'formal' | 'informal';
  phraseType:
    | 'functional'
    | 'idiomatic'
    | 'collocation'
    | 'question'
    | 'response'
    | 'other';
  notes?: string[];
}

export interface GenericWordEntry extends VocabularyEntryBase {
  article?: never;
  plural?: never;
}

export type VocabularyEntry =
  | NounEntry
  | VerbEntry
  | PhraseEntry
  | GenericWordEntry;
```

---

## 11. Required Fields

Every entry must contain:

- stable ID;
- global rank;
- CEFR level;
- German form;
- at least one English translation;
- word class;
- primary topic;
- frequency band;
- difficulty weight;
- searchable forms;
- at least one original example sentence;
- exercise configuration.

Every noun must contain:

- article;
- plural;
- plural article;
- example sentence.

Every verb must contain:

- infinitive;
- third-person singular present;
- simple past;
- past participle;
- auxiliary;
- separability;
- reflexive status;
- required case where applicable;
- fixed preposition where applicable.

Every phrase must contain:

- register;
- phrase type;
- translation;
- example sentence or usage context.

---

## 12. Stable ID Rules

Use this format:

```text
a1-0001-sein
a1-0002-haben
a1-0003-der-mann
a2-1250-sich-erinnern
b1-6421-in-betracht-ziehen
```

Rules:

- include CEFR level;
- include four-digit global rank;
- include normalized German lemma;
- never use random IDs;
- never regenerate IDs after release;
- maintain migration maps when IDs must change.

---

## 13. Content Validation

Create Zod schemas and validation scripts.

Required commands:

```bash
npm run validate:vocabulary
npm run audit:duplicates
npm run audit:ranks
npm run audit:topics
npm run audit:examples
```

Validation must fail when:

- IDs are duplicated;
- ranks are duplicated;
- a completed rank range has gaps;
- rank is outside 1–10,000;
- level conflicts with frequency band;
- German form is empty;
- translation is empty;
- word class is missing;
- noun has no article;
- noun has no plural;
- verb has no simple past;
- verb has no participle;
- verb has no auxiliary;
- phrase has no register;
- entry has no example;
- example has no target token;
- topic is unregistered;
- searchable forms are empty;
- noun is not capitalized;
- duplicate senses are not explicitly distinguished.

---

## 14. Vocabulary Presentation Rules

### Nouns

Always display article and plural.

```text
der Tisch
Plural: die Tische
```

Never teach a noun without its article.

### Verbs

Display:

```text
helfen
er hilft
half
hat geholfen
Case: dative
```

Also show:

- separable or inseparable;
- reflexive or non-reflexive;
- fixed prepositions;
- required case.

### Phrases

Display the complete phrase.

```text
Wie geht es Ihnen?
How are you?
Register: formal
```

Do not split phrases during initial presentation.

---

## 15. Exercise Types

All seven formats are required.

### Multiple Choice

Variants:

- German to English;
- English to German;
- article;
- plural;
- word class;
- verb form;
- phrase context.

Rules:

- four options by default;
- exactly one correct answer;
- plausible distractors;
- distractors preferably from same topic or nearby frequency range.

### Typed Translation

Variants:

- German to English;
- English to German;
- noun with article;
- noun with article and plural;
- verb form;
- full phrase.

Rules:

- exact spelling;
- capitalization matters;
- umlauts matter;
- `ß` matters;
- article matters when requested;
- punctuation matters for complete phrases;
- accepted alternatives must be explicitly configured.

### Sentence Completion

Variants:

- vocabulary gap;
- article gap;
- plural gap;
- verb-form gap;
- phrase gap;
- collocation gap.

Rules:

- only one clearly intended answer;
- full corrected sentence shown after submission;
- all valid alternatives explicitly listed.

### Matching

Variants:

- German to English;
- noun to plural;
- verb to participle;
- phrase to context;
- word to topic.

Rules:

- 5–8 pairs;
- mouse support;
- keyboard support;
- click-to-select alternative;
- drag-and-drop must not be the only interaction.

### Word Ordering

Variants:

- phrase reconstruction;
- sentence reconstruction;
- question reconstruction;
- article and noun ordering;
- functional expression.

Rules:

- 4–12 tokens;
- mouse and keyboard support;
- all valid word orders accepted;
- avoid ambiguous sentences.

### Listening

Use browser speech synthesis.

Variants:

- hear German and choose English;
- hear German and type German;
- hear phrase and select context;
- hear sentence and identify target word.

Rules:

- allow replay;
- use `de-DE`;
- select a German voice when available;
- do not reveal German text before answer in standard mode;
- provide text fallback.

### Speaking

Use browser speech recognition.

Variants:

- repeat a word;
- repeat a phrase;
- read a sentence;
- answer a short prompt.

Rules:

- ask for microphone permission only after user action;
- show recognized transcript;
- do not store audio;
- allow retry;
- provide manual self-assessment fallback;
- never block progression when unsupported.

---

## 16. German Answer Evaluation

Strict mode is the default.

The following are significant:

- capitalization;
- article;
- umlauts;
- `ß`;
- spelling;
- punctuation;
- word order;
- verb form;
- plural form.

Feedback must classify errors.

Supported categories:

- wrong meaning;
- missing article;
- wrong article;
- wrong capitalization;
- wrong plural;
- wrong conjugation;
- missing umlaut;
- `ss` instead of `ß`;
- punctuation error;
- word-order error;
- missing token;
- extra token.

Example:

```text
Your answer: die strasse
Correct answer: die Straße

Issues:
- German nouns must be capitalized.
- Straße is written with ß.
```

Do not globally lowercase answers during normalization.

---

## 17. German Character Helper

Every text input must provide:

```text
ä ö ü Ä Ö Ü ß
```

Requirements:

- insert character at cursor;
- preserve focus;
- work in input and textarea;
- include accessible labels;
- support keyboard shortcuts.

---

## 18. Learning Modes

### New Vocabulary

Default:

- 5 new entries per batch;
- one explanation card;
- one recognition exercise;
- one production exercise;
- first review scheduled automatically.

Configurable batch sizes:

- 5;
- 10;
- 15;
- 20.

### Due Review

Rules:

- prioritize overdue words;
- prioritize high-difficulty words;
- mix exercise types;
- avoid repeated exercise formats;
- include at least 40% active production.

### Topic Practice

Allow selection of:

- topic;
- level;
- learned status;
- session size.

### Free Practice

Allow selection of:

- level;
- frequency band;
- topic;
- word class;
- exercise types;
- session length.

---

## 19. Session Construction

Default review session:

- 20 exercises;
- 12–16 entries;
- 4–6 exercise types;
- no more than 3 identical exercise types consecutively;
- no more than 2 exercises for the same entry consecutively;
- at least 40% active production;
- at least 25% typed input;
- listening and speaking only when enabled and supported.

Default new-word session:

- 5 entries;
- 2–3 exercises per entry;
- recognition first;
- production second;
- mixed recap at end.

---

## 20. Spaced Repetition System

Use a modified SM-2-style scheduler.

Do not ask the learner to rate words manually.

### Automatic Grades

```text
0 = Failed
1 = Difficult
2 = Correct
3 = Strong
```

Grade rules:

#### Failed

- final answer incorrect;
- answer revealed;
- exercise abandoned after attempts.

#### Difficult

- correct on second attempt;
- correct after hint;
- correct but significantly slow;
- minor configured partial error.

#### Correct

- correct on first attempt;
- normal response time;
- no hint.

#### Strong

- correct on first attempt;
- substantially faster than expected;
- active-production exercise;
- no hint.

### SRS State

```ts
export interface SrsState {
  entryId: string;
  status: 'new' | 'learning' | 'review' | 'relearning' | 'mastered';
  dueAt: string;
  intervalDays: number;
  easeFactor: number;
  difficulty: number;
  repetitions: number;
  lapses: number;
  consecutiveCorrect: number;
  lastReviewedAt?: string;
  lastGrade?: 0 | 1 | 2 | 3;
  exercisePerformance: Record<string, ExercisePerformance>;
}
```

### Initial Steps

```text
First successful recognition: 10 minutes
First successful production: 1 day
Next success: 3 days
Next success: 7 days
```

### Interval Formula

```ts
nextInterval =
  currentInterval *
  easeFactor *
  performanceMultiplier *
  difficultyMultiplier;
```

Suggested performance multipliers:

```text
Grade 0: reset
Grade 1: 0.6
Grade 2: 1.0
Grade 3: 1.35
```

Constraints:

```text
Minimum interval: 10 minutes
Maximum interval: 365 days
Ease factor: 1.3–3.0
Difficulty: 0.0–1.0
```

---

## 21. Automatic Difficulty Model

Calculate difficulty from:

- first-attempt accuracy;
- response time;
- hints;
- lapses;
- exercise-type performance;
- spelling errors;
- article errors;
- plural errors;
- verb-form errors;
- speaking recognition results;
- recency.

Recommended formula:

```ts
difficulty =
  0.30 * errorRate +
  0.20 * normalizedResponseTime +
  0.15 * lapseRate +
  0.15 * spellingErrorRate +
  0.10 * grammarPropertyErrorRate +
  0.10 * hintUsageRate;
```

Clamp between 0 and 1.

### Adaptation Rules

Low difficulty:

- use more typed production;
- reduce multiple choice;
- increase interval;
- use phrase-level recall.

Medium difficulty:

- maintain mixed exercises;
- emphasize weak properties.

High difficulty:

- return to recognition;
- reduce distractor complexity;
- focus on article, plural, or verb form;
- shorten review interval;
- show metadata after errors.

---

## 22. Mastery

An entry becomes mastered when:

- at least 5 successful reviews exist;
- at least 3 successful reviews were production exercises;
- at least one typed answer was correct on first attempt;
- interval is at least 30 days;
- difficulty is below 0.35;
- no lapse occurred in the last 3 reviews.

Mastered entries must continue to appear at long intervals.

---

## 23. Gamification

Required:

- XP;
- learner levels;
- daily goals;
- streaks;
- achievements;
- mastery badges;
- CEFR completion badges.

Do not include:

- paid currency;
- leaderboards;
- lives that block learning;
- loot boxes;
- social competition.

### XP

```text
Correct multiple choice: 5 XP
Correct typed answer: 8 XP
Correct listening answer: 7 XP
Successful speaking answer: 10 XP
Perfect 20-exercise session: 30 bonus XP
Complete daily goal: 25 bonus XP
Master an entry: 10 XP
Complete frequency band: 100 XP
Complete CEFR level: 500 XP
```

Second-attempt answer:

- 50% XP.

Revealed answer:

- 0 XP.

### Learner Level Formula

```ts
xpRequiredForLevel(level) = 100 * level * level;
```

### Daily Goal

Options:

- 10 exercises;
- 20 exercises;
- 30 exercises;
- 50 exercises.

Default:

- 20 exercises.

### Streak

A day counts when the learner:

- completes at least 10 graded exercises; or
- earns at least 50 XP.

Use local calendar date.

### Achievements

Include:

- First Word;
- First Review;
- 100 Words Introduced;
- 100 Words Mastered;
- A1 Explorer;
- A1 Master;
- A2 Explorer;
- A2 Master;
- B1 Explorer;
- B1 Master;
- Seven-Day Streak;
- Thirty-Day Streak;
- Article Expert;
- Plural Expert;
- Verb Expert;
- Perfect Session;
- Listening Practice;
- Speaking Practice;
- 1,000 Correct Answers;
- 10,000 Correct Answers.

---

## 24. Persistence

Use IndexedDB through Dexie.

Persist:

- entry progress;
- SRS state;
- exercise history;
- sessions;
- achievements;
- settings;
- streak;
- XP;
- migrations metadata.

Recommended tables:

```ts
class VocabularyLearningDatabase extends Dexie {
  entryProgress!: Table<EntryProgress, string>;
  exerciseHistory!: Table<ExerciseHistory, string>;
  sessions!: Table<PracticeSessionRecord, string>;
  achievements!: Table<AchievementRecord, string>;
  settings!: Table<PersistedSettings, string>;
  metadata!: Table<DatabaseMetadata, string>;
}
```

Static vocabulary should remain bundled with the application unless caching becomes necessary.

Every schema change requires a migration.

Never delete progress silently.

---

## 25. Import and Export

Support:

- export progress to JSON;
- import progress from JSON;
- schema validation;
- preview before import;
- merge mode;
- replace mode;
- reset progress;
- destructive-action confirmation.

Export must include:

- schema version;
- export timestamp;
- app version;
- entry progress;
- SRS state;
- exercise history;
- achievements;
- settings.

Do not export the static vocabulary dataset.

---

## 26. Browser Speech

### Speech Synthesis

Requirements:

- detect support;
- use `de-DE`;
- prefer German voice;
- configurable speech rate;
- replay;
- cancel previous speech before replay;
- text fallback.

### Speech Recognition

Requirements:

- detect standard and prefixed APIs;
- use `de-DE`;
- start only on user action;
- stop after result or timeout;
- show transcript;
- allow retry;
- allow manual self-assessment fallback;
- never store recordings.

Display:

```text
Speaking exercises use your browser's speech recognition feature.
The app does not record or store your voice.
Browser behavior may vary.
```

Do not claim processing is always local.

---

# 27. Development Phases

## Phase 0 — Project Skeleton

### Goal

Create the frontend foundation.

### Deliverables

1. Initialize React, Vite, and TypeScript.
2. Enable strict TypeScript.
3. Configure ESLint.
4. Configure Prettier.
5. Configure React Router.
6. Configure Zustand.
7. Configure Dexie.
8. Configure Zod.
9. Configure Vitest.
10. Configure React Testing Library.
11. Configure Playwright.
12. Create all routes.
13. Create application shell.
14. Create desktop sidebar.
15. Create placeholder pages.
16. Create design tokens.
17. Create error boundary.
18. Create IndexedDB shell.
19. Create CI workflow.
20. Configure static production build.

### Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run typecheck
npm run test
npm run test:watch
npm run test:e2e
npm run validate:vocabulary
npm run audit:duplicates
npm run audit:ranks
```

### Acceptance Criteria

- all routes render;
- no TypeScript errors;
- no lint errors;
- production build succeeds;
- IndexedDB initializes;
- one test record can be created and read;
- tests run in CI.

---

## Phase 1 — Vocabulary Model and Exercise Engine

### Goal

Build reusable content and exercise infrastructure.

### Deliverables

1. Vocabulary schemas.
2. Topic registry.
3. Frequency-band registry.
4. Vocabulary registry.
5. Content validation.
6. Duplicate detection.
7. Rank validation.
8. Search index.
9. Vocabulary card.
10. Vocabulary detail view.
11. Noun detail view.
12. Verb detail view.
13. Phrase detail view.
14. Exercise session model.
15. Multiple-choice exercise.
16. Typed translation exercise.
17. Sentence-completion exercise.
18. Matching exercise.
19. Word-order exercise.
20. Listening exercise.
21. Speaking exercise.
22. German keyboard helper.
23. Answer-evaluation engine.
24. Error classification.
25. 100-entry pilot dataset.
26. Tests for all exercise types.

### Pilot Dataset

Include:

- 60 words;
- 20 phrases;
- at least 10 nouns;
- at least 10 verbs;
- examples from multiple topics.

### Acceptance Criteria

- 100 entries validate;
- all seven exercise formats work;
- strict spelling works;
- articles are checked;
- plurals are checked;
- verb forms are checked;
- speech fallbacks work;
- vocabulary search works;
- session results persist.

---

## Phase 2 — SRS and Automatic Difficulty

### Goal

Build adaptive review.

### Deliverables

1. SRS state model.
2. Learning steps.
3. Review intervals.
4. Automatic grades.
5. Difficulty model.
6. Review queue.
7. Overdue priority.
8. Exercise adaptation.
9. Session balancing.
10. Mastery calculation.
11. Review forecast.
12. Difficult-word view.
13. Mastered-word view.
14. Persistence migrations.
15. Scheduling tests.

### Acceptance Criteria

- failed words return quickly;
- successful words receive longer intervals;
- no manual rating is required;
- difficult words receive easier and more focused exercises;
- due queue survives refresh;
- local-date calculations work;
- scheduling tests cover at least 30 scenarios.

---

## Phase 3 — A1 Vocabulary, Ranks 1–250

### Focus

- essential verbs;
- pronouns;
- articles;
- basic phrases;
- family;
- numbers;
- time;
- personal information;
- greetings;
- daily communication.

### Acceptance Criteria

- exactly 250 entries;
- ranks 1–250 complete;
- no duplicate ranks;
- all nouns contain article and plural;
- all verbs contain full metadata;
- all entries contain examples;
- all entries produce valid exercises.

---

## Phase 4 — A1 Vocabulary, Ranks 251–500

### Focus

- home;
- food;
- shopping;
- transport;
- work;
- school;
- common adjectives;
- daily routine.

### Acceptance Criteria

- total A1 entries reach 500;
- ranks 251–500 complete;
- content validation passes;
- cumulative A1 review supports all 500 entries.

---

## Phase 5 — A1 Vocabulary, Ranks 501–750

### Focus

- health;
- clothing;
- appointments;
- directions;
- city;
- weather;
- body;
- common adverbs.

### Acceptance Criteria

- total A1 entries reach 750;
- ranks 501–750 complete;
- topic progress works;
- difficult-word adaptation works at scale.

---

## Phase 6 — A1 Vocabulary, Ranks 751–1,000

### Focus

- bureaucracy;
- travel;
- telephone;
- restaurant;
- social interaction;
- functional phrases;
- remaining A1 frequency vocabulary.

### A1 Completion Criteria

- exactly 1,000 A1 entries;
- ranks 1–1,000 complete;
- at least 150 phrases;
- all entries validated;
- A1 cumulative review works;
- A1 completion badge works;
- manual language review completed.

---

## Phase 7 — Gamification

### Goal

Add motivation systems after A1 is stable.

### Deliverables

1. XP.
2. learner levels.
3. daily goals.
4. streaks.
5. streak freeze.
6. achievements.
7. mastery badges.
8. frequency-band badges.
9. A1 completion badge.
10. daily summary.

### Acceptance Criteria

- refresh cannot duplicate XP;
- second attempts grant reduced XP;
- revealed answers grant no XP;
- streak uses local date;
- achievements cannot duplicate;
- reset progress also resets gamification after confirmation.

---

## Phase 8 — A2 Vocabulary, Ranks 1,001–1,750

### Focus

- expanded daily life;
- work;
- education;
- healthcare;
- housing;
- travel;
- services;
- communication.

### Acceptance Criteria

- 750 A2 entries added;
- all entries validated;
- A2 frequency band appears;
- A2 practice works;
- A2 exercises use richer contexts than A1.

---

## Phase 9 — A2 Vocabulary, Ranks 1,751–2,500

### Focus

- relationships;
- emotions;
- public services;
- common collocations;
- verb-preposition patterns;
- work communication;
- travel problems.

### Acceptance Criteria

- total A2 entries reach 1,500;
- total application entries reach 2,500;
- cumulative A2 review works.

---

## Phase 10 — A2 Vocabulary, Ranks 2,501–3,250

### Focus

- government services;
- banking;
- money;
- technology;
- media;
- social situations;
- health detail;
- work processes.

### Acceptance Criteria

- total application entries reach 3,250;
- search and review remain performant;
- all rank audits pass.

---

## Phase 11 — A2 Vocabulary, Ranks 3,251–4,000

### Focus

- education;
- broader adjectives;
- broader adverbs;
- collocations;
- telephone;
- bureaucracy;
- travel;
- public communication.

### A2 Completion Criteria

- exactly 3,000 A2 entries;
- ranks 1,001–4,000 complete;
- total dataset reaches 4,000 entries;
- at least 400 A2 phrases;
- A2 cumulative review works;
- A2 completion badge works;
- manual language review completed.

---

## Phase 12 — B1 Vocabulary, Ranks 4,001–5,500

### Focus

- work;
- professional communication;
- society;
- media;
- education;
- relationships;
- opinions;
- abstract adjectives;
- formal phrases.

### Acceptance Criteria

- 1,500 B1 entries added;
- all entries validated;
- longer phrase exercises work;
- sentence-completion contexts remain natural.

---

## Phase 13 — B1 Vocabulary, Ranks 5,501–7,000

### Focus

- public services;
- culture;
- environment;
- workplace processes;
- problem solving;
- emotions;
- character;
- news.

### Acceptance Criteria

- total B1 entries reach 3,000;
- total dataset reaches 7,000 entries;
- performance remains acceptable.

---

## Phase 14 — B1 Vocabulary, Ranks 7,001–8,500

### Focus

- abstract nouns;
- advanced daily-life phrases;
- health;
- travel logistics;
- formal written expressions;
- civic vocabulary;
- media vocabulary.

### Acceptance Criteria

- total B1 entries reach 4,500;
- total dataset reaches 8,500;
- difficult-word review remains responsive.

---

## Phase 15 — B1 Vocabulary, Ranks 8,501–10,000

### Focus

- lower-frequency B1 vocabulary;
- collocations;
- verb-preposition combinations;
- connectors;
- abstract concepts;
- formal and informal register differences;
- common B1 idiomatic expressions.

### B1 Completion Criteria

- exactly 6,000 B1 entries;
- ranks 4,001–10,000 complete;
- total dataset reaches exactly 10,000;
- at least 800 B1 phrases;
- B1 cumulative review works;
- B1 completion badge works;
- manual language review completed.

---

## Phase 16 — Vocabulary Browser and Analytics

### Deliverables

1. Advanced search.
2. Combined filters.
3. Search by inflected verb.
4. Search by plural.
5. Search by translation.
6. Search by article.
7. Topic progress.
8. Frequency progress.
9. Word-class progress.
10. Exercise-type performance.
11. Error-category statistics.
12. Review forecast.
13. Activity summary.
14. Hardest-word view.
15. Mastered-word view.

### Acceptance Criteria

- typical searches return within 100 ms;
- filters combine correctly;
- lists above 200 rows are virtualized;
- progress statistics match stored history;
- entry pages are directly addressable.

---

## Phase 17 — Data Management

### Deliverables

1. JSON export.
2. JSON import.
3. Merge mode.
4. Replace mode.
5. Schema validation.
6. Import preview.
7. Migration support.
8. Database repair flow.
9. Reset confirmation.
10. Corrupted-file handling.

### Acceptance Criteria

- export imports into a fresh browser profile;
- malformed data is rejected;
- older schemas migrate;
- vocabulary updates do not erase progress;
- destructive actions require confirmation.

---

## Phase 18 — Quality Assurance and Release

### Deliverables

1. Language audit.
2. Duplicate audit.
3. Rank audit.
4. Topic audit.
5. Example-sentence audit.
6. Exercise ambiguity audit.
7. Accessibility audit.
8. Keyboard-navigation audit.
9. Speech fallback audit.
10. Performance audit.
11. IndexedDB migration audit.
12. Import/export audit.
13. Browser compatibility audit.
14. Privacy page.
15. About page.
16. Production deployment.
17. Regression suite.

### Final Acceptance Criteria

- exactly 10,000 entries;
- exactly 1,000 A1 entries;
- exactly 3,000 A2 entries;
- exactly 6,000 B1 entries;
- no duplicate IDs;
- no duplicate ranks;
- no missing ranks;
- all nouns have articles and plurals;
- all verbs have required metadata;
- all entries have translations;
- all entries have word class;
- all entries have examples;
- all seven exercise types work;
- SRS works automatically;
- strict German answer checking works;
- progress survives browser restart;
- export and import work;
- no backend dependency exists;
- production build succeeds;
- keyboard-only use is possible;
- no critical accessibility violations;
- all automated tests pass.

---

## 28. Testing Strategy

### Unit Tests

Test:

- strict spelling;
- capitalization;
- umlauts;
- `ß`;
- article checking;
- plural checking;
- verb forms;
- punctuation;
- word order;
- SRS scheduling;
- automatic grades;
- difficulty model;
- mastery;
- XP;
- streak;
- achievements;
- imports;
- migrations.

### Content Tests

Test every entry for:

- valid ID;
- valid rank;
- valid level;
- valid frequency band;
- valid topic;
- required grammar fields;
- example sentence;
- target token;
- searchable forms;
- exercise configuration.

### Component Tests

Test:

- multiple choice;
- text input;
- character helper;
- matching with mouse;
- matching with keyboard;
- word ordering;
- listening replay;
- speaking fallback;
- feedback;
- session resume;
- results.

### End-to-End Tests

Required flows:

1. Learn five new entries.
2. Complete a review.
3. Fail a word and see it rescheduled.
4. Master a word.
5. Complete a daily goal.
6. Continue a streak.
7. Search by participle.
8. Search by plural.
9. Export progress.
10. Reset progress.
11. Import progress.
12. Complete listening.
13. Use speaking fallback.
14. Navigate by keyboard.

---

## 29. Performance Requirements

For 10,000 entries:

- split files by level and frequency band;
- lazy-load content;
- virtualize large lists;
- debounce search;
- memoize indexes;
- batch IndexedDB writes;
- avoid full dataset rendering;
- use route-level code splitting;
- cache derived progress statistics.

Targets:

- search response under 100 ms for typical queries;
- immediate exercise transitions;
- non-blocking persistence;
- stable desktop performance.

---

## 30. Accessibility

Required:

- semantic HTML;
- visible focus;
- keyboard operation;
- accessible drag-and-drop alternative;
- `aria-live` feedback;
- no color-only correctness;
- labelled speech controls;
- reduced-motion support;
- sufficient contrast;
- logical heading order.

---

## 31. Privacy

The application must:

- require no account;
- send no learner data to a backend;
- avoid analytics by default;
- never store recordings;
- explain browser speech behavior;
- store progress locally;
- allow complete deletion;
- allow local export.

---

## 32. Definition of Done for an Entry

An entry is complete only when:

- stable ID exists;
- rank is correct;
- CEFR level is correct;
- German form is reviewed;
- English translation is reviewed;
- word class is correct;
- topic is assigned;
- frequency band is assigned;
- searchable forms exist;
- grammar metadata is complete;
- example sentence is reviewed;
- exercise configuration is valid;
- validation passes;
- duplicate audit passes.

---

## 33. Definition of Done for a Phase

A phase is complete only when:

- all listed deliverables exist;
- all tests pass;
- validation passes;
- no placeholders remain;
- no TypeScript errors exist;
- no lint errors exist;
- production build succeeds;
- previous phases still work;
- phase acceptance criteria are satisfied.

---

## 34. AI Development Agent Rules

The development agent must:

- complete phases in order;
- never present placeholder data as final;
- keep content separate from UI;
- preserve stable IDs;
- avoid `any`;
- avoid backend code;
- avoid authentication;
- avoid external AI APIs;
- avoid paid speech services;
- write tests for every feature;
- validate every content batch;
- report files changed;
- report commands executed;
- document browser speech limitations;
- document linguistic ambiguities;
- never advance while rank audits fail;
- never advance while duplicate audits fail;
- never mark content complete before language review.

The application must remain entirely usable as a static frontend application.
