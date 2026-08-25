import {
  LANGS,
  DEFAULT_LANG,
  LOCALE_TAG,
  LANG_LABEL,
  toLang,
  createT,
  createFormat,
  formatBytes,
  numberFormat,
  dateFormat
} from './core';
import { useT, useLang } from './useT';
import { useFormat } from './useFormat';
import { langHref } from './langHref';
import { copy } from './copy';
import { catalogCopy } from './copy/toolCatalog';

export type {
  Lang,
  Copy,
  Catalog,
  Params,
  Format,
  Translate,
  PluralKey
} from './core';

export const i18n = {
  copy,
  catalogCopy,
  useT,
  useLang,
  useFormat,
  langHref,
  toLang,
  createT,
  createFormat,
  formatBytes,
  numberFormat,
  dateFormat,
  LANGS,
  DEFAULT_LANG,
  LOCALE_TAG,
  LANG_LABEL
};
