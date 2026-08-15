import { utils } from '@ganju/utils';

import type { Bindings } from './types';

// Every `fetch` a user script makes is routed here by the dispatch namespace
// before it leaves the platform. This — not the SDK — is where egress control
// lives: anything inside the isolate is code the user can edit, so a check
// written there is documentation, not a control.
//
// The dispatcher attaches the artifact id and the tool's allowed hosts as
// outbound parameters on every `DISPATCH.get()`, so this worker knows who it is
// screening for without trusting anything in the request.

const deny = (reason: string): Response =>
  new Response(JSON.stringify({ error: `Blocked by Ganju: ${reason}` }), {
    // 403 rather than a network error so the script sees an ordinary Response it
    // can read, and the model gets a message explaining what to fix.
    status: 403,
    headers: { 'content-type': 'application/json' }
  });

const parseAllowedHosts = (raw: string | undefined): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((h): h is string => typeof h === 'string')
      : [];
  } catch {
    return [];
  }
};

// Matches http-endpoint's allow-list semantics: an entry covers the host itself
// and its subdomains, so "acme.com" permits "api.acme.com" without listing each.
const hostAllowed = (hostname: string, allowedHosts: string[]): boolean => {
  if (allowedHosts.length === 0) return true;
  const host = hostname.toLowerCase();
  return allowedHosts.some(
    allowed => host === allowed || host.endsWith(`.${allowed}`)
  );
};

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return deny('the request URL could not be parsed');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return deny(`the ${url.protocol} scheme is not allowed`);
    }

    // The SSRF screen is unconditional and comes first: an allow-list can only
    // narrow what a script may reach, never widen it to loopback, private, or
    // link-local space (cloud metadata endpoints live in the last of those).
    if (utils.isBlockedHost(url.hostname)) {
      return deny(
        `"${url.hostname}" is a private, loopback or link-local address`
      );
    }

    // The namespace routes subrequests made by the BROKER on the script's behalf
    // through here too, so a tool's allow-list would otherwise cut off the
    // platform's own capabilities — ctx.resources.search is a fetch to Gemini,
    // and refreshing a connection is a fetch to a provider's token endpoint.
    // Those hosts are exempt from the allow-list; nothing exempts them from the
    // SSRF screen above, and they still spend the artifact's rate budget below.
    const isPlatformHost = hostAllowed(
      url.hostname,
      utils.constants.CUSTOM_CODE_PLATFORM_HOSTS
    );
    const allowedHosts = parseAllowedHosts(
      env[utils.constants.CUSTOM_CODE_OUTBOUND_PARAM_ALLOWED_HOSTS]
    );
    if (!isPlatformHost && !hostAllowed(url.hostname, allowedHosts)) {
      return deny(
        `"${url.hostname}" is not in this tool's allowed hosts. Add it to allowedHosts and publish a new version.`
      );
    }

    // Rate limiting is keyed by artifact, not by host: the budget being defended
    // is our egress from one customer's script, and letting them spread a loop
    // across many hosts to get more of it would defeat the point. `redirect:
    // 'manual'` so a 302 to a blocked host comes back through this worker as a
    // fresh request rather than being followed inside the runtime.
    const artifactId =
      env[utils.constants.CUSTOM_CODE_OUTBOUND_PARAM_ARTIFACT_ID];
    if (artifactId && env.HTTP_ENDPOINT_RATE_LIMITER) {
      try {
        const { success } = await env.HTTP_ENDPOINT_RATE_LIMITER.limit({
          key: artifactId
        });
        if (!success) {
          return deny('this artifact has exceeded its outbound request limit');
        }
      } catch {
        // A limiter hiccup must not break a legitimate call.
      }
    }

    return fetch(new Request(request, { redirect: 'manual' }));
  }
};
