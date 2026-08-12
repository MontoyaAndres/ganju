import { useMemo } from 'react';
import { useRouter } from 'next/router';

import { Catalog, Copy, Lang, Translate, createT, toLang } from './core';

/**
 * The active language for a component.
 *
 * Views take no props (`Components.Views.Channels` and friends render with zero
 * arguments), so the router is the only channel a locale can travel down. Most
 * views already call `useRouter()`, which is why this reads it too rather than
 * threading a locale through signatures that do not exist.
 */
export const useLang = (): Lang => toLang(useRouter().locale);

/**
 * Translator for one catalog, bound to the active language.
 *
 *     const t = i18n.useT(i18n.copy.LINK);
 *     <h1>{t('title')}</h1>
 *     <p>{t('greeting', { name })}</p>
 *     <p>{t.plural('members', count)}</p>
 */
export const useT = <C extends Copy>(catalog: Catalog<C>): Translate<C> => {
  const lang = useLang();
  return useMemo(() => createT(catalog, lang), [catalog, lang]);
};
