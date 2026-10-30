/**
 * Reading a CSV file into rows of text, with no parser package behind it.
 *
 * RFC 4180 plus the two things spreadsheets actually write: a byte-order mark
 * in front, and `;` between fields where the decimal mark is a comma (Excel in
 * Spanish). The separator is read from the header line, so the same file
 * exported from either locale imports the same way.
 *
 * Every cell comes back as text. Deciding what "28.000" means is the shared
 * import code's job, so the CLI and the dashboard decide it the same way.
 */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  // The file line each row starts on, counting the header as line 1, since a
  // quoted cell can span lines and blank lines are skipped.
  lines: number[];
}

const SEPARATORS = [',', ';', '\t'] as const;

// The separator that appears most in the first line, outside quotes.
export const detectSeparator = (text: string): string => {
  const counts = new Map<string, number>(SEPARATORS.map(s => [s, 0]));
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && counts.has(char))
      counts.set(char, counts.get(char)! + 1);
  }
  let best = ',';
  for (const [separator, count] of counts) {
    if (count > counts.get(best)!) best = separator;
  }
  return best;
};

export const parseCsv = (input: string, separator?: string): ParsedCsv => {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const sep = separator ?? detectSeparator(text);
  const records: { cells: string[]; line: number }[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let startLine = 1;

  const endCell = () => {
    cells.push(cell);
    cell = '';
  };
  const endRecord = () => {
    endCell();
    // A blank line, or one of nothing but separators, is not a row.
    if (cells.some(c => c.trim() !== '')) {
      records.push({ cells, line: startLine });
    }
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (char === '\n') line++;
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === sep) {
      endCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      startLine = line;
    } else {
      cell += char;
    }
  }
  if (cell !== '' || cells.length) endRecord();

  const [header, ...body] = records;
  return {
    headers: (header?.cells ?? []).map(h => h.trim()),
    rows: body.map(r => r.cells),
    lines: body.map(r => r.line)
  };
};
