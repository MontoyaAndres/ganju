import { useCallback, useEffect, useState } from 'react';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';
import IconButton from '@mui/material/IconButton';
import { Close } from '@mui/icons-material';

import { MembersManagerWrapper } from './styles';
import { i18n } from '../../../lib';

type Scope = 'organization' | 'project';

interface Member {
  userId: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
}

interface Invitation {
  id: string;
  email: string;
  status: string;
  createdAt: string;
  invitedBy: { id: string; name: string; email: string } | null;
}

interface IProps {
  scope: Scope;
  basePath: string;
  currentUserId: string;
  ownerId?: string;
}

type ConfirmState =
  | { type: 'remove-member'; member: Member }
  | { type: 'revoke-invitation'; invitation: Invitation }
  | null;

const initial = (value: string) => (value.trim()[0] || '?').toUpperCase();

const isHttpUrl = (value: string | null): value is string =>
  !!value && /^https?:\/\//i.test(value);

export const MembersManager = (props: IProps) => {
  const { scope, basePath, currentUserId, ownerId } = props;
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.SETTINGS);
  const c = i18n.useT(i18n.copy.COMMON);
  const isProject = scope === 'project';

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviting, setInviting] = useState(false);

  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [actioning, setActioning] = useState(false);

  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const [memberData, invitationData] = await Promise.all([
          utils.fetcher({
            url: `${basePath}/member`,
            config: { credentials: 'include', signal }
          }),
          utils.fetcher({
            url: `${basePath}/invitation`,
            config: { credentials: 'include', signal }
          })
        ]);
        if (signal?.aborted) return;

        // A member-fetch error means the caller is not a member of this scope
        // (the API forbids it) — only basic information is available.
        if (utils.isApiError(memberData)) {
          setAccessDenied(true);
          setMembers([]);
          setInvitations([]);
          return;
        }

        setAccessDenied(false);
        setMembers(Array.isArray(memberData) ? memberData : []);
        setInvitations(
          Array.isArray(invitationData)
            ? invitationData.filter(
                (item: Invitation) =>
                  item.status === utils.constants.STATUS_PENDING
              )
            : []
        );
      } catch {
        // aborted or network failure — leave current state
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [basePath]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inviting) return;

    const schema =
      scope === 'organization'
        ? utils.Schema.ORGANIZATION_INVITATION_CREATE_VIEW
        : utils.Schema.PROJECT_INVITATION_CREATE_VIEW;

    let email: string;
    try {
      const parsed = await schema.parseAsync({ email: inviteEmail });
      email = parsed.email;
    } catch (err) {
      // Parsed in the browser, so this issue never passes through
      // `handleError` where the API localizes the ones it raises.
      const issues = (err as { issues?: { message: string }[] })?.issues;
      const issue = issues?.[0];
      setInviteError(
        issue ? utils.localizeZodIssue(issue, t.lang) : t('inviteInvalidEmail')
      );
      return;
    }

    setInviteError('');
    setInviting(true);
    try {
      const data = await utils.fetcher({
        url: `${basePath}/invitation`,
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ email })
        }
      });
      if (utils.isApiError(data)) {
        snackbar.error(utils.getApiErrorMessage(data, t('toastInviteFailed')));
        return;
      }
      snackbar.success(t('toastInviteSent', { email }));
      setInviteEmail('');
      await fetchData();
    } catch {
      snackbar.error(t('toastInviteFailed'));
    } finally {
      setInviting(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirm || actioning) return;
    setActioning(true);
    try {
      if (confirm.type === 'remove-member') {
        const data = await utils.fetcher({
          url: `${basePath}/member/${confirm.member.userId}`,
          config: { method: 'DELETE', credentials: 'include' }
        });
        if (utils.isApiError(data)) {
          snackbar.error(
            utils.getApiErrorMessage(data, t('toastMemberRemoveFailed'))
          );
          return;
        }
        setMembers(prev =>
          prev.filter(member => member.userId !== confirm.member.userId)
        );
        snackbar.success(t('toastMemberRemoved'));
      } else {
        const data = await utils.fetcher({
          url: `${basePath}/invitation/${confirm.invitation.id}`,
          config: { method: 'DELETE', credentials: 'include' }
        });
        if (utils.isApiError(data)) {
          snackbar.error(
            utils.getApiErrorMessage(data, t('toastRevokeFailed'))
          );
          return;
        }
        setInvitations(prev =>
          prev.filter(item => item.id !== confirm.invitation.id)
        );
        snackbar.success(t('toastInvitationRevoked'));
      }
      setConfirm(null);
    } catch {
      snackbar.error(c('somethingWentWrong'));
    } finally {
      setActioning(false);
    }
  };

  // A member cannot be removed if it is the caller, the organization owner, or
  // the last remaining member of the scope.
  const canRemove = (member: Member) =>
    member.userId !== currentUserId &&
    member.userId !== ownerId &&
    members.length > 1;

  if (accessDenied) {
    return (
      <MembersManagerWrapper>
        <p className="mm-denied">
          {t(isProject ? 'membersDeniedProject' : 'membersDeniedOrganization')}
        </p>
      </MembersManagerWrapper>
    );
  }

  return (
    <MembersManagerWrapper>
      <div className="mm-block">
        <div className="mm-block-head">
          <h3 className="mm-block-title">{t('membersHeading')}</h3>
          {!loading && <span className="mm-count">{members.length}</span>}
        </div>

        {loading ? (
          <div className="mm-list">
            {[0, 1].map(index => (
              <UI.Skeleton
                key={index}
                variant="rounded"
                width="100%"
                height={56}
              />
            ))}
          </div>
        ) : (
          <div className="mm-list">
            {members.map(member => (
              <div key={member.userId} className="mm-row">
                <div className="mm-avatar">
                  {isHttpUrl(member.user.image) ? (
                    <img src={member.user.image} alt="" />
                  ) : (
                    <span>{initial(member.user.name)}</span>
                  )}
                </div>
                <div className="mm-row-info">
                  <p className="mm-row-name">
                    {member.user.name}
                    {member.userId === currentUserId && (
                      <span className="mm-tag">{t('memberYou')}</span>
                    )}
                    {member.userId === ownerId && (
                      <span className="mm-tag mm-tag-owner">
                        {t('memberOwner')}
                      </span>
                    )}
                  </p>
                  <p className="mm-row-sub">{member.user.email}</p>
                </div>
                <span className="mm-role">{member.role}</span>
                {canRemove(member) && (
                  <IconButton
                    aria-label={t('removeMember')}
                    size="small"
                    onClick={() =>
                      setConfirm({ type: 'remove-member', member })
                    }
                  >
                    <Close fontSize="small" />
                  </IconButton>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <form className="mm-invite" onSubmit={handleInvite}>
        <div className="mm-invite-field">
          <UI.Input
            label={t('inviteLabel')}
            name="inviteEmail"
            type="email"
            placeholder={t('invitePlaceholder')}
            value={inviteEmail}
            disabled={inviting}
            error={!!inviteError}
            helperText={inviteError}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setInviteEmail(e.target.value);
              if (inviteError) setInviteError('');
            }}
          />
        </div>
        <UI.Button
          type="submit"
          variant="contained"
          size="small"
          disabled={inviting || !inviteEmail.trim()}
        >
          {inviting ? t('inviteSending') : t('inviteAction')}
        </UI.Button>
      </form>

      {invitations.length > 0 && (
        <div className="mm-block">
          <div className="mm-block-head">
            <h3 className="mm-block-title">{t('pendingInvitations')}</h3>
            <span className="mm-count">{invitations.length}</span>
          </div>
          <div className="mm-list">
            {invitations.map(invitation => (
              <div key={invitation.id} className="mm-row">
                <div className="mm-avatar mm-avatar-pending">
                  <span>{initial(invitation.email)}</span>
                </div>
                <div className="mm-row-info">
                  <p className="mm-row-name">{invitation.email}</p>
                  <p className="mm-row-sub">
                    {t('invitedByOn', {
                      name: invitation.invitedBy?.name || t('fallbackInviter'),
                      date: t.date(invitation.createdAt)
                    })}
                  </p>
                </div>
                <span className="mm-role mm-role-pending">
                  {t('pendingBadge')}
                </span>
                <IconButton
                  aria-label={t('revokeInvitation')}
                  size="small"
                  onClick={() =>
                    setConfirm({ type: 'revoke-invitation', invitation })
                  }
                >
                  <Close fontSize="small" />
                </IconButton>
              </div>
            ))}
          </div>
        </div>
      )}

      <UI.Alert
        open={!!confirm}
        title={t(
          confirm?.type === 'remove-member'
            ? 'confirmRemoveMemberTitle'
            : 'confirmRevokeTitle'
        )}
        description={
          confirm?.type === 'remove-member'
            ? t(
                isProject
                  ? 'confirmRemoveMemberProject'
                  : 'confirmRemoveMemberOrganization',
                { name: confirm.member.user.name }
              )
            : confirm?.type === 'revoke-invitation'
              ? t('confirmRevokeText', { email: confirm.invitation.email })
              : ''
        }
        confirmText={t(
          confirm?.type === 'remove-member' ? 'confirmRemove' : 'confirmRevoke'
        )}
        cancelText={c('cancel')}
        loadingText={c('deleting')}
        loading={actioning}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />
    </MembersManagerWrapper>
  );
};
