import type { DataTable } from '@ganju/utils/data';

import { CliError } from '../errors.js';

/**
 * `--where` as people type it, turned into the JSON the rows route takes.
 *
 * Each flag is one condition, and repeated flags all have to hold:
 *
 *   --where status=open --where 'price<30000'
 *     → { "status": "open", "price": { "lt": 30000 } }
 *
 * A value that starts with `{` is taken as the JSON itself, so anything the
 * shorthand can't say (an `or` the API grows later, a comparison with another
 * column) is still one flag away. The shorthand stays deliberately small: the
 * route's own operators and nothing else, so there is no second query
 * language to learn and nothing for the two to disagree about.
 */

export type Where = Record<string, unknown>;

// A column's type, by the name `--where` uses for it; undefined when unknown.
export type ColumnTypeOf = (column: string) => string | undefined;

// Columns whose values are text, so `phone=3001234567` means the text and
// not the number: compared with a text column, a number matches nothing.
const TEXT_TYPES = new Set([
  'text',
  'long_text',
  'email',
  'url',
  'phone',
  'enum',
  'date',
  'datetime'
]);

/**
 * The types of `table`'s columns, following relations for a path like
 * `product.name`. Built from the tables `GET /table` lists.
 */
export const columnTypes =
  (
    tables: Pick<DataTable, 'name' | 'columns'>[],
    table: string
  ): ColumnTypeOf =>
  path => {
    let current = tables.find(t => t.name === table);
    const parts = path.split('.');
    for (const [index, part] of parts.entries()) {
      const column = current?.columns.find(c => c.name === part);
      if (!column) return undefined;
      if (index === parts.length - 1) return column.type;
      if (column.type !== 'relation') return undefined;
      current = tables.find(t => t.name === column.table);
    }
    return undefined;
  };

// Longest first, so `>=` is not read as `>` followed by "=5".
const OPERATORS = [
  ['!=', 'ne'],
  ['>=', 'gte'],
  ['<=', 'lte'],
  ['^=', 'startsWith'],
  ['~', 'contains'],
  ['=', 'eq'],
  ['>', 'gt'],
  ['<', 'lt']
] as const;

// A column, or a path through a relation: `product.name`.
const COLUMN = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A value as typed. Numbers, `true`, `false` and `null` mean themselves;
 * anything in double quotes is text exactly as written, so `code="007"` keeps
 * its zeros. Everything else is text. The API converts a value to the column's
 * type anyway, so this only has to be right where the two readings differ.
 * For a text column (`asText`), only `null` and quotes are read: the rest is
 * the text as typed.
 */
export const parseValue = (raw: string, asText = false): unknown => {
  const text = raw.trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text.slice(1, -1);
    }
  }
  if (text === 'null') return null;
  if (asText) return text;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (NUMBER.test(text)) return Number(text);
  return text;
};

// `[open,done]` is a list: `status=[open,done]` reads as "in".
const parseList = (raw: string, asText: boolean): unknown[] | null => {
  const text = raw.trim();
  if (!text.startsWith('[') || !text.endsWith(']')) return null;
  const inner = text.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(',').map(item => parseValue(item, asText));
};

const parseCondition = (
  input: string,
  typeOf?: ColumnTypeOf
): [string, string, unknown] => {
  for (const [symbol, operator] of OPERATORS) {
    const at = input.indexOf(symbol);
    if (at <= 0) continue;
    const column = input.slice(0, at).trim();
    // `a<=b` also contains `=` and `<`; the first operator that leaves a
    // valid column name on its left is the one meant.
    if (!COLUMN.test(column)) continue;
    const raw = input.slice(at + symbol.length);
    const asText = TEXT_TYPES.has(typeOf?.(column) ?? '');
    const list = parseList(raw, asText);
    if (list) {
      if (operator !== 'eq' && operator !== 'ne') {
        throw new CliError(`--where "${input}": a list goes with = or !=`, {
          hint: 'e.g. --where status=[open,done]'
        });
      }
      if (list.length === 0) {
        throw new CliError(`--where "${input}": the list is empty`);
      }
      return [column, operator === 'eq' ? 'in' : 'notIn', list];
    }
    const value = parseValue(raw, asText);
    if (
      (operator === 'contains' || operator === 'startsWith') &&
      typeof value !== 'string'
    ) {
      // `name~12` searches for the text "12", not the number.
      return [column, operator, raw.trim()];
    }
    return [column, operator, value];
  }
  throw new CliError(`--where "${input}" is not a condition`, {
    hint: 'Write column=value, or one of != > >= < <= ~ (contains) ^= (starts with), or JSON: --where \'{"price":{"lt":30000}}\''
  });
};

// Two conditions on one column become one operator object; `=` alone stays a
// bare value, which is how the API's own examples write it.
const addCondition = (
  where: Where,
  column: string,
  operator: string,
  value: unknown
) => {
  const current = where[column];
  if (current === undefined) {
    where[column] = operator === 'eq' ? value : { [operator]: value };
    return;
  }
  const merged: Record<string, unknown> = isPlainObject(current)
    ? { ...current }
    : { eq: current };
  if (operator in merged) {
    throw new CliError(`--where gives ${column} "${operator}" twice`, {
      hint: 'Use one condition per operator, e.g. --where "price>=10" --where "price<20".'
    });
  }
  merged[operator] = value;
  where[column] = merged;
};

export const parseWhere = (
  inputs: string | string[] | undefined,
  // The table's column types. Without them, a number-like value is a number.
  typeOf?: ColumnTypeOf
): Where | undefined => {
  const list =
    inputs === undefined ? [] : Array.isArray(inputs) ? inputs : [inputs];
  if (list.length === 0) return undefined;
  const where: Where = {};
  for (const input of list) {
    const text = input.trim();
    if (!text) continue;
    if (text.startsWith('{')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new CliError('--where starts with "{" but is not valid JSON', {
          hint: `Got ${text}`
        });
      }
      if (!isPlainObject(parsed)) {
        throw new CliError('--where JSON is an object, e.g. {"status":"open"}');
      }
      for (const [column, condition] of Object.entries(parsed)) {
        if (where[column] === undefined) where[column] = condition;
        else if (isPlainObject(condition)) {
          for (const [operator, value] of Object.entries(condition)) {
            addCondition(where, column, operator, value);
          }
        } else addCondition(where, column, 'eq', condition);
      }
      continue;
    }
    const [column, operator, value] = parseCondition(text, typeOf);
    addCondition(where, column, operator, value);
  }
  return Object.keys(where).length ? where : undefined;
};
