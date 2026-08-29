import { eq, gt, or } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

import {
  deleteCustomCodeScript,
  listCustomCodeScripts
} from './customCodeDeploy';

// types
import type { EnvSource } from '@ganju/utils';
import type { Bindings } from '../types';

const { constants } = utils;

type ApiEnvSource = EnvSource & { env: Bindings };

export interface ScriptSweepResult {
  listed: number;
  live: number;
  deleted: number;
  skippedYoung: number;
  failed: number;
}

/**
 * Delete dispatch-namespace scripts that nothing points at any more.
 *
 * A script name is minted per upload, so the namespace accumulates one script
 * per publish, per abandoned draft, per failed validation and per test run. Only
 * the ones named by a currently-published version are reachable; everything else
 * is dead weight against the 1,000 scripts included in the platform fee.
 *
 * Three rules, and each of them is the whole reason this is a sweep rather than
 * a delete at publish time:
 *
 *  - **The database is the only source of truth about what is live.** A script
 *    survives because a published version names it, never because its name looks
 *    current. Inferring liveness from a name is how a sweep deletes a customer's
 *    running tool.
 *  - **A recently superseded script is never a candidate.** A tool call that
 *    resolved the old pointer moments before a publish is still in flight, and
 *    the pointer moving does not recall it. The grace window is measured from
 *    when a script stopped being live, which is its version row's `updated_at`,
 *    NOT from when the bytes were uploaded — a version published three days ago
 *    and superseded a minute ago has a three-day-old script and is the exact
 *    case this has to protect.
 *  - **A freshly uploaded script is never a candidate either.** Both windows
 *    apply: `modified_on` covers what has no version row to speak for it, such
 *    as a preview script a test run failed to clean up.
 *  - **A script whose age cannot be read is left alone.** An absent or
 *    unparseable `modified_on` is not evidence that something is old.
 *
 * Bounded per run, so a backlog drains over several hourly ticks rather than
 * making one tick unbounded — the same shape the retention purge uses.
 */
export const runCustomCodeScriptSweep = async (
  source: ApiEnvSource
): Promise<ScriptSweepResult> => {
  const result: ScriptSweepResult = {
    listed: 0,
    live: 0,
    deleted: 0,
    skippedYoung: 0,
    failed: 0
  };

  let scripts;
  try {
    scripts = await listCustomCodeScripts(source);
  } catch (error) {
    // Not configured on this deployment, or Cloudflare is unavailable. Either
    // way there is nothing to sweep and nothing worth failing the cron over —
    // the next tick tries again, and an uncollected script costs $0.02/month.
    console.error('Could not list the dispatch namespace to sweep it', error);
    return result;
  }

  result.listed = scripts.length;
  if (scripts.length === 0) return result;

  const cutoff = Date.now() - constants.CUSTOM_CODE_SWEEP_GRACE_MS;

  const live = await protectedScriptNames(source, new Date(cutoff));
  result.live = live.size;

  for (const script of scripts) {
    if (result.deleted >= constants.CUSTOM_CODE_SWEEP_MAX_DELETES) break;

    // Only ours. The namespace is dedicated, but a sweep that deletes by
    // exclusion should still refuse to touch anything it cannot account for.
    if (!script.name.startsWith(constants.CUSTOM_CODE_SCRIPT_NAME_PREFIX)) {
      continue;
    }

    if (live.has(script.name)) continue;

    if (!script.modifiedAt || script.modifiedAt.getTime() > cutoff) {
      result.skippedYoung += 1;
      continue;
    }

    try {
      await deleteCustomCodeScript(source, script.name);
      result.deleted += 1;
    } catch (error) {
      result.failed += 1;
      console.error(
        `Could not sweep the dispatch script ${script.name}`,
        error
      );
    }
  }

  return result;
};

/**
 * Every script name that must survive this run — the live ones, and the ones
 * that stopped being live too recently to be safe to remove.
 *
 * Three things go in:
 *
 *  - **A published version's recorded `script_name`.** The ordinary answer, and
 *    the pointer the MCP boot loop dispatches to.
 *  - **The legacy derived name of any artifact holding a published version.** A
 *    version published before the column existed has none and is served through
 *    `artifact_<id>`, which the boot loop still falls back to. Deleting it would
 *    take down a working tool to tidy up a naming convention.
 *  - **Any version row touched inside the grace window, whatever its status.**
 *    This is the one that makes the window mean anything. A script's
 *    `modified_on` records when its bytes were uploaded, so a version published
 *    three days ago and superseded a minute ago looks three days old to the
 *    namespace while its requests are still in flight. `updated_at` moves when
 *    the row is archived, so it is the column that answers "when did this stop
 *    being live" — and it covers a failed publish too, whose error write touches
 *    the same row.
 *
 * Scoped by `status` rather than by `config.activeVersionId`, which reads the
 * same set through a JSON field and would answer "no rows" if that field were
 * ever malformed. The failure modes are not symmetrical: over-reporting a live
 * script wastes two cents a month, and under-reporting one deletes running code.
 */
const protectedScriptNames = async (
  source: ApiEnvSource,
  cutoff: Date
): Promise<Set<string>> => {
  const dbInstance = db.create(source);

  const rows = await dbInstance
    .select({
      scriptName: db.schema.artifactToolVersion.scriptName,
      status: db.schema.artifactToolVersion.status,
      artifactId: db.schema.artifactTool.artifactId
    })
    .from(db.schema.artifactToolVersion)
    .innerJoin(
      db.schema.artifactTool,
      eq(
        db.schema.artifactTool.id,
        db.schema.artifactToolVersion.artifactToolId
      )
    )
    .where(
      or(
        eq(
          db.schema.artifactToolVersion.status,
          constants.CUSTOM_CODE_VERSION_STATUS_PUBLISHED
        ),
        gt(db.schema.artifactToolVersion.updatedAt, cutoff)
      )
    );

  const names = new Set<string>();
  for (const row of rows) {
    if (row.scriptName) {
      names.add(row.scriptName);
      continue;
    }

    // The legacy fallback is only reachable for a version that is serving.
    if (row.status === constants.CUSTOM_CODE_VERSION_STATUS_PUBLISHED) {
      names.add(utils.customCodeScriptName(row.artifactId));
    }
  }

  return names;
};
