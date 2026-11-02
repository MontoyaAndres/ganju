// The CSV reader is shared with the owner's data-admin tool, so both read a
// file the same way.
export { detectSeparator, parseCsv } from '@ganju/utils/dataImport';
export type { ParsedCsv } from '@ganju/utils/dataImport';
