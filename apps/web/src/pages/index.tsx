import { useRouter } from 'next/router';

import { Components } from '../components';
import { Seo } from '../components/Seo';
import { ssr } from '../utils';
import { i18n } from '../lib';

const IndexPage = () => {
  const { locale } = useRouter();
  const t = i18n.useT(i18n.copy.AUTH);

  return (
    <>
      <Seo
        index
        path="/"
        locale={locale}
        title={t('seoTitle')}
        description={t('seoIndexDescription')}
        imageAlt={t('seoImageAlt')}
      />
      <Components.Views.Auth />
    </>
  );
};

export const getServerSideProps = ssr.redirectIfAuthenticated;

IndexPage.getLayout = Components.Layouts.Auth;

export default IndexPage;
