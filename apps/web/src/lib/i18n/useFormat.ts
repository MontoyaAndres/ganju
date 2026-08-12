import { useMemo } from 'react';

import { Format, createFormat } from './core';
import { useLang } from './useT';

/**
 * Locale-aware number, byte, date and relative-time formatting, without a
 * catalog.
 *
 * For views whose copy is still English: the strings wait for their turn in
 * Phase 2, but a date has no English in it to translate, so it can follow the
 * reader's locale today. `t` from `useT` already carries the same functions — a
 * translated view has no reason to call this as well.
 *
 *     const f = i18n.useFormat();
 *     <span>{f.date(resource.updatedAt)}</span>
 *     <span>{f.bytes(stats.totalSize)}</span>
 */
export const useFormat = (): Format => {
  const lang = useLang();
  return useMemo(() => createFormat(lang), [lang]);
};
