import type { Catalog } from '../core';

/**
 * The Data view — a project's own database: tables, rows, imports, restores.
 *
 * Column and table names (`menu`, `price`) are identifiers the owner typed and
 * stay as they are. `CSV`, `JSONL` and `JSON` are format names. Messages the API
 * answers with ("menu.stock can't go below 0") are shown as they come.
 */
const en = {
  title: 'Data',
  subtitle: 'Tables your assistant and functions can read and write.',
  settings: 'Database settings',

  emptyTitle: 'No database yet',
  emptyText:
    'Give this project its own database: tables with typed columns, relations between them, and search. The assistant, your functions, the CLI and the API all use the same one.',
  whenData:
    'Rows with fields — menus, orders, customers, bookings, stock → Data.',
  whenResources:
    'Documents and pages the assistant reads and quotes → Resources.',
  databaseNameLabel: 'Name (optional)',
  databaseNamePlaceholder: 'project slug',
  databaseNameHelp:
    'You type it to delete the database. Defaults to the project slug.',
  createDatabase: 'Create database',
  creatingDatabase: 'Creating...',

  lockedBadge: 'Pro',
  lockedTitle: 'Data is part of Pro',
  lockedText:
    'Give each project a database of its own, with tables, relations and search, that your assistant and functions read and write.',
  upgrade: 'See plans',

  readOnlyTitle: 'Read-only',
  readOnlyText:
    "This organization's plan no longer includes Data. You can read and download everything; nothing can be changed until you upgrade.",
  deletedBannerTitle: 'This database is deleted',
  deletedBannerText:
    'It goes for good on {date}; until then you can restore it.',
  restoreDatabase: 'Restore database',
  restoring: 'Restoring...',
  statusCreating: 'Setting up the database...',
  statusFailed: 'The database could not be created.',
  tryAgain: 'Try again',
  statusPurging: 'This database is being removed.',

  undo: 'Undo',
  undoTableDropped: 'Table {name} dropped.',
  undoColumnDropped: 'Column {name} dropped.',
  undoConfirmTitle: 'Undo this change?',
  undoConfirmText:
    'The whole database goes back to just before the change. Anything written since — rows, tables, columns — is replaced.',

  tables: 'Tables',
  newTable: 'New table',
  newTableFromFile: 'New table from a file',
  searchTables: 'Search tables',
  noTablesTitle: 'Create your first table',
  noTablesText:
    'A table holds one kind of thing — the dishes you sell, your orders, your customers — with a column for each detail.',
  noTablesHint:
    'Already keep it in a spreadsheet? Start from the file: columns and types are guessed for you.',
  createNewDatabase: 'Create a new database',
  replaceConfirmTitle: 'Start a new database?',
  replaceConfirmText:
    'The deleted database can no longer be restored or downloaded once you start a new one, and it is emptied when its grace period ends. Download a copy first if you may need it.',
  noTablesMatch: 'No table matches.',
  pickTable: 'Pick a table to see its rows.',
  tabRows: 'Rows',
  tabSchema: 'Schema',

  searchRows: 'Search rows',
  refresh: 'Refresh',
  import: 'Import',
  newRow: 'New row',
  columnUpdated: 'Updated',
  rowsLoadFailed: 'The rows could not be loaded.',
  deleteSelected_one: 'Delete {count} row',
  deleteSelected_other: 'Delete {count} rows',

  newRowTitle: 'New row',
  rowTitle: 'Row {id}',
  deleteRow: 'Delete row',
  yes: 'Yes',
  no: 'No',
  errorJson: 'This is not valid JSON.',
  errorValue: 'This value is not valid here.',
  errorRequired: 'Required.',
  relationHelp: 'A row in {table}.',
  relationNoRows: 'No rows match.',
  relationLoading: 'Searching...',
  conflict: 'Someone changed this row after you opened it.',
  conflictBy:
    'This row changed after you opened it ({actor}). Load the latest version and make your change again.',
  conflictLoad: 'Load latest version',
  metaCreated: 'Created',
  metaUpdated: 'Updated',
  metaVersion: 'Version',
  noColumns: 'This table has no columns yet. Add one in the Schema tab.',

  deleteRowsTitle_one: 'Delete row',
  deleteRowsTitle_other: 'Delete {count} rows',
  deleteRowsText_one: 'This row will be deleted.',
  deleteRowsText_other: 'These {count} rows will be deleted.',
  deleteRowsAction: 'Delete',
  checkingRelated: 'Checking rows that point at it...',
  impactCascade_one: 'Also deletes {count} row in {table} ({column}).',
  impactCascade_other: 'Also deletes {count} rows in {table} ({column}).',
  impactSetNull_one: 'Clears {column} on {count} row in {table}.',
  impactSetNull_other: 'Clears {column} on {count} rows in {table}.',
  impactRestrict_one: '{count} row in {table} points at it through {column}.',
  impactRestrict_other: '{count} rows in {table} point at it through {column}.',
  impactUnknown: 'Rows in {table} may point at it through {column}.',
  impactBlocked:
    'It cannot be deleted while those rows point at it. Delete or change them first.',

  columnsTitle: 'Columns',
  columnCount_one: '{count} column, plus id and the created and updated times.',
  columnCount_other: '{count} columns, plus id and the created and updated times.',
  columnRules: 'Rules',
  ruleMin: 'Min {min}',
  ruleDefault: 'Default: {value}',
  addColumn: 'Add column',
  addColumnTitle: 'Add column',
  editColumn: 'Edit column',
  editColumnTitle: 'Edit column',
  dropColumn: 'Drop column',
  dropColumnTitle: 'Drop column',
  dropColumnText:
    'The column {column} and its value on every row of {table} go. You can undo it right after.',
  typeChangeWarning:
    'Changing the type copies the table. If some rows do not fit the new type, nothing changes and you get the list.',

  columnName: 'Name',
  columnType: 'Type',
  columnLabel: 'Label',
  columnLabelPlaceholder: 'Shown instead of the name',
  columnDescription: 'Description',
  columnDescriptionHelp: 'Tells the assistant what this column holds.',
  columnValues: 'Options',
  columnValuesHelp: 'Separated by commas.',
  columnTarget: 'Points at',
  columnOnDelete: 'When that row is deleted',
  columnMin: 'Minimum',
  columnMinHelp: 'Writes below it are refused, e.g. stock below 0.',
  columnDefault: 'Default',
  columnDefaultHelp: 'Used when a new row leaves it empty.',
  flagRequired: 'Required',
  flagRequiredHelp: 'Every row must have it',
  flagUnique: 'Unique',
  flagUniqueHelp: 'No two rows share a value',
  flagFilterable: 'Filterable',
  flagFilterableHelp: 'Indexed, for fast filters',
  flagSearchable: 'Searchable',
  flagSearchableHelp: 'Included in full-text search',
  moreOptions: 'More options',
  fewerOptions: 'Fewer options',
  columnNumber: 'Column {n}',
  removeColumn: 'Remove column',

  type_text: 'Text',
  type_long_text: 'Long text',
  type_integer: 'Whole number',
  type_decimal: 'Decimal number',
  type_boolean: 'Yes / no',
  type_date: 'Date',
  type_datetime: 'Date and time',
  type_enum: 'Options',
  type_json: 'JSON',
  type_email: 'Email',
  type_url: 'URL',
  type_phone: 'Phone',
  type_relation: 'Relation',
  type_file: 'File',

  onDelete_restrict: 'Block the delete',
  onDelete_cascade: 'Delete these rows too',
  onDelete_set_null: 'Clear this column',

  tableSettings: 'Table settings',
  tableName: 'Table name',
  tableNameHelp: 'Lowercase letters, digits and _, e.g. order_lines.',
  tableNameTaken: 'There is already a table called {name}.',
  identifierInvalid:
    'Use lowercase letters, digits and _, starting with a letter, without two _ in a row.',
  tableLabel: 'Label',
  tableLabelPlaceholder: 'Shown instead of the name',
  tableDescription: 'Description',
  tableDescriptionHelp:
    'Tells the assistant what this table is for, e.g. "the pizzas we sell, with price and stock".',
  displayColumn: 'Display column',
  displayColumnHelp:
    'What a relation to this table shows: "Margherita" instead of #12.',
  displayColumnId: 'The row id',
  access: 'Assistant access (channel bots)',
  access_none: 'None',
  access_read: 'Read',
  access_add: 'Read and add',
  access_full: 'Full',
  accessHelp_none:
    'Bots on your channels do not see this table. Your own MCP clients, as owner, still do.',
  accessHelp_read: 'Bots can look rows up, but not change them.',
  accessHelp_add: 'Bots can look rows up and add new ones, e.g. orders.',
  accessHelp_full:
    'Bots can add, change and delete rows. Deletes still ask for confirmation.',
  customerScoped: 'Each customer sees only their own rows',
  customerScopedHelp:
    'On channels, rows are tied to the customer who wrote them, e.g. "my orders".',
  history: 'Keep row history',
  historyHelp: 'Who changed each row and when, for 90 days.',
  toastTableSaved: 'Table saved',
  toastSaveTableFailed: 'The table could not be saved',

  relationsTitle: 'Relations',
  noRelations: 'No relations to or from this table.',
  relationOut: '{column} points at {table}',
  relationIn: '{table} points here through {column}',

  indexesTitle: 'Indexes',
  indexesHelp:
    'Filters and sorts on indexed columns stay fast as the table grows. Mark a column filterable or unique to index it; relations are indexed on their own.',
  indexUnique: 'unique',
  indexFilter: 'filter',
  indexAuto: 'relation',
  indexSearch: 'full-text search',

  dropTable: 'Drop table',
  dropTableTitle: 'Drop table',
  dropTableHelp: 'Removes the table and every row in it.',
  dropTableText:
    'The table {table} and all its rows go. You can undo it right after.',
  dropTableRelations:
    'Relations from {tables} point at this table: drop or change them first.',
  typeToConfirm: 'To confirm, type',

  newTableTitle: 'New table',
  newTableColumnsHelp:
    'Every table also gets an id, and created and updated times.',

  toastColumnAdded: 'Column added',
  toastColumnSaved: 'Column saved',
  toastSaveColumnFailed: 'The column could not be saved',
  toastDropColumnFailed: 'The column could not be dropped',
  toastDropTableFailed: 'The table could not be dropped',
  toastTableCreated: 'Table created',
  toastCreateTableFailed: 'The table could not be created',
  toastRowCreated: 'Row added',
  toastRowSaved: 'Row saved',
  toastSaveRowFailed: 'The row could not be saved',
  toastRowsDeleted_one: 'Row deleted',
  toastRowsDeleted_other: '{count} rows deleted',
  toastDeleteRowsFailed: 'The rows could not be deleted',
  toastDatabaseCreated: 'Database created',
  toastCreateDatabaseFailed: 'The database could not be created',
  toastDatabaseRestored: 'Database restored',
  toastRestoreFailed: 'The restore failed',
  toastRestored: 'Database restored to that moment',
  toastUndone: 'Change undone',
  toastDatabaseDeleted: 'Database deleted',
  toastDeleteDatabaseFailed: 'The database could not be deleted',
  toastExportFailed: 'The copy could not be prepared',
  toastDownloadFailed: 'The file could not be downloaded',

  settingsTitle: 'Database settings',
  databaseSection: 'Database',
  databaseName: 'Name',
  databaseSize: 'Size',
  databaseCreated: 'Created',
  sizeOf: '{used} of {max}',
  downloadCopy: 'Download a copy',
  downloadCopyHelp:
    'Every table as its own file, plus the schema. It is prepared in the background.',
  exportFormat: 'Format',
  exportRunning: 'Preparing...',
  exportRows_one: '{count} row',
  exportRows_other: '{count} rows',
  restoreTitle: 'Restore to a point in time',
  restoreHelp:
    'Bring the whole database back to how it was at any moment in the last 30 days. Everything after that moment is replaced.',
  restoreAt: 'Date and time',
  restoreAtInvalid: 'Pick a moment within the last 30 days.',
  restoreAction: 'Restore',
  restoreConfirmTitle: 'Restore the database?',
  restoreConfirmText:
    'Every table and row goes back to how it was on {date}. Everything written after that is replaced. You can undo the restore right after.',
  restoreDone: 'Restored.',
  undoRestore: 'Undo restore',
  dangerZone: 'Danger zone',
  deleteDatabase: 'Delete database',
  deleteDatabaseHelp:
    'Removes every table and row. It can be restored for 7 days.',
  deleteDatabaseTitle: 'Delete database',
  deleteDatabaseText: 'Deleting the database removes:',
  deleteDatabaseTables: 'every table and every row in it;',
  deleteDatabaseTools:
    'what the assistant and your functions read and write here — they stop working.',
  deleteDatabaseGrace_one:
    'For {count} day you can restore it (or download a copy). After that it goes for good.',
  deleteDatabaseGrace_other:
    'For {count} days you can restore it (or download a copy). After that it goes for good.',

  importTitle: 'Import into {table}',
  importNewTitle: 'New table from a file',
  importModeAdd: 'Add the rows to the table',
  importModeReplace: 'Replace all rows in the table',
  importReplaceWarning:
    "The table's rows are replaced by the file's. You can undo it right after the import. To confirm, type",
  importChooseFile: 'Choose a file',
  importOtherFile: 'Choose another file',
  importReading: 'Reading...',
  importFileHelp: 'CSV or Excel (.xlsx, .xls). The first row holds the column names.',
  importParseFailed: 'This file could not be read.',
  importRowCount_one: '{count} row',
  importRowCount_other: '{count} rows',
  importSheet: 'Sheet',
  importColumnsTitle: 'Columns',
  importColumnsHelp:
    'Guessed from the first 200 rows. Fix any name or type before creating the table, or untick a column to leave it out.',
  importMappingTitle: 'Columns',
  importMappingHelp:
    'Each column of the file goes into the table column chosen here. Relations match by the other table’s display column.',
  importSkip: 'Leave out',
  importPreviewTitle: 'Preview',
  importLine: 'Line',
  importReady_one: '{count} row ready.',
  importReady_other: '{count} rows ready.',
  importProblems_one: '{count} row has a problem and will be left out.',
  importProblems_other: '{count} rows have problems and will be left out.',
  importLineError: 'Line {line}: {error}',
  importAction_one: 'Import {count} row',
  importAction_other: 'Import {count} rows',
  importing: 'Importing...',
  importProgress: '{done} of {total} rows',
  importFailed: 'The import failed.',
  importInserted_one: '{count} row imported.',
  importInserted_other: '{count} rows imported.',
  importRefused_one: '{count} row was left out.',
  importRefused_other: '{count} rows were left out.',
  importDownloadRefused: 'Download the rows left out (CSV)',
  importErrorColumn: 'error',
  importReplaceRelations: 'Other tables point at these rows:',
  importReplaceUnchanged: 'Nothing was changed. {error}',
  importStopped: 'The import stopped: {error}',
  importConnectionLost: 'the connection failed.',
  importNotSent: 'Not sent: the import stopped before this row.',
  importMaybeSaved:
    'The answer for this row was lost. Check whether it was saved before importing it again.',
  importUndo: 'Undo import',
  importUndoHelp:
    'Undo puts the whole database back to just before the import. Anything written since, in any table, is replaced.',
  importUndone: 'Import undone',
  importMatching: 'Matching related rows...',
  importDecimalMark: 'Numbers in this file',
  importDecimalHelp:
    'Values like 28.000 read either way. Pick how the file writes decimals.',
  importDecimalDetected: 'As the file shows ({example})',
  importDecimalUnknown: 'Unclear: 28.000 read as thousands',
  importDecimalComma: '1.234,5 (comma before decimals)',
  importDecimalDot: '1,234.5 (point before decimals)',
  importGuessed_one: '{count} row has a number that reads two ways; check it below.',
  importGuessed_other:
    '{count} rows have numbers that read two ways; check them below.',
  undoColumnChanged: 'Column {name} changed type.',
  importCheckpointFailed:
    "The rows were not replaced: a restore point to undo it couldn't be taken. {error}",
  importUndoneText:
    'The import was undone: the database is back to how it was just before it.',
  importNumberGuess:
    '{column}: "{text}" read as {read}. If it meant {alternative}, pick the file\'s decimal mark above.',
  toastExportTimedOut: 'The copy is taking too long. Try again in a while.',
  pageNumber: 'Page {page}',
  importSinglingOut: 'Finding the rows that stop the replace...',
  importReplaceRefused_one:
    'Nothing was changed: {count} row stops the replace. Download the file with it marked, fix it and import the whole file again.',
  importReplaceRefused_other:
    'Nothing was changed: {count} rows stop the replace. Download the file with them marked, fix them and import the whole file again.',
  importDownloadMarked: 'Download the file with the problems marked (CSV)',
  importUnmatchedTitle: 'Values with no match',
  importUnmatchedHelp:
    'These values match no row in the related table. Pick the row each one means; rows whose value stays unmatched are left out.',
  importUnmatchedValue_one: '"{value}" in {column} · {count} row',
  importUnmatchedValue_other: '"{value}" in {column} · {count} rows',
  importUnmatchedMore: '{count} more values not shown: fix them in the file.'
};

type DataCopy = typeof en;

export const DATA: Catalog<DataCopy> = {
  en,
  es: {
    title: 'Datos',
    subtitle: 'Tablas que tu asistente y tus funciones pueden leer y escribir.',
    settings: 'Ajustes de la base de datos',

    emptyTitle: 'Aún no hay base de datos',
    emptyText:
      'Dale a este proyecto su propia base de datos: tablas con columnas tipadas, relaciones entre ellas y búsqueda. El asistente, tus funciones, la CLI y la API usan la misma.',
    whenData:
      'Filas con campos — menús, pedidos, clientes, reservas, inventario → Datos.',
    whenResources:
      'Documentos y páginas que el asistente lee y cita → Recursos.',
    databaseNameLabel: 'Nombre (opcional)',
    databaseNamePlaceholder: 'slug del proyecto',
    databaseNameHelp:
      'Lo escribes para eliminar la base de datos. Por defecto es el slug del proyecto.',
    createDatabase: 'Crear base de datos',
    creatingDatabase: 'Creando...',

    lockedBadge: 'Pro',
    lockedTitle: 'Datos es parte de Pro',
    lockedText:
      'Dale a cada proyecto su propia base de datos, con tablas, relaciones y búsqueda, que tu asistente y tus funciones leen y escriben.',
    upgrade: 'Ver planes',

    readOnlyTitle: 'Solo lectura',
    readOnlyText:
      'El plan de esta organización ya no incluye Datos. Puedes leer y descargar todo; no se puede cambiar nada hasta que mejores el plan.',
    deletedBannerTitle: 'Esta base de datos está eliminada',
    deletedBannerText:
      'Se borra para siempre el {date}; hasta entonces puedes restaurarla.',
    restoreDatabase: 'Restaurar base de datos',
    restoring: 'Restaurando...',
    statusCreating: 'Preparando la base de datos...',
    statusFailed: 'No pudimos crear la base de datos.',
    tryAgain: 'Intentar de nuevo',
    statusPurging: 'Esta base de datos se está borrando.',

    undo: 'Deshacer',
    undoTableDropped: 'Tabla {name} eliminada.',
    undoColumnDropped: 'Columna {name} eliminada.',
    undoConfirmTitle: '¿Deshacer este cambio?',
    undoConfirmText:
      'Toda la base de datos vuelve a justo antes del cambio. Lo que se haya escrito después — filas, tablas, columnas — se reemplaza.',

    tables: 'Tablas',
    newTable: 'Nueva tabla',
    newTableFromFile: 'Nueva tabla desde un archivo',
    searchTables: 'Buscar tablas',
    noTablesTitle: 'Crea tu primera tabla',
    noTablesText:
      'Una tabla guarda un tipo de cosa — los platos que vendes, tus pedidos, tus clientes — con una columna para cada detalle.',
    noTablesHint:
      '¿Ya lo tienes en una hoja de cálculo? Empieza desde el archivo: deducimos las columnas y sus tipos.',
    createNewDatabase: 'Crear una base de datos nueva',
    replaceConfirmTitle: '¿Empezar una base de datos nueva?',
    replaceConfirmText:
      'Cuando empieces una nueva, la base de datos eliminada ya no se podrá restaurar ni descargar, y se vacía al terminar su periodo de gracia. Descarga una copia antes si la puedes necesitar.',
    noTablesMatch: 'Ninguna tabla coincide.',
    pickTable: 'Elige una tabla para ver sus filas.',
    tabRows: 'Filas',
    tabSchema: 'Esquema',

    searchRows: 'Buscar filas',
    refresh: 'Actualizar',
    import: 'Importar',
    newRow: 'Nueva fila',
    columnUpdated: 'Actualizada',
    rowsLoadFailed: 'No pudimos cargar las filas.',
    deleteSelected_one: 'Eliminar {count} fila',
    deleteSelected_other: 'Eliminar {count} filas',

    newRowTitle: 'Nueva fila',
    rowTitle: 'Fila {id}',
    deleteRow: 'Eliminar fila',
    yes: 'Sí',
    no: 'No',
    errorJson: 'Este JSON no es válido.',
    errorValue: 'Este valor no es válido aquí.',
    errorRequired: 'Obligatorio.',
    relationHelp: 'Una fila de {table}.',
    relationNoRows: 'Ninguna fila coincide.',
    relationLoading: 'Buscando...',
    conflict: 'Alguien cambió esta fila después de que la abriste.',
    conflictBy:
      'Esta fila cambió después de que la abriste ({actor}). Carga la versión más reciente y vuelve a hacer tu cambio.',
    conflictLoad: 'Cargar la versión más reciente',
    metaCreated: 'Creada',
    metaUpdated: 'Actualizada',
    metaVersion: 'Versión',
    noColumns: 'Esta tabla aún no tiene columnas. Agrégalas en la pestaña Esquema.',

    deleteRowsTitle_one: 'Eliminar fila',
    deleteRowsTitle_other: 'Eliminar {count} filas',
    deleteRowsText_one: 'Se eliminará esta fila.',
    deleteRowsText_other: 'Se eliminarán estas {count} filas.',
    deleteRowsAction: 'Eliminar',
    checkingRelated: 'Revisando las filas que apuntan a ella...',
    impactCascade_one: 'También elimina {count} fila de {table} ({column}).',
    impactCascade_other: 'También elimina {count} filas de {table} ({column}).',
    impactSetNull_one: 'Vacía {column} en {count} fila de {table}.',
    impactSetNull_other: 'Vacía {column} en {count} filas de {table}.',
    impactRestrict_one: '{count} fila de {table} apunta aquí por {column}.',
    impactRestrict_other: '{count} filas de {table} apuntan aquí por {column}.',
    impactUnknown: 'Puede haber filas de {table} que apuntan aquí por {column}.',
    impactBlocked:
      'No se puede eliminar mientras esas filas apunten aquí. Elimínalas o cámbialas primero.',

    columnsTitle: 'Columnas',
    columnCount_one: '{count} columna, más el id y las fechas de creación y de actualización.',
    columnCount_other: '{count} columnas, más el id y las fechas de creación y de actualización.',
    columnRules: 'Reglas',
    ruleMin: 'Mín. {min}',
    ruleDefault: 'Por defecto: {value}',
    addColumn: 'Agregar columna',
    addColumnTitle: 'Agregar columna',
    editColumn: 'Editar columna',
    editColumnTitle: 'Editar columna',
    dropColumn: 'Eliminar columna',
    dropColumnTitle: 'Eliminar columna',
    dropColumnText:
      'Se va la columna {column} y su valor en todas las filas de {table}. Puedes deshacerlo justo después.',
    typeChangeWarning:
      'Cambiar el tipo copia la tabla. Si algunas filas no caben en el nuevo tipo, no cambia nada y te mostramos cuáles.',

    columnName: 'Nombre',
    columnType: 'Tipo',
    columnLabel: 'Etiqueta',
    columnLabelPlaceholder: 'Se muestra en lugar del nombre',
    columnDescription: 'Descripción',
    columnDescriptionHelp: 'Le dice al asistente qué guarda esta columna.',
    columnValues: 'Opciones',
    columnValuesHelp: 'Separadas por comas.',
    columnTarget: 'Apunta a',
    columnOnDelete: 'Cuando se elimina esa fila',
    columnMin: 'Mínimo',
    columnMinHelp: 'Se rechaza lo que quede por debajo, p. ej. inventario bajo 0.',
    columnDefault: 'Valor por defecto',
    columnDefaultHelp: 'Se usa cuando una fila nueva lo deja vacío.',
    flagRequired: 'Obligatoria',
    flagRequiredHelp: 'Toda fila debe tenerla',
    flagUnique: 'Única',
    flagUniqueHelp: 'Dos filas no comparten valor',
    flagFilterable: 'Filtrable',
    flagFilterableHelp: 'Con índice, para filtrar rápido',
    flagSearchable: 'Buscable',
    flagSearchableHelp: 'Entra en la búsqueda de texto',
    moreOptions: 'Más opciones',
    fewerOptions: 'Menos opciones',
    columnNumber: 'Columna {n}',
    removeColumn: 'Quitar columna',

    type_text: 'Texto',
    type_long_text: 'Texto largo',
    type_integer: 'Número entero',
    type_decimal: 'Número decimal',
    type_boolean: 'Sí / no',
    type_date: 'Fecha',
    type_datetime: 'Fecha y hora',
    type_enum: 'Opciones',
    type_json: 'JSON',
    type_email: 'Correo',
    type_url: 'URL',
    type_phone: 'Teléfono',
    type_relation: 'Relación',
    type_file: 'Archivo',

    onDelete_restrict: 'Impedir que se elimine',
    onDelete_cascade: 'Eliminar también estas filas',
    onDelete_set_null: 'Vaciar esta columna',

    tableSettings: 'Ajustes de la tabla',
    tableName: 'Nombre de la tabla',
    tableNameHelp: 'Minúsculas, dígitos y _, p. ej. lineas_pedido.',
    tableNameTaken: 'Ya hay una tabla llamada {name}.',
    identifierInvalid:
      'Usa minúsculas, dígitos y _, empezando por una letra, sin dos _ seguidos.',
    tableLabel: 'Etiqueta',
    tableLabelPlaceholder: 'Se muestra en lugar del nombre',
    tableDescription: 'Descripción',
    tableDescriptionHelp:
      'Le dice al asistente para qué es esta tabla, p. ej. «las pizzas que vendemos, con precio e inventario».',
    displayColumn: 'Columna a mostrar',
    displayColumnHelp:
      'Lo que muestra una relación a esta tabla: «Margarita» en lugar de #12.',
    displayColumnId: 'El id de la fila',
    access: 'Acceso del asistente (bots de canales)',
    access_none: 'Ninguno',
    access_read: 'Leer',
    access_add: 'Leer y agregar',
    access_full: 'Total',
    accessHelp_none:
      'Los bots de tus canales no ven esta tabla. Tus propios clientes MCP, como dueño, sí.',
    accessHelp_read: 'Los bots pueden consultar filas, pero no cambiarlas.',
    accessHelp_add:
      'Los bots pueden consultar filas y agregar nuevas, p. ej. pedidos.',
    accessHelp_full:
      'Los bots pueden agregar, cambiar y eliminar filas. Eliminar sigue pidiendo confirmación.',
    customerScoped: 'Cada cliente ve solo sus propias filas',
    customerScopedHelp:
      'En los canales, las filas quedan ligadas al cliente que las escribió, p. ej. «mis pedidos».',
    history: 'Guardar el historial de filas',
    historyHelp: 'Quién cambió cada fila y cuándo, durante 90 días.',
    toastTableSaved: 'Tabla guardada',
    toastSaveTableFailed: 'No pudimos guardar la tabla',

    relationsTitle: 'Relaciones',
    noRelations: 'Ninguna relación desde ni hacia esta tabla.',
    relationOut: '{column} apunta a {table}',
    relationIn: '{table} apunta aquí por {column}',

    indexesTitle: 'Índices',
    indexesHelp:
      'Filtrar y ordenar por columnas con índice sigue siendo rápido aunque la tabla crezca. Marca una columna como filtrable o única para indexarla; las relaciones se indexan solas.',
    indexUnique: 'única',
    indexFilter: 'filtro',
    indexAuto: 'relación',
    indexSearch: 'búsqueda de texto',

    dropTable: 'Eliminar tabla',
    dropTableTitle: 'Eliminar tabla',
    dropTableHelp: 'Quita la tabla y todas sus filas.',
    dropTableText:
      'Se van la tabla {table} y todas sus filas. Puedes deshacerlo justo después.',
    dropTableRelations:
      'Hay relaciones desde {tables} que apuntan a esta tabla: elimínalas o cámbialas primero.',
    typeToConfirm: 'Para confirmar, escribe',

    newTableTitle: 'Nueva tabla',
    newTableColumnsHelp:
      'Toda tabla tiene además un id y las fechas de creación y de actualización.',

    toastColumnAdded: 'Columna agregada',
    toastColumnSaved: 'Columna guardada',
    toastSaveColumnFailed: 'No pudimos guardar la columna',
    toastDropColumnFailed: 'No pudimos eliminar la columna',
    toastDropTableFailed: 'No pudimos eliminar la tabla',
    toastTableCreated: 'Tabla creada',
    toastCreateTableFailed: 'No pudimos crear la tabla',
    toastRowCreated: 'Fila agregada',
    toastRowSaved: 'Fila guardada',
    toastSaveRowFailed: 'No pudimos guardar la fila',
    toastRowsDeleted_one: 'Fila eliminada',
    toastRowsDeleted_other: '{count} filas eliminadas',
    toastDeleteRowsFailed: 'No pudimos eliminar las filas',
    toastDatabaseCreated: 'Base de datos creada',
    toastCreateDatabaseFailed: 'No pudimos crear la base de datos',
    toastDatabaseRestored: 'Base de datos restaurada',
    toastRestoreFailed: 'La restauración falló',
    toastRestored: 'Base de datos restaurada a ese momento',
    toastUndone: 'Cambio deshecho',
    toastDatabaseDeleted: 'Base de datos eliminada',
    toastDeleteDatabaseFailed: 'No pudimos eliminar la base de datos',
    toastExportFailed: 'No pudimos preparar la copia',
    toastDownloadFailed: 'No pudimos descargar el archivo',

    settingsTitle: 'Ajustes de la base de datos',
    databaseSection: 'Base de datos',
    databaseName: 'Nombre',
    databaseSize: 'Tamaño',
    databaseCreated: 'Creada',
    sizeOf: '{used} de {max}',
    downloadCopy: 'Descargar una copia',
    downloadCopyHelp:
      'Cada tabla en su propio archivo, más el esquema. Se prepara en segundo plano.',
    exportFormat: 'Formato',
    exportRunning: 'Preparando...',
    exportRows_one: '{count} fila',
    exportRows_other: '{count} filas',
    restoreTitle: 'Restaurar a un momento',
    restoreHelp:
      'Devuelve toda la base de datos a como estaba en cualquier momento de los últimos 30 días. Todo lo posterior a ese momento se reemplaza.',
    restoreAt: 'Fecha y hora',
    restoreAtInvalid: 'Elige un momento dentro de los últimos 30 días.',
    restoreAction: 'Restaurar',
    restoreConfirmTitle: '¿Restaurar la base de datos?',
    restoreConfirmText:
      'Todas las tablas y filas vuelven a como estaban el {date}. Lo que se escribió después se reemplaza. Puedes deshacer la restauración justo después.',
    restoreDone: 'Restaurada.',
    undoRestore: 'Deshacer la restauración',
    dangerZone: 'Zona de peligro',
    deleteDatabase: 'Eliminar base de datos',
    deleteDatabaseHelp:
      'Quita todas las tablas y filas. Se puede restaurar durante 7 días.',
    deleteDatabaseTitle: 'Eliminar base de datos',
    deleteDatabaseText: 'Eliminar la base de datos quita:',
    deleteDatabaseTables: 'todas las tablas y todas sus filas;',
    deleteDatabaseTools:
      'lo que el asistente y tus funciones leen y escriben aquí — dejan de funcionar.',
    deleteDatabaseGrace_one:
      'Durante {count} día puedes restaurarla (o descargar una copia). Después se borra para siempre.',
    deleteDatabaseGrace_other:
      'Durante {count} días puedes restaurarla (o descargar una copia). Después se borra para siempre.',

    importTitle: 'Importar a {table}',
    importNewTitle: 'Nueva tabla desde un archivo',
    importModeAdd: 'Agregar las filas a la tabla',
    importModeReplace: 'Reemplazar todas las filas de la tabla',
    importReplaceWarning:
      'Las filas de la tabla se reemplazan por las del archivo. Puedes deshacerlo justo después de importar. Para confirmar, escribe',
    importChooseFile: 'Elegir un archivo',
    importOtherFile: 'Elegir otro archivo',
    importReading: 'Leyendo...',
    importFileHelp:
      'CSV o Excel (.xlsx, .xls). La primera fila tiene los nombres de las columnas.',
    importParseFailed: 'No pudimos leer este archivo.',
    importRowCount_one: '{count} fila',
    importRowCount_other: '{count} filas',
    importSheet: 'Hoja',
    importColumnsTitle: 'Columnas',
    importColumnsHelp:
      'Las deducimos de las primeras 200 filas. Corrige cualquier nombre o tipo antes de crear la tabla, o desmarca una columna para dejarla fuera.',
    importMappingTitle: 'Columnas',
    importMappingHelp:
      'Cada columna del archivo va a la columna de la tabla que elijas aquí. Las relaciones se emparejan por la columna a mostrar de la otra tabla.',
    importSkip: 'Dejar fuera',
    importPreviewTitle: 'Vista previa',
    importLine: 'Línea',
    importReady_one: '{count} fila lista.',
    importReady_other: '{count} filas listas.',
    importProblems_one: '{count} fila tiene un problema y quedará fuera.',
    importProblems_other: '{count} filas tienen problemas y quedarán fuera.',
    importLineError: 'Línea {line}: {error}',
    importAction_one: 'Importar {count} fila',
    importAction_other: 'Importar {count} filas',
    importing: 'Importando...',
    importProgress: '{done} de {total} filas',
    importFailed: 'La importación falló.',
    importInserted_one: '{count} fila importada.',
    importInserted_other: '{count} filas importadas.',
    importRefused_one: '{count} fila quedó fuera.',
    importRefused_other: '{count} filas quedaron fuera.',
    importDownloadRefused: 'Descargar las filas que quedaron fuera (CSV)',
    importErrorColumn: 'error',
    importReplaceRelations: 'Otras tablas apuntan a estas filas:',
    importReplaceUnchanged: 'No se cambió nada. {error}',
    importStopped: 'La importación se detuvo: {error}',
    importConnectionLost: 'falló la conexión.',
    importNotSent: 'Sin enviar: la importación se detuvo antes de esta fila.',
    importMaybeSaved:
      'Se perdió la respuesta para esta fila. Revisa si quedó guardada antes de importarla de nuevo.',
    importUndo: 'Deshacer la importación',
    importUndoHelp:
      'Deshacer devuelve toda la base de datos a justo antes de importar. Lo que se haya escrito después, en cualquier tabla, se reemplaza.',
    importUndone: 'Importación deshecha',
    importMatching: 'Buscando las filas relacionadas...',
    importDecimalMark: 'Números en este archivo',
    importDecimalHelp:
      'Valores como 28.000 se pueden leer de dos formas. Elige cómo escribe los decimales el archivo.',
    importDecimalDetected: 'Como indica el archivo ({example})',
    importDecimalUnknown: 'No está claro: 28.000 se lee como miles',
    importDecimalComma: '1.234,5 (coma antes de los decimales)',
    importDecimalDot: '1,234.5 (punto antes de los decimales)',
    importGuessed_one:
      '{count} fila tiene un número que se lee de dos formas; revísala abajo.',
    importGuessed_other:
      '{count} filas tienen números que se leen de dos formas; revísalas abajo.',
    undoColumnChanged: 'La columna {name} cambió de tipo.',
    importCheckpointFailed:
      'No se reemplazaron las filas: no se pudo tomar un punto de restauración para deshacerlo. {error}',
    importUndoneText:
      'Se deshizo la importación: la base de datos volvió a como estaba justo antes.',
    importNumberGuess:
      '{column}: «{text}» se leyó como {read}. Si era {alternative}, elige arriba cómo escribe los decimales el archivo.',
    toastExportTimedOut:
      'La copia está tardando demasiado. Inténtalo de nuevo en un rato.',
    pageNumber: 'Página {page}',
    importSinglingOut: 'Buscando las filas que impiden reemplazar...',
    importReplaceRefused_one:
      'No se cambió nada: {count} fila impide reemplazar. Descarga el archivo con ella marcada, corrígela e importa de nuevo el archivo completo.',
    importReplaceRefused_other:
      'No se cambió nada: {count} filas impiden reemplazar. Descarga el archivo con ellas marcadas, corrígelas e importa de nuevo el archivo completo.',
    importDownloadMarked: 'Descargar el archivo con los problemas marcados (CSV)',
    importUnmatchedTitle: 'Valores sin coincidencia',
    importUnmatchedHelp:
      'Estos valores no coinciden con ninguna fila de la tabla relacionada. Elige la fila a la que se refiere cada uno; las filas cuyo valor quede sin coincidencia se dejan fuera.',
    importUnmatchedValue_one: '"{value}" en {column} · {count} fila',
    importUnmatchedValue_other: '"{value}" en {column} · {count} filas',
    importUnmatchedMore: '{count} valores más no se muestran: corrígelos en el archivo.'
  }
};
