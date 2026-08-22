import { useEffect, useMemo, useState } from 'react';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import { Close, ExpandMore, ExpandLess, LinkOff } from '@mui/icons-material';

import { ModalDialog, ModalOverlay } from './styles';

interface McpServer {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  transport: string;
  authKind: string;
}

interface ArtifactTool {
  id: string;
  config: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  toolKey: string;
  // Off keeps the install, its credential and its allow-list; only Disconnect
  // deletes them.
  enabled: boolean;
}

interface DiscoveredTool {
  name: string;
  title?: string;
  description?: string;
}
interface DiscoveredResource {
  uri: string;
  name?: string;
  title?: string;
  description?: string;
}
interface DiscoveredPrompt {
  name: string;
  title?: string;
  description?: string;
}
interface Discovery {
  tools: DiscoveredTool[];
  resources: DiscoveredResource[];
  prompts: DiscoveredPrompt[];
}

interface Props {
  server: McpServer;
  // The mcp-proxy tool_definition id (needed to create a new install).
  toolKey: string;
  // The installed artifact_tool for this server, or null to connect fresh.
  existingTool: ArtifactTool | null;
  apiBase: string;
  toolApiBase: string;
  credentialApiBase: string;
  snackbar: { success: (m: string) => void; error: (m: string) => void };
  onClose: () => void;
  onSaved: () => void;
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const readDiscovery = (metadata: unknown): Discovery => {
  const d =
    metadata && typeof metadata === 'object'
      ? (metadata as { discovery?: unknown }).discovery
      : null;
  const obj = d && typeof d === 'object' ? (d as Record<string, unknown>) : {};
  return {
    tools: Array.isArray(obj.tools) ? (obj.tools as DiscoveredTool[]) : [],
    resources: Array.isArray(obj.resources)
      ? (obj.resources as DiscoveredResource[])
      : [],
    prompts: Array.isArray(obj.prompts)
      ? (obj.prompts as DiscoveredPrompt[])
      : []
  };
};

export const McpProxyModal = ({
  server,
  toolKey,
  existingTool,
  apiBase,
  toolApiBase,
  credentialApiBase,
  snackbar,
  onClose,
  onSaved
}: Props) => {
  const existingConfig = (existingTool?.config || {}) as Record<string, any>;
  const editing = !!existingTool;

  // The connect form follows the curated server's auth kind rather than assuming
  // bearer: `none` needs no token, `bearer` takes one, `header` also needs the
  // header name to send it in, and `oauth` runs the provider's OAuth flow (the
  // catalog slug doubles as the OAuth provider key).
  const authKind = server.authKind;
  const needsToken =
    authKind === utils.constants.MCP_PROXY_AUTH_KIND_BEARER ||
    authKind === utils.constants.MCP_PROXY_AUTH_KIND_HEADER;
  const needsHeaderName =
    authKind === utils.constants.MCP_PROXY_AUTH_KIND_HEADER;
  const isOauth = authKind === utils.constants.MCP_PROXY_AUTH_KIND_OAUTH;

  // From an existing install we already have the full discovered set (stored on
  // metadata.discovery) and the enabled subset (config.allowed*), so jump
  // straight to selection. A fresh connect starts at the token step.
  const initialDiscovery = useMemo(
    () => (editing ? readDiscovery(existingTool?.metadata) : null),
    [editing, existingTool]
  );

  const [phase, setPhase] = useState<'connect' | 'select'>(
    editing ? 'select' : 'connect'
  );
  // The validated token (kept in memory only until the user saves). On edit the
  // credential already exists, so we never re-enter it.
  const [pat, setPat] = useState('');
  const [credentialId] = useState<string>(
    editing ? existingConfig.auth?.credentialId || '' : ''
  );
  // Only used for `header` auth; pre-filled from the stored config on edit.
  const [headerName, setHeaderName] = useState<string>(
    editing ? existingConfig.auth?.name || '' : ''
  );
  // oauth only: the credential id resolved by the discover endpoint (the secret
  // is never sent to the client). On edit it comes from the stored config.
  const [resolvedCredentialId, setResolvedCredentialId] = useState<string>(
    editing ? existingConfig.auth?.credentialId || '' : ''
  );
  // oauth only: true once we know there's no usable connection yet, so the UI
  // shows a "Connect" (run OAuth) button instead of the tool list.
  const [needsOauth, setNeedsOauth] = useState(false);
  // oauth only: the initial "is there already a connection?" probe is running.
  const [checkingOauth, setCheckingOauth] = useState(isOauth && !editing);

  const [discovery, setDiscovery] = useState<Discovery | null>(
    initialDiscovery
  );
  const [enabledTools, setEnabledTools] = useState<Set<string>>(() => {
    if (!editing) return new Set();
    const allow = asStringArray(existingConfig.allowedTools);
    // Absent allow-list = all enabled; otherwise just the listed ones.
    return allow.length
      ? new Set(allow)
      : new Set(readDiscovery(existingTool?.metadata).tools.map(t => t.name));
  });
  const [enabledResources, setEnabledResources] = useState<Set<string>>(
    () => new Set(asStringArray(existingConfig.allowedResources))
  );
  const [enabledPrompts, setEnabledPrompts] = useState<Set<string>>(
    () => new Set(asStringArray(existingConfig.allowedPrompts))
  );

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (
    setter: (fn: (prev: Set<string>) => Set<string>) => void,
    key: string
  ) =>
    setter(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  // Validate the token by listing the server's tools with it INLINE — nothing is
  // stored. A bad token surfaces here as an error; only on save do we persist.
  const handleConnect = async () => {
    if (busy) return;
    if (isOauth) {
      return setError("This server can't be connected from here yet.");
    }
    const token = pat.trim();
    if (needsToken && !token) return setError('Enter a token to connect.');
    if (needsHeaderName && !headerName.trim()) {
      return setError('Enter the header name the server expects.');
    }
    setError(null);
    setBusy(true);
    try {
      const result = await utils.fetcher({
        url: `${apiBase}/mcp-proxy/discover`,
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({
            curatedServerId: server.id,
            // `none` servers list unauthenticated; only send what the kind needs.
            ...(needsToken ? { token } : {}),
            ...(needsHeaderName ? { headerName: headerName.trim() } : {})
          })
        }
      });
      if (!result || result.error || !Array.isArray(result.tools)) {
        setError(
          result?.error ||
            'Could not list tools with this token. Check it and try again.'
        );
        return;
      }
      const disc: Discovery = {
        tools: result.tools,
        resources: Array.isArray(result.resources) ? result.resources : [],
        prompts: Array.isArray(result.prompts) ? result.prompts : []
      };
      setDiscovery(disc);
      // Default: all tools on, resources/prompts off (opt-in).
      setEnabledTools(new Set(disc.tools.map(t => t.name)));
      setEnabledResources(new Set());
      setEnabledPrompts(new Set());
      setPhase('select');
    } catch {
      setError('Could not connect to the server.');
    } finally {
      setBusy(false);
    }
  };

  // For oauth servers, probe on open: if a connection already exists the
  // discover endpoint returns the tool list (jump to selection); otherwise it
  // returns { needsOauth } and we show the Connect button.
  useEffect(() => {
    if (!isOauth || editing) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await utils.fetcher({
          url: `${apiBase}/mcp-proxy/discover`,
          config: {
            method: 'POST',
            credentials: 'include',
            body: JSON.stringify({ curatedServerId: server.id })
          }
        });
        if (cancelled) return;
        if (result?.needsOauth || !Array.isArray(result?.tools)) {
          setNeedsOauth(true);
          return;
        }
        setResolvedCredentialId(result.credentialId || '');
        setDiscovery({
          tools: result.tools,
          resources: Array.isArray(result.resources) ? result.resources : [],
          prompts: Array.isArray(result.prompts) ? result.prompts : []
        });
        setEnabledTools(
          new Set(result.tools.map((t: DiscoveredTool) => t.name))
        );
        setEnabledResources(new Set());
        setEnabledPrompts(new Set());
        setPhase('select');
      } catch {
        if (!cancelled) setNeedsOauth(true);
      } finally {
        if (!cancelled) setCheckingOauth(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOauth, editing, apiBase, server.id]);

  // Kick off the provider OAuth flow. The API returns the authorize URL; we do
  // a full-page redirect (like native OAuth tools). On return the tools page
  // re-opens this modal (?connected=<slug>) and the probe above finds the new
  // credential.
  const handleOauthConnect = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // MCP-protocol OAuth: the API discovers the server's auth server, registers
      // a client dynamically, and returns the PKCE authorize URL to redirect to.
      const data = await utils.fetcher({
        url: `${apiBase}/mcp-proxy/oauth/start`,
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ curatedServerId: server.id })
        }
      });
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setError(data?.error || `Could not start the ${server.name} connection.`);
      setBusy(false);
    } catch {
      setError(`Could not start the ${server.name} connection.`);
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (busy || !discovery) return;
    if (enabledTools.size === 0) {
      return setError('Enable at least one tool.');
    }
    if (isOauth && !resolvedCredentialId) {
      return setError(`Connect ${server.name} first.`);
    }
    setError(null);
    setBusy(true);
    try {
      // oauth uses the credential resolved by the discover probe; token kinds
      // use the one entered on this modal. For a fresh connect that needs a
      // token, persist the (already-validated) token now — only once the user
      // commits — so we never store a token we don't end up using. `none`
      // servers create no credential.
      let credId = isOauth ? resolvedCredentialId : credentialId;
      if (!editing && needsToken) {
        const created = await utils.fetcher({
          url: credentialApiBase,
          config: {
            method: 'POST',
            credentials: 'include',
            body: JSON.stringify({
              provider: utils.constants.CREDENTIAL_PROVIDER_MCP_PROXY,
              apiKey: pat.trim(),
              label: server.name
            })
          }
        });
        if (!created?.id) {
          setError(created?.error || 'Failed to save the token.');
          setBusy(false);
          return;
        }
        credId = created.id;
      }

      // Shape auth to match the server's kind (the backend re-validates and
      // enforces the credential type). `header` also carries the header name.
      const auth =
        authKind === utils.constants.MCP_PROXY_AUTH_KIND_NONE
          ? { kind: utils.constants.MCP_PROXY_AUTH_KIND_NONE }
          : authKind === utils.constants.MCP_PROXY_AUTH_KIND_HEADER
            ? {
                kind: utils.constants.MCP_PROXY_AUTH_KIND_HEADER,
                name: headerName.trim(),
                credentialId: credId
              }
            : authKind === utils.constants.MCP_PROXY_AUTH_KIND_OAUTH
              ? {
                  kind: utils.constants.MCP_PROXY_AUTH_KIND_OAUTH,
                  credentialId: credId
                }
              : {
                  kind: utils.constants.MCP_PROXY_AUTH_KIND_BEARER,
                  credentialId: credId
                };

      const config = {
        ...(editing ? existingConfig : {}),
        curatedServerId: server.id,
        auth,
        allowedTools: Array.from(enabledTools),
        allowedResources: Array.from(enabledResources),
        allowedPrompts: Array.from(enabledPrompts)
      };
      const data = await utils.fetcher({
        url: editing ? `${toolApiBase}/${existingTool!.id}` : toolApiBase,
        config: {
          method: editing ? 'PUT' : 'POST',
          credentials: 'include',
          body: JSON.stringify(editing ? { config } : { toolKey, config })
        }
      });
      if (data && !data.error) {
        snackbar.success(
          editing ? `${server.name} updated` : `${server.name} connected`
        );
        onSaved();
        onClose();
      } else {
        setError(data?.error || 'Failed to save.');
      }
    } catch {
      setError('Failed to save.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (busy || !existingTool) return;
    setBusy(true);
    try {
      const data = await utils.fetcher({
        url: `${toolApiBase}/${existingTool.id}`,
        config: { method: 'DELETE', credentials: 'include' }
      });
      if (data && !data.error) {
        snackbar.success(`${server.name} disconnected`);
        onSaved();
        onClose();
      } else {
        setError(data?.error || 'Failed to disconnect.');
      }
    } catch {
      setError('Failed to disconnect.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Turn the whole server off without disconnecting it.
   *
   * Disconnect deletes the install — the credential, the allow-list, the
   * discovery snapshot. Off keeps all of it and simply stops the boot loop
   * registering these tools, which is what someone reaching for a shorter tool
   * list actually wants: the way back is one switch, not another OAuth round
   * trip.
   */
  const handleToggleEnabled = async (enabled: boolean) => {
    if (busy || !existingTool) return;
    setBusy(true);
    try {
      const data = await utils.fetcher({
        url: `${toolApiBase}/${existingTool.id}/enabled`,
        config: {
          method: 'PATCH',
          credentials: 'include',
          body: JSON.stringify({ enabled })
        }
      });
      if (data && !data.error) {
        snackbar.success(
          enabled ? `${server.name} enabled` : `${server.name} turned off`
        );
        onSaved();
        onClose();
      } else {
        setError(data?.error || 'Failed to update.');
      }
    } catch {
      setError('Failed to update.');
    } finally {
      setBusy(false);
    }
  };

  const setAllTools = (on: boolean) =>
    setEnabledTools(
      on ? new Set((discovery?.tools || []).map(t => t.name)) : new Set()
    );

  return (
    <UI.Portal>
      <ModalOverlay onClick={handleClose}>
        <ModalDialog
          role="dialog"
          className="http-endpoint-dialog"
          onClick={e => e.stopPropagation()}
        >
          <div className="tools-modal-header">
            <h2 className="tools-modal-title">
              {editing ? `${server.name} tools` : `Connect ${server.name}`}
            </h2>
            <IconButton size="small" onClick={handleClose} disabled={busy}>
              <Close />
            </IconButton>
          </div>
          <div className="tools-modal-body http-endpoint-form">
            {phase === 'connect' ? (
              isOauth ? (
                <p className="tools-configure-help">
                  {checkingOauth
                    ? `Checking your ${server.name} connection…`
                    : `${
                        server.description ||
                        `Connect ${server.name} to expose its tools to the assistant.`
                      } You'll be redirected to ${server.name} to authorize, then brought back here to pick tools.`}
                </p>
              ) : needsToken ? (
                <>
                  <p className="tools-configure-help">
                    {server.description ||
                      `Connect ${server.name} to expose its tools to the assistant.`}{' '}
                    Paste a token — it's encrypted at rest and never shown
                    again.
                  </p>
                  {needsHeaderName && (
                    <UI.Input
                      label="Header name"
                      value={headerName}
                      disabled={busy}
                      helperText="The HTTP header the server expects the token in (e.g. X-Api-Key)."
                      onChange={e => {
                        setHeaderName(e.target.value);
                        if (error) setError(null);
                      }}
                    />
                  )}
                  <UI.Input
                    label={`${server.name} token`}
                    type="password"
                    value={pat}
                    disabled={busy}
                    autoFocus
                    helperText="A personal access token with the scopes you want the assistant to use."
                    onChange={e => {
                      setPat(e.target.value);
                      if (error) setError(null);
                    }}
                  />
                </>
              ) : (
                <p className="tools-configure-help">
                  {server.description ||
                    `Connect ${server.name} to expose its tools to the assistant.`}{' '}
                  This server needs no token — continue to list its tools.
                </p>
              )
            ) : (
              <>
                <div className="mcp-proxy-list-head">
                  <p className="http-endpoint-section">
                    Tools ({enabledTools.size}/{discovery?.tools.length || 0})
                  </p>
                  <div className="mcp-proxy-list-actions">
                    <UI.Button
                      size="small"
                      disabled={busy}
                      onClick={() => setAllTools(true)}
                    >
                      <span className="button-text">All</span>
                    </UI.Button>
                    <UI.Button
                      size="small"
                      disabled={busy}
                      onClick={() => setAllTools(false)}
                    >
                      <span className="button-text">None</span>
                    </UI.Button>
                  </div>
                </div>
                <p className="http-endpoint-list-hint">
                  Choose which of {server.name}'s tools the assistant can call.
                </p>
                <div className="mcp-proxy-tool-list">
                  {(discovery?.tools || []).map(t => (
                    <div key={t.name} className="mcp-proxy-item">
                      <div className="mcp-proxy-item-main">
                        <p className="mcp-proxy-item-title">
                          {t.title || t.name}
                        </p>
                        {t.description && (
                          <p className="mcp-proxy-item-description">
                            {t.description}
                          </p>
                        )}
                      </div>
                      <Switch
                        checked={enabledTools.has(t.name)}
                        disabled={busy}
                        onChange={() => toggle(setEnabledTools, t.name)}
                      />
                    </div>
                  ))}
                </div>
                {(discovery?.resources.length || discovery?.prompts.length) >
                  0 && (
                  <div className="http-endpoint-advanced">
                    <button
                      type="button"
                      className="http-endpoint-advanced-toggle"
                      onClick={() => setShowAdvanced(v => !v)}
                    >
                      {showAdvanced ? <ExpandLess /> : <ExpandMore />}
                      Resources & prompts (optional)
                    </button>
                    {showAdvanced && (
                      <div className="http-endpoint-advanced-content">
                        {(discovery?.resources.length || 0) > 0 && (
                          <>
                            <p className="http-endpoint-section">
                              Resources ({enabledResources.size}/
                              {discovery?.resources.length})
                            </p>
                            <div className="mcp-proxy-tool-list">
                              {discovery?.resources.map(r => (
                                <div key={r.uri} className="mcp-proxy-item">
                                  <div className="mcp-proxy-item-main">
                                    <p className="mcp-proxy-item-title">
                                      {r.title || r.name || r.uri}
                                    </p>
                                    {r.description && (
                                      <p className="mcp-proxy-item-description">
                                        {r.description}
                                      </p>
                                    )}
                                  </div>
                                  <Switch
                                    checked={enabledResources.has(r.uri)}
                                    disabled={busy}
                                    onChange={() =>
                                      toggle(setEnabledResources, r.uri)
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                        {(discovery?.prompts.length || 0) > 0 && (
                          <>
                            <p className="http-endpoint-section">
                              Prompts ({enabledPrompts.size}/
                              {discovery?.prompts.length})
                            </p>
                            <div className="mcp-proxy-tool-list">
                              {discovery?.prompts.map(p => (
                                <div key={p.name} className="mcp-proxy-item">
                                  <div className="mcp-proxy-item-main">
                                    <p className="mcp-proxy-item-title">
                                      {p.title || p.name}
                                    </p>
                                    {p.description && (
                                      <p className="mcp-proxy-item-description">
                                        {p.description}
                                      </p>
                                    )}
                                  </div>
                                  <Switch
                                    checked={enabledPrompts.has(p.name)}
                                    disabled={busy}
                                    onChange={() =>
                                      toggle(setEnabledPrompts, p.name)
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                        <p className="http-endpoint-list-hint">
                          Resources and prompts are off by default — only the
                          ones you enable here are exposed to the assistant.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {error && <p className="http-endpoint-error">{error}</p>}
          </div>
          <div className="tools-modal-actions">
            {editing && existingTool && (
              <label className="tools-modal-toggle">
                <Switch
                  size="small"
                  checked={existingTool.enabled}
                  disabled={busy}
                  onChange={(_, checked) => handleToggleEnabled(checked)}
                />
                <span>
                  {existingTool.enabled ? 'Exposed' : 'Off'}
                  <small>
                    {existingTool.enabled
                      ? 'These tools are on your MCP server'
                      : 'Kept, but not on your MCP server'}
                  </small>
                </span>
              </label>
            )}
            {editing && (
              <UI.Button
                size="small"
                className="mcp-proxy-disconnect"
                disabled={busy}
                onClick={handleDisconnect}
              >
                <LinkOff fontSize="small" />
                <span className="button-text">Disconnect</span>
              </UI.Button>
            )}
            <UI.Button size="small" disabled={busy} onClick={handleClose}>
              Cancel
            </UI.Button>
            {phase === 'connect' && isOauth ? (
              <UI.Button
                variant="contained"
                size="small"
                disabled={busy || checkingOauth}
                onClick={handleOauthConnect}
              >
                {busy
                  ? 'Redirecting…'
                  : checkingOauth
                    ? 'Checking…'
                    : `Connect ${server.name}`}
              </UI.Button>
            ) : phase === 'connect' ? (
              <UI.Button
                variant="contained"
                size="small"
                disabled={
                  busy ||
                  (needsToken && !pat.trim()) ||
                  (needsHeaderName && !headerName.trim())
                }
                onClick={handleConnect}
              >
                {busy ? 'Connecting...' : 'Connect & list tools'}
              </UI.Button>
            ) : (
              <UI.Button
                variant="contained"
                size="small"
                disabled={busy}
                onClick={handleSave}
              >
                {busy
                  ? 'Saving...'
                  : editing
                    ? 'Save'
                    : `Connect ${server.name}`}
              </UI.Button>
            )}
          </div>
        </ModalDialog>
      </ModalOverlay>
    </UI.Portal>
  );
};
