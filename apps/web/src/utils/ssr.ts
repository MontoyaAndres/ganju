import { GetServerSideProps, GetServerSidePropsContext } from 'next';
import { utils } from '@ganju/utils';
import type { PlanLimits } from '@ganju/utils';

/**
 * What the organization is entitled to, as `getAuthMe` puts it in page props.
 *
 * Declared here rather than in a page or a view because this is the function
 * that produces it, and both of those consume it.
 */
export interface Plan {
  plan: string;
  limits: PlanLimits;
}

const getMe = async (context: GetServerSidePropsContext) => {
  const { req } = context;

  const cookies = req.headers.cookie;

  const me = await utils.fetcher({
    url: '/me',
    config: {
      credentials: 'include',
      headers: {
        cookie: cookies
      }
    },
    ssrContext: context
  });

  if (me && !me?.error) {
    return me;
  }

  return null;
};

const getOrganizations = async (context: GetServerSidePropsContext) => {
  const { req } = context;

  const cookies = req.headers.cookie;

  const organizations = await utils.fetcher({
    url: '/organization',
    config: {
      credentials: 'include',
      headers: {
        cookie: cookies
      }
    },
    ssrContext: context
  });

  if (organizations && !organizations?.error) {
    return organizations;
  }

  return null;
};

const getPlan = async (
  context: GetServerSidePropsContext,
  organizationId: string
) => {
  const plan = await utils.fetcher({
    url: `/organization/${organizationId}/plan`,
    config: {
      credentials: 'include',
      headers: {
        cookie: context.req.headers.cookie
      }
    },
    ssrContext: context
  });

  if (plan && !plan?.error) {
    return plan;
  }

  return null;
};

const getAuthMe: GetServerSideProps = async context => {
  const {
    req,
    res,
    params,
    query,
    locale,
    defaultLocale = utils.constants.LANGUAGE_EN
  } = context;

  const cookies = req.headers.cookie;

  if (!cookies) {
    return {
      props: {},
      redirect: {
        permanent: false,
        destination: '/'
      }
    };
  }

  const organizationId = typeof params?.id === 'string' ? params.id : null;

  const [me, plan] = await Promise.all([
    getMe(context),
    organizationId ? getPlan(context, organizationId) : Promise.resolve(null)
  ]);

  if (me) {
    return {
      props: {
        params: params || null,
        query: query || null,
        locale: locale || defaultLocale,
        auth: me?.user || null,
        plan: plan || null
      }
    };
  }

  return {
    props: {},
    redirect: {
      permanent: false,
      destination: '/'
    }
  };
};

const getAuthOrganizations = async (context: GetServerSidePropsContext) => {
  const {
    req,
    res,
    params,
    query,
    locale,
    defaultLocale = utils.constants.LANGUAGE_EN
  } = context;

  const cookies = req.headers.cookie;

  if (!cookies) {
    return {
      props: {},
      redirect: {
        permanent: false,
        destination: '/'
      }
    };
  }

  const me = await getMe(context);

  if (me) {
    const organizations = await getOrganizations(context);

    return {
      props: {
        params: params || null,
        query: query || null,
        locale: locale || defaultLocale,
        auth: me?.user || null,
        organizations: organizations || []
      }
    };
  }

  return {
    props: {},
    redirect: {
      permanent: false,
      destination: '/'
    }
  };
};

const redirectIfAuthenticated: GetServerSideProps = async context => {
  const { req } = context;

  const cookies = req.headers.cookie;

  if (!cookies) {
    return { props: {} };
  }

  const me = await getMe(context);

  if (me) {
    return {
      props: {},
      redirect: {
        permanent: false,
        destination: '/organization'
      }
    };
  }

  return { props: {} };
};

export const ssr = {
  getAuthMe,
  getAuthOrganizations,
  redirectIfAuthenticated
};
