import { ParsedUrlQuery } from 'querystring';

import { Components } from '../../components';
import { ssr } from '../../utils';

export interface IProps {
  params: ParsedUrlQuery;
  query: ParsedUrlQuery;
  locale: string;
  auth: {
    name: string;
    email: string;
    emailVerified: boolean;
    image: string;
    createdAt: string;
    updatedAt: string;
    id: string;
  };
  organizations: {
    id: string;
    name: string;
    ownerId: string;
    projectCount: number;
    organizationUserCount: number;
    createdAt: string;
    updatedAt: string;
    isMember: boolean;
    plan: string;
    trialing?: boolean;
    noPlan?: boolean;
    projects: {
      id: string;
      name: string;
      isMember: boolean;
    }[];
    members: {
      userId: string;
      role: string;
      user: {
        id: string;
        name: string;
        email: string;
        image: string | null;
      };
    }[];
  }[];
}

const OrganizationPage = (props: IProps) => {
  return <Components.Views.Organization {...props} />;
};

export const getServerSideProps = ssr.getAuthOrganizations;

OrganizationPage.getLayout = Components.Layouts.Auth;

export default OrganizationPage;
