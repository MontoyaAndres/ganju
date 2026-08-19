import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';
import type { CalendarConfigField } from '@ganju/utils';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Switch from '@mui/material/Switch';
import {
  Close,
  CheckCircle,
  DeleteOutlined,
  EditOutlined,
  LinkOff,
  Link as LinkIcon,
  Search,
  Warning,
  ExtensionOutlined,
  ArrowBack,
  ExpandMore,
  Add
} from '@mui/icons-material';

import { HttpEndpointModal } from './HttpEndpointModal';
import { McpProxyModal } from './McpProxyModal';
import { ModalDialog, ModalOverlay, Wrapper } from './styles';

interface McpServer {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  transport: string;
  authKind: string;
  defaultScopes: string | null;
}

interface ToolDefinition {
  id: string;
  key: string;
  title: string;
  description: string | null;
  requiredScopes: string | null;
  groupId: string;
}

interface ToolGroup {
  id: string;
  key: string;
  title: string;
  description: string | null;
  icon: string | null;
  provider: string | null;
  toolDefinitions: ToolDefinition[];
}

interface ArtifactTool {
  id: string;
  config: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  toolDefinitionId: string;
  mcpServerCatalogId?: string | null;
  artifactId: string;
  createdAt: string;
  updatedAt: string;
  toolDefinition?: ToolDefinition & {
    group?: ToolGroup;
  };
}

interface ArtifactCredential {
  id: string;
  provider: string;
  hasRefreshToken: boolean;
  expiresAt: string | null;
  scopes: string | null;
  artifactId: string;
  createdAt: string;
  updatedAt: string;
  metadata?: { needsReauth?: boolean; reauthReason?: string } | null;
}

// One managed OAuth provider and where this artifact stands with it. Reported
// for every provider, connected or not — which is what separates it from the
// credential list above, and why an http-endpoint can offer a connection to
// borrow without first guessing which ones exist.
interface ArtifactConnection {
  provider: string;
  credentialId: string | null;
  connected: boolean;
  needsReauth: boolean;
  expiresAt: string | null;
  scopes: string | null;
  configured: boolean;
  app: 'managed';
}

const EXPANDED_GROUP_KEY = 'ganju:expandedToolGroupId';

const SEND_UPDATES_OPTIONS = [
  {
    value: utils.constants.CALENDAR_SEND_UPDATES_ALL,
    label: 'Notify everyone'
  },
  {
    value: utils.constants.CALENDAR_SEND_UPDATES_EXTERNAL_ONLY,
    label: 'Notify external guests only'
  },
  {
    value: utils.constants.CALENDAR_SEND_UPDATES_NONE,
    label: "Don't send notifications"
  }
];

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' }
];

export const Tools = () => {
  const router = useRouter();
  const snackbar = UI.Alert.useSnackbar();
  const [tab, setTab] = useState<'installed' | 'catalog'>('installed');
  const [catalog, setCatalog] = useState<ToolGroup[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [installed, setInstalled] = useState<ArtifactTool[]>([]);
  const [credentials, setCredentials] = useState<ArtifactCredential[]>([]);
  const [connections, setConnections] = useState<ArtifactConnection[]>([]);
  const [search, setSearch] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [expandedInstalled, setExpandedInstalled] = useState<Set<string>>(
    new Set()
  );
  const [status, setStatus] = useState<
    'idle' | 'pending' | 'resolved' | 'rejected'
  >('idle');
  const [togglingDefId, setTogglingDefId] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [editTool, setEditTool] = useState<ArtifactTool | null>(null);
  const [configJson, setConfigJson] = useState('{}');
  const [configError, setConfigError] = useState<string | null>(null);
  const [removeAlert, setRemoveAlert] = useState<ArtifactTool | null>(null);
  const [disconnectAlert, setDisconnectAlert] = useState<{
    provider: string;
    affected: number;
  } | null>(null);
  const [scopeAlert, setScopeAlert] = useState<{
    group: ToolGroup;
    def: ToolDefinition;
    missing: string[];
  } | null>(null);
  const [connectedBanner, setConnectedBanner] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<
    { id: string; summary: string; primary: boolean; timeZone: string | null }[]
  >([]);
  const [calendarStatus, setCalendarStatus] = useState<
    'idle' | 'pending' | 'resolved' | 'rejected'
  >('idle');
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [configForm, setConfigForm] = useState<Record<string, unknown>>({});
  const [eventTypes, setEventTypes] = useState<
    { id: number; title: string; lengthInMinutes: number | null }[]
  >([]);
  const [eventTypesStatus, setEventTypesStatus] = useState<
    'idle' | 'pending' | 'resolved' | 'rejected'
  >('idle');
  const [apiKeyGroup, setApiKeyGroup] = useState<ToolGroup | null>(null);
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiKeySubmitting, setApiKeySubmitting] = useState(false);
  const [httpEndpointEditor, setHttpEndpointEditor] = useState<{
    tool: ArtifactTool | null;
  } | null>(null);
  const [mcpProxyEditor, setMcpProxyEditor] = useState<{
    server: McpServer;
    existingTool: ArtifactTool | null;
  } | null>(null);
  // After an oauth-server OAuth redirect (?connected=<slug>), the catalog isn't
  // loaded yet — stash the slug and re-open that server's modal once it is.
  const [pendingMcpServerSlug, setPendingMcpServerSlug] = useState<
    string | null
  >(null);

  const { id: organizationId, projectId } = router.query as {
    id: string;
    projectId: string;
  };
  const apiBase = `/organization/${organizationId}/project/${projectId}/artifact`;
  const toolApiBase = `${apiBase}/tool`;
  const credentialApiBase = `${apiBase}/credential`;
  const connectionApiBase = `${apiBase}/connections`;

  const fetchAll = async (signal?: AbortSignal) => {
    if (!organizationId || !projectId) return;
    setStatus('pending');
    try {
      const [
        catalogData,
        mcpServerData,
        installedData,
        credentialData,
        connectionData
      ] = await Promise.all([
        utils.fetcher({
          url: '/catalog/tools',
          config: { credentials: 'include', signal }
        }),
        utils.fetcher({
          url: '/catalog/mcp-servers',
          config: { credentials: 'include', signal }
        }),
        utils.fetcher({
          url: toolApiBase,
          config: { credentials: 'include', signal }
        }),
        utils.fetcher({
          url: credentialApiBase,
          config: { credentials: 'include', signal }
        }),
        utils.fetcher({
          url: connectionApiBase,
          config: { credentials: 'include', signal }
        })
      ]);
      if (signal?.aborted) return;
      if (Array.isArray(catalogData)) setCatalog(catalogData);
      if (Array.isArray(mcpServerData)) setMcpServers(mcpServerData);
      if (Array.isArray(installedData)) setInstalled(installedData);
      if (Array.isArray(credentialData)) setCredentials(credentialData);
      if (Array.isArray(connectionData?.connections)) {
        setConnections(connectionData.connections);
      }
      setStatus('resolved');
    } catch {
      if (!signal?.aborted) setStatus('rejected');
    }
  };

  const fetchCalendars = async (signal?: AbortSignal) => {
    setCalendarStatus('pending');
    try {
      const data = await utils.fetcher({
        url: `${apiBase}/google-calendar/calendars`,
        config: { credentials: 'include', signal }
      });
      if (signal?.aborted) return;
      setCalendars(Array.isArray(data?.calendars) ? data.calendars : []);
      setCalendarStatus('resolved');
    } catch {
      if (!signal?.aborted) setCalendarStatus('rejected');
    }
  };

  const fetchEventTypes = async (signal?: AbortSignal) => {
    setEventTypesStatus('pending');
    try {
      const data = await utils.fetcher({
        url: `${apiBase}/calcom/event-types`,
        config: { credentials: 'include', signal }
      });
      if (signal?.aborted) return;
      setEventTypes(Array.isArray(data?.eventTypes) ? data.eventTypes : []);
      setEventTypesStatus('resolved');
    } catch {
      if (!signal?.aborted) setEventTypesStatus('rejected');
    }
  };

  useEffect(() => {
    if (!organizationId || !projectId) return;
    const controller = new AbortController();
    fetchAll(controller.signal);
    return () => controller.abort();
  }, [organizationId, projectId]);

  // Load the connected account's calendars when the Google Calendar group is
  // open and connected — used to populate the default-calendar dropdown.
  useEffect(() => {
    if (!isCalendarGroup || !expandedGroup) {
      setCalendars([]);
      setCalendarStatus('idle');
      return;
    }
    if (
      !credentialByProvider.has(expandedGroup.provider!) ||
      isProviderExpired(expandedGroup.provider)
    ) {
      return;
    }
    const controller = new AbortController();
    fetchCalendars(controller.signal);
    return () => controller.abort();
  }, [expandedGroupId, credentials, catalog]);

  // Load Cal.com event types when the Cal.com group is open and connected —
  // populates the default-event-type dropdown.
  useEffect(() => {
    if (!isCalcomGroup || !expandedGroup) {
      setEventTypes([]);
      setEventTypesStatus('idle');
      return;
    }
    if (!credentialByProvider.has(expandedGroup.provider!)) return;
    const controller = new AbortController();
    fetchEventTypes(controller.signal);
    return () => controller.abort();
  }, [expandedGroupId, credentials, catalog]);

  useEffect(() => {
    if (!router.isReady) return;
    const connected = router.query.connected as string | undefined;
    if (!connected) return;
    setConnectedBanner(connected);
    setTab('catalog');
    setPendingMcpServerSlug(connected);
    const { connected: _c, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, {
      shallow: true
    });
  }, [router.isReady]);

  // Re-open the mcp-proxy modal for a server the user just connected via OAuth.
  // Waits for the catalog; a non-matching slug (a native provider) is ignored.
  useEffect(() => {
    if (!pendingMcpServerSlug || mcpServers.length === 0) return;
    const server = mcpServers.find(s => s.slug === pendingMcpServerSlug);
    setPendingMcpServerSlug(null);
    if (!server) return;
    const install =
      installed.find(
        t =>
          (t.mcpServerCatalogId ||
            (t.config as { curatedServerId?: string } | null)
              ?.curatedServerId) === server.id
      ) || null;
    setTab('catalog');
    setMcpProxyEditor({ server, existingTool: install });
  }, [pendingMcpServerSlug, mcpServers, installed]);

  useEffect(() => {
    if (status !== 'resolved') return;
    if (typeof window === 'undefined') return;
    const pendingId = sessionStorage.getItem(EXPANDED_GROUP_KEY);
    if (!pendingId) return;
    sessionStorage.removeItem(EXPANDED_GROUP_KEY);
    if (catalog.some(g => g.id === pendingId)) {
      setExpandedGroupId(pendingId);
      setTab('catalog');
    }
  }, [status]);

  useEffect(() => {
    if (installed.length === 0) return;
    setExpandedInstalled(prev => {
      if (prev.size > 0) return prev;
      const group = installed[0]?.toolDefinition?.group;
      const first = group?.provider || group?.id || 'none';
      return new Set([first]);
    });
  }, [installed]);

  useEffect(() => {
    const requestedId = router.query.selected;
    if (typeof requestedId !== 'string' || installed.length === 0) return;
    const match = installed.find(t => t.id === requestedId);
    if (!match || editTool?.id === match.id) return;
    setTab('installed');
    const group = match.toolDefinition?.group;
    const bucket = group?.provider || group?.id || 'none';
    setExpandedInstalled(prev => {
      if (prev.has(bucket)) return prev;
      const next = new Set(prev);
      next.add(bucket);
      return next;
    });
    openEditor(match);
  }, [router.query.selected, installed]);

  const toggleInstalledProvider = (provider: string) => {
    setExpandedInstalled(prev => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  const installedByDefId = useMemo(() => {
    const map = new Map<string, ArtifactTool>();
    for (const t of installed) map.set(t.toolDefinitionId, t);
    return map;
  }, [installed]);

  const installedByBucket = useMemo(() => {
    const map = new Map<string, ArtifactTool[]>();
    for (const t of installed) {
      const group = t.toolDefinition?.group;
      const key = group?.provider || group?.id || 'none';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [installed]);

  const credentialByProvider = useMemo(() => {
    const map = new Map<string, ArtifactCredential[]>();
    for (const c of credentials) {
      if (!map.has(c.provider)) map.set(c.provider, []);
      map.get(c.provider)!.push(c);
    }
    return map;
  }, [credentials]);

  const filteredCatalog = useMemo(() => {
    // The mcp-proxy group is hidden — its servers render as their own cards.
    const visible = catalog.filter(
      g =>
        !g.toolDefinitions.some(
          d => d.key === utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY
        )
    );
    const q = search.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter(
      g =>
        g.title.toLowerCase().includes(q) ||
        (g.description || '').toLowerCase().includes(q) ||
        g.toolDefinitions.some(d => d.title.toLowerCase().includes(q))
    );
  }, [catalog, search]);

  const expandedGroup = useMemo(
    () =>
      expandedGroupId ? catalog.find(g => g.id === expandedGroupId) : null,
    [catalog, expandedGroupId]
  );

  const isCalendarGroup =
    expandedGroup?.provider === utils.constants.OAUTH_PROVIDER_GOOGLE_CALENDAR;
  const isCalcomGroup =
    expandedGroup?.provider === utils.constants.API_KEY_PROVIDER_CALCOM;
  const isApiKeyProvider = (provider: string | null | undefined): boolean =>
    !!provider &&
    (utils.constants.API_KEY_PROVIDERS as readonly string[]).includes(provider);

  // The http-endpoint definition is special: one definition the user installs
  // many times, each instance a distinct named tool with its own config. Detect
  // it by key so the group renders an endpoint list instead of on/off toggles.
  const httpEndpointDef = useMemo(
    () =>
      catalog
        .flatMap(g => g.toolDefinitions)
        .find(
          d => d.key === utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT
        ) || null,
    [catalog]
  );
  const isHttpEndpointGroup = (group: ToolGroup | null | undefined): boolean =>
    !!group &&
    group.toolDefinitions.some(
      d => d.key === utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT
    );

  // The mcp-proxy definition is plumbing: each curated server installs against
  // it, but we present the servers themselves as cards (from mcp_server_catalog)
  // — so the generic "MCP Servers" group is hidden from the catalog grid.
  const mcpProxyDef = useMemo(
    () =>
      catalog
        .flatMap(g => g.toolDefinitions)
        .find(d => d.key === utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY) ||
      null,
    [catalog]
  );
  // One installed artifact_tool per connected server, keyed by the catalog id
  // (with the in-config curatedServerId as a fallback).
  const installedByServerId = useMemo(() => {
    const map = new Map<string, ArtifactTool>();
    for (const t of installed) {
      if (
        t.toolDefinition?.key !== utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY
      )
        continue;
      const id =
        t.mcpServerCatalogId ||
        (t.config?.curatedServerId as string | undefined);
      if (id) map.set(id, t);
    }
    return map;
  }, [installed]);

  const filteredMcpServers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mcpServers;
    return mcpServers.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
    );
  }, [mcpServers, search]);
  const httpEndpointInstances = useMemo(
    () =>
      installed.filter(
        t =>
          t.toolDefinition?.key ===
          utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT
      ),
    [installed]
  );

  // Installed tools belonging to the open group — the fan-out targets for the
  // group-level defaults.
  const expandedGroupInstalledTools = useMemo(() => {
    if (!expandedGroup) return [] as ArtifactTool[];
    const defIds = new Set(expandedGroup.toolDefinitions.map(d => d.id));
    return installed.filter(t => defIds.has(t.toolDefinitionId));
  }, [expandedGroup, installed]);

  // The default calendar is stored on each calendar tool's config; read it back
  // from whichever installed tool in the group already carries it.
  const groupDefaultCalendarId = useMemo(() => {
    for (const t of expandedGroupInstalledTools) {
      const value = t.config?.defaultCalendarId;
      if (typeof value === 'string' && value) return value;
    }
    return '';
  }, [expandedGroupInstalledTools]);

  const calendarOptions = useMemo(
    () =>
      calendars.map(cal => ({
        value: cal.id,
        label: cal.primary ? `${cal.summary} (primary)` : cal.summary
      })),
    [calendars]
  );

  const primaryCalendarId = useMemo(
    () => calendars.find(c => c.primary)?.id || '',
    [calendars]
  );

  // Only feed the select a value it can actually render — a stored calendar that
  // no longer exists (deleted / access lost) falls back to blank.
  const selectedCalendarValue = useMemo(() => {
    const desired = groupDefaultCalendarId || primaryCalendarId;
    return calendarOptions.some(o => o.value === desired) ? desired : '';
  }, [calendarOptions, groupDefaultCalendarId, primaryCalendarId]);

  const groupDefaultTimeZone = useMemo(() => {
    for (const t of expandedGroupInstalledTools) {
      const value = t.config?.defaultTimeZone;
      if (typeof value === 'string' && value) return value;
    }
    return '';
  }, [expandedGroupInstalledTools]);

  const groupSendUpdates = useMemo(() => {
    for (const t of expandedGroupInstalledTools) {
      const value = t.config?.sendUpdates;
      if (typeof value === 'string' && value) return value;
    }
    return 'all';
  }, [expandedGroupInstalledTools]);

  // Time-zone choices: the connected calendars' zones plus the browser zone,
  // and whatever is already stored — deduped so the select can always render it.
  const timeZoneOptions = useMemo(() => {
    const set = new Set<string>();
    const browserTz =
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : '';
    if (browserTz) set.add(browserTz);
    for (const c of calendars) if (c.timeZone) set.add(c.timeZone);
    if (groupDefaultTimeZone) set.add(groupDefaultTimeZone);
    return Array.from(set)
      .sort()
      .map(tz => ({ value: tz, label: tz }));
  }, [calendars, groupDefaultTimeZone]);

  const selectedTimeZone = useMemo(() => {
    const browserTz =
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : '';
    const primaryTz = calendars.find(c => c.primary)?.timeZone || '';
    const desired = groupDefaultTimeZone || primaryTz || browserTz;
    return timeZoneOptions.some(o => o.value === desired) ? desired : '';
  }, [timeZoneOptions, groupDefaultTimeZone, calendars]);

  // Cal.com group-level default event type — stored on each calcom tool's config.
  const groupDefaultEventTypeId = useMemo(() => {
    for (const t of expandedGroupInstalledTools) {
      const value = t.config?.defaultEventTypeId;
      if (typeof value === 'number') return String(value);
      if (typeof value === 'string' && value) return value;
    }
    return '';
  }, [expandedGroupInstalledTools]);

  const eventTypeOptions = useMemo(
    () =>
      eventTypes.map(et => ({
        value: String(et.id),
        label: et.lengthInMinutes
          ? `${et.title} (${et.lengthInMinutes} min)`
          : et.title
      })),
    [eventTypes]
  );

  const selectedEventTypeId = useMemo(
    () =>
      eventTypeOptions.some(o => o.value === groupDefaultEventTypeId)
        ? groupDefaultEventTypeId
        : '',
    [eventTypeOptions, groupDefaultEventTypeId]
  );

  const renderGroupIcon = (group: ToolGroup) => {
    if (group.icon && /^https?:\/\//.test(group.icon)) {
      return <img src={group.icon} alt={group.title} />;
    }
    return <span>{group.title.charAt(0).toUpperCase()}</span>;
  };

  const getProviderLabel = (provider: string) => {
    const g = catalog.find(g => g.provider === provider);
    if (g?.title) return g.title;
    // oauth mcp-proxy servers connect by slug (e.g. 'notion'); show their name.
    const server = mcpServers.find(s => s.slug === provider);
    return server?.name || provider;
  };

  const handleConnectGroup = async (group: ToolGroup) => {
    if (!group.provider || connectingProvider) return;
    setConnectingProvider(group.provider);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(EXPANDED_GROUP_KEY, group.id);
    }
    try {
      const data = await utils.fetcher({
        url: `/oauth/${group.provider}/authorize?organizationId=${organizationId}&projectId=${projectId}`,
        config: { credentials: 'include' }
      });
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
    } catch {
      // fall through
    }
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(EXPANDED_GROUP_KEY);
    }
    setConnectingProvider(null);
  };

  const getMissingScopes = (
    def: ToolDefinition,
    provider: string | null
  ): string[] => {
    if (!provider || !def.requiredScopes) return [];
    const required = def.requiredScopes
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (required.length === 0) return [];
    const creds = credentialByProvider.get(provider) || [];
    const granted = new Set<string>();
    for (const c of creds) {
      if (!c.scopes) continue;
      for (const s of c.scopes.split(/[\s,]+/)) {
        const v = s.trim();
        if (v) granted.add(v);
      }
    }
    return required.filter(s => !granted.has(s));
  };

  const handleReauthorize = async (provider: string, scopes: string[]) => {
    if (connectingProvider) return;
    setConnectingProvider(provider);
    try {
      const data = await utils.fetcher({
        url: `/oauth/${provider}/authorize?organizationId=${organizationId}&projectId=${projectId}&scopes=${encodeURIComponent(scopes.join(','))}`,
        config: { credentials: 'include' }
      });
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
    } catch {
      // fall through
    }
    setConnectingProvider(null);
  };

  // Group-level settings are backed by per-tool config: merge the patch into
  // every installed tool in the group so they all resolve to the same defaults.
  const saveGroupToolConfig = async (
    patch: Record<string, unknown>,
    successMessage: string
  ) => {
    if (savingCalendar) return;
    const targets = expandedGroupInstalledTools;
    if (targets.length === 0) return;
    setSavingCalendar(true);
    try {
      await Promise.all(
        targets.map(t =>
          utils.fetcher({
            url: `${toolApiBase}/${t.id}`,
            config: {
              method: 'PUT',
              credentials: 'include',
              body: JSON.stringify({
                config: { ...(t.config || {}), ...patch }
              })
            }
          })
        )
      );
      snackbar.success(successMessage);
      await fetchAll();
    } catch {
      snackbar.error('Failed to update settings');
    } finally {
      setSavingCalendar(false);
    }
  };

  // API-key providers (e.g. Cal.com) have no OAuth flow — the key is POSTed and
  // stored as a credential, then read by the tool handler like any other.
  const handleAddApiKey = async () => {
    if (!apiKeyGroup?.provider || apiKeySubmitting) return;
    const key = apiKeyValue.trim();
    if (!key) return;
    setApiKeySubmitting(true);
    try {
      const data = await utils.fetcher({
        url: credentialApiBase,
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ provider: apiKeyGroup.provider, apiKey: key })
        }
      });
      if (data && data.error) {
        snackbar.error(data.error);
      } else {
        snackbar.success('API key saved');
        setApiKeyGroup(null);
        setApiKeyValue('');
        await fetchAll();
      }
    } catch {
      snackbar.error('Failed to save API key');
    } finally {
      setApiKeySubmitting(false);
    }
  };

  const handleToggleTool = async (def: ToolDefinition, enabled: boolean) => {
    if (togglingDefId) return;
    const existing = installedByDefId.get(def.id);
    if (enabled && !existing) {
      const provider = expandedGroup?.provider || null;
      const missing = getMissingScopes(def, provider);
      if (missing.length > 0 && provider && expandedGroup) {
        setScopeAlert({ group: expandedGroup, def, missing });
        return;
      }
    }
    setTogglingDefId(def.id);
    try {
      let data: { error?: string } | undefined;
      if (enabled && !existing) {
        // A new tool inherits the group's already-chosen defaults so every tool
        // in the group stays pointed at the same calendar / event type / zone.
        const inheritedConfig: Record<string, unknown> = {};
        if (isCalendarGroup) {
          if (groupDefaultCalendarId) {
            inheritedConfig.defaultCalendarId = groupDefaultCalendarId;
          }
          if (groupDefaultTimeZone) {
            inheritedConfig.defaultTimeZone = groupDefaultTimeZone;
          }
          if (groupSendUpdates && groupSendUpdates !== 'all') {
            inheritedConfig.sendUpdates = groupSendUpdates;
          }
        }
        if (isCalcomGroup) {
          if (groupDefaultEventTypeId) {
            inheritedConfig.defaultEventTypeId = Number(
              groupDefaultEventTypeId
            );
          }
          if (groupDefaultTimeZone) {
            inheritedConfig.defaultTimeZone = groupDefaultTimeZone;
          }
        }
        data = await utils.fetcher({
          url: toolApiBase,
          config: {
            method: 'POST',
            credentials: 'include',
            body: JSON.stringify({
              toolDefinitionId: def.id,
              config: inheritedConfig
            })
          }
        });
      } else if (!enabled && existing) {
        data = await utils.fetcher({
          url: `${toolApiBase}/${existing.id}`,
          config: { method: 'DELETE', credentials: 'include' }
        });
      }
      if (data && data.error) {
        snackbar.error(data.error);
      } else {
        snackbar.success(enabled ? 'Tool enabled' : 'Tool disabled');
      }
      await fetchAll();
    } catch {
      snackbar.error('Failed to update tool');
    } finally {
      setTogglingDefId(null);
    }
  };

  const openEditor = (tool: ArtifactTool) => {
    setConfigJson(JSON.stringify(tool.config || {}, null, 2));
    setConfigForm({ ...(tool.config || {}) });
    setConfigError(null);
    setEditTool(tool);
  };

  const handleEdit = (tool: ArtifactTool) => {
    if (
      tool.toolDefinition?.key ===
      utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT
    ) {
      setHttpEndpointEditor({ tool });
      return;
    }
    if (
      tool.toolDefinition?.key === utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY
    ) {
      const serverId =
        tool.mcpServerCatalogId ||
        (tool.config?.curatedServerId as string | undefined);
      const server = mcpServers.find(s => s.id === serverId);
      if (server) setMcpProxyEditor({ server, existingTool: tool });
      return;
    }
    openEditor(tool);
  };

  const handleCloseEdit = () => {
    setEditTool(null);
    setConfigError(null);
  };

  // Coerce the typed calendar form back into a config patch, dropping blanks so
  // the stored config stays lean.
  const buildCalendarConfigPatch = (
    fields: CalendarConfigField[]
  ): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = configForm[field.key];
      if (field.type === 'number') {
        const n =
          typeof raw === 'number'
            ? raw
            : typeof raw === 'string' && raw.trim()
              ? Number(raw)
              : NaN;
        if (Number.isFinite(n)) patch[field.key] = n;
      } else if (field.type === 'boolean') {
        if (raw === true) patch[field.key] = true;
      } else if (field.type === 'weekdays') {
        const arr = Array.isArray(raw)
          ? (raw as unknown[])
              .map(Number)
              .filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
          : [];
        if (arr.length > 0) patch[field.key] = arr;
      } else if (field.type === 'select') {
        const v = typeof raw === 'string' ? raw : '';
        if (v && v !== 'default') patch[field.key] = v;
      } else {
        const v = typeof raw === 'string' ? raw.trim() : '';
        if (v) patch[field.key] = v;
      }
    }
    return patch;
  };

  const setConfigField = (key: string, value: unknown) =>
    setConfigForm(prev => ({ ...prev, [key]: value }));

  const renderCalendarField = (field: CalendarConfigField) => {
    const value = configForm[field.key];

    if (field.type === 'boolean') {
      return (
        <div
          key={field.key}
          className="tools-config-field tools-config-field-row"
        >
          <div>
            <p className="tools-config-field-label">{field.label}</p>
            {field.help && (
              <p className="tools-config-field-help">{field.help}</p>
            )}
          </div>
          <Switch
            checked={value === true}
            disabled={submitting}
            onChange={e => setConfigField(field.key, e.target.checked)}
          />
        </div>
      );
    }

    if (field.type === 'select') {
      return (
        <div key={field.key} className="tools-config-field">
          <UI.Select
            label={field.label}
            value={
              typeof value === 'string' && value
                ? value
                : field.options[0]?.value || ''
            }
            options={field.options}
            disabled={submitting}
            helperText={field.help}
            onChange={e => setConfigField(field.key, e.target.value)}
          />
        </div>
      );
    }

    if (field.type === 'weekdays') {
      const selected = Array.isArray(value)
        ? (value as unknown[]).map(Number)
        : [];
      return (
        <div key={field.key} className="tools-config-field">
          <p className="tools-config-field-label">{field.label}</p>
          <div className="tools-config-weekdays">
            {WEEKDAYS.map(day => {
              const active = selected.includes(day.value);
              return (
                <button
                  type="button"
                  key={day.value}
                  className={`tools-config-weekday ${active ? 'active' : ''}`}
                  disabled={submitting}
                  onClick={() => {
                    const next = active
                      ? selected.filter(d => d !== day.value)
                      : [...selected, day.value];
                    setConfigField(field.key, next);
                  }}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div key={field.key} className="tools-config-field">
        <UI.Input
          label={field.label}
          type={field.type === 'number' ? 'number' : 'text'}
          value={value === undefined || value === null ? '' : String(value)}
          disabled={submitting}
          helperText={field.help}
          onChange={e => setConfigField(field.key, e.target.value)}
        />
      </div>
    );
  };

  const parseConfig = (): Record<string, unknown> | null => {
    const trimmed = configJson.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        setConfigError('Config must be a JSON object');
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      setConfigError('Invalid JSON');
      return null;
    }
  };

  const handleUpdateSubmit = async () => {
    if (!editTool || submitting) return;

    const editKey = editTool.toolDefinition?.key;
    const editFields = editKey
      ? utils.constants.CALENDAR_TOOL_FIELDS[editKey]
      : undefined;

    let config: Record<string, unknown> | null;
    if (editFields) {
      // Preserve group-level keys (defaultCalendarId / defaultTimeZone /
      // sendUpdates) and cleanly replace this tool's own per-tool keys.
      const base = { ...(editTool.config || {}) };
      for (const field of editFields) delete base[field.key];
      config = { ...base, ...buildCalendarConfigPatch(editFields) };
    } else {
      config = parseConfig();
    }
    if (!config) return;

    setSubmitting(true);
    try {
      const data = await utils.fetcher({
        url: `${toolApiBase}/${editTool.id}`,
        config: {
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify({ config })
        }
      });
      if (data && !data.error) {
        handleCloseEdit();
        fetchAll();
        snackbar.success('Tool updated');
      } else {
        snackbar.error(data?.error || 'Failed to update tool');
      }
    } catch {
      snackbar.error('Failed to update tool');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveConfirm = async () => {
    if (!removeAlert || submitting) return;
    setSubmitting(true);
    try {
      const data = await utils.fetcher({
        url: `${toolApiBase}/${removeAlert.id}`,
        config: { method: 'DELETE', credentials: 'include' }
      });
      if (data && !data.error) {
        setRemoveAlert(null);
        fetchAll();
        snackbar.success('Tool removed');
      } else {
        snackbar.error(data?.error || 'Failed to remove tool');
      }
    } catch {
      snackbar.error('Failed to remove tool');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisconnectConfirm = async () => {
    if (!disconnectAlert || submitting) return;
    const creds = credentialByProvider.get(disconnectAlert.provider) || [];
    setSubmitting(true);
    try {
      await Promise.all(
        creds.map(c =>
          utils.fetcher({
            url: `${credentialApiBase}/${c.id}`,
            config: { method: 'DELETE', credentials: 'include' }
          })
        )
      );
      setDisconnectAlert(null);
      fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  const isGroupConnected = (group: ToolGroup) =>
    !group.provider || credentialByProvider.has(group.provider);

  const isProviderExpired = (provider: string | null) => {
    if (!provider) return false;
    const creds = credentialByProvider.get(provider) || [];
    if (creds.length === 0) return false;
    return creds.every(
      c =>
        c.metadata?.needsReauth === true ||
        (!c.hasRefreshToken &&
          c.expiresAt &&
          new Date(c.expiresAt) < new Date())
    );
  };

  return (
    <Wrapper>
      <div className="tools-container">
        <div className="tools-header">
          <div className="tools-header-text">
            <h1 className="tools-title">Tools</h1>
            <p className="tools-subtitle">
              Connect integrations and choose which tools this MCP server
              exposes.
            </p>
          </div>
        </div>
        {connectedBanner && (
          <div className="tools-banner tools-banner-success">
            <CheckCircle />
            <span>
              Connected <strong>{getProviderLabel(connectedBanner)}</strong>.
              Toggle the tools you want to enable below.
            </span>
            <IconButton size="small" onClick={() => setConnectedBanner(null)}>
              <Close />
            </IconButton>
          </div>
        )}
        <div className="tools-tabs">
          <button
            type="button"
            className={`tools-tab ${tab === 'installed' ? 'active' : ''}`}
            onClick={() => setTab('installed')}
          >
            Installed
            <span className="tools-tab-count">{installed.length}</span>
          </button>
          <button
            type="button"
            className={`tools-tab ${tab === 'catalog' ? 'active' : ''}`}
            onClick={() => setTab('catalog')}
          >
            Catalog
          </button>
        </div>
        {tab === 'installed' && (
          <div className="tools-installed">
            {status === 'pending' && installed.length === 0 && (
              <div className="tools-installed-skeleton">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="tools-accordion">
                    <div className="tools-accordion-header">
                      <div className="tools-accordion-header-info">
                        <UI.Skeleton variant="rounded" width={44} height={44} />
                        <div className="tools-accordion-header-texts">
                          <UI.Skeleton variant="text" width={140} height={18} />
                          <UI.Skeleton variant="text" width={80} height={12} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {status === 'resolved' && installed.length === 0 && (
              <div className="tools-empty-state">
                <ExtensionOutlined />
                <h3>No tools installed</h3>
                <p>Browse the catalog to add tools to this project.</p>
                <UI.Button
                  variant="contained"
                  size="small"
                  onClick={() => setTab('catalog')}
                >
                  <span className="button-text">Browse catalog</span>
                </UI.Button>
              </div>
            )}
            {Array.from(installedByBucket.entries()).map(
              ([bucketKey, tools]) => {
                const group = tools[0]?.toolDefinition?.group;
                const provider = group?.provider || null;
                const creds = provider
                  ? credentialByProvider.get(provider) || []
                  : [];
                const groupTitle = group?.title || 'Other';
                const expired = isProviderExpired(provider);
                const isExpanded = expandedInstalled.has(bucketKey);

                return (
                  <div
                    key={bucketKey}
                    className={`tools-accordion ${isExpanded ? 'expanded' : ''}`}
                  >
                    <button
                      type="button"
                      className="tools-accordion-header"
                      onClick={() => toggleInstalledProvider(bucketKey)}
                      aria-expanded={isExpanded}
                    >
                      <div className="tools-accordion-header-info">
                        <div className="tools-group-icon">
                          {group
                            ? renderGroupIcon(group)
                            : groupTitle.charAt(0)}
                        </div>
                        <div className="tools-accordion-header-texts">
                          <p className="tools-group-title">{groupTitle}</p>
                          <p className="tools-group-meta">
                            {tools.length} tool{tools.length === 1 ? '' : 's'}
                            {creds.length > 0 &&
                              ` · ${creds.length} credential${creds.length === 1 ? '' : 's'} connected`}
                          </p>
                        </div>
                        <span className="tools-accordion-chevron-wrap inline">
                          <ExpandMore className="tools-accordion-chevron" />
                        </span>
                      </div>
                      {provider && (
                        <div className="tools-accordion-header-actions">
                          {creds.length > 0 && (
                            <UI.Button
                              size="small"
                              onClick={e => {
                                e.stopPropagation();
                                setDisconnectAlert({
                                  provider,
                                  affected: tools.length
                                });
                              }}
                            >
                              <LinkOff />
                              <span className="button-text">Disconnect</span>
                            </UI.Button>
                          )}
                        </div>
                      )}
                    </button>
                    {isExpanded && (
                      <div className="tools-accordion-body">
                        {expired && (
                          <div className="tools-banner tools-banner-warning">
                            <Warning />
                            <span>
                              Credential expired. Reconnect to keep these tools
                              working.
                            </span>
                          </div>
                        )}
                        <div className="tools-installed-list">
                          {tools.map(t => {
                            const def = t.toolDefinition;
                            const isHttpEndpoint =
                              def?.key ===
                              utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT;
                            const isMcpProxy =
                              def?.key ===
                              utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY;
                            const mcpServerName = isMcpProxy
                              ? mcpServers.find(
                                  s =>
                                    s.id ===
                                    (t.mcpServerCatalogId ||
                                      (t.config?.curatedServerId as
                                        string | undefined))
                                )?.name
                              : undefined;
                            const configKeys = t.config
                              ? Object.keys(t.config).length
                              : 0;
                            return (
                              <div key={t.id} className="tools-installed-item">
                                <div className="tools-installed-item-main">
                                  <p className="tools-installed-item-title">
                                    {isHttpEndpoint
                                      ? (t.config?.name as string) ||
                                        'HTTP endpoint'
                                      : isMcpProxy
                                        ? mcpServerName || 'MCP server'
                                        : def?.title || t.toolDefinitionId}
                                  </p>
                                  {def?.description && (
                                    <p className="tools-installed-item-description">
                                      {def.description}
                                    </p>
                                  )}
                                  <p className="tools-installed-item-meta">
                                    {configKeys > 0
                                      ? `${configKeys} config field${configKeys > 1 ? 's' : ''}`
                                      : 'No custom config'}
                                  </p>
                                </div>
                                <div className="tools-installed-item-actions">
                                  <Tooltip title="Edit config">
                                    <IconButton
                                      size="small"
                                      onClick={() => handleEdit(t)}
                                    >
                                      <EditOutlined />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Remove">
                                    <IconButton
                                      size="small"
                                      onClick={() => setRemoveAlert(t)}
                                    >
                                      <DeleteOutlined />
                                    </IconButton>
                                  </Tooltip>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>
        )}
        {tab === 'catalog' && !expandedGroup && (
          <div className="tools-catalog">
            <div className="tools-catalog-controls">
              <div className="tools-search">
                <Search />
                <input
                  type="text"
                  placeholder="Search integrations..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            {status === 'pending' && catalog.length === 0 && (
              <div className="tools-catalog-groups">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="tools-catalog-group-card-skeleton">
                    <UI.Skeleton variant="rounded" width={44} height={44} />
                    <div className="tools-catalog-group-card-skeleton-body">
                      <UI.Skeleton variant="text" width="55%" height={18} />
                      <UI.Skeleton variant="text" width="90%" height={14} />
                      <UI.Skeleton variant="text" width="70%" height={14} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {filteredCatalog.length === 0 &&
              filteredMcpServers.length === 0 &&
              status === 'resolved' && (
                <p className="tools-empty">
                  No integrations match your search.
                </p>
              )}
            <div className="tools-catalog-groups">
              {filteredCatalog.map(group => {
                const installedCount = group.toolDefinitions.filter(d =>
                  installedByDefId.has(d.id)
                ).length;
                const connected = isGroupConnected(group);
                const expired = isProviderExpired(group.provider);
                return (
                  <button
                    type="button"
                    key={group.id}
                    className="tools-catalog-group-card"
                    onClick={() => setExpandedGroupId(group.id)}
                  >
                    <div className="tools-catalog-group-icon">
                      {renderGroupIcon(group)}
                    </div>
                    <div className="tools-catalog-group-body">
                      <div className="tools-catalog-group-title-row">
                        <p className="tools-catalog-group-title">
                          {group.title}
                        </p>
                        {connected &&
                          group.provider &&
                          (expired ? (
                            <span className="tools-catalog-group-expired">
                              <Warning />
                              Expired
                            </span>
                          ) : (
                            <span className="tools-catalog-group-connected">
                              <CheckCircle />
                              Connected
                            </span>
                          ))}
                      </div>
                      {group.description && (
                        <p className="tools-catalog-group-description">
                          {group.description}
                        </p>
                      )}
                      <p className="tools-catalog-group-meta">
                        {installedCount}/{group.toolDefinitions.length} tools
                        enabled
                      </p>
                    </div>
                  </button>
                );
              })}
              {filteredMcpServers.map(s => {
                const install = installedByServerId.get(s.id);
                const enabledCount = install
                  ? (() => {
                      const allow = install.config?.allowedTools;
                      if (Array.isArray(allow)) return allow.length;
                      const disc = install.metadata as {
                        discovery?: { tools?: unknown[] };
                      } | null;
                      return disc?.discovery?.tools?.length || 0;
                    })()
                  : 0;
                return (
                  <button
                    type="button"
                    key={`mcp-${s.id}`}
                    className="tools-catalog-group-card"
                    onClick={() =>
                      setMcpProxyEditor({
                        server: s,
                        existingTool: install || null
                      })
                    }
                  >
                    <div className="tools-catalog-group-icon">
                      {s.icon && /^https?:\/\//.test(s.icon) ? (
                        <img src={s.icon} alt={s.name} />
                      ) : (
                        <span>{s.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="tools-catalog-group-body">
                      <div className="tools-catalog-group-title-row">
                        <p className="tools-catalog-group-title">{s.name}</p>
                        {install && (
                          <span className="tools-catalog-group-connected">
                            <CheckCircle />
                            Connected
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <p className="tools-catalog-group-description">
                          {s.description}
                        </p>
                      )}
                      <p className="tools-catalog-group-meta">
                        {install
                          ? `${enabledCount} tool${enabledCount === 1 ? '' : 's'} enabled`
                          : 'Remote MCP server · connect to enable tools'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {tab === 'catalog' && expandedGroup && (
          <div className="tools-group-detail">
            <button
              type="button"
              className="tools-group-detail-back"
              onClick={() => setExpandedGroupId(null)}
            >
              <ArrowBack />
              Back to catalog
            </button>
            <div className="tools-group-detail-header">
              <div className="tools-group-detail-icon">
                {renderGroupIcon(expandedGroup)}
              </div>
              <div className="tools-group-detail-info">
                <p className="tools-group-detail-title">
                  {expandedGroup.title}
                </p>
                {expandedGroup.description && (
                  <p className="tools-group-detail-description">
                    {expandedGroup.description}
                  </p>
                )}
              </div>
              {expandedGroup.provider && (
                <div className="tools-group-detail-actions">
                  {isGroupConnected(expandedGroup) ? (
                    <>
                      {isProviderExpired(expandedGroup.provider) ? (
                        <span className="tools-group-detail-expired-pill">
                          <Warning />
                          Expired
                        </span>
                      ) : (
                        <span className="tools-group-detail-connected-pill">
                          <CheckCircle />
                          Connected
                        </span>
                      )}
                      {isApiKeyProvider(expandedGroup.provider) && (
                        <UI.Button
                          size="small"
                          onClick={() => {
                            setApiKeyGroup(expandedGroup);
                            setApiKeyValue('');
                          }}
                        >
                          <span className="button-text">Update API key</span>
                        </UI.Button>
                      )}
                      <UI.Button
                        size="small"
                        onClick={() =>
                          setDisconnectAlert({
                            provider: expandedGroup.provider!,
                            affected: expandedGroup.toolDefinitions.filter(d =>
                              installedByDefId.has(d.id)
                            ).length
                          })
                        }
                      >
                        <LinkOff />
                        <span className="button-text">Disconnect</span>
                      </UI.Button>
                    </>
                  ) : isApiKeyProvider(expandedGroup.provider) ? (
                    <UI.Button
                      variant="contained"
                      size="small"
                      onClick={() => {
                        setApiKeyGroup(expandedGroup);
                        setApiKeyValue('');
                      }}
                    >
                      <LinkIcon />
                      <span className="button-text">
                        Add {expandedGroup.title} API key
                      </span>
                    </UI.Button>
                  ) : (
                    <UI.Button
                      variant="contained"
                      size="small"
                      disabled={connectingProvider === expandedGroup.provider}
                      onClick={() => handleConnectGroup(expandedGroup)}
                    >
                      <LinkIcon />
                      <span className="button-text">
                        {connectingProvider === expandedGroup.provider
                          ? 'Redirecting...'
                          : `Connect ${expandedGroup.title}`}
                      </span>
                    </UI.Button>
                  )}
                </div>
              )}
            </div>
            {!isGroupConnected(expandedGroup) && expandedGroup.provider && (
              <div className="tools-banner tools-banner-warning">
                <Warning />
                <span>
                  Connect {expandedGroup.title} to enable these tools. You only
                  need to connect once for the whole integration.
                </span>
              </div>
            )}
            {isCalendarGroup && isGroupConnected(expandedGroup) && (
              <div className="tools-group-detail-config">
                {expandedGroupInstalledTools.length === 0 ? (
                  <p className="tools-group-detail-config-hint">
                    Enable a calendar tool below to set the default calendar,
                    time zone, and notifications for this integration.
                  </p>
                ) : (
                  <>
                    <UI.Select
                      label="Default calendar"
                      value={selectedCalendarValue}
                      options={calendarOptions}
                      disabled={
                        calendarStatus === 'pending' ||
                        savingCalendar ||
                        calendarOptions.length === 0
                      }
                      error={calendarStatus === 'rejected'}
                      helperText={
                        calendarStatus === 'rejected'
                          ? 'Could not load calendars. Reconnect Google Calendar and try again.'
                          : calendarStatus === 'pending'
                            ? 'Loading calendars…'
                            : 'Events and free/busy lookups use this calendar unless a tool call overrides it.'
                      }
                      onChange={e =>
                        saveGroupToolConfig(
                          { defaultCalendarId: e.target.value },
                          'Default calendar updated'
                        )
                      }
                    />
                    <UI.Select
                      label="Default time zone"
                      value={selectedTimeZone}
                      options={timeZoneOptions}
                      disabled={savingCalendar || timeZoneOptions.length === 0}
                      helperText="Interprets event times and the working hours used by Find Free Slots."
                      onChange={e =>
                        saveGroupToolConfig(
                          { defaultTimeZone: e.target.value },
                          'Default time zone updated'
                        )
                      }
                    />
                    <UI.Select
                      label="Attendee notifications"
                      value={groupSendUpdates}
                      options={SEND_UPDATES_OPTIONS}
                      disabled={savingCalendar}
                      helperText="Whether Google emails guests when events are created, changed, or cancelled."
                      onChange={e =>
                        saveGroupToolConfig(
                          { sendUpdates: e.target.value },
                          'Notification setting updated'
                        )
                      }
                    />
                  </>
                )}
              </div>
            )}
            {isCalcomGroup && isGroupConnected(expandedGroup) && (
              <div className="tools-group-detail-config">
                {expandedGroupInstalledTools.length === 0 ? (
                  <p className="tools-group-detail-config-hint">
                    Enable a Cal.com tool below to set the default event type
                    and time zone for this integration.
                  </p>
                ) : (
                  <>
                    <UI.Select
                      label="Default event type"
                      value={selectedEventTypeId}
                      options={eventTypeOptions}
                      disabled={
                        eventTypesStatus === 'pending' ||
                        savingCalendar ||
                        eventTypeOptions.length === 0
                      }
                      error={eventTypesStatus === 'rejected'}
                      helperText={
                        eventTypesStatus === 'rejected'
                          ? 'Could not load event types. Check the API key and try again.'
                          : eventTypesStatus === 'pending'
                            ? 'Loading event types…'
                            : 'Bookings are created against this event type unless a tool call overrides it.'
                      }
                      onChange={e =>
                        saveGroupToolConfig(
                          { defaultEventTypeId: Number(e.target.value) },
                          'Default event type updated'
                        )
                      }
                    />
                    <UI.Select
                      label="Default time zone"
                      value={selectedTimeZone}
                      options={timeZoneOptions}
                      disabled={savingCalendar || timeZoneOptions.length === 0}
                      helperText="Used for availability lookups and the attendee's booking time zone."
                      onChange={e =>
                        saveGroupToolConfig(
                          { defaultTimeZone: e.target.value },
                          'Default time zone updated'
                        )
                      }
                    />
                  </>
                )}
              </div>
            )}
            {isHttpEndpointGroup(expandedGroup) ? (
              <div className="tools-http-endpoints">
                <div className="tools-http-endpoints-head">
                  <p className="tools-http-endpoints-hint">
                    Each endpoint becomes its own named tool the assistant can
                    call. Add as many as you need.
                  </p>
                  <UI.Button
                    variant="contained"
                    size="small"
                    onClick={() => setHttpEndpointEditor({ tool: null })}
                  >
                    <Add fontSize="small" />
                    <span className="button-text">Add endpoint</span>
                  </UI.Button>
                </div>
                {httpEndpointInstances.length === 0 ? (
                  <p className="tools-empty">
                    No endpoints yet. Add one to expose an HTTP API to the
                    assistant.
                  </p>
                ) : (
                  <div className="tools-http-endpoints-list">
                    {httpEndpointInstances.map(t => {
                      const c = (t.config || {}) as {
                        name?: string;
                        method?: string;
                        url?: string;
                        description?: string;
                      };
                      return (
                        <div key={t.id} className="tools-http-endpoint-item">
                          <div className="tools-http-endpoint-item-main">
                            <p className="tools-http-endpoint-item-title">
                              {c.name || 'Untitled endpoint'}
                            </p>
                            <p className="tools-http-endpoint-item-url">
                              <span className="tools-http-endpoint-method">
                                {c.method || 'GET'}
                              </span>
                              {c.url || ''}
                            </p>
                            {c.description && (
                              <p className="tools-http-endpoint-item-description">
                                {c.description}
                              </p>
                            )}
                          </div>
                          <div className="tools-installed-item-actions">
                            <Tooltip title="Edit">
                              <IconButton
                                size="small"
                                onClick={() =>
                                  setHttpEndpointEditor({ tool: t })
                                }
                              >
                                <EditOutlined />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Remove">
                              <IconButton
                                size="small"
                                onClick={() => setRemoveAlert(t)}
                              >
                                <DeleteOutlined />
                              </IconButton>
                            </Tooltip>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="tools-group-detail-list">
                {expandedGroup.toolDefinitions.map(def => {
                  const isInstalled = installedByDefId.has(def.id);
                  const connected = isGroupConnected(expandedGroup);
                  const disabled =
                    !connected ||
                    (togglingDefId !== null && togglingDefId !== def.id);
                  return (
                    <div
                      key={def.id}
                      className={`tools-group-detail-item ${!connected ? 'disabled' : ''}`}
                    >
                      <div className="tools-group-detail-item-main">
                        <p className="tools-group-detail-item-title">
                          {def.title}
                        </p>
                        {def.description && (
                          <p className="tools-group-detail-item-description">
                            {def.description}
                          </p>
                        )}
                        {def.requiredScopes && (
                          <Tooltip
                            title={`Required scopes: ${def.requiredScopes}`}
                          >
                            <span className="tools-group-detail-item-scopes">
                              Scopes
                            </span>
                          </Tooltip>
                        )}
                      </div>
                      <Switch
                        checked={isInstalled}
                        disabled={disabled}
                        onChange={e => handleToggleTool(def, e.target.checked)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      {editTool && (
        <UI.Portal>
          <ModalOverlay onClick={handleCloseEdit}>
            <ModalDialog role="dialog" onClick={e => e.stopPropagation()}>
              <div className="tools-modal-header">
                <h2 className="tools-modal-title">
                  Configure {editTool.toolDefinition?.title || 'Tool'}
                </h2>
                <IconButton size="small" onClick={handleCloseEdit}>
                  <Close />
                </IconButton>
              </div>
              <div className="tools-modal-body">
                {(() => {
                  const editKey = editTool.toolDefinition?.key;
                  const editFields = editKey
                    ? utils.constants.CALENDAR_TOOL_FIELDS[editKey]
                    : undefined;
                  const editProvider = editTool.toolDefinition?.group?.provider;
                  const editIsGroupManaged =
                    editProvider ===
                      utils.constants.OAUTH_PROVIDER_GOOGLE_CALENDAR ||
                    editProvider === utils.constants.API_KEY_PROVIDER_CALCOM;

                  if (editFields) {
                    return (
                      <div className="tools-config-form">
                        {editFields.map(field => renderCalendarField(field))}
                      </div>
                    );
                  }

                  if (editIsGroupManaged) {
                    return (
                      <p className="tools-configure-help">
                        This tool has no per-tool settings. Its defaults
                        (calendar / event type, time zone, notifications) are
                        managed for the whole integration from the group header
                        on the Catalog page.
                      </p>
                    );
                  }

                  return (
                    <>
                      <p className="tools-configure-help">
                        Optional tool configuration as JSON. Leave as{' '}
                        <code>{'{}'}</code> if none is needed.
                      </p>
                      <UI.Input
                        label="Config (JSON)"
                        multiline
                        rows={8}
                        value={configJson}
                        disabled={submitting}
                        error={!!configError}
                        helperText={
                          configError ||
                          'e.g. {"label": "inbox", "maxResults": 20}'
                        }
                        onChange={e => {
                          setConfigJson(e.target.value);
                          if (configError) setConfigError(null);
                        }}
                      />
                    </>
                  );
                })()}
              </div>
              <div className="tools-modal-actions">
                <UI.Button
                  size="small"
                  disabled={submitting}
                  onClick={handleCloseEdit}
                >
                  Cancel
                </UI.Button>
                <UI.Button
                  variant="contained"
                  size="small"
                  disabled={submitting}
                  onClick={handleUpdateSubmit}
                >
                  {submitting ? 'Saving...' : 'Save'}
                </UI.Button>
              </div>
            </ModalDialog>
          </ModalOverlay>
        </UI.Portal>
      )}
      {apiKeyGroup && (
        <UI.Portal>
          <ModalOverlay
            onClick={() => {
              if (!apiKeySubmitting) setApiKeyGroup(null);
            }}
          >
            <ModalDialog role="dialog" onClick={e => e.stopPropagation()}>
              <div className="tools-modal-header">
                <h2 className="tools-modal-title">
                  Connect {apiKeyGroup.title}
                </h2>
                <IconButton
                  size="small"
                  onClick={() => setApiKeyGroup(null)}
                  disabled={apiKeySubmitting}
                >
                  <Close />
                </IconButton>
              </div>
              <div className="tools-modal-body">
                <p className="tools-configure-help">
                  Paste your {apiKeyGroup.title} API key. It is encrypted at
                  rest and never shown again.
                </p>
                <UI.Input
                  label="API key"
                  type="password"
                  value={apiKeyValue}
                  disabled={apiKeySubmitting}
                  autoFocus
                  onChange={e => setApiKeyValue(e.target.value)}
                />
              </div>
              <div className="tools-modal-actions">
                <UI.Button
                  size="small"
                  disabled={apiKeySubmitting}
                  onClick={() => setApiKeyGroup(null)}
                >
                  Cancel
                </UI.Button>
                <UI.Button
                  variant="contained"
                  size="small"
                  disabled={apiKeySubmitting || !apiKeyValue.trim()}
                  onClick={handleAddApiKey}
                >
                  {apiKeySubmitting ? 'Saving...' : 'Save'}
                </UI.Button>
              </div>
            </ModalDialog>
          </ModalOverlay>
        </UI.Portal>
      )}
      {httpEndpointEditor && httpEndpointDef && (
        <HttpEndpointModal
          tool={httpEndpointEditor.tool}
          toolDefinitionId={httpEndpointDef.id}
          credentials={credentials}
          connections={connections}
          toolApiBase={toolApiBase}
          credentialApiBase={credentialApiBase}
          getProviderLabel={getProviderLabel}
          snackbar={snackbar}
          onClose={() => setHttpEndpointEditor(null)}
          onSaved={fetchAll}
        />
      )}
      {mcpProxyEditor && mcpProxyDef && (
        <McpProxyModal
          server={mcpProxyEditor.server}
          toolDefinitionId={mcpProxyDef.id}
          existingTool={mcpProxyEditor.existingTool}
          apiBase={apiBase}
          toolApiBase={toolApiBase}
          credentialApiBase={credentialApiBase}
          snackbar={snackbar}
          onClose={() => setMcpProxyEditor(null)}
          onSaved={fetchAll}
        />
      )}
      <UI.Alert
        open={!!removeAlert}
        title="Remove tool"
        description={`Remove "${removeAlert?.toolDefinition?.title || 'this tool'}" from the server? You can add it back anytime from the catalog.`}
        confirmText="Remove"
        cancelText="Cancel"
        loading={submitting}
        onConfirm={handleRemoveConfirm}
        onCancel={() => setRemoveAlert(null)}
      />
      <UI.Alert
        open={!!disconnectAlert}
        title={`Disconnect ${disconnectAlert ? getProviderLabel(disconnectAlert.provider) : ''}?`}
        description={`Are you sure? This revokes stored credentials for ${disconnectAlert ? getProviderLabel(disconnectAlert.provider) : 'this provider'}. ${disconnectAlert?.affected || 0} enabled tool${(disconnectAlert?.affected || 0) === 1 ? '' : 's'} will stop working immediately and any request from the MCP server to this provider will fail until you reconnect. Your installed tools stay listed so you can resume after reconnecting.`}
        confirmText="Disconnect"
        cancelText="Cancel"
        loading={submitting}
        onConfirm={handleDisconnectConfirm}
        onCancel={() => setDisconnectAlert(null)}
      />
      <UI.Alert
        open={!!scopeAlert}
        title={`Additional permissions required`}
        description={
          scopeAlert
            ? `Enabling "${scopeAlert.def.title}" needs permissions you haven't granted to ${scopeAlert.group.title} yet: ${scopeAlert.missing.join(', ')}. We'll send you back to ${scopeAlert.group.title} to approve them — your existing connection stays in place and the new scopes are added on top.`
            : ''
        }
        confirmText="Grant permissions"
        cancelText="Cancel"
        loading={connectingProvider === scopeAlert?.group.provider}
        onConfirm={() => {
          if (!scopeAlert?.group.provider) return;
          const existing = (
            credentialByProvider.get(scopeAlert.group.provider) || []
          )
            .flatMap(c => (c.scopes ? c.scopes.split(/[\s,]+/) : []))
            .map(s => s.trim())
            .filter(Boolean);
          const merged = Array.from(
            new Set([...existing, ...scopeAlert.missing])
          );
          const provider = scopeAlert.group.provider;
          setScopeAlert(null);
          handleReauthorize(provider, merged);
        }}
        onCancel={() => setScopeAlert(null)}
      />
    </Wrapper>
  );
};
