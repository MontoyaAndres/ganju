import { Components } from '../../../../../components';
import { ssr } from '../../../../../utils';

import type { IProps } from '../[projectId]';

const DataPage = (props: IProps) => {
  return <Components.Views.Data plan={props.plan} />;
};

DataPage.getLayout = Components.Layouts.Home;

export const getServerSideProps = ssr.getAuthMe;

export default DataPage;
