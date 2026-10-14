import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import type { RequestInit as UndiciRequestInit } from 'undici';
import { utils } from '@ganju/utils';

// Fetching a URL a user handed us, from inside the container — which can reach
// its own loopback and whatever network it sits on. Every hop is screened: the
// URL itself (scheme, literal host) and every address its name resolves to,
// so neither a private IP, a name pointing at one, nor a redirect to either
// gets through.
//
// Screening a name before the request isn't enough on its own if the
// connection then resolves it again: the answer can change in between. So a
// name is resolved once, here, and the connection dials the addresses that
// passed — `pinnedAgent` looks them up through `screenedLookup`, which reads
// them from the same short-lived cache rather than asking DNS a second time.
// Only screened answers are ever cached, so nothing unscreened can be dialled.

export class BlockedUrlError extends Error {
  constructor(url: string) {
    super(`Refusing to fetch a private or non-http address: ${url}`);
    this.name = 'BlockedUrlError';
  }
}

// Short enough that a site moving hosts is followed within the crawl, long
// enough that a rendered page's dozens of subresources from one host cost one
// lookup. Bounded so a crawl touching many hosts can't grow it without limit.
const RESOLVED_TTL_MS = 30_000;
const RESOLVED_MAX = 256;
const resolved = new Map<
  string,
  { addresses: LookupAddress[]; expiresAt: number }
>();

// The screened addresses for a host name: from the cache while fresh,
// otherwise resolved and screened now. Throws when any address is private.
const resolvePublic = async (host: string): Promise<LookupAddress[]> => {
  const now = Date.now();
  const hit = resolved.get(host);
  if (hit && hit.expiresAt > now) return hit.addresses;

  const addresses = await lookup(host, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => utils.isBlockedHost(address))
  ) {
    resolved.delete(host);
    throw Object.assign(new BlockedUrlError(host), { code: 'EBLOCKED' });
  }

  resolved.delete(host);
  if (resolved.size >= RESOLVED_MAX) {
    const oldest = resolved.keys().next().value;
    if (oldest !== undefined) resolved.delete(oldest);
  }
  resolved.set(host, { addresses, expiresAt: now + RESOLVED_TTL_MS });
  return addresses;
};

export const assertPublicUrl = async (url: string): Promise<void> => {
  if (utils.isBlockedUrl(url)) throw new BlockedUrlError(url);
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return;
  try {
    await resolvePublic(host);
  } catch (error) {
    if (error instanceof BlockedUrlError) throw new BlockedUrlError(url);
    throw error;
  }
};

const familyOf = (family: unknown): 0 | 4 | 6 =>
  family === 4 || family === 'IPv4'
    ? 4
    : family === 6 || family === 'IPv6'
      ? 6
      : 0;

// The lookup the socket itself uses. It may be asked for one address or for
// all of them (Node's happy-eyeballs connect asks for all); either way it
// answers only with screened addresses — normally the ones the hop's own check
// just cached. A literal IP never reaches here; `assertPublicUrl` screens those.
export const screenedLookup: LookupFunction = (hostname, options, callback) => {
  const family = familyOf(options.family);
  resolvePublic(hostname).then(
    addresses => {
      const matching = addresses.filter(
        entry => family === 0 || entry.family === family
      );
      if (matching.length === 0) {
        const missing = Object.assign(
          new Error(`No IPv${family} address for ${hostname}`),
          { code: 'ENOTFOUND' }
        );
        return callback(missing, '', 0);
      }
      if (options.all) {
        return (
          callback as unknown as (
            error: NodeJS.ErrnoException | null,
            addresses: LookupAddress[]
          ) => void
        )(null, matching);
      }
      callback(null, matching[0].address, matching[0].family);
    },
    error => callback(error, '', 0)
  );
};

const pinnedAgent = new Agent({ connect: { lookup: screenedLookup } });

export type PublicResponse = Awaited<ReturnType<typeof undiciFetch>>;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export const isRedirect = (response: PublicResponse): boolean =>
  REDIRECT_STATUSES.has(response.status) &&
  response.headers.get('location') !== null;

// One request, screened and pinned, with any redirect handed back rather than
// followed — the caller decides whether the next hop is requested at all.
export const fetchHop = async (
  url: string,
  init: Omit<UndiciRequestInit, 'redirect' | 'dispatcher'> = {}
): Promise<PublicResponse> => {
  await assertPublicUrl(url);
  return undiciFetch(url, {
    ...init,
    redirect: 'manual',
    dispatcher: pinnedAgent
  });
};

// `fetch` with each redirect followed by hand, at most CRAWL_MAX_REDIRECTS of
// them, and every hop screened before it is requested. `finalUrl` is the URL
// the returned response came from.
export const fetchPublic = async (
  url: string,
  init: Omit<UndiciRequestInit, 'redirect' | 'dispatcher'> = {}
): Promise<{ response: PublicResponse; finalUrl: string }> => {
  let current = url;
  for (let hop = 0; ; hop++) {
    const response = await fetchHop(current, init);
    if (!isRedirect(response)) {
      return { response, finalUrl: current };
    }
    await response.body?.cancel().catch(() => undefined);
    if (hop >= utils.constants.CRAWL_MAX_REDIRECTS) {
      throw new Error(`Too many redirects fetching ${url}`);
    }
    current = new URL(response.headers.get('location')!, current).toString();
  }
};
