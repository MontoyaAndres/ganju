import { Components } from '../../../../../components';
import { ssr } from '../../../../../utils';

import type { IProps } from '../[projectId]';

const ToolsPage = (props: IProps) => {
  return <Components.Views.Tools plan={props.plan} />;
};

ToolsPage.getLayout = Components.Layouts.Home;

export const getServerSideProps = ssr.getAuthMe;

export default ToolsPage;
