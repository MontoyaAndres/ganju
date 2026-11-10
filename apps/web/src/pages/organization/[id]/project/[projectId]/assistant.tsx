import { Components } from '../../../../../components';
import { ssr } from '../../../../../utils';

const AssistantPage = () => {
  return <Components.Views.Assistant />;
};

AssistantPage.getLayout = Components.Layouts.Home;

export const getServerSideProps = ssr.getAuthMe;

export default AssistantPage;
