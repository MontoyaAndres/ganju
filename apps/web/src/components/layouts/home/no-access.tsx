import { useRouter } from 'next/router';
import { UI } from '@ganju/ui';
import { LockOutlined } from '@mui/icons-material';

import { NoAccessWrapper } from './styles';
import { i18n } from '../../../lib';

interface IProps {
  organizationId: string | null;
}

export const NoAccess = (props: IProps) => {
  const { organizationId } = props;
  const router = useRouter();
  const t = i18n.useT(i18n.copy.LAYOUT);

  return (
    <NoAccessWrapper>
      <div className="no-access-card">
        <div className="no-access-icon">
          <LockOutlined />
        </div>
        <h1 className="no-access-title">{t('noAccessTitle')}</h1>
        <p className="no-access-text">{t('noAccessText')}</p>
        <div className="no-access-actions">
          <UI.Button
            variant="contained"
            size="small"
            onClick={() =>
              router.push(
                organizationId
                  ? `/organization/${organizationId}/settings`
                  : '/organization'
              )
            }
          >
            {t('noAccessAction')}
          </UI.Button>
        </div>
      </div>
    </NoAccessWrapper>
  );
};
