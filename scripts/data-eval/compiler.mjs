// The eval's database: the real engine from packages/utils (what the
// ProjectDatabase object runs), on a local node:sqlite file through the same
// runner interface. Only the seeding is the eval's own: it writes rows as they
// would be after months of use, created_at and customer included.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// packages/utils/src/data.ts bundled for Node, so the eval needs no build step
// and always runs the source as it stands.
const loadEngine = async () => {
  const outfile = path.join(os.tmpdir(), `ganju-eval-data-${process.pid}.mjs`);
  await build({
    entryPoints: [path.join(ROOT, 'packages/utils/src/data.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile,
    logLevel: 'error'
  });
  const module = await import(outfile);
  fs.rmSync(outfile, { force: true });
  return module;
};

const engine = await loadEngine();

export const DataError = engine.DataError;
export const ACCESS_RANK = engine.DATA_ACCESS_RANK;
export const isSensitiveWrite = engine.isSensitiveWrite;

// The engine's source files, for the harness's tools hash.
export const ENGINE_SOURCES = fs
  .readdirSync(path.join(ROOT, 'packages/utils/src'))
  .filter(name => /^data.*\.ts$/.test(name))
  .sort()
  .map(name => path.join(ROOT, 'packages/utils/src', name));

const quote = name => `"${name}"`;

const isoSeconds = date => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

// node:sqlite under the engine's runner, nesting with savepoints the way
// transactionSync does.
const runnerFor = db => {
  let depth = 0;
  return {
    all: (sql, params = []) => db.prepare(sql).all(...params),
    iterate: (sql, params = []) => db.prepare(sql).iterate(...params),
    transaction: fn => {
      const name = `sp_${depth++}`;
      db.exec(`SAVEPOINT ${name}`);
      try {
        const result = fn();
        db.exec(`RELEASE ${name}`);
        return result;
      } catch (error) {
        db.exec(`ROLLBACK TO ${name}`);
        db.exec(`RELEASE ${name}`);
        throw error;
      } finally {
        depth--;
      }
    },
    databaseSize: () => 0
  };
};

// The eval's sessions as the engine's callers: the owner's MCP session sees
// every table; a channel customer is held to each table's access and sees
// only their own rows on customer-scoped tables.
const callerFor = (state, actor) =>
  actor?.mode === 'owner'
    ? { actor: 'mcp:owner', timeZone: state.definition.timeZone }
    : {
        actor: `channel:${actor?.participantId ?? 'customer'}`,
        restricted: true,
        participantId: actor?.participantId,
        timeZone: state.definition.timeZone
      };

export const openDatabase = (definition, { now = new Date() } = {}) => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const runner = runnerFor(db);
  engine.migrateInternal(runner);
  const owner = { actor: 'system:eval' };
  for (const table of definition.tables) {
    engine.createTable(runner, engine.loadSchema(runner), owner, {
      ...table,
      history: false
    });
  }
  const schema = engine.loadSchema(runner);
  const rows = definition.seed(seedHelpers(now, definition.timeZone));
  db.exec('BEGIN');
  for (const table of definition.tables) {
    for (const row of rows[table.name] || []) {
      const { participant_id, created_at, ...values } = row;
      const names = Object.keys(values);
      const params = names.map(name => storeSeedValue(table, name, values[name]));
      const extra = [];
      if (created_at) extra.push(['created_at', created_at], ['updated_at', created_at]);
      if (participant_id) extra.push(['participant_id', participant_id]);
      db.prepare(
        `INSERT INTO ${quote(table.name)} (${[...names, ...extra.map(e => e[0])]
          .map(quote)
          .join(', ')}) VALUES (${[...names, ...extra].map(() => '?').join(', ')})`
      ).run(...params, ...extra.map(e => e[1]));
    }
  }
  db.exec('COMMIT');
  return { db, runner, schema, definition };
};

const storeSeedValue = (table, name, value) => {
  const column = table.columns.find(c => c.name === name);
  if (!column) throw new Error(`seed: unknown column ${table.name}.${name}`);
  if (column.type === 'boolean') return value ? 1 : 0;
  if (column.type === 'json') return JSON.stringify(value);
  return value;
};

// Dates for seeds, relative to the run's "now" so "today" and "this week"
// stay true whenever the eval runs. Local times are in the database's zone.
const seedHelpers = (now, timeZone) => {
  const offsetMinutes = zoneOffsetMinutes(now, timeZone);
  const localNow = new Date(now.getTime() + offsetMinutes * 60_000);
  const localMidnight = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate()
  );
  const toUtc = localMs => new Date(localMs - offsetMinutes * 60_000);
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return {
    now,
    random,
    pick: list => list[Math.floor(random() * list.length)],
    // A datetime `days` days before today, at local `hour`:`minute`; today's
    // times are capped at a minute before now so nothing is in the future.
    at: (days, hour = 12, minute = 0) => {
      const local = localMidnight - days * 86_400_000 + (hour * 60 + minute) * 60_000;
      const utc = toUtc(local);
      return isoSeconds(utc > now ? new Date(now.getTime() - 60_000 * (1 + hour)) : utc);
    },
    // A datetime `days` days from today (negative for the past), at local time.
    future: (days, hour = 12, minute = 0) =>
      isoSeconds(toUtc(localMidnight + days * 86_400_000 + (hour * 60 + minute) * 60_000)),
    date: days =>
      new Date(localMidnight - days * 86_400_000).toISOString().slice(0, 10)
  };
};

export const zoneOffsetMinutes = (date, timeZone) => {
  if (!timeZone) return 0;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
    .formatToParts(date)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
};

// The three tools

export const describe = (state, args = {}, actor) =>
  engine.describe(state.runner, state.schema, callerFor(state, actor), args);

export const query = (state, args, actor) =>
  engine.query(state.runner, state.schema, callerFor(state, actor), args);

export const write = (state, args, actor) =>
  engine.write(state.runner, state.schema, callerFor(state, actor), args);

// What data-query's description lists: the tables the caller can see, with
// their columns.
export const tableSummaries = (state, actor) => {
  const caller = callerFor(state, actor);
  return state.schema.tables
    .filter(table => !caller.restricted || ACCESS_RANK[table.access] >= 1)
    .map(table => ({
      name: table.name,
      description: table.description,
      access: caller.restricted ? table.access : 'full',
      scoped: Boolean(caller.restricted && table.customerScoped),
      columns: table.columns.map(column => ({
        name: column.name,
        type: column.type,
        values: column.values ?? undefined,
        min: column.min ?? undefined,
        references: column.type === 'relation' ? column.table : undefined
      }))
    }));
};
