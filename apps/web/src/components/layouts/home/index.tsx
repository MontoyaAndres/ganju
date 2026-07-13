import {
  JSXElementConstructor,
  ReactElement,
  useEffect,
  useRef,
  useState
} from 'react';
import { useRouter } from 'next/router';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import {
  AccountCircleOutlined,
  MenuBookOutlined,
  SettingsOutlined,
  LogoutOutlined,
  Menu,
  Close,
  HomeFilled,
  ChatOutlined,
  HomeOutlined,
  EmojiObjects,
  EmojiObjectsOutlined,
  Chat,
  Settings,
  CameraAltOutlined,
  Google,
  GitHub,
  Link as LinkIcon,
  LinkOff,
  AppsOutlined,
  AddOutlined,
  BusinessOutlined,
  ExpandMoreOutlined,
  Forum,
  ForumOutlined
} from '@mui/icons-material';

import {
  MobileMenuWrapper,
  ModalDialog,
  ModalOverlay,
  OrgSwitcherWrapper,
  Wrapper
} from './styles';
import { NoAccess } from './no-access';
import { authClient } from '../../../utils';

type SocialProvider = 'google' | 'github';

const SOCIAL_PROVIDERS: {
  id: SocialProvider;
  label: string;
  Icon: typeof Google;
}[] = [
  { id: utils.constants.SOCIAL_PROVIDER_GOOGLE, label: 'Google', Icon: Google },
  { id: utils.constants.SOCIAL_PROVIDER_GITHUB, label: 'GitHub', Icon: GitHub }
];

interface AuthProps {
  name?: string;
  email?: string;
  image?: string;
}

interface SwitcherProject {
  id: string;
  name: string;
}

interface SwitcherOrganization {
  id: string;
  name: string;
  projectCount?: string | number;
  organizationUserCount?: string | number;
  projects?: SwitcherProject[];
}

type HomePage = ReactElement<unknown, string | JSXElementConstructor<any>>;

const HomeLayout = ({ page }: { page: HomePage }) => {
  const auth = (page.props as { auth?: AuthProps }).auth;
  const snackbar = UI.Alert.useSnackbar();
  const [accountClicked, setAccountClicked] = useState(false);
  const [mobileMenuClicked, setMobileMenuClicked] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [linkedProviders, setLinkedProviders] = useState<Set<SocialProvider>>(
    new Set()
  );
  const [linkBusy, setLinkBusy] = useState<SocialProvider | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [organizations, setOrganizations] = useState<
    SwitcherOrganization[] | null
  >(null);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [expandedOrgIds, setExpandedOrgIds] = useState<Set<string>>(new Set());
  const [projectModalOrgId, setProjectModalOrgId] = useState<string | null>(
    null
  );
  const [projectValues, setProjectValues] = useState({
    name: '',
    description: ''
  });
  const [projectError, setProjectError] = useState({
    name: '',
    description: ''
  });
  const [projectApiError, setProjectApiError] = useState('');
  const [projectStatus, setProjectStatus] = useState<
    'idle' | 'pending' | 'rejected' | 'resolved'
  >('idle');
  const [projectAccessDenied, setProjectAccessDenied] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { pathname, query } = router;

  const currentOrgId = typeof query.id === 'string' ? query.id : null;
  const currentProjectId =
    typeof query.projectId === 'string' ? query.projectId : null;

  const lastProjectIdRef = useRef<string | null>(null);
  if (currentProjectId) lastProjectIdRef.current = currentProjectId;

  const fallbackProjectId =
    currentProjectId ||
    lastProjectIdRef.current ||
    organizations?.find(o => o.id === currentOrgId)?.projects?.[0]?.id ||
    null;

  const projectBase = fallbackProjectId
    ? `/organization/${currentOrgId}/project/${fallbackProjectId}`
    : null;

  const goToProjectSection = (section: string) => {
    if (!projectBase) return;
    setMobileMenuClicked(false);
    router.push(`${projectBase}/${section}`);
  };

  const goToProjectHome = () => {
    if (!projectBase) return;
    setMobileMenuClicked(false);
    router.push(projectBase);
  };

  useEffect(() => {
    if (currentOrgId && !currentProjectId && organizations === null) {
      loadOrganizations();
    }
  }, [currentOrgId, currentProjectId, organizations]);

  // An org member who is not a project member is forbidden from every project
  // endpoint — probe one and surface the lack of access as a top alert.
  useEffect(() => {
    if (!currentOrgId || !currentProjectId) {
      setProjectAccessDenied(false);
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const data = await utils.fetcher({
          url: `/organization/${currentOrgId}/project/${currentProjectId}`,
          config: { credentials: 'include', signal: controller.signal }
        });
        if (controller.signal.aborted) return;
        setProjectAccessDenied(utils.isApiError(data));
      } catch {
        // aborted or network failure — leave the current state
      }
    })();
    return () => controller.abort();
  }, [currentOrgId, currentProjectId]);

  useEffect(() => {
    if (!accountClicked) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (accountTriggerRef.current?.contains(target)) return;
      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountClicked(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [accountClicked]);

  const handleAccountClicked = () => {
    setAccountClicked(prevValue => !prevValue);
    setMobileMenuClicked(false);
  };

  const handleMobileMenuClicked = () => {
    setMobileMenuClicked(prevValue => !prevValue);
    setAccountClicked(false);
  };

  const handleLogoutClicked = async () => {
    setAccountClicked(false);
    setMobileMenuClicked(false);
    await authClient.signOut().then(() => {
      window.location.reload();
    });
  };

  const loadLinkedAccounts = async () => {
    try {
      const { data } = await authClient.listAccounts();
      if (!data) return;
      const next = new Set<SocialProvider>();
      for (const account of data) {
        if (
          account.providerId === utils.constants.SOCIAL_PROVIDER_GOOGLE ||
          account.providerId === utils.constants.SOCIAL_PROVIDER_GITHUB
        ) {
          next.add(account.providerId);
        }
      }
      setLinkedProviders(next);
    } catch {
      // ignore; modal still usable without the linked list
    }
  };

  const handleProfileOpen = () => {
    setProfileName(auth?.name || '');
    setProfileImage(auth?.image || '');
    setAccountClicked(false);
    setMobileMenuClicked(false);
    setProfileOpen(true);
    loadLinkedAccounts();
  };

  const handleProfileClose = () => {
    if (profileSaving || avatarBusy || linkBusy) return;
    setProfileOpen(false);
  };

  const handleAvatarPick = () => {
    if (avatarBusy || profileSaving) return;
    fileInputRef.current?.click();
  };

  const handleAvatarFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setAvatarBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const data = await utils.fetcher({
        url: '/user/avatar',
        config: {
          method: 'POST',
          credentials: 'include',
          body: formData
        }
      });
      if (data?.error) {
        snackbar.error(data.error);
        return;
      }
      if (data?.image) {
        setProfileImage(data.image);
        snackbar.success('Avatar updated');
      }
    } catch {
      snackbar.error('Failed to upload avatar');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleLinkProvider = async (provider: SocialProvider) => {
    if (linkBusy) return;
    setLinkBusy(provider);
    try {
      const callbackURL = window.location.href;
      const { data, error } = await authClient.linkSocial({
        provider,
        callbackURL
      });
      if (error) {
        snackbar.error(error.message || `Failed to link ${provider}`);
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      await loadLinkedAccounts();
    } catch {
      snackbar.error(`Failed to link ${provider}`);
    } finally {
      setLinkBusy(null);
    }
  };

  const handleUnlinkProvider = async (provider: SocialProvider) => {
    if (linkBusy) return;
    if (linkedProviders.size <= 1) {
      snackbar.error('You must keep at least one linked account');
      return;
    }
    setLinkBusy(provider);
    try {
      const { error } = await authClient.unlinkAccount({
        providerId: provider
      });
      if (error) {
        snackbar.error(error.message || `Failed to unlink ${provider}`);
        return;
      }
      snackbar.success(`Unlinked ${provider}`);
      await loadLinkedAccounts();
    } catch {
      snackbar.error(`Failed to unlink ${provider}`);
    } finally {
      setLinkBusy(null);
    }
  };

  const handleProfileSave = async () => {
    if (profileSaving) return;
    const trimmedName = profileName.trim();
    if (!trimmedName) {
      snackbar.error('Name is required');
      return;
    }
    setProfileSaving(true);
    try {
      const { error } = await authClient.updateUser({
        name: trimmedName,
        image: profileImage.trim() || undefined
      });
      if (error) {
        snackbar.error(error.message || 'Failed to update profile');
        return;
      }
      snackbar.success('Profile updated');
      setProfileOpen(false);
      router.replace(router.asPath);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleDocumentationClicked = () => {
    setAccountClicked(false);
    setMobileMenuClicked(false);
    window.open(utils.constants.DOCS_URL, '_blank', 'noopener,noreferrer');
  };

  const handleSettingsClicked = () => {
    setAccountClicked(false);
    setMobileMenuClicked(false);
    if (currentOrgId) router.push(`/organization/${currentOrgId}/settings`);
  };

  const loadOrganizations = async () => {
    setOrgsLoading(true);
    try {
      const data = await utils.fetcher({
        url: '/organization',
        config: { credentials: 'include' }
      });
      if (Array.isArray(data)) {
        setOrganizations(data);
      } else {
        setOrganizations([]);
      }
    } catch {
      setOrganizations([]);
    } finally {
      setOrgsLoading(false);
    }
  };

  const handleSwitcherOpen = () => {
    setAccountClicked(false);
    setMobileMenuClicked(false);
    setSelectedOrgId(currentOrgId);
    setExpandedOrgIds(currentOrgId ? new Set([currentOrgId]) : new Set());
    setSwitcherOpen(true);
    if (organizations === null) {
      loadOrganizations();
    }
  };

  const handleToggleOrg = (orgId: string) => {
    setExpandedOrgIds(prev => {
      const next = new Set(prev);
      if (next.has(orgId)) {
        next.delete(orgId);
      } else {
        next.add(orgId);
      }
      return next;
    });
  };

  const handleSwitcherClose = () => {
    setSwitcherOpen(false);
  };

  const handleSelectOrg = (orgId: string) => {
    setSelectedOrgId(orgId);
  };

  const handleSelectProject = (orgId: string, projectId: string) => {
    setSwitcherOpen(false);
    router.push(`/organization/${orgId}/project/${projectId}`);
  };

  const handleManageOrganizations = () => {
    setSwitcherOpen(false);
    router.push('/organization');
  };

  const handleProjectValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProjectValues(prev => ({ ...prev, [name]: value }));
    if (projectError[name as keyof typeof projectError]) {
      setProjectError(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleOpenProjectModal = (orgId: string) => {
    setProjectValues({ name: '', description: '' });
    setProjectError({ name: '', description: '' });
    setProjectApiError('');
    setProjectStatus('idle');
    setProjectModalOrgId(orgId);
  };

  const handleCloseProjectModal = () => {
    if (projectStatus === 'pending') return;
    setProjectModalOrgId(null);
  };

  const handleCreateProject = () => {
    if (!selectedOrg) return;
    handleOpenProjectModal(selectedOrg.id);
  };

  const handleProjectSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!projectModalOrgId) return;
    try {
      setProjectStatus('pending');
      setProjectApiError('');
      const currentValues = await utils.Schema.PROJECT_CREATE_VIEW.parseAsync({
        name: projectValues.name,
        description: projectValues.description || undefined
      });

      const newProject = await utils.fetcher({
        url: `/organization/${projectModalOrgId}/project`,
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify(currentValues)
        }
      });

      if (newProject?.error) {
        setProjectStatus('rejected');
        setProjectApiError(
          newProject.error || 'Something went wrong. Please try again.'
        );
        return;
      }

      const newProjectId = newProject.id || newProject.project?.id;
      setProjectModalOrgId(null);
      setSwitcherOpen(false);
      setOrganizations(null);
      router.push(`/organization/${projectModalOrgId}/project/${newProjectId}`);
    } catch (err) {
      setProjectStatus('rejected');
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
          { name: '', description: '' }
        );
        setProjectError(formattedErrors);
      }
    }
  };

  const selectedOrg =
    organizations?.find(org => org.id === selectedOrgId) ||
    organizations?.[0] ||
    null;

  return (
    <Wrapper userPhoto={auth?.image}>
      {mobileMenuClicked && (
        <MobileMenuWrapper userPhoto={auth?.image}>
          <div
            className="background"
            role="button"
            tabIndex={0}
            aria-label="Close menu"
            onClick={handleMobileMenuClicked}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleMobileMenuClicked();
              }
            }}
          ></div>
          <div className="mobile-menu">
            <div className="mobile-menu-user">
              <div className="mobile-menu-user-pic"></div>
              <div className="mobile-menu-user-texts">
                <p className="mobile-menu-user-title">{auth?.name}</p>
                <p className="mobile-menu-user-subtitle">{auth?.email}</p>
              </div>
              <IconButton onClick={handleMobileMenuClicked}>
                <Close />
              </IconButton>
            </div>
            <div className="options">
              <div className="options-up">
                <UI.Button
                  fullWidth
                  onClick={() => {
                    setMobileMenuClicked(false);
                    handleSwitcherOpen();
                  }}
                >
                  <AppsOutlined />
                  <span className="button-text">Organizations</span>
                </UI.Button>
                <UI.Button
                  fullWidth
                  className={
                    pathname === '/organization/[id]/project/[projectId]'
                      ? 'active'
                      : ''
                  }
                  onClick={goToProjectHome}
                >
                  {pathname === '/organization/[id]/project/[projectId]' ? (
                    <HomeFilled />
                  ) : (
                    <HomeOutlined />
                  )}
                  <span className="button-text">Home</span>
                </UI.Button>
                <UI.Button
                  fullWidth
                  className={
                    pathname ===
                    '/organization/[id]/project/[projectId]/prompts'
                      ? 'active'
                      : ''
                  }
                  onClick={() => goToProjectSection('prompts')}
                >
                  {pathname ===
                  '/organization/[id]/project/[projectId]/prompts' ? (
                    <EmojiObjects />
                  ) : (
                    <EmojiObjectsOutlined />
                  )}
                  <span className="button-text">Prompts</span>
                </UI.Button>
                <UI.Button
                  fullWidth
                  className={
                    pathname ===
                    '/organization/[id]/project/[projectId]/resources'
                      ? 'active'
                      : ''
                  }
                  onClick={() => goToProjectSection('resources')}
                >
                  {pathname ===
                  '/organization/[id]/project/[projectId]/resources' ? (
                    <Chat />
                  ) : (
                    <ChatOutlined />
                  )}
                  <span className="button-text">Resources</span>
                </UI.Button>
                <UI.Button
                  fullWidth
                  className={
                    pathname === '/organization/[id]/project/[projectId]/tools'
                      ? 'active'
                      : ''
                  }
                  onClick={() => goToProjectSection('tools')}
                >
                  {pathname ===
                  '/organization/[id]/project/[projectId]/tools' ? (
                    <Settings />
                  ) : (
                    <SettingsOutlined />
                  )}
                  <span className="button-text">Tools</span>
                </UI.Button>
                <UI.Button
                  fullWidth
                  className={
                    pathname ===
                    '/organization/[id]/project/[projectId]/channels'
                      ? 'active'
                      : ''
                  }
                  onClick={() => goToProjectSection('channels')}
                >
                  {pathname ===
                  '/organization/[id]/project/[projectId]/channels' ? (
                    <Forum />
                  ) : (
                    <ForumOutlined />
                  )}
                  <span className="button-text">Channels</span>
                </UI.Button>
              </div>
              <div className="options-down">
                <UI.Button fullWidth onClick={handleProfileOpen}>
                  <AccountCircleOutlined />
                  <span className="button-text">Account</span>
                </UI.Button>
                <UI.Button fullWidth onClick={handleSettingsClicked}>
                  <SettingsOutlined />
                  <span className="button-text">Settings</span>
                </UI.Button>
                <UI.Button fullWidth onClick={handleDocumentationClicked}>
                  <MenuBookOutlined />
                  <span className="button-text">Documentation</span>
                </UI.Button>
                <UI.Button fullWidth onClick={handleLogoutClicked}>
                  <LogoutOutlined />
                  <span className="button-text">Logout</span>
                </UI.Button>
              </div>
            </div>
          </div>
        </MobileMenuWrapper>
      )}
      <div className="container-navbar">
        <div className="sub-navbar">
          <Tooltip title="Organizations" placement="right">
            <div
              className={`sub-navbar-icon${switcherOpen ? ' is-open' : ''}`}
              role="button"
              tabIndex={0}
              aria-label="Open organization switcher"
              aria-expanded={switcherOpen}
              onClick={handleSwitcherOpen}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSwitcherOpen();
                }
              }}
            >
              <AppsOutlined />
            </div>
          </Tooltip>
          <div className="sub-navbar-options">
            <UI.Button
              fullWidth
              className={
                pathname === '/organization/[id]/project/[projectId]'
                  ? 'active'
                  : ''
              }
              onClick={goToProjectHome}
            >
              {pathname === '/organization/[id]/project/[projectId]' ? (
                <HomeFilled />
              ) : (
                <HomeOutlined />
              )}
              <span className="button-text">Home</span>
            </UI.Button>
            <UI.Button
              fullWidth
              className={
                pathname === '/organization/[id]/project/[projectId]/prompts'
                  ? 'active'
                  : ''
              }
              onClick={() => goToProjectSection('prompts')}
            >
              {pathname === '/organization/[id]/project/[projectId]/prompts' ? (
                <EmojiObjects />
              ) : (
                <EmojiObjectsOutlined />
              )}
              <span className="button-text">Prompts</span>
            </UI.Button>
            <UI.Button
              fullWidth
              className={
                pathname === '/organization/[id]/project/[projectId]/resources'
                  ? 'active'
                  : ''
              }
              onClick={() => goToProjectSection('resources')}
            >
              {pathname ===
              '/organization/[id]/project/[projectId]/resources' ? (
                <Chat />
              ) : (
                <ChatOutlined />
              )}
              <span className="button-text">Resources</span>
            </UI.Button>
            <UI.Button
              fullWidth
              className={
                pathname === '/organization/[id]/project/[projectId]/tools'
                  ? 'active'
                  : ''
              }
              onClick={() => goToProjectSection('tools')}
            >
              {pathname === '/organization/[id]/project/[projectId]/tools' ? (
                <Settings />
              ) : (
                <SettingsOutlined />
              )}
              <span className="button-text">Tools</span>
            </UI.Button>
            <UI.Button
              fullWidth
              className={
                pathname === '/organization/[id]/project/[projectId]/channels'
                  ? 'active'
                  : ''
              }
              onClick={() => goToProjectSection('channels')}
            >
              {pathname ===
              '/organization/[id]/project/[projectId]/channels' ? (
                <Forum />
              ) : (
                <ForumOutlined />
              )}
              <span className="button-text">Channels</span>
            </UI.Button>
          </div>
          <div
            className="sub-navbar-user"
            role="button"
            tabIndex={0}
            aria-label="Account menu"
            ref={accountTriggerRef}
            onClick={handleAccountClicked}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleAccountClicked();
              }
            }}
          ></div>
        </div>
        <nav className="navbar">
          <div className="header-logo">
            <Tooltip title="Open menu" placement="right">
              <IconButton onClick={handleMobileMenuClicked}>
                <Menu />
              </IconButton>
            </Tooltip>
            <p className="header-logo-text">Ganju.ai</p>
          </div>
        </nav>
        {accountClicked && (
          <div className="account-menu" ref={accountMenuRef} role="menu">
            <div className="account-menu-person">
              <div className="account-menu-person-pic"></div>
              <div className="account-menu-person-texts">
                <p className="account-menu-person-title">{auth?.name}</p>
                <p className="account-menu-person-subtitle">{auth?.email}</p>
              </div>
            </div>
            <div
              className="account-menu-item"
              role="menuitem"
              tabIndex={0}
              onClick={handleProfileOpen}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleProfileOpen();
                }
              }}
            >
              <AccountCircleOutlined />
              <p className="account-menu-item-text">Account</p>
            </div>
            <div
              className="account-menu-item"
              role="menuitem"
              tabIndex={0}
              onClick={handleSettingsClicked}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSettingsClicked();
                }
              }}
            >
              <SettingsOutlined />
              <p className="account-menu-item-text">Settings</p>
            </div>
            <div
              className="account-menu-item"
              role="menuitem"
              tabIndex={0}
              onClick={handleDocumentationClicked}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleDocumentationClicked();
                }
              }}
            >
              <MenuBookOutlined />
              <p className="account-menu-item-text">Documentation</p>
            </div>
            <div
              className="account-menu-item"
              role="menuitem"
              tabIndex={0}
              onClick={handleLogoutClicked}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleLogoutClicked();
                }
              }}
            >
              <LogoutOutlined />
              <p className="account-menu-item-text">Logout</p>
            </div>
          </div>
        )}
        <div className="box-container">
          {projectAccessDenied ? (
            <NoAccess organizationId={currentOrgId} />
          ) : (
            page
          )}
        </div>
      </div>
      {switcherOpen && (
        <UI.Portal>
          <OrgSwitcherWrapper>
            <div
              className="switcher-backdrop"
              role="button"
              tabIndex={0}
              aria-label="Close switcher"
              onClick={handleSwitcherClose}
              onKeyDown={e => {
                if (e.key === 'Escape') handleSwitcherClose();
              }}
            />
            <div className="switcher-panel" role="dialog" aria-modal="true">
              <div className="switcher-header">
                <h2 className="switcher-header-title">
                  Organizations & Projects
                </h2>
                <IconButton size="small" onClick={handleSwitcherClose}>
                  <Close />
                </IconButton>
              </div>
              <div className="switcher-mobile">
                {orgsLoading && organizations === null ? (
                  <div className="switcher-mobile-list">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="switcher-accordion-skeleton">
                        <div className="switcher-accordion-skeleton-texts">
                          <UI.Skeleton variant="text" width="60%" height={16} />
                          <UI.Skeleton variant="text" width="35%" height={12} />
                        </div>
                        <UI.Skeleton variant="rounded" width={24} height={18} />
                      </div>
                    ))}
                  </div>
                ) : organizations && organizations.length > 0 ? (
                  <div className="switcher-mobile-list">
                    {organizations.map(org => {
                      const isExpanded = expandedOrgIds.has(org.id);
                      const isActiveOrg = currentOrgId === org.id;
                      return (
                        <div
                          key={org.id}
                          className={`switcher-accordion${isExpanded ? ' is-expanded' : ''}`}
                        >
                          <button
                            type="button"
                            className={`switcher-accordion-header${isActiveOrg ? ' is-active' : ''}`}
                            aria-expanded={isExpanded}
                            onClick={() => handleToggleOrg(org.id)}
                          >
                            <div className="switcher-item-texts">
                              <p className="switcher-item-name">{org.name}</p>
                              <p className="switcher-item-meta">
                                {org.organizationUserCount ?? 0} member
                                {Number(org.organizationUserCount ?? 0) === 1
                                  ? ''
                                  : 's'}
                              </p>
                            </div>
                            <span className="switcher-item-count">
                              {org.projectCount ?? org.projects?.length ?? 0}
                            </span>
                            <ExpandMoreOutlined className="switcher-accordion-chevron" />
                          </button>
                          {isExpanded && (
                            <div className="switcher-accordion-body">
                              {org.projects?.length ? (
                                org.projects.map(project => {
                                  const isActiveProject =
                                    currentOrgId === org.id &&
                                    currentProjectId === project.id;
                                  return (
                                    <div
                                      key={project.id}
                                      className={`switcher-accordion-project${isActiveProject ? ' is-active' : ''}`}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() =>
                                        handleSelectProject(org.id, project.id)
                                      }
                                      onKeyDown={e => {
                                        if (
                                          e.key === 'Enter' ||
                                          e.key === ' '
                                        ) {
                                          e.preventDefault();
                                          handleSelectProject(
                                            org.id,
                                            project.id
                                          );
                                        }
                                      }}
                                    >
                                      <p className="switcher-item-name">
                                        {project.name}
                                      </p>
                                    </div>
                                  );
                                })
                              ) : (
                                <p className="switcher-empty">
                                  No projects yet
                                </p>
                              )}
                              <button
                                type="button"
                                className="switcher-accordion-new"
                                onClick={() => handleOpenProjectModal(org.id)}
                              >
                                <AddOutlined />
                                New project
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="switcher-empty">No organizations yet</p>
                )}
                <div className="switcher-footer">
                  <UI.Button fullWidth onClick={handleManageOrganizations}>
                    <BusinessOutlined />
                    <span className="button-text">Manage organizations</span>
                  </UI.Button>
                </div>
              </div>
              <div className="switcher-columns">
                <div className="switcher-column">
                  <p className="switcher-column-label">Organizations</p>
                  <div className="switcher-list">
                    {orgsLoading && organizations === null ? (
                      <div className="switcher-list-skeleton">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="switcher-item-skeleton">
                            <div className="switcher-item-skeleton-texts">
                              <UI.Skeleton
                                variant="text"
                                width="70%"
                                height={16}
                              />
                              <UI.Skeleton
                                variant="text"
                                width="45%"
                                height={12}
                              />
                            </div>
                            <UI.Skeleton
                              variant="rounded"
                              width={24}
                              height={18}
                            />
                          </div>
                        ))}
                      </div>
                    ) : organizations && organizations.length > 0 ? (
                      organizations.map(org => {
                        const isSelected = selectedOrg?.id === org.id;
                        const isActive = currentOrgId === org.id;
                        return (
                          <div
                            key={org.id}
                            className={`switcher-item${isSelected ? ' is-selected' : ''}${isActive ? ' is-active' : ''}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleSelectOrg(org.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleSelectOrg(org.id);
                              }
                            }}
                          >
                            <div className="switcher-item-texts">
                              <p className="switcher-item-name">{org.name}</p>
                              <p className="switcher-item-meta">
                                {org.organizationUserCount ?? 0} member
                                {Number(org.organizationUserCount ?? 0) === 1
                                  ? ''
                                  : 's'}
                              </p>
                            </div>
                            <span className="switcher-item-count">
                              {org.projectCount ?? org.projects?.length ?? 0}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="switcher-empty">No organizations yet</p>
                    )}
                  </div>
                  <div className="switcher-footer">
                    <UI.Button fullWidth onClick={handleManageOrganizations}>
                      <BusinessOutlined />
                      <span className="button-text">Manage organizations</span>
                    </UI.Button>
                  </div>
                </div>
                <div className="switcher-column">
                  <p className="switcher-column-label">Projects</p>
                  <div className="switcher-list">
                    {selectedOrg && selectedOrg.projects?.length ? (
                      selectedOrg.projects.map(project => {
                        const isActive =
                          currentOrgId === selectedOrg.id &&
                          currentProjectId === project.id;
                        return (
                          <div
                            key={project.id}
                            className={`switcher-item${isActive ? ' is-active' : ''}`}
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              handleSelectProject(selectedOrg.id, project.id)
                            }
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleSelectProject(selectedOrg.id, project.id);
                              }
                            }}
                          >
                            <div className="switcher-item-texts">
                              <p className="switcher-item-name">
                                {project.name}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="switcher-empty">
                        {selectedOrg
                          ? 'No projects in this organization'
                          : 'Select an organization'}
                      </p>
                    )}
                  </div>
                  <div className="switcher-footer">
                    <UI.Button
                      fullWidth
                      disabled={!selectedOrg}
                      onClick={handleCreateProject}
                    >
                      <AddOutlined />
                      <span className="button-text">New project</span>
                    </UI.Button>
                  </div>
                </div>
              </div>
            </div>
          </OrgSwitcherWrapper>
        </UI.Portal>
      )}
      {projectModalOrgId && (
        <UI.Portal>
          <ModalOverlay onClick={handleCloseProjectModal}>
            <ModalDialog role="dialog" onClick={e => e.stopPropagation()}>
              <div className="profile-modal-header">
                <h2 className="profile-modal-title">Create a new project</h2>
                <IconButton size="small" onClick={handleCloseProjectModal}>
                  <Close />
                </IconButton>
              </div>
              <form onSubmit={handleProjectSubmit}>
                <div className="profile-modal-body">
                  <UI.Input
                    label="Name"
                    placeholder="Enter project name"
                    name="name"
                    value={projectValues.name}
                    onChange={handleProjectValueChange}
                    required
                    error={!!projectError.name}
                    helperText={projectError.name}
                    disabled={projectStatus === 'pending'}
                  />
                  <UI.Input
                    label="Description"
                    placeholder="Describe your project"
                    name="description"
                    value={projectValues.description}
                    onChange={handleProjectValueChange}
                    multiline
                    rows={3}
                    error={!!projectError.description}
                    helperText={projectError.description}
                    disabled={projectStatus === 'pending'}
                  />
                  {projectApiError && (
                    <p className="profile-section-title">{projectApiError}</p>
                  )}
                </div>
                <div className="profile-modal-actions">
                  <UI.Button
                    size="small"
                    disabled={projectStatus === 'pending'}
                    onClick={handleCloseProjectModal}
                  >
                    Cancel
                  </UI.Button>
                  <UI.Button
                    type="submit"
                    variant="contained"
                    size="small"
                    disabled={projectStatus === 'pending'}
                  >
                    {projectStatus === 'pending' ? 'Creating...' : 'Create'}
                  </UI.Button>
                </div>
              </form>
            </ModalDialog>
          </ModalOverlay>
        </UI.Portal>
      )}
      {profileOpen && (
        <UI.Portal>
          <ModalOverlay onClick={handleProfileClose}>
            <ModalDialog role="dialog" onClick={e => e.stopPropagation()}>
              <div className="profile-modal-header">
                <h2 className="profile-modal-title">Account</h2>
                <IconButton size="small" onClick={handleProfileClose}>
                  <Close />
                </IconButton>
              </div>
              <div className="profile-modal-body">
                <div className="profile-avatar-section">
                  <div
                    className="profile-avatar-preview"
                    style={
                      profileImage
                        ? { backgroundImage: `url('${profileImage}')` }
                        : undefined
                    }
                  />
                  <div className="profile-avatar-actions">
                    <UI.Button
                      size="medium"
                      disabled={avatarBusy || profileSaving}
                      onClick={handleAvatarPick}
                    >
                      <CameraAltOutlined />
                      <span className="button-text">
                        {avatarBusy ? 'Uploading...' : 'Upload image'}
                      </span>
                    </UI.Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    hidden
                    onChange={handleAvatarFileChange}
                  />
                </div>
                <UI.Input
                  label="Name"
                  name="name"
                  placeholder="Your name"
                  value={profileName}
                  disabled={profileSaving}
                  onChange={e => setProfileName(e.target.value)}
                />
                <div className="profile-linked-accounts">
                  <p className="profile-section-title">Linked accounts</p>
                  {SOCIAL_PROVIDERS.map(({ id, label, Icon }) => {
                    const linked = linkedProviders.has(id);
                    const busy = linkBusy === id;
                    const isLastLinked = linked && linkedProviders.size <= 1;
                    const buttonDisabled =
                      busy || !!linkBusy || (linked && isLastLinked);
                    const button = (
                      <UI.Button
                        size="medium"
                        disabled={buttonDisabled}
                        onClick={() =>
                          linked
                            ? handleUnlinkProvider(id)
                            : handleLinkProvider(id)
                        }
                      >
                        {linked ? <LinkOff /> : <LinkIcon />}
                        <span className="button-text">
                          {busy ? 'Working...' : linked ? 'Unlink' : 'Link'}
                        </span>
                      </UI.Button>
                    );
                    return (
                      <div key={id} className="profile-linked-row">
                        <div className="profile-linked-info">
                          <Icon />
                          <span className="profile-linked-label">{label}</span>
                          {linked && (
                            <span className="profile-linked-badge">Linked</span>
                          )}
                        </div>
                        {isLastLinked ? (
                          <Tooltip title="You must keep at least one linked account">
                            <span>{button}</span>
                          </Tooltip>
                        ) : (
                          button
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="profile-modal-actions">
                <UI.Button
                  size="small"
                  disabled={profileSaving}
                  onClick={handleProfileClose}
                >
                  Cancel
                </UI.Button>
                <UI.Button
                  variant="contained"
                  size="small"
                  disabled={profileSaving}
                  onClick={handleProfileSave}
                >
                  {profileSaving ? 'Saving...' : 'Save'}
                </UI.Button>
              </div>
            </ModalDialog>
          </ModalOverlay>
        </UI.Portal>
      )}
    </Wrapper>
  );
};

export const Home = (page: HomePage) => <HomeLayout page={page} />;
