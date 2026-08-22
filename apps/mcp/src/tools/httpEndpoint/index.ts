import { HttpEndpointToolConfig, utils } from '@ganju/utils';

import { interpolate } from '../../utils/interpolate';
import { ToolDefinition } from '../types';

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const text = (value: string): ToolResult => ({
  content: [{ type: 'text', text: value }]
});

// A failure the tool handled: the model reads the text, and a client that
// distinguishes error results renders it as one.
//
// These used to come back as ordinary text. Marking them is what the two other
// proxied definitions already do — custom-code sets it, mcp-proxy forwards it —
// and it is what makes a declared outputSchema workable: without it, every HTTP
// failure would trip the "declared an output schema but returned no object"
// guard in the boot loop and be reported as the wrong problem.
const fail = (value: string): ToolResult => ({
  content: [{ type: 'text', text: value }],
  isError: true
});

// The resolved (decrypted) credential the controller hands to the dispatcher.
export interface ResolvedHttpCredential {
  secret: string;
  needsReauth: boolean;
}

/**
 * Validate one `artifact_tool.config` of definition `http-endpoint`. Returns
 * null (so the boot loop skips registration) when the required identity/request
 * fields are missing or malformed. All validation lives in the shared zod
 * schema; this just adapts safeParse to a nullable result.
 */
export const parseHttpEndpointConfig = (
  raw: unknown
): HttpEndpointToolConfig | null => {
  const result = utils.Schema.HTTP_ENDPOINT_CONFIG.safeParse(raw);
  return result.success ? result.data : null;
};

const hostAllowed = (hostname: string, allowedHosts?: string[]): boolean => {
  if (!allowedHosts || allowedHosts.length === 0) return true;
  const host = hostname.toLowerCase();
  return allowedHosts.some(
    allowed => host === allowed || host.endsWith(`.${allowed}`)
  );
};

const getByPath = (obj: unknown, path: string): unknown => {
  let cursor: unknown = obj;
  for (const segment of path.split('.')) {
    if (cursor === null || cursor === undefined) return undefined;
    if (Array.isArray(cursor) && /^\d+$/.test(segment)) {
      cursor = cursor[Number(segment)];
    } else if (typeof cursor === 'object') {
      cursor = (cursor as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return cursor;
};

const capBytes = (body: ArrayBuffer, maxBytes: number): string => {
  const truncated = body.byteLength > maxBytes;
  const slice = truncated ? body.slice(0, maxBytes) : body;
  const decoded = new TextDecoder().decode(slice);
  return truncated ? `${decoded}\n…[truncated]` : decoded;
};

/**
 * Execute one configured HTTP endpoint with the model-supplied args. Returns a
 * tool result; failures are returned as `Error: …` text content (not thrown)
 * so the model gets an actionable message per the tool convention. The secret
 * (if any) is applied just before the fetch and never logged.
 */
export const executeHttpEndpoint = async (
  config: HttpEndpointToolConfig,
  args: Record<string, unknown>,
  credential: ResolvedHttpCredential | null
): Promise<ToolResult> => {
  // Auth precondition
  if (config.auth.kind !== utils.constants.HTTP_ENDPOINT_AUTH_KIND_NONE) {
    if (!credential) {
      return fail(
        `Error: "${config.name}" is not connected. Add its credential on the Tools page.`
      );
    }
    if (credential.needsReauth) {
      return fail(
        `Error: the credential for "${config.name}" needs to be re-authorized. Open the Tools page and re-link it.`
      );
    }
  }

  // Build the URL (placeholders percent-encoded), then attach query params
  let url: URL;
  try {
    url = new URL(interpolate(config.url, args, 'url'));
  } catch {
    return fail('Error: the configured URL is invalid after interpolation.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return fail('Error: only http and https URLs are allowed.');
  }
  for (const q of config.query) {
    url.searchParams.append(q.name, interpolate(q.value, args, 'raw'));
  }

  // SSRF screen the final host. allowedHosts (if set) takes precedence, and
  // private/loopback ranges are rejected regardless.
  if (!hostAllowed(url.hostname, config.allowedHosts)) {
    return fail(`Error: host "${url.hostname}" is not in the allowed list.`);
  }
  if (utils.isBlockedHost(url.hostname)) {
    return fail(
      `Error: host "${url.hostname}" is not allowed (private or loopback address).`
    );
  }

  // Headers + auth.
  const headers = new Headers();
  for (const h of config.headers) {
    headers.set(h.name, interpolate(h.value, args, 'header'));
  }
  const secret = credential?.secret ?? '';
  switch (config.auth.kind) {
    case utils.constants.HTTP_ENDPOINT_AUTH_KIND_BEARER:
    case utils.constants.HTTP_ENDPOINT_AUTH_KIND_OAUTH:
      headers.set('Authorization', `Bearer ${secret}`);
      break;
    case utils.constants.HTTP_ENDPOINT_AUTH_KIND_BASIC:
      headers.set('Authorization', `Basic ${utils.utf8ToBase64(secret)}`);
      break;
    case utils.constants.HTTP_ENDPOINT_AUTH_KIND_API_KEY:
      if (config.auth.in === 'query') {
        url.searchParams.append(config.auth.name, secret);
      } else {
        headers.set(config.auth.name, secret);
      }
      break;
    default:
      break;
  }

  // Body
  let body: string | undefined;
  const hasBody =
    config.method !== utils.constants.HTTP_ENDPOINT_METHOD_GET &&
    config.body.kind !== utils.constants.HTTP_ENDPOINT_BODY_KIND_NONE;
  if (hasBody) {
    if (config.body.kind === utils.constants.HTTP_ENDPOINT_BODY_KIND_JSON) {
      body = interpolate(config.body.template, args, 'json');
      try {
        JSON.parse(body);
      } catch {
        return fail('Error: the request body template is not valid JSON.');
      }
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
    } else if (
      config.body.kind === utils.constants.HTTP_ENDPOINT_BODY_KIND_FORM
    ) {
      body = interpolate(config.body.template, args, 'url');
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/x-www-form-urlencoded');
      }
    } else {
      body = interpolate(config.body.template, args, 'raw');
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'text/plain; charset=utf-8');
      }
    }
    if (
      new TextEncoder().encode(body).byteLength >
      utils.constants.HTTP_ENDPOINT_MAX_REQUEST_BYTES
    ) {
      return fail('Error: the request body exceeds the 1MB limit.');
    }
  }

  // Fire with a timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: config.method,
      headers,
      body,
      redirect: 'follow',
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === 'AbortError') {
      return fail(`Error: request timed out after ${config.timeoutMs}ms.`);
    }
    return fail(
      `Error: request failed — ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  clearTimeout(timer);

  // Read + cap the body
  const buffer = await response.arrayBuffer();
  const rawText = capBytes(buffer, config.response.maxBytes);

  // Success check
  const isSuccess = config.response.successStatus
    ? config.response.successStatus.includes(response.status)
    : response.status >= 200 && response.status < 300;
  if (!isSuccess) {
    return fail(`Error: HTTP ${response.status} — ${rawText}`);
  }

  // Shape the response
  const wantsJson =
    config.response.contentType ===
      utils.constants.HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_JSON ||
    (config.response.contentType ===
      utils.constants.HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_AUTO &&
      (response.headers.get('content-type') || '').includes('json'));

  if (wantsJson) {
    try {
      const parsed = JSON.parse(rawText);
      const extracted = config.response.jsonPath
        ? getByPath(parsed, config.response.jsonPath)
        : parsed;
      if (extracted === undefined) {
        return fail(
          `No data found at path "${config.response.jsonPath}". Full response:\n${rawText}`
        );
      }
      // structuredContent only when the endpoint declared an output schema.
      // MCP pairs the two, and attaching it to an endpoint that promised
      // nothing would hand every existing install a second representation of
      // its response that nothing asked for. An array or a scalar still
      // reaches the model as text — `structuredContent` is defined as an
      // object.
      const structured =
        config.outputSchema &&
        extracted &&
        typeof extracted === 'object' &&
        !Array.isArray(extracted)
          ? (extracted as Record<string, unknown>)
          : undefined;

      return {
        ...text(
          typeof extracted === 'string'
            ? extracted
            : JSON.stringify(extracted, null, 2)
        ),
        ...(structured ? { structuredContent: structured } : {})
      };
    } catch {
      // Fall through to raw text if the body wasn't valid JSON after all.
    }
  }

  return text(rawText);
};

// `http-endpoint` is never dispatched through the registry: the MCP controller
// registers one derived tool per artifact_tool row at boot and handles the call
// there. This entry exists so toolRegistry.get('http-endpoint') resolves (the
// boot loop expects every definition key to be present), but a direct call is a
// misconfiguration.
export const httpEndpoint: ToolDefinition = {
  title: 'HTTP Endpoint',
  description:
    'Internal: parent definition for user-configured HTTP endpoint tools. Each installed instance registers as its own named tool.',
  schema: { type: 'object', properties: {} },
  handler: async () =>
    text(
      'Error: http-endpoint is a parent definition and is not directly callable.'
    )
};
