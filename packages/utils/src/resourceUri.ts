import { constants } from './constants';

// The `resource://…` URI the dashboard generates from a title when the author
// doesn't type one, and the same one the broker derives for a script-created
// resource that arrives without a uri.
//
// Shared rather than duplicated because the two have to agree: a resource a
// tool writes should be addressable exactly like one a person uploaded, and a
// script asked to "replace the Q3 report" has to be able to name the row the
// dashboard created. Hyphens, not the underscores `slugifyTitle` produces —
// that one names MCP prompts and bot commands, where an underscore is legal and
// a hyphen isn't.
export const resourceUriFromTitle = (title: string): string =>
  `${constants.CUSTOM_CODE_RESOURCE_URI_PREFIX}${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;
