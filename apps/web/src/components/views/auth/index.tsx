import { useState } from 'react';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';

import { Wrapper } from './styles';
import { authClient } from '../../../utils';

export const Auth = () => {
  const [status, setStatus] = useState('idle');
  const [accepted, setAccepted] = useState(false);

  const signIn = async (provider: string) => {
    if (!accepted) return;
    setStatus('pending');
    await authClient.signIn.social({
      provider,
      callbackURL: `${process.env.NEXT_PUBLIC_WEB_URL}/organization`
    });
  };

  const disabled = status === 'pending' || !accepted;

  return (
    <Wrapper>
      <div className="login-content">
        <p className="login-content-texts">
          <span className="login-content-subtitle">
            Give Your AI Superpowers{' '}
          </span>
          <span className="login-content-title">No Coding Needed</span>
        </p>
        <div className="login-content-buttons">
          <UI.Button
            variant="outlined"
            startIcon="/GOOGLE.svg"
            onClick={() => signIn(utils.constants.SOCIAL_PROVIDER_GOOGLE)}
            disabled={disabled}
          >
            Sign in with Google
          </UI.Button>
          <UI.Button
            variant="outlined"
            startIcon="/GITHUB.svg"
            onClick={() => signIn(utils.constants.SOCIAL_PROVIDER_GITHUB)}
            disabled={disabled}
          >
            Sign in with GitHub
          </UI.Button>
        </div>
        <label className="terms-consent">
          <input
            type="checkbox"
            checked={accepted}
            onChange={event => setAccepted(event.target.checked)}
          />
          <span>
            I have read and accept the{' '}
            <a
              href="https://ganju.ai/terms"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms &amp; Conditions
            </a>{' '}
            and the{' '}
            <a
              href="https://ganju.ai/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </a>
            .
          </span>
        </label>
      </div>
      <p className="terms">
        ¿Prefieres español? Lee los{' '}
        <a
          href="https://ganju.ai/es/terminos"
          target="_blank"
          rel="noopener noreferrer"
        >
          Términos
        </a>{' '}
        y la{' '}
        <a
          href="https://ganju.ai/es/privacidad"
          target="_blank"
          rel="noopener noreferrer"
        >
          Política de Privacidad
        </a>
      </p>
    </Wrapper>
  );
};
