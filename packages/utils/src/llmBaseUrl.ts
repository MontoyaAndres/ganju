import { constants } from './constants';
import { isBlockedHost } from './ssrf';

/**
 * The rules an `organization_llm.base_url` has to satisfy, in one place.
 *
 * Two write paths need them and neither can see the whole picture alone: the
 * create schema validates a complete payload, while an update is a partial, so
 * the provider may arrive in the request and the base URL may only exist on the
 * stored row. Keeping the rules here means the two can't drift into disagreeing
 * about what a valid row is — the same reason every other write in this package
 * goes through a shared validator rather than an inline check.
 */

/**
 * Which providers need a base URL of their own.
 *
 * Every other provider has an endpoint baked into its SDK. `openai-compatible`
 * has none: it is the escape hatch for services that merely speak the OpenAI
 * protocol, so without a base URL the adapter would send the customer's key to
 * `api.openai.com` and fail somewhere far from the form they typed it into.
 */
export const requiresLlmBaseUrl = (provider?: string | null): boolean =>
  provider === constants.LLM_PROVIDER_OPENAI_COMPATIBLE;

/**
 * Whether a base URL is safe to send a request to.
 *
 * This is an outbound fetch target chosen by a customer, on a worker holding
 * their decrypted API key, so it gets the same screening as every other
 * caller-supplied URL: `https` only, because the key travels in a header, and
 * no loopback, private or link-local host. The Workers runtime can't resolve
 * DNS, so — as everywhere else `isBlockedHost` is used — this screens literal
 * hosts and IPs and is not a defense against DNS rebinding.
 */
export const isAllowedLlmBaseUrl = (value: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return !isBlockedHost(parsed.hostname);
};

/**
 * Both rules against one provider/base-URL pair: the message to reject with, or
 * `null` when the pair is acceptable. The messages are constants so
 * `localizeZodIssue` can translate them, and both carry a word `matchStatus`
 * recognises — the update path throws this as a plain Error rather than a
 * ZodError, and an unrecognised message there answers 500 where it means 400.
 */
export const llmBaseUrlIssue = (
  provider?: string | null,
  baseUrl?: string | null
): string | null => {
  if (requiresLlmBaseUrl(provider) && !baseUrl) {
    return constants.LLM_BASE_URL_REQUIRED_MESSAGE;
  }
  if (baseUrl && !isAllowedLlmBaseUrl(baseUrl)) {
    return constants.LLM_BASE_URL_INVALID_MESSAGE;
  }
  return null;
};
