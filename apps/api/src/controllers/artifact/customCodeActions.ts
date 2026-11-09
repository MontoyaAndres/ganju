import { and, desc, eq, lt } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import type { JsonSchema } from '@ganju/utils';
import { db } from '@ganju/db';
import type { Database } from '@ganju/db';

import {
  resolveCustomCodeTool,
  resolveCustomCodeToolReadOnly,
  readCustomCodeConfig,
  validateCustomCodeManifest,
  lintCustomCodeManifest,
  nextVersionNumber,
  loadVersionForTool,
  bundleSourceKey,
  activateVersionWithinQuota,
  assertVersionWithinQuota
} from './customCode';
import {
  hashBundle,
  deployCustomCodeScript,
  smokeTestCustomCodeScript,
  invokeCustomCodeScript,
  deleteCustomCodeScript,
  customCodeScriptExists,
  Plan
} from '../../utils';

import type { Bindings } from '../../types';

// What the routes and the builder share: each takes the values a route has
// already parsed, so both reach the same checks.
export interface CustomCodeCaller {
  env: Bindings;
  db: Database;
}

type Parsed<S extends { parseAsync: (...args: never[]) => Promise<unknown> }> =
  Awaited<ReturnType<S['parseAsync']>>;

type CreateVersionValues = Parsed<
  typeof utils.Schema.ARTIFACT_CUSTOM_CODE_CREATE_VERSION
>;
type UploadBundleValues = Parsed<
  typeof utils.Schema.ARTIFACT_CUSTOM_CODE_UPLOAD_BUNDLE
>;
type GetSourceValues = Parsed<
  typeof utils.Schema.ARTIFACT_CUSTOM_CODE_GET_SOURCE
>;
type TestVersionValues = Parsed<
  typeof utils.Schema.ARTIFACT_CUSTOM_CODE_TEST_VERSION
>;
type ActivateValues = Parsed<typeof utils.Schema.ARTIFACT_CUSTOM_CODE_PUBLISH>;
type ListVersionsValues = Parsed<
  typeof utils.Schema.ARTIFACT_CUSTOM_CODE_LIST_VERSIONS
>;
type ListLogsValues = Parsed<
  typeof utils.Schema.ARTIFACT_CUSTOM_CODE_LIST_LOGS
>;

export const createDraft = async (
  caller: CustomCodeCaller,
  currentValues: CreateVersionValues
) => {
  const dbInstance = caller.db;

  const result = await dbInstance.transaction(async tx => {
    const { artifact, tool } = await resolveCustomCodeTool(
      tx,
      currentValues.organizationId,
      currentValues.projectId
    );

    const { limits } = await Plan.getEffectivePlan(
      tx,
      currentValues.organizationId
    );
    validateCustomCodeManifest(currentValues.manifest, limits);

    // Config edits (allowedHosts, connections, timeoutMs) ride along with a new
    // version rather than getting their own endpoint — they describe how the
    // uploaded code is allowed to run, so they belong to the same review as the
    // code. activeVersionId is never taken from the client; only publish and
    // rollback move it.
    if (currentValues.config) {
      await tx
        .update(db.schema.artifactTool)
        .set({
          config: {
            ...currentValues.config,
            activeVersionId: readCustomCodeConfig(tool).activeVersionId ?? null
          }
        })
        .where(eq(db.schema.artifactTool.id, tool.id));
    }

    const [version] = await tx
      .insert(db.schema.artifactToolVersion)
      .values({
        artifactToolId: tool.id,
        version: await nextVersionNumber(tx, tool.id),
        status: utils.constants.CUSTOM_CODE_VERSION_STATUS_DRAFT,
        tools: currentValues.manifest.tools,
        createdByUserId: currentValues.userId
      })
      .returning();

    return { version, artifactId: artifact.id, toolId: tool.id };
  });

  // How the new functions read to a model, next to the rest of the server.
  // Returned, never enforced: `ganju build --strict` is where an author opts
  // into failing on them. Run after the commit, so a linter fault can cost
  // the warnings but never the version.
  const warnings = await lintCustomCodeManifest(
    dbInstance,
    result.artifactId,
    result.toolId,
    currentValues.manifest
  ).catch(error => {
    console.error(
      'Tool linter failed; returning the version without it',
      error
    );
    return [];
  });

  return { ...result.version, warnings };
};

export const storeBundle = async (
  caller: CustomCodeCaller,
  currentValues: UploadBundleValues,
  bundle: ArrayBuffer
) => {
  const bundleLimitMb =
    utils.constants.CUSTOM_CODE_MAX_BUNDLE_BYTES / (1024 * 1024);
  if (bundle.byteLength === 0) {
    throw new Error('Request body is required');
  }
  if (bundle.byteLength > utils.constants.CUSTOM_CODE_MAX_BUNDLE_BYTES) {
    throw new Error(`Bundle exceeds the ${bundleLimitMb}MB limit`);
  }

  // An editor upload is a project — an envelope of files, one module each. It is
  // validated here rather than at deploy time because a path the runtime refuses
  // should stop at the request that wrote it, not surface as a failed publish
  // days later. A CLI bundle decodes to null and passes through untouched.
  if (
    currentValues.sourceKind === utils.constants.CUSTOM_CODE_SOURCE_KIND_EDITOR
  ) {
    const files = utils.decodeProject(new TextDecoder().decode(bundle));
    if (files) utils.validateProjectFiles(files);
  }

  const sourceHash = await hashBundle(bundle);
  const dbInstance = caller.db;
  const bucket = caller.env.STORAGE_BUCKET;

  // Resolved in a transaction of its own, which may lock the artifact while it
  // adds the custom-code row; the bundle is stored after it commits, so a
  // slow upload never holds that lock.
  const { artifact, version } = await dbInstance.transaction(async tx => {
    const resolved = await resolveCustomCodeTool(
      tx,
      currentValues.organizationId,
      currentValues.projectId
    );
    return {
      artifact: resolved.artifact,
      version: await loadVersionForTool(
        tx,
        resolved.tool.id,
        currentValues.versionId
      )
    };
  });

  // A published version is what the MCP server is serving right now; swapping
  // its bundle would change behaviour with no version history and nothing to
  // roll back to. Upload a new draft instead.
  const draftOnly =
    'A bundle must be uploaded to a draft; this version is already published. Create a new version instead.';
  if (version.status !== utils.constants.CUSTOM_CODE_VERSION_STATUS_DRAFT) {
    throw new Error(draftOnly);
  }

  const key = bundleSourceKey(
    currentValues.organizationId,
    currentValues.projectId,
    artifact.id,
    version.version,
    sourceHash
  );

  if (bucket) {
    await bucket.put(key, bundle, {
      httpMetadata: { contentType: 'application/javascript' }
    });
  }

  // Still a draft when the row is written: a version published while the
  // bundle was uploading is refused rather than updated.
  const [updated] = await dbInstance
    .update(db.schema.artifactToolVersion)
    .set({
      sourceKey: key,
      sourceHash,
      sourceKind: currentValues.sourceKind,
      error: null
    })
    .where(
      and(
        eq(db.schema.artifactToolVersion.id, version.id),
        eq(
          db.schema.artifactToolVersion.status,
          utils.constants.CUSTOM_CODE_VERSION_STATUS_DRAFT
        )
      )
    )
    .returning();
  if (!updated) {
    // Published meanwhile, so nothing points at what was just stored — unless
    // the same bytes were published under the same key.
    if (bucket) {
      const [current] = await dbInstance
        .select({ sourceKey: db.schema.artifactToolVersion.sourceKey })
        .from(db.schema.artifactToolVersion)
        .where(eq(db.schema.artifactToolVersion.id, version.id))
        .limit(1);
      if (current?.sourceKey !== key) {
        await bucket.delete(key).catch(() => undefined);
      }
    }
    throw new Error(draftOnly);
  }

  // The draft's previous bundle, replaced by this one. Best-effort: a leftover
  // object costs storage, not correctness.
  if (bucket && version.sourceKey && version.sourceKey !== key) {
    await bucket.delete(version.sourceKey).catch(() => undefined);
  }

  return updated;
};

export const readSource = async (
  caller: CustomCodeCaller,
  currentValues: GetSourceValues
) => {
  const dbInstance = caller.db;

  const { tool } = await resolveCustomCodeToolReadOnly(
    dbInstance,
    currentValues.organizationId,
    currentValues.projectId
  );

  if (!tool) {
    throw new Error('Version not found');
  }

  const version = await loadVersionForTool(
    dbInstance,
    tool.id,
    currentValues.versionId
  );

  const editable =
    version.sourceKind === utils.constants.CUSTOM_CODE_SOURCE_KIND_EDITOR;

  const bucket = caller.env.STORAGE_BUCKET;

  // A CLI version with its readable source shows that, read-only, instead of
  // the bundle. The bundle is still what runs.
  const snapshotObject =
    version.sourceSnapshotKey && bucket
      ? await bucket.get(version.sourceSnapshotKey)
      : null;
  const snapshot = snapshotObject
    ? utils.decodeProject(await snapshotObject.text())
    : null;
  if (snapshot) {
    return {
      versionId: version.id,
      version: version.version,
      status: version.status,
      sourceKind: version.sourceKind,
      editable: false,
      snapshot: true,
      files: snapshot,
      source: snapshot[utils.constants.CUSTOM_CODE_MAIN_MODULE] ?? null,
      tools: version.tools
    };
  }

  const object =
    version.sourceKey && bucket ? await bucket.get(version.sourceKey) : null;
  const stored = object ? await object.text() : null;

  // Two shapes, one endpoint. `files` is what the explorer renders; `source`
  // stays the main module's text, because that is what a single-file version has
  // always been and what a CLI bundle still is.
  const files = stored ? utils.decodeProject(stored) : null;
  const main = utils.constants.CUSTOM_CODE_MAIN_MODULE;

  return {
    versionId: version.id,
    version: version.version,
    status: version.status,
    sourceKind: version.sourceKind,
    editable,
    snapshot: false,
    files: files ?? (stored === null ? null : { [main]: stored }),
    source: files ? (files[main] ?? null) : stored,
    tools: version.tools
  };
};

export const runTest = async (
  caller: CustomCodeCaller,
  currentValues: TestVersionValues
) => {
  const dbInstance = caller.db;

  const { artifact, tool } = await resolveCustomCodeToolReadOnly(
    dbInstance,
    currentValues.organizationId,
    currentValues.projectId
  );

  if (!tool) {
    throw new Error('Version not found');
  }

  Plan.assertCustomCodeAllowed(
    await Plan.getEffectivePlan(dbInstance, currentValues.organizationId)
  );

  // A test run is a dispatch into the customer's code on our compute, which is
  // the same thing the monthly ceiling exists to bound — so it is refused at the
  // ceiling like any other call, and counted like one below. It was briefly
  // neither: the reasoning was that billing someone for testing their own tool
  // before they ship it discourages the thing that keeps bad code out of
  // production. What that left was an unmetered path to the same compute, which
  // is worse than the thing it avoided — and against a million included calls, a
  // developer's test runs are noise.
  await Plan.assertToolCallBudget(dbInstance, currentValues.organizationId);

  const version = await loadVersionForTool(
    dbInstance,
    tool.id,
    currentValues.versionId
  );

  const entry = (
    version.tools as Array<{
      name: string;
      inputSchema?: unknown;
      outputSchema?: unknown;
    }>
  ).find(candidate => candidate.name === currentValues.tool);

  if (!entry) {
    throw new Error(
      `This version does not declare a tool named "${currentValues.tool}".`
    );
  }

  // Checked before anything is deployed. An input the schema refuses is an input
  // an MCP client would never have sent, so running it would answer a question
  // nobody asked — and it costs a deploy to find out.
  const inputViolations = utils.validateAgainstJsonSchema(
    (entry.inputSchema as JsonSchema) ?? {
      type: 'object',
      properties: {}
    },
    currentValues.input
  );

  if (inputViolations.length > 0) {
    return {
      ran: false,
      inputViolations,
      logs: [],
      durationMs: 0
    };
  }

  if (!version.sourceKey) {
    throw new Error('This version has no code to run yet.');
  }

  const bucket = caller.env.STORAGE_BUCKET;
  const object = bucket ? await bucket.get(version.sourceKey) : null;
  if (!object) {
    throw new Error(
      'The code for this version is no longer in storage, so it cannot be run. Upload it again.'
    );
  }

  const config = readCustomCodeConfig(tool);

  // Its own name, minted for this run. Every test used to deploy over one
  // preview script, which is the sharpest form of the reuse problem: a test
  // could report the run before it, and "my edit did nothing" is the worst
  // possible answer from the one tool whose whole job is to say what an edit
  // does. Nothing stores this — it is minted, used, and deleted below.
  const deployed = await deployCustomCodeScript(caller, {
    artifactId: artifact.id,
    versionId: version.id,
    bundle: await object.arrayBuffer(),
    preview: true
  });

  // Inside the try, so the preview script is removed whether the run happens or
  // the checks below throw first. A preview script left behind by the path that
  // failed early is the same leak as one left behind by a failed delete.
  try {
    await smokeTestCustomCodeScript(caller, {
      artifactId: artifact.id,
      scriptName: deployed.scriptName,
      edition: deployed.edition,
      declaredTools: [currentValues.tool],
      allowedHosts: config.allowedHosts ?? []
    });

    const run = await invokeCustomCodeScript(caller, {
      artifactId: artifact.id,
      versionId: version.id,
      scriptName: deployed.scriptName,
      toolName: currentValues.tool,
      args: currentValues.input,
      allowedHosts: config.allowedHosts ?? [],
      timeoutMs: Math.min(
        config.timeoutMs,
        utils.constants.CUSTOM_CODE_TEST_TIMEOUT_MS
      )
    });

    // One, not two: the health probe that runs before this is our own check on
    // the upload, and the author did not ask for it. Counted after the run
    // rather than before, so a version that never reached the isolate — no
    // bundle, a refused smoke test — costs nothing, exactly as in apps/mcp.
    await Plan.incrementToolCallUsage(
      dbInstance,
      currentValues.organizationId,
      1
    );

    // A declared outputSchema is a promise to the MCP client, and one the boot
    // loop turns into a protocol-level requirement: a tool that declares one and
    // returns something else becomes an error for the whole call. Surfacing that
    // here is most of the reason to declare an output schema at all.
    const outputViolations =
      !run.error && entry.outputSchema
        ? utils.validateAgainstJsonSchema(
            entry.outputSchema as JsonSchema,
            run.output
          )
        : [];

    return { ran: true, ...run, inputViolations: [], outputViolations };
  } finally {
    // Best effort, and the token's expiry is the backstop: a preview script left
    // behind by a failed delete stops being able to reach the broker on its own.
    try {
      await deleteCustomCodeScript(caller, deployed.scriptName);
    } catch (error) {
      console.error('Could not remove the preview script', error);
    }
  }
};

export const switchVersion = async (
  caller: CustomCodeCaller,
  currentValues: ActivateValues,
  requirePreviouslyPublished: boolean
) => {
  const dbInstance = caller.db;

  // Read, deploy, then commit — in three steps rather than one transaction,
  // because the deploy is a multi-second round trip to Cloudflare and a
  // transaction held open across it would pin a Hyperdrive connection for the
  // duration. The ordering is what matters for correctness: `activeVersionId`
  // moves only after the script is live and has answered a health check, so
  // there is never a window where MCP clients are offered tools that nothing can
  // serve.
  const { artifact, tool } = await resolveCustomCodeToolReadOnly(
    dbInstance,
    currentValues.organizationId,
    currentValues.projectId
  );

  if (!tool) {
    throw new Error('No custom code is installed on this artifact.');
  }

  // Read-only resolution, so unlike the create and upload paths this one does
  // not carry the plan check with it — and these two are the endpoints that
  // most literally deploy code. An org that installed on a paid plan and then
  // downgraded keeps its row, its versions and their bundles, so without this
  // it could go on publishing and rolling back indefinitely.
  const plan = await Plan.getEffectivePlan(
    dbInstance,
    currentValues.organizationId
  );
  Plan.assertCustomCodeAllowed(plan);

  const version = await loadVersionForTool(
    dbInstance,
    tool.id,
    currentValues.versionId
  );

  // A version with more functions than the live one grows the tool count like
  // a new install would, so it is checked before anything is deployed — and
  // again, under a lock, in the transaction that activates it.
  await assertVersionWithinQuota(dbInstance, plan, artifact.id, tool, version);

  // Activating a version with no bundle would advertise its tools to every
  // MCP client while there is nothing to dispatch to.
  if (!version.sourceKey) {
    throw new Error(
      'A bundle is required before this version can be published.'
    );
  }

  if (requirePreviouslyPublished && !version.publishedAt) {
    throw new Error(
      'A previously published version is required to roll back; this one is still a draft, so publish it instead.'
    );
  }

  // Rolling back to a version whose script is still deployed is a pointer move
  // and nothing else. Each upload owns its own name now, so the bundle that
  // version ran is still sitting where it was left — there is nothing to build,
  // nothing to upload, and no propagation to wait on.
  //
  // Only while the sweep has not collected it, which is why this is a question
  // rather than an assumption. A version old enough to have lost its script
  // falls through to the deploy below and is re-uploaded under the name it
  // already owns.
  if (version.scriptName) {
    const stillDeployed = await customCodeScriptExists(
      caller,
      version.scriptName
    );

    if (stillDeployed) {
      const moved = await activateVersionWithinQuota(
        dbInstance,
        plan,
        artifact.id,
        tool.id,
        version
      );

      return moved;
    }
  }

  const bucket = caller.env.STORAGE_BUCKET;
  const object = bucket ? await bucket.get(version.sourceKey) : null;
  if (!object) {
    throw new Error(
      'The bundle for this version is no longer in storage, so it cannot be published. Upload it again.'
    );
  }

  // Every failure from here on is recorded on the version before it is
  // rethrown. `error` is the column the dashboard reads, and a publish that
  // fails with nothing written there is a version the user can only debug from
  // our logs.
  //
  // Nothing is put back on failure, and nothing needs to be. The upload goes to
  // a name of its own, so whatever was live is still live and still pointed at;
  // a rejected bundle is a script nothing dispatches to, which the sweep
  // collects. That is the whole of what one script name per artifact used to
  // cost: a typo in a tool name took down tools that were working, and the
  // restore that fixed it was undoing damage this no longer does.
  let deployed;
  try {
    deployed = await deployCustomCodeScript(caller, {
      artifactId: artifact.id,
      versionId: version.id,
      bundle: await object.arrayBuffer(),
      // A version that has been deployed before keeps its name. Only reachable
      // from the rollback path above, where the script was found to be gone —
      // a publish always arrives here with `scriptName` null.
      ...(version.scriptName ? { scriptName: version.scriptName } : {})
    });

    await smokeTestCustomCodeScript(caller, {
      artifactId: artifact.id,
      scriptName: deployed.scriptName,
      edition: deployed.edition,
      declaredTools: (version.tools as Array<{ name: string }>).map(
        entry => entry.name
      ),
      allowedHosts: readCustomCodeConfig(tool).allowedHosts ?? []
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await dbInstance
      .update(db.schema.artifactToolVersion)
      .set({ error: message })
      .where(eq(db.schema.artifactToolVersion.id, version.id));

    throw error;
  }

  const result = await activateVersionWithinQuota(
    dbInstance,
    plan,
    artifact.id,
    tool.id,
    {
      ...version,
      scriptTag: deployed.scriptTag,
      scriptName: deployed.scriptName
    }
  );

  return result;
};

export const listVersions = async (
  caller: CustomCodeCaller,
  currentValues: ListVersionsValues
) => {
  const dbInstance = caller.db;

  // Read-only, so this doesn't install the tool row the way the write paths do:
  // an artifact with no custom code has no versions, which is not an error.
  const { tool } = await resolveCustomCodeToolReadOnly(
    dbInstance,
    currentValues.organizationId,
    currentValues.projectId
  );

  if (!tool) {
    return { activeVersionId: null, versions: [] };
  }

  const versions = await dbInstance
    .select()
    .from(db.schema.artifactToolVersion)
    .where(eq(db.schema.artifactToolVersion.artifactToolId, tool.id))
    .orderBy(desc(db.schema.artifactToolVersion.version));

  return {
    activeVersionId: readCustomCodeConfig(tool).activeVersionId ?? null,
    versions
  };
};

export const listLogs = async (
  caller: CustomCodeCaller,
  currentValues: ListLogsValues
) => {
  const dbInstance = caller.db;

  const { tool } = await resolveCustomCodeToolReadOnly(
    dbInstance,
    currentValues.organizationId,
    currentValues.projectId
  );

  // An artifact with no custom code has no invocations, which is not an error —
  // the same reason listCustomCodeVersions answers empty rather than throwing.
  if (!tool) {
    return { entries: [] };
  }

  const rows = await dbInstance
    .select({
      id: db.schema.mcpRequest.id,
      toolName: db.schema.mcpRequest.toolName,
      latencyMs: db.schema.mcpRequest.latencyMs,
      errorMessage: db.schema.mcpRequest.errorMessage,
      output: db.schema.mcpRequest.output,
      createdAt: db.schema.mcpRequest.createdAt
    })
    .from(db.schema.mcpRequest)
    .innerJoin(
      db.schema.mcpSession,
      eq(db.schema.mcpRequest.sessionId, db.schema.mcpSession.id)
    )
    .where(
      and(
        eq(db.schema.mcpRequest.artifactToolId, tool.id),
        eq(db.schema.mcpSession.artifactId, tool.artifactId),
        ...(currentValues.tool
          ? [eq(db.schema.mcpRequest.toolName, currentValues.tool)]
          : []),
        ...(currentValues.before
          ? [lt(db.schema.mcpRequest.createdAt, currentValues.before)]
          : [])
      )
    )
    .orderBy(desc(db.schema.mcpRequest.createdAt))
    .limit(currentValues.limit);

  // `logs` is written onto the recorded output alongside the tool's own result;
  // lift it out so a reader gets the lines without having to know that.
  return {
    entries: rows.map(({ output, ...rest }) => {
      const shaped = output as { logs?: unknown } | null;
      const logs =
        shaped && Array.isArray(shaped.logs)
          ? shaped.logs.filter(
              (line): line is string => typeof line === 'string'
            )
          : [];
      return { ...rest, logs };
    })
  };
};
