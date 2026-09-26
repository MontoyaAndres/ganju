import { Components } from '../../../../../components';
import { ssr } from '../../../../../utils';

import type { IProps } from '../[projectId]';

const ResourcesPage = (props: IProps) => {
  return <Components.Views.Resources plan={props.plan} />;
};

ResourcesPage.getLayout = Components.Layouts.Home;

export const getServerSideProps = ssr.getAuthMe;

export default ResourcesPage;
