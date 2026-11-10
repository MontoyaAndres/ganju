// Project-data errors in Spanish: every message the engine and the API can
// throw has a translation, and the values in it come through untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript-6';

import {
  DATA_ERROR_MESSAGES_ES,
  localizeDataError
} from '../src/localizeDataError.ts';
import { identifierIssue } from '../src/dataIdentifiers.ts';

const root = new URL('../../../', import.meta.url);
const utilsSrc = new URL('packages/utils/src/', root);

const SOURCES = [
  ...readdirSync(utilsSrc)
    .filter(f => /^data.*\.ts$/.test(f))
    .map(f => new URL(f, utilsSrc)),
  new URL('apps/data/src/projectDatabase.ts', root),
  new URL('apps/api/src/controllers/artifact/data.ts', root),
  new URL('apps/api/src/controllers/artifact/dataActions.ts', root),
  new URL('apps/api/src/utils/dataDatabase.ts', root),
  new URL('apps/api/src/utils/dataTriggers.ts', root),
  new URL('apps/api/src/utils/dataSheetSync.ts', root),
  new URL('packages/db/src/lib/channels.ts', root)
];
const ERROR_CLASSES = new Set(['DataError', 'ChannelSendError']);

const unwrap = (node: ts.Node): ts.Node =>
  ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;

// A message as the table keys it: each interpolation becomes {0}, {1}, …, and
// a choice between texts (`row${n === 1 ? '' : 's'}`) becomes one key each.
// Null for a message passed along from somewhere else.
const templatesOf = (node: ts.Node): (string | null)[][] | null => {
  node = unwrap(node);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [[node.text]];
  }
  if (ts.isConditionalExpression(node)) {
    const a = templatesOf(node.whenTrue);
    const b = templatesOf(node.whenFalse);
    return a && b ? [...a, ...b] : null;
  }
  if (ts.isTemplateExpression(node)) {
    let acc: (string | null)[][] = [[node.head.text]];
    for (const span of node.templateSpans) {
      const choice = ts.isConditionalExpression(unwrap(span.expression))
        ? templatesOf(span.expression)
        : null;
      const parts = choice ?? [[null]];
      acc = acc.flatMap(a => parts.map(p => [...a, ...p, span.literal.text]));
    }
    return acc;
  }
  return null;
};

const render = (parts: (string | null)[]) => {
  let i = 0;
  return parts.map(p => (p === null ? `{${i++}}` : p)).join('');
};

const thrownMessages = () => {
  const found = new Set<string>();
  for (const url of SOURCES) {
    const file = url.pathname;
    const source = ts.createSourceFile(
      file,
      readFileSync(url, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    const visit = (node: ts.Node) => {
      if (
        ts.isNewExpression(node) &&
        ERROR_CLASSES.has(node.expression.getText(source)) &&
        node.arguments?.length
      ) {
        for (const parts of templatesOf(node.arguments[0]) ?? []) {
          found.add(render(parts));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
};

test('every DataError message has a Spanish entry', () => {
  const messages = thrownMessages();
  assert.ok(messages.size > 200, `found only ${messages.size} messages`);
  // A message followed by why the update matched no row; split off before
  // the table is read.
  messages.delete('{0}{1}');
  const missing = [...messages].filter(m => !(m in DATA_ERROR_MESSAGES_ES));
  assert.deepEqual(missing, []);
});

test('every entry is still thrown somewhere', () => {
  const messages = thrownMessages();
  const identifierMessages = new Set(
    (['table', 'column'] as const).flatMap(kind =>
      ['', 'Bad', 'a__b', 'sqlite_x', 'ix_1', 'rowid', 'id']
        .map(name => identifierIssue(name, kind))
        .filter((m): m is string => !!m)
        .map(m => m.replace(/"(Bad|a__b|sqlite_x|ix_1|rowid|id)"/g, '"{0}"'))
        .map(m => m.replace(/\(e\.g\. "rowid_ref"\)/, '(e.g. "{1}_ref")'))
    )
  );
  const stale = Object.keys(DATA_ERROR_MESSAGES_ES).filter(
    m => !messages.has(m) && !identifierMessages.has(m)
  );
  assert.deepEqual(stale, []);
});

test('identifier problems read in Spanish for tables and columns', () => {
  for (const kind of ['table', 'column'] as const) {
    for (const name of ['', 'Bad', 'a__b', 'sqlite_x', 'rowid']) {
      const english = identifierIssue(name, kind)!;
      const spanish = localizeDataError(english, 'es');
      assert.notEqual(spanish, english, english);
    }
  }
  assert.equal(
    localizeDataError(identifierIssue('rowid', 'column')!, 'es'),
    '"rowid" está reservado por SQLite; elige otro nombre de columna (p. ej. "rowid_ref").'
  );
});

test('values come through as written', () => {
  assert.equal(
    localizeDataError("menu.stock can't go below 0.", 'es'),
    'menu.stock no puede bajar de 0.'
  );
  assert.equal(
    localizeDataError(
      'Unknown column "prize" in menu. Columns: id, name, price.',
      'es'
    ),
    'Columna desconocida "prize" en menu. Columnas: id, name, price.'
  );
  assert.equal(
    localizeDataError(
      '"chat.text" uses {{total}}, which isn\'t a column of orders.',
      'es'
    ),
    '"chat.text" usa {{total}}, que no es una columna de orders.'
  );
  assert.equal(
    localizeDataError('"webhook" must use https.', 'es'),
    '"webhook" debe usar https.'
  );
});

test('nested messages and English fragments are translated too', () => {
  assert.equal(
    localizeDataError(
      'Operation 1 (insert orders): Row 2: orders.total is required.',
      'es'
    ),
    'Operación 1 (insert orders): Fila 2: orders.total es obligatorio.'
  );
  assert.equal(
    localizeDataError('Trigger notify: "webhook" must use https.', 'es'),
    'Disparador notify: "webhook" debe usar https.'
  );
  assert.equal(
    localizeDataError(
      'Not allowed: the assistant\'s access to "menu" is read only.',
      'es'
    ),
    'No permitido: el acceso del asistente a "menu" es solo lectura.'
  );
  assert.equal(
    localizeDataError('The SQL has an unterminated string.', 'es'),
    'El SQL tiene un texto entre comillas sin cerrar.'
  );
  assert.equal(
    localizeDataError('Parameter from must be a whole number.', 'es'),
    'El parámetro from debe ser un número entero.'
  );
});

test("a channel's refusal of a template reads in Spanish", () => {
  assert.equal(
    localizeDataError(
      "The WhatsApp template pedido_listo (es) is still in Meta's review; only approved templates can be sent.",
      'es'
    ),
    'La plantilla de WhatsApp pedido_listo (es) sigue en revisión de Meta; solo se pueden enviar plantillas aprobadas.'
  );
  assert.equal(
    localizeDataError(
      'The WhatsApp template pedido listo (es_CO) was rejected by Meta (INVALID_FORMAT); only approved templates can be sent.',
      'es'
    ),
    'La plantilla de WhatsApp pedido listo (es_CO) fue rechazada por Meta (INVALID_FORMAT); solo se pueden enviar plantillas aprobadas.'
  );
  assert.equal(
    localizeDataError(
      'The WhatsApp template promo (en) is paused by Meta; only approved templates can be sent.',
      'es'
    ),
    'La plantilla de WhatsApp promo (en) está pausada por Meta; solo se pueden enviar plantillas aprobadas.'
  );
  assert.equal(
    localizeDataError(
      'The WhatsApp template promo (en) is disabled by Meta (SPAM); only approved templates can be sent.',
      'es'
    ),
    'La plantilla de WhatsApp promo (en) está desactivada por Meta (SPAM); solo se pueden enviar plantillas aprobadas.'
  );
  assert.equal(
    localizeDataError(
      'The WhatsApp template promo (en) is archived by Meta; only approved templates can be sent.',
      'es'
    ),
    'La plantilla de WhatsApp promo (en) está en el estado archived por Meta; solo se pueden enviar plantillas aprobadas.'
  );
  assert.equal(
    localizeDataError(
      "This customer already got the channel's 20 messages for the last 24 hours.",
      'es'
    ),
    'Este cliente ya recibió los 20 mensajes del canal de las últimas 24 horas.'
  );
});

test('a refused update keeps why the row did not match', () => {
  assert.equal(
    localizeDataError(
      "menu.stock can't go below 0. Current values: stock = 0.",
      'es'
    ),
    'menu.stock no puede bajar de 0. Valores actuales: stock = 0.'
  );
  assert.equal(
    localizeDataError(
      "update on menu changed 0 rows, expected 1; nothing was written. Row 9 doesn't exist in menu.",
      'es'
    ),
    'update en menu cambió 0 filas, se esperaba 1; no se escribió nada. La fila 9 no existe en menu.'
  );
});

test('unknown messages and other languages stay as they are', () => {
  assert.equal(
    localizeDataError('Something the table has never seen.', 'es'),
    'Something the table has never seen.'
  );
  assert.equal(
    localizeDataError('"webhook" must use https.', 'en'),
    '"webhook" must use https.'
  );
});

test("a sheet sync's refusals read in Spanish, line by line", () => {
  assert.equal(
    localizeDataError(
      'Line 3: sku "P1" is already on line 2; each line of the sheet needs its own key.',
      'es'
    ),
    'Línea 3: sku "P1" ya está en la línea 2; cada línea de la hoja necesita su propia clave.'
  );
  assert.equal(
    localizeDataError('Line 4: menu.price is required.', 'es'),
    'Línea 4: menu.price es obligatorio.'
  );
  assert.equal(
    localizeDataError(
      'menu is synced from "Menú.xlsx"; change the sheet, or stop syncing it.',
      'es'
    ),
    'menu se sincroniza desde "Menú.xlsx"; cambia la hoja, o deja de sincronizarla.'
  );
});
