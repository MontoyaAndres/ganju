export const toStringArray = (input: unknown): string[] => {
  if (Array.isArray(input)) {
    return input.map(s => String(s).trim()).filter(Boolean);
  }
  if (typeof input === 'string' && input.trim()) {
    return input
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
};
