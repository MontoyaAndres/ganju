import { GetServerSidePropsContext } from 'next';

export interface IFetcherProps {
  url: string;
  config?: RequestInit;
  ssrContext?: GetServerSidePropsContext;
}

/**
 * The language the API should answer in.
 *
 * Not the browser's `Accept-Language`: someone in Bogotá running Chrome in
 * English, or someone who picked a language in the switcher, would have the
 * header disagree with the page they are looking at. This sends what the app is
 * actually rendering, from the one place that always knows.
 *
 * `Accept-Language` is the right header for it and is CORS-safelisted, so
 * cross-origin calls to the API pick up no preflight for carrying it.
 */
const requestLanguage = (ssrContext?: GetServerSidePropsContext) => {
  // On the server, the locale Next resolved for this request.
  if (ssrContext?.locale) return ssrContext.locale;
  // In the browser, `_document.tsx` sets `<html lang>` from that same locale,
  // so it is guaranteed to match what the reader is looking at.
  if (typeof document !== 'undefined') {
    return document.documentElement.lang || undefined;
  }
  return undefined;
};

/** `HeadersInit` in any of its three shapes, flattened so it can be merged. */
const toRecord = (init?: HeadersInit): Record<string, string> => {
  if (!init) return {};
  const entries =
    typeof Headers !== 'undefined' && init instanceof Headers
      ? Array.from(init.entries())
      : Array.isArray(init)
        ? init
        : Object.entries(init);
  const record: Record<string, string> = {};
  for (const [key, value] of entries) record[key] = value;
  return record;
};

export const fetcher = async (props: IFetcherProps) => {
  const { url, config: fetchConfig, ssrContext } = props;

  const isFormData =
    typeof FormData !== 'undefined' && fetchConfig?.body instanceof FormData;

  const language = requestLanguage(ssrContext);

  // FormData sets its own Content-Type, boundary included — naming it here
  // would corrupt the body.
  const headers: Record<string, string> = isFormData
    ? {}
    : { 'Content-Type': 'application/json' };

  if (language) {
    headers['Accept-Language'] = language;
  }

  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${url}`, {
    ...fetchConfig,
    // Merged rather than overwritten. Spreading `fetchConfig` last used to
    // replace this object wholesale, so every SSR call that forwards a `cookie`
    // header silently dropped the ones set here.
    headers: { ...headers, ...toRecord(fetchConfig?.headers) }
  });

  if (ssrContext) {
    const cookie = response.headers.get('set-cookie');

    if (cookie) {
      ssrContext.res.setHeader('Set-Cookie', cookie);
    }
  }

  const json = await response.json();

  return json;
};
