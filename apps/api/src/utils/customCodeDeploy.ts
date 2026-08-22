import { Context } from 'hono';
import { utils } from '@ganju/utils';
import { SDK_WORKER_MODULE } from '@ganju/sdk/workerModule';

// types
import type { AppEnv } from '../types';

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

interface DispatchConfig {
  accountId: string;
  apiToken: string;
  namespace: string;
  brokerService: string;
  tokenSecret: string;
}

interface CloudflareResponse<T> {
  success: boolean;
  result?: T;
  errors?: Array<{ code: number; message: string }>;
}

/**
 * Read the five values a deploy needs, or explain precisely which one is
 * missing.
 *
 * Deliberately fails rather than degrading to a database-only publish. A publish
 * that flips `activeVersionId` without deploying anything advertises the
 * version's tools to every MCP client while there is nothing to dispatch to —
 * the same silent-orphan failure the removal checklist warns about, except
 * self-inflicted on every publish.
 */
const readConfig = (c: Context<AppEnv>): DispatchConfig => {
  const missing: string[] = [];
  const read = (name: string): string => {
    const value = utils.getEnv(c, name);
    if (!value) missing.push(name);
    return value || '';
  };

  const config: DispatchConfig = {
    accountId: read(utils.constants.CUSTOM_CODE_ACCOUNT_ID_ENV),
    apiToken: read(utils.constants.CUSTOM_CODE_API_TOKEN_ENV),
    namespace: read(utils.constants.CUSTOM_CODE_NAMESPACE_ENV),
    brokerService: read(utils.constants.CUSTOM_CODE_BROKER_SERVICE_ENV),
    tokenSecret: read(utils.constants.CUSTOM_CODE_TOKEN_SECRET_ENV)
  };

  if (missing.length > 0) {
    throw new Error(
      `Custom code is not configured on this deployment (missing ${missing.join(', ')}), so this version cannot be published.`
    );
  }

  return config;
};

const scriptUrl = (config: DispatchConfig, scriptName: string): string =>
  `${CLOUDFLARE_API_BASE}/accounts/${config.accountId}/workers/dispatch/namespaces/${config.namespace}/scripts/${scriptName}`;

const describeFailure = async (response: Response): Promise<string> => {
  const body = (await response
    .json()
    .catch(() => null)) as CloudflareResponse<unknown> | null;
  const first = body?.errors?.[0];
  if (first) return `${first.message} (code ${first.code})`;
  return `Cloudflare returned ${response.status}`;
};

export interface DeployedScript {
  scriptTag: string;
  token: string;
}

/**
 * Upload one version's bundle into the dispatch namespace as
 * `artifact_<artifactId>`, replacing whatever is deployed under that name.
 *
 * Two bindings are injected here and nowhere else:
 *
 *  - `GANJU_TOOL_TOKEN`, freshly minted for this artifact + version. Minting on
 *    every upload is what rotates it: the broker only honours a token whose
 *    version is the artifact's active one, so the previous script's credential
 *    dies with the publish rather than outliving the code it belonged to.
 *  - `GANJU_BROKER`, a service binding. It is the only way out of the isolate
 *    that isn't screened by the outbound worker, and it exposes eight routes.
 *
 * `limits.cpu_ms` is set per script rather than per namespace because it is the
 * technical ceiling that bounds adversarial cost, and because a ceiling set per
 * script can be raised for one customer without raising it for every customer.
 */
export const deployCustomCodeScript = async (
  c: Context<AppEnv>,
  input: {
    artifactId: string;
    versionId: string;
    bundle: ArrayBuffer;
    // A test run rather than a publish: uploads to `artifact_<id>_preview` and
    // carries a token the broker accepts for a version that is not active.
    // Nothing dispatches to that name, so a test cannot disturb what MCP
    // clients are being served.
    preview?: boolean;
  }
): Promise<DeployedScript> => {
  const config = readConfig(c);
  const scriptName = input.preview
    ? utils.customCodePreviewScriptName(input.artifactId)
    : utils.customCodeScriptName(input.artifactId);

  const token = await utils.mintCustomCodeToken(
    {
      artifactId: input.artifactId,
      versionId: input.versionId,
      ...(input.preview
        ? {
            preview: true,
            ttlMs: utils.constants.CUSTOM_CODE_PREVIEW_TOKEN_TTL_MS
          }
        : {})
    },
    config.tokenSecret
  );

  const metadata = {
    main_module: utils.constants.CUSTOM_CODE_MAIN_MODULE,
    compatibility_date: utils.constants.CUSTOM_CODE_COMPATIBILITY_DATE,
    // No nodejs_compat: user code gets the plain Workers runtime. Widening it
    // would widen the sandbox for every customer at once.
    compatibility_flags: [],
    limits: { cpu_ms: utils.constants.CUSTOM_CODE_SCRIPT_CPU_MS },
    bindings: [
      {
        type: 'secret_text',
        name: utils.constants.CUSTOM_CODE_BINDING_TOKEN,
        text: token
      },
      {
        type: 'service',
        name: utils.constants.CUSTOM_CODE_BINDING_BROKER,
        service: config.brokerService
      }
    ]
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );

  // A dashboard project is stored as an envelope of files and uploaded as one
  // module per file, so `index.js` can import `./lib/orders.js` and the runtime
  // resolves it here — the same mechanism that has always carried the SDK. A CLI
  // bundle decodes to null and stays exactly one module, because that is what a
  // bundle is.
  const files = utils.decodeProject(new TextDecoder().decode(input.bundle)) ?? {
    [utils.constants.CUSTOM_CODE_MAIN_MODULE]: input.bundle
  };

  for (const [path, content] of Object.entries(files)) {
    form.append(
      path,
      new Blob([content as string | ArrayBuffer], {
        type: 'application/javascript+module'
      }),
      path
    );
  }
  // The SDK travels as its own module rather than inlined, which is what lets a
  // dashboard-authored script be deployed exactly as typed: it imports
  // './ganju-sdk.js' and the runtime resolves it here, so nothing stands between
  // the editor's text and the running Worker. Attached unconditionally — a CLI
  // bundle that already inlined the SDK never imports this one, and an unused
  // module costs a few KB against a 10MB ceiling.
  form.append(
    utils.constants.CUSTOM_CODE_SDK_MODULE,
    new Blob([SDK_WORKER_MODULE], {
      type: 'application/javascript+module'
    }),
    utils.constants.CUSTOM_CODE_SDK_MODULE
  );

  const response = await fetch(scriptUrl(config, scriptName), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${config.apiToken}` },
    body: form
  });

  if (!response.ok) {
    throw new Error(
      `The script could not be deployed — ${await describeFailure(response)}`
    );
  }

  const body = (await response.json()) as CloudflareResponse<{
    id?: string;
    etag?: string;
  }>;

  return {
    // etag identifies the exact uploaded content; falling back to the script id
    // keeps scriptTag populated even if the API stops returning one.
    scriptTag: body.result?.etag || body.result?.id || scriptName,
    token
  };
};

/**
 * Ask a freshly uploaded script which tools it actually exports, and check that
 * against what the version's manifest declares.
 *
 * The manifest and the bundle are uploaded separately and nothing before this
 * point connects them, so "the manifest says `lookup-order`, the code exports
 * `lookupOrder`" survives all the way to the first customer tool call — where it
 * surfaces as a tool that exists in tools/list and fails every time it is used.
 * Catching it here costs one dispatch at publish time.
 *
 * Throws with a legible message on any failure; the caller records it on
 * `version.error` and refuses the publish.
 */
export const smokeTestCustomCodeScript = async (
  c: Context<AppEnv>,
  input: {
    artifactId: string;
    declaredTools: string[];
    // Passed through to the outbound worker so the probe runs under the same
    // egress rules a real call would. The namespace binding declares these
    // parameters as required, so a `.get()` that omits them fails outright with
    // "Missing one or more required arguments to worker" — the probe is not
    // exempt just because it never reaches user code.
    allowedHosts: string[];
  }
): Promise<void> => {
  const dispatcher = c.env.DISPATCH;
  if (!dispatcher) {
    throw new Error(
      'The dispatch namespace binding is missing, so the uploaded script cannot be verified.'
    );
  }

  const scriptName = utils.customCodeScriptName(input.artifactId);

  // Untyped so the Fetcher's own Response type flows through — the Workers and
  // DOM Response declarations are structurally different and annotating either
  // one here fights the other.
  let response;
  try {
    const script = dispatcher.get(
      scriptName,
      {},
      {
        outbound: {
          [utils.constants.CUSTOM_CODE_OUTBOUND_PARAM_ARTIFACT_ID]:
            input.artifactId,
          [utils.constants.CUSTOM_CODE_OUTBOUND_PARAM_ALLOWED_HOSTS]:
            JSON.stringify(input.allowedHosts)
        }
      }
    );
    response = await script.fetch(
      `${utils.constants.CUSTOM_CODE_INVOKE_ORIGIN}${utils.constants.CUSTOM_CODE_INVOKE_PATH}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: utils.constants.CUSTOM_CODE_HEALTH_TOOL,
          input: {}
        })
      }
    );
  } catch (error) {
    throw new Error(
      `The uploaded script could not be started — ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!response.ok) {
    throw new Error(
      `The uploaded script returned ${response.status} to the health check. It must be built with @ganju/sdk.`
    );
  }

  const body = (await response.json().catch(() => null)) as {
    output?: { tools?: unknown };
  } | null;
  const exported = Array.isArray(body?.output?.tools)
    ? (body.output.tools as unknown[]).filter(
        (name): name is string => typeof name === 'string'
      )
    : null;

  if (!exported) {
    throw new Error(
      'The uploaded script did not answer the health check. It must be built with @ganju/sdk.'
    );
  }

  const missing = input.declaredTools.filter(name => !exported.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `The bundle does not export ${missing.map(name => `"${name}"`).join(', ')}, which this version declares. Check the tool names in your manifest.`
    );
  }
};

export interface CustomCodeRunResult {
  output?: unknown;
  logs: string[];
  error?: string;
  durationMs: number;
}

/**
 * Call one tool on a deployed script and return what it answered.
 *
 * The MCP dispatcher does the same thing for a live call, and deliberately not
 * through this function: it shapes the answer into a tool result for a model,
 * caps the response, records usage, and turns every failure into `Error: …` text
 * because a model has nowhere else to read it. A test panel wants the opposite —
 * the raw output, the logs, and the error kept apart, so a person can see which
 * of the three they are looking at.
 *
 * The outbound parameters are the stored config's, so a test runs under the same
 * egress rules a real call would. A tool that is going to be refused a host in
 * production is refused it here.
 */
export const invokeCustomCodeScript = async (
  c: Context<AppEnv>,
  input: {
    artifactId: string;
    toolName: string;
    args: Record<string, unknown>;
    allowedHosts: string[];
    timeoutMs: number;
    preview?: boolean;
  }
): Promise<CustomCodeRunResult> => {
  const dispatcher = c.env.DISPATCH;
  if (!dispatcher) {
    throw new Error(
      'The dispatch namespace binding is missing, so this version cannot be run.'
    );
  }

  const scriptName = input.preview
    ? utils.customCodePreviewScriptName(input.artifactId)
    : utils.customCodeScriptName(input.artifactId);

  const startedAt = Date.now();

  let response;
  try {
    const script = dispatcher.get(
      scriptName,
      {},
      {
        outbound: {
          [utils.constants.CUSTOM_CODE_OUTBOUND_PARAM_ARTIFACT_ID]:
            input.artifactId,
          [utils.constants.CUSTOM_CODE_OUTBOUND_PARAM_ALLOWED_HOSTS]:
            JSON.stringify(input.allowedHosts)
        }
      }
    );
    // The deadline is a race rather than an AbortSignal on the request: a signal
    // has to cross the binding, and a dispatch namespace proxied to the account
    // — which is every local `wrangler dev` — refuses to serialize one. See
    // withDeadline.
    response = await utils.withDeadline(
      script.fetch(
        `${utils.constants.CUSTOM_CODE_INVOKE_ORIGIN}${utils.constants.CUSTOM_CODE_INVOKE_PATH}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tool: input.toolName, input: input.args })
        }
      ),
      input.timeoutMs
    );
  } catch (error) {
    if (utils.isDeadlineError(error)) {
      return {
        logs: [],
        error: `The run timed out after ${input.timeoutMs}ms.`,
        durationMs: Date.now() - startedAt
      };
    }
    throw new Error(
      `The script could not be started — ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const durationMs = Date.now() - startedAt;
  const raw = await response.text();

  if (!response.ok) {
    // A non-2xx is the runtime refusing to run the script — exceeded CPU, threw
    // on startup. A handled failure inside a tool comes back as a 200 with an
    // `error` field, and the two read very differently to whoever is debugging.
    return {
      logs: [],
      error: `The script failed to run (HTTP ${response.status}).`,
      durationMs
    };
  }

  let parsed;
  try {
    parsed = utils.Schema.CUSTOM_CODE_INVOKE_RESPONSE.safeParse(
      JSON.parse(raw)
    );
  } catch {
    return {
      logs: [],
      error: 'The script returned a response that is not valid JSON.',
      durationMs
    };
  }

  if (!parsed.success) {
    return {
      logs: [],
      error: 'The script returned an unexpected response shape.',
      durationMs
    };
  }

  const logs = parsed.data.logs.map(entry =>
    entry.level === 'log' ? entry.message : `[${entry.level}] ${entry.message}`
  );

  return parsed.data.error
    ? { logs, error: parsed.data.error, durationMs }
    : { logs, output: parsed.data.output, durationMs };
};

/**
 * Remove an artifact's script from the dispatch namespace.
 *
 * Called when the custom-code tool is uninstalled. A 404 is success: the script
 * may never have been deployed (a tool installed but never published), and
 * failing an uninstall because the thing being removed is already gone would
 * leave the row undeletable.
 */
export const deleteCustomCodeScript = async (
  c: Context<AppEnv>,
  artifactId: string,
  options: { preview?: boolean } = {}
): Promise<void> => {
  const config = readConfig(c);
  const scriptName = options.preview
    ? utils.customCodePreviewScriptName(artifactId)
    : utils.customCodeScriptName(artifactId);

  const response = await fetch(`${scriptUrl(config, scriptName)}?force=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${config.apiToken}` }
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(
      `The deployed script could not be removed — ${await describeFailure(response)}`
    );
  }
};
