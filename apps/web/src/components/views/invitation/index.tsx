import { useState } from 'react';
import { useRouter } from 'next/router';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';

import { Wrapper } from './styles';
import { i18n } from '../../../lib';

interface TokenInvitation {
  id: string;
  email: string;
  status: string;
  scope: 'ORGANIZATION' | 'PROJECT';
  expired: boolean;
  expiresAt: string;
  organizationName: string | null;
  projectName: string | null;
  inviterName: string | null;
}

export interface IProps {
  invitation: TokenInvitation | null;
  auth: { id: string; name: string; email: string } | null;
}

export const Invitation = (props: IProps) => {
  const { invitation, auth } = props;
  const router = useRouter();
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.INVITATION);
  const c = i18n.useT(i18n.copy.COMMON);
  const other = i18n.LANGS.find(lang => lang !== t.lang);

  const [responding, setResponding] = useState<'accept' | 'decline' | null>(
    null
  );
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null);

  const handleRespond = async (action: 'accept' | 'decline') => {
    if (!invitation || responding) return;
    setResponding(action);
    try {
      const data = await utils.fetcher({
        url: `/invitation/${invitation.id}/respond`,
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ action })
        }
      });
      if (utils.isApiError(data)) {
        snackbar.error(utils.getApiErrorMessage(data, t('toastFailed')));
        return;
      }
      setDone(action === 'accept' ? 'accepted' : 'declined');
      if (action === 'accept') {
        snackbar.success(t('toastAccepted'));
      }
    } catch {
      snackbar.error(t('toastFailed'));
    } finally {
      setResponding(null);
    }
  };

  const card = (children: React.ReactNode) => (
    <Wrapper>
      <div className="invitation-card">
        {children}
        {other && (
          <p className="invitation-language">
            {c('switchPrompt')}{' '}
            <a href={i18n.langHref(router.asPath, other)}>
              {c('switchAction')}
            </a>
          </p>
        )}
      </div>
    </Wrapper>
  );

  if (done === 'accepted') {
    return card(
      <>
        <p className="invitation-eyebrow">{t('eyebrow')}</p>
        <h1 className="invitation-title">{t('acceptedTitle')}</h1>
        <p className="invitation-text">{t('acceptedText')}</p>
        <div className="invitation-actions">
          <UI.Button
            variant="contained"
            size="small"
            onClick={() => router.push('/organization')}
          >
            {t('goToDashboard')}
          </UI.Button>
        </div>
      </>
    );
  }

  if (done === 'declined') {
    return card(
      <>
        <p className="invitation-eyebrow">{t('eyebrow')}</p>
        <h1 className="invitation-title">{t('declinedTitle')}</h1>
        <p className="invitation-text">{t('declinedText')}</p>
        <div className="invitation-actions">
          <UI.Button size="small" onClick={() => router.push('/')}>
            {t('goToGanju')}
          </UI.Button>
        </div>
      </>
    );
  }

  if (!invitation) {
    return card(
      <>
        <p className="invitation-eyebrow">{t('eyebrow')}</p>
        <h1 className="invitation-title">{t('notFoundTitle')}</h1>
        <p className="invitation-text">{t('notFoundText')}</p>
        <div className="invitation-actions">
          <UI.Button size="small" onClick={() => router.push('/')}>
            {t('goToGanju')}
          </UI.Button>
        </div>
      </>
    );
  }

  const isProject = invitation.scope === 'PROJECT';
  const target =
    (isProject ? invitation.projectName : invitation.organizationName) ||
    t('fallbackTarget');
  const scopeLabel = isProject ? t('scopeProject') : t('scopeOrganization');

  if (invitation.status !== utils.constants.STATUS_PENDING) {
    return card(
      <>
        <p className="invitation-eyebrow">{t('eyebrow')}</p>
        <h1 className="invitation-title">{t('unavailableTitle')}</h1>
        <p className="invitation-text">{t('unavailableText', { target })}</p>
        <div className="invitation-actions">
          <UI.Button size="small" onClick={() => router.push('/')}>
            {t('goToGanju')}
          </UI.Button>
        </div>
      </>
    );
  }

  if (invitation.expired) {
    return card(
      <>
        <p className="invitation-eyebrow">{t('eyebrow')}</p>
        <h1 className="invitation-title">{t('expiredTitle')}</h1>
        <p className="invitation-text">{t('expiredText', { target })}</p>
        <div className="invitation-actions">
          <UI.Button size="small" onClick={() => router.push('/')}>
            {t('goToGanju')}
          </UI.Button>
        </div>
      </>
    );
  }

  const emailMatches =
    !!auth && auth.email.toLowerCase() === invitation.email.toLowerCase();

  return card(
    <>
      <p className="invitation-eyebrow">{t('eyebrow')}</p>
      <h1 className="invitation-title">{t('invitedTitle')}</h1>
      <p className="invitation-text">
        {t('invitedTextBefore', {
          inviter: invitation.inviterName || t('fallbackInviter')
        })}
        <span className="invitation-target">{target}</span>
        {t('invitedTextAfter')}
      </p>
      <span className="invitation-scope">{scopeLabel}</span>

      {emailMatches ? (
        <>
          <div className="invitation-actions">
            <UI.Button
              variant="contained"
              size="small"
              disabled={!!responding}
              onClick={() => handleRespond('accept')}
            >
              {responding === 'accept' ? t('accepting') : t('accept')}
            </UI.Button>
            <UI.Button
              size="small"
              disabled={!!responding}
              onClick={() => handleRespond('decline')}
            >
              {responding === 'decline' ? t('declining') : t('decline')}
            </UI.Button>
          </div>
          <p className="invitation-note">
            {t(isProject ? 'acceptNoteProject' : 'acceptNoteOrganization', {
              email: invitation.email
            })}
          </p>
        </>
      ) : auth ? (
        <>
          <p className="invitation-text">
            {t('wrongAccountBefore')}
            <strong>{invitation.email}</strong>
            {t('wrongAccountBetween')}
            <strong>{auth.email}</strong>
            {t('wrongAccountAfter')}
          </p>
          <div className="invitation-actions">
            <UI.Button
              variant="contained"
              size="small"
              onClick={() => router.push('/organization')}
            >
              {t('goToDashboard')}
            </UI.Button>
          </div>
        </>
      ) : (
        <>
          <p className="invitation-text">
            {t('signInBefore')}
            <strong>{invitation.email}</strong>
            {t('signInAfter')}
          </p>
          <div className="invitation-actions">
            <UI.Button
              variant="contained"
              size="small"
              onClick={() => router.push('/')}
            >
              {t('signInAction')}
            </UI.Button>
          </div>
        </>
      )}
    </>
  );
};
