import { useRouter } from 'next/router';

import { Components } from '../components';
import { Seo } from '../components/Seo';
import { ssr } from '../utils';

const IndexPage = () => {
  const { locale } = useRouter();

  return (
    <>
      <Seo
        index
        path="/"
        locale={locale}
        title="Log in to Ganju"
        description="Log in to your Ganju account to manage your projects, resources, tools, and channels — and connect your AI to your files and apps."
      />
      <Components.Views.Auth />
    </>
  );
};

export const getServerSideProps = ssr.redirectIfAuthenticated;

IndexPage.getLayout = Components.Layouts.Auth;

export default IndexPage;
