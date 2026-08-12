/**
 * Cookie `Domain` for the remembered language, derived from the host serving
 * the request.
 *
 * `ganju.ai` and `app.ganju.ai` are two hosts, so a host-only cookie set by one
 * is invisible to the other — someone who explicitly picks English here would
 * sign in and be handed Spanish again by the dashboard's country lookup, which
 * defeats the point of remembering the choice. Scoping the cookie to
 * `.ganju.ai` makes one click cover both.
 *
 * Derived from the host rather than configured, because the two surfaces deploy
 * separately and a value set in one place would silently rot in the other.
 *
 * **Duplicated from `packages/utils/src/languageCookieDomain.ts`** for the same
 * reason as `constants.ts` next door — keep the two identical.
 *
 * **Assumes a single-label public suffix** — `ganju.ai`, `vocesqueabrazan.com`.
 * A deploy under a multi-part suffix (`example.co.uk`) would compute `.co.uk`,
 * which browsers reject, and the cookie would quietly go nowhere. Add that
 * suffix here if it ever happens.
 */
export const languageCookieDomain = (hostname: string): string | undefined => {
  const labels = hostname.split('.');

  // `localhost`, and anything else with nothing to share with.
  if (labels.length < 2) return undefined;

  // A bare IP has no domain to scope to.
  if (/^\d+$/.test(labels[labels.length - 1])) return undefined;

  const apex = labels.slice(-2).join('.');

  // Cloudflare's preview hosts are a public suffix: every Pages project on the
  // planet shares them, so browsers refuse a cookie scoped there. Falling back
  // to host-only keeps previews working on their own.
  if (apex === 'pages.dev' || apex === 'workers.dev') return undefined;

  return `.${apex}`;
};
