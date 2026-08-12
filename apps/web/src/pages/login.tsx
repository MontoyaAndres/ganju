import { useRouter } from 'next/router';

import { Components } from '../components';
import { Seo } from '../components/Seo';
import { ssr } from '../utils';
import { i18n } from '../lib';

// types
import type { GetServerSideProps } from 'next';

/**
 * Sign-in page for the OAuth authorize flow.
 *
 * `@better-auth/oauth-provider` is configured with this as its `loginPage` and
 * sends clients here with the signed authorization query attached. The query is
 * carried through sign-in by `oauthProviderClient()` on the auth client, which
 * is what lets the provider resume the authorize flow once the session exists.
 *
 * It renders the same view as `/` and stays out of the search index so the two
 * don't compete — `/` remains the canonical sign-in page for everyone arriving
 * without an OAuth request.
 */
const LoginPage = () => {
  const { locale } = useRouter();
  const t = i18n.useT(i18n.copy.AUTH);

  return (
    <>
      <Seo
        locale={locale}
        title={t('seoTitle')}
        description={t('seoLoginDescription')}
        imageAlt={t('seoImageAlt')}
      />
      <Components.Views.Auth />
    </>
  );
};

// An authenticated visitor is normally sent on to their organizations. Not so
// mid-authorization: the provider routes people here to re-authenticate for
// `prompt=login`, and bouncing them would strand the client that's waiting on
// the callback.
export const getServerSideProps: GetServerSideProps = async context => {
  if (context.query.client_id) return { props: {} };
  return ssr.redirectIfAuthenticated(context);
};

LoginPage.getLayout = Components.Layouts.Auth;

export default LoginPage;
