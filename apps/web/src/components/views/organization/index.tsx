import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';

import IconButton from '@mui/material/IconButton';
import { AddOutlined, Close } from '@mui/icons-material';

import {
  CreateOrganizationWrapper,
  ModalDialog,
  ModalOverlay,
  Wrapper
} from './styles';
import { i18n } from '../../../lib';

// types
import { IProps } from '../../../pages/organization';

const INITIAL_FORM_STATE = {
  name: '',
  projectName: '',
  projectDescription: ''
};

type Organization = IProps['organizations'][number];
type Member = Organization['members'][number];

interface MyInvitation {
  id: string;
  email: string;
  status: string;
  organizationId: string;
  projectId: string | null;
  organization: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  invitedBy: { id: string; name: string; email: string } | null;
}

const initial = (value: string) => (value.trim()[0] || '?').toUpperCase();

// Human label for the subscription tier the organization is on.
const planLabel = (plan: string) => {
  switch (plan) {
    case utils.constants.PLAN_PRO:
      return 'Pro';
    case utils.constants.PLAN_ENTERPRISE:
      return 'Enterprise';
    default:
      return 'Free';
  }
};

const isPaidPlan = (plan: string) => plan !== utils.constants.PLAN_FREE;

const isHttpUrl = (value: string | null): value is string =>
  !!value && /^https?:\/\//i.test(value);

export const Organization = (props: IProps) => {
  const { organizations, auth } = props;
  const router = useRouter();
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.ORGANIZATION);
  const c = i18n.useT(i18n.copy.COMMON);

  // Create-organization form / modal.
  const [values, setValues] = useState(INITIAL_FORM_STATE);
  const [status, setStatus] = useState<
    'idle' | 'pending' | 'rejected' | 'resolved'
  >('idle');
  const [error, setError] = useState(INITIAL_FORM_STATE);
  const [apiError, setApiError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  // Invitations addressed to the signed-in user.
  const [invitations, setInvitations] = useState<MyInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // Invite-a-teammate modal, scoped to a specific organization.
  const [inviteOrg, setInviteOrg] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteEmailError, setInviteEmailError] = useState('');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const data = await utils.fetcher({
          url: '/invitation',
          config: { credentials: 'include', signal: controller.signal }
        });
        if (controller.signal.aborted) return;
        if (Array.isArray(data)) setInvitations(data);
      } catch {
        // aborted or network failure
      } finally {
        if (!controller.signal.aborted) setInvitationsLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setValues(prev => ({ ...prev, [name]: value }));
    if (error[name as keyof typeof error]) {
      setError(prev => ({ ...prev, [name]: '' }));
    }
  };

  const resetForm = () => {
    setValues(INITIAL_FORM_STATE);
    setError(INITIAL_FORM_STATE);
    setApiError('');
    setStatus('idle');
  };

  const handleModalOpen = () => {
    resetForm();
    setModalOpen(true);
  };

  const handleModalClose = () => {
    if (status === 'pending') return;
    setModalOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      setStatus('pending');
      setApiError('');
      const currentValues =
        await utils.Schema.ORGANIZATION_CREATE_VIEW.parseAsync({
          name: values.name,
          projectName: values.projectName,
          projectDescription: values.projectDescription
        });

      const newOrganization = await utils.fetcher({
        url: '/organization',
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify(currentValues)
        }
      });

      if (utils.isApiError(newOrganization)) {
        setStatus('rejected');
        setApiError(
          utils.getApiErrorMessage(newOrganization, c('somethingWentWrong'))
        );
        return;
      }

      router.push(
        `/organization/${newOrganization.organization.id}/project/${newOrganization.project.id}`
      );
    } catch (err) {
      setStatus('rejected');
      if (
        err &&
        typeof err === 'object' &&
        'issues' in err &&
        Array.isArray((err as { issues: unknown[] }).issues)
      ) {
        const formattedErrors = (
          err as { issues: { path: string[]; message: string }[] }
        ).issues.reduce(
          (acc, curr) => ({ ...acc, [curr.path[0]]: curr.message }),
          {} as typeof INITIAL_FORM_STATE
        );
        setError(formattedErrors);
      }
    }
  };

  const handleRespond = async (
    invitation: MyInvitation,
    action: 'accept' | 'decline'
  ) => {
    if (respondingId) return;
    setRespondingId(invitation.id);
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
        snackbar.error(utils.getApiErrorMessage(data, t('toastRespondFailed')));
        return;
      }
      setInvitations(prev => prev.filter(item => item.id !== invitation.id));
      if (action === 'accept') {
        snackbar.success(t('toastInvitationAccepted'));
        // Re-run getServerSideProps so the new membership shows up.
        router.replace(router.asPath);
      } else {
        snackbar.success(t('toastInvitationDeclined'));
      }
    } catch {
      snackbar.error(t('toastRespondFailed'));
    } finally {
      setRespondingId(null);
    }
  };

  const closeInviteModal = () => {
    if (inviting) return;
    setInviteOrg(null);
    setInviteEmail('');
    setInviteEmailError('');
  };

  const handleInviteSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inviteOrg || inviting) return;

    let email: string;
    try {
      const parsed =
        await utils.Schema.ORGANIZATION_INVITATION_CREATE_VIEW.parseAsync({
          email: inviteEmail
        });
      email = parsed.email;
    } catch (err) {
      const issues = (err as { issues?: { message: string }[] })?.issues;
      setInviteEmailError(issues?.[0]?.message || t('inviteInvalidEmail'));
      return;
    }

    setInviteEmailError('');
    setInviting(true);
    try {
      const data = await utils.fetcher({
        url: `/organization/${inviteOrg.id}/invitation`,
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
      setInviting(false);
      setInviteOrg(null);
      setInviteEmail('');
    } catch {
      snackbar.error(t('toastInviteFailed'));
      setInviting(false);
    }
  };

  const openOrganization = (organization: Organization) => {
    const projectId = organization.projects?.[0]?.id;
    if (projectId) {
      router.push(`/organization/${organization.id}/project/${projectId}`);
    } else if (organization.isMember) {
      router.push(`/organization/${organization.id}/settings`);
    }
  };

  const renderAvatar = (member: Member) => (
    <div key={member.userId} className="member-avatar" title={member.user.name}>
      {isHttpUrl(member.user.image) ? (
        <img src={member.user.image} alt="" />
      ) : (
        <span>{initial(member.user.name)}</span>
      )}
    </div>
  );

  const renderInvitations = () => {
    if (invitationsLoading || invitations.length === 0) return null;
    return (
      <div className="invitations-panel">
        <div className="invitations-head">
          <h2 className="invitations-title">{t('invitationsTitle')}</h2>
          <p className="invitations-subtitle">{t('invitationsSubtitle')}</p>
        </div>
        <div className="invitations-list">
          {invitations.map(invitation => {
            const isProject = !!invitation.projectId;
            const targetName =
              (isProject
                ? invitation.project?.name
                : invitation.organization?.name) || t('fallbackTarget');
            return (
              <div key={invitation.id} className="invitation-card">
                <div className="invitation-info">
                  <p className="invitation-target">
                    {targetName}
                    <span className="invitation-scope">
                      {isProject
                        ? t('invitationProject')
                        : t('invitationOrganization')}
                    </span>
                  </p>
                  <p className="invitation-meta">
                    {t('invitedBy', {
                      name: invitation.invitedBy?.name || t('fallbackInviter')
                    })}
                  </p>
                </div>
                <div className="invitation-actions">
                  <UI.Button
                    variant="contained"
                    size="small"
                    disabled={respondingId === invitation.id}
                    onClick={() => handleRespond(invitation, 'accept')}
                  >
                    {respondingId === invitation.id
                      ? t('working')
                      : t('accept')}
                  </UI.Button>
                  <UI.Button
                    size="small"
                    disabled={respondingId === invitation.id}
                    onClick={() => handleRespond(invitation, 'decline')}
                  >
                    {t('decline')}
                  </UI.Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderOrganizationCard = (organization: Organization) => {
    const isOwner = organization.ownerId === auth.id;
    return (
      <div
        key={organization.id}
        className={`organization-card${
          organization.isMember ? '' : ' organization-card-basic'
        }`}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openOrganization(organization);
          }
        }}
        onClick={() => openOrganization(organization)}
      >
        <div className="organization-card-head">
          <h2 className="organization-card-name">{organization.name}</h2>
          <div className="organization-badges">
            {organization.isMember ? (
              <>
                {isOwner && (
                  <span className="organization-badge">{t('badgeOwner')}</span>
                )}
                <span
                  className={`organization-badge organization-badge-plan${
                    isPaidPlan(organization.plan)
                      ? ' organization-badge-plan-paid'
                      : ''
                  }`}
                >
                  {planLabel(organization.plan)}
                </span>
              </>
            ) : (
              <span className="organization-badge organization-badge-basic">
                {t('badgeProjectAccess')}
              </span>
            )}
          </div>
        </div>

        {organization.isMember ? (
          <>
            <ul className="organization-info">
              <li className="organization-info-item">
                {t('infoProjects', { count: t.n(organization.projectCount) })}
              </li>
              <li className="organization-info-item">
                {t('infoMembers', {
                  count: t.n(organization.organizationUserCount)
                })}
              </li>
              <li className="organization-info-item">
                {t('infoCreated', { date: t.date(organization.createdAt) })}
              </li>
            </ul>

            {organization.members.length > 0 && (
              <div className="organization-members">
                {organization.members.slice(0, 5).map(renderAvatar)}
                {organization.members.length > 5 && (
                  <div className="member-avatar member-avatar-more">
                    <span>+{organization.members.length - 5}</span>
                  </div>
                )}
              </div>
            )}

            <div className="organization-card-actions">
              <UI.Button
                size="small"
                variant="contained"
                onClick={e => {
                  e.stopPropagation();
                  setInviteEmail('');
                  setInviteEmailError('');
                  setInviteOrg({
                    id: organization.id,
                    name: organization.name
                  });
                }}
              >
                {t('invite')}
              </UI.Button>
              <UI.Button
                size="small"
                onClick={e => {
                  e.stopPropagation();
                  router.push(`/organization/${organization.id}/settings`);
                }}
              >
                {t('settings')}
              </UI.Button>
            </div>
          </>
        ) : (
          <>
            <p className="organization-basic-note">
              {t.plural('basicNote', organization.projects.length)}
            </p>
            <ul className="organization-info">
              {organization.projects.map(project => (
                <li key={project.id} className="organization-info-item">
                  {project.name}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  };

  const renderCreateForm = () => (
    <form className="create-organization-form" onSubmit={handleSubmit}>
      <div className="form-section">
        <div className="form-section-header">
          <h2 className="form-section-title">{t('sectionOrganization')}</h2>
          <p className="form-section-description">
            {t('sectionOrganizationHelp')}
          </p>
        </div>
        <UI.Input
          label={t('name')}
          placeholder={t('namePlaceholder')}
          name="name"
          value={values.name}
          onChange={handleValueChange}
          required
          error={!!error.name}
          helperText={error.name}
        />
      </div>
      <div className="form-section">
        <div className="form-section-header">
          <h2 className="form-section-title">{t('sectionProject')}</h2>
          <p className="form-section-description">{t('sectionProjectHelp')}</p>
        </div>
        <UI.Input
          label={t('name')}
          placeholder={t('projectNamePlaceholder')}
          name="projectName"
          value={values.projectName}
          onChange={handleValueChange}
          required
          error={!!error.projectName}
          helperText={error.projectName}
        />
        <UI.Input
          label={t('description')}
          placeholder={t('projectDescriptionPlaceholder')}
          name="projectDescription"
          value={values.projectDescription}
          onChange={handleValueChange}
          multiline
          rows={2}
          error={!!error.projectDescription}
          helperText={error.projectDescription}
        />
      </div>
      {apiError && <p className="create-organization-error">{apiError}</p>}
      <div className="create-organization-button">
        <UI.Button
          type="submit"
          variant="contained"
          size="small"
          disabled={status === 'pending'}
        >
          {status === 'pending' ? c('creating') : t('submit')}
        </UI.Button>
      </div>
    </form>
  );

  // First-run onboarding: no organizations and nothing to accept.
  if (organizations.length === 0 && invitations.length === 0) {
    return (
      <CreateOrganizationWrapper>
        <div className="create-organization-header">
          <h1 className="create-organization-title">{t('onboardingTitle')}</h1>
          <p className="create-organization-subtitle">
            {t('onboardingSubtitle')}
          </p>
        </div>
        {renderCreateForm()}
      </CreateOrganizationWrapper>
    );
  }

  return (
    <Wrapper>
      {renderInvitations()}

      <div className="organization-header">
        <div className="organization-heading">
          <h1 className="organization-title">{t('title')}</h1>
          <p className="create-organization-subtitle">{t('subtitle')}</p>
        </div>
        <div className="organization-new-button">
          <UI.Button variant="contained" size="small" onClick={handleModalOpen}>
            <AddOutlined />
            {t('newOrganization')}
          </UI.Button>
        </div>
      </div>

      {organizations.length === 0 ? (
        <div className="organization-empty">
          <p className="organization-empty-text">{t('emptyText')}</p>
          <UI.Button variant="contained" size="small" onClick={handleModalOpen}>
            {t('emptyAction')}
          </UI.Button>
        </div>
      ) : (
        <div className="organization-list">
          {organizations.map(renderOrganizationCard)}
        </div>
      )}

      {modalOpen && (
        <UI.Portal>
          <ModalOverlay onClick={handleModalClose}>
            <ModalDialog role="dialog" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">{t('modalTitle')}</h2>
                <IconButton size="small" onClick={handleModalClose}>
                  <Close />
                </IconButton>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="form-section">
                    <div className="form-section-header">
                      <h3 className="form-section-title">
                        {t('sectionOrganization')}
                      </h3>
                      <p className="form-section-description">
                        {t('sectionOrganizationHelpShort')}
                      </p>
                    </div>
                    <UI.Input
                      label={t('name')}
                      placeholder={t('namePlaceholder')}
                      name="name"
                      value={values.name}
                      onChange={handleValueChange}
                      required
                      error={!!error.name}
                      helperText={error.name}
                    />
                  </div>
                  <div className="form-section">
                    <div className="form-section-header">
                      <h3 className="form-section-title">
                        {t('sectionProject')}
                      </h3>
                      <p className="form-section-description">
                        {t('sectionProjectHelpShort')}
                      </p>
                    </div>
                    <UI.Input
                      label={t('projectName')}
                      placeholder={t('projectNamePlaceholder')}
                      name="projectName"
                      value={values.projectName}
                      onChange={handleValueChange}
                      required
                      error={!!error.projectName}
                      helperText={error.projectName}
                    />
                    <UI.Input
                      label={t('projectDescription')}
                      placeholder={t('projectDescriptionPlaceholder')}
                      name="projectDescription"
                      value={values.projectDescription}
                      onChange={handleValueChange}
                      multiline
                      rows={2}
                      error={!!error.projectDescription}
                      helperText={error.projectDescription}
                    />
                  </div>
                  {apiError && <p className="modal-error">{apiError}</p>}
                </div>
                <div className="modal-actions">
                  <UI.Button
                    size="small"
                    disabled={status === 'pending'}
                    onClick={handleModalClose}
                  >
                    {c('cancel')}
                  </UI.Button>
                  <UI.Button
                    type="submit"
                    variant="contained"
                    size="small"
                    disabled={status === 'pending'}
                  >
                    {status === 'pending' ? c('creating') : c('create')}
                  </UI.Button>
                </div>
              </form>
            </ModalDialog>
          </ModalOverlay>
        </UI.Portal>
      )}

      {inviteOrg && (
        <UI.Portal>
          <ModalOverlay onClick={closeInviteModal}>
            <ModalDialog role="dialog" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">
                  {t('inviteTitle', { name: inviteOrg.name })}
                </h2>
                <IconButton size="small" onClick={closeInviteModal}>
                  <Close />
                </IconButton>
              </div>
              <form onSubmit={handleInviteSubmit}>
                <div className="modal-body">
                  <UI.Input
                    label={t('inviteEmail')}
                    placeholder={t('inviteEmailPlaceholder')}
                    name="inviteEmail"
                    type="email"
                    value={inviteEmail}
                    disabled={inviting}
                    error={!!inviteEmailError}
                    helperText={inviteEmailError}
                    onChange={e => {
                      setInviteEmail(e.target.value);
                      if (inviteEmailError) setInviteEmailError('');
                    }}
                  />
                  <p className="modal-hint">{t('inviteHint')}</p>
                </div>
                <div className="modal-actions">
                  <UI.Button
                    size="small"
                    disabled={inviting}
                    onClick={closeInviteModal}
                  >
                    {c('cancel')}
                  </UI.Button>
                  <UI.Button
                    type="submit"
                    variant="contained"
                    size="small"
                    disabled={inviting || !inviteEmail.trim()}
                  >
                    {inviting ? t('inviteSending') : t('inviteSubmit')}
                  </UI.Button>
                </div>
              </form>
            </ModalDialog>
          </ModalOverlay>
        </UI.Portal>
      )}
    </Wrapper>
  );
};
