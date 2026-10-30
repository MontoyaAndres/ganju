import { CliError } from '../errors.js';

/**
 * `--map 'Nombre=name'`: a header the automatic match missed, pointed at a
 * column by hand, as the dashboard's mapping step does. `--map 'Notas='`
 * leaves a header out. A header is found by its exact text first, then
 * ignoring case and surrounding spaces.
 */
export const applyHeaderMap = (
  headers: string[],
  mapping: (string | null)[],
  columns: string[],
  entries: string[] | undefined
): (string | null)[] => {
  const out = [...mapping];
  for (const entry of entries ?? []) {
    // Split at the last "=", so a header may itself hold one.
    const at = entry.lastIndexOf('=');
    if (at <= 0) {
      throw new CliError(`--map "${entry}" is not header=column`, {
        hint: "e.g. --map 'Precio (COP)=price', or --map 'Notas=' to leave a header out"
      });
    }
    const header = entry.slice(0, at).trim();
    const column = entry.slice(at + 1).trim();
    let index = headers.indexOf(header);
    if (index === -1) {
      index = headers.findIndex(
        h => h.trim().toLowerCase() === header.toLowerCase()
      );
    }
    if (index === -1) {
      throw new CliError(`--map: the file has no header "${header}"`, {
        hint: `Headers: ${headers.join(', ')}`
      });
    }
    if (column && !columns.includes(column)) {
      throw new CliError(`--map: there is no column "${column}"`, {
        hint: `Columns: ${columns.join(', ')}`
      });
    }
    // A column fills from one header: mapping it here takes it off any other.
    if (column) {
      out.forEach((name, i) => {
        if (name === column && i !== index) out[i] = null;
      });
    }
    out[index] = column || null;
  }
  return out;
};
