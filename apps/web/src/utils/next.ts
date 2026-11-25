/**
 * Where to go after sign-in, from a `next` query value. Only a path on this
 * site: `//host` and `/\host` would leave it.
 */
export const safeNext = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  return value;
};

export const signInHref = (path: string) =>
  `/?next=${encodeURIComponent(path)}`;
