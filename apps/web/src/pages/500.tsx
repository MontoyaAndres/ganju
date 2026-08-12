import { Components } from '../components';
import { i18n } from '../lib';

/** The same story as `404.tsx`, for the errors we did not see coming. */
const ServerErrorPage = () => {
  const c = i18n.useT(i18n.copy.COMMON);

  return (
    <Components.Views.Error
      code={500}
      title={c('serverErrorTitle')}
      text={c('serverErrorText')}
    />
  );
};

export const getStaticProps = () => ({ props: {} });

ServerErrorPage.getLayout = Components.Layouts.Auth;

export default ServerErrorPage;
