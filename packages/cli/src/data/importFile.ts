import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

import {
  readSheet,
  type ImportRow,
  type SheetJs
} from '@ganju/utils/dataImport';

import { CliError } from '../errors.js';
import { parseCsv } from './csv.js';
import { parseJsonOrLines } from './json.js';

// The file `ganju data import` is given, as headers and rows: a spreadsheet
// (its first sheet, or the one named), JSON or JSONL, or CSV / TSV.

export interface ReadFile {
  headers: string[];
  rows: ImportRow[];
  lines: number[];
}

const cellOf = (value: unknown): ImportRow[number] => {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value;
  return JSON.stringify(value);
};

const SPREADSHEET_EXTENSIONS = new Set(['.xlsx', '.xlsm', '.xls', '.ods']);

// SheetJS is bundled beside the CLI and loaded only for a spreadsheet.
const loadSheetJs = async () => (await import('xlsx')) as unknown as SheetJs;

export const readImportFile = async (
  path: string,
  sheet?: string
): Promise<ReadFile> => {
  const extension = extname(path).toLowerCase();
  if (SPREADSHEET_EXTENSIONS.has(extension)) {
    const bytes = await readFile(path).catch(() => {
      throw new CliError(`Cannot read ${path}`);
    });
    try {
      const read = readSheet(
        await loadSheetJs(),
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer,
        basename(path),
        sheet ?? null
      );
      return { headers: read.headers, rows: read.rows, lines: read.lines };
    } catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError(
        `Cannot read ${basename(path)}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (sheet !== undefined) {
    throw new CliError('--sheet is for a spreadsheet', {
      hint: `${basename(path)} isn't one (.xlsx, .xls or .ods).`
    });
  }
  const text = await readFile(path, 'utf8').catch(() => {
    throw new CliError(`Cannot read ${path}`);
  });
  if (
    extension === '.jsonl' ||
    extension === '.ndjson' ||
    extension === '.json'
  ) {
    const parsed = parseJsonOrLines(text, path);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const headers: string[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new CliError(`${basename(path)}: every line is an object`);
      }
      for (const key of Object.keys(item))
        if (!headers.includes(key)) headers.push(key);
    }
    return {
      headers,
      rows: list.map(item =>
        headers.map(h => cellOf((item as Record<string, unknown>)[h]))
      ),
      lines: list.map((_, i) => i + 1)
    };
  }
  const csv = parseCsv(text, extension === '.tsv' ? '\t' : undefined);
  return { headers: csv.headers, rows: csv.rows, lines: csv.lines };
};
