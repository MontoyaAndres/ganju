import type { DataQuery } from '@ganju/utils/data';

import { CliError } from '../../errors.js';
import {
  color,
  json as printJson,
  note,
  say,
  success,
  table
} from '../../output.js';
import {
  confirmDestructive,
  dataContext,
  formatCell,
  readInput,
  type DataOptions
} from './shared.js';

const QUERY_EXAMPLE =
  'ganju data query save --input-file sales.json, with { "name": "sales_by_product", "sql": "SELECT … WHERE placed_at >= :from", "params": [{ "name": "from", "type": "datetime" }] }';

/** `ganju data queries`: the saved queries, with what they read. */
export const queries = async (options: DataOptions) => {
  const { data } = await dataContext();
  const { queries: list } = await data.request<{ queries: DataQuery[] }>(
    'listQueries'
  );
  if (options.json) {
    printJson(list);
    return;
  }
  if (list.length === 0) {
    note('No named queries yet.');
    note(color.gray(`Save one with ${QUERY_EXAMPLE}`));
    return;
  }
  table([
    ['NAME', 'PARAMS', 'READS', 'ASSISTANT', 'DESCRIPTION'].map(c =>
      color.gray(c)
    ),
    ...list.map(query => [
      query.name,
      query.params.map(p => `${p.name}:${p.type}`).join(', ') || '—',
      query.tables.join(', '),
      query.assistant ? 'yes' : 'no',
      formatCell(query.description)
    ])
  ]);
};

/** `ganju data query save|rm`. */
export const queryCommand = async (args: string[], options: DataOptions) => {
  const [sub, name] = args;
  const { data } = await dataContext();
  if (sub === 'save') {
    const input = await readInput(options, QUERY_EXAMPLE);
    const { query } = await data.request<{ query: DataQuery }>('saveQuery', {
      json: input
    });
    success(
      `Saved ${query.name}; it reads ${query.tables.join(', ') || 'no table'}`
    );
    const scans = query.plan.filter(line => /^SCAN \S+$/.test(line.trim()));
    if (scans.length)
      note(color.gray(`Its plan reads whole tables: ${scans.join('; ')}`));
    return;
  }
  if (sub === 'rm' || sub === 'drop') {
    if (!name)
      throw new CliError('Which query?', {
        hint: 'ganju data query rm <name> --yes'
      });
    await confirmDestructive(options, `delete the named query ${name}`);
    await data.request('dropQuery', { params: { name } });
    success(`Deleted ${name}`);
    return;
  }
  throw new CliError(`Unknown command "data query ${sub ?? ''}"`, {
    hint: 'ganju data query save --input-file <file> · ganju data query rm <name> --yes'
  });
};

/** `ganju data run <name> [--input '{"from":"…"}']`: one named query's rows. */
export const run = async (name: string | undefined, options: DataOptions) => {
  if (!name) {
    throw new CliError('Which query?', {
      hint: 'ganju data run <name> --input \'{"from":"2026-10-01"}\''
    });
  }
  const params =
    options.input === undefined && options.inputFile === undefined
      ? undefined
      : await readInput(options, '');
  const limit =
    options.limit === undefined
      ? undefined
      : Number.parseInt(options.limit, 10);
  const { data } = await dataContext();
  const result = await data.request<{
    rows: Record<string, unknown>[];
    truncated?: string;
  }>('runQuery', {
    params: { name },
    json: {
      ...(params !== undefined ? { params } : {}),
      ...(limit !== undefined ? { limit } : {}),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  });
  if (options.json) {
    printJson(result);
    return;
  }
  if (result.rows.length === 0) {
    say(color.gray('No rows.'));
  } else {
    const columns = Object.keys(result.rows[0]);
    table([
      columns.map(c => color.gray(c.toUpperCase())),
      ...result.rows.map(row => columns.map(c => formatCell(row[c])))
    ]);
  }
  if (result.truncated) note(color.gray(result.truncated));
};
