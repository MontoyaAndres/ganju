import { CliError } from '../errors.js';

export const parseJson = (text: string, source: string): unknown => {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError(`${source} is not valid JSON`, {
      hint: error instanceof Error ? error.message : undefined
    });
  }
};

/**
 * JSON, or JSON Lines: a `.jsonl` file (or any text whose lines are each an
 * object) is a list, one line per item.
 */
export const parseJsonOrLines = (text: string, source: string): unknown => {
  const trimmed = text.trim();
  if (
    /\.(jsonl|ndjson)$/i.test(source) ||
    (trimmed.startsWith('{') && /\}\s*\n\s*\{/.test(trimmed))
  ) {
    return trimmed
      .split(/\r?\n/)
      .map((line, index) => ({ line: line.trim(), index }))
      .filter(({ line }) => line)
      .map(({ line, index }) => parseJson(line, `${source} line ${index + 1}`));
  }
  return parseJson(trimmed, source);
};
