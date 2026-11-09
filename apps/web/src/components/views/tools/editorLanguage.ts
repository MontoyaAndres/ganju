// A CLI project's source, shown read-only, can hold any of these. What the
// editor itself writes is always JavaScript.
export const languageFor = (path: string) => {
  const lower = path.toLowerCase();
  if (/\.[mc]?jsx?$/.test(lower)) return 'javascript';
  if (/\.[mc]?tsx?$/.test(lower)) return 'typescript';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
  return 'plaintext';
};

// Names that read the same in every language; plain text is translated.
export const LANGUAGE_NAMES: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  json: 'JSON',
  markdown: 'Markdown'
};
