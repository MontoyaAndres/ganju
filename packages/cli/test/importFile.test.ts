// Reading the file `ganju data import` is given: spreadsheets through SheetJS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as XLSX from 'xlsx';

import { readImportFile } from '../src/data/importFile.ts';

const dir = mkdtempSync(join(tmpdir(), 'ganju-import-'));

const workbook = (path: string) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ['name', 'price', 'since'],
      ['Margherita', 28000, new Date(2026, 0, 15)],
      [null, null, null],
      ['Hawaiana', 30000, null]
    ]),
    'Menu'
  );
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([['city'], ['Girardot']]),
    'Cities'
  );
  writeFileSync(path, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
};

test('an .xlsx reads its first sheet, blank lines left out, dates as text', async () => {
  const path = join(dir, 'menu.xlsx');
  workbook(path);
  const read = await readImportFile(path);
  assert.deepEqual(read.headers, ['name', 'price', 'since']);
  assert.deepEqual(read.rows, [
    ['Margherita', 28000, '2026-01-15'],
    ['Hawaiana', 30000, null]
  ]);
  // Lines as the sheet numbers them, the blank one skipped.
  assert.deepEqual(read.lines, [2, 4]);
});

test('--sheet picks another sheet, and a missing one names those there are', async () => {
  const path = join(dir, 'book.xlsx');
  workbook(path);
  const read = await readImportFile(path, 'Cities');
  assert.deepEqual(read.rows, [['Girardot']]);
  await assert.rejects(
    readImportFile(path, 'Nope'),
    /no sheet "Nope"\. Sheets: Menu, Cities/
  );
});

test('--sheet on a CSV is refused', async () => {
  const path = join(dir, 'menu.csv');
  writeFileSync(path, 'name\nMargherita\n');
  await assert.rejects(
    readImportFile(path, 'Menu'),
    /--sheet is for a spreadsheet/
  );
});
