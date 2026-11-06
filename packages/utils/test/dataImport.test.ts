// Importing a spreadsheet: the guessed column types, the headers matched to
// a table, and each cell checked by the database's own rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  columnNameFromHeader,
  csvLine,
  detectDecimalMark,
  guessColumnType,
  guessColumns,
  importCell,
  importRows,
  matchHeaders,
  parseNumber,
  relationKey,
  replaceOperations,
  replaceTestWrite,
  singleOutReplaceRows,
  DATA_REPLACE_MAX_DRY_RUNS
} from '../src/dataImport.ts';
import type { DataColumn, DataTable } from '../src/dataTypes.ts';

const column = (
  name: string,
  type: DataColumn['type'],
  extra: Partial<DataColumn> = {}
): DataColumn => ({
  id: 1,
  name,
  type,
  label: null,
  description: null,
  required: false,
  unique: false,
  filterable: false,
  searchable: false,
  personal: false,
  values: null,
  table: null,
  onDelete: null,
  min: null,
  default: undefined,
  position: 0,
  ...extra
});

const table = (columns: DataColumn[]): DataTable => ({
  id: 1,
  name: 'menu',
  label: null,
  description: null,
  displayColumn: null,
  access: 'read',
  customerScoped: false,
  history: true,
  position: 0,
  columns
});

test('headers become column names the database accepts', () => {
  assert.equal(columnNameFromHeader('Precio (COP)', 0), 'precio_cop');
  assert.equal(columnNameFromHeader('Descripción', 0), 'descripcion');
  assert.equal(columnNameFromHeader('ID', 0), 'source_id');
  assert.equal(columnNameFromHeader('created_at', 0), 'source_created_at');
  assert.equal(columnNameFromHeader('2024 sales', 0), 'c_2024_sales');
  assert.equal(columnNameFromHeader('!!!', 3), 'column_4');
});

test('types are guessed from the values', () => {
  assert.equal(guessColumnType(['1', '2', '30']).type, 'integer');
  assert.equal(guessColumnType([1, 2.5]).type, 'decimal');
  assert.equal(guessColumnType(['12,5', '3']).type, 'decimal');
  assert.equal(guessColumnType(['sí', 'no', 'si']).type, 'boolean');
  assert.equal(guessColumnType([true, false]).type, 'boolean');
  assert.equal(guessColumnType(['2026-10-21', '2026-01-02']).type, 'date');
  assert.equal(
    guessColumnType(['2026-10-21T09:00:00-05:00', '2026-10-21 10:30']).type,
    'datetime'
  );
  assert.equal(guessColumnType(['ana@example.com']).type, 'email');
  assert.equal(guessColumnType(['https://ganju.ai']).type, 'url');
  assert.equal(guessColumnType(['+57 300 123 4567', '(601) 555-1234']).type, 'phone');
  assert.equal(guessColumnType(['x'.repeat(250)]).type, 'long_text');
  assert.equal(guessColumnType([null, '', undefined]).type, 'text');
});

test('a few bad cells keep the type, so those rows are flagged instead', () => {
  assert.equal(guessColumnType([28000, 32000, 30000, 34000, 'gratis']).type, 'integer');
  assert.equal(
    guessColumnType(['2024-01-15', '2024-03-01', '2024-05-20', 'no sé']).type,
    'date'
  );
  // One fraction makes it decimal, so no value is refused.
  assert.equal(guessColumnType([1, 2, 3, 2.5]).type, 'decimal');
  // Too many misses: text.
  assert.equal(guessColumnType(['1', 'two', 'three', '4']).type, 'text');
  // Two values can't afford a miss.
  assert.equal(guessColumnType(['1', 'x']).type, 'text');
});

test('a short set of repeated values reads as an enum', () => {
  const guess = guessColumnType(['open', 'closed', 'Open', 'open', 'closed']);
  assert.equal(guess.type, 'enum');
  assert.deepEqual(guess.values, ['open', 'closed']);
  // Every value different: just text.
  assert.equal(guessColumnType(['Ana', 'Luis', 'Marta']).type, 'text');
});

test('a new table gets one column per header, with unique names', () => {
  const columns = guessColumns(
    ['Name', 'Price', 'name'],
    [
      ['Margherita', '28000', 'a'],
      ['Pepperoni', '32000', 'b']
    ]
  );
  assert.deepEqual(
    columns.map(c => [c.name, c.type, c.label]),
    [
      ['name', 'text', 'Name'],
      ['price', 'integer', 'Price'],
      ['name_2', 'text', 'name']
    ]
  );
});

test('headers match columns by name or label, ignoring case and accents', () => {
  const menu = table([
    column('name', 'text'),
    column('price', 'integer', { label: 'Precio' }),
    column('stock', 'integer')
  ]);
  assert.deepEqual(matchHeaders(['NAME', 'precio', 'Notes', 'Name'], menu), [
    'name',
    'price',
    null,
    null
  ]);
});

test('cells are checked by the database rules', () => {
  const menu = table([]);
  assert.deepEqual(importCell(menu, column('price', 'decimal'), '12,5'), {
    ok: true,
    value: 12.5
  });
  assert.deepEqual(importCell(menu, column('vegan', 'boolean'), 'Sí'), {
    ok: true,
    value: true
  });
  assert.deepEqual(
    importCell(menu, column('day', 'date'), '2026-10-21T00:00:00.000Z'),
    { ok: true, value: '2026-10-21' }
  );
  assert.deepEqual(
    importCell(menu, column('size', 'enum', { values: ['small', 'large'] }), 'LARGE'),
    { ok: true, value: 'large' }
  );
  assert.deepEqual(importCell(menu, column('qty', 'integer', { min: 1 }), '0'), {
    ok: false,
    error: "menu.qty can't go below 1."
  });
  const bad = importCell(menu, column('price', 'integer'), 'cheap');
  assert.equal(bad.ok, false);
  assert.match((bad as { error: string }).error, /whole number/);
  assert.deepEqual(
    importCell(menu, column('name', 'text', { required: true }), '  '),
    { ok: false, error: 'name is required.' }
  );
});

test('a relation matches the referenced row by its display value or id', () => {
  const lines = table([]);
  const product = column('product', 'relation', { table: 'menu' });
  const relation = new Map([['margherita', 12]]);
  assert.deepEqual(importCell(lines, product, ' Margherita ', { relation }), {
    ok: true,
    value: 12
  });
  assert.equal(relationKey('  Hawaiána '), 'hawaiana');
  assert.deepEqual(importCell(lines, product, 'MARGHERITA', { relation }), {
    ok: true,
    value: 12
  });
  assert.deepEqual(importCell(lines, product, '7', { relation }), {
    ok: true,
    value: 7
  });
  assert.deepEqual(importCell(lines, product, 'Hawaiian', { relation }), {
    ok: false,
    error: 'product: "Hawaiian" matches no row in menu.'
  });
});

test('rows carry their file line and every problem found', () => {
  const menu = table([
    column('name', 'text', { required: true }),
    column('price', 'integer'),
    column('stock', 'integer', { required: true })
  ]);
  const rows = importRows(menu, ['name', 'price', null], [
    ['Margherita', '28000', 'ignored'],
    ['', 'x', '']
  ]);
  assert.deepEqual(rows[0], {
    index: 0,
    line: 2,
    values: { name: 'Margherita', price: 28000 },
    errors: ['stock is required.'],
    warnings: [],
    repeated: []
  });
  assert.equal(rows[1].line, 3);
  assert.equal(rows[1].errors.length, 3);
});

test('rows keep their file line when blank rows were left out', () => {
  const menu = table([column('name', 'text')]);
  const rows = importRows(menu, ['name'], [['a'], ['b']], { lines: [2, 5] });
  assert.deepEqual(rows.map(r => [r.index, r.line]), [[0, 2], [1, 5]]);
});

test('numbers keep their thousands separators', () => {
  assert.deepEqual(parseNumber('28.000'), { value: 28000, ambiguous: true });
  assert.deepEqual(parseNumber('28,000'), { value: 28000, ambiguous: true });
  assert.deepEqual(parseNumber('1.234.567'), { value: 1234567, ambiguous: false });
  assert.deepEqual(parseNumber('1,234.50'), { value: 1234.5, ambiguous: false });
  assert.deepEqual(parseNumber('1.234,50'), { value: 1234.5, ambiguous: false });
  assert.deepEqual(parseNumber('-12,5'), { value: -12.5, ambiguous: false });
  assert.deepEqual(parseNumber('0.500'), { value: 0.5, ambiguous: false });
  assert.deepEqual(parseNumber('1234.567'), { value: 1234.567, ambiguous: false });
  // The file's mark settles one separator before three digits.
  assert.deepEqual(parseNumber('28.000', ','), { value: 28000, ambiguous: false });
  assert.deepEqual(parseNumber('28.000', '.'), { value: 28, ambiguous: false });
  assert.deepEqual(parseNumber('1,500', '.'), { value: 1500, ambiguous: false });
  // Not numbers: groups that aren't threes, two decimal marks, words.
  assert.equal(parseNumber('1.23.456'), null);
  assert.equal(parseNumber('1,234,5'), null);
  assert.equal(parseNumber('1.234,5.6'), null);
  assert.equal(parseNumber('28k'), null);
});

test('the decimal mark is read from the values that say it', () => {
  assert.equal(detectDecimalMark([['28.000', '12,5'], ['1.234.567', 'x']]), ',');
  assert.equal(detectDecimalMark([['1,234.50'], ['3.75']]), '.');
  // Only ambiguous values: nobody can tell.
  assert.equal(detectDecimalMark([['28.000'], ['32.500']]), undefined);
  // Numbers from a spreadsheet's own cells say nothing.
  assert.equal(detectDecimalMark([[28000, 1.5]]), undefined);
});

test('Colombian prices import as thousands, flagged when unsure', () => {
  assert.equal(guessColumnType(['28.000', '32.500', '18.000']).type, 'integer');
  assert.equal(guessColumnType(['28.000', '32.500'], { decimalMark: '.' }).type, 'decimal');
  assert.equal(guessColumnType(['1.234,50', '28.000,00']).type, 'decimal');
  const menu = table([]);
  const price = column('price', 'integer');
  const unsure = importCell(menu, price, '28.000');
  assert.equal(unsure.ok, true);
  assert.equal((unsure as { value: unknown }).value, 28000);
  assert.deepEqual((unsure as { warning?: unknown }).warning, {
    column: 'price',
    text: '28.000',
    read: 28000,
    alternative: 28
  });
  assert.deepEqual(importCell(menu, price, '28.000', { decimalMark: ',' }), {
    ok: true,
    value: 28000
  });
  assert.deepEqual(importCell(menu, column('price', 'decimal'), '1.234,50'), {
    ok: true,
    value: 1234.5
  });
  const rows = importRows(table([price]), ['price'], [['28.000'], ['32000']]);
  assert.equal(rows[0].warnings.length, 1);
  assert.equal(rows[1].warnings.length, 0);
});

test('phone numbers and codes are not quantities', () => {
  assert.equal(
    guessColumnType([3001234567, 3109876543], { header: 'Celular' }).type,
    'phone'
  );
  assert.equal(
    guessColumnType(['3001234567', '3109876543'], { header: 'Teléfono' }).type,
    'phone'
  );
  // A count under a phone-ish header is still a number.
  assert.equal(guessColumnType(['1', '2'], { header: 'phones' }).type, 'integer');
  assert.equal(guessColumnType(['05001', '11001', '76001']).type, 'text');
  assert.deepEqual(
    guessColumns(['Celular'], [[3001234567], [3109876543]]).map(c => c.type),
    ['phone']
  );
});

test('a value repeated in a unique column is flagged on its second line', () => {
  const menu = table([column('name', 'text', { unique: true }), column('price', 'integer')]);
  const rows = importRows(
    menu,
    ['name', 'price'],
    [['Margherita', '28000'], ['Pepperoni', '32000'], ['Margherita', '29000'], ['', '1']]
  );
  assert.deepEqual(rows.map(r => r.errors.length), [0, 0, 1, 0]);
  assert.match(rows[2].errors[0], /^name: "Margherita" is already on line 2/);
  assert.deepEqual(rows.map(r => r.repeated), [[], [], ['name'], []]);
});

test('refused rows are written back as CSV', () => {
  assert.equal(csvLine(['a', 'b,c', 'say "hi"', null, 3]), 'a,"b,c","say ""hi""",,3');
});

test('a replace is the delete, then the rows 500 to an insert', () => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ n: i }));
  const ops = replaceOperations('menu', 3, rows);
  assert.deepEqual(ops[0], { op: 'delete', table: 'menu', where: { id: { gte: 1 } } });
  assert.deepEqual(ops.slice(1).map(op => (op.rows as unknown[]).length), [500, 1]);
  // Nothing to delete in an empty table.
  assert.equal(replaceOperations('menu', 0, rows)[0].op, 'insert');
});

test('a test write always rolls back, and its answer says who refused', () => {
  const plain = table([column('name', 'text')]);
  const test = replaceTestWrite(plain, 10, [{ name: 'a' }]);
  // No unique column: the old rows don't matter, so the delete is left out.
  assert.equal(test.operations[0].op, 'insert');
  const last = test.operations.length - 1;
  assert.deepEqual(test.operations[last], { op: 'delete', table: 'menu', where: { id: { lt: 0 } }, expect: 1 });
  assert.equal(test.answer({ ok: false, code: 'guard', details: { operation: last } }), 'ok');
  assert.deepEqual(
    test.answer({ ok: false, code: 'invalid', error: 'Operation 1 (insert menu): Row 1: name is required.', details: { operation: 0 } }),
    { error: 'name is required.' }
  );
  assert.equal(test.answer({ ok: false, code: 'internal' }), 'stop');
  assert.equal(test.answer({ ok: true }), 'stop');

  const unique = table([column('sku', 'text', { unique: true })]);
  const withDelete = replaceTestWrite(unique, 10, [{ sku: 'a' }]);
  assert.equal(withDelete.operations[0].op, 'delete');
  assert.equal(withDelete.answer({ ok: false, code: 'constraint', details: { operation: 0 } }), 'delete');
});

test('the rows that stop a replace are found by halving', async () => {
  const rows = Array.from({ length: 40 }, (_, i) => i);
  const bad = new Set([3, 17, 38]);
  let calls = 0;
  const found = await singleOutReplaceRows(rows, async part => {
    calls++;
    const hit = part.find(n => bad.has(n));
    return hit === undefined ? 'ok' : { error: `row ${hit} is bad` };
  });
  assert.deepEqual(found?.map(f => f.row), [3, 17, 38]);
  assert.deepEqual(found?.map(f => f.error), ['row 3 is bad', 'row 17 is bad', 'row 38 is bad']);
  assert.ok(calls <= DATA_REPLACE_MAX_DRY_RUNS);
  // The delete failing means no row can be blamed.
  assert.equal(await singleOutReplaceRows(rows, async () => 'delete'), null);
});
