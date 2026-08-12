/**
 * The handful of constants the language routing needs, kept local on purpose.
 *
 * The dashboard reads the same values from `@ganju/utils`, and this site used to
 * as well. It no longer does: the site is otherwise dependency-free, and pulling
 * the workspace package in dragged zod, dayjs and the crypto helpers into the
 * `/` Pages Function — 130 KB gzipped in front of the busiest route we have, for
 * a twenty-line redirect.
 *
 * **These values are duplicated in `packages/utils/src/constants.ts` and must
 * stay identical.** A visitor who picks a language on ganju.ai and then signs in
 * at app.ganju.ai has to be recognised by the dashboard's middleware, and that
 * only works while both sides agree on the cookie name and the country list.
 * Change one, change the other.
 */

const LANGUAGE_EN = 'en';
const LANGUAGE_ES = 'es';

/** Countries where Spanish is the (or an) official language. */
const SPANISH_COUNTRIES = [
  'AR',
  'BO',
  'CL',
  'CO',
  'CR',
  'CU',
  'DO',
  'EC',
  'ES',
  'GQ',
  'GT',
  'HN',
  'MX',
  'NI',
  'PA',
  'PE',
  'PR',
  'PY',
  'SV',
  'UY',
  'VE'
];

/** Where an explicit language choice is remembered. */
const LANGUAGE_COOKIE = 'ganju_lang';
const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
/** Query parameter that carries an explicit switch, e.g. `?lang=es`. */
const LANGUAGE_QUERY_PARAM = 'lang';

export const constants = {
  LANGUAGE_EN,
  LANGUAGE_ES,
  SPANISH_COUNTRIES,
  LANGUAGE_COOKIE,
  LANGUAGE_COOKIE_MAX_AGE,
  LANGUAGE_QUERY_PARAM
};
