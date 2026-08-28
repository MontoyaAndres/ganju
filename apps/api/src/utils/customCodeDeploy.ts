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
  /**
   * What the uploaded edition answers when asked which code it is running —
   * the digest of the bytes this call put in the namespace. Handed to
   * `smokeTestCustomCodeScript` so the wait is for these bytes and not merely
   * for this version id.
   */
  edition: string;
}

// SHA-256 of the uploaded bytes, hex-encoded. Also what a version row stores as
// `sourceHash`, so the marker a running script reports and the hash recorded
// against its source are the same number by construction.
export const hashBundle = async (bundle: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bundle);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

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

  const edition = await hashBundle(input.bundle);

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
      },
      // Not a secret — the digest of these bytes, so the health probe can say
      // which edition is answering. Uploading a script is not read-your-writes,
      // and tool names cannot tell two editions apart when a deploy renames
      // nothing.
      //
      // The bytes and not the version id: a draft is re-uploaded in place, so a
      // version id is the same string across every edit of the same draft and
      // could never distinguish this upload from the one before it. Two uploads
      // of identical bytes do share a marker, which is the one case where not
      // telling them apart is the right answer.
      {
        type: 'plain_text',
        name: utils.constants.CUSTOM_CODE_BINDING_VERSION,
        text: edition
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
    token,
    edition
  };
};

/**
 * Ask the freshly uploaded script what it is, until the answer is the edition we
 * just wrote, then check that it exports what the manifest declares.
 *
 * Two problems in one wait, and the second is why the first has to be solved.
 *
 * The manifest and the bundle are uploaded separately and nothing before this
 * point connects them, so "the manifest says `lookup-order`, the code exports
 * `lookupOrder`" would otherwise survive to the first customer tool call, where
 * it surfaces as a tool that exists in tools/list and fails every time it is
 * used. Catching it here costs one dispatch at publish time.
 *
 * But uploading into a dispatch namespace is not read-your-writes: dispatching
 * to the name immediately afterwards can reach the previous edition. That was
 * invisible for as long as the only question asked was "which tools do you
 * export", because a deploy that renames nothing gets the right answer from the
 * wrong script — and then publishes, leaving the customer running code they did
 * not deploy until propagation caught up. Only a rename made it visible, as a
 * confusing "the bundle does not export …".
 *
 * So the script carries the digest of the bytes it was uploaded from, and this
 * waits for its own before it checks anything. A brand-new script answers on the
 * first try, which is why every probe against a throwaway artifact had always
 * passed.
 *
 * Throws with a legible message on any failure; the caller records it on
 * `version.error` and refuses the publish.
 */
export const smokeTestCustomCodeScript = async (
  c: Context<AppEnv>,
  input: {
    artifactId: string;
    /**
     * The digest `deployCustomCodeScript` returned for the upload being
     * verified. Taken from that call rather than from the version row so it
     * always describes the bytes actually sent.
     */
    edition: string;
    declaredTools: string[];
    // Passed through to the outbound worker so the probe runs under the same
    // egress rules a real call would. The namespace binding declares these
    // parameters as required, so a `.get()` that omits them fails outright with
    // "Missing one or more required arguments to worker" — the probe is not
    // exempt just because it never reaches user code.
    allowedHosts: string[];
    preview?: boolean;
  }
): Promise<void> => {
  const dispatcher = c.env.DISPATCH;
  if (!dispatcher) {
    throw new Error(
      'The dispatch namespace binding is missing, so the uploaded script cannot be verified.'
    );
  }

  const scriptName = input.preview
    ? utils.customCodePreviewScriptName(input.artifactId)
    : utils.customCodeScriptName(input.artifactId);

  const deadline = Date.now() + utils.constants.CUSTOM_CODE_SMOKE_TIMEOUT_MS;
  // What the last attempt saw, and the whole content of the timeout message.
  // "still answering as an older edition" and "nothing is answering yet" are
  // both propagation, and the reader is owed which one they are waiting on.
  let waitingOn = 'the script has not answered yet';
  // The tools an unmarked script reported, kept for the fallback below.
  let unmarkedTools: string[] | null = null;

  for (;;) {
    const probed = await probeHealth(
      dispatcher,
      scriptName,
      input.artifactId,
      input.allowedHosts
    );

    if (probed.answered) {
      // The edition answering is the one we uploaded, so what it exports is
      // what this version ships.
      if (probed.edition === input.edition) {
        assertExports(input.declaredTools, probed.tools);
        return;
      }

      if (probed.edition === null) {
        // A script built before the marker existed cannot say what it is, and
        // waiting on it forever would turn every publish over one into a
        // timeout. But the upload we are verifying always carries a marker, so
        // an unmarked answer is by definition the *previous* edition — treating
        // it as the answer immediately would check the very script this wait
        // exists to see past. So it waits like any other stale edition, and the
        // name check it falls back to is kept for the deadline, where it is the
        // best available answer rather than the first one.
        unmarkedTools = probed.tools;
        waitingOn =
          'the dispatcher still answers with an edition too old to say which it is';
      } else {
        unmarkedTools = null;
        waitingOn = `the dispatcher still answers with an older edition (${probed.edition})`;
      }
    } else {
      // Nothing is serving this name yet. On a first deploy that is the shape
      // propagation takes — the namespace has no script to dispatch to — so it
      // waits exactly like a stale edition does rather than failing a publish
      // for being early.
      unmarkedTools = null;
      waitingOn = probed.reason;
    }

    if (Date.now() >= deadline) {
      if (unmarkedTools) {
        assertExports(input.declaredTools, unmarkedTools);
        return;
      }

      // Carries its own status: an unmatched message is replaced with
      // "Internal Server Error" by the central handler, and this one is the
      // whole value of the failure — it tells the reader their code is fine and
      // to try again. 503 is what "not ready yet, retry" means.
      throw Object.assign(
        new Error(
          `The uploaded script is not being served yet — ${waitingOn}. This is propagation, not your code: publish again in a moment.`
        ),
        { status: 503 as const }
      );
    }

    await new Promise(resolve =>
      setTimeout(resolve, utils.constants.CUSTOM_CODE_SMOKE_INTERVAL_MS)
    );
  }
};

/**
 * Every declared tool name has to be a key the script actually exports.
 *
 * Shared by both ways out of the wait above — the edition matched, or the
 * edition cannot be known — because the check is the same one either way and
 * two copies of an error message is two chances for them to drift apart.
 */
const assertExports = (declared: string[], exported: string[]): void => {
  const missing = declared.filter(name => !exported.includes(name));
  if (missing.length === 0) return;

  throw new Error(
    `The bundle does not export ${missing
      .map(name => `"${name}"`)
      .join(
        ', '
      )}, which this version declares. Every declared tool name must be a key in the object you pass to createHandler.`
  );
};

/**
 * The answer to one health call, with "nothing is there yet" as a value rather
 * than an exception.
 *
 * That distinction is the whole point of the type. A script that has not
 * propagated cannot be dispatched to at all, and treating that as a failed
 * publish would reject every deploy that asked a moment too early — the
 * dispatch error and the stale edition are the same race, so they have to wait
 * the same way. Anything that *does* answer and answers wrongly is a real
 * failure and still throws: something is serving, and it is not an SDK script.
 */
type ProbeResult =
  | { answered: true; tools: string[]; edition: string | null }
  | { answered: false; reason: string };

/**
 * One health call. Separated so the wait above reads as a loop over a question
 * rather than as transport.
 */
const probeHealth = async (
  dispatcher: NonNullable<AppEnv['Bindings']['DISPATCH']>,
  scriptName: string,
  artifactId: string,
  allowedHosts: string[]
): Promise<ProbeResult> => {
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
          [utils.constants.CUSTOM_CODE_OUTBOUND_PARAM_ARTIFACT_ID]: artifactId,
          [utils.constants.CUSTOM_CODE_OUTBOUND_PARAM_ALLOWED_HOSTS]:
            JSON.stringify(allowedHosts)
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
    return {
      answered: false,
      reason: `the script could not be started yet — ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }

  if (!response.ok) {
    throw new Error(
      `The uploaded script returned ${response.status} to the health check. It must be built with @ganju/sdk.`
    );
  }

  const body = (await response.json().catch(() => null)) as {
    output?: { tools?: unknown; version?: unknown };
  } | null;

  const tools = Array.isArray(body?.output?.tools)
    ? (body.output.tools as unknown[]).filter(
        (name): name is string => typeof name === 'string'
      )
    : null;

  if (!tools) {
    throw new Error(
      'The uploaded script did not answer the health check. It must be built with @ganju/sdk.'
    );
  }

  const edition = body?.output?.version;
  return {
    answered: true,
    tools,
    edition: typeof edition === 'string' ? edition : null
  };
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
