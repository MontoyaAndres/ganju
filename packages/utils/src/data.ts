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
  fileUriOf,
  unknownFileUris,
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
  fileLinks,
  replaceFileLinks,
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
export { adviseIndexes, adviceDoubled } from './dataIndexAdvice';
export type {
  IndexAdviceCandidate,
  IndexAdviceInput,
  IndexAdviceStat
} from './dataIndexAdvice';
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
export {
  DATA_TRIGGER_EVENTS,
  DATA_CHANGE_EVENTS,
  DATA_TRIGGER_ACTIONS,
  DATA_MAX_TRIGGERS,
  DATA_TRIGGER_MAX_DEPTH,
  DATA_TRIGGER_DEFAULT_RATE,
  DATA_TRIGGER_MAX_RATE,
  DATA_OUTBOX_BATCH,
  DATA_TRIGGER_MAX_MESSAGE_BYTES,
  DATA_TIME_SCAN_MS,
  DATA_TIME_MIN_MINUTES,
  DATA_TIME_MAX_MINUTES,
  DATA_MAX_TIME_TRIGGERS,
  DATA_TIME_EVENTS_PER_SCAN,
  DATA_TIME_EVENTS_PER_DAY,
  utf8Bytes,
  conditionMatches,
  renderTriggerText,
  renderCustomerMessage,
  readEventRow,
  normaliseTrigger,
  normaliseCustomerAction,
  listTriggers,
  getTrigger,
  saveTrigger,
  dropTrigger,
  setTriggerEnabled,
  replaceManagedTriggers,
  collectTriggerEvents,
  readOutbox,
  deleteOutbox,
  outboxSize,
  clearOutbox,
  triggersUsingColumn,
  renameColumnInTriggers,
  timeTriggersCountingFrom,
  syncTimeIndexes,
  hasTimeTriggers,
  scanTimeTriggers
} from './dataTriggers';
export type {
  DataTrigger,
  DataTriggerAction,
  DataTriggerActionType,
  DataTriggerCondition,
  DataTriggerCustomerMessage,
  DataTriggerEvent,
  DataTriggerEventMessage,
  DataTriggerInput,
  DataTriggerSchedule,
  DataTriggerTemplate,
  DataTriggerTest,
  DataTriggerWithSecret,
  SavedTrigger,
  TimeScanResult
} from './dataTriggers';
