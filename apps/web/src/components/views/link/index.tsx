import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';
import { CheckCircleOutlined } from '@mui/icons-material';

import { Wrapper } from './styles';
import { i18n } from '../../../lib';

type Status = 'idle' | 'pending' | 'resolved' | 'rejected';

interface LinkedIdentity {
  id: string;
  provider: string;
  externalId: string;
  displayName: string | null;
}

type LinkKey = keyof typeof i18n.copy.LINK.en;

const errorKey = (code: unknown): LinkKey => {
  const key = `error_${String(code)}`;
  return key in i18n.copy.LINK.en ? (key as LinkKey) : 'errorGeneric';
};

const formatProvider = (provider: string) =>
  provider.charAt(0).toUpperCase() + provider.slice(1);

export const Link = () => {
  const router = useRouter();
  const t = i18n.useT(i18n.copy.LINK);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<LinkedIdentity | null>(null);

  useEffect(() => {
    const queryCode = router.query.code;
    if (typeof queryCode === 'string' && queryCode.trim()) {
      setCode(queryCode.trim());
    }
  }, [router.query.code]);

  const handleSubmit = async () => {
    if (status === 'pending') return;
    const trimmed = code.trim();
    if (!trimmed) {
      setError(t('errorEmpty'));
      return;
    }

    setStatus('pending');
    setError(null);
    try {
      const data = await utils.fetcher({
        url: '/auth/external/confirm',
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ code: trimmed })
        }
      });

      if (data && data.id) {
        setLinked(data);
        setStatus('resolved');
      } else {
        setStatus('rejected');
        setError(t(errorKey(data?.error)));
      }
    } catch {
      setStatus('rejected');
      setError(t('errorGeneric'));
    }
  };

  return (
    <Wrapper>
      {status === 'resolved' && linked ? (
        <div className="link-card">
          <div className="link-success">
            <CheckCircleOutlined className="link-success-icon" />
            <p className="link-success-title">{t('successTitle')}</p>
            <p className="link-success-text">
              {t('successText', {
                provider: formatProvider(linked.provider),
                name: linked.displayName
                  ? t('successName', { name: linked.displayName })
                  : ''
              })}
            </p>
          </div>
        </div>
      ) : (
        <div className="link-card">
          <div className="link-header">
            <h1 className="link-title">{t('title')}</h1>
            <p className="link-subtitle">{t('subtitle')}</p>
          </div>

          <div className="link-form">
            <UI.Input
              label={t('codeLabel')}
              name="linkCode"
              placeholder={t('codePlaceholder')}
              value={code}
              disabled={status === 'pending'}
              error={!!error}
              helperText={error || undefined}
              onChange={e => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
            />
            <UI.Button
              variant="contained"
              disabled={status === 'pending'}
              onClick={handleSubmit}
            >
              {status === 'pending' ? t('submitting') : t('submit')}
            </UI.Button>
          </div>
        </div>
      )}
    </Wrapper>
  );
};
