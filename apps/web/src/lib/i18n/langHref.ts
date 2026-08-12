import { utils } from '@ganju/utils';

import { Lang } from './core';

/**
 * Where the language switcher points.
 *
 * It goes through `?lang=` rather than pushing the locale directly, because the
 * middleware is what turns an explicit choice into a remembered one: it writes
 * the `ganju_lang` cookie and then redirects to the prefixed path. Switching
 * with `router.push(asPath, undefined, { locale })` would skip the cookie, and
 * the next request from a Spanish-speaking country would undo the choice.
 *
 * `asPath` carries no locale prefix — Next strips it — so the middleware is
 * free to add the right one.
 */
export const langHref = (asPath: string, lang: Lang): string => {
  const [withoutHash, hash] = asPath.split('#');
  const [path, search] = withoutHash.split('?');
  const params = new URLSearchParams(search);
  params.set(utils.constants.LANGUAGE_QUERY_PARAM, lang);
  return `${path}?${params.toString()}${hash ? `#${hash}` : ''}`;
};
