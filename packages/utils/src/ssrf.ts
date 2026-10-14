// Literal-host SSRF screening shared by the proxied tool dispatchers
// (http-endpoint, mcp-proxy) and the website crawler. The Workers runtime can't resolve DNS, so we can
// only screen literal hosts and IPs (not DNS rebinding). Private/loopback/
// link-local ranges are always rejected; callers may further narrow with an
// allowlist.
export const ipv4InPrivateRange = (host: string): boolean => {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map(p => Number(p));
  if (octets.some(o => !Number.isInteger(o) || o < 0 || o > 255)) return false;
  const [a, b] = octets;
  if (a === 127 || a === 10 || a === 0) return true; // loopback / private / "this host"
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
  if (a === 192 && b === 168) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  return false;
};

// The IPv4 address an IPv4-mapped IPv6 literal reaches. URL parsing rewrites
// `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]`, so both spellings are read.
const mappedIpv4 = (host: string): string | null => {
  if (!host.startsWith('::ffff:')) return null;
  const rest = host.slice('::ffff:'.length);
  if (rest.includes('.')) return rest;
  const match = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
  if (!match) return null;
  const hi = Number.parseInt(match[1], 16);
  const lo = Number.parseInt(match[2], 16);
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
};

export const isBlockedHost = (hostname: string): boolean => {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.includes(':')) {
    // An IPv6 literal. Its prefixes are only checked here: a domain name such
    // as fdic.gov or fcbarcelona.com starts with the same letters.
    if (host === '::1' || host === '::') return true;
    // Link-local (fe80::/10) and unique-local (fc00::/7).
    if (/^fe[89ab]/.test(host) || /^f[cd]/.test(host)) return true;
    const mapped = mappedIpv4(host);
    return mapped !== null && ipv4InPrivateRange(mapped);
  }
  return ipv4InPrivateRange(host);
};

// Whether a URL may not be fetched on a user's behalf: not http(s), not a URL
// at all, or pointing at a private, loopback or link-local host.
export const isBlockedUrl = (url: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
  return isBlockedHost(parsed.hostname);
};
