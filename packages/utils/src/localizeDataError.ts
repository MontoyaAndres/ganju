import { constants } from './constants';

/**
 * Project-data errors in the reader's language.
 *
 * The engine writes its messages in English, for the person or model that made
 * the call, and that is what error logs keep. The dashboard's calls say which
 * language they are read in, so the API's error handler swaps a known message
 * for its translation on the way out. A message with no entry stays English.
 *
 * Keys are the engine's own text with each interpolation as {0}, {1}, … in
 * order. A function entry gets the captured values, and can translate a
 * nested message (`Row 3: …`) or an English fragment of its own.
 */
type Render = (args: string[], nested: (message: string) => string) => string;

const ACCESS: Record<string, string> = {
  'read only': 'solo lectura',
  'read and add rows only': 'solo leer y agregar filas'
};

const BOUNDED: Record<string, string> = {
  'sorting it': 'ordenarla',
  'an aggregate over it': 'un agregado sobre ella'
};

const UNTERMINATED: Record<string, string> = {
  comment: 'un comentario',
  string: 'un texto entre comillas',
  'quoted name': 'un nombre entre comillas'
};

// What a refused update appends: why the row didn't match.
const guardSuffix = (suffix: string): string => {
  const missing = /^ Row (\d+) doesn't exist in ([\s\S]+)\.$/.exec(suffix);
  if (missing) return ` La fila ${missing[1]} no existe en ${missing[2]}.`;
  const current = /^ Current values: ([\s\S]*)\.$/.exec(suffix);
  if (current) return ` Valores actuales: ${current[1]}.`;
  return suffix;
};

export const DATA_ERROR_MESSAGES_ES: Record<string, string | Render> = {
  'Unknown column "{0}" in {1}. Columns: {2}.':
    'Columna desconocida "{0}" en {1}. Columnas: {2}.',
  'Unknown table "{0}". Tables: {1}.': 'Tabla desconocida "{0}". Tablas: {1}.',
  '"table" is the name of a table. Tables: {0}.':
    '"table" es el nombre de una tabla. Tablas: {0}.',
  'Not allowed: the assistant\'s access to "{0}" is {1}.': a =>
    `No permitido: el acceso del asistente a "${a[0]}" es ${ACCESS[a[1]] ?? a[1]}.`,
  "This conversation has no customer, so customer-scoped tables can't be used.":
    'Esta conversación no tiene cliente, así que no se pueden usar tablas limitadas al cliente.',
  '{0}: expected an ISO 8601 date and time.':
    '{0}: se esperaba una fecha y hora ISO 8601.',
  '{0}: "{1}" is not a date and time; use ISO 8601, e.g. 2026-10-19T09:00:00-05:00.':
    '{0}: "{1}" no es una fecha y hora; usa ISO 8601, p. ej. 2026-10-19T09:00:00-05:00.',
  '{0} is too long (over {1} characters).':
    '{0} es demasiado largo (más de {1} caracteres).',
  '{0} is required.': '{0} es obligatorio.',
  '{0} takes the id (a whole number) of a row in {1}.':
    '{0} recibe el id (un número entero) de una fila de {1}.',
  '{0} must be a whole number.': '{0} debe ser un número entero.',
  '{0} must be a number.': '{0} debe ser un número.',
  '{0} must be true or false.': '{0} debe ser true o false.',
  '{0} must be a date, YYYY-MM-DD.': '{0} debe ser una fecha, AAAA-MM-DD.',
  '{0} must be one of: {1}.': '{0} debe ser uno de: {1}.',
  '{0} must be an email address.': '{0} debe ser un correo electrónico.',
  '{0} must be a URL starting with http(s)://.':
    '{0} debe ser una URL que empiece por http(s)://.',
  '{0} must be a phone number.': '{0} debe ser un número de teléfono.',
  '{0} must be text.': '{0} debe ser texto.',
  'Column names are strings.': 'Los nombres de columna son textos.',
  '"{0}": only one level of relation is supported (relation.column).':
    '"{0}": solo se admite un nivel de relación (relacion.columna).',
  '"{0}" is not a relation, so "{1}" can\'t be used.':
    '"{0}" no es una relación, así que no se puede usar "{1}".',
  '{0} is one of: {1}.': '{0} es uno de: {1}.',
  '{0} compares with a number.': '{0} se compara con un número.',
  '{0}: expected a value or an operator object.':
    '{0}: se esperaba un valor o un objeto con un operador.',
  '"where" is an object: { column: value, column: { operator: value } }.':
    '"where" es un objeto: { columna: valor, columna: { operador: valor } }.',
  '"{0}" takes a list of where objects.':
    '"{0}" recibe una lista de objetos where.',
  'Each entry in "{0}" is a where object with at least one condition.':
    'Cada elemento de "{0}" es un objeto where con al menos una condición.',
  '{0}: to match several values use { "in": [...] }.':
    '{0}: para buscar varios valores usa { "in": [...] }.',
  '{0}: unknown operator "{1}". Operators: {2}.':
    '{0}: operador desconocido "{1}". Operadores: {2}.',
  '{0}.{1} takes a list of 1 to {2} values.':
    '{0}.{1} recibe una lista de 1 a {2} valores.',
  '{0}.{1} takes text.': '{0}.{1} recibe texto.',
  'This query uses {0} values; the limit is {1}. Use fewer "in" values or split it.':
    'Esta consulta usa {0} valores; el límite es {1}. Usa menos valores en "in" o divídela.',
  '"search" needs at least one word.':
    '"search" necesita al menos una palabra.',
  '"cursor" is not one this query returned; send the same table and sort with the cursor from the previous page.':
    '"cursor" no es uno que haya devuelto esta consulta; envía la misma tabla y orden con el cursor de la página anterior.',
  "A row with {0} values can't be written in one statement.":
    'Una fila con {0} valores no se puede escribir en una sola instrucción.',
  'Arguments are an object.': 'Los argumentos son un objeto.',
  '{0} is text.': '{0} es texto.',
  '{0} is up to {1} characters.': '{0} tiene hasta {1} caracteres.',
  '{0} is true or false.': '{0} es true o false.',
  'A column is an object: { "name", "type", ... }.':
    'Una columna es un objeto: { "name", "type", ... }.',
  '{0}: "type" is one of {1}.': '{0}: "type" es uno de {1}.',
  '{0}: an enum lists 1 to {1} "values".':
    '{0}: un enum tiene de 1 a {1} "values".',
  '{0}: each value is text, 1 to 100 characters.':
    '{0}: cada valor es un texto de 1 a 100 caracteres.',
  '{0}: "{1}" is listed twice.': '{0}: "{1}" aparece dos veces.',
  '{0}: only enum columns take "values".':
    '{0}: solo las columnas enum llevan "values".',
  '{0}: a relation names the table it points at in "table". Tables: {1}.':
    '{0}: una relación indica en "table" la tabla a la que apunta. Tablas: {1}.',
  '{0}: "onDelete" is one of {1}.': '{0}: "onDelete" es uno de {1}.',
  "{0} is required, so deleting the row it points at can't clear it; use restrict or cascade.":
    '{0} es obligatoria, así que borrar la fila a la que apunta no puede vaciarla; usa restrict o cascade.',
  '{0}: only relation columns take "table".':
    '{0}: solo las columnas de relación llevan "table".',
  '{0}: only integer and decimal columns take "min".':
    '{0}: solo las columnas integer y decimal llevan "min".',
  '{0}: "min" is a number.': '{0}: "min" es un número.',
  "{0}: a {1} column can't be unique.":
    '{0}: una columna {1} no puede ser única.',
  '{0}: only text columns can be searchable (text, long_text, email, url, phone, enum).':
    '{0}: solo las columnas de texto pueden ser buscables (text, long_text, email, url, phone, enum).',
  '{0}: a column named "rank" can\'t be searchable; rename it (e.g. "ranking").':
    '{0}: una columna llamada "rank" no puede ser buscable; cámbiale el nombre (p. ej. "ranking").',
  "{0}: a {1} column can't be filterable; mark it searchable instead.":
    '{0}: una columna {1} no puede ser filtrable; márcala como buscable.',
  "{0}: a {1} column can't have a default.":
    '{0}: una columna {1} no puede tener valor por defecto.',
  "{0}: a unique column can't have a default.":
    '{0}: una columna única no puede tener valor por defecto.',
  '{0}: the default is below the minimum, {1}.':
    '{0}: el valor por defecto está por debajo del mínimo, {1}.',
  '"access" is one of {0}.': '"access" es uno de {0}.',
  "{0}.{1} can't be unique: these values repeat: {2}.":
    '{0}.{1} no puede ser única: estos valores se repiten: {2}.',
  '{0}.{1} is required.': '{0}.{1} es obligatorio.',
  'Another row in {0} already has this {1}.':
    'Otra fila de {0} ya tiene este {1}.',
  "{0}.{1} can't go below {2}.": '{0}.{1} no puede bajar de {2}.',
  'Invalid value for {0}.{1} ({2}).': 'Valor no válido para {0}.{1} ({2}).',
  "A relation in {0} points at a row that doesn't exist, or other rows still point at this one.":
    'Una relación en {0} apunta a una fila que no existe, o hay otras filas que aún apuntan a esta.',
  'The database is full: delete or archive rows to make room.':
    'La base de datos está llena: elimina o archiva filas para liberar espacio.',
  'This call uses too many values at once.':
    'Esta llamada usa demasiados valores a la vez.',
  "The database refused this change to {0}; check the values against the table's columns.":
    'La base de datos rechazó este cambio en {0}; revisa los valores contra las columnas de la tabla.',
  '{0} has about {1} rows, so {2} needs a filter on an indexed column (id, or a column marked filterable, unique or a relation), or "{3}" marked filterable so it is indexed.':
    a =>
      `${a[0]} tiene unas ${a[1]} filas, así que ${BOUNDED[a[2]] ?? a[2]} necesita un filtro en una columna con índice (id, o una columna marcada como filtrable, única o una relación), o marcar "${a[3]}" como filtrable para indexarla.`,
  '{0} has about {1} rows, so {2} needs a filter on an indexed column (id, or a column marked filterable, unique or a relation).':
    a =>
      `${a[0]} tiene unas ${a[1]} filas, así que ${BOUNDED[a[2]] ?? a[2]} necesita un filtro en una columna con índice (id, o una columna marcada como filtrable, única o una relación).`,
  '"{0}" has no searchable columns; filter with "where" instead (e.g. { "name": { "contains": "..." } }).':
    '"{0}" no tiene columnas buscables; filtra con "where" (p. ej. { "name": { "contains": "..." } }).',
  '"limit" is 1 to {0}.': '"limit" va de 1 a {0}.',
  '"sort" takes up to {0} columns.': '"sort" admite hasta {0} columnas.',
  '"sort" is a list of column names; prefix with "-" for descending, e.g. ["-created_at"].':
    '"sort" es una lista de nombres de columna; antepón "-" para orden descendente, p. ej. ["-created_at"].',
  "{0} is json and can't be sorted.": '{0} es json y no se puede ordenar.',
  '"cursor" is not one this query returned.':
    '"cursor" no es uno que haya devuelto esta consulta.',
  '"include" is a list of relation columns, e.g. ["customer"].':
    '"include" es una lista de columnas de relación, p. ej. ["customer"].',
  '"{0}" is not a relation column; include takes relation columns.':
    '"{0}" no es una columna de relación; include recibe columnas de relación.',
  '"aggregate" is a list of 1 to {0} { "fn": ..., "column": ... }.':
    '"aggregate" es una lista de 1 a {0} { "fn": ..., "column": ... }.',
  'Each aggregate is { "fn": one of {0}, "column": ... }.':
    'Cada agregado es { "fn": uno de {0}, "column": ... }.',
  '"{0}" needs a "column".': '"{0}" necesita una "column".',
  '{0} needs a number column; "{1}" is {2}.':
    '{0} necesita una columna numérica; "{1}" es {2}.',
  '"times" multiplies two number columns.':
    '"times" multiplica dos columnas numéricas.',
  '"groupBy" takes up to {0} columns.': '"groupBy" admite hasta {0} columnas.',
  'A write needs an actor (user:, cli:, mcp:, channel:, function:, trigger: or system: followed by an id).':
    'Una escritura necesita un actor (user:, cli:, mcp:, channel:, function:, trigger: o system: seguido de un id).',
  "This organization's plan no longer includes Data, so the database is read-only. Upgrade to Pro to change it.":
    'El plan de esta organización ya no incluye Data, así que la base de datos es de solo lectura. Pasa a Pro para cambiarla.',
  'The database is full: delete or archive rows to make room. Reads, deletes and exports still work.':
    'La base de datos está llena: elimina o archiva filas para liberar espacio. Leer, eliminar y exportar siguen funcionando.',
  '{ "$ref": {0} } must point at an earlier single-row insert in this list (0-based).':
    '{ "$ref": {0} } debe apuntar a un insert anterior de una sola fila en esta lista (empezando en 0).',
  'An insert takes "values", an object of column: value.':
    'Un insert lleva "values", un objeto columna: valor.',
  '{0}.{1} is set by the database; leave it out.':
    '{0}.{1} lo asigna la base de datos; no lo envíes.',
  'Insert into {0} is missing required {1}.':
    'Al insert en {0} le falta {1}, que es obligatorio.',
  "{0}.{1} points at a table the assistant can't use.":
    '{0}.{1} apunta a una tabla que el asistente no puede usar.',
  "{0}.{1} points at {2}, which isn't one of this caller's tables.":
    '{0}.{1} apunta a {2}, que no es una de las tablas de quien llama.',
  '{0}.{1}: there is no row {2} in {3}.':
    '{0}.{1}: no hay ninguna fila {2} en {3}.',
  '{0} on {1} needs "id" or "where".': '{0} en {1} necesita "id" o "where".',
  '"id" is a whole number.': '"id" es un número entero.',
  '{0} on {1} needs a non-empty "where".':
    '{0} en {1} necesita un "where" no vacío.',
  '{0}: "where" on a write can\'t use relation paths; filter on this table\'s own columns.':
    '{0}: "where" en una escritura no puede usar rutas de relación; filtra por las columnas de esta tabla.',
  '"version" is the whole number the row was read with.':
    '"version" es el número entero con el que se leyó la fila.',
  'Row {0} in {1} was changed since it was read (now version {2}).':
    'La fila {0} de {1} cambió desde que se leyó (ahora va en la versión {2}).',
  'An operation is an object.': 'Una operación es un objeto.',
  '"op" is insert, update or delete.': '"op" es insert, update o delete.',
  '"id": { "$ref": {0} } points at a row inserted into {1}; a $ref as the id must name an insert into {2}.':
    '"id": { "$ref": {0} } apunta a una fila insertada en {1}; un $ref usado como id debe nombrar un insert en {2}.',
  'An insert takes "values" (one row) or "rows" (a list), not both.':
    'Un insert lleva "values" (una fila) o "rows" (una lista), no ambos.',
  '"rows" is a list of 1 to {0} rows.': '"rows" es una lista de 1 a {0} filas.',
  'Row {0}: {1}': (a, t) => `Fila ${a[0]}: ${t(a[1])}`,
  '"expect" is the number of rows that must change.':
    '"expect" es el número de filas que deben cambiar.',
  'This {0} would change more than {1} rows; narrow the "where".':
    'Este {0} cambiaría más de {1} filas; acota el "where".',
  'This {0} would remove more than {1} rows; narrow the "where".':
    'Este {0} eliminaría más de {1} filas; acota el "where".',
  'An update takes "set", an object of column: value.':
    'Un update lleva "set", un objeto columna: valor.',
  '{0}.{1} is set by the database.': '{0}.{1} lo asigna la base de datos.',
  '{0}.{1}: set a value, or { "increment": n } / { "decrement": n }.':
    '{0}.{1}: asigna un valor, o { "increment": n } / { "decrement": n }.',
  '{0} needs a number column and a number.':
    '{0} necesita una columna numérica y un número.',
  '{0}.{1} is a whole number; {2} by a whole number.':
    '{0}.{1} es un número entero; usa {2} con un número entero.',
  "Can't delete: {0} row in {1} still points at this row ({2}.{3}).":
    'No se puede eliminar: {0} fila de {1} aún apunta a esta fila ({2}.{3}).',
  "Can't delete: {0} row in {1} still points at these rows ({2}.{3}).":
    'No se puede eliminar: {0} fila de {1} aún apunta a estas filas ({2}.{3}).',
  "Can't delete: {0} row in {1} still point at this row ({2}.{3}).":
    'No se puede eliminar: {0} fila de {1} aún apunta a esta fila ({2}.{3}).',
  "Can't delete: {0} row in {1} still point at these rows ({2}.{3}).":
    'No se puede eliminar: {0} fila de {1} aún apunta a estas filas ({2}.{3}).',
  "Can't delete: {0} rows in {1} still points at this row ({2}.{3}).":
    'No se puede eliminar: {0} filas de {1} aún apuntan a esta fila ({2}.{3}).',
  "Can't delete: {0} rows in {1} still points at these rows ({2}.{3}).":
    'No se puede eliminar: {0} filas de {1} aún apuntan a estas filas ({2}.{3}).',
  "Can't delete: {0} rows in {1} still point at this row ({2}.{3}).":
    'No se puede eliminar: {0} filas de {1} aún apuntan a esta fila ({2}.{3}).',
  "Can't delete: {0} rows in {1} still point at these rows ({2}.{3}).":
    'No se puede eliminar: {0} filas de {1} aún apuntan a estas filas ({2}.{3}).',
  'This update would change more than {0} rows; narrow the "where".':
    'Este update cambiaría más de {0} filas; acota el "where".',
  '{0} on {1} changed {2} row, expected {3}; nothing was written.{4}': a =>
    `${a[0]} en ${a[1]} cambió ${a[2]} fila, se esperaba ${a[3]}; no se escribió nada.${guardSuffix(a[4])}`,
  '{0} on {1} changed {2} rows, expected {3}; nothing was written.{4}': a =>
    `${a[0]} en ${a[1]} cambió ${a[2]} filas, se esperaba ${a[3]}; no se escribió nada.${guardSuffix(a[4])}`,
  '"operations" is a list of 1 to {0} insert, update or delete operations.':
    '"operations" es una lista de 1 a {0} operaciones insert, update o delete.',
  'Operation {0} ({1}): {2}': (a, t) =>
    `Operación ${a[0]} (${a[1]}): ${t(a[2])}`,
  'A delete preview is for the owner.':
    'La vista previa de un borrado es para el dueño.',
  '"ids" lists row ids; leave it out for every row.':
    '"ids" lista ids de filas; omítelo para incluir todas las filas.',
  'A delete preview takes up to {0} ids.':
    'La vista previa de un borrado admite hasta {0} ids.',
  'There is no row {0} in {1}.': 'No hay ninguna fila {0} en {1}.',
  'A table is an object: { "name", "columns" }.':
    'Una tabla es un objeto: { "name", "columns" }.',
  'There is already a table "{0}".': 'Ya existe una tabla "{0}".',
  'A database holds up to {0} tables.':
    'Una base de datos tiene hasta {0} tablas.',
  '{0}: "columns" lists at least one column.':
    '{0}: "columns" lista al menos una columna.',
  'A table has up to {0} columns.': 'Una tabla tiene hasta {0} columnas.',
  '{0}.{1} is listed twice.': '{0}.{1} aparece dos veces.',
  '"displayColumn" is one of {0}\'s columns.':
    '"displayColumn" es una de las columnas de {0}.',
  'The change is an object.': 'El cambio es un objeto.',
  '"{0}" can\'t be changed here; tables take {1}.':
    '"{0}" no se puede cambiar aquí; las tablas admiten {1}.',
  "{0} can't be dropped while {1} points at it; drop or change those columns first.":
    'No se puede borrar {0} mientras {1} apunte a ella; borra o cambia esas columnas primero.',
  "{0} can't be dropped while {1} point at it; drop or change those columns first.":
    'No se puede borrar {0} mientras {1} apunten a ella; borra o cambia esas columnas primero.',
  '{0} already has a column "{1}".': '{0} ya tiene una columna "{1}".',
  '{0}.{1} is required, so existing rows need a value: give it a default, or add it optional, fill it in and then make it required.':
    '{0}.{1} es obligatoria, así que las filas existentes necesitan un valor: dale un valor por defecto, o agrégala opcional, rellénala y luego hazla obligatoria.',
  "{0}.{1} can't become {2}, required: these rows (and maybe more) don't fit: {3}. Nothing was changed.":
    '{0}.{1} no puede pasar a {2} obligatoria: estas filas (y quizá más) no encajan: {3}. No se cambió nada.',
  "{0}.{1} can't become {2}, required: these rows don't fit: {3}. Nothing was changed.":
    '{0}.{1} no puede pasar a {2} obligatoria: estas filas no encajan: {3}. No se cambió nada.',
  "{0}.{1} can't become {2}: these rows (and maybe more) don't fit: {3}. Nothing was changed.":
    '{0}.{1} no puede pasar a {2}: estas filas (y quizá más) no encajan: {3}. No se cambió nada.',
  "{0}.{1} can't become {2}: these rows don't fit: {3}. Nothing was changed.":
    '{0}.{1} no puede pasar a {2}: estas filas no encajan: {3}. No se cambió nada.',
  'The change would leave {0} row in {1} pointing at nothing; nothing was changed.':
    'El cambio dejaría {0} fila de {1} apuntando a nada; no se cambió nada.',
  'The change would leave {0} rows in {1} pointing at nothing; nothing was changed.':
    'El cambio dejaría {0} filas de {1} apuntando a nada; no se cambió nada.',
  '{0} needs at least one column; drop the table instead.':
    '{0} necesita al menos una columna; elimina la tabla en su lugar.',
  'The SQL has an unterminated {0}.': a =>
    `El SQL tiene ${UNTERMINATED[a[0]] ?? a[0]} sin cerrar.`,
  '"sql" is the SELECT to run.': '"sql" es el SELECT que se ejecuta.',
  'A named query is up to {0} characters.':
    'Una consulta guardada tiene hasta {0} caracteres.',
  'A named query is one statement: remove the ";" inside it.':
    'Una consulta guardada es una sola instrucción: quita el ";" que tiene dentro.',
  'A named query starts with SELECT or WITH; it only reads.':
    'Una consulta guardada empieza por SELECT o WITH; solo lee.',
  'Use named parameters (:from, :to) instead of "?", so each one can be described.':
    'Usa parámetros con nombre (:from, :to) en lugar de "?", para poder describir cada uno.',
  "{0} isn't allowed in a named query.":
    '{0} no está permitido en una consulta guardada.',
  '"{0}" isn\'t one of this database\'s tables or columns; named queries read the tables you defined.':
    '"{0}" no es una de las tablas o columnas de esta base de datos; las consultas guardadas leen las tablas que definiste.',
  'Parameter {0}: use lowercase letters, digits and _, starting with a letter.':
    'Parámetro {0}: usa minúsculas, dígitos y _, empezando por una letra.',
  'A named query takes up to {0} parameters.':
    'Una consulta guardada admite hasta {0} parámetros.',
  "The SQL doesn't compile: {0}.": 'El SQL no compila: {0}.',
  "A named query reads only this database's tables, with json_each and json_tree for JSON; not other virtual tables such as dbstat.":
    'Una consulta guardada lee solo las tablas de esta base de datos, con json_each y json_tree para JSON; no otras tablas virtuales como dbstat.',
  'A named query only reads: this one would change the database.':
    'Una consulta guardada solo lee: esta cambiaría la base de datos.',
  'A named query reads only this database\'s tables, not "{0}".':
    'Una consulta guardada lee solo las tablas de esta base de datos, no "{0}".',
  "A named query reads only this database's tables.":
    'Una consulta guardada lee solo las tablas de esta base de datos.',
  'There is no named query "{0}". Named queries: {1}.':
    'No hay ninguna consulta guardada "{0}". Consultas guardadas: {1}.',
  '"params" is a list of { name, type, description }.':
    '"params" es una lista de { name, type, description }.',
  'params[{0}] needs a name.': 'params[{0}] necesita un nombre.',
  'Parameter {0}: "type" is one of {1}.':
    'Parámetro {0}: "type" es uno de {1}.',
  'Declare the type of {0} in "params".': 'Declara el tipo de {0} en "params".',
  "The SQL doesn't use {0}.": 'El SQL no usa {0}.',
  'A named query is an object.': 'Una consulta guardada es un objeto.',
  'A named query needs a name: lowercase letters, digits and _, starting with a letter.':
    'Una consulta guardada necesita un nombre: minúsculas, dígitos y _, empezando por una letra.',
  'A database holds up to {0} named queries.':
    'Una base de datos tiene hasta {0} consultas guardadas.',
  'There is no named query "{0}" the assistant may run.':
    'No hay ninguna consulta guardada "{0}" que el asistente pueda ejecutar.',
  '"params" is an object, e.g. { "from": "2026-10-01" }.':
    '"params" es un objeto, p. ej. { "from": "2026-10-01" }.',
  '{0} takes {1}; not {2}.': a =>
    `${a[0]} recibe ${a[1] === 'no parameters' ? 'ningún parámetro' : a[1]}; no ${a[2]}.`,
  '{0} reads all of {1}, which has about {2} rows; filter on an indexed column (id, or a column marked filterable, unique or a relation).':
    '{0} lee toda la tabla {1}, que tiene unas {2} filas; filtra por una columna con índice (id, o una columna marcada como filtrable, única o una relación).',
  '{0} failed: {1}.': '{0} falló: {1}.',
  '"when" is an object such as { "status": { "changedTo": "READY" } }.':
    '"when" es un objeto como { "status": { "changedTo": "READY" } }.',
  '"when" nests all / any at most {0} deep.':
    '"when" anida all / any hasta {0} niveles.',
  '"{0}" is a non-empty list of conditions, alone in its object.':
    '"{0}" es una lista no vacía de condiciones, sola en su objeto.',
  '"when" names {0}.{1}, which doesn\'t exist.':
    '"when" nombra {0}.{1}, que no existe.',
  '"when".{0} is a test: changedTo, changedFrom, changed or equals.':
    '"when".{0} es una prueba: changedTo, changedFrom, changed o equals.',
  '"when".{0}.{1}: a test is changedTo, changedFrom, changed or equals.':
    '"when".{0}.{1}: una prueba es changedTo, changedFrom, changed o equals.',
  '"when".{0}.changed is true.': '"when".{0}.changed es true.',
  '"when".{0}.{1} is a text, number, true / false or null.':
    '"when".{0}.{1} es un texto, un número, true / false o null.',
  '"when" holds at most {0} tests.': '"when" tiene como máximo {0} pruebas.',
  '{0} is at most {1} characters.': '{0} tiene como máximo {1} caracteres.',
  "{0} uses {{{1}}}, which isn't a column of {2}.":
    '{0} usa {{{1}}}, que no es una columna de {2}.',
  'A trigger runs one thing: "function", "webhook", "chat", "email" or "customer".':
    'Un disparador hace una sola cosa: "function", "webhook", "chat", "email" o "customer".',
  '"function" is the name of one of this project\'s functions.':
    '"function" es el nombre de una de las funciones de este proyecto.',
  '"webhook" is an https URL.': '"webhook" es una URL https.',
  '"webhook" must use https.': '"webhook" debe usar https.',
  '"chat" is { "channelId", "chatId", "text" }.':
    '"chat" es { "channelId", "chatId", "text" }.',
  '"email" is { "to", "subject", "text" }.':
    '"email" es { "to", "subject", "text" }.',
  '"email.to" is 1 to {0} email addresses.':
    '"email.to" son de 1 a {0} correos electrónicos.',
  '"customer" messages the row\'s customer, so {0} must be customer-scoped.':
    '"customer" le escribe al cliente de la fila, así que {0} debe estar limitada al cliente.',
  '"customer" is { "text", "template"? }.':
    '"customer" es { "text", "template"? }.',
  '"customer.template" is { "name", "language", "params"? }.':
    '"customer.template" es { "name", "language", "params"? }.',
  '"customer.template.params" is a list of texts.':
    '"customer.template.params" es una lista de textos.',
  'A trigger is an object.': 'Un disparador es un objeto.',
  'There is no table named {0}.': 'No hay ninguna tabla llamada {0}.',
  'A trigger needs "table".': 'Un disparador necesita "table".',
  '"on" is insert, update or delete.': '"on" es insert, update o delete.',
  "A trigger's name is lowercase letters, digits, _ and -, starting with a letter.":
    'El nombre de un disparador usa minúsculas, dígitos, _ y -, empezando por una letra.',
  '"rateLimit" is 1 to {0} runs a minute.':
    '"rateLimit" va de 1 a {0} ejecuciones por minuto.',
  '"enabled" is true or false.': '"enabled" es true o false.',
  '"replace" is true or false.': '"replace" es true o false.',
  'A trigger named {0} already exists; give this one another name.':
    'Ya hay un disparador llamado {0}; ponle otro nombre a este.',
  "{0}.{1} can't be dropped while the trigger {2} uses it; change or delete that trigger first.":
    '{0}.{1} no se puede eliminar mientras el disparador {2} la usa; cambia o elimina ese disparador primero.',
  "{0}.{1} can't be dropped while the triggers {2} use it; change or delete those triggers first.":
    '{0}.{1} no se puede eliminar mientras los disparadores {2} la usan; cambia o elimina esos disparadores primero.',
  '{0}.{1} is used by triggers ({2}): rename it on its own, then make the other changes.':
    '{0}.{1} la usan disparadores ({2}): renómbrala sola y luego haz los demás cambios.',
  'Clearing the outbox needs "before".':
    'Vaciar la bandeja de salida necesita "before".',
  'There is no trigger named {0}.': 'No hay ningún disparador llamado {0}.',
  '{0} is deployed from ganju.json; change it there.':
    '{0} se despliega desde ganju.json; cámbialo allí.',
  'A trigger named {0} was made in the dashboard; give this one another name.':
    'Ya hay un disparador llamado {0} creado en el panel; ponle otro nombre a este.',
  'A database holds up to {0} triggers.':
    'Una base de datos tiene hasta {0} disparadores.',
  '"triggers" is a list of up to {0} triggers.':
    '"triggers" es una lista de hasta {0} disparadores.',
  'Trigger {0}: {1}': (a, t) => `Disparador ${a[0]}: ${t(a[1])}`,
  'Two triggers are named {0}; give each a "name" of its own.':
    'Hay dos disparadores llamados {0}; dale a cada uno su propio "name".',
  "This project doesn't have a database yet.":
    'Este proyecto aún no tiene base de datos.',
  'This database is deleted. It can be restored until its grace period ends.':
    'Esta base de datos está eliminada. Se puede restaurar hasta que termine su periodo de gracia.',
  '{0} is being copied to drop its column {1} ({2}% done). Tables can be changed again when it finishes.':
    '{0} se está copiando para eliminar su columna {1} ({2} % hecho). Las tablas se pueden cambiar de nuevo cuando termine.',
  '{0} is being copied to change its column {1} ({2}% done). Tables can be changed again when it finishes.':
    '{0} se está copiando para cambiar su columna {1} ({2} % hecho). Las tablas se pueden cambiar de nuevo cuando termine.',
  '{0} is being copied to drop its column {1} ({2}% done), and this write would change its rows. Try again when it finishes.':
    '{0} se está copiando para eliminar su columna {1} ({2} % hecho), y esta escritura cambiaría sus filas. Vuelve a intentarlo cuando termine.',
  '{0} is being copied to change its column {1} ({2}% done), and this write would change its rows. Try again when it finishes.':
    '{0} se está copiando para cambiar su columna {1} ({2} % hecho), y esta escritura cambiaría sus filas. Vuelve a intentarlo cuando termine.',
  'This database belongs to another project.':
    'Esta base de datos pertenece a otro proyecto.',
  'This database is deleted. Restore it instead of creating it again.':
    'Esta base de datos está eliminada. Restáurala en lugar de crearla de nuevo.',
  '"{0}" isn\'t a time zone; use an IANA name such as America/Bogota.':
    '"{0}" no es una zona horaria; usa un nombre IANA como America/Bogota.',
  'Only a deleted database can be purged.':
    'Solo se puede vaciar una base de datos eliminada.',
  "This organization's plan no longer includes Data, so the database is read-only.":
    'El plan de esta organización ya no incluye Data, así que la base de datos es de solo lectura.',
  'A restore point is a time within the last 30 days.':
    'Un punto de restauración es un momento de los últimos 30 días.',
  'This database has no history yet; restore points start about a minute after its first change.':
    'Esta base de datos aún no tiene historial; los puntos de restauración empiezan como un minuto después de su primer cambio.',
  'That time is before this database had any data (its first change was {0}).':
    'Ese momento es anterior a los primeros datos de esta base de datos (su primer cambio fue el {0}).',
  'That time is before this database had any data.':
    'Ese momento es anterior a los primeros datos de esta base de datos.',
  "That restore point isn't available: {0}":
    'Ese punto de restauración no está disponible: {0}',
  'A restore needs a bookmark.': 'Una restauración necesita un marcador.',
  '"format" is jsonl or csv.': '"format" es jsonl o csv.',
  'An export is already running.': 'Ya hay una exportación en curso.',
  'No such export.': 'No existe esa exportación.',
  "This project doesn't have a database.":
    'Este proyecto no tiene base de datos.',
  'Type the database\'s name, "{0}", to delete it.':
    'Escribe el nombre de la base de datos, "{0}", para eliminarla.',
  'That bookmark is not one to restore to: use the one a checkpoint, a dropped table or column, a type change, or a restore answered with.':
    'Ese marcador no sirve para restaurar: usa el que te devolvió un punto de control, una tabla o columna eliminada, un cambio de tipo o una restauración.',
  'Type the table\'s name, "{0}", to drop it.':
    'Escribe el nombre de la tabla, "{0}", para eliminarla.',
  'There is no such run.': 'No existe esa ejecución.',
  'There is no such index suggestion.': 'No existe esa sugerencia de índice.',
  'An unused index is only flagged; remove it from the column if you want to, or dismiss the suggestion.':
    'Un índice sin uso solo se señala; quítalo de la columna si quieres, o descarta la sugerencia.',
  'Only a failed or skipped run can be tried again.':
    'Solo se puede reintentar una ejecución fallida u omitida.',
  'This run kept no event to send again.':
    'Esta ejecución no guardó ningún evento para enviar de nuevo.',
  'This export failed: {0}.': a =>
    `Esta exportación falló: ${a[0] === 'unknown error' ? 'error desconocido' : a[0]}.`,
  'This export is still running.': 'Esta exportación aún está en curso.',
  'This export has no file for {0}.':
    'Esta exportación no tiene archivo para {0}.',
  'This export has no schema file.':
    'Esta exportación no tiene archivo de esquema.',
  'This export is no longer stored.': 'Esta exportación ya no está guardada.',
  'This project has a deleted database still in its grace period. Restore it, or send "replaceDeleted": true to start a new one.':
    'Este proyecto tiene una base de datos eliminada aún en su periodo de gracia. Restáurala, o envía "replaceDeleted": true para empezar una nueva.',
  'The deleted database changed while this ran (restored, or replaced already). Reload and try again.':
    'La base de datos eliminada cambió mientras esto se ejecutaba (se restauró o ya se reemplazó). Recarga e inténtalo de nuevo.',
  'This database is not live.': 'Esta base de datos no está activa.',
  'Only a database in its grace period can be restored.':
    'Solo se puede restaurar una base de datos en su periodo de gracia.',
  "{0} isn't a function of this project; deploy it first.":
    '{0} no es una función de este proyecto; publícala primero.',
  "{0} isn't a function of this project; deploy them first.":
    '{0} no es una función de este proyecto; publícala primero.',
  "{0} aren't functions of this project; deploy it first.":
    '{0} no son funciones de este proyecto; publícalas primero.',
  "{0} aren't functions of this project; deploy them first.":
    '{0} no son funciones de este proyecto; publícalas primero.',
  'There is no channel {0} in this project.':
    'No hay ningún canal {0} en este proyecto.',
  "A chat message goes to a Telegram group or a Slack or Discord channel; on WhatsApp, message the row's customer instead.":
    'Un mensaje de chat va a un grupo de Telegram o a un canal de Slack o Discord; en WhatsApp, escríbele al cliente de la fila.',
  'A table needs a name.': 'Una tabla necesita un nombre.',
  'A column needs a name.': 'Una columna necesita un nombre.',
  '"{0}" isn\'t a valid table name: use lowercase letters, digits and _, starting with a letter, up to 63 characters.':
    '"{0}" no es un nombre de tabla válido: usa minúsculas, dígitos y _, empezando por una letra, hasta 63 caracteres.',
  '"{0}" isn\'t a valid column name: use lowercase letters, digits and _, starting with a letter, up to 63 characters.':
    '"{0}" no es un nombre de columna válido: usa minúsculas, dígitos y _, empezando por una letra, hasta 63 caracteres.',
  '"{0}": two underscores in a row are reserved.':
    '"{0}": dos guiones bajos seguidos están reservados.',
  '"{0}" is a reserved name.': '"{0}" es un nombre reservado.',
  '"{0}" looks like one of the database\'s own index names; pick another table name.':
    '"{0}" parece el nombre de uno de los índices de la base de datos; elige otro nombre de tabla.',
  '"{0}" is reserved by SQLite; pick another table name (e.g. "{1}_ref").':
    '"{0}" está reservado por SQLite; elige otro nombre de tabla (p. ej. "{1}_ref").',
  '"{0}" is reserved by SQLite; pick another column name (e.g. "{1}_ref").':
    '"{0}" está reservado por SQLite; elige otro nombre de columna (p. ej. "{1}_ref").',
  '"{0}" is a column every table already has.':
    '"{0}" es una columna que ya tienen todas las tablas.'
};

interface Compiled {
  pattern: RegExp;
  render: string | Render;
  prefix: number;
  literal: number;
}

const compile = (template: string, render: string | Render): Compiled => {
  const parts = template.split(/\{\d+\}/);
  return {
    pattern: new RegExp(
      `^${parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('([\\s\\S]*?)')}$`
    ),
    render,
    prefix: parts[0].length,
    literal: parts.join('').length
  };
};

let compiled: Compiled[] | null = null;

// Templates that open with fixed text go first, so "Row 3: menu.name is
// required." is read as a row's message and not as a column called "Row 3:
// menu"; then the most specific.
const templates = (): Compiled[] =>
  (compiled ??= Object.entries(DATA_ERROR_MESSAGES_ES)
    .map(([template, render]) => compile(template, render))
    .filter(c => c.literal > 0)
    .sort(
      (a, b) =>
        Math.min(b.prefix, 1) - Math.min(a.prefix, 1) ||
        b.prefix - a.prefix ||
        b.literal - a.literal
    ));

const translate = (message: string): string | null => {
  // A refused update: any message, then why the row didn't match. Split
  // first, or a template's last value would swallow the English tail.
  const guarded =
    /^([\s\S]*?\.)( Row \d+ doesn't exist in [\s\S]+\.| Current values: [\s\S]*\.)$/.exec(
      message
    );
  if (guarded) {
    const head = translate(guarded[1]);
    if (head) return head + guardSuffix(guarded[2]);
  }
  for (const { pattern, render } of templates()) {
    const match = pattern.exec(message);
    if (!match) continue;
    const args = match.slice(1);
    return typeof render === 'string'
      ? render.replace(/\{(\d+)\}/g, (_, i) => args[Number(i)] ?? '')
      : render(args, nested => translate(nested) ?? nested);
  }
  return null;
};

/** `message` in `language`, or as it is when there's no translation. */
export const localizeDataError = (
  message: string,
  language: string
): string => {
  if (language !== constants.LANGUAGE_ES) return message;
  try {
    const translated = translate(message);
    if (!translated) return message;
    // A named query's parameter, labelled the way column values are.
    return translated.replace(/^Parameter /, 'El parámetro ');
  } catch {
    return message;
  }
};
