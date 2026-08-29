import { Context } from 'hono';
import { utils } from '@ganju/utils';
import { SDK_WORKER_MODULE } from '@ganju/sdk/workerModule';

// types
import type { EnvSource } from '@ganju/utils';
import type { AppEnv } from '../types';

// Everything that only talks to the Cloudflare REST API needs the environment
// and nothing else. Typed as the narrower thing so the sweep, which runs from
// the cron handler and has no request, can call the same helpers a route does.
type CustomCodeEnv = EnvSource;

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
const readConfig = (c: CustomCodeEnv): DispatchConfig => {
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
   * The dispatch-namespace name this upload went to, minted here and used
   * nowhere else until the caller records it. Every other operation on this
   * script — the health check, a test invocation, a delete — takes it as an
   * argument rather than deriving it, because there is nothing left to derive
   * it from.
   */
  scriptName: string;
  /**
   * What the uploaded edition answers when asked which code it is running — the
   * digest of the bytes this call put in the namespace.
   *
   * No longer the thing a wait is spent on: a minted name has no previous
   * edition to be confused with. It is kept as an assertion, because it is the
   * only thing that can ever detect this class of bug again, and because under
   * per-upload names a mismatch is not a race to wait out — it means something
   * is already serving under a name we just minted.
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
 * Upload one version's bundle into the dispatch namespace, under a name no
 * upload has used before.
 *
 * The name is minted here rather than derived from the artifact, and that is the
 * load-bearing part. Uploading over an existing name is not read-your-writes:
 * measured against the deployed namespace, replacing a script served the
 * previous edition for as long as 41 seconds, while a name never used before
 * answered in 2. Publishing to a fresh name every time removes the race instead
 * of waiting it out, which is why the caller records the returned name — it is
 * the only thing that knows where these bytes went.
 *
 * A caller may pass `scriptName` to re-deploy to a name it already owns. Only
 * rollback does, and only when the script it wants is gone from the namespace.
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
    // A test run rather than a publish: mints a `…_preview_<hex>` name and
    // carries a token the broker accepts for a version that is not active.
    // Nothing dispatches to a preview name, so a test cannot disturb what MCP
    // clients are being served.
    preview?: boolean;
    // Deploy to this exact name instead of minting one. Rollback's fallback,
    // for the case where the version it is restoring has a recorded name whose
    // script the sweep has since collected.
    scriptName?: string;
  }
): Promise<DeployedScript> => {
  const config = readConfig(c);
  const scriptName =
    input.scriptName ??
    (input.preview
      ? utils.customCodePreviewUploadName(input.artifactId)
      : utils.customCodeUploadName(input.artifactId));

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
      // which edition is answering.
      //
      // It no longer has a race to resolve: this upload goes to a name nothing
      // has ever used, so the only script that can answer is this one. It stays
      // because it is the only way to ever notice otherwise, and because it
      // costs one plain-text binding to keep. Two uploads of identical bytes
      // share a marker, which is the one case where not telling them apart is
      // the right answer — and they no longer share a name.
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
    scriptName,
    edition
  };
};

/**
 * Ask the freshly uploaded script which tools it exports, and check that against
 * what the version's manifest declares.
 *
 * The manifest and the bundle arrive through different endpoints and nothing
 * before this point connects them, so "the manifest says `lookup-order`, the code
 * exports `lookupOrder`" would otherwise survive to the first customer tool call,
 * where it surfaces as a tool that exists in tools/list and fails every time it
 * is used. Catching it here costs one dispatch at publish time.
 *
 * This used to be a twenty-second wait as well as a check. It is not any more.
 * Uploading over an existing name is not read-your-writes, so the old script
 * could answer this question on the new script's behalf — and a deploy that
 * renamed nothing got the right answer from the wrong code and published it. The
 * name is now minted per upload, so the only script that can answer is the one
 * just written, and the two failures separate cleanly:
 *
 *  - Nothing answers yet. A brand-new name takes a moment to register — ~2s
 *    measured — so this retries briefly.
 *  - Something answers as a different edition. Under a name nothing has ever
 *    used, that is not propagation and waiting cannot fix it. It fails.
 *
 * Throws with a legible message on any failure; the caller records it on
 * `version.error` and refuses the publish. Refusing is now cheap: the rejected
 * bundle sits under a name nothing points at, and whatever was live is still
 * live and untouched.
 */
export const smokeTestCustomCodeScript = async (
  c: Context<AppEnv>,
  input: {
    artifactId: string;
    // The name `deployCustomCodeScript` uploaded to. Passed rather than derived
    // — deriving it is the thing this change removed.
    scriptName: string;
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
  }
): Promise<void> => {
  const dispatcher = c.env.DISPATCH;
  if (!dispatcher) {
    throw new Error(
      'The dispatch namespace binding is missing, so the uploaded script cannot be verified.'
    );
  }

  const deadline = Date.now() + utils.constants.CUSTOM_CODE_REGISTER_TIMEOUT_MS;
  // What the last attempt saw, and the whole content of the timeout message.
  let waitingOn = 'the script has not answered yet';

  for (;;) {
    const probed = await probeHealth(
      dispatcher,
      input.scriptName,
      input.artifactId,
      input.allowedHosts
    );

    if (probed.answered) {
      // A null edition means a script built before the marker existed. Under a
      // minted name that cannot be a stale answer — nothing else has ever been
      // deployed here — so it is accepted rather than waited on, and the export
      // check is the same one either way.
      if (probed.edition !== null && probed.edition !== input.edition) {
        throw new Error(
          `The deployed script reports a different edition (${probed.edition}) than the one just uploaded. This name should have been unused; something else is serving it.`
        );
      }

      assertExports(input.declaredTools, probed.tools);
      return;
    }

    // Nothing is serving this name yet, which is what registering a new name
    // looks like from here. It is the one case worth retrying, and it is short.
    waitingOn = probed.reason;

    if (Date.now() >= deadline) {
      // Carries its own status: an unmatched message is replaced with
      // "Internal Server Error" by the central handler, and this one is the
      // whole value of the failure — it tells the reader their code is fine and
      // to try again. 503 is what "not ready yet, retry" means.
      throw Object.assign(
        new Error(
          `The uploaded script is not being served yet — ${waitingOn}. This is the namespace registering a new script, not your code: publish again in a moment.`
        ),
        { status: 503 as const }
      );
    }

    await new Promise(resolve =>
      setTimeout(resolve, utils.constants.CUSTOM_CODE_REGISTER_INTERVAL_MS)
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
    scriptName: string;
    toolName: string;
    args: Record<string, unknown>;
    allowedHosts: string[];
    timeoutMs: number;
  }
): Promise<CustomCodeRunResult> => {
  const dispatcher = c.env.DISPATCH;
  if (!dispatcher) {
    throw new Error(
      'The dispatch namespace binding is missing, so this version cannot be run.'
    );
  }

  const { scriptName } = input;
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
 * Remove one script from the dispatch namespace, by name.
 *
 * Called to clean up a preview script after a test run, to drop every script an
 * artifact owns when its custom-code tool is uninstalled, and by the sweep. A
 * 404 is success: the script may never have been deployed, and failing because
 * the thing being removed is already gone would leave a row undeletable.
 */
export const deleteCustomCodeScript = async (
  c: CustomCodeEnv,
  scriptName: string
): Promise<void> => {
  const config = readConfig(c);

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

/**
 * Whether a script is currently in the namespace.
 *
 * Rollback's question. Once each version owns a name, rolling back is usually
 * just moving `activeVersionId` — the target's script is still deployed and
 * nothing has to be uploaded. That is only true while the sweep has not
 * collected it, so this is what decides between moving the pointer and
 * re-uploading the stored bundle.
 *
 * One trap, and it is the one that made an early probe report every deleted
 * script as still deployed: a GET on an absent dispatch script answers **200**
 * with `result.script: null`, not 404. The status alone says nothing.
 */
export const customCodeScriptExists = async (
  c: CustomCodeEnv,
  scriptName: string
): Promise<boolean> => {
  const config = readConfig(c);

  const response = await fetch(scriptUrl(config, scriptName), {
    headers: { Authorization: `Bearer ${config.apiToken}` }
  });

  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(
      `The deployed script could not be read — ${await describeFailure(response)}`
    );
  }

  const body = (await response.json().catch(() => null)) as CloudflareResponse<{
    script?: unknown;
    id?: string;
  } | null> | null;

  const result = body?.result;
  if (!result) return false;

  return 'script' in result ? result.script !== null : !!result.id;
};

/**
 * Every script name in the dispatch namespace, with when it was last modified.
 *
 * The sweep's input. Paged, because the namespace holds one script per *upload*
 * now rather than one per artifact, so the list grows with deploy activity until
 * the sweep catches up with it.
 */
export const listCustomCodeScripts = async (
  c: CustomCodeEnv
): Promise<Array<{ name: string; modifiedAt: Date | null }>> => {
  const config = readConfig(c);
  const collected: Array<{ name: string; modifiedAt: Date | null }> = [];
  let cursor: string | null = null;

  for (;;) {
    const url = new URL(
      `${CLOUDFLARE_API_BASE}/accounts/${config.accountId}/workers/dispatch/namespaces/${config.namespace}/scripts`
    );
    url.searchParams.set('per_page', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const response: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.apiToken}` }
    });

    if (!response.ok) {
      throw new Error(
        `The dispatch namespace could not be listed — ${await describeFailure(response)}`
      );
    }

    const body = (await response.json()) as CloudflareResponse<
      Array<{ id?: string; script_name?: string; modified_on?: string }>
    > & {
      result_info?: { cursor?: string };
    };

    for (const script of body.result ?? []) {
      const name = script.script_name || script.id;
      if (!name) continue;
      const modified = script.modified_on ? new Date(script.modified_on) : null;
      collected.push({
        name,
        modifiedAt:
          modified && !Number.isNaN(modified.getTime()) ? modified : null
      });
    }

    cursor = body.result_info?.cursor || null;
    if (!cursor) return collected;
  }
};
