/**
 * Editorial corrections applied on top of `data/*.json` at content-build time.
 *
 * WHY THIS FILE EXISTS
 * The shipped datasets declare `linguisticReview: required`. The A1 completion criteria
 * (Phases 3 and 4) require that *every* noun carries an article and a plural, and 34
 * nouns in ranks 1–500 do not. Rather than edit the authoring files — which stay the
 * single source of truth — corrections live here, one line per entry, each with a reason.
 *
 * There are two kinds:
 *
 *   1. `numberUsage` reclassification. Uncountable nouns (`Wasser`, `Glück`) and
 *      plural-only nouns (`Eltern`, `Leute`) were marked `"both"`, which wrongly implies
 *      a missing plural. Correcting the label needs no new German.
 *
 *   2. A supplied `plural`. These are ordinary countable nouns whose plural was simply
 *      absent. The forms are standard and unambiguous.
 *
 * ⚠ REVIEW STATUS: machine-proposed, awaiting human sign-off. `numberUsage` judgements
 * about countability are exactly the kind of call §33 reserves for the manual language
 * review, and a few are genuinely arguable — `Essen` and `Bier` are countable when they
 * mean "meals" and "beers", and `Alter` is countable in the sense "era".
 */

export type NumberUsage = 'both' | 'singularOnly' | 'pluralOnly' | 'unspecified';

export interface NounCorrection {
  /** Set when the entry is not countable in the sense the dataset teaches. */
  readonly numberUsage?: NumberUsage;
  /** Set when the noun is countable but its plural was missing or wrong. */
  readonly plural?: string;
  /** Set when the article was missing. */
  readonly article?: 'der' | 'die' | 'das';
  /**
   * Set when the headword itself is malformed — a few A2 entries are stored as
   * compound-forming stems with a trailing hyphen (`Süßwasser-`), which is not the form a
   * learner should ever produce.
   */
  readonly german?: string;
  /**
   * Set when the entry is not a noun at all. `Polar-` is a prefix, not a headword, so
   * teaching it as a noun with an article and a plural would be wrong.
   */
  readonly wordClass?: 'other';
  readonly reason: string;
}

export const NOUN_CORRECTIONS: Readonly<Record<string, NounCorrection>> = {
  /* ---- Phase 3: ranks 1–250 ---- */
  'a1-0044-die-russische-foderation': {
    numberUsage: 'singularOnly',
    reason: 'Proper noun (country name); no plural.',
  },
  'a1-0045-die-schweiz': {
    numberUsage: 'singularOnly',
    reason: 'Proper noun (country name); no plural.',
  },
  'a1-0074-der-unterstrich': { plural: 'Unterstriche', reason: 'Countable; standard -e plural.' },
  'a1-0075-das-minus': { plural: 'Minus', reason: 'Countable; plural is unchanged.' },
  'a1-0078-der-herr': { plural: 'Herren', reason: 'Countable; weak masculine plural.' },
  'a1-0091-die-frau': { plural: 'Frauen', reason: 'Countable; standard -en plural.' },
  'a1-0093-der-morgen': { plural: 'Morgen', reason: 'Countable; plural is unchanged.' },
  'a1-0095-der-mittag': { plural: 'Mittage', reason: 'Countable; standard -e plural.' },
  'a1-0122-die-ferien': {
    numberUsage: 'pluralOnly',
    reason: 'Plural-only noun; there is no singular.',
  },
  'a1-0156-das-alter': {
    numberUsage: 'singularOnly',
    reason: 'Uncountable in the taught sense "age".',
  },
  'a1-0158-der-familienstand': {
    plural: 'Familienstände',
    reason: 'Countable; umlaut + -e plural.',
  },
  'a1-0227-der-dank': { numberUsage: 'singularOnly', reason: 'Uncountable abstract noun.' },
  'a1-0247-der-sport': {
    numberUsage: 'singularOnly',
    reason: 'Uncountable in the taught general sense.',
  },

  /* ---- Phase 4: ranks 251–500 ---- */
  'a1-0285-die-musik': { numberUsage: 'singularOnly', reason: 'Uncountable in the taught sense.' },
  'a1-0290-das-essen': { plural: 'Essen', reason: 'Countable as "meals"; plural unchanged.' },
  'a1-0304-die-zeit': { plural: 'Zeiten', reason: 'Countable; standard -en plural.' },
  'a1-0329-die-eltern': { numberUsage: 'pluralOnly', reason: 'Plural-only noun.' },
  'a1-0350-die-chips': { numberUsage: 'pluralOnly', reason: 'Plural-only in the taught sense.' },
  'a1-0362-das-grammatikbuch': {
    plural: 'Grammatikbücher',
    reason: 'Countable; umlaut + -er plural.',
  },
  'a1-0367-die-leute': { numberUsage: 'pluralOnly', reason: 'Plural-only noun.' },
  'a1-0370-das-gluck': { numberUsage: 'singularOnly', reason: 'Uncountable abstract noun.' },
  'a1-0372-der-hunger': { numberUsage: 'singularOnly', reason: 'Uncountable abstract noun.' },
  'a1-0373-der-durst': { numberUsage: 'singularOnly', reason: 'Uncountable abstract noun.' },
  'a1-0375-das-bier': { plural: 'Biere', reason: 'Countable as "beers"/"kinds of beer".' },
  'a1-0382-das-mineralwasser': {
    numberUsage: 'singularOnly',
    reason: 'Mass noun in the taught sense.',
  },
  'a1-0394-der-reis': { numberUsage: 'singularOnly', reason: 'Mass noun.' },
  'a1-0397-das-fleisch': { numberUsage: 'singularOnly', reason: 'Mass noun.' },
  'a1-0420-der-alkohol': { numberUsage: 'singularOnly', reason: 'Mass noun in the taught sense.' },
  'a1-0428-das-eis': { numberUsage: 'singularOnly', reason: 'Mass noun.' },
  'a1-0433-das-gemuse': { numberUsage: 'singularOnly', reason: 'Mass noun (collective).' },
  'a1-0434-die-pommes-frites': { numberUsage: 'pluralOnly', reason: 'Plural-only noun.' },
  'a1-0442-das-wasser': { numberUsage: 'singularOnly', reason: 'Mass noun in the taught sense.' },
  'a1-0467-der-september': {
    numberUsage: 'singularOnly',
    reason: 'Month name; no plural in normal use.',
  },
  'a1-0473-der-konzertbeginn': {
    numberUsage: 'singularOnly',
    reason: 'Abstract event noun; no plural in normal use.',
  },

  /* ---- Phase 5: ranks 501–750 ---- */
  'a1-0519-der-hauptbahnhof': { plural: 'Hauptbahnhöfe', reason: 'Countable; umlaut + -e plural.' },
  'a1-0526-das-fussballstadion': { plural: 'Fußballstadien', reason: 'Countable; -ien plural.' },
  'a1-0560-das-obst': { numberUsage: 'singularOnly', reason: 'Mass noun in the taught sense.' },
  'a1-0564-der-knoblauch': {
    numberUsage: 'singularOnly',
    reason: 'Mass noun in the taught sense.',
  },
  'a1-0574-die-nudeln': {
    numberUsage: 'pluralOnly',
    reason: 'Plural-only noun in the taught sense.',
  },
  'a1-0575-das-mehl': { numberUsage: 'singularOnly', reason: 'Mass noun in the taught sense.' },
  'a1-0576-der-zucker': { numberUsage: 'singularOnly', reason: 'Mass noun in the taught sense.' },
  'a1-0577-die-milch': { numberUsage: 'singularOnly', reason: 'Mass noun in the taught sense.' },
  'a1-0578-der-kase': { numberUsage: 'singularOnly', reason: 'Mass noun in the taught sense.' },
  'a1-0580-das-trinken': { numberUsage: 'singularOnly', reason: 'Nominalized verb; no plural.' },
  'a1-0590-die-sahne': { numberUsage: 'singularOnly', reason: 'Mass noun in the taught sense.' },
  'a1-0592-der-honig': { numberUsage: 'singularOnly', reason: 'Mass noun in the taught sense.' },
  'a1-0593-das-gramm-g': {
    plural: 'Gramm',
    reason: 'Unit of measure; plural unchanged after a numeral.',
  },
  'a1-0596-die-wurst': { plural: 'Würste', reason: 'Countable; umlaut + -e plural.' },
  'a1-0597-das-pfund-500-gramm': {
    plural: 'Pfund',
    reason: 'Unit of measure; plural unchanged after a numeral.',
  },
  'a1-0599-das-ol': { numberUsage: 'singularOnly', reason: 'Mass noun in the taught sense.' },
  'a1-0615-das-salz': { numberUsage: 'singularOnly', reason: 'Mass noun in the taught sense.' },
  'a1-0626-der-alltag': { numberUsage: 'singularOnly', reason: 'Uncountable abstract noun.' },
  'a1-0633-das-fruhstuck': { plural: 'Frühstücke', reason: 'Countable; standard -e plural.' },
  'a1-0645-die-ruhe': { numberUsage: 'singularOnly', reason: 'Uncountable abstract noun.' },
  'a1-0651-der-stress': { numberUsage: 'singularOnly', reason: 'Uncountable abstract noun.' },
  'a1-0653-das-lernen': { numberUsage: 'singularOnly', reason: 'Nominalized verb; no plural.' },
  'a1-0676-das-surfen': { numberUsage: 'singularOnly', reason: 'Nominalized verb; no plural.' },
  'a1-0684-der-rock': { numberUsage: 'singularOnly', reason: 'Genre name; uncountable.' },
  'a1-0690-der-hip-hop': { numberUsage: 'singularOnly', reason: 'Genre name; uncountable.' },
  'a1-0693-das-europa': { numberUsage: 'singularOnly', reason: 'Proper noun; no plural.' },
  'a1-0699-der-norden': { numberUsage: 'singularOnly', reason: 'Cardinal direction; no plural.' },
  'a1-0700-die-klassische-musik': {
    numberUsage: 'singularOnly',
    reason: 'Genre name; uncountable.',
  },
  'a1-0701-der-metal': { numberUsage: 'singularOnly', reason: 'Genre name; uncountable.' },
  'a1-0703-der-jazz': { numberUsage: 'singularOnly', reason: 'Genre name; uncountable.' },
  'a1-0726-der-platz': {
    numberUsage: 'singularOnly',
    reason: 'Uncountable in the taught sense "space".',
  },
  'a1-0735-der-stock': {
    numberUsage: 'singularOnly',
    reason: 'Uncountable in the taught sense "floor level".',
  },

  /* ---- Phase 6: ranks 751–1,000 ---- */
  'a1-0753-das-power-yoga': { numberUsage: 'singularOnly', reason: 'Nominalized verb; no plural.' },
  'a1-0754-das-aqua-yoga': { numberUsage: 'singularOnly', reason: 'Nominalized verb; no plural.' },
  'a1-0756-die-wellness': { numberUsage: 'singularOnly', reason: 'Uncountable abstract noun.' },
  'a1-0764-der-durchschnitt': { numberUsage: 'singularOnly', reason: 'Uncountable abstract noun.' },
  'a1-0766-das-netz': {
    numberUsage: 'singularOnly',
    reason: 'Uncountable in the taught sense "the Internet".',
  },
  'a1-0769-die-kommunikation': {
    numberUsage: 'singularOnly',
    reason: 'Uncountable abstract noun.',
  },
  'a1-0789-die-dauer': { numberUsage: 'singularOnly', reason: 'Uncountable abstract noun.' },
  'a1-0800-das-universitatsmuseum': {
    plural: 'Universitätsmuseen',
    reason: 'Countable; -en plural.',
  },
  'a1-0836-das-marketing': { numberUsage: 'singularOnly', reason: 'Uncountable abstract noun.' },
  'a1-0839-das-chaos': { numberUsage: 'singularOnly', reason: 'Uncountable abstract noun.' },
  'a1-0852-die-grosseltern': { numberUsage: 'pluralOnly', reason: 'Plural-only noun.' },
  'a1-0859-die-jugend': { numberUsage: 'singularOnly', reason: 'Uncountable abstract noun.' },
  'a1-0869-das-wg-leben': { numberUsage: 'singularOnly', reason: 'Nominalized verb; no plural.' },
  'a1-0876-der-journalismus': { numberUsage: 'singularOnly', reason: 'Uncountable abstract noun.' },
  'a1-0893-der-tourismus': { numberUsage: 'singularOnly', reason: 'Uncountable abstract noun.' },
  'a1-0908-das-skifahren': { numberUsage: 'singularOnly', reason: 'Nominalized verb; no plural.' },
  'a1-0909-das-snowboarden': {
    numberUsage: 'singularOnly',
    reason: 'Nominalized verb; no plural.',
  },
  'a1-0929-der-schmuck': { numberUsage: 'singularOnly', reason: 'Mass noun in the taught sense.' },
  'a1-0930-der-briefumschlag': {
    plural: 'Briefumschläge',
    reason: 'Countable; umlaut + -e plural.',
  },
  'a1-0933-die-schreibwaren': { numberUsage: 'pluralOnly', reason: 'Plural-only noun.' },
  'a1-0959-der-englische-garten': {
    numberUsage: 'singularOnly',
    reason: 'Proper noun; no plural.',
  },
  'a1-0964-der-westen': { numberUsage: 'singularOnly', reason: 'Cardinal direction; no plural.' },
  'a1-0965-der-suden': { numberUsage: 'singularOnly', reason: 'Cardinal direction; no plural.' },
  'a1-0966-der-osten': { numberUsage: 'singularOnly', reason: 'Cardinal direction; no plural.' },
  'a1-0974-die-turkei': { numberUsage: 'singularOnly', reason: 'Proper noun; no plural.' },
  'a1-0976-der-iran': { numberUsage: 'singularOnly', reason: 'Proper noun; no plural.' },
  'a1-0977-die-usa': { numberUsage: 'pluralOnly', reason: 'Plural-only proper noun (die USA).' },

  /* ---- Phases 8–11 (A2): nouns stored without an article ----
   *
   * These are the most debatable corrections in this file. Four entries are stored as
   * compound-forming stems with a trailing hyphen and carry invented plurals
   * (Polar-e, Süßwasser-e); five are festival names whose generated plurals are not
   * German words at all (Osterne). Each is repaired to the form a learner should
   * actually produce, or reclassified when it is not a headword.
   */
  'a2-1937-susswasser': {
    german: 'Süßwasser',
    article: 'das',
    numberUsage: 'singularOnly',
    reason: 'Stored as a compound stem Süßwasser- with an invented plural; it is a mass noun.',
  },
  'a2-1938-meereswasser': {
    german: 'Meereswasser',
    article: 'das',
    numberUsage: 'singularOnly',
    reason: 'Stored as a compound stem with an invented plural; it is a mass noun.',
  },
  'a2-2171-ubergrossen': {
    german: 'Übergröße',
    article: 'die',
    plural: 'Übergrößen',
    reason: 'Stored as the plural stem Übergrößen-; corrected to the singular headword.',
  },
  'a2-3545-polar': {
    wordClass: 'other',
    reason: 'A prefix (Polar-), not a standalone noun; it takes no article or plural.',
  },
  'a2-2514-standard': {
    article: 'der',
    plural: 'Standards',
    reason: 'Countable; the stored plural Standarde is not the usual form.',
  },
  'a2-3303-reiki': {
    article: 'das',
    numberUsage: 'singularOnly',
    reason: 'Mass noun; the stored plural Reikis is not idiomatic.',
  },
  'a2-3610-allerheiligen': {
    article: 'das',
    numberUsage: 'singularOnly',
    reason: 'Festival name, normally used without an article; the stored plural is invented.',
  },
  'a2-3611-diwali': {
    article: 'das',
    numberUsage: 'singularOnly',
    reason: 'Festival name, normally used without an article.',
  },
  'a2-3612-ostern': {
    article: 'das',
    numberUsage: 'singularOnly',
    reason: 'Festival name; the stored plural Osterne is not a German word.',
  },
  'a2-3614-halloween': {
    article: 'das',
    numberUsage: 'singularOnly',
    reason: 'Festival name, normally used without an article.',
  },
  'a2-3615-chanukka': {
    article: 'das',
    numberUsage: 'singularOnly',
    reason: 'Festival name, normally used without an article.',
  },
};

/** Every corrected entry id, for the audit report. */
export const CORRECTED_ENTRY_IDS: readonly string[] = Object.keys(NOUN_CORRECTIONS);
