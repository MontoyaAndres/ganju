import { CliError } from '../../errors.js';
import { color, say } from '../../output.js';
import {
  changes,
  checkpoint,
  copy,
  create,
  drop,
  exportData,
  indexAdvice,
  info,
  restore,
  timeZone
} from './database.js';
import { importFile } from './import.js';
import { queries, queryCommand, run } from './queries.js';
import { get, history, insert, remove, rows, update, write } from './rows.js';
import { schemaCommand } from './schema.js';
import type { DataOptions } from './shared.js';
import { columnCommand, tableCommand, tables } from './tables.js';

/**
 * `ganju data` — the project's database from a terminal.
 *
 * Every command is a client of the Data API the dashboard uses, so a row
 * written here is the same write, checked by the same rules, and recorded
 * under the token or person that made it. Anything that drops, deletes or
 * rewrites asks for `--yes`; dropping the database or a table also asks for
 * its name, typed with `--confirm`.
 */

export const dataUsage = () => {
  say(`${color.bold('ganju data')} — the project's database

${color.bold('Database')}
  ganju data create [--name <name>]          make the project's database (Pro)
  ganju data info                            status, size and tables
  ganju data drop --yes --confirm <name>     delete it (restorable for 7 days)
  ganju data restore                         undo a delete
  ganju data restore --at <ISO time> --yes   go back to a point in time
  ganju data restore --bookmark <b> --yes    go back to a bookmark (the undo of a drop)
  ganju data checkpoint                      take a bookmark of right now
  ganju data time-zone [<zone> | --clear]    the zone datetimes come back in (America/Bogota)
  ganju data export [--format jsonl|csv] [--out <dir>]
  ganju data changes                         the schema change log
  ganju data copy [status|wait|dismiss]      a table copy running in the background
  ganju data index add|dismiss <id>          act on an index suggestion (ids in info)

${color.bold('Tables')}
  ganju data tables
  ganju data table create <name> --schema <file>
  ganju data table rename <name> <new-name>
  ganju data table rm <name> --yes --confirm <name>
  ganju data table sync <name>               read a synced table's sheet again now
  ganju data column add <table> <name> <type> [--input '<json>']
  ganju data column rename <table> <name> <new-name>
  ganju data column change <table> <name> --input '{"type":"decimal"}' [--yes]
  ganju data column rm <table> <name> --yes

${color.bold('Schema as code')} (ganju.data.json, or --schema <file>)
  ganju data schema pull                     write the database's schema to the file
  ganju data schema diff                     what push would change
  ganju data schema push [--yes]             apply it; drops and type changes need --yes

${color.bold('Rows')}
  ganju data rows <table> [--where status=open] [--sort -created_at] [--limit 50]
                          [--search pizza] [--include product] [--all] [--json]
  ganju data get <table> <id>
  ganju data insert <table> --input '<json>' | --input-file rows.jsonl
  ganju data update <table> <id> --input '<json>' [--version <n>]
  ganju data delete <table> <id>... [--yes]
  ganju data history <table> <id>
  ganju data write --input-file ops.json     several writes, all or nothing
  ganju data import <table> <file.csv|.xlsx|.jsonl> [--map 'Header=column']
                          [--sheet <name>] [--replace --yes --confirm <table>]

${color.bold('Named queries')} (a SELECT saved once, run by name)
  ganju data queries                         the saved queries and what they read
  ganju data query save --input-file <file>  { name, description, sql, params, assistant }
  ganju data query rm <name> --yes
  ganju data run <name> [--input '{"from":"2026-10-01"}'] [--limit 100] [--json]

${color.bold('--where')}
  column=value  !=  >  >=  <  <=  ~ (contains)  ^= (starts with)
  status=[open,done] (any of)   note=null (empty)   code="007" (quotes: text)
  on a text column the value is text as typed: phone=3001234567
  repeat it to require several; or pass the JSON itself: '{"price":{"lt":30000}}'`);
};

export const data = async (
  args: string[],
  options: DataOptions
): Promise<void> => {
  const [command, ...rest] = args;
  switch (command) {
    case undefined:
    case 'help':
      dataUsage();
      return;
    case 'create':
      return create(options);
    case 'info':
    case 'status':
      return info(options);
    case 'drop':
      return drop(options);
    case 'restore':
      return restore(options);
    case 'checkpoint':
      return checkpoint(options);
    case 'time-zone':
    case 'timezone':
      return timeZone(rest[0], options);
    case 'export':
      return exportData(options);
    case 'changes':
    case 'log':
      return changes(options);
    case 'copy':
      return copy(rest[0], options);
    case 'index':
      return indexAdvice(rest[0], rest[1]);
    case 'tables':
      return tables(options);
    case 'table':
      return tableCommand(rest, options);
    case 'column':
      return columnCommand(rest, options);
    case 'schema':
      return schemaCommand(rest, options);
    case 'rows':
      return rows(rest[0], options);
    case 'get':
      return get(rest[0], rest[1], options);
    case 'insert':
      return insert(rest[0], options);
    case 'update':
      return update(rest[0], rest[1], options);
    case 'delete':
    case 'rm':
      return remove(rest[0], rest.slice(1), options);
    case 'history':
      return history(rest[0], rest[1], options);
    case 'write':
      return write(options);
    case 'import':
      return importFile(rest[0], rest[1], options);
    case 'queries':
      return queries(options);
    case 'query':
      return queryCommand(rest, options);
    case 'run':
      return run(rest[0], options);
    default:
      throw new CliError(`Unknown command "data ${command}"`, {
        hint: 'Run `ganju data` to see what there is.'
      });
  }
};
