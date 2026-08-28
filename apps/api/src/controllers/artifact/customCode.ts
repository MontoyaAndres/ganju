import { and, eq, sql } from 'drizzle-orm';
import { db } from '@ganju/db';
import type { DbExecutor } from '@ganju/db';
import { utils } from '@ganju/utils';
import type {
  CustomCodeManifest,
  CustomCodeToolConfig,
  JsonSchema,
  PlanLimits
} from '@ganju/utils';

import { Plan } from '../../utils';

export type CustomCodeToolRow = typeof db.schema.artifactTool.$inferSelect;
export type CustomCodeVersionRow =
  typeof db.schema.artifactToolVersion.$inferSelect;

// Read an artifact_tool.config as a custom-code config. Rows are written through
// Schema.CUSTOM_CODE_CONFIG so the shape is trustworthy; the cast is only here
// because the column is a generic json.
export const readCustomCodeConfig = (
  tool: Pick<CustomCodeToolRow, 'config'>
): CustomCodeToolConfig => (tool.config ?? {}) as CustomCodeToolConfig;

// Resolve project → artifact, scoped to the org. Every custom-code endpoint
// starts here, so an artifact from another organization can never be addressed
// by passing its project id.
const resolveArtifact = async (
  executor: DbExecutor,
  organizationId: string,
  projectId: string
) => {
  const [project] = await executor
    .select({ id: db.schema.project.id })
    .from(db.schema.project)
    .where(
      and(
        eq(db.schema.project.id, projectId),
        eq(db.schema.project.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!project) {
    throw new Error('Project not found');
  }

  const [artifactRow] = await executor
    .select()
    .from(db.schema.artifact)
    .where(eq(db.schema.artifact.projectId, projectId))
    .limit(1);

  if (!artifactRow) {
    throw new Error('Artifact not found for the project');
  }

  return artifactRow;
};

// Find the artifact's `custom-code` artifact_tool row without creating one.
// Used by the read path, where "this artifact has no custom code" is a valid
// answer rather than an error.
export const findCustomCodeTool = async (
  executor: DbExecutor,
  artifactId: string
): Promise<CustomCodeToolRow | null> => {
  const [row] = await executor
    .select({ artifact_tool: db.schema.artifactTool })
    .from(db.schema.artifactTool)
    .where(
      and(
        eq(db.schema.artifactTool.artifactId, artifactId),
        eq(
          db.schema.artifactTool.toolKey,
          utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE
        )
      )
    )
    .limit(1);

  return row?.artifact_tool ?? null;
};

// Resolve the artifact and its single `custom-code` tool row, creating that row
// on first use.
//
// Auto-creating matters because the CLI (`ganju deploy`) is a thin client of
// these endpoints and has to work against a fresh artifact, before any dashboard
// card has installed the row. The quota check and the counter bump mirror
// createTool exactly, so an install still costs a tool slot however it was
// created.
//
// Takes a transaction rather than the db instance: the read-then-insert must not
// interleave with a concurrent upload, or an artifact ends up with two
// custom-code rows and the boot loop has no single answer for which one is live.
export const resolveCustomCodeTool = async (
  tx: DbExecutor,
  organizationId: string,
  projectId: string
): Promise<{
  artifact: typeof db.schema.artifact.$inferSelect;
  tool: CustomCodeToolRow;
}> => {
  const artifactRow = await resolveArtifact(tx, organizationId, projectId);
  const plan = await Plan.getEffectivePlan(tx, organizationId);

  // Checked before the existing-row shortcut, not after. An org that installed
  // custom code on a paid plan and then downgraded still holds the row, and the
  // question every write here asks is "may this org deploy code now" — not "did
  // it once".
  Plan.assertCustomCodeAllowed(plan);

  const existing = await findCustomCodeTool(tx, artifactRow.id);
  if (existing) {
    return { artifact: artifactRow, tool: existing };
  }

  Plan.assertToolQuota(plan, artifactRow.artifactToolCount);

  const [created] = await tx
    .insert(db.schema.artifactTool)
    .values({
      toolKey: utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE,
      config: utils.Schema.CUSTOM_CODE_CONFIG.parse({}),
      metadata: null,
      artifactId: artifactRow.id
    })
    .returning();

  await tx
    .update(db.schema.artifact)
    .set({
      artifactToolCount: sql`(${db.schema.artifact.artifactToolCount}::int + 1)::int`
    })
    .where(eq(db.schema.artifact.id, artifactRow.id));

  return { artifact: artifactRow, tool: created };
};

// Read-only counterpart of the above: resolves the artifact and its custom-code
// row if one exists, and never writes.
export const resolveCustomCodeToolReadOnly = async (
  executor: DbExecutor,
  organizationId: string,
  projectId: string
): Promise<{
  artifact: typeof db.schema.artifact.$inferSelect;
  tool: CustomCodeToolRow | null;
}> => {
  const artifactRow = await resolveArtifact(
    executor,
    organizationId,
    projectId
  );
  return {
    artifact: artifactRow,
    tool: await findCustomCodeTool(executor, artifactRow.id)
  };
};

// Validate an artifact_tool.config of definition `custom-code` on the generic
// create/update tool routes.
//
// `activeVersionId` is deliberately NOT taken from the request: which version is
// live is decided by publish/rollback, which check that the version belongs to
// this tool and has a bundle. Accepting it here would let a config edit point an
// artifact at any version id and skip both checks, so the caller passes the
// value already stored on the row (null on create) and anything the client sent
// is discarded.
export const validateCustomCodeConfig = (
  config: unknown,
  currentActiveVersionId: string | null
): Record<string, unknown> => {
  const parsed = utils.Schema.CUSTOM_CODE_CONFIG_WRITE.safeParse(config ?? {});
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message || 'Invalid custom code configuration'
    );
  }
  return {
    ...parsed.data,
    activeVersionId: currentActiveVersionId
  } as Record<string, unknown>;
};

// Validate an uploaded manifest beyond what zod can express. Two extra checks:
//
//  1. Every declared schema must COMPILE. jsonSchemaToZodShape is what apps/mcp
//     runs at boot, and it throws on input zod's structural check accepts — an
//     invalid `pattern` regex being the obvious one. Catching it here turns a
//     boot-time skip-and-log (the tool silently missing from the customer's
//     agent, with no error anywhere they look) into an upload-time rejection the
//     author actually sees.
//  2. The per-plan tool cap. maxToolsPerArtifact bounds artifact_tool ROWS, but
//     one custom-code row declares many MCP tools, so an artifact capped at 7
//     rows must not be handed 50 tools through one of them.
export const validateCustomCodeManifest = (
  manifest: CustomCodeManifest,
  limits: Pick<PlanLimits, 'maxToolsPerArtifact'>
): void => {
  const cap = Math.min(
    utils.constants.CUSTOM_CODE_MAX_TOOLS,
    limits.maxToolsPerArtifact ?? Number.POSITIVE_INFINITY
  );

  if (manifest.tools.length > cap) {
    throw new Error(
      `This version declares ${manifest.tools.length} tools, which exceeds the ${cap} your plan allows per artifact.`
    );
  }

  for (const tool of manifest.tools) {
    const schemas = [
      ['input', tool.inputSchema],
      ['output', tool.outputSchema]
    ] as const;

    for (const [label, schema] of schemas) {
      if (!schema) continue;
      try {
        utils.jsonSchemaToZodShape(schema as JsonSchema);
      } catch (error) {
        throw new Error(
          `Tool "${tool.name}" has an invalid ${label} schema: ${
            error instanceof Error ? error.message : 'it could not be compiled'
          }`
        );
      }
    }
  }
};

// Delete the artifact's custom-code secrets after its custom-code tool row is
// removed, and return how many went.
//
// The generic cleanup in removeTool follows `config.auth.credentialId`, which
// works for http-endpoint and mcp-proxy because those reference their one secret
// by id. custom-code secrets are looked up by LABEL from inside the script
// (ctx.secret(name)), so nothing in config points at them and the generic path
// would leave every one of them orphaned on the artifact. There is exactly one
// custom-code row per artifact, so once it is gone no other tool can still need
// them and deleting the whole provider's rows is safe.
export const deleteCustomCodeSecrets = async (
  tx: DbExecutor,
  artifactId: string
): Promise<number> => {
  const deleted = await tx
    .delete(db.schema.artifactCredential)
    .where(
      and(
        eq(db.schema.artifactCredential.artifactId, artifactId),
        eq(
          db.schema.artifactCredential.provider,
          utils.constants.CREDENTIAL_PROVIDER_CUSTOM_CODE
        )
      )
    )
    .returning({ id: db.schema.artifactCredential.id });

  return deleted.length;
};

// Allocate the next version number for a tool. max+1 rather than count+1 so a
// deleted version never causes a number to be reused — users refer to these as
// "v3" and two different v3s would make the version list a lie. The unique index
// on (artifactToolId, version) is what makes a concurrent upload fail loudly
// rather than silently produce a duplicate.
export const nextVersionNumber = async (
  executor: DbExecutor,
  artifactToolId: string
): Promise<number> => {
  const [{ maxVersion }] = await executor
    .select({
      maxVersion: sql<number>`coalesce(max(${db.schema.artifactToolVersion.version}), 0)::int`
    })
    .from(db.schema.artifactToolVersion)
    .where(eq(db.schema.artifactToolVersion.artifactToolId, artifactToolId));

  return Number(maxVersion) + 1;
};

// Load a version and prove it belongs to the tool the caller resolved. Callers
// pass a versionId straight from the URL, so this scoping is what stops one
// artifact from publishing another's code.
export const loadVersionForTool = async (
  executor: DbExecutor,
  artifactToolId: string,
  versionId: string
): Promise<CustomCodeVersionRow> => {
  const [version] = await executor
    .select()
    .from(db.schema.artifactToolVersion)
    .where(
      and(
        eq(db.schema.artifactToolVersion.id, versionId),
        eq(db.schema.artifactToolVersion.artifactToolId, artifactToolId)
      )
    )
    .limit(1);

  if (!version) {
    throw new Error('Version not found');
  }

  return version;
};

// R2 key for a version's bundle. Keyed by artifact AND version so a rollback can
// always fetch the exact source that produced the script it is restoring.
export const bundleSourceKey = (
  organizationId: string,
  projectId: string,
  artifactId: string,
  version: number
): string =>
  `${utils.constants.CUSTOM_CODE_SOURCE_KEY_PREFIX}/${organizationId}/${projectId}/${artifactId}/v${version}.js`;

// SHA-256 of the uploaded bytes, hex-encoded. Stored as sourceHash for dedupe
// and to prove the object in R2 is the source a version claims to have.
//
// Defined next to the deploy that stamps it into the script as the edition
// marker, and re-exported here so both numbers are the same one: the hash a
// version row records and the hash a running script reports must agree, or the
// publish wait is comparing two things that only look alike.
export { hashBundle } from '../../utils';

// Move `versionId` into the published slot and point the tool row at it.
// Shared by publish and rollback, which differ only in which versions they
// accept as input — the state transition itself is identical, and writing it
// once is what keeps the "exactly one published version" invariant true.
//
// `version.scriptTag` is written through from the caller rather than read from
// the row: the caller has just deployed and holds the tag the namespace returned
// for the bytes now running. A rollback re-deploys the same source and gets a
// tag of its own, so the column always names what is actually live.
export const activateVersion = async (
  tx: DbExecutor,
  tool: CustomCodeToolRow,
  version: CustomCodeVersionRow
): Promise<CustomCodeVersionRow> => {
  await tx
    .update(db.schema.artifactToolVersion)
    .set({ status: utils.constants.CUSTOM_CODE_VERSION_STATUS_ARCHIVED })
    .where(
      and(
        eq(db.schema.artifactToolVersion.artifactToolId, tool.id),
        eq(
          db.schema.artifactToolVersion.status,
          utils.constants.CUSTOM_CODE_VERSION_STATUS_PUBLISHED
        )
      )
    );

  const [activated] = await tx
    .update(db.schema.artifactToolVersion)
    .set({
      status: utils.constants.CUSTOM_CODE_VERSION_STATUS_PUBLISHED,
      // Preserved on rollback: this records when the version FIRST went live,
      // which is what makes "has this ever been published" answerable.
      publishedAt: version.publishedAt ?? new Date(),
      scriptTag: version.scriptTag,
      error: null
    })
    .where(eq(db.schema.artifactToolVersion.id, version.id))
    .returning();

  await tx
    .update(db.schema.artifactTool)
    .set({
      config: { ...readCustomCodeConfig(tool), activeVersionId: activated.id }
    })
    .where(eq(db.schema.artifactTool.id, tool.id));

  return activated;
};
