import { commandContext } from '../context.js';
import { CliError } from '../errors.js';
import {
  color,
  formatWhen,
  json as printJson,
  note,
  say,
  success,
  table,
  warn
} from '../output.js';

interface AccessToken {
  id: string;
  name: string;
  hint: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  projectId: string;
  createdByUserId: string | null;
  createdBy: { id: string; name: string; email: string } | null;
  /** The account that minted it is gone, so it no longer authenticates. */
  orphaned: boolean;
}

interface MintedToken extends AccessToken {
  token: string;
}

/**
 * `ganju token` — the durable credential a machine authenticates with.
 *
 * `GANJU_API_TOKEN` also takes an OAuth access token, which is what `ganju
 * login` produces and which lives an hour. That is fine for a job someone starts
 * by hand and useless for a scheduled one, whose second run is always after that
 * hour is up. This is the credential built for the second case.
 *
 * Every command here mints or reads against the project `ganju.json` is linked
 * to, because that is exactly what a token is scoped to — there is no picker,
 * and there is nothing to get wrong. A token minted here reaches this project's
 * artifact and nothing else in the account.
 *
 * None of these work *under* an access token: a credential that can mint
 * credentials outlives its own revocation. They need a browser login, and say so
 * rather than answering with a bare 403.
 */

const requireInteractive = (action: string) => {
  if (process.env.GANJU_API_TOKEN) {
    throw new CliError(
      `GANJU_API_TOKEN is set, and a token cannot ${action} tokens`,
      {
        hint: 'Unset it and run `ganju login` — minting is deliberately something a person does, so a leaked token cannot quietly mint its own replacement.'
      }
    );
  }
};

const describeExpiry = (row: AccessToken): string => {
  if (!row.expiresAt) return color.gray('never');
  const when = formatWhen(row.expiresAt);
  return new Date(row.expiresAt).getTime() <= Date.now()
    ? color.yellow(`${when} (expired)`)
    : when;
};

const list = async (options: { json?: boolean }): Promise<void> => {
  const { api, projectPath, target } = await commandContext();
  const rows = await api.request<AccessToken[]>(`${projectPath}/token`);

  if (options.json) {
    printJson(rows);
    return;
  }

  if (rows.length === 0) {
    note('No access tokens on this project');
    note(color.gray('  ganju token create "GitHub Actions"'));
    return;
  }

  table([
    [
      color.gray('NAME'),
      color.gray('TOKEN'),
      color.gray('CREATED BY'),
      color.gray('LAST USED'),
      color.gray('EXPIRES')
    ],
    ...rows.map(row => [
      // An orphaned row is kept so it can be seen, and reads as live without
      // this — it is the one row in the list that cannot authenticate.
      row.orphaned ? `${row.name} ${color.yellow('(inactive)')}` : row.name,
      color.gray(row.hint),
      row.createdBy?.email ?? color.yellow('owner deleted'),
      row.lastUsedAt ? formatWhen(row.lastUsedAt) : color.gray('never'),
      describeExpiry(row)
    ])
  ]);
  // Said rather than implied, because the obvious next question is what a token
  // is set to and the answer is that nothing can tell you.
  note(
    color.gray(
      `\n  ${rows.length} on ${target.artifact ?? target.projectId} — values are never readable, revoke and create another`
    )
  );
  if (rows.some(row => row.orphaned)) {
    note(
      color.gray(
        '  an inactive token outlived the account that made it; it is kept so you can see it, and no longer works'
      )
    );
  }
};

const create = async (
  name: string | undefined,
  options: { expires?: string; json?: boolean }
): Promise<void> => {
  requireInteractive('create');

  if (!name)
    throw new CliError('What is the token for?', {
      hint: 'ganju token create "GitHub Actions" --expires 90'
    });

  // `never` is spelled out rather than reached by leaving the flag off, because
  // a credential that does not expire should be something someone typed.
  let expiresInDays: number | null | undefined;
  if (options.expires === 'never') {
    expiresInDays = null;
  } else if (options.expires !== undefined) {
    const days = Number.parseInt(options.expires, 10);
    if (!Number.isFinite(days) || days < 1) {
      throw new CliError(`--expires takes a number of days, or "never"`, {
        hint: `Got "${options.expires}".`
      });
    }
    expiresInDays = days;
  }

  const { api, projectPath, target } = await commandContext();
  const created = await api.request<MintedToken>(`${projectPath}/token`, {
    method: 'POST',
    json: { name, ...(expiresInDays !== undefined ? { expiresInDays } : {}) }
  });

  if (options.json) {
    printJson(created);
    return;
  }

  success(`created ${color.bold(created.name)}`);
  // The value goes to stdout alone, so `ganju token create ci | tail -1` and a
  // pipe into a secret store both work. Everything around it is stderr.
  say(created.token);
  warn('this is the only time the value is shown — copy it now');
  note(
    color.gray(
      `  set it as GANJU_API_TOKEN wherever the CLI runs; it can act only on ${
        target.artifact ?? target.projectId
      }`
    )
  );
  if (created.expiresAt) {
    note(color.gray(`  expires ${formatWhen(created.expiresAt)}`));
  }
};

/**
 * Revoke by id, or by name when it is unambiguous.
 *
 * The list shows names, so a name is what someone has in front of them when
 * they decide to revoke — but names are not unique, and guessing which of two
 * is meant would eventually revoke the wrong deploy. So an ambiguous name is
 * refused with the ids, which is the one thing that always resolves.
 */
const revoke = async (handle?: string): Promise<void> => {
  requireInteractive('revoke');

  if (!handle)
    throw new CliError('Which token?', {
      hint: 'ganju token revoke NAME  (or its id — `ganju token list` shows both with --json)'
    });

  const { api, projectPath } = await commandContext();
  const rows = await api.request<AccessToken[]>(`${projectPath}/token`);

  const byId = rows.find(row => row.id === handle);
  const byName = rows.filter(row => row.name === handle);
  const target = byId ?? (byName.length === 1 ? byName[0] : undefined);

  if (!target && byName.length > 1) {
    throw new CliError(`${byName.length} tokens are named "${handle}"`, {
      hint: `Revoke by id instead:\n  ${byName.map(row => row.id).join('\n  ')}`
    });
  }
  if (!target) {
    throw new CliError(`No access token "${handle}" on this project`, {
      hint: 'Run `ganju token list` to see what there is.'
    });
  }

  await api.request(`${projectPath}/token/${target.id}`, { method: 'DELETE' });

  success(`revoked ${color.bold(target.name)}`);
  note(color.gray('  anything using it stops working on its next request'));
};

export const token = async (
  args: string[],
  options: { expires?: string; json?: boolean }
): Promise<void> => {
  const [action, ...rest] = args;
  switch (action) {
    case 'list':
    case 'ls':
      return list(options);
    case 'create':
    case 'new':
      return create(rest[0], options);
    case 'revoke':
    case 'rm':
    case 'remove':
    case 'delete':
      return revoke(rest[0]);
    default:
      say('Usage:');
      say('  ganju token create NAME [--expires 90|never]');
      say('  ganju token list [--json]');
      say('  ganju token revoke NAME');
      if (action) process.exitCode = 1;
  }
};
