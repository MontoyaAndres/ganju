/**
 * The translation machinery. No copy lives here — the catalogs under `copy/`
 * hold that, one module per view, because ~900 keys in a single object is
 * unreviewable.
 *
 * A catalog is a plain `Record<Lang, …>` of flat string keys, the same shape
 * `apps/website/src/lib/i18n.ts` uses. `useT()` takes the catalog object itself
 * rather than a namespace name: there is no registry to keep in sync, unused
 * catalogs are tree-shaken, and TypeScript can check every key at the call site.
 */
import { utils } from '@ganju/utils';

/** Mirrors `utils.constants.LANGUAGES`. */
export type Lang = 'en' | 'es';

export const LANGS: readonly Lang[] = ['en', 'es'];
export const DEFAULT_LANG: Lang = 'en';

/**
 * BCP-47 tag per language, for `Intl`. `es-CO` rather than `es` to match the
 * website (`i18n.ts:168,280`) — it is what decides the decimal comma and the
 * day-month date order the Spanish copy is written against.
 */
export const LOCALE_TAG: Record<Lang, string> = { en: 'en-US', es: 'es-CO' };

/** What the language switcher shows, each in its own language. */
export const LANG_LABEL: Record<Lang, string> = {
  en: 'English',
  es: 'Español'
};

/** Narrow an arbitrary locale tag to a language we ship. */
export const toLang = (value: string | undefined | null): Lang =>
  value?.startsWith('es') ? 'es' : DEFAULT_LANG;

export type Copy = Record<string, string>;
export type Catalog<C extends Copy> = Record<Lang, C>;

/** Values spliced into `{placeholder}` slots. */
export type Params = Record<string, string | number>;

/**
 * Base names of plural entries: a catalog that defines `members_one` and
 * `members_other` makes `'members'` a valid `t.plural()` key and nothing else.
 */
export type PluralKey<C extends Copy> = {
  [K in keyof C & string]: K extends `${infer Base}_other` ? Base : never;
}[keyof C & string];

/** Everything that varies by locale but carries no words of its own. */
export interface Format {
  /** The active language. */
  lang: Lang;
  /** The active BCP-47 tag, for callers that need `Intl` directly. */
  locale: string;
  /** `1234` → `1,234` / `1.234`. */
  n(value: number, options?: Intl.NumberFormatOptions): string;
  /** Byte count as MB/GB, with the locale's own decimal separator. */
  bytes(value: number): string;
  /** Date in the locale's own order. Invalid input renders as an em dash. */
  date(
    value: string | number | Date,
    options?: Intl.DateTimeFormatOptions
  ): string;
  /**
   * Age of a timestamp in words — `2 days ago` / `hace 2 días`. `fallback` is
   * what a missing date renders as, and is copy: the caller passes it
   * translated, or takes the em dash `date()` uses.
   */
  relative(
    value: string | number | Date | null | undefined,
    fallback?: string
  ): string;
  /** The same age, compact enough for a list row — `2d ago` / `hace 2 días`. */
  relativeShort(value?: string | null): string;
}

export interface Translate<C extends Copy> extends Format {
  /** Look up a key, filling any `{placeholder}` from `params`. */
  <K extends keyof C & string>(key: K, params?: Params): string;
  /**
   * Count-aware lookup. Picks `${key}_${category}` via `Intl.PluralRules` and
   * exposes the count as `{count}`, already formatted for the locale — Spanish
   * agreement and word order differ from English, so the two languages cannot
   * share a concatenated `n + ' item' + (n === 1 ? '' : 's')`.
   */
  plural(key: PluralKey<C>, count: number, params?: Params): string;
}

const PLACEHOLDER = /\{(\w+)\}/g;

/** Leaves an unknown `{placeholder}` in place — a visible key beats a silent gap. */
const interpolate = (template: string, params?: Params): string => {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (match, key: string) =>
    key in params ? String(params[key]) : match
  );
};

// `Intl` constructors are the expensive part of formatting, and these run
// inside lists. Key on the tag plus the options so each shape is built once.
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const pluralRules = new Map<Lang, Intl.PluralRules>();

export const numberFormat = (
  lang: Lang,
  options?: Intl.NumberFormatOptions
): Intl.NumberFormat => {
  const key = `${lang}:${JSON.stringify(options ?? null)}`;
  const hit = numberFormats.get(key);
  if (hit) return hit;
  const made = new Intl.NumberFormat(LOCALE_TAG[lang], options);
  numberFormats.set(key, made);
  return made;
};

export const dateFormat = (
  lang: Lang,
  options?: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat => {
  const key = `${lang}:${JSON.stringify(options ?? null)}`;
  const hit = dateFormats.get(key);
  if (hit) return hit;
  const made = new Intl.DateTimeFormat(LOCALE_TAG[lang], options);
  dateFormats.set(key, made);
  return made;
};

const pluralRule = (lang: Lang): Intl.PluralRules => {
  const hit = pluralRules.get(lang);
  if (hit) return hit;
  const made = new Intl.PluralRules(LOCALE_TAG[lang]);
  pluralRules.set(lang, made);
  return made;
};

/**
 * Byte count in MB or GB.
 *
 * The thresholds and precision are the ones the dashboard already used; what
 * changes is that the number goes through `Intl`, so Spanish gets `1,5 GB`
 * rather than an English decimal point, and the unit comes from CLDR instead of
 * a hardcoded `' MB'`.
 */
export const formatBytes = (lang: Lang, bytes: number): string => {
  const unit = (
    value: number,
    name: 'megabyte' | 'gigabyte',
    decimals: number
  ) =>
    numberFormat(lang, {
      style: 'unit',
      unit: name,
      unitDisplay: 'short',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);

  if (!bytes) return unit(0, 'megabyte', 0);
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return unit(mb, 'megabyte', mb < 10 ? 1 : 0);
  const gb = mb / 1024;
  return unit(gb, 'gigabyte', gb < 10 ? 1 : 0);
};

/**
 * The formatting half of a translator, on its own.
 *
 * A view that has not been translated yet still renders dates and byte counts,
 * and those should follow the reader's locale from the moment the locale
 * exists — they carry no English in them to translate. `useFormat()` hands this
 * to such a view without inventing an empty catalog for it; `createT` folds the
 * same three functions onto `t`, so the two never drift.
 */
export const createFormat = (lang: Lang): Format => ({
  lang,
  locale: LOCALE_TAG[lang],
  n: (value, options) => numberFormat(lang, options).format(value),
  bytes: value => formatBytes(lang, value),
  date: (value, options) => {
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime())
      ? '—'
      : dateFormat(lang, options).format(parsed);
  },
  // Both live in `@ganju/utils` because `packages/ui` renders them too. They
  // take the tag rather than reading a global, for the same reason everything
  // else here does.
  relative: (value, fallback = '—') =>
    utils.formatRelative(value, { locale: LOCALE_TAG[lang], fallback }),
  relativeShort: value => utils.formatRelativeTime(value, LOCALE_TAG[lang])
});

/** Build a translator bound to one catalog and one language. */
export const createT = <C extends Copy>(
  catalog: Catalog<C>,
  lang: Lang
): Translate<C> => {
  const copy = catalog[lang] ?? catalog[DEFAULT_LANG];
  // A key missing from a translation falls back to English rather than
  // rendering blank, so a half-translated catalog degrades to readable.
  const read = (key: string): string =>
    copy[key] ?? catalog[DEFAULT_LANG][key] ?? key;

  const t = ((key: string, params?: Params) =>
    interpolate(read(key), params)) as Translate<C>;

  Object.assign(t, createFormat(lang));

  t.plural = (key, count, params) => {
    const category = pluralRule(lang).select(count);
    const exact = copy[`${key}_${category}`] ?? copy[`${key}_other`];
    const fallback =
      catalog[DEFAULT_LANG][`${key}_${category}`] ??
      catalog[DEFAULT_LANG][`${key}_other`];
    return interpolate(exact ?? fallback ?? String(key), {
      count: t.n(count),
      ...params
    });
  };

  return t;
};
