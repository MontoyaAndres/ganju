// Table and column names an owner may use. Every name reaches SQL quoted, so
// SQL keywords are fine ("order" is a natural column); what is refused is
// what would collide with SQLite's own names or ours: a table name is also the
// prefix of its search table, and `__` is kept for those.

export const DATA_IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

// Columns every table has, set by the database, never by a caller.
export const DATA_SYSTEM_COLUMNS = ['id', 'created_at', 'updated_at'] as const;
// Kept on every row and never shown to the assistant.
export const DATA_HIDDEN_COLUMNS = [
  'version',
  'created_by',
  'updated_by',
  'participant_id'
] as const;

// Names SQLite gives a meaning of its own.
const SQLITE_ALIASES = new Set(['rowid', 'oid', '_rowid_']);

export type IdentifierKind = 'table' | 'column';

// Why `name` can't be used, or null when it can.
export const identifierIssue = (
  name: unknown,
  kind: IdentifierKind
): string | null => {
  if (typeof name !== 'string' || name.length === 0) {
    return `A ${kind} needs a name.`;
  }
  if (!DATA_IDENTIFIER_PATTERN.test(name)) {
    return `"${name}" isn't a valid ${kind} name: use lowercase letters, digits and _, starting with a letter, up to 63 characters.`;
  }
  if (name.includes('__')) {
    return `"${name}": two underscores in a row are reserved.`;
  }
  if (name.startsWith('sqlite_') || name.startsWith('_ganju_')) {
    return `"${name}" is a reserved name.`;
  }
  // Tables share one namespace with indexes and triggers, which we name
  // ix_<table>_<column>, ux_… and tr_….
  if (kind === 'table' && /^(ix|ux|tr)_\d/.test(name)) {
    return `"${name}" looks like one of the database's own index names; pick another table name.`;
  }
  if (SQLITE_ALIASES.has(name)) {
    return `"${name}" is reserved by SQLite; pick another ${kind} name (e.g. "${name}_ref").`;
  }
  if (
    kind === 'column' &&
    ((DATA_SYSTEM_COLUMNS as readonly string[]).includes(name) ||
      (DATA_HIDDEN_COLUMNS as readonly string[]).includes(name))
  ) {
    return `"${name}" is a column every table already has.`;
  }
  return null;
};

export const isValidIdentifier = (name: unknown, kind: IdentifierKind) =>
  identifierIssue(name, kind) === null;

// Only ever called with a name that passed identifierIssue, or with one of
// our own (`_ganju_*`, system columns); the quotes keep keywords inert.
export const quoteIdentifier = (name: string): string => `"${name}"`;
