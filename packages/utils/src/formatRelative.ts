import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/es';

dayjs.extend(relativeTime);

export interface FormatRelativeOptions {
  /**
   * BCP-47 tag of the language to answer in — `t.locale` in the dashboard.
   * Anything that is not Spanish falls through to English.
   */
  locale?: string;
  /** Rendered when there is no date to describe. Copy, so callers translate it. */
  fallback?: string;
}

/**
 * dayjs ships one file per language and matches on its own short names, not on
 * BCP-47 tags: `es-CO` is not a locale it knows, `es` is.
 */
const dayjsLocale = (locale?: string): string =>
  locale?.startsWith('es') ? 'es' : 'en';

export const formatRelative = (
  value: string | number | Date | null | undefined,
  options: FormatRelativeOptions = {}
): string => {
  const { locale, fallback = 'Never' } = options;
  if (!value) return fallback;
  const d = dayjs(value);
  if (!d.isValid()) return fallback;
  // Per instance, never `dayjs.locale(…)`: that sets a module-level global, and
  // a Workers isolate serves requests of mixed languages concurrently — the same
  // reason `localizeZodIssue` refuses `z.config()`.
  return d.locale(dayjsLocale(locale)).fromNow();
};
