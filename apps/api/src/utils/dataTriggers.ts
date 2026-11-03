import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';
import { DataError } from '@ganju/utils/data';

// types
import type { DbExecutor } from '@ganju/db';
import type { EnvSource } from '@ganju/utils';
import type { Bindings } from '../types';

import { deliver } from './email';

type ApiEnvSource = EnvSource & { env: Bindings };

export interface ActiveFunctions {
  versionId: string;
  scriptName: string;
  allowedHosts: string[];
  timeoutMs: number;
  // Every function of the active version, exposed to the assistant or not.
  names: Set<string>;
}

// The project's published functions: what a trigger may run.
export const activeFunctions = async (
  executor: DbExecutor,
  artifactId: string
): Promise<ActiveFunctions | null> => {
  const [tool] = await executor
    .select({ config: db.schema.artifactTool.config })
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
  const config = utils.Schema.CUSTOM_CODE_CONFIG.safeParse(tool?.config ?? {});
  if (!tool || !config.success || !config.data.activeVersionId) return null;
  const [version] = await executor
    .select({
      id: db.schema.artifactToolVersion.id,
      tools: db.schema.artifactToolVersion.tools,
      scriptName: db.schema.artifactToolVersion.scriptName
    })
    .from(db.schema.artifactToolVersion)
    .where(eq(db.schema.artifactToolVersion.id, config.data.activeVersionId))
    .limit(1);
  if (!version) return null;
  const names = new Set(
    (Array.isArray(version.tools) ? version.tools : [])
      .map(raw => utils.Schema.CUSTOM_CODE_TOOL.safeParse(raw))
      .filter(result => result.success)
      .map(result => result.data!.name)
  );
  return {
    versionId: version.id,
    scriptName: version.scriptName ?? utils.customCodeScriptName(artifactId),
    allowedHosts: config.data.allowedHosts ?? [],
    timeoutMs: config.data.timeoutMs,
    names
  };
};

/**
 * What the object can't check: that a trigger's function is one this project
 * has published, and that its chat is on one of the project's channels.
 * `functions` is what `ganju deploy` is about to publish, when it is.
 */
export const checkTriggerTargets = async (
  executor: DbExecutor,
  artifactId: string,
  inputs: Record<string, unknown>[],
  functions?: Set<string>
): Promise<void> => {
  const wanted = inputs
    .map(input => input.function)
    .filter((name): name is string => typeof name === 'string');
  if (wanted.length > 0) {
    const names =
      functions ?? (await activeFunctions(executor, artifactId))?.names;
    const missing = [...new Set(wanted)].filter(name => !names?.has(name));
    if (missing.length > 0) {
      throw new DataError(
        `${missing.join(', ')} ${missing.length === 1 ? "isn't a function" : "aren't functions"} of this project; deploy ${missing.length === 1 ? 'it' : 'them'} first.`
      );
    }
  }
  const channels = inputs
    .map(
      input => (input.chat as { channelId?: unknown } | undefined)?.channelId
    )
    .filter((id): id is string => typeof id === 'string');
  if (channels.length > 0) {
    const found = await executor
      .select({
        id: db.schema.channel.id,
        platform: db.schema.channel.platform
      })
      .from(db.schema.channel)
      .where(
        and(
          eq(db.schema.channel.artifactId, artifactId),
          inArray(db.schema.channel.id, [...new Set(channels)])
        )
      );
    const missing = [...new Set(channels)].filter(
      id => !found.some(c => c.id === id)
    );
    if (missing.length > 0) {
      throw new DataError(
        `There is no channel ${missing[0]} in this project.`,
        'not_found'
      );
    }
    if (
      found.some(c => c.platform === utils.constants.CHANNEL_PLATFORM_WHATSAPP)
    ) {
      throw new DataError(
        "A chat message goes to a Telegram group or a Slack or Discord channel; on WhatsApp, message the row's customer instead."
      );
    }
  }
};

// The organization's admins, who own its projects.
export const organizationAdminEmails = async (
  executor: DbExecutor,
  organizationId: string
): Promise<string[]> => {
  const rows = await executor
    .select({ email: db.schema.user.email })
    .from(db.schema.organizationUser)
    .innerJoin(
      db.schema.user,
      eq(db.schema.user.id, db.schema.organizationUser.userId)
    )
    .where(
      and(
        eq(db.schema.organizationUser.organizationId, organizationId),
        eq(db.schema.organizationUser.role, utils.constants.USER_ROLE_ADMIN)
      )
    );
  return [...new Set(rows.map(row => row.email).filter(Boolean))];
};

// One plain email to each address; failures are logged by deliver. Returns
// the addresses it couldn't send to.
export const emailEach = async (
  source: ApiEnvSource,
  to: string[],
  email: { subject: string; text: string }
): Promise<string[]> => {
  const failed: string[] = [];
  for (const address of to) {
    if (!(await deliver(source, { to: address, ...email })))
      failed.push(address);
  }
  return failed;
};
