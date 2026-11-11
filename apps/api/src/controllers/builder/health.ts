import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@ganju/db';
import type { Database } from '@ganju/db';
import { utils } from '@ganju/utils';
import type { EnvSource } from '@ganju/utils';

import { assertBuilderAllowed } from './access';
import {
  findCustomCodeTool,
  readCustomCodeConfig
} from '../artifact/customCode';
import { ownerAndAdminEmails } from '../../utils/dataAbandoned';
import { deliver } from '../../utils/email';

import type { Bindings } from '../../types';

const { constants } = utils;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface BrokenAction {
  name: string;
  calls: number;
  failures: number;
  error: string | null;
}

export interface BuilderProblems {
  actions: BrokenAction[];
  // Providers of the accounts the actions use that need signing in again.
  accounts: string[];
}

const NONE: BuilderProblems = { actions: [], accounts: [] };

/**
 * What is broken among the things the assistant can fix: the live actions of
 * a project built in the dashboard, and the accounts they use. A project whose
 * actions a developer uploads from the CLI has none.
 */
export const projectProblems = async (
  database: Database,
  artifactId: string,
  now = new Date()
): Promise<BuilderProblems> => {
  const tool = await findCustomCodeTool(database, artifactId);
  if (!tool || !tool.enabled) return NONE;
  const config = readCustomCodeConfig(tool);
  if (!config.activeVersionId) return NONE;
  const [version] = await database
    .select({
      sourceKind: db.schema.artifactToolVersion.sourceKind,
      tools: db.schema.artifactToolVersion.tools,
      publishedAt: db.schema.artifactToolVersion.publishedAt
    })
    .from(db.schema.artifactToolVersion)
    .where(eq(db.schema.artifactToolVersion.id, config.activeVersionId))
    .limit(1);
  if (
    !version ||
    version.sourceKind !== constants.CUSTOM_CODE_SOURCE_KIND_EDITOR
  ) {
    return NONE;
  }

  const allowed = config.allowedTools?.length
    ? new Set(config.allowedTools)
    : null;
  const live = new Set(
    (version.tools as { name: string }[])
      .map(action => action.name)
      .filter(name => !allowed || allowed.has(name))
  );
  // Failures from before the live version was published were fixed by it,
  // or are the reason for it.
  const since = new Date(
    Math.max(
      now.getTime() - constants.BUILDER_HEALTH_WINDOW_HOURS * HOUR_MS,
      version.publishedAt?.getTime() ?? 0
    )
  );
  const rejected = `${constants.OBSERVABILITY_SCHEMA_REJECTION_PREFIX}%`;

  const [rows, credentials] = await Promise.all([
    database.execute(sql`
      SELECT
        r.tool_name AS name,
        count(*)::int AS calls,
        count(r.error_message)::int AS failures,
        -- Grouped the way Tool health groups errors: without the marks around
        -- outside text (their ids differ on every call), and with quoted
        -- values, ids and long numbers masked.
        mode() WITHIN GROUP (
          ORDER BY regexp_replace(
            regexp_replace(
              left(
                btrim(
                  regexp_replace(
                    r.error_message,
                    ${utils.UNTRUSTED_CONTENT_MARK_PATTERN},
                    chr(10),
                    'g'
                  ),
                  chr(10)
                ),
                300
              ),
              '"[^"]*"|''[^'']*''|[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}|[0-9]{5,}',
              '…',
              'g'
            ),
            '\\s+',
            ' ',
            'g'
          )
        ) AS error
      FROM mcp_request r
      WHERE r.artifact_tool_id = ${tool.id}
        AND r.method = ${constants.MCP_REQUEST_METHOD_TOOLS_CALL}
        AND r.tool_name IS NOT NULL
        AND r.created_at >= ${since.toISOString()}
        AND (r.error_message IS NULL OR r.error_message NOT LIKE ${rejected})
      GROUP BY r.tool_name
    `) as unknown as Promise<BrokenAction[]>,
    config.connections?.length
      ? database
          .select({
            provider: db.schema.artifactCredential.provider,
            metadata: db.schema.artifactCredential.metadata
          })
          .from(db.schema.artifactCredential)
          .where(
            and(
              eq(db.schema.artifactCredential.artifactId, artifactId),
              inArray(db.schema.artifactCredential.provider, config.connections)
            )
          )
      : Promise.resolve([])
  ]);

  const actions = rows
    .filter(
      row =>
        live.has(row.name) &&
        row.failures >= constants.BUILDER_HEALTH_MIN_FAILURES &&
        row.failures / row.calls >= constants.BUILDER_HEALTH_MIN_FAILURE_RATE
    )
    .sort((a, b) => b.failures - a.failures);
  const accounts = [
    ...new Set(
      credentials
        .filter(row => utils.isCredentialNeedingReauth(row.metadata))
        .map(row => row.provider)
    )
  ].sort();
  return { actions, accounts };
};

const providerLabel = (provider: string) =>
  provider
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

// Spanish, then English, in one message: there is no stored language.
const alertEmail = (input: {
  projectName: string;
  link: string;
  problems: BuilderProblems;
}) => {
  const { actions, accounts } = input.problems;
  const es = [
    'Hola,',
    '',
    `En el proyecto ${input.projectName} hay algo que no está funcionando:`,
    '',
    ...actions.map(
      action =>
        `- La acción ${action.name} falló ${action.failures} de ${action.calls} veces en el último día.${action.error ? ` Error más común: ${action.error}` : ''}`
    ),
    ...accounts.map(
      provider =>
        `- La cuenta de ${providerLabel(provider)} que usan tus acciones necesita que vuelvas a iniciar sesión.`
    ),
    '',
    `El asistente puede revisarlo y arreglarlo contigo: ${input.link}`
  ];
  const en = [
    'Hello,',
    '',
    `Something in the project ${input.projectName} isn't working:`,
    '',
    ...actions.map(
      action =>
        `- The action ${action.name} failed ${action.failures} of ${action.calls} times in the last day.${action.error ? ` Most common error: ${action.error}` : ''}`
    ),
    ...accounts.map(
      provider =>
        `- The ${providerLabel(provider)} account your actions use needs signing in again.`
    ),
    '',
    `The assistant can look into it and fix it with you: ${input.link}`
  ];
  return {
    subject: `Ganju: algo dejó de funcionar en ${input.projectName} / Something stopped working in ${input.projectName}`,
    text: [...es, '', '---', '', ...en].join('\n')
  };
};

const signatureOf = (problems: BuilderProblems) =>
  [
    ...problems.actions.map(action => `action:${action.name}`),
    ...problems.accounts.map(provider => `account:${provider}`)
  ].join(',');

/**
 * Email a project's owner and admins when an action the assistant can fix
 * breaks. New problems wait a day after the last email; the same ones a week.
 */
export const runBuilderHealthAlerts = async (
  source: EnvSource & { env: Bindings }
): Promise<{ checked: number; sent: number }> => {
  const result = { checked: 0, sent: 0 };
  try {
    const database = db.create(source);
    const now = new Date();
    const since = new Date(
      now.getTime() - constants.BUILDER_HEALTH_WINDOW_HOURS * HOUR_MS
    ).toISOString();

    const candidates = (await database.execute(sql`
      SELECT DISTINCT t.artifact_id
      FROM mcp_request r
      JOIN artifact_tool t ON t.id = r.artifact_tool_id
      WHERE t.tool_key = ${constants.TOOL_DEFINITION_KEY_CUSTOM_CODE}
        AND r.method = ${constants.MCP_REQUEST_METHOD_TOOLS_CALL}
        AND r.created_at >= ${since}
        AND r.error_message IS NOT NULL
      UNION
      SELECT DISTINCT c.artifact_id
      FROM artifact_credential c
      JOIN artifact_tool t
        ON t.artifact_id = c.artifact_id
        AND t.tool_key = ${constants.TOOL_DEFINITION_KEY_CUSTOM_CODE}
      WHERE (c.metadata::jsonb ->> 'needsReauth') = 'true'
    `)) as unknown as { artifact_id: string }[];
    if (!candidates.length) return result;

    const projects = await database
      .select({
        artifactId: db.schema.artifact.id,
        projectId: db.schema.project.id,
        projectName: db.schema.project.name,
        organizationId: db.schema.project.organizationId,
        alerts: db.schema.subscription.builderAlerts
      })
      .from(db.schema.artifact)
      .innerJoin(
        db.schema.project,
        eq(db.schema.project.id, db.schema.artifact.projectId)
      )
      .leftJoin(
        db.schema.subscription,
        eq(
          db.schema.subscription.organizationId,
          db.schema.project.organizationId
        )
      )
      .where(
        inArray(
          db.schema.artifact.id,
          candidates.map(row => row.artifact_id)
        )
      );

    const keys = projects.map(
      p => `${constants.ALERT_STATE_KEY_BUILDER_HEALTH}:${p.artifactId}`
    );
    const states = keys.length
      ? await database
          .select()
          .from(db.schema.alertState)
          .where(inArray(db.schema.alertState.key, keys))
      : [];
    const stateByKey = new Map(states.map(state => [state.key, state]));
    const webUrl = utils.getEnv(source, 'NEXT_PUBLIC_WEB_URL') ?? '';

    for (const project of projects) {
      if (project.alerts === false) continue;
      result.checked += 1;
      try {
        await assertBuilderAllowed(
          source.env,
          database,
          project.organizationId
        );
      } catch {
        continue;
      }
      const problems = await projectProblems(database, project.artifactId, now);
      const signature = signatureOf(problems);
      if (!signature) continue;

      const key = `${constants.ALERT_STATE_KEY_BUILDER_HEALTH}:${project.artifactId}`;
      const state = stateByKey.get(key);
      const elapsed = state?.lastAlertAt
        ? now.getTime() - state.lastAlertAt.getTime()
        : Infinity;
      const due =
        state?.lastSeenId === signature
          ? elapsed >= constants.BUILDER_HEALTH_REPEAT_DAYS * DAY_MS
          : elapsed >= DAY_MS;
      if (!due) continue;

      const to = await ownerAndAdminEmails(database, project.organizationId);
      const email = alertEmail({
        projectName: project.projectName,
        link: `${webUrl}/organization/${project.organizationId}/project/${project.projectId}/assistant?fix=1`,
        problems
      });
      let delivered = 0;
      for (const address of to) {
        if (await deliver(source, { to: address, ...email })) delivered += 1;
      }
      if (!delivered) continue;
      result.sent += 1;
      await database
        .insert(db.schema.alertState)
        .values({ key, lastSeenId: signature, lastAlertAt: now })
        .onConflictDoUpdate({
          target: db.schema.alertState.key,
          set: { lastSeenId: signature, lastAlertAt: now }
        });
    }
  } catch (error) {
    console.error('runBuilderHealthAlerts failed', error);
  }
  return result;
};
