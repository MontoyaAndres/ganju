import { useMemo, useState } from 'react';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import { Close, DeleteOutlined, Add, Warning } from '@mui/icons-material';

import { ModalDialog, ModalOverlay } from './styles';
import { i18n } from '../../../lib';

/**
 * Everything a script may reach that is not its own code.
 *
 * The runtime for all of this shipped with the broker — `ctx.connection`,
 * `ctx.secret` and `ctx.sendFile` have worked end to end since Phase 5 — and
 * none of it could be used by anyone working in the dashboard, because the
 * fields it reads had no form. Monaco completed all three from the SDK's real
 * declarations, and the runtime refused them with *"add it to the tool's
 * connections and publish a new version"* of a place that did not exist. This
 * is that place.
 *
 * The two halves save differently, and deliberately look like it:
 *
 *  - **Capabilities** write `artifact_tool.config`, so they need the row a first
 *    draft creates, and they save together behind one button.
 *  - **Secrets** are `artifact_credential` rows scoped to the artifact, not to
 *    the tool. They need no row, no code and no deploy, so each acts on its own
 *    the moment it is added or removed — which is also the honest rendering of
 *    what happens, since a stored secret is live from the next call.
 */

export interface ArtifactConnection {
  provider: string;
  credentialId: string | null;
  connected: boolean;
  needsReauth: boolean;
  configured: boolean;
}

export interface CustomCodeSecret {
  id: string;
  provider: string;
  metadata?: { label?: string } | null;
}

export interface CustomCodeConfig {
  connections?: string[];
  allowedHosts?: string[];
  timeoutMs?: number;
  resourceAccess?: string;
}

interface Props {
  // The stored config, or null when no custom-code row exists yet — which is
  // every artifact until its first draft.
  config: CustomCodeConfig | null;
  // Every managed provider and where this artifact stands with it.
  connections: ArtifactConnection[];
  // Already filtered to `provider = 'custom-code'` by the caller.
  secrets: CustomCodeSecret[];
  credentialApiBase: string;
  // Reuses the tools view's own provider naming, so a connection reads the same
  // here as on the card that established it.
  getProviderLabel: (provider: string) => string;
  // Persists the config through the generic tool route. Resolves false when the
  // server refused, having already said why.
  onSaveConfig: (config: CustomCodeConfig) => Promise<boolean>;
  // Reload the page's credentials after a secret is added or removed.
  onSecretsChanged: () => Promise<void> | void;
  snackbar: { success: (m: string) => void; error: (m: string) => void };
  onClose: () => void;
}

const SECRET_NAME = /^[A-Za-z0-9_-]+$/;

const splitList = (value: string): string[] =>
  value
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean);

const labelOf = (secret: CustomCodeSecret): string =>
  typeof secret.metadata?.label === 'string' ? secret.metadata.label : '';

export const FunctionSettingsModal = ({
  config,
  connections,
  secrets,
  credentialApiBase,
  getProviderLabel,
  onSaveConfig,
  onSecretsChanged,
  snackbar,
  onClose
}: Props) => {
  const t = i18n.useT(i18n.copy.TOOLS);
  const c = i18n.useT(i18n.copy.COMMON);

  // No row yet means there is no config to write. Secrets are unaffected, which
  // is why this disables one half of the dialog rather than the whole of it.
  const editable = config !== null;

  const [declared, setDeclared] = useState<Set<string>>(
    () => new Set(config?.connections || [])
  );
  const [allowedHosts, setAllowedHosts] = useState(
    (config?.allowedHosts || []).join(', ')
  );
  const [timeoutMs, setTimeoutMs] = useState(
    config?.timeoutMs ? String(config.timeoutMs) : ''
  );
  const [resourceAccess, setResourceAccess] = useState(
    config?.resourceAccess || utils.constants.CUSTOM_CODE_RESOURCE_ACCESS_OWN
  );
  const [saving, setSaving] = useState(false);

  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<CustomCodeSecret | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);

  const providerLabel = (provider: string) =>
    i18n.catalogCopy(
      t.lang,
      `provider.${provider}`,
      getProviderLabel(provider)
    ) || provider;

  const resourceAccessOptions = useMemo(
    () => [
      {
        value: utils.constants.CUSTOM_CODE_RESOURCE_ACCESS_OWN,
        label: t('settingsResourceAccessOwn')
      },
      {
        value: utils.constants.CUSTOM_CODE_RESOURCE_ACCESS_ALL,
        label: t('settingsResourceAccessAll')
      }
    ],
    [t]
  );

  const toggleConnection = (provider: string) =>
    setDeclared(prev => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });

  const save = async () => {
    if (!editable || saving) return;
    setSaving(true);
    // Empty means "no restriction" for hosts and "the default" for the timeout,
    // so both are omitted rather than sent as an empty value the schema would
    // have to grow a meaning for.
    const next: CustomCodeConfig = {
      connections: Array.from(declared),
      ...(allowedHosts.trim()
        ? { allowedHosts: splitList(allowedHosts) }
        : { allowedHosts: [] }),
      ...(timeoutMs.trim() ? { timeoutMs: Number(timeoutMs) } : {}),
      resourceAccess
    };
    const ok = await onSaveConfig(next);
    setSaving(false);
    if (ok) {
      snackbar.success(t('settingsOkSaved'));
      onClose();
    }
  };

  const addSecret = async () => {
    if (adding) return;
    const name = secretName.trim();
    if (!SECRET_NAME.test(name))
      return setSecretError(t('settingsErrSecretName'));
    if (!secretValue.trim()) return setSecretError(t('settingsErrSecretValue'));
    if (secrets.some(secret => labelOf(secret) === name)) {
      return setSecretError(t('settingsErrSecretTaken'));
    }

    setSecretError(null);
    setAdding(true);
    try {
      const created = await utils.fetcher({
        url: credentialApiBase,
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({
            provider: utils.constants.CREDENTIAL_PROVIDER_CUSTOM_CODE,
            apiKey: secretValue,
            label: name
          })
        }
      });
      if (!created?.id) {
        setSecretError(created?.error || t('settingsErrAddSecret'));
        return;
      }
      setSecretName('');
      setSecretValue('');
      await onSecretsChanged();
      snackbar.success(t('settingsOkSecretAdded'));
    } catch {
      setSecretError(t('settingsErrAddSecret'));
    } finally {
      setAdding(false);
    }
  };

  const removeSecret = async () => {
    if (!removing || removingBusy) return;
    setRemovingBusy(true);
    try {
      const data = await utils.fetcher({
        url: `${credentialApiBase}/${removing.id}`,
        config: { method: 'DELETE', credentials: 'include' }
      });
      if (data?.error) {
        snackbar.error(data.error);
        return;
      }
      await onSecretsChanged();
      snackbar.success(t('settingsOkSecretRemoved'));
    } catch {
      snackbar.error(t('settingsErrRemoveSecret'));
    } finally {
      setRemovingBusy(false);
      setRemoving(null);
    }
  };

  // What a provider's row says about itself. `configured` comes first because a
  // deployment missing the client id and secret cannot connect that provider
  // however the rest of the UI renders it — a "Not connected" chip there would
  // invite a Connect click that can never work.
  const connectionState = (connection: ArtifactConnection) => {
    if (!connection.configured) return t('settingsConnectionUnavailable');
    if (connection.needsReauth) return t('settingsConnectionNeedsReauth');
    return connection.connected
      ? t('settingsConnectionConnected')
      : t('settingsConnectionNotConnected');
  };

  return (
    <>
      <UI.Portal>
        <ModalOverlay onClick={() => !saving && onClose()}>
          <ModalDialog
            role="dialog"
            className="http-endpoint-dialog"
            onClick={e => e.stopPropagation()}
          >
            <div className="tools-modal-header">
              <h2 className="tools-modal-title">{t('settingsTitle')}</h2>
              <IconButton size="small" onClick={onClose} disabled={saving}>
                <Close />
              </IconButton>
            </div>
            <div className="tools-modal-body http-endpoint-form">
              <p className="tools-configure-help">{t('settingsSubtitle')}</p>

              {!editable && (
                <div className="tools-settings-notice">
                  <Warning />
                  <span>{t('settingsNeedsDraft')}</span>
                </div>
              )}

              <p className="http-endpoint-section">
                {t('settingsConnections')}
              </p>
              <p className="http-endpoint-list-hint">
                {t('settingsConnectionsHelp')}
              </p>
              <div className="mcp-proxy-tool-list">
                {connections.map(connection => (
                  <div key={connection.provider} className="mcp-proxy-item">
                    <div className="mcp-proxy-item-main">
                      <p className="mcp-proxy-item-title">
                        {providerLabel(connection.provider)}
                      </p>
                      <p className="mcp-proxy-item-description">
                        {connectionState(connection)}
                      </p>
                    </div>
                    <Switch
                      checked={declared.has(connection.provider)}
                      disabled={!editable || saving}
                      onChange={() => toggleConnection(connection.provider)}
                    />
                  </div>
                ))}
              </div>
              <p className="http-endpoint-list-hint">
                {t('settingsConnectionsNote')}
              </p>

              <p className="http-endpoint-section">{t('settingsSecrets')}</p>
              <p className="http-endpoint-list-hint">
                {t('settingsSecretsHelp')}
              </p>
              {secrets.length === 0 ? (
                <p className="tools-settings-empty">
                  {t('settingsSecretsEmpty')}
                </p>
              ) : (
                <div className="mcp-proxy-tool-list">
                  {secrets.map(secret => (
                    <div key={secret.id} className="mcp-proxy-item">
                      <div className="mcp-proxy-item-main">
                        <p className="tools-settings-secret-name">
                          {labelOf(secret)}
                        </p>
                      </div>
                      <IconButton
                        size="small"
                        disabled={adding}
                        onClick={() => setRemoving(secret)}
                      >
                        <DeleteOutlined fontSize="small" />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
              <div className="tools-settings-secret-add">
                <UI.Input
                  label={t('settingsSecretName')}
                  value={secretName}
                  placeholder={t('settingsSecretNamePlaceholder')}
                  disabled={adding}
                  onChange={e => {
                    setSecretName(e.target.value);
                    if (secretError) setSecretError(null);
                  }}
                />
                <UI.Input
                  label={t('settingsSecretValue')}
                  type="password"
                  value={secretValue}
                  disabled={adding}
                  onChange={e => {
                    setSecretValue(e.target.value);
                    if (secretError) setSecretError(null);
                  }}
                />
                <UI.Button
                  size="small"
                  disabled={adding || !secretName.trim() || !secretValue.trim()}
                  onClick={addSecret}
                >
                  <Add fontSize="small" />
                  <span className="button-text">
                    {adding ? t('settingsAdding') : t('settingsAddSecret')}
                  </span>
                </UI.Button>
              </div>
              {secretError && (
                <p className="http-endpoint-error">{secretError}</p>
              )}

              <p className="http-endpoint-section">{t('settingsLimits')}</p>
              {/* Full width on its own: a comma-separated host list is the one
                  field here that grows with what is typed into it. */}
              <UI.Input
                label={t('settingsAllowedHosts')}
                value={allowedHosts}
                disabled={!editable || saving}
                helperText={t('settingsAllowedHostsHelp')}
                onChange={e => setAllowedHosts(e.target.value)}
              />
              <div className="http-endpoint-row">
                <UI.Input
                  label={t('settingsTimeout')}
                  type="number"
                  value={timeoutMs}
                  disabled={!editable || saving}
                  helperText={t('settingsTimeoutHelp', {
                    default: utils.constants.CUSTOM_CODE_DEFAULT_TIMEOUT_MS,
                    max: utils.constants.CUSTOM_CODE_MAX_TIMEOUT_MS
                  })}
                  onChange={e => setTimeoutMs(e.target.value)}
                />
                <UI.Select
                  label={t('settingsResourceAccess')}
                  value={resourceAccess}
                  options={resourceAccessOptions}
                  disabled={!editable || saving}
                  helperText={t('settingsResourceAccessHelp')}
                  onChange={e => setResourceAccess(e.target.value)}
                />
              </div>
            </div>
            <div className="tools-modal-actions">
              <UI.Button size="small" disabled={saving} onClick={onClose}>
                {c('cancel')}
              </UI.Button>
              <UI.Button
                variant="contained"
                size="small"
                disabled={!editable || saving}
                onClick={save}
              >
                {saving ? c('saving') : c('save')}
              </UI.Button>
            </div>
          </ModalDialog>
        </ModalOverlay>
      </UI.Portal>

      <UI.Alert
        open={!!removing}
        title={t('settingsRemoveSecretTitle')}
        description={t('settingsRemoveSecretDescription', {
          name: removing ? labelOf(removing) : ''
        })}
        confirmText={t('remove')}
        cancelText={c('cancel')}
        loading={removingBusy}
        onConfirm={removeSecret}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
};
