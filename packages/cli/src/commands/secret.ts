import * as constants from '@ganju/utils/cliConstants';

import { commandContext } from '../context.js';
import { CliError } from '../errors.js';
import { color, formatWhen, note, say, success, table } from '../output.js';

interface CredentialRow {
  id: string;
  provider: string;
  metadata: { label?: unknown } | null;
  createdAt: string;
}

const PROVIDER = constants.CREDENTIAL_PROVIDER_CUSTOM_CODE;

/**
 * A secret's name lives in `metadata.label`, not in a column of its own.
 *
 * `artifact_credential` has no `label`, and the broker's own lookup reads the
 * same place ([resolveSecret](../../../../apps/tool-broker/src/utils/connection.ts)) —
 * so reading it anywhere else means the CLI and the runtime disagree about
 * which row a name refers to.
 */
const labelOf = (row: CredentialRow): string | null =>
  typeof row.metadata?.label === 'string' ? row.metadata.label : null;

const secretsNamed = (rows: CredentialRow[], name: string): CredentialRow[] =>
  rows.filter(row => row.provider === PROVIDER && labelOf(row) === name);

/**
 * `ganju secret` — the values `ctx.secret()` reads.
 *
 * Secrets are the one part of a tool's configuration that is not in
 * `ganju.json`, and must not be: a value committed beside the source is the
 * thing this feature exists to avoid. They are credential rows on the artifact,
 * addressed by label, resolved by the broker on each call — so a secret is live
 * from the next call with no deploy after it.
 */

const list = async (): Promise<void> => {
  const { api, artifactPath } = await commandContext();
  const rows = await api.request<CredentialRow[]>(`${artifactPath}/credential`);
  const secrets = rows.filter(row => row.provider === PROVIDER);

  if (secrets.length === 0) {
    note('No secrets set on this artifact');
    return;
  }

  table([
    [color.gray('NAME'), color.gray('SET')],
    ...secrets.map(row => [
      labelOf(row) ?? color.gray('(unnamed)'),
      formatWhen(row.createdAt)
    ])
  ]);
  // Said rather than implied, because the obvious next question is "what is it
  // set to" and the answer is that nothing can tell you. The list endpoint
  // strips the value from every row it returns.
  note(
    color.gray('\n  values are never readable — set a new one to change it')
  );
};

const set = async (name?: string, value?: string): Promise<void> => {
  if (!name)
    throw new CliError('Which secret?', {
      hint: 'ganju secret set NAME VALUE'
    });

  const resolved = value ?? process.env.GANJU_SECRET_VALUE;
  if (!resolved) {
    throw new CliError(`No value given for ${name}`, {
      hint: 'Pass it as the second argument, or put it in GANJU_SECRET_VALUE to keep it out of your shell history.'
    });
  }

  const { api, artifactPath } = await commandContext();

  // The broker resolves a label to the newest row carrying it, so a second
  // secret under one name would silently win and the first would become
  // unreachable while still showing in every list. `set` reads as an upsert, so
  // it replaces rather than inheriting that shadow.
  const rows = await api.request<CredentialRow[]>(`${artifactPath}/credential`);
  const existing = secretsNamed(rows, name);
  for (const row of existing) {
    await api.request(`${artifactPath}/credential/${row.id}`, {
      method: 'DELETE'
    });
  }

  await api.request(`${artifactPath}/credential`, {
    method: 'POST',
    json: { provider: PROVIDER, label: name, apiKey: resolved }
  });

  success(
    existing.length > 0
      ? `replaced ${color.bold(name)}`
      : `set ${color.bold(name)}`
  );
  note(color.gray(`  live from the next call — no deploy needed`));
};

const remove = async (name?: string): Promise<void> => {
  if (!name)
    throw new CliError('Which secret?', { hint: 'ganju secret rm NAME' });

  const { api, artifactPath } = await commandContext();
  const rows = await api.request<CredentialRow[]>(`${artifactPath}/credential`);
  const matches = secretsNamed(rows, name);

  if (matches.length === 0) {
    throw new CliError(`No secret named ${name}`, {
      hint: 'Run `ganju secret list` to see what is set.'
    });
  }

  for (const row of matches) {
    await api.request(`${artifactPath}/credential/${row.id}`, {
      method: 'DELETE'
    });
  }

  success(`removed ${color.bold(name)}`);
  note(color.gray(`  ctx.secret('${name}') will throw from the next call`));
};

export const secret = async (args: string[]): Promise<void> => {
  const [action, ...rest] = args;
  switch (action) {
    case 'list':
    case 'ls':
      return list();
    case 'set':
      return set(rest[0], rest[1]);
    case 'rm':
    case 'remove':
    case 'delete':
      return remove(rest[0]);
    default:
      say('Usage:');
      say('  ganju secret set NAME VALUE');
      say('  ganju secret list');
      say('  ganju secret rm NAME');
      if (action) process.exitCode = 1;
  }
};
