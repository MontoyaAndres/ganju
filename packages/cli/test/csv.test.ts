// Reading CSV files for `ganju data import`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectSeparator, parseCsv } from '../src/data/csv.ts';

test('headers, rows and the line each row starts on', () => {
  const csv = parseCsv('name,price\nMargherita,28000\nHawaiana,30000\n');
  assert.deepEqual(csv.headers, ['name', 'price']);
  assert.deepEqual(csv.rows, [
    ['Margherita', '28000'],
    ['Hawaiana', '30000']
  ]);
  assert.deepEqual(csv.lines, [2, 3]);
});

test('quotes: separators, doubled quotes and line breaks inside a cell', () => {
  const csv = parseCsv('name,note\r\n"Pizza, grande","say ""hi"""\r\n"two\nlines",x\r\nlast,y');
  assert.deepEqual(csv.rows, [
    ['Pizza, grande', 'say "hi"'],
    ['two\nlines', 'x'],
    ['last', 'y']
  ]);
  // The row after a two-line cell starts two lines further down.
  assert.deepEqual(csv.lines, [2, 3, 5]);
});

test('a byte-order mark and blank lines are not data', () => {
  const csv = parseCsv('﻿name;price\n\nA;1\n;\nB;2\n');
  assert.deepEqual(csv.headers, ['name', 'price']);
  assert.deepEqual(csv.rows, [
    ['A', '1'],
    ['B', '2']
  ]);
  assert.deepEqual(csv.lines, [3, 5]);
});

test('the separator is read from the header line', () => {
  assert.equal(detectSeparator('a,b,c\n1;2'), ',');
  assert.equal(detectSeparator('nombre;precio\n"28,5";1'), ';');
  assert.equal(detectSeparator('a\tb\n'), '\t');
  assert.equal(detectSeparator('"a;b",c\n'), ',');
  // Spanish Excel: the decimal comma stays inside its cell.
  assert.deepEqual(parseCsv('nombre;precio\nPizza;28,5').rows, [['Pizza', '28,5']]);
});

test('empty cells stay empty strings', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,,3\n').rows, [['1', '', '3']]);
});
