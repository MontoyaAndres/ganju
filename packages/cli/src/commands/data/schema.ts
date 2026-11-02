import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import type {
  DataQuery,
  DataQueryInput,
  DataTable,
  DataTableCopy,
  DataTableInput
} from '@ganju/utils/data';
import { toTableInput } from '@ganju/utils/dataImport';

import type { DataApi } from '../../data/routes.js';
import {
  SchemaFileError,
  checkSchemaFile,
  checkSchemaQueries,
  describeStep,
  diffSchema,
  type SchemaPlan,
  type SchemaStep
} from '../../data/schemaDiff.js';
import { CliError } from '../../errors.js';
import {
  color,
  json as printJson,
  note,
  say,
  step as progress,
  success,
  warn
} from '../../output.js';
import {
  confirmDestructive,
  dataContext,
  listTables,
  noteUndo,
  requireDatabase,
  waitForCopy,
  type DataOptions
} from './shared.js';

/**
 * `ganju.data.json` — the database's schema, kept beside the code and
 * reviewed like it.
 *
 * It holds the same shape an export's schema.json does: `{ "tables": [...] }`,
 * each table written the way you would type it to create it, and the named
 * queries as `"queries": [...]` when the database has any. So `pull` after
 * `push` gives back the file you pushed, and a diff in a pull request reads as
 * a change to the schema rather than to its encoding.
 */
export const SCHEMA_FILE = 'ganju.data.json';

const schemaPath = (root: string, options: DataOptions) =>
  resolve(options.schema ?? join(root, SCHEMA_FILE));

const readSchemaFile = async (
  path: string
): Promise<{
  tables: DataTableInput[];
  queries: DataQueryInput[] | undefined;
}> => {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    throw new CliError(`There is no ${relative(process.cwd(), path) || path}`, {
      hint: '`ganju data schema pull` writes one from the database, or pass --schema <file>.'
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new CliError(`${path} is not valid JSON`, {
      hint: error instanceof Error ? error.message : undefined
    });
  }
  try {
    return {
      tables: checkSchemaFile(parsed),
      queries: checkSchemaQueries(parsed)
    };
  } catch (error) {
    if (!(error instanceof SchemaFileError)) throw error;
    throw new CliError(`${path}: ${error.problems[0]}`, {
      hint: error.problems.slice(1).join('\n  ') || undefined
    });
  }
};

const planFor = async (options: DataOptions) => {
  const { data, project } = await dataContext();
  const path = schemaPath(project.root, options);
  const desired = await readSchemaFile(path);
  const current = (await listTables(data)).map(toTableInput);
  const currentQueries = desired.queries ? await listQueryInputs(data) : [];
  try {
    return {
      data,
      path,
      plan: diffSchema(current, desired.tables, {
        current: currentQueries,
        desired: desired.queries
      })
    };
  } catch (error) {
    if (!(error instanceof SchemaFileError)) throw error;
    throw new CliError(`${path}: ${error.problems[0]}`);
  }
};

const symbol = (step: SchemaStep, destructive: boolean) => {
  if (destructive) return color.red('-');
  if (
    step.kind === 'createTable' ||
    step.kind === 'addColumn' ||
    (step.kind === 'saveQuery' && !step.changed)
  )
    return color.green('+');
  return color.yellow('~');
};

const printPlan = (plan: SchemaPlan) => {
  for (const step of plan.steps) {
    const destructive = plan.destructive.includes(step);
    const line = `${symbol(step, destructive)} ${describeStep(step)}`;
    say(destructive ? `${line} ${color.red('(needs --yes)')}` : line);
  }
};

// The database's named queries as the file writes them: what saving them
// again would send.
const listQueryInputs = async (data: DataApi): Promise<DataQueryInput[]> => {
  const { queries } = await data.request<{ queries: DataQuery[] }>(
    'listQueries'
  );
  return queries.map(query => ({
    name: query.name,
    ...(query.description ? { description: query.description } : {}),
    sql: query.sql,
    ...(query.params.length ? { params: query.params } : {}),
    ...(query.assistant ? { assistant: true } : {})
  }));
};

export const pull = async (options: DataOptions): Promise<void> => {
  const { data, project } = await dataContext();
  await requireDatabase(data);
  const tables = (await listTables(data)).map(toTableInput);
  const queries = await listQueryInputs(data);
  const body = `${JSON.stringify(
    { tables, ...(queries.length ? { queries } : {}) },
    null,
    2
  )}\n`;
  if (options.json) {
    process.stdout.write(body);
    return;
  }
  const path = schemaPath(project.root, options);
  await writeFile(path, body);
  success(
    `wrote ${relative(process.cwd(), path) || path} (${tables.length} table${tables.length === 1 ? '' : 's'})`
  );
};

export const diff = async (options: DataOptions): Promise<void> => {
  const { plan } = await planFor(options);
  if (options.json) {
    printJson(plan);
    return;
  }
  if (!plan.steps.length) {
    note('The database matches the file');
    return;
  }
  printPlan(plan);
  if (plan.destructive.length) {
    note(
      color.gray(
        `\n  ${plan.destructive.length} of these drop or rewrite data; push applies them only with --yes`
      )
    );
  }
};

const apply = async (data: DataApi, step: SchemaStep): Promise<void> => {
  let copy: DataTableCopy | null | undefined;
  switch (step.kind) {
    case 'createTable':
      await data.request('createTable', { json: step.input });
      break;
    case 'addColumn':
      await data.request('addColumn', {
        params: { table: step.table },
        json: step.input
      });
      break;
    case 'updateColumn':
      ({ copy } = await data.request<{
        table: DataTable;
        copy?: DataTableCopy | null;
      }>('updateColumn', {
        params: { table: step.table, column: step.column },
        json: step.patch
      }));
      break;
    case 'updateTable':
      await data.request('updateTable', {
        params: { table: step.table },
        json: step.patch
      });
      break;
    case 'dropColumn':
      ({ copy } = await data.request<{ copy?: DataTableCopy | null }>(
        'dropColumn',
        {
          params: { table: step.table, column: step.column }
        }
      ));
      break;
    case 'dropTable':
      await data.request('dropTable', {
        params: { table: step.table },
        json: { confirmName: step.table }
      });
      break;
    case 'saveQuery':
      await data.request('saveQuery', { json: step.input });
      break;
    case 'dropQuery':
      await data.request('dropQuery', { params: { name: step.name } });
      break;
  }
  // The next step may touch the same table, which refuses changes until the
  // copy is done.
  await waitForCopy(data, copy);
};

const run = async (
  data: DataApi,
  steps: SchemaStep[],
  done: { count: number }
) => {
  for (const step of steps) {
    progress(describeStep(step));
    try {
      await apply(data, step);
    } catch (error) {
      if (done.count)
        note(
          color.gray(
            `  ${done.count} step${done.count === 1 ? '' : 's'} before this one were applied`
          )
        );
      throw error;
    }
    done.count++;
  }
};

export const push = async (options: DataOptions): Promise<void> => {
  const { data, plan } = await planFor(options);
  const database = await requireDatabase(data);
  if (database.copy?.status === 'running') {
    throw new CliError(
      `${database.copy.table} is being copied; schema changes wait for it`,
      {
        hint: 'ganju data copy wait'
      }
    );
  }
  if (!plan.steps.length) {
    note('The database already matches the file');
    return;
  }

  const safe = plan.steps.filter(s => !plan.destructive.includes(s));
  const done = { count: 0 };
  await run(data, safe, done);

  if (plan.destructive.length) {
    if (!options.yes) {
      warn(
        `${plan.destructive.length} change${plan.destructive.length === 1 ? '' : 's'} would drop or rewrite data:`
      );
      for (const s of plan.destructive)
        note(`  ${color.red('-')} ${describeStep(s)}`);
    }
    if (!options.yes && !process.stdin.isTTY) {
      throw new CliError(
        safe.length
          ? `Applied ${safe.length} change${safe.length === 1 ? '' : 's'}, and left out the ${plan.destructive.length} above`
          : `Left out the ${plan.destructive.length} change${plan.destructive.length === 1 ? '' : 's'} above; nothing was changed`,
        { hint: 'Run push again with --yes to apply them too.' }
      );
    }
    await confirmDestructive(options, 'apply these');
    // One restore point for the lot, taken before the first of them.
    const { bookmark } = await data.request<{ bookmark: string }>('checkpoint');
    await run(data, plan.destructive, done);
    success(
      `applied ${plan.steps.length} change${plan.steps.length === 1 ? '' : 's'}`
    );
    noteUndo(bookmark, 'the drops and type changes');
    return;
  }
  success(
    `applied ${plan.steps.length} change${plan.steps.length === 1 ? '' : 's'}`
  );
};

export const schemaCommand = async (args: string[], options: DataOptions) => {
  switch (args[0]) {
    case 'pull':
      return pull(options);
    case 'diff':
    case 'plan':
      return diff(options);
    case 'push':
    case 'apply':
      return push(options);
    default:
      throw new CliError(
        args[0] ? `Unknown action "schema ${args[0]}"` : 'Which schema action?',
        {
          hint: 'ganju data schema pull|diff|push [--schema ganju.data.json]'
        }
      );
  }
};
