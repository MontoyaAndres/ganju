import { commandContext, describeTarget } from '../context.js';
import { CliError } from '../errors.js';
import {
  color,
  formatWhen,
  json as printJson,
  note,
  success,
  table
} from '../output.js';

interface VersionRow {
  id: string;
  version: number;
  status: string;
  sourceKind: string | null;
  tools: Array<{ name: string }> | null;
  error: string | null;
  publishedAt: string | null;
  createdAt: string;
}

interface VersionList {
  activeVersionId: string | null;
  versions: VersionRow[];
}

/**
 * `ganju versions` — what exists, and which one is serving clients.
 *
 * The distinction the table has to make is that "published" and "live" are not
 * the same thing: every version that has ever been live is `published`, and
 * exactly one of them is the artifact's `activeVersionId`. Rolling back moves
 * that pointer without changing any row's status, so a column that showed only
 * the status would show two published versions and no way to tell them apart.
 */
export const versions = async (flags: { json?: boolean }): Promise<void> => {
  const { api, artifactPath, target } = await commandContext();
  const list = await api.request<VersionList>(
    `${artifactPath}/custom-code/versions`
  );

  if (flags.json) {
    printJson(list);
    return;
  }

  if (list.versions.length === 0) {
    note(`No versions on ${describeTarget(target)} yet — run \`ganju deploy\``);
    return;
  }

  table([
    [
      color.gray(''),
      color.gray('VERSION'),
      color.gray('STATUS'),
      color.gray('TOOLS'),
      color.gray('SOURCE'),
      color.gray('CREATED')
    ],
    ...list.versions.map(row => {
      const live = row.id === list.activeVersionId;
      return [
        live ? color.green('●') : ' ',
        `v${row.version}`,
        live ? color.green('live') : row.status,
        String(row.tools?.length ?? 0),
        row.sourceKind ?? '',
        formatWhen(row.createdAt)
      ];
    })
  ]);

  const broken = list.versions.filter(row => row.error);
  for (const row of broken) {
    note(`${color.yellow('!')} v${row.version}: ${row.error}`);
  }
};

/**
 * `ganju rollback` — put a previously live version back.
 *
 * Its own command rather than a flag on deploy, and its own endpoint on the
 * server, because it is the same state transition with a different intent and
 * that difference is worth being able to read afterwards. It also accepts only
 * a version that has been live before, which is what makes it safe: the code and
 * the tool schemas move together, so going back cannot leave clients holding a
 * contract nothing implements.
 */
export const rollback = async (requested?: string): Promise<void> => {
  if (!requested) {
    throw new CliError('Which version?', {
      hint: 'ganju rollback 6 — run `ganju versions` to see them.'
    });
  }

  const { api, artifactPath, target } = await commandContext();
  const list = await api.request<VersionList>(
    `${artifactPath}/custom-code/versions`
  );

  const number = Number.parseInt(requested, 10);
  const match = list.versions.find(row =>
    Number.isInteger(number) ? row.version === number : row.id === requested
  );

  if (!match) {
    throw new CliError(`No version "${requested}"`, {
      hint: 'Run `ganju versions` to see what exists.'
    });
  }
  if (match.id === list.activeVersionId) {
    note(`v${match.version} is already live on ${describeTarget(target)}`);
    return;
  }

  await api.request(
    `${artifactPath}/custom-code/version/${match.id}/rollback`,
    {
      method: 'POST'
    }
  );

  const count = match.tools?.length ?? 0;
  success(
    `rolled back to v${match.version} on ${color.bold(describeTarget(target))} — ${count} ${
      count === 1 ? 'tool' : 'tools'
    }`
  );
};
