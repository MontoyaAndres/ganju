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
  ArrowBack,
  Add,
  LockOutlined,
  ApiOutlined
} from '@mui/icons-material';

import { FunctionsPanel } from './FunctionsPanel';
import { ToolRowsSkeleton } from './Skeletons';
import { HttpEndpointModal } from './HttpEndpointModal';
import { McpProxyModal } from './McpProxyModal';
import { ModalDialog, ModalOverlay, Wrapper } from './styles';
import { i18n } from '../../../lib';

// types
import type { CustomCodeVersion } from './FunctionsPanel';
import type { Plan } from '../../../utils';
import type { Translate } from '../../../lib';

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
  key: string;
  title: string;
  description: string | null;
  requiredScopes: string | null;
}

interface ToolGroup {
  key: string;
  title: string;
  description: string | null;
  icon: string | null;
  provider: string | null;
  tools: ToolDefinition[];
}

interface ArtifactTool {
  id: string;
  config: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  toolKey: string;
  // Off keeps the row and its config; only delete removes it. So a tool can be
  // present here and not exposed on the server.
  enabled: boolean;
  mcpServerCatalogId?: string | null;
  artifactId: string;
  createdAt: string;
  updatedAt: string;
  toolDefinition?: (ToolDefinition & { group: ToolGroup }) | null;
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
  // One table, two shapes. An OAuth credential carries the re-auth flags; a
  // per-tool secret (http-endpoint, mcp-proxy, custom-code) carries the label it
  // is looked up by — which for custom-code is the name a script passes to
  // `ctx.secret()`, not just something to show in a list.
  metadata?: {
    needsReauth?: boolean;
    reauthReason?: string;
    label?: string;
  } | null;
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

const EXPANDED_GROUP_KEY = 'ganju:expandedToolGroupKey';

type ToolsT = Translate<(typeof i18n.copy.TOOLS)['en']>;

/**
 * The option lists whose labels are words. Values are what gets stored and are
 * fixed; only the labels are read, so they are built from the translator rather
 * than frozen at module scope.
 */
const sendUpdatesOptions = (t: ToolsT) => [
  { value: utils.constants.CALENDAR_SEND_UPDATES_ALL, label: t('notifyAll') },
  {
    value: utils.constants.CALENDAR_SEND_UPDATES_EXTERNAL_ONLY,
    label: t('notifyExternal')
  },
  { value: utils.constants.CALENDAR_SEND_UPDATES_NONE, label: t('notifyNone') }
];

// Monday first, because that is where the working week starts in both locales
// this ships. Sunday is 0 in `Date`, which is why it is last rather than sorted.
const weekdays = (t: ToolsT): { value: number; label: string }[] => [
  { value: 1, label: t('weekdayMon') },
  { value: 2, label: t('weekdayTue') },
  { value: 3, label: t('weekdayWed') },
  { value: 4, label: t('weekdayThu') },
  { value: 5, label: t('weekdayFri') },
  { value: 6, label: t('weekdaySat') },
  { value: 0, label: t('weekdaySun') }
];

// The three things a user can put on their MCP server, in the order they matter
// to the product: code they wrote, HTTP endpoints they pointed at, and the
// integrations we ship.
const TAB_FUNCTIONS = 'functions' as const;
const TAB_HTTP = 'http' as const;
const TAB_CATALOG = 'catalog' as const;
type ToolsTab = typeof TAB_FUNCTIONS | typeof TAB_HTTP | typeof TAB_CATALOG;

interface CustomCodeState {
  activeVersionId: string | null;
  versions: CustomCodeVersion[];
}

const FILTER_ALL = 'all' as const;
const FILTER_ON = 'on' as const;
const FILTER_OFF = 'off' as const;
const FILTER_NEEDS_CONNECTION = 'needs-connection' as const;
type CatalogFilter =
  | typeof FILTER_ALL
  | typeof FILTER_ON
  | typeof FILTER_OFF
  | typeof FILTER_NEEDS_CONNECTION;

const catalogFilters = (
  t: ToolsT
): { value: CatalogFilter; label: string }[] => [
  { value: FILTER_ALL, label: t('filterAll') },
  { value: FILTER_ON, label: t('filterOn') },
  { value: FILTER_OFF, label: t('filterOff') },
  { value: FILTER_NEEDS_CONNECTION, label: t('filterNeedsConnection') }
];

// Which tab holds a given install. The three kinds of tool now live in three
// places, so anything that deep-links to one row has to answer this first.
const tabForToolKey = (toolKey: string): ToolsTab => {
  if (toolKey === utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE) {
    return TAB_FUNCTIONS;
  }
  if (toolKey === utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT) {
    return TAB_HTTP;
  }
  return TAB_CATALOG;
};

interface ToolsProps {
  // Resolved server-side and handed down, so the tab this opens on is right in
  // the first render rather than corrected after a request comes back.
  plan: Plan | null;
}

export const Tools = ({ plan }: ToolsProps) => {
  const router = useRouter();
  const t = i18n.useT(i18n.copy.TOOLS);
  const c = i18n.useT(i18n.copy.COMMON);
  const snackbar = UI.Alert.useSnackbar();

  /**
   * The shipped catalog reads in the reader's language.
   *
   * Group and tool names arrive in the `/catalog/tools` payload in English —
   * that is where they are declared, and the API has no locale — so they are
   * translated here, by key, falling back to exactly what the payload sent. A
   * tool added to the platform since this file was last touched therefore
   * renders under its real English name rather than a missing-key placeholder.
   */
  const groupTitle = (group: { key: string; title: string }) =>
    i18n.catalogCopy(t.lang, `group.${group.key}.title`, group.title) ||
    group.title;
  const groupDescription = (group: {
    key: string;
    description: string | null;
  }) =>
    i18n.catalogCopy(
      t.lang,
      `group.${group.key}.description`,
      group.description
    );
  const toolTitle = (def: { key: string; title: string }) =>
    i18n.catalogCopy(t.lang, `tool.${def.key}.title`, def.title) || def.title;
  const toolDescription = (def: { key: string; description: string | null }) =>
    i18n.catalogCopy(t.lang, `tool.${def.key}.description`, def.description);

  const sendUpdates = useMemo(() => sendUpdatesOptions(t), [t]);
  const weekdayOptions = useMemo(() => weekdays(t), [t]);
  const filters = useMemo(() => catalogFilters(t), [t]);
  // Optimistic when the plan could not be resolved at all: assume allowed
  // rather than flashing a lock on a paid org's own page. The server refuses
  // either way, so the worst case is a control that looks open and then locks.
  const canUseCustomCode = plan?.limits.canUseCustomCode !== false;
  const httpEndpointCap = plan?.limits.maxHttpEndpointsPerArtifact ?? null;

  // Fixed order on every plan — Functions, HTTP, Catalog. Only which one opens
  // first changes with the plan, so upgrading doesn't rearrange the page under
  // someone who has learned where things are. A paid org lands on its own code
  // because that is what it came for; a Free org lands on the catalog, because
  // Functions is locked for it and an upgrade wall is a poor first screen.
  //
  // A lazy initializer rather than an effect: this is the initial value, not a
  // correction to one, so there is no render in which it is wrong and nothing
  // to guard against yanking the tab out from under a mid-task click.
  const [tab, setTab] = useState<ToolsTab>(() =>
    canUseCustomCode ? TAB_FUNCTIONS : TAB_CATALOG
  );
  const [customCode, setCustomCode] = useState<CustomCodeState>({
    activeVersionId: null,
    versions: []
  });
  const [catalog, setCatalog] = useState<ToolGroup[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [installed, setInstalled] = useState<ArtifactTool[]>([]);
  const [credentials, setCredentials] = useState<ArtifactCredential[]>([]);
  const [connections, setConnections] = useState<ArtifactConnection[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CatalogFilter>(FILTER_ALL);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'pending' | 'resolved' | 'rejected'
  >('idle');
  // Whether this page has ever finished a load. `status` alone can't answer
  // that: every mutation calls `fetchAll` and moves it back to `pending`, so a
  // skeleton keyed on `status` would replace the list the user is looking at
  // each time they flipped a switch. What a skeleton stands in for is content
  // that has never been on screen — which is exactly once.
  const [loaded, setLoaded] = useState(false);
  const [togglingToolKey, setTogglingToolKey] = useState<string | null>(null);
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
  const customCodeApiBase = `${apiBase}/custom-code`;

  const fetchAll = async (signal?: AbortSignal) => {
    if (!organizationId || !projectId) return;
    setStatus('pending');
    try {
      const [
        catalogData,
        mcpServerData,
        installedData,
        credentialData,
        connectionData,
        customCodeData
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
        }),
        utils.fetcher({
          url: `${customCodeApiBase}/versions`,
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
      if (Array.isArray(customCodeData?.versions)) {
        setCustomCode({
          activeVersionId: customCodeData.activeVersionId ?? null,
          versions: customCodeData.versions
        });
      }
      setLoaded(true);
      setStatus('resolved');
    } catch {
      if (!signal?.aborted) setStatus('rejected');
    }
  };

  /**
   * Reload the custom-code versions, and nothing else.
   *
   * Saving a draft changes exactly one thing on this page — the version list —
   * so it must not run `fetchAll`: that is seven requests, and it moves `status`
   * to pending, which unmounts the Functions tab and takes the editor, the open
   * function and any unsaved sample input with it. Someone pressing ⌘S every
   * minute should not watch the page reload every minute.
   */
  const fetchCustomCode = async () => {
    if (!organizationId || !projectId) return;
    const data = await utils.fetcher({
      url: `${customCodeApiBase}/versions`,
      config: { credentials: 'include' }
    });
    if (Array.isArray(data?.versions)) {
      setCustomCode({
        activeVersionId: data.activeVersionId ?? null,
        versions: data.versions
      });
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
  }, [expandedGroupKey, credentials, catalog]);

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
  }, [expandedGroupKey, credentials, catalog]);

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

  // The one condition every skeleton on this page reads. A failed load is not
  // loading: it stops showing skeletons and lets the empty states speak, which
  // is the honest answer when there is nothing to show and nothing coming.
  const initialLoading = !loaded && status !== 'rejected';

  const httpEndpoints = useMemo(
    () =>
      installed.filter(
        t => t.toolKey === utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT
      ),
    [installed]
  );

  // The manifest of whatever version is live — the tools this artifact's script
  // actually exposes. A draft that has never been published contributes nothing,
  // which is the same thing the MCP boot loop believes.
  const activeVersion = useMemo(
    () =>
      customCode.versions.find(v => v.id === customCode.activeVersionId) ||
      null,
    [customCode]
  );
  const activeFunctions = activeVersion?.tools || [];

  const customCodeTool = useMemo(
    () =>
      installed.find(
        t => t.toolKey === utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE
      ) || null,
    [installed]
  );

  // The enabled subset of the live version's functions. Absent or empty means
  // all of them, exactly as the boot loop and mcp-proxy read it.
  const customCodeAllowedTools = useMemo(() => {
    const allow = (customCodeTool?.config as { allowedTools?: unknown } | null)
      ?.allowedTools;
    return Array.isArray(allow) ? (allow as string[]) : null;
  }, [customCodeTool]);

  const exposedFunctions = useMemo(() => {
    if (!customCodeAllowedTools || customCodeAllowedTools.length === 0) {
      return activeFunctions;
    }
    return activeFunctions.filter(fn =>
      customCodeAllowedTools.includes(fn.name)
    );
  }, [activeFunctions, customCodeAllowedTools]);

  /**
   * Write the custom-code row's allow-list.
   *
   * Through the generic tool route, which replaces the whole config — so the
   * stored one is spread first. `activeVersionId` travels with it and is
   * overwritten server-side by what is actually stored, since only publish and
   * rollback may move that pointer.
   */
  const customCodeConfig = useMemo(
    () =>
      customCodeTool
        ? ((customCodeTool.config || {}) as {
            connections?: string[];
            allowedHosts?: string[];
            timeoutMs?: number;
            resourceAccess?: string;
          })
        : null,
    [customCodeTool]
  );

  // The artifact's `custom-code` credentials — the values a script reads back
  // through `ctx.secret(name)`, matched on the label stored in metadata. Scoped
  // to the artifact rather than to the tool row, which is why they can be
  // managed before any code exists.
  const customCodeSecrets = useMemo(
    () =>
      credentials.filter(
        credential =>
          credential.provider ===
          utils.constants.CREDENTIAL_PROVIDER_CUSTOM_CODE
      ),
    [credentials]
  );

  /**
   * Write the custom-code row's capabilities.
   *
   * The same route and the same rule as the allow-list below: the whole config
   * is replaced, so the stored one is spread first, and `activeVersionId`
   * travels with it and is overwritten server-side by what is actually stored —
   * only publish and rollback may move that pointer.
   */
  const saveCustomCodeConfig = async (next: {
    connections?: string[];
    allowedHosts?: string[];
    timeoutMs?: number;
    resourceAccess?: string;
  }): Promise<boolean> => {
    if (!customCodeTool) return false;
    const config = {
      ...((customCodeTool.config as Record<string, unknown>) || {}),
      ...next
    };
    try {
      const data = await utils.fetcher({
        url: `${toolApiBase}/${customCodeTool.id}`,
        config: {
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify({ config })
        }
      });
      if (data?.error) {
        snackbar.error(data.error);
        return false;
      }
      await fetchAll();
      return true;
    } catch {
      snackbar.error(t('settingsErrSave'));
      return false;
    }
  };

  const setCustomCodeAllowedTools = async (next: string[] | null) => {
    if (!customCodeTool) return;
    const config = {
      ...((customCodeTool.config as Record<string, unknown>) || {}),
      ...(next ? { allowedTools: next } : { allowedTools: [] })
    };
    try {
      const data = await utils.fetcher({
        url: `${toolApiBase}/${customCodeTool.id}`,
        config: {
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify({ config })
        }
      });
      if (data?.error) {
        snackbar.error(data.error);
        return;
      }
      await fetchAll();
    } catch {
      snackbar.error(t('errUpdateFunction'));
    }
  };

  /**
   * How many tools this server actually puts in front of a model.
   *
   * Not a row count: a `custom-code` row contributes one tool per entry in its
   * live manifest, and an `mcp-proxy` row contributes one per remote tool it
   * allows — so the three kinds have to be counted differently to arrive at the
   * number a client will see. This is the figure the ~40-tool ceiling applies
   * to, and the reason it is worth showing: an artifact with 5 tools averages
   * ~1.1k input tokens a turn and one with 12 averages ~13k.
   */
  const exposedToolCount = useMemo(() => {
    let total = 0;
    for (const t of installed) {
      if (!t.enabled) continue;
      if (t.toolKey === utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE) {
        total += exposedFunctions.length;
        continue;
      }
      if (t.toolKey === utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY) {
        const allow = (t.config as { allowedTools?: unknown } | null)
          ?.allowedTools;
        if (Array.isArray(allow) && allow.length > 0) {
          total += allow.length;
          continue;
        }
        // Absent or empty means every discovered tool is on — the boot loop
        // reads it the same way.
        const discovery = (
          t.metadata as { discovery?: { tools?: unknown[] } } | null
        )?.discovery;
        total += discovery?.tools?.length || 0;
        continue;
      }
      total += 1;
    }
    return total;
  }, [installed, exposedFunctions]);

  useEffect(() => {
    if (status !== 'resolved') return;
    if (typeof window === 'undefined') return;
    const pendingKey = sessionStorage.getItem(EXPANDED_GROUP_KEY);
    if (!pendingKey) return;
    sessionStorage.removeItem(EXPANDED_GROUP_KEY);
    if (catalog.some(g => g.key === pendingKey)) {
      setExpandedGroupKey(pendingKey);
      setTab('catalog');
    }
  }, [status]);

  useEffect(() => {
    const requestedId = router.query.selected;
    if (typeof requestedId !== 'string' || installed.length === 0) return;
    const match = installed.find(t => t.id === requestedId);
    if (!match || editTool?.id === match.id) return;
    // "Open in Tools" from a channel arrives with an artifact_tool id, which now
    // has to resolve to a tab as well as a row — the three kinds live in
    // different places.
    setTab(tabForToolKey(match.toolKey));
    openEditor(match);
  }, [router.query.selected, installed]);

  const installedByToolKey = useMemo(() => {
    const map = new Map<string, ArtifactTool>();
    for (const t of installed) map.set(t.toolKey, t);
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

  // Declared here, above the memos that call them: both are plain `const`
  // arrows, and a useMemo factory runs during the same render pass — so a call
  // from a memo defined earlier in the file hits the temporal dead zone rather
  // than the function.
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

  // How many tools this artifact enables in one group. The number the card
  // shows, and what the On/Off filters sort on.
  const enabledInGroup = (group: ToolGroup): number =>
    group.tools.filter(d => installedByToolKey.get(d.key)?.enabled).length;

  const filteredCatalog = useMemo(() => {
    // The mcp-proxy group is hidden — its servers render as their own cards.
    // Functions and HTTP endpoints are hidden too: they have their own tabs, and
    // a card here would be a second way to reach the same thing.
    const visible = catalog.filter(
      g =>
        !g.tools.some(
          d =>
            d.key === utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY ||
            d.key === utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT ||
            d.key === utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE
        )
    );

    const matched = visible.filter(g => {
      if (filter === FILTER_ON && enabledInGroup(g) === 0) return false;
      if (filter === FILTER_OFF && enabledInGroup(g) > 0) return false;
      // Only groups that actually need an OAuth connection can be missing one;
      // a group with no provider is never "waiting" on anything.
      if (
        filter === FILTER_NEEDS_CONNECTION &&
        (!g.provider || isGroupConnected(g))
      ) {
        return false;
      }
      return true;
    });

    const q = search.trim().toLowerCase();
    if (!q) return matched;
    return matched.filter(
      g =>
        g.title.toLowerCase().includes(q) ||
        (g.description || '').toLowerCase().includes(q) ||
        g.tools.some(d => d.title.toLowerCase().includes(q))
    );
  }, [catalog, search, filter, installedByToolKey, credentials, connections]);

  const expandedGroup = useMemo(
    () =>
      expandedGroupKey ? catalog.find(g => g.key === expandedGroupKey) : null,
    [catalog, expandedGroupKey]
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
        .flatMap(g => g.tools)
        .find(
          d => d.key === utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT
        ) || null,
    [catalog]
  );

  // The mcp-proxy definition is plumbing: each curated server installs against
  // it, but we present the servers themselves as cards (from mcp_server_catalog)
  // — so the generic "MCP Servers" group is hidden from the catalog grid.
  const mcpProxyDef = useMemo(
    () =>
      catalog
        .flatMap(g => g.tools)
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
    // Remote servers answer the same filters as the native groups, just from a
    // different fact: a server is on when it has an enabled install, and it
    // "needs connection" when it has none at all.
    const matched = mcpServers.filter(s => {
      const install = installedByServerId.get(s.id);
      if (filter === FILTER_ON) return !!install?.enabled;
      if (filter === FILTER_OFF) return !!install && !install.enabled;
      if (filter === FILTER_NEEDS_CONNECTION) return !install;
      return true;
    });

    const q = search.trim().toLowerCase();
    if (!q) return matched;
    return matched.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
    );
  }, [mcpServers, search, filter, installedByServerId]);

  // Installed tools belonging to the open group — the fan-out targets for the
  // group-level defaults.
  const expandedGroupInstalledTools = useMemo(() => {
    if (!expandedGroup) return [] as ArtifactTool[];
    const defKeys = new Set(expandedGroup.tools.map(d => d.key));
    return installed.filter(t => defKeys.has(t.toolKey));
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
      sessionStorage.setItem(EXPANDED_GROUP_KEY, group.key);
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
      snackbar.error(t('errUpdateSettings'));
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
        snackbar.success(t('okApiKeySaved'));
        setApiKeyGroup(null);
        setApiKeyValue('');
        await fetchAll();
      }
    } catch {
      snackbar.error(t('errSaveApiKey'));
    } finally {
      setApiKeySubmitting(false);
    }
  };

  /**
   * Turn one already-installed row on or off.
   *
   * Distinct from handleToggleTool, which works from a CATALOG entry and may
   * have to install the row first. Rows the user authored — functions, HTTP
   * endpoints — always exist by the time they can be toggled, and their config
   * is the thing being protected, so this path never creates and never deletes.
   */
  const handleToggleInstalled = async (
    tool: ArtifactTool,
    enabled: boolean
  ) => {
    if (togglingToolKey) return;
    setTogglingToolKey(tool.id);
    try {
      const data = await utils.fetcher({
        url: `${toolApiBase}/${tool.id}/enabled`,
        config: {
          method: 'PATCH',
          credentials: 'include',
          body: JSON.stringify({ enabled })
        }
      });
      if (data?.error) snackbar.error(data.error);
      else snackbar.success(t(enabled ? 'okToolEnabled' : 'okToolDisabled'));
      await fetchAll();
    } catch {
      snackbar.error(t('errUpdateTool'));
    } finally {
      setTogglingToolKey(null);
    }
  };

  const handleToggleTool = async (def: ToolDefinition, enabled: boolean) => {
    if (togglingToolKey) return;
    const existing = installedByToolKey.get(def.key);
    if (enabled && !existing?.enabled) {
      const provider = expandedGroup?.provider || null;
      const missing = getMissingScopes(def, provider);
      if (missing.length > 0 && provider && expandedGroup) {
        setScopeAlert({ group: expandedGroup, def, missing });
        return;
      }
    }
    setTogglingToolKey(def.key);
    try {
      let data: { error?: string } | undefined;
      // Three cases, not two: a tool that was turned off still has its row, so
      // turning it back on is a flag flip rather than a fresh install. Only a
      // tool that was never installed needs its group's defaults inherited.
      if (existing) {
        data = await utils.fetcher({
          url: `${toolApiBase}/${existing.id}/enabled`,
          config: {
            method: 'PATCH',
            credentials: 'include',
            body: JSON.stringify({ enabled })
          }
        });
      } else if (enabled) {
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
              toolKey: def.key,
              config: inheritedConfig
            })
          }
        });
      }
      if (data && data.error) {
        snackbar.error(data.error);
      } else {
        snackbar.success(t(enabled ? 'okToolEnabled' : 'okToolDisabled'));
      }
      await fetchAll();
    } catch {
      snackbar.error(t('errUpdateTool'));
    } finally {
      setTogglingToolKey(null);
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

  /**
   * One per-tool setting.
   *
   * `toolKey` is here only so the label and help can be looked up: these fields
   * are declared in `CALENDAR_TOOL_FIELDS`, which is shared code with no locale,
   * so their wording is translated by key the same way the catalog's is — and
   * falls back to the English the constant carries.
   */
  const renderCalendarField = (toolKey: string, field: CalendarConfigField) => {
    const value = configForm[field.key];
    const base = `field.${toolKey}.${field.key}`;
    const label = i18n.catalogCopy(
      t.lang,
      `${base}.label`,
      field.label
    ) as string;
    const help =
      i18n.catalogCopy(t.lang, `${base}.help`, field.help ?? null) ?? undefined;

    if (field.type === 'boolean') {
      return (
        <div
          key={field.key}
          className="tools-config-field tools-config-field-row"
        >
          <div>
            <p className="tools-config-field-label">{label}</p>
            {help && <p className="tools-config-field-help">{help}</p>}
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
            label={label}
            value={
              typeof value === 'string' && value
                ? value
                : field.options[0]?.value || ''
            }
            options={field.options.map(option => ({
              ...option,
              label:
                i18n.catalogCopy(
                  t.lang,
                  `option.${field.key === 'defaultVisibility' ? 'calendar-visibility' : field.key}.${option.value}`,
                  option.label
                ) || option.label
            }))}
            disabled={submitting}
            helperText={help}
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
          <p className="tools-config-field-label">{label}</p>
          <div className="tools-config-weekdays">
            {weekdayOptions.map(day => {
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
          label={label}
          type={field.type === 'number' ? 'number' : 'text'}
          value={value === undefined || value === null ? '' : String(value)}
          disabled={submitting}
          helperText={help}
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
        setConfigError(t('configMustBeObject'));
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      setConfigError(t('configInvalidJson'));
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
        snackbar.success(t('okToolUpdated'));
      } else {
        snackbar.error(data?.error || t('errUpdateTool'));
      }
    } catch {
      snackbar.error(t('errUpdateTool'));
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
        snackbar.success(t('okToolRemoved'));
      } else {
        snackbar.error(data?.error || t('errRemoveTool'));
      }
    } catch {
      snackbar.error(t('errRemoveTool'));
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

  return (
    <Wrapper>
      <div className="tools-container">
        <div className="tools-header">
          <div className="tools-header-text">
            <h1 className="tools-title">{t('title')}</h1>
            <p className="tools-subtitle">{t('subtitle')}</p>
          </div>
        </div>
        {connectedBanner && (
          <div className="tools-banner tools-banner-success">
            <CheckCircle />
            <span>
              {t('bannerConnected', {
                provider: getProviderLabel(connectedBanner)
              })}
            </span>
            <IconButton size="small" onClick={() => setConnectedBanner(null)}>
              <Close />
            </IconButton>
          </div>
        )}
        <div className="tools-tabs">
          <button
            type="button"
            className={`tools-tab ${tab === TAB_FUNCTIONS ? 'active' : ''} ${
              canUseCustomCode ? '' : 'locked'
            }`}
            onClick={() => setTab(TAB_FUNCTIONS)}
          >
            {!canUseCustomCode && <LockOutlined fontSize="small" />}
            {t('tabFunctions')}
            {canUseCustomCode && exposedFunctions.length > 0 && (
              <span className="tools-tab-count">{exposedFunctions.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`tools-tab ${tab === TAB_HTTP ? 'active' : ''}`}
            onClick={() => setTab(TAB_HTTP)}
          >
            {t('tabHttp')}
            {httpEndpoints.length > 0 && (
              <span className="tools-tab-count">{httpEndpoints.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`tools-tab ${tab === TAB_CATALOG ? 'active' : ''}`}
            onClick={() => setTab(TAB_CATALOG)}
          >
            {t('tabCatalog')}
          </button>
        </div>

        {tab === TAB_FUNCTIONS && !canUseCustomCode && (
          <div className="tools-locked">
            <div className="tools-locked-badge">
              <LockOutlined fontSize="small" />
              <span>{t('lockedBadge')}</span>
            </div>
            <h3>{t('lockedTitle')}</h3>
            <p>{t('lockedText')}</p>
            {/* The real thing, rendered inert. An empty upgrade wall says what
                you cannot do; this says what you would get. */}
            <div className="tools-locked-preview" aria-hidden="true">
              <div className="tools-locked-preview-bar">
                <span className="tools-locked-preview-dot" />
                <span className="tools-locked-preview-dot" />
                <span className="tools-locked-preview-dot" />
                <span className="tools-locked-preview-file">index.ts</span>
              </div>
              <pre className="tools-locked-preview-code">
                {`import { createHandler, defineTool } from '@ganju/sdk';

export default createHandler({
  'lookup-order': defineTool(async (input, ctx) => {
    const { accessToken } = await ctx.connection('google-gmail');
    const res = await fetch(\`https://api.acme.com/orders/\${input.orderId}\`);
    return { status: (await res.json()).status };
  })
});`}
              </pre>
            </div>
            <UI.Button
              variant="contained"
              onClick={() => router.push(`/${organizationId}/settings/billing`)}
            >
              <span className="button-text">{t('lockedUpgrade')}</span>
            </UI.Button>
          </div>
        )}

        {tab === TAB_FUNCTIONS && canUseCustomCode && (
          <FunctionsPanel
            apiBase={apiBase}
            loading={initialLoading}
            activeVersionId={customCode.activeVersionId}
            versions={customCode.versions}
            allowedTools={customCodeAllowedTools}
            onSetAllowedTools={setCustomCodeAllowedTools}
            onVersionsChanged={fetchCustomCode}
            onChanged={fetchAll}
            config={customCodeConfig}
            connections={connections}
            secrets={customCodeSecrets}
            credentialApiBase={credentialApiBase}
            getProviderLabel={getProviderLabel}
            onSaveConfig={saveCustomCodeConfig}
            onSecretsChanged={fetchAll}
          />
        )}

        {tab === TAB_HTTP && (
          <div className="tools-http">
            <div className="tools-section-header">
              <div>
                <h2 className="tools-section-title">{t('httpTitle')}</h2>
                <p className="tools-section-subtitle">
                  {t('httpSubtitle')}
                  {!initialLoading &&
                    httpEndpointCap !== null &&
                    ` ${t('httpUsage', {
                      used: httpEndpoints.length,
                      cap: httpEndpointCap
                    })}`}
                </p>
              </div>
              <UI.Button
                variant="contained"
                size="small"
                disabled={
                  !httpEndpointDef ||
                  (httpEndpointCap !== null &&
                    httpEndpoints.length >= httpEndpointCap)
                }
                onClick={() => setHttpEndpointEditor({ tool: null })}
              >
                <Add />
                <span className="button-text">{t('httpNew')}</span>
              </UI.Button>
            </div>
            {initialLoading ? (
              <ToolRowsSkeleton rows={3} />
            ) : httpEndpoints.length === 0 ? (
              <div className="tools-empty-state">
                <ApiOutlined />
                <h3>{t('httpEmptyTitle')}</h3>
                <p>{t('httpEmptyText')}</p>
              </div>
            ) : (
              <div className="tools-function-list">
                {httpEndpoints.map(tool => {
                  const config = (tool.config || {}) as {
                    name?: string;
                    description?: string;
                    method?: string;
                    url?: string;
                  };
                  return (
                    <div key={tool.id} className="tools-function-item">
                      <div className="tools-function-item-row">
                        <div className="tools-function-item-main">
                          <p className="tools-function-item-title">
                            {config.name || t('httpUntitled')}
                          </p>
                          {config.description && (
                            <p className="tools-function-item-description">
                              {config.description}
                            </p>
                          )}
                          <span className="tools-function-item-tags">
                            <code className="tools-function-item-id">
                              {config.method || 'GET'} {config.url || ''}
                            </code>
                            {!tool.enabled && (
                              <span className="tools-state-chip">
                                {t('chipOffKept')}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="tools-function-item-actions">
                          <Tooltip
                            title={
                              tool.enabled
                                ? t('tooltipTurnOffEndpoint')
                                : t('tooltipTurnOn')
                            }
                          >
                            <span>
                              <Switch
                                size="small"
                                checked={tool.enabled}
                                disabled={togglingToolKey !== null}
                                onChange={(_, checked) =>
                                  handleToggleInstalled(tool, checked)
                                }
                              />
                            </span>
                          </Tooltip>
                          <Tooltip title={t('tooltipEdit')}>
                            <IconButton
                              size="small"
                              onClick={() => setHttpEndpointEditor({ tool })}
                            >
                              <EditOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('tooltipRemoveEndpoint')}>
                            <IconButton
                              size="small"
                              onClick={() => setRemoveAlert(tool)}
                            >
                              <DeleteOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === TAB_CATALOG && !expandedGroup && (
          <div className="tools-catalog">
            {/* What this server currently exposes, against the ceiling an MCP
                client will actually tolerate. Every enabled tool re-sends its
                schema on every model call, so this is the page's real budget —
                and it belongs next to the switches that spend it. */}
            {/* Rendered as a skeleton rather than as zero: an unloaded page
                reads "0 of 40 tools exposed", which is a specific and wrong
                claim about someone's server, and it settles on the real number
                a moment later. A blank bar makes no claim at all. */}
            {initialLoading ? (
              <div className="tools-budget loading">
                <div className="tools-budget-text">
                  <UI.Skeleton variant="text" width={170} height={18} />
                  <UI.Skeleton variant="text" width={260} height={13} />
                </div>
                <UI.Skeleton variant="rounded" width="100%" height={6} />
              </div>
            ) : (
              <div
                className={`tools-budget ${
                  exposedToolCount > utils.constants.CHANNEL_MAX_TOOLS
                    ? 'over'
                    : ''
                }`}
              >
                <div className="tools-budget-text">
                  <strong>{exposedToolCount}</strong>{' '}
                  {t('budgetOf', { max: utils.constants.CHANNEL_MAX_TOOLS })}
                  <span className="tools-budget-hint">
                    {exposedToolCount > utils.constants.CHANNEL_MAX_TOOLS
                      ? t('budgetHintOver')
                      : t('budgetHint')}
                  </span>
                </div>
                <div className="tools-budget-bar">
                  <span
                    style={{
                      width: `${Math.min(
                        100,
                        (exposedToolCount / utils.constants.CHANNEL_MAX_TOOLS) *
                          100
                      )}%`
                    }}
                  />
                </div>
              </div>
            )}
            <div className="tools-catalog-controls">
              <div className="tools-search">
                <Search />
                <input
                  type="text"
                  placeholder={t('searchPlaceholder')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              {/* Filters rather than tabs. "Installed" was never a thing a user
                  wanted to see on its own — what they want is one list they can
                  narrow. */}
              <div className="tools-filters">
                {filters.map(f => (
                  <button
                    key={f.value}
                    type="button"
                    className={`tools-filter ${filter === f.value ? 'active' : ''}`}
                    onClick={() => setFilter(f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {initialLoading && (
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
              !initialLoading && (
                <p className="tools-empty">
                  {filter === FILTER_ALL
                    ? t('emptyNoMatchSearch')
                    : search.trim()
                      ? t('emptyNoMatchFilterAndSearch')
                      : t('emptyNoMatchFilter')}
                </p>
              )}
            <div className="tools-catalog-groups">
              {filteredCatalog.map(group => {
                const installedCount = group.tools.filter(
                  d => installedByToolKey.get(d.key)?.enabled
                ).length;
                const connected = isGroupConnected(group);
                const expired = isProviderExpired(group.provider);
                return (
                  <button
                    type="button"
                    key={group.key}
                    className="tools-catalog-group-card"
                    onClick={() => setExpandedGroupKey(group.key)}
                  >
                    <div className="tools-catalog-group-icon">
                      {renderGroupIcon(group)}
                    </div>
                    <div className="tools-catalog-group-body">
                      <div className="tools-catalog-group-title-row">
                        <p className="tools-catalog-group-title">
                          {groupTitle(group)}
                        </p>
                        {connected &&
                          group.provider &&
                          (expired ? (
                            <span className="tools-catalog-group-expired">
                              <Warning />
                              {t('chipExpired')}
                            </span>
                          ) : (
                            <span className="tools-catalog-group-connected">
                              <CheckCircle />
                              {t('chipConnected')}
                            </span>
                          ))}
                      </div>
                      {groupDescription(group) && (
                        <p className="tools-catalog-group-description">
                          {groupDescription(group)}
                        </p>
                      )}
                      <p className="tools-catalog-group-meta">
                        {t('groupToolsEnabled', {
                          enabled: installedCount,
                          total: group.tools.length
                        })}
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
                        {install && install.enabled && (
                          <span className="tools-catalog-group-connected">
                            <CheckCircle />
                            {t('chipConnected')}
                          </span>
                        )}
                        {install && !install.enabled && (
                          <span className="tools-state-chip">
                            {t('chipOff')}
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <p className="tools-catalog-group-description">
                          {s.description}
                        </p>
                      )}
                      <p className="tools-catalog-group-meta">
                        {!install
                          ? t('mcpNotConnected')
                          : t.plural(
                              install.enabled
                                ? 'mcpToolsEnabled'
                                : 'mcpToolsOff',
                              enabledCount
                            )}
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
              onClick={() => setExpandedGroupKey(null)}
            >
              <ArrowBack />
              {t('backToCatalog')}
            </button>
            <div className="tools-group-detail-header">
              <div className="tools-group-detail-icon">
                {renderGroupIcon(expandedGroup)}
              </div>
              <div className="tools-group-detail-info">
                <p className="tools-group-detail-title">
                  {groupTitle(expandedGroup)}
                </p>
                {groupDescription(expandedGroup) && (
                  <p className="tools-group-detail-description">
                    {groupDescription(expandedGroup)}
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
                          {t('chipExpired')}
                        </span>
                      ) : (
                        <span className="tools-group-detail-connected-pill">
                          <CheckCircle />
                          {t('chipConnected')}
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
                          <span className="button-text">
                            {t('updateApiKey')}
                          </span>
                        </UI.Button>
                      )}
                      <UI.Button
                        size="small"
                        onClick={() =>
                          setDisconnectAlert({
                            provider: expandedGroup.provider!,
                            affected: expandedGroup.tools.filter(
                              d => installedByToolKey.get(d.key)?.enabled
                            ).length
                          })
                        }
                      >
                        <LinkOff />
                        <span className="button-text">{t('disconnect')}</span>
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
                        {t('addApiKeyFor', { name: groupTitle(expandedGroup) })}
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
                          ? t('redirecting')
                          : t('connectGroup', {
                              name: groupTitle(expandedGroup)
                            })}
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
                  {t('connectBanner', { name: groupTitle(expandedGroup) })}
                </span>
              </div>
            )}
            {isCalendarGroup && isGroupConnected(expandedGroup) && (
              <div className="tools-group-detail-config">
                {expandedGroupInstalledTools.length === 0 ? (
                  <p className="tools-group-detail-config-hint">
                    {t('calendarHint')}
                  </p>
                ) : (
                  <>
                    <UI.Select
                      label={t('defaultCalendar')}
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
                          ? t('calendarLoadError')
                          : calendarStatus === 'pending'
                            ? t('calendarLoading')
                            : t('calendarHelp')
                      }
                      onChange={e =>
                        saveGroupToolConfig(
                          { defaultCalendarId: e.target.value },
                          t('okDefaultCalendar')
                        )
                      }
                    />
                    <UI.Select
                      label={t('defaultTimeZone')}
                      value={selectedTimeZone}
                      options={timeZoneOptions}
                      disabled={savingCalendar || timeZoneOptions.length === 0}
                      helperText={t('timeZoneHelpCalendar')}
                      onChange={e =>
                        saveGroupToolConfig(
                          { defaultTimeZone: e.target.value },
                          t('okDefaultTimeZone')
                        )
                      }
                    />
                    <UI.Select
                      label={t('attendeeNotifications')}
                      value={groupSendUpdates}
                      options={sendUpdates}
                      disabled={savingCalendar}
                      helperText={t('notificationsHelp')}
                      onChange={e =>
                        saveGroupToolConfig(
                          { sendUpdates: e.target.value },
                          t('okNotifications')
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
                    {t('calcomHint')}
                  </p>
                ) : (
                  <>
                    <UI.Select
                      label={t('defaultEventType')}
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
                          ? t('eventTypesLoadError')
                          : eventTypesStatus === 'pending'
                            ? t('eventTypesLoading')
                            : t('eventTypeHelp')
                      }
                      onChange={e =>
                        saveGroupToolConfig(
                          { defaultEventTypeId: Number(e.target.value) },
                          t('okDefaultEventType')
                        )
                      }
                    />
                    <UI.Select
                      label={t('defaultTimeZone')}
                      value={selectedTimeZone}
                      options={timeZoneOptions}
                      disabled={savingCalendar || timeZoneOptions.length === 0}
                      helperText={t('timeZoneHelpCalcom')}
                      onChange={e =>
                        saveGroupToolConfig(
                          { defaultTimeZone: e.target.value },
                          t('okDefaultTimeZone')
                        )
                      }
                    />
                  </>
                )}
              </div>
            )}
            <div className="tools-group-detail-list">
              {expandedGroup.tools.map(def => {
                const install = installedByToolKey.get(def.key);
                const isInstalled = !!install?.enabled;
                const connected = isGroupConnected(expandedGroup);
                const disabled =
                  !connected ||
                  (togglingToolKey !== null && togglingToolKey !== def.key);
                // Some tools carry settings — which calendar to write to,
                // which event type to book. That used to be reachable only
                // from the separate Installed tab; with one list it has to
                // live on the row itself.
                const configurable =
                  !!install && !!utils.constants.CALENDAR_TOOL_FIELDS[def.key];
                return (
                  <div
                    key={def.key}
                    className={`tools-group-detail-item ${!connected ? 'disabled' : ''}`}
                  >
                    <div className="tools-group-detail-item-main">
                      <p className="tools-group-detail-item-title">
                        {toolTitle(def)}
                      </p>
                      {toolDescription(def) && (
                        <p className="tools-group-detail-item-description">
                          {toolDescription(def)}
                        </p>
                      )}
                      {def.requiredScopes && (
                        <Tooltip
                          title={t('scopesTooltip', {
                            scopes: def.requiredScopes
                          })}
                        >
                          <span className="tools-group-detail-item-scopes">
                            {t('scopes')}
                          </span>
                        </Tooltip>
                      )}
                    </div>
                    <div className="tools-group-detail-item-actions">
                      {/* Off and never-installed look identical on a switch, and
                          they are not the same thing: one is holding a
                          configuration the user chose. Say so. */}
                      {install && !install.enabled && (
                        <span className="tools-state-chip">
                          {t('chipOffKept')}
                        </span>
                      )}
                      {configurable && (
                        <Tooltip title={t('tooltipConfigure')}>
                          <IconButton
                            size="small"
                            onClick={() => handleEdit(install!)}
                          >
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip
                        title={
                          isInstalled
                            ? t('tooltipTurnOffTool')
                            : t('tooltipTurnOn')
                        }
                      >
                        <span>
                          <Switch
                            checked={isInstalled}
                            disabled={disabled}
                            onChange={e =>
                              handleToggleTool(def, e.target.checked)
                            }
                          />
                        </span>
                      </Tooltip>
                      {/* Only for a row that exists. Turning a tool off leaves
                          one behind, and without this the only way to be rid of
                          it — and of the settings it holds — was to never
                          install it. */}
                      {install && (
                        <Tooltip title={t('tooltipRemoveTool')}>
                          <IconButton
                            size="small"
                            onClick={() => setRemoveAlert(install)}
                          >
                            <DeleteOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {editTool && (
        <UI.Portal>
          <ModalOverlay onClick={handleCloseEdit}>
            <ModalDialog role="dialog" onClick={e => e.stopPropagation()}>
              <div className="tools-modal-header">
                <h2 className="tools-modal-title">
                  {t('configureTitle', {
                    name: editTool.toolDefinition
                      ? toolTitle(editTool.toolDefinition)
                      : t('configureFallbackName')
                  })}
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
                        {editFields.map(field =>
                          renderCalendarField(editKey as string, field)
                        )}
                      </div>
                    );
                  }

                  if (editIsGroupManaged) {
                    return (
                      <p className="tools-configure-help">
                        {t('configureGroupManaged')}
                      </p>
                    );
                  }

                  return (
                    <>
                      <p className="tools-configure-help">
                        {t('configJsonHelpBefore')} <code>{'{}'}</code>{' '}
                        {t('configJsonHelpAfter')}
                      </p>
                      <UI.Input
                        label={t('configJsonLabel')}
                        multiline
                        rows={8}
                        value={configJson}
                        disabled={submitting}
                        error={!!configError}
                        helperText={configError || t('configJsonExample')}
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
                  {c('cancel')}
                </UI.Button>
                <UI.Button
                  variant="contained"
                  size="small"
                  disabled={submitting}
                  onClick={handleUpdateSubmit}
                >
                  {submitting ? c('saving') : c('save')}
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
                  {t('connectTitle', { name: groupTitle(apiKeyGroup) })}
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
                  {t('apiKeyHelp', { name: groupTitle(apiKeyGroup) })}
                </p>
                <UI.Input
                  label={t('apiKeyLabel')}
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
                  {c('cancel')}
                </UI.Button>
                <UI.Button
                  variant="contained"
                  size="small"
                  disabled={apiKeySubmitting || !apiKeyValue.trim()}
                  onClick={handleAddApiKey}
                >
                  {apiKeySubmitting ? c('saving') : c('save')}
                </UI.Button>
              </div>
            </ModalDialog>
          </ModalOverlay>
        </UI.Portal>
      )}
      {httpEndpointEditor && httpEndpointDef && (
        <HttpEndpointModal
          tool={httpEndpointEditor.tool}
          toolKey={httpEndpointDef.key}
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
          toolKey={mcpProxyDef.key}
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
        title={t('removeToolTitle')}
        // Now that off exists, remove has to say what it does that off doesn't:
        // it takes the configuration with it. Somebody reaching for this to
        // shorten their tool list wants the other button.
        description={t('removeToolDescription', {
          name:
            (removeAlert?.toolDefinition
              ? toolTitle(removeAlert.toolDefinition)
              : null) ||
            (removeAlert?.config as { name?: string } | null)?.name ||
            t('removeToolFallbackName')
        })}
        confirmText={t('remove')}
        cancelText={c('cancel')}
        loading={submitting}
        onConfirm={handleRemoveConfirm}
        onCancel={() => setRemoveAlert(null)}
      />
      <UI.Alert
        open={!!disconnectAlert}
        title={t('disconnectTitle', {
          name: disconnectAlert
            ? getProviderLabel(disconnectAlert.provider)
            : ''
        })}
        description={t.plural(
          'disconnectDescription',
          disconnectAlert?.affected || 0,
          {
            name: disconnectAlert
              ? getProviderLabel(disconnectAlert.provider)
              : t('disconnectFallbackName')
          }
        )}
        confirmText={t('disconnect')}
        cancelText={c('cancel')}
        loading={submitting}
        onConfirm={handleDisconnectConfirm}
        onCancel={() => setDisconnectAlert(null)}
      />
      <UI.Alert
        open={!!scopeAlert}
        title={t('scopeAlertTitle')}
        description={
          scopeAlert
            ? t('scopeAlertDescription', {
                tool: toolTitle(scopeAlert.def),
                group: groupTitle(scopeAlert.group),
                missing: scopeAlert.missing.join(', ')
              })
            : ''
        }
        confirmText={t('scopeAlertConfirm')}
        cancelText={c('cancel')}
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
