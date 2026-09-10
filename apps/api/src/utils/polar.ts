import { utils } from '@ganju/utils';

import type { EnvSource } from '@ganju/utils';

const { constants } = utils;

// The slice of Polar's subscription object the webhook actually reads. Periods
// and timestamps are ISO strings, not unix seconds.
export type PolarSubscription = {
  id: string;
  status: string;
  product_id?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  created_at?: string | null;
  modified_at?: string | null;
  customer_id?: string | null;
  // Carries our own organization id as `external_id` on every delivery, which
  // is what makes the pre-created customer unnecessary.
  customer?: { id: string; external_id?: string | null } | null;
  metadata?: Record<string, unknown> | null;
};

export type PolarWebhookEvent = {
  type: string;
  data: PolarSubscription;
};

// Polar accepts string | number | boolean metadata values; every meter of ours
// sums a number under one key.
export type PolarMeterEvent = {
  name: string;
  external_customer_id: string;
  // Our own id for this increment. Polar deduplicates on it and reports the
  // repeat back as `duplicates` rather than billing it twice.
  external_id?: string;
  metadata: Record<string, string | number | boolean>;
};

export type PolarIngestResult = { inserted: number; duplicates: number };

export type PolarClient = {
  createCheckout: (params: {
    productId: string;
    organizationId: string;
    customerEmail?: string;
    successUrl: string;
    locale: string;
  }) => Promise<{ url: string }>;
  createCustomerSession: (
    organizationId: string,
    returnUrl: string
  ) => Promise<{ customerPortalUrl: string }>;
  ingestEvent: (event: PolarMeterEvent) => Promise<PolarIngestResult>;
  revokeSubscription: (subscriptionId: string) => Promise<void>;
};

/**
 * The Polar client for this environment, or `null` when billing is unconfigured.
 *
 * `null` is not a failure — it is the state production runs in until the access
 * token is set, and every caller is written against it: the Free tier works
 * whole, the metering sweep returns early, and plan resolution never reaches the
 * provider at all.
 *
 * No SDK. Three REST calls and a revoke do not justify a generated client in a
 * Worker bundle, and the raw-fetch shape is what the rest of these utils use.
 */
export const createPolar = (source: EnvSource): PolarClient | null => {
  const token = utils.getEnv(source, 'POLAR_ACCESS_TOKEN');
  if (!token) return null;

  const base =
    utils.getEnv(source, 'POLAR_SERVER') === constants.POLAR_SERVER_PRODUCTION
      ? constants.POLAR_API_BASE
      : constants.POLAR_SANDBOX_API_BASE;

  const request = async <T>(
    method: 'POST' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });

    // The message matters: a rejected event or a bad product id is logged by the
    // caller and read by whoever is wondering why a rate never billed.
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Polar ${path} failed (${response.status}): ${detail}`);
    }

    // A revoke returns a body we don't read; tolerate an empty one either way.
    return (await response.json().catch(() => ({}))) as T;
  };

  return {
    // One product carries the base price and all four metered prices, so there
    // are no line items to assemble and nothing to silently skip.
    createCheckout: async ({
      productId,
      organizationId,
      customerEmail,
      successUrl,
      locale
    }) => {
      const checkout = await request<{ url?: string }>(
        'POST',
        '/v1/checkouts/',
        {
          products: [productId],
          external_customer_id: organizationId,
          ...(customerEmail ? { customer_email: customerEmail } : {}),
          metadata: { organizationId },
          success_url: successUrl,
          locale
        }
      );
      if (!checkout.url) throw new Error('Polar checkout returned no URL');
      return { url: checkout.url };
    },

    createCustomerSession: async (organizationId, returnUrl) => {
      const session = await request<{ customer_portal_url?: string }>(
        'POST',
        '/v1/customer-sessions/',
        { external_customer_id: organizationId, return_url: returnUrl }
      );
      if (!session.customer_portal_url) {
        throw new Error('Polar customer session returned no portal URL');
      }
      return { customerPortalUrl: session.customer_portal_url };
    },

    // One event per call. The ingest endpoint takes an array, but answers with
    // `{inserted, duplicates}` and no per-event status — batching would make a
    // run all-or-nothing and let one rejected meter strand the marks of the
    // other three.
    ingestEvent: event =>
      request<PolarIngestResult>('POST', '/v1/events/ingest', {
        events: [event]
      }),

    // Immediate cancellation, which is what an organization deletion means.
    revokeSubscription: async subscriptionId => {
      await request('DELETE', `/v1/subscriptions/${subscriptionId}`);
    }
  };
};

// Standard Webhooks allows five minutes of clock drift either way.
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

const decodeSecret = (secret: string): Uint8Array => {
  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  try {
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    // Standard Webhooks specifies a base64 secret, but a dashboard that hands
    // out a plain one shouldn't fail closed on an encoding detail.
    return new TextEncoder().encode(raw);
  }
};

// Length-independent comparison: bail on a size mismatch, then OR the whole
// difference so a matching prefix takes exactly as long as a mismatched one.
const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * Verify a Standard Webhooks delivery against the endpoint secret.
 *
 * Hand-rolled on WebCrypto rather than taken from the `standardwebhooks`
 * package, which reaches for `node:crypto`. The signed content is
 * `{id}.{timestamp}.{body}`, HMAC-SHA256 under the decoded secret, compared
 * against the `v1,<signature>` entries in the signature header — a delivery may
 * carry several while a secret is being rotated, and matching any one of them is
 * a pass.
 *
 * Polar switched to this scheme for secrets created on or after 8 September
 * 2026; a secret generated for this endpoint is unambiguously one of those.
 */
export const verifyPolarWebhook = async (
  secret: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  payload: string
): Promise<boolean> => {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  // A replayed delivery is only interesting inside the tolerance window; a
  // non-numeric timestamp is not a delivery we can reason about at all.
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return false;
  const drift = Math.abs(Math.floor(Date.now() / 1000) - sentAt);
  if (drift > WEBHOOK_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    decodeSecret(secret) as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${payload}`)
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  return signature
    .split(' ')
    .some(entry => constantTimeEqual(entry.split(',')[1] ?? '', expected));
};
