// Entry point for `@ganju/utils/data`: everything a project's database and
// its callers share, without pulling in the rest of the package.
export * from './dataTypes';
export {
  DATA_IDENTIFIER_PATTERN,
  DATA_SYSTEM_COLUMNS,
  DATA_HIDDEN_COLUMNS,
  identifierIssue,
  isValidIdentifier
} from './dataIdentifiers';
export {
  createTableSql,
  columnDefinitionSql,
  desiredIndexes,
  desiredTriggers,
  ftsCreateSql,
  ftsTableName,
  searchableColumns,
  sqlLiteral
} from './dataDdl';
export {
  chunkRows,
  rowsPerInsert,
  ftsMatch,
  keysetCondition,
  encodeCursor,
  decodeCursor,
  isSensitiveWrite,
  tidyArgs,
  zoned
} from './dataCompiler';
export type { SqlValue, KeysetCursor, SortKey } from './dataCompiler';
export {
  INTERNAL_MIGRATIONS,
  INTERNAL_SCHEMA_VERSION,
  hasInternalTables,
  getMeta,
  setMeta,
  migrateInternal,
  loadSchema,
  toTableInput,
  normaliseColumn,
  translateSqliteError,
  describe,
  query,
  write,
  rowHistory,
  pruneHistory,
  createTable,
  updateTable,
  dropTable,
  addColumn,
  updateColumn,
  dropColumn,
  columnChangeNeedsRebuild,
  dropColumnNeedsRebuild,
  assertActor,
  assertWritable,
  exportRows
} from './dataEngine';
export type { SqlRow, SqlRunner } from './dataEngine';
export type {
  ProjectDatabaseRpc,
  DatabaseInfo,
  ExportFile,
  ExportFormat,
  ExportState,
  RestoreResult
} from './dataRpc';
