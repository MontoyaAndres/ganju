import type { Source } from './sources';

// "p. 125", "pp. 123–126", "page 12", "págs. 4-5", "páginas 3 a 5". An
// abbreviation counts only with its dot and a number has to stand alone, so
// "p2p", "mp3" and "pp 2026" are not page references. The lookarounds, not \b,
// mark the edges: \b sees "á" as a word break.
const PAGE_REFERENCE =
  /(?<![\p{L}\p{N}])(?:(?:pp?|p[aá]gs?)\.|pages?|p[aá]ginas?)\s*(\d{1,5})(?![\p{L}\p{N}])(?:(?:\s*[-–—]\s*|\s+(?:to|a)\s+)(\d{1,5})(?![\p{L}\p{N}]))?/giu;
const MAX_PAGE_RANGE = 50;

// Lowercased words only, so "ETag header — HTTP | MDN" in an answer matches the
// title "ETag header - HTTP | MDN", and "mml-book.pdf" matches "mml-book".
const normalize = (text: string): string =>
  ` ${text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;

// The ways an answer refers to a source: its whole title, the title without a
// parenthetical or a site suffix ("Northwind Handbook (draft)", "ETag header
// - HTTP | MDN"), its file name with and without the extension, and its URL.
const namesFor = (source: Source): string[] => {
  const names = [source.title, source.title.replace(/\s*\([^)]*\)\s*/g, ' ')];
  const lead = source.title.split(/\s+[|\-–—:]\s+/)[0];
  // A one-word lead ("Introduction", "Pricing") names half the corpus.
  if (lead.trim().split(/\s+/).length >= 2) names.push(lead);
  if (source.fileName) {
    names.push(source.fileName, source.fileName.replace(/\.[a-z0-9]+$/i, ''));
  }
  return names.map(normalize).filter(name => name.trim().length >= 4);
};

// The characters that can carry a URL on past the point we matched. Brackets,
// quotes and whitespace end it — that is how a URL sits inside Markdown links,
// parentheses and prose.
const URL_CONTINUATION = /^[^\s<>()[\]{}"'`|]*/;
// Punctuation that closes a sentence around a URL rather than belonging to it.
const TRAILING_PUNCTUATION = /[.,;:!?*_]+$/;

/**
 * Whether the answer cites this exact URL, not merely one that starts with it:
 * on a crawled docs site the index page is a prefix of every page beneath it,
 * so a plain substring test kept "/docs" and the site root in the footer of an
 * answer that cited "/docs/api". A trailing slash and a #fragment still count
 * as the same page.
 */
export const citesUrl = (answer: string, url: string): boolean => {
  const target = url.replace(/\/+$/, '');
  if (!target) return false;
  for (
    let at = answer.indexOf(target);
    at !== -1;
    at = answer.indexOf(target, at + 1)
  ) {
    const rest = answer
      .slice(at + target.length)
      .match(URL_CONTINUATION)![0]
      .replace(TRAILING_PUNCTUATION, '');
    if (/^\/*(#.*)?$/.test(rest)) return true;
  }
  return false;
};

/** Every page number the answer cites, ranges expanded. */
export const citedPages = (answer: string): Set<number> => {
  const pages = new Set<number>();
  for (const match of answer.matchAll(PAGE_REFERENCE)) {
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (to < from || to - from > MAX_PAGE_RANGE) {
      pages.add(from);
      continue;
    }
    for (let page = from; page <= to; page++) pages.add(page);
  }
  return pages;
};

/**
 * Narrow a turn's sources to the ones its answer actually cites.
 *
 * Every search hit used to become a footer line, so an answer drawn from one
 * handbook section was followed by eight unrelated pages the search had also
 * returned. A search hit is kept when the answer names its resource — by title,
 * file name or URL — and, for a paged file, only the pages the answer cites
 * (or the best-ranked one, when it cites none). Resources the model read whole
 * are always kept: reading one is itself the citation.
 *
 * An answer that names nothing gets no search sources at all. The model is told
 * to cite what it uses, so a reply that names nothing is a greeting or "I
 * couldn't find that" — and a footer under it would claim sources it never
 * used, just because search runs on every message.
 */
export const selectCitedSources = (
  sources: Source[],
  answerText: string
): Source[] => {
  const searchEntries = sources.filter(s => s.score !== undefined);
  const readEntries = sources.filter(s => s.score === undefined);
  if (searchEntries.length === 0) return sources;

  const answer = normalize(answerText);
  const pages = citedPages(answerText);
  const citedResources = new Set(
    searchEntries
      .filter(
        s =>
          citesUrl(answerText, s.uri) ||
          namesFor(s).some(name => answer.includes(name))
      )
      .map(s => s.resourceId)
  );

  const kept: Source[] = [];
  for (const resourceId of citedResources) {
    const entries = searchEntries.filter(s => s.resourceId === resourceId);
    const onCitedPage = entries.filter(
      s => s.pageNumber !== undefined && pages.has(s.pageNumber)
    );
    kept.push(...(onCitedPage.length > 0 ? onCitedPage : entries.slice(0, 1)));
  }

  const cited = searchEntries.filter(s => kept.includes(s));
  return [...cited, ...readEntries];
};
