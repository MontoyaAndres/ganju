import esLocale from 'zod/v4/locales/es.js';

import { constants } from './constants';

/**
 * Re-render a Zod validation issue in the reader's language.
 *
 * Zod already ships a complete Spanish locale, so all ~305 built-in validators
 * in `schema.ts` are covered without hand-translating anything. The trick is
 * *where* to apply it. There are ~100 parse call sites across the three
 * services; threading a per-parse error map through all of them is a hundred
 * chances to miss one. Instead this runs once, in `handleError`'s ZodError
 * branch, on the way out.
 *
 * That works because a Zod 4 issue keeps its structured fields — `code`,
 * `origin`, `minimum`, `divisor`, `keys` — alongside the rendered `message`,
 * and a locale error map is exactly a function from that structured issue to a
 * string. So the English message Zod produced at parse time can be thrown away
 * and rebuilt in Spanish at catch time.
 *
 * **Do not reach for `z.config({ localeError })` instead.** It mutates a
 * module-level global (`zod/src/v4/core/config.ts`), and a Workers isolate
 * serves concurrent requests in different languages — one request would set the
 * locale for whatever else happened to be in flight. Nothing here holds state.
 *
 * What lands in `error_log` is untouched: `handleError` persists `err.message`,
 * which is still Zod's own English dump from parse time. Nothing about
 * persistence, and no migration, is involved.
 */

/** Minimal shape of the issue we need; Zod's own type lives in `zod`. */
export interface ZodIssueLike {
  code?: string;
  message: string;
  path?: PropertyKey[];
}

type LocaleError = (issue: never) => string | { message: string };

/**
 * Messages we wrote ourselves. Zod renders a custom `message:` verbatim, so the
 * locale map never sees them — they arrive here as the exact English string,
 * which is what these keys are. Keying on our own text rather than on a code
 * keeps `schema.ts` free of translation concerns, and keeps the English in
 * `error_log` identical to what it has always been.
 */
const CUSTOM_MESSAGES: Record<string, Record<string, string>> = {
  'This title is reserved as a bot command': {
    es: 'Este título está reservado como comando del bot'
  },
  'Enter a valid email address': {
    es: 'Escribe un correo electrónico válido'
  },
  'Unsupported mime type': {
    es: 'Tipo de archivo no admitido'
  },
  'Slug is reserved': {
    es: 'Ese slug está reservado'
  },
  [constants.RESERVED_TOOL_NAME_MESSAGE]: {
    es: 'Nombre de herramienta no válido — reservado por la plataforma'
  },
  [constants.CUSTOM_CODE_UNKNOWN_CONNECTION_MESSAGE]: {
    es: 'Conexión no válida — no existe un proveedor gestionado con ese nombre'
  },
  [constants.OUTPUT_SCHEMA_NOT_OBJECT_MESSAGE]: {
    es: 'Esquema de salida no válido — debe describir un objeto'
  },
  [constants.CUSTOM_CODE_RESOURCE_PAYLOAD_MESSAGE]: {
    es: 'Envía exactamente uno de content (texto) o bytes (base64)'
  },
  [constants.CUSTOM_CODE_RESOURCE_TEXT_TOO_LARGE_MESSAGE]: {
    es: `El contenido en línea supera el límite de ${constants.CUSTOM_CODE_MAX_RESOURCE_TEXT_BYTES / (1024 * 1024)}MB`
  },
  [constants.CUSTOM_CODE_RESOURCE_FILE_TOO_LARGE_MESSAGE]: {
    es: `Los bytes del archivo superan el límite de ${constants.CUSTOM_CODE_MAX_RESOURCE_FILE_BYTES / (1024 * 1024)}MB`
  }
};

// Built once. `esLocale()` allocates its dictionaries on every call, and this
// runs per issue, per failed request.
const LOCALE_ERRORS: Record<string, LocaleError> = {
  [constants.LANGUAGE_ES]: esLocale().localeError as LocaleError
};

/**
 * Narrow an `Accept-Language` header to a language we ship.
 *
 * `fetcher` sends the app's own locale rather than the browser's list, so this
 * is normally a bare `en` or `es` — but the header is public, and a browser
 * hitting the API directly will send the full `es-CO,es;q=0.9,en;q=0.8` form.
 * Take the first tag and match on its primary subtag.
 */
export const languageFromHeader = (header?: string | null): string => {
  const tag = header?.split(',')[0]?.trim().toLowerCase() ?? '';
  return tag.startsWith(constants.LANGUAGE_ES)
    ? constants.LANGUAGE_ES
    : constants.LANGUAGE_EN;
};

/** The issue's message in `language`, or its original English. */
export const localizeZodIssue = (
  issue: ZodIssueLike,
  language: string
): string => {
  if (language === constants.LANGUAGE_EN) return issue.message;

  const custom = CUSTOM_MESSAGES[issue.message]?.[language];
  if (custom) return custom;

  const localeError = LOCALE_ERRORS[language];
  if (!localeError) return issue.message;

  try {
    const rendered = localeError(issue as never);
    const message = typeof rendered === 'string' ? rendered : rendered?.message;
    // A locale map may decline an issue it does not recognise; English is a
    // better answer than an empty string.
    return message || issue.message;
  } catch {
    // Never let a formatting failure turn a 400 into a 500.
    return issue.message;
  }
};
