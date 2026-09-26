import { utils } from '@ganju/utils';
import type { ExtractedDocument } from '@ganju/utils';

export interface DiscoveredPage {
  url: string;
  title?: string;
  depth: number;
}

export interface CrawlDiscoverOptions {
  url: string;
  maxPages: number;
  maxDepth: number;
}

export interface CrawlDiscoverResult {
  pages: DiscoveredPage[];
  seed: WebSeo | null;
}

export interface WebSeo {
  url: string;
  canonicalUrl?: string;
  title?: string;
  description?: string;
  siteName?: string;
  author?: string;
  keywords?: string[];
  language?: string;
  publishedAt?: string;
  modifiedAt?: string;
  openGraph?: Record<string, string>;
  twitter?: Record<string, string>;
  jsonLd?: unknown[];
  headings?: { tag: string; text: string }[];
  images?: { src: string; alt?: string }[];
  links?: { url: string; text?: string }[];
  favicon?: string;
  httpStatus?: number;
  contentType?: string;
}

export interface CrawlPageResult {
  url: string;
  title?: string;
  description?: string;
  mimeType: string;
  encoding: string;
  size: number;
  renderer: 'cheerio' | 'playwright';
  text: string;
  seo: WebSeo;
  documents: ExtractedDocument[];
}

const parseCharset = (contentType: string): string | null => {
  const match = /charset=([^;\s]+)/i.exec(contentType);
  if (!match) return null;
  return match[1].replace(/^["']|["']$/g, '').toLowerCase();
};

const detectEncoding = ($: any, contentType: string): string => {
  const fromHeader = parseCharset(contentType);
  if (fromHeader) return fromHeader;
  const metaCharset = $('meta[charset]').attr('charset');
  if (metaCharset) return metaCharset.toLowerCase();
  const httpEquiv = $('meta[http-equiv="Content-Type"]').attr('content');
  if (httpEquiv) {
    const fromMeta = parseCharset(httpEquiv);
    if (fromMeta) return fromMeta;
  }
  return utils.constants.ENCODING_UTF8;
};

const normalizeUrl = (input: string, base?: string): string | null => {
  try {
    const u = new URL(input, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    if (u.pathname.endsWith('/') && u.pathname !== '/') {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.toString();
  } catch {
    return null;
  }
};

const sameOrigin = (target: string, origin: string): boolean => {
  try {
    return new URL(target).origin === new URL(origin).origin;
  } catch {
    return false;
  }
};

const fetchHtml = async (
  url: string
): Promise<{
  html: string;
  finalUrl: string;
  status: number;
  contentType: string;
} | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    utils.constants.CRAWL_PAGE_FETCH_TIMEOUT_MS
  );
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': utils.constants.CRAWL_USER_AGENT,
        accept: 'text/html,application/xhtml+xml'
      }
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) return null;
    if (!contentType.includes('html') && !contentType.includes('xml'))
      return null;
    const html = await response.text();
    return {
      html,
      finalUrl: response.url || url,
      status: response.status,
      contentType
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

// Whether the site says a page no longer exists — 404 or 410, and nothing
// else. Asked only after a fetch failed, so the failure can be told apart:
// a page that is gone gets removed by a sync, while a timeout, a 500 or a
// login wall keeps the copy already indexed.
export const isPageGone = async (url: string): Promise<boolean> => {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    utils.constants.CRAWL_PAGE_FETCH_TIMEOUT_MS
  );
  try {
    const response = await fetch(normalized, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': utils.constants.CRAWL_USER_AGENT,
        accept: 'text/html,application/xhtml+xml'
      }
    });
    await response.body?.cancel().catch(() => undefined);
    return response.status === 404 || response.status === 410;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const stripBoilerplate = ($: any, root: any): void => {
  $(root)
    .find(
      'script, style, noscript, template, svg, iframe, [aria-hidden="true"], [hidden]'
    )
    .remove();
};

const extractFullText = ($: any): string => {
  const root = $('main').length
    ? $('main').first()
    : $('article').length
      ? $('article').first()
      : $('body');
  stripBoilerplate($, root);
  // Headings are written back as Markdown lines: flattened to text they would
  // be indistinguishable from the paragraphs under them, and the chunker needs
  // them to split on and to record which section each chunk sits under. On a
  // copy, because buildSeo reads the same headings off the page afterwards.
  const marked = root.clone();
  marked.find('h1, h2, h3, h4, h5, h6').each((_: number, el: any) => {
    const level = Number((el.tagName || el.name || '').slice(1));
    const heading = $(el).text().replace(/\s+/g, ' ').trim();
    $(el).text(heading ? `\n\n${'#'.repeat(level)} ${heading}\n\n` : '');
  });
  const text = marked
    .text()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text;
};

const collectMetaTags = (
  $: any
): {
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
  generic: Record<string, string>;
} => {
  const openGraph: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  const generic: Record<string, string> = {};
  $('meta').each((_: number, el: any) => {
    const $el = $(el);
    const property = $el.attr('property');
    const name = $el.attr('name');
    const content = $el.attr('content');
    if (!content) return;
    if (property && property.startsWith('og:')) {
      openGraph[property.slice(3)] = content;
    } else if (name && name.startsWith('twitter:')) {
      twitter[name.slice(8)] = content;
    } else if (name) {
      generic[name.toLowerCase()] = content;
    }
  });
  return { openGraph, twitter, generic };
};

const extractJsonLd = ($: any): unknown[] => {
  const blocks: unknown[] = [];
  $('script[type="application/ld+json"]').each((_: number, el: any) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // ignore malformed JSON-LD
    }
  });
  return blocks;
};

const extractHeadings = ($: any): { tag: string; text: string }[] => {
  const headings: { tag: string; text: string }[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_: number, el: any) => {
    const tag = (el.tagName || el.name || '').toLowerCase();
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text) headings.push({ tag, text });
  });
  return headings;
};

const extractImages = (
  $: any,
  baseUrl: string
): { src: string; alt?: string }[] => {
  const images: { src: string; alt?: string }[] = [];
  $('img[src]').each((_: number, el: any) => {
    const src = $(el).attr('src');
    if (!src) return;
    const resolved = normalizeUrl(src, baseUrl);
    if (!resolved) return;
    const alt = $(el).attr('alt') || undefined;
    images.push({ src: resolved, alt });
  });
  return images;
};

const extractLinks = (
  $: any,
  baseUrl: string
): { url: string; text?: string }[] => {
  const links: { url: string; text?: string }[] = [];
  $('a[href]').each((_: number, el: any) => {
    const href = $(el).attr('href');
    if (!href) return;
    const normalized = normalizeUrl(href, baseUrl);
    if (!normalized) return;
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    links.push({ url: normalized, text: text || undefined });
  });
  return links;
};

const extractFavicon = ($: any, baseUrl: string): string | undefined => {
  const href =
    $('link[rel="icon"]').attr('href') ||
    $('link[rel="shortcut icon"]').attr('href') ||
    $('link[rel="apple-touch-icon"]').attr('href');
  if (!href) return undefined;
  return normalizeUrl(href, baseUrl) || undefined;
};

const buildSeo = (
  $: any,
  finalUrl: string,
  status: number,
  contentType: string
): WebSeo => {
  const meta = collectMetaTags($);
  const headings = extractHeadings($);
  const images = extractImages($, finalUrl);
  const links = extractLinks($, finalUrl);
  const jsonLd = extractJsonLd($);
  const favicon = extractFavicon($, finalUrl);

  const title =
    meta.openGraph['title'] ||
    meta.twitter['title'] ||
    $('title').first().text().trim() ||
    undefined;
  const description =
    meta.generic['description'] ||
    meta.openGraph['description'] ||
    meta.twitter['description'] ||
    undefined;
  const canonicalHref = $('link[rel="canonical"]').attr('href');
  const canonicalUrl = canonicalHref
    ? normalizeUrl(canonicalHref, finalUrl) || undefined
    : undefined;
  const siteName = meta.openGraph['site_name'] || undefined;
  const author = meta.generic['author'] || undefined;
  const keywords = meta.generic['keywords']
    ? meta.generic['keywords']
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : undefined;
  const language =
    $('html').attr('lang') ||
    meta.generic['language'] ||
    meta.openGraph['locale'] ||
    undefined;
  const publishedAt =
    meta.generic['article:published_time'] ||
    meta.openGraph['article:published_time'] ||
    undefined;
  const modifiedAt =
    meta.generic['article:modified_time'] ||
    meta.openGraph['article:modified_time'] ||
    undefined;

  return {
    url: finalUrl,
    canonicalUrl,
    title,
    description,
    siteName,
    author,
    keywords,
    language,
    publishedAt,
    modifiedAt,
    openGraph: Object.keys(meta.openGraph).length ? meta.openGraph : undefined,
    twitter: Object.keys(meta.twitter).length ? meta.twitter : undefined,
    jsonLd: jsonLd.length ? jsonLd : undefined,
    headings: headings.length ? headings : undefined,
    images: images.length ? images : undefined,
    links: links.length ? links : undefined,
    favicon,
    httpStatus: status,
    contentType
  };
};

const looksLikeSpa = ($: any, textLength: number): boolean => {
  const scripts = $('script[src]').length;
  const rootEl = $('#root, #app, [data-reactroot], [ng-app]').length;
  return textLength < 200 && (scripts > 3 || rootEl > 0);
};

const renderWithPlaywright = async (
  url: string
): Promise<{
  html: string;
  finalUrl: string;
  status: number;
  contentType: string;
} | null> => {
  try {
    const { chromium } = await import('playwright');
    const executablePath =
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
    const browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    try {
      const context = await browser.newContext({
        userAgent: utils.constants.CRAWL_USER_AGENT
      });
      const page = await context.newPage();
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: utils.constants.CRAWL_PAGE_FETCH_TIMEOUT_MS
      });
      const html = await page.content();
      const finalUrl = page.url();
      const status = response?.status() ?? 200;
      const contentType =
        response?.headers()['content-type'] ||
        utils.constants.MIMETYPE_TEXT_HTML;
      return { html, finalUrl, status, contentType };
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
};

export const crawlDiscover = async (
  options: CrawlDiscoverOptions
): Promise<CrawlDiscoverResult> => {
  const cheerio = await import('cheerio');
  const startUrl = normalizeUrl(options.url);
  if (!startUrl) return { pages: [], seed: null };
  const origin = new URL(startUrl).origin;

  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [
    { url: startUrl, depth: 0 }
  ];
  const pages: DiscoveredPage[] = [];
  let seed: WebSeo | null = null;

  while (queue.length > 0 && pages.length < options.maxPages) {
    const { url, depth } = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    let fetched = await fetchHtml(url);
    if (!fetched) continue;

    let $ = cheerio.load(fetched.html);
    let text = extractFullText($);

    if (looksLikeSpa($, text.length)) {
      const playwright = await renderWithPlaywright(url);
      if (playwright) {
        fetched = playwright;
        $ = cheerio.load(playwright.html);
        text = extractFullText($);
      }
    }

    if (depth === 0 && !seed) {
      seed = buildSeo($, fetched.finalUrl, fetched.status, fetched.contentType);
    }

    const titleAttr =
      $('meta[property="og:title"]').attr('content') ||
      $('title').first().text().trim() ||
      undefined;
    pages.push({ url: fetched.finalUrl, title: titleAttr, depth });

    if (depth < options.maxDepth) {
      $('a[href]').each((_: number, el: any) => {
        const href = $(el).attr('href');
        if (!href) return;
        const normalized = normalizeUrl(href, fetched!.finalUrl);
        if (!normalized) return;
        if (!sameOrigin(normalized, origin)) return;
        if (visited.has(normalized)) return;
        if (queue.some(q => q.url === normalized)) return;
        queue.push({ url: normalized, depth: depth + 1 });
      });
    }
  }

  return { pages, seed };
};

export const crawlPage = async (
  url: string,
  renderer?: 'cheerio' | 'playwright'
): Promise<CrawlPageResult | null> => {
  const cheerio = await import('cheerio');
  const normalized = normalizeUrl(url);
  if (!normalized) return null;

  let fetched: {
    html: string;
    finalUrl: string;
    status: number;
    contentType: string;
  } | null = null;
  let usedRenderer: 'cheerio' | 'playwright' = 'cheerio';

  if (renderer === 'playwright') {
    fetched = await renderWithPlaywright(normalized);
    usedRenderer = 'playwright';
  } else {
    fetched = await fetchHtml(normalized);
    if (fetched && renderer !== 'cheerio') {
      const $probe = cheerio.load(fetched.html);
      const probeText = extractFullText($probe);
      if (looksLikeSpa($probe, probeText.length)) {
        const playwright = await renderWithPlaywright(normalized);
        if (playwright) {
          fetched = playwright;
          usedRenderer = 'playwright';
        }
      }
    }
  }

  if (!fetched) return null;

  const $ = cheerio.load(fetched.html);
  const text = extractFullText($);
  if (!text) return null;

  const seo = buildSeo(
    $,
    fetched.finalUrl,
    fetched.status,
    fetched.contentType
  );
  const encoding = detectEncoding($, fetched.contentType);
  const size = Buffer.byteLength(text, 'utf8');

  const documents: ExtractedDocument[] = [
    {
      pageContent: text,
      metadata: {
        loc: { pageNumber: 1, totalPages: 1 },
        source: {
          mimeType: utils.constants.MIMETYPE_TEXT,
          sizeBytes: size
        },
        web: { ...seo, renderer: usedRenderer }
      }
    }
  ];

  return {
    url: fetched.finalUrl,
    title: seo.title,
    description: seo.description,
    mimeType: utils.constants.MIMETYPE_TEXT,
    encoding,
    size,
    renderer: usedRenderer,
    text,
    seo,
    documents
  };
};
