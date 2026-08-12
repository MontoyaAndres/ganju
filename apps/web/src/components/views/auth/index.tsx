import { useState } from 'react';
import { useRouter } from 'next/router';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';

import { Wrapper } from './styles';
import { authClient } from '../../../utils';
import { i18n } from '../../../lib';

export const Auth = () => {
  const [status, setStatus] = useState('idle');
  const [accepted, setAccepted] = useState(true);
  const router = useRouter();
  const t = i18n.useT(i18n.copy.AUTH);
  const c = i18n.useT(i18n.copy.COMMON);

  const signIn = async (provider: string) => {
    if (!accepted) return;
    setStatus('pending');
    await authClient.signIn.social({
      provider,
      callbackURL: `${process.env.NEXT_PUBLIC_WEB_URL}/organization`
    });
  };

  const disabled = status === 'pending' || !accepted;
  const other = i18n.LANGS.find(lang => lang !== t.lang);

  return (
    <Wrapper>
      <div className="login-content">
        <p className="login-content-texts">
          <span className="login-content-subtitle">{t('headline')} </span>
          <span className="login-content-title">{t('subheadline')}</span>
        </p>
        <div className="login-content-buttons">
          <UI.Button
            variant="outlined"
            startIcon="/GOOGLE.svg"
            onClick={() => signIn(utils.constants.SOCIAL_PROVIDER_GOOGLE)}
            disabled={disabled}
          >
            {t('signInGoogle')}
          </UI.Button>
          <UI.Button
            variant="outlined"
            startIcon="/GITHUB.svg"
            onClick={() => signIn(utils.constants.SOCIAL_PROVIDER_GITHUB)}
            disabled={disabled}
          >
            {t('signInGithub')}
          </UI.Button>
        </div>
        <label className="terms-consent">
          <input
            type="checkbox"
            checked={accepted}
            onChange={event => setAccepted(event.target.checked)}
          />
          <span>
            {t('consentBefore')}
            <a href={t('termsUrl')} target="_blank" rel="noopener noreferrer">
              {t('consentTerms')}
            </a>
            {t('consentBetween')}
            <a href={t('privacyUrl')} target="_blank" rel="noopener noreferrer">
              {t('consentPrivacy')}
            </a>
            {t('consentAfter')}
          </span>
        </label>
      </div>
      {other && (
        <p className="terms">
          {c('switchPrompt')}{' '}
          <a href={i18n.langHref(router.asPath, other)}>{c('switchAction')}</a>
        </p>
      )}
    </Wrapper>
  );
};
