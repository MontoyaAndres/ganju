import { GetServerSideProps } from 'next';
import { utils } from '@ganju/utils';

import { Components } from '../../components';

// types
import type { IProps } from '../../components/views/toolApproval';

const ToolApprovalPage = (props: IProps) => {
  return <Components.Views.ToolApproval {...props} />;
};

// Read with the visitor's own cookie: the API answers only the user the
// request was made for, and a 404 for anyone else.
export const getServerSideProps: GetServerSideProps = async context => {
  const approvalId = (context.params?.approvalId as string) || '';
  const cookie = context.req.headers.cookie;

  if (!cookie) {
    return { props: { approval: null, signedIn: false } };
  }

  const config = { credentials: 'include' as const, headers: { cookie } };
  const [me, approval] = await Promise.all([
    utils.fetcher({ url: '/me', config, ssrContext: context }),
    utils.fetcher({
      url: `${utils.constants.TOOL_APPROVAL_PATH}/${encodeURIComponent(approvalId)}`,
      config,
      ssrContext: context
    })
  ]);

  return {
    props: {
      approval: approval && !approval.error ? approval : null,
      signedIn: !!me && !me.error
    }
  };
};

export default ToolApprovalPage;
