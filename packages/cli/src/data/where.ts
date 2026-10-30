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
 */
export const parseValue = (raw: string): unknown => {
  const text = raw.trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text.slice(1, -1);
    }
  }
  if (text === 'null') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (NUMBER.test(text)) return Number(text);
  return text;
};

// `[open,done]` is a list: `status=[open,done]` reads as "in".
const parseList = (raw: string): unknown[] | null => {
  const text = raw.trim();
  if (!text.startsWith('[') || !text.endsWith(']')) return null;
  const inner = text.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(',').map(item => parseValue(item));
};

const parseCondition = (input: string): [string, string, unknown] => {
  for (const [symbol, operator] of OPERATORS) {
    const at = input.indexOf(symbol);
    if (at <= 0) continue;
    const column = input.slice(0, at).trim();
    // `a<=b` also contains `=` and `<`; the first operator that leaves a
    // valid column name on its left is the one meant.
    if (!COLUMN.test(column)) continue;
    const raw = input.slice(at + symbol.length);
    const list = parseList(raw);
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
    const value = parseValue(raw);
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
  inputs: string | string[] | undefined
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
    const [column, operator, value] = parseCondition(text);
    addCondition(where, column, operator, value);
  }
  return Object.keys(where).length ? where : undefined;
};
