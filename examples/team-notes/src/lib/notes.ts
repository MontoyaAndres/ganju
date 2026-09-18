/**
 * Where a note lives, and how to find it again.
 *
 * Every note is a resource on the project under `resource://notes/<slug>`. The
 * slug comes from the title, so saving a note with the same title replaces it
 * rather than adding a second copy, and one prefix separates notes from
 * everything else the project holds.
 */

export const NOTES_PREFIX = 'resource://notes/';

export const slugify = (title: string): string =>
  title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export const isNote = (uri: string): boolean => uri.startsWith(NOTES_PREFIX);

/**
 * The uri for whatever the caller passed: a note's own uri, or its title.
 *
 * Accepting both means the model can pass back a uri it got from `list-notes`
 * or `find-notes`, or just the title a person said out loud.
 */
export const noteUri = (titleOrUri: string): string => {
  const value = titleOrUri.trim();
  if (isNote(value)) return value;

  const slug = slugify(value);
  if (!slug) throw new Error('A note title needs at least one letter or digit');
  return `${NOTES_PREFIX}${slug}`;
};
