import { Components } from '../components';
import { i18n } from '../lib';

/**
 * Replaces Next's built-in 404, which says "This page could not be found."
 * in English on `/es` as readily as on `/`.
 *
 * `getStaticProps` is here for the locale, not for the props: a static page
 * with `i18n` configured is generated once per locale, so the Spanish copy is
 * in the HTML rather than appearing after hydration.
 */
const NotFoundPage = () => {
  const c = i18n.useT(i18n.copy.COMMON);

  return (
    <Components.Views.Error
      code={404}
      title={c('notFoundTitle')}
      text={c('notFoundText')}
    />
  );
};

export const getStaticProps = () => ({ props: {} });

NotFoundPage.getLayout = Components.Layouts.Auth;

export default NotFoundPage;
