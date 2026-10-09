import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';
import Tooltip from '@mui/material/Tooltip';
import {
  ErrorOutlined,
  ExtensionOutlined,
  ChevronRight,
  OpenInNew,
  TimelineOutlined
} from '@mui/icons-material';

import { HealthCard, HealthModalBody } from './styles';
import {
  HealthRowsSkeleton,
  ErrorListSkeleton,
  UnusedListSkeleton,
  CallRowsSkeleton,
  CallSkeleton,
  SessionSkeleton
} from './Skeletons';
import { i18n } from '../../../lib';

import type { Translate } from '../../../lib';

type OverviewT = Translate<(typeof i18n.copy.OVERVIEW)['en']>;
type Status = 'pending' | 'resolved' | 'rejected';
type InstallKind = 'native' | 'mcp-proxy' | 'custom-code' | 'http-endpoint';

interface ToolRow {
  name: string;
  title: string | null;
  kind: InstallKind | null;
  artifactToolId: string | null;
  enabled: boolean | null;
  calls: number;
  errors: number;
  schemaRejections: number;
  retries: number;
  switchedAfterError: number;
  p95Ms: number | null;
  lastUsedAt: string;
}

interface ErrorRow {
  tool: string;
  message: string;
  count: number;
  lastSeenAt: string;
  lastRequestId: string;
}

interface UnusedRow {
  artifactToolId: string;
  toolKey: string;
  kind: InstallKind;
  label: string | null;
  createdAt: string;
}

interface Health {
  since: string;
  days: number;
  tools: ToolRow[];
  errors: ErrorRow[];
  unused: UnusedRow[];
  unusedDays: number;
  toolQuota: { plan: string; limit: number | null; enabled: number };
}

interface CallEntry {
  id: string;
  toolName: string | null;
  inputPreview: string | null;
  latencyMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  sessionId: string;
  clientName: string | null;
  via: 'channel' | 'mcp';
  platform: string | null;
}

interface SessionInfo {
  id: string;
  clientName: string | null;
  clientVersion: string | null;
  userName: string | null;
  via: 'channel' | 'mcp';
  channel: {
    channelId: string | null;
    platform: string | null;
    conversationId: string | null;
  } | null;
  createdAt: string;
  lastRequestAt: string | null;
}

interface CallDetail {
  id: string;
  method: string;
  toolName: string | null;
  resourceUri: string | null;
  promptId: string | null;
  input: unknown;
  output: unknown;
  latencyMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  session: SessionInfo;
}

interface SessionEntry {
  id: string;
  method: string;
  toolName: string | null;
  resourceUri: string | null;
  promptId: string | null;
  inputPreview: string | null;
  latencyMs: number | null;
  errorMessage: string | null;
  createdAt: string;
}

interface SessionReplay {
  session: SessionInfo;
  truncated: boolean;
  entries: SessionEntry[];
}

// The drill-down is one modal walked like a stack — a tool's calls, one call,
// the session it ran in, another call from that session — so "Back" always
// returns to where the reader came from.
type View =
  | { kind: 'calls'; tool: string; label: string }
  | { kind: 'call'; id: string; tool: string }
  | { kind: 'session'; id: string };

const PLATFORM_LABEL: Record<string, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  slack: 'Slack',
  discord: 'Discord'
};

const platformLabel = (platform: string | null) =>
  platform ? PLATFORM_LABEL[platform] || platform : '';

const toolLabel = (row: ToolRow) => row.title || row.name;

const UNUSED_KIND_KEY: Record<
  InstallKind,
  'unusedNative' | 'unusedProxy' | 'unusedFunctions' | 'unusedHttp'
> = {
  native: 'unusedNative',
  'mcp-proxy': 'unusedProxy',
  'custom-code': 'unusedFunctions',
  'http-endpoint': 'unusedHttp'
};

const unusedLabel = (row: UnusedRow, t: OverviewT) =>
  row.label || t(UNUSED_KIND_KEY[row.kind]);

const percent = (part: number, whole: number, t: OverviewT) =>
  t.n(whole > 0 ? part / whole : 0, {
    style: 'percent',
    maximumFractionDigits: 1
  });

// What a tool returned, as text: MCP results are a list of content parts, and
// the readable part is the text in them.
const resultText = (output: unknown): string => {
  if (output == null) return '';
  if (typeof output === 'string') return output;
  const content = (output as { content?: unknown }).content;
  if (Array.isArray(content)) {
    const texts = content
      .filter(
        (part): part is { text: string } =>
          part?.type === 'text' && typeof part.text === 'string'
      )
      .map(part => {
        try {
          return JSON.stringify(JSON.parse(part.text), null, 2);
        } catch {
          return part.text;
        }
      });
    if (texts.length) return texts.join('\n\n');
  }
  return JSON.stringify(output, null, 2);
};

const whoRan = (
  session: Pick<SessionInfo, 'via' | 'channel' | 'clientName' | 'userName'>,
  t: OverviewT
) => {
  if (session.via === 'channel') {
    return t('viaChannel', {
      platform: platformLabel(session.channel?.platform ?? null)
    });
  }
  const client = session.clientName || t('viaMcp');
  return session.userName ? `${session.userName} · ${client}` : client;
};

const Signals = ({ row, t }: { row: ToolRow; t: OverviewT }) => {
  const signals = [
    {
      count: row.schemaRejections,
      label: t.plural('signalSchema', row.schemaRejections),
      hint: t('signalSchemaHint')
    },
    {
      count: row.retries,
      label: t.plural('signalRetry', row.retries),
      hint: t('signalRetryHint')
    },
    {
      count: row.switchedAfterError,
      label: t.plural('signalSwitch', row.switchedAfterError),
      hint: t('signalSwitchHint')
    }
  ].filter(signal => signal.count > 0);

  if (signals.length === 0) return <span className="health-muted">—</span>;
  return (
    <span className="health-signals">
      {signals.map(signal => (
        <Tooltip key={signal.label} title={signal.hint}>
          <span className="health-signal">{signal.label}</span>
        </Tooltip>
      ))}
    </span>
  );
};

export const ToolHealth = ({ days }: { days: number }) => {
  const router = useRouter();
  const t = i18n.useT(i18n.copy.OVERVIEW);
  const c = i18n.useT(i18n.copy.COMMON);
  const snackbar = UI.Alert.useSnackbar();
  const { id: organizationId, projectId } = router.query as {
    id: string;
    projectId: string;
  };
  const apiBase = `/organization/${organizationId}/project/${projectId}`;

  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState<Status>('pending');
  const [disabling, setDisabling] = useState<string | null>(null);
  // The install waiting on the reader's yes before it is disabled.
  const [confirming, setConfirming] = useState<UnusedRow | null>(null);
  const [stack, setStack] = useState<View[]>([]);

  const fetchHealth = async (signal?: AbortSignal) => {
    setStatus('pending');
    try {
      const result = await utils.fetcher({
        url: `${apiBase}/observability/tools?days=${days}`,
        config: { credentials: 'include', signal }
      });
      if (signal?.aborted) return;
      if (!result || result.error) throw new Error('rejected');
      setHealth(result);
      setStatus('resolved');
    } catch {
      if (!signal?.aborted) setStatus('rejected');
    }
  };

  useEffect(() => {
    if (!organizationId || !projectId) return;
    const controller = new AbortController();
    fetchHealth(controller.signal);
    return () => controller.abort();
  }, [organizationId, projectId, days]);

  const disable = async (row: UnusedRow) => {
    const name = unusedLabel(row, t);
    setDisabling(row.artifactToolId);
    try {
      const result = await utils.fetcher({
        url: `${apiBase}/artifact/tool/${row.artifactToolId}/enabled`,
        config: {
          method: 'PATCH',
          credentials: 'include',
          body: JSON.stringify({ enabled: false })
        }
      });
      if (!result || result.error) throw new Error('rejected');
      setHealth(prev =>
        prev
          ? {
              ...prev,
              toolQuota: {
                ...prev.toolQuota,
                enabled: Math.max(prev.toolQuota.enabled - 1, 0)
              },
              unused: prev.unused.filter(
                u => u.artifactToolId !== row.artifactToolId
              ),
              tools: prev.tools.map(tool =>
                tool.artifactToolId === row.artifactToolId
                  ? { ...tool, enabled: false }
                  : tool
              )
            }
          : prev
      );
      snackbar.success(t('toastDisabled', { name }));
    } catch {
      snackbar.error(t('toastDisableFailed', { name }));
    } finally {
      setDisabling(null);
      setConfirming(null);
    }
  };

  const open = (view: View) => setStack(prev => [...prev, view]);
  const back = () => setStack(prev => prev.slice(0, -1));
  const close = () => setStack([]);
  const current = stack[stack.length - 1] ?? null;

  const rangeDays = health?.days ?? days;
  // The first load draws the card's real shape with placeholders in it; a
  // range change keeps the last numbers on screen, dimmed, until the new ones
  // arrive, rather than collapsing the card back to placeholders.
  const firstLoad = status === 'pending' && !health;
  const refreshing = status === 'pending' && !!health;
  const showTable = firstLoad || (!!health && health.tools.length > 0);
  // Enabling re-checks the plan's limit against the count that is left, so a
  // project that would still be at or over it after this can't take it back.
  const quota = health?.toolQuota;
  const reEnableBlocked =
    !!quota && quota.limit != null && quota.enabled - 1 >= quota.limit;
  const disableDescription =
    reEnableBlocked && quota
      ? t('disableConfirmQuota', {
          enabled: t.n(quota.enabled),
          plan: quota.plan,
          limit: t.n(quota.limit ?? 0)
        })
      : t('disableConfirmText');
  const unusedDays =
    health?.unusedDays ?? utils.constants.OBSERVABILITY_UNUSED_DAYS;

  return (
    <HealthCard
      className={`overview-card ${refreshing ? 'is-refreshing' : ''}`}
      aria-busy={status === 'pending'}
    >
      <div className="health-head">
        <p className="health-title">{t('healthTitle')}</p>
        <p className="health-sub">{t('healthHelp', { days: rangeDays })}</p>
      </div>

      {status === 'rejected' && !health ? (
        <div className="health-empty">
          <ExtensionOutlined />
          <p>{t('healthLoadFailed')}</p>
          <UI.Button size="small" onClick={() => fetchHealth()}>
            <span className="button-text">{t('retry')}</span>
          </UI.Button>
        </div>
      ) : health && health.tools.length === 0 ? (
        <div className="health-empty">
          <ExtensionOutlined />
          <p>{t('healthEmpty', { days: rangeDays })}</p>
        </div>
      ) : showTable ? (
        <div className="health-table-scroll">
          <table className="health-table">
            <thead>
              <tr>
                <th>{t('colTool')}</th>
                <th className="num">{t('colCalls')}</th>
                <th className="num">{t('colErrors')}</th>
                <th className="num">
                  <Tooltip title={t('colP95Hint')}>
                    <span>{t('colP95')}</span>
                  </Tooltip>
                </th>
                <th>{t('colLastUsed')}</th>
                <th>{t('colSignals')}</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {firstLoad && <HealthRowsSkeleton />}
              {health?.tools.map(row => (
                <tr
                  key={row.name}
                  tabIndex={0}
                  onClick={() =>
                    open({
                      kind: 'calls',
                      tool: row.name,
                      label: toolLabel(row)
                    })
                  }
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      open({
                        kind: 'calls',
                        tool: row.name,
                        label: toolLabel(row)
                      });
                    }
                  }}
                >
                  <td>
                    <span className="health-tool">
                      <span className="health-tool-name">{toolLabel(row)}</span>
                      {row.title && (
                        <code className="health-tool-key">{row.name}</code>
                      )}
                      {row.kind === null && (
                        <Tooltip title={t('notInstalledHint')}>
                          <span className="health-badge">
                            {t('notInstalled')}
                          </span>
                        </Tooltip>
                      )}
                      {row.enabled === false && (
                        <span className="health-badge">{t('toolOff')}</span>
                      )}
                    </span>
                  </td>
                  <td className="num">{t.n(row.calls)}</td>
                  <td className={`num ${row.errors > 0 ? 'is-error' : ''}`}>
                    {row.errors > 0
                      ? `${t.n(row.errors)} · ${percent(row.errors, row.calls, t)}`
                      : '0'}
                  </td>
                  <td className="num">
                    {row.p95Ms != null
                      ? t('latencyMs', { ms: t.n(row.p95Ms) })
                      : '—'}
                  </td>
                  <td className="health-muted">
                    {t.relativeShort(row.lastUsedAt)}
                  </td>
                  <td>
                    <Signals row={row} t={t} />
                  </td>
                  <td className="health-chevron">
                    <ChevronRight />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {showTable && (
        <div className="health-section">
          <p className="health-section-title">{t('errorsTitle')}</p>
          {!health ? (
            <ErrorListSkeleton />
          ) : health.errors.length === 0 ? (
            <p className="health-muted">
              {t('errorsEmpty', { days: rangeDays })}
            </p>
          ) : (
            <ul className="health-list">
              {health.errors.map(row => (
                <li key={row.lastRequestId}>
                  <button
                    type="button"
                    className="health-error"
                    onClick={() =>
                      open({
                        kind: 'call',
                        id: row.lastRequestId,
                        tool: row.tool
                      })
                    }
                  >
                    <ErrorOutlined className="health-error-icon" />
                    <span className="health-error-text">
                      <code>{row.tool}</code> {row.message}
                    </span>
                    <span className="health-error-count">
                      {t('errorTimes', { count: t.n(row.count) })}
                    </span>
                    <span className="health-muted">
                      {t.relativeShort(row.lastSeenAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(firstLoad || health) && (
        <div className="health-section">
          <p className="health-section-title">
            {t('unusedTitle', { days: unusedDays })}
          </p>
          {!health ? (
            <UnusedListSkeleton />
          ) : health.unused.length === 0 ? (
            <p className="health-muted">
              {t('unusedEmpty', { days: unusedDays })}
            </p>
          ) : (
            <>
              <p className="health-muted">
                {t('unusedHelp', { days: unusedDays })}
              </p>
              <ul className="health-list">
                {health.unused.map(row => (
                  <li key={row.artifactToolId} className="health-unused">
                    <span className="health-unused-name">
                      {unusedLabel(row, t)}
                    </span>
                    <span className="health-muted">
                      {t(UNUSED_KIND_KEY[row.kind])}
                    </span>
                    <UI.Button
                      size="small"
                      className="small"
                      disabled={disabling !== null}
                      onClick={() => setConfirming(row)}
                    >
                      <span className="button-text">{t('disable')}</span>
                    </UI.Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <UI.Alert
        open={confirming !== null}
        title={
          confirming
            ? t('disableConfirmTitle', { name: unusedLabel(confirming, t) })
            : ''
        }
        description={disableDescription}
        confirmText={t('disable')}
        cancelText={c('cancel')}
        loadingText={t('disabling')}
        loading={disabling !== null}
        onConfirm={() => {
          if (confirming) disable(confirming);
        }}
        onCancel={() => setConfirming(null)}
      />

      <UI.Modal
        open={current !== null}
        title={
          current?.kind === 'calls'
            ? t('callsTitle', { tool: current.label })
            : current?.kind === 'call'
              ? t('callTitle', { tool: current.tool })
              : t('sessionTitle')
        }
        width={720}
        closeLabel={c('close')}
        onClose={close}
        footer={
          stack.length > 1 ? (
            <UI.Button
              variant="contained"
              size="small"
              className="small"
              onClick={back}
            >
              {t('back')}
            </UI.Button>
          ) : undefined
        }
      >
        <HealthModalBody>
          {current?.kind === 'calls' && (
            <CallsView
              key={`calls:${current.tool}`}
              apiBase={apiBase}
              tool={current.tool}
              onOpenCall={id => open({ kind: 'call', id, tool: current.label })}
            />
          )}
          {current?.kind === 'call' && (
            <CallView
              key={`call:${current.id}`}
              apiBase={apiBase}
              id={current.id}
              onOpenSession={id => open({ kind: 'session', id })}
            />
          )}
          {current?.kind === 'session' && (
            <SessionView
              key={`session:${current.id}`}
              apiBase={apiBase}
              id={current.id}
              onOpenCall={(id, tool) => open({ kind: 'call', id, tool })}
            />
          )}
        </HealthModalBody>
      </UI.Modal>
    </HealthCard>
  );
};

const CallsView = ({
  apiBase,
  tool,
  onOpenCall
}: {
  apiBase: string;
  tool: string;
  onOpenCall: (id: string) => void;
}) => {
  const t = i18n.useT(i18n.copy.OVERVIEW);
  const [filter, setFilter] = useState<'all' | 'error'>('all');
  const [entries, setEntries] = useState<CallEntry[]>([]);
  const [status, setStatus] = useState<Status>('pending');
  const [hasMore, setHasMore] = useState(false);
  const limit = utils.constants.OBSERVABILITY_CALLS_DEFAULT_LIMIT;

  const load = async (after?: string, signal?: AbortSignal) => {
    setStatus('pending');
    const query = new URLSearchParams({
      tool,
      status: filter,
      limit: String(limit)
    });
    if (after) query.set('after', after);
    try {
      const result = await utils.fetcher({
        url: `${apiBase}/observability/calls?${query}`,
        config: { credentials: 'include', signal }
      });
      if (signal?.aborted) return;
      if (!result || result.error) throw new Error('rejected');
      const page: CallEntry[] = result.entries;
      setEntries(prev => (after ? [...prev, ...page] : page));
      setHasMore(page.length === limit);
      setStatus('resolved');
    } catch {
      if (!signal?.aborted) setStatus('rejected');
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setEntries([]);
    load(undefined, controller.signal);
    return () => controller.abort();
  }, [filter]);

  return (
    <>
      <div className="health-seg">
        {(['all', 'error'] as const).map(value => (
          <button
            key={value}
            type="button"
            className={`health-seg-btn ${filter === value ? 'active' : ''}`}
            onClick={() => setFilter(value)}
          >
            {t(value === 'all' ? 'filterAll' : 'filterErrors')}
          </button>
        ))}
      </div>
      {status === 'rejected' && entries.length === 0 ? (
        <p className="health-muted">{t('callsLoadFailed')}</p>
      ) : status === 'resolved' && entries.length === 0 ? (
        <p className="health-muted">{t('callsEmpty')}</p>
      ) : (
        <ul className="health-rows">
          {entries.map(entry => (
            <li key={entry.id}>
              <button
                type="button"
                className={`health-row ${entry.errorMessage ? 'is-error' : ''}`}
                onClick={() => onOpenCall(entry.id)}
              >
                <span className="health-row-main">
                  <span className="health-row-title health-preview">
                    {entry.errorMessage || entry.inputPreview || '{}'}
                  </span>
                  <span className="health-muted">
                    {entry.via === 'channel'
                      ? t('viaChannel', {
                          platform: platformLabel(entry.platform)
                        })
                      : entry.clientName || t('viaMcp')}
                  </span>
                </span>
                <span className="health-muted">
                  {entry.latencyMs != null
                    ? t('latencyMs', { ms: t.n(entry.latencyMs) })
                    : ''}
                </span>
                <span className="health-muted">
                  {t.relativeShort(entry.createdAt)}
                </span>
              </button>
            </li>
          ))}
          {status === 'pending' && (
            <CallRowsSkeleton rows={entries.length ? 2 : 5} />
          )}
        </ul>
      )}
      {hasMore && status !== 'pending' && (
        <UI.Button
          size="small"
          className="small"
          onClick={() => load(entries[entries.length - 1]?.id)}
        >
          <span className="button-text">{t('loadMore')}</span>
        </UI.Button>
      )}
    </>
  );
};

const CallView = ({
  apiBase,
  id,
  onOpenSession
}: {
  apiBase: string;
  id: string;
  onOpenSession: (id: string) => void;
}) => {
  const router = useRouter();
  const t = i18n.useT(i18n.copy.OVERVIEW);
  const snackbar = UI.Alert.useSnackbar();
  const [call, setCall] = useState<CallDetail | null>(null);
  const [status, setStatus] = useState<Status>('pending');

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const result = await utils.fetcher({
          url: `${apiBase}/observability/calls/${id}`,
          config: { credentials: 'include', signal: controller.signal }
        });
        if (controller.signal.aborted) return;
        if (!result || result.error) throw new Error('rejected');
        setCall(result);
        setStatus('resolved');
      } catch {
        if (!controller.signal.aborted) setStatus('rejected');
      }
    })();
    return () => controller.abort();
  }, [id]);

  if (status === 'rejected') {
    return <p className="health-muted">{t('callLoadFailed')}</p>;
  }
  if (!call) {
    return <CallSkeleton />;
  }

  const conversation = call.session.channel;
  const copied = () => snackbar.success(t('toastCopied'));
  const result = resultText(call.output);

  return (
    <>
      <div className="health-call-head">
        <p className="health-muted">
          {[
            t.date(call.createdAt, {
              dateStyle: 'medium',
              timeStyle: 'medium'
            }),
            whoRan(call.session, t),
            call.latencyMs != null
              ? t('latencyMs', { ms: t.n(call.latencyMs) })
              : call.errorMessage
                ? t('callRejected')
                : null
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      {call.errorMessage && (
        <UI.CopyableBlock
          label={t('labelError')}
          text={call.errorMessage}
          variant="error"
          onCopy={copied}
        />
      )}
      {call.input != null && (
        <UI.CopyableBlock
          label={t('labelArguments')}
          text={JSON.stringify(call.input, null, 2)}
          onCopy={copied}
        />
      )}
      {result && (
        <UI.CopyableBlock
          label={t('labelResult')}
          text={result}
          onCopy={copied}
        />
      )}
      <div className="health-actions">
        <UI.Button
          size="small"
          className="small"
          onClick={() => onOpenSession(call.session.id)}
        >
          <TimelineOutlined />
          <span className="button-text">{t('openSession')}</span>
        </UI.Button>
        {conversation?.channelId && conversation.conversationId && (
          <UI.Button
            size="small"
            className="small"
            onClick={() =>
              router.push({
                pathname: '/organization/[id]/project/[projectId]/channels',
                query: {
                  id: router.query.id,
                  projectId: router.query.projectId,
                  channel: conversation.channelId,
                  conversation: conversation.conversationId
                }
              })
            }
          >
            <OpenInNew />
            <span className="button-text">{t('openConversation')}</span>
          </UI.Button>
        )}
      </div>
    </>
  );
};

const entryName = (entry: SessionEntry) =>
  entry.toolName || entry.promptId || entry.resourceUri || entry.method;

const SessionView = ({
  apiBase,
  id,
  onOpenCall
}: {
  apiBase: string;
  id: string;
  onOpenCall: (id: string, name: string) => void;
}) => {
  const t = i18n.useT(i18n.copy.OVERVIEW);
  const [replay, setReplay] = useState<SessionReplay | null>(null);
  const [status, setStatus] = useState<Status>('pending');

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const result = await utils.fetcher({
          url: `${apiBase}/observability/sessions/${id}`,
          config: { credentials: 'include', signal: controller.signal }
        });
        if (controller.signal.aborted) return;
        if (!result || result.error) throw new Error('rejected');
        setReplay(result);
        setStatus('resolved');
      } catch {
        if (!controller.signal.aborted) setStatus('rejected');
      }
    })();
    return () => controller.abort();
  }, [id]);

  if (status === 'rejected') {
    return <p className="health-muted">{t('sessionLoadFailed')}</p>;
  }
  if (!replay) {
    return <SessionSkeleton />;
  }

  const methodLabel = (entry: SessionEntry) => {
    if (entry.method === utils.constants.MCP_REQUEST_METHOD_PROMPTS_GET) {
      return t('methodPrompt');
    }
    if (entry.method === utils.constants.MCP_REQUEST_METHOD_RESOURCES_READ) {
      return t('methodResource');
    }
    return null;
  };

  return (
    <>
      <div className="health-call-head">
        <p className="health-call-title">{whoRan(replay.session, t)}</p>
        <p className="health-muted">
          {t.date(replay.session.createdAt, {
            dateStyle: 'medium',
            timeStyle: 'short'
          })}
          {' · '}
          {t('sessionHelp')}
        </p>
        {replay.truncated && (
          <p className="health-muted">
            {t('sessionTruncated', {
              count: t.n(utils.constants.OBSERVABILITY_SESSION_MAX_CALLS)
            })}
          </p>
        )}
      </div>
      {replay.entries.length === 0 ? (
        <p className="health-muted">{t('sessionEmpty')}</p>
      ) : (
        <ol className="health-timeline">
          {replay.entries.map(entry => {
            const kind = methodLabel(entry);
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`health-row ${entry.errorMessage ? 'is-error' : ''}`}
                  onClick={() => onOpenCall(entry.id, entryName(entry))}
                >
                  <span className="health-time">
                    {t.date(entry.createdAt, { timeStyle: 'medium' })}
                  </span>
                  <span className="health-row-main">
                    <span className="health-row-title">
                      {kind && <span className="health-badge">{kind}</span>}
                      <code>{entryName(entry)}</code>
                    </span>
                    <span className="health-muted health-preview">
                      {entry.errorMessage || entry.inputPreview || ''}
                    </span>
                  </span>
                  <span className="health-muted">
                    {entry.latencyMs != null
                      ? t('latencyMs', { ms: t.n(entry.latencyMs) })
                      : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
};
