// Compact relative time — "5m ago", "3h ago", "2d ago", then falls back to a
// locale date once older than a week.
//
// The wording comes from `Intl.RelativeTimeFormat` in its narrow style, which
// renders exactly the shape the dashboard already used in English and gives
// Spanish "hace 5 min" for free. Nothing here is translatable copy.

const DEFAULT_LOCALE = 'en-US';

// The constructor is the expensive part and this runs inside lists, so build one
// per locale and keep it. `auto` lets the zero case read as "now" / "ahora"
// rather than "in 0 seconds".
const formatters = new Map<string, Intl.RelativeTimeFormat>();

const relativeFormat = (locale: string): Intl.RelativeTimeFormat => {
  const hit = formatters.get(locale);
  if (hit) return hit;
  const made = new Intl.RelativeTimeFormat(locale, {
    style: 'narrow',
    numeric: 'auto'
  });
  formatters.set(locale, made);
  return made;
};

export const formatRelativeTime = (
  iso?: string | null,
  locale: string = DEFAULT_LOCALE
): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const rtf = relativeFormat(locale);
  // A future timestamp lands here too, and reads as "now" rather than a
  // negative age — same as before.
  if (diff < minute) return rtf.format(0, 'second');
  if (diff < hour) return rtf.format(-Math.floor(diff / minute), 'minute');
  if (diff < day) return rtf.format(-Math.floor(diff / hour), 'hour');
  if (diff < 7 * day) return rtf.format(-Math.floor(diff / day), 'day');
  return date.toLocaleDateString(locale);
};
