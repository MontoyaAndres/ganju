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
  deleteImpact,
  createTable,
  updateTable,
  dropTable,
  addColumn,
  updateColumn,
  dropColumn,
  columnChangeNeedsRebuild,
  dropColumnNeedsRebuild,
  readTableCopy,
  clearFailedTableCopy,
  copyTableStep,
  writeReachesCopy,
  assertActor,
  assertWritable,
  exportRows
} from './dataEngine';
export type { SqlRow, SqlRunner } from './dataEngine';
export {
  DATA_QUERY_PARAM_TYPES,
  DATA_MAX_QUERIES,
  DATA_MAX_QUERY_SQL,
  DATA_MAX_QUERY_PARAMS,
  DATA_DEFAULT_QUERY_ROWS,
  compileQuerySql,
  checkQueryPlan,
  listQueries,
  queriesFor,
  saveQuery,
  dropQuery,
  runQuery
} from './dataQueries';
export type {
  DataQuery,
  DataQueryInput,
  DataQueryParam,
  DataQueryParamType
} from './dataQueries';
export type {
  ProjectDatabaseRpc,
  DatabaseInfo,
  ExportFile,
  ExportFormat,
  ExportState,
  RestoreResult
} from './dataRpc';
export {
  DATA_TOOL_DESCRIBE,
  DATA_TOOL_QUERY,
  DATA_TOOL_WRITE,
  DATA_TOOL_ADMIN,
  DATA_TOOL_NAMES,
  DATA_TOOL_TITLES,
  DATA_TOOL_MAX_LIMIT,
  DATA_ADMIN_ACTIONS,
  hasDataToolTables,
  dataToolDefinitions,
  dataAdminToolDefinition
} from './dataTools';
export type { DataToolDefinition, DataAdminAction } from './dataTools';
