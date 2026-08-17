import { useMemo, useState } from 'react';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';
import IconButton from '@mui/material/IconButton';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import {
  Close,
  DeleteOutlined,
  Add,
  ViewList,
  Code,
  ExpandMore,
  ExpandLess
} from '@mui/icons-material';

import { ModalDialog, ModalOverlay } from './styles';

interface ArtifactTool {
  id: string;
  config: Record<string, unknown> | null;
  toolDefinitionId: string;
}

interface ArtifactCredential {
  id: string;
  provider: string;
  metadata?: Record<string, unknown> | null;
}

interface Props {
  // null = create a new endpoint; otherwise edit this instance.
  tool: ArtifactTool | null;
  // The http-endpoint tool_definition id (needed to create a new instance).
  toolDefinitionId: string;
  credentials: ArtifactCredential[];
  toolApiBase: string;
  credentialApiBase: string;
  snackbar: { success: (m: string) => void; error: (m: string) => void };
  onClose: () => void;
  onSaved: () => void;
}

type KeyValue = { name: string; value: string };
type SchemaArg = {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
};

const METHOD_OPTIONS = (
  utils.constants.HTTP_ENDPOINT_METHODS as readonly string[]
).map(m => ({ value: m, label: m }));
const BODY_KIND_OPTIONS = [
  { value: utils.constants.HTTP_ENDPOINT_BODY_KIND_NONE, label: 'None' },
  { value: utils.constants.HTTP_ENDPOINT_BODY_KIND_JSON, label: 'JSON' },
  {
    value: utils.constants.HTTP_ENDPOINT_BODY_KIND_FORM,
    label: 'Form (urlencoded)'
  },
  { value: utils.constants.HTTP_ENDPOINT_BODY_KIND_TEXT, label: 'Text' }
];
const CONTENT_TYPE_OPTIONS = [
  {
    value: utils.constants.HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_AUTO,
    label: 'Auto-detect'
  },
  {
    value: utils.constants.HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_JSON,
    label: 'JSON'
  },
  {
    value: utils.constants.HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_TEXT,
    label: 'Text'
  }
];
// oauth is intentionally omitted — it binds to a real OAuth credential, which
// this generic form doesn't manage. bearer/basic/api-key cover stored secrets.
const AUTH_KIND_OPTIONS = [
  { value: utils.constants.HTTP_ENDPOINT_AUTH_KIND_NONE, label: 'None' },
  {
    value: utils.constants.HTTP_ENDPOINT_AUTH_KIND_BEARER,
    label: 'Bearer token'
  },
  {
    value: utils.constants.HTTP_ENDPOINT_AUTH_KIND_BASIC,
    label: 'Basic (user:pass)'
  },
  { value: utils.constants.HTTP_ENDPOINT_AUTH_KIND_API_KEY, label: 'API key' }
];
const ARG_TYPE_OPTIONS = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' }
];

const asKeyValues = (v: unknown): KeyValue[] =>
  Array.isArray(v)
    ? v
        .filter(
          (i): i is { name: string; value: string } =>
            !!i &&
            typeof i === 'object' &&
            typeof (i as KeyValue).name === 'string'
        )
        .map(i => ({ name: i.name, value: String(i.value ?? '') }))
    : [];

// Hydrate the form's arg list from a stored JSON-schema inputSchema.
const schemaToArgs = (schema: unknown): SchemaArg[] => {
  if (!schema || typeof schema !== 'object') return [];
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  const required = (schema as { required?: string[] }).required ?? [];
  if (!props || typeof props !== 'object') return [];
  return Object.entries(props).map(([name, raw]) => {
    const p = (raw || {}) as { type?: string; description?: string };
    const type =
      p.type === 'number' || p.type === 'boolean' ? p.type : 'string';
    return {
      name,
      type,
      required: required.includes(name),
      description: typeof p.description === 'string' ? p.description : ''
    };
  });
};

export const HttpEndpointModal = ({
  tool,
  toolDefinitionId,
  credentials,
  toolApiBase,
  credentialApiBase,
  snackbar,
  onClose,
  onSaved
}: Props) => {
  const initial = (tool?.config || {}) as Record<string, any>;

  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [configJson, setConfigJson] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(
    !!(
      initial.response?.jsonPath ||
      initial.response?.successStatus ||
      (initial.response?.contentType &&
        initial.response.contentType !==
          utils.constants.HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_AUTO) ||
      initial.timeoutMs ||
      initial.allowedHosts
    )
  );

  const [name, setName] = useState<string>(initial.name || '');
  const [title, setTitle] = useState<string>(initial.title || '');
  const [description, setDescription] = useState<string>(
    initial.description || ''
  );
  const [method, setMethod] = useState<string>(
    initial.method || utils.constants.HTTP_ENDPOINT_METHOD_GET
  );
  const [url, setUrl] = useState<string>(initial.url || '');
  const [headers, setHeaders] = useState<KeyValue[]>(
    asKeyValues(initial.headers)
  );
  const [query, setQuery] = useState<KeyValue[]>(asKeyValues(initial.query));
  const [bodyKind, setBodyKind] = useState<string>(
    initial.body?.kind || utils.constants.HTTP_ENDPOINT_BODY_KIND_NONE
  );
  const [bodyTemplate, setBodyTemplate] = useState<string>(
    initial.body?.template || ''
  );
  const [args, setArgs] = useState<SchemaArg[]>(
    schemaToArgs(initial.inputSchema)
  );

  const [authKind, setAuthKind] = useState<string>(
    initial.auth?.kind || utils.constants.HTTP_ENDPOINT_AUTH_KIND_NONE
  );
  const [apiKeyIn, setApiKeyIn] = useState<string>(
    initial.auth?.in || 'header'
  );
  const [apiKeyName, setApiKeyName] = useState<string>(
    initial.auth?.name || 'X-API-Key'
  );
  const [credChoice, setCredChoice] = useState<string>(
    initial.auth?.credentialId || ''
  );
  const [addingSecret, setAddingSecret] = useState(false);
  const [newLabel, setNewLabel] = useState<string>('');
  const [newSecret, setNewSecret] = useState<string>('');

  const [contentType, setContentType] = useState<string>(
    initial.response?.contentType ||
      utils.constants.HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_AUTO
  );
  const [jsonPath, setJsonPath] = useState<string>(
    initial.response?.jsonPath || ''
  );
  const [successStatus, setSuccessStatus] = useState<string>(
    Array.isArray(initial.response?.successStatus)
      ? initial.response.successStatus.join(', ')
      : ''
  );
  const [timeoutMs, setTimeoutMs] = useState<string>(
    initial.timeoutMs ? String(initial.timeoutMs) : ''
  );
  const [allowedHosts, setAllowedHosts] = useState<string>(
    Array.isArray(initial.allowedHosts) ? initial.allowedHosts.join(', ') : ''
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const credentialOptions = useMemo(
    () =>
      credentials
        .filter(
          c => c.provider === utils.constants.CREDENTIAL_PROVIDER_HTTP_ENDPOINT
        )
        .map(c => ({
          value: c.id,
          label:
            (c.metadata?.label as string | undefined) ||
            `Secret ${c.id.slice(0, 8)}`
        })),
    [credentials]
  );

  const needsCredential =
    authKind !== utils.constants.HTTP_ENDPOINT_AUTH_KIND_NONE;

  const updateList = <T,>(
    setter: (fn: (prev: T[]) => T[]) => void,
    index: number,
    patch: Partial<T>
  ) =>
    setter(prev =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it))
    );

  const splitList = (value: string): string[] =>
    value
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(Boolean);

  const buildInputSchema = () => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const a of args) {
      const key = a.name.trim();
      if (!key) continue;
      properties[key] = {
        type: a.type,
        ...(a.description.trim() ? { description: a.description.trim() } : {})
      };
      if (a.required) required.push(key);
    }
    return {
      type: 'object',
      properties,
      ...(required.length ? { required } : {})
    };
  };

  const buildConfig = (credentialId: string) => {
    const auth =
      authKind === utils.constants.HTTP_ENDPOINT_AUTH_KIND_NONE
        ? { kind: authKind }
        : authKind === utils.constants.HTTP_ENDPOINT_AUTH_KIND_API_KEY
          ? { kind: authKind, in: apiKeyIn, name: apiKeyName, credentialId }
          : { kind: authKind, credentialId };

    const status = splitList(successStatus)
      .map(Number)
      .filter(n => Number.isFinite(n));

    return {
      name: name.trim(),
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      method,
      url: url.trim(),
      headers: headers.filter(h => h.name.trim()),
      query: query.filter(q => q.name.trim()),
      body: { kind: bodyKind, template: bodyTemplate },
      inputSchema: buildInputSchema(),
      response: {
        contentType,
        ...(jsonPath.trim() ? { jsonPath: jsonPath.trim() } : {}),
        ...(status.length ? { successStatus: status } : {})
      },
      auth,
      ...(timeoutMs.trim() ? { timeoutMs: Number(timeoutMs) } : {}),
      ...(allowedHosts.trim() ? { allowedHosts: splitList(allowedHosts) } : {})
    };
  };

  // The reverse of buildConfig — used when the user edits raw JSON then flips
  // back to the form, so neither view goes stale.
  const applyConfig = (cfg: Record<string, any>) => {
    setName(cfg.name || '');
    setTitle(cfg.title || '');
    setDescription(cfg.description || '');
    setMethod(cfg.method || utils.constants.HTTP_ENDPOINT_METHOD_GET);
    setUrl(cfg.url || '');
    setHeaders(asKeyValues(cfg.headers));
    setQuery(asKeyValues(cfg.query));
    setBodyKind(cfg.body?.kind || utils.constants.HTTP_ENDPOINT_BODY_KIND_NONE);
    setBodyTemplate(cfg.body?.template || '');
    setArgs(schemaToArgs(cfg.inputSchema));
    setAuthKind(cfg.auth?.kind || utils.constants.HTTP_ENDPOINT_AUTH_KIND_NONE);
    setApiKeyIn(cfg.auth?.in || 'header');
    setApiKeyName(cfg.auth?.name || 'X-API-Key');
    setCredChoice(cfg.auth?.credentialId || '');
    setAddingSecret(false);
    setContentType(
      cfg.response?.contentType ||
        utils.constants.HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_AUTO
    );
    setJsonPath(cfg.response?.jsonPath || '');
    setSuccessStatus(
      Array.isArray(cfg.response?.successStatus)
        ? cfg.response.successStatus.join(', ')
        : ''
    );
    setTimeoutMs(cfg.timeoutMs ? String(cfg.timeoutMs) : '');
    setAllowedHosts(
      Array.isArray(cfg.allowedHosts) ? cfg.allowedHosts.join(', ') : ''
    );
  };

  const switchToJson = () => {
    setError(null);
    setConfigJson(JSON.stringify(buildConfig(credChoice || ''), null, 2));
    setMode('json');
  };

  const switchToForm = () => {
    try {
      const parsed = JSON.parse(configJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setError('Config must be a JSON object.');
        return;
      }
      applyConfig(parsed);
      setError(null);
      setMode('form');
    } catch {
      setError('Invalid JSON — fix it before switching to the form.');
    }
  };

  const persist = async (config: unknown) => {
    const data = await utils.fetcher({
      url: tool ? `${toolApiBase}/${tool.id}` : toolApiBase,
      config: {
        method: tool ? 'PUT' : 'POST',
        credentials: 'include',
        body: JSON.stringify(tool ? { config } : { toolDefinitionId, config })
      }
    });
    if (data && !data.error) {
      snackbar.success(tool ? 'Endpoint updated' : 'Endpoint added');
      onSaved();
      onClose();
    } else {
      snackbar.error(data?.error || 'Failed to save endpoint');
    }
  };

  const saveJson = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(configJson);
    } catch {
      return setError('Invalid JSON.');
    }
    const result = utils.Schema.HTTP_ENDPOINT_CONFIG_WRITE.safeParse(parsed);
    if (!result.success) {
      return setError(
        result.error.issues[0]?.message || 'Invalid configuration.'
      );
    }
    setSubmitting(true);
    try {
      await persist(result.data);
    } catch {
      snackbar.error('Failed to save endpoint');
    } finally {
      setSubmitting(false);
    }
  };

  const saveForm = async () => {
    if (!name.trim()) return setError('Tool name is required.');
    if (!url.trim()) return setError('URL is required.');
    if (needsCredential && !addingSecret && !credChoice) {
      return setError('Select an existing secret or add a new one.');
    }
    if (needsCredential && addingSecret && !newSecret.trim()) {
      return setError('Enter the secret value.');
    }

    setSubmitting(true);
    try {
      let credentialId = credChoice;
      if (needsCredential && addingSecret) {
        const created = await utils.fetcher({
          url: credentialApiBase,
          config: {
            method: 'POST',
            credentials: 'include',
            body: JSON.stringify({
              provider: utils.constants.CREDENTIAL_PROVIDER_HTTP_ENDPOINT,
              apiKey: newSecret.trim(),
              label: newLabel.trim() || undefined
            })
          }
        });
        if (!created?.id) {
          setError(created?.error || 'Failed to save the secret.');
          setSubmitting(false);
          return;
        }
        credentialId = created.id;
      }

      const result = utils.Schema.HTTP_ENDPOINT_CONFIG_WRITE.safeParse(
        buildConfig(credentialId)
      );
      if (!result.success) {
        setError(result.error.issues[0]?.message || 'Invalid configuration.');
        setSubmitting(false);
        return;
      }
      await persist(result.data);
    } catch {
      snackbar.error('Failed to save endpoint');
    } finally {
      setSubmitting(false);
    }
  };

  const save = () => {
    if (submitting) return;
    setError(null);
    if (mode === 'json') saveJson();
    else saveForm();
  };

  return (
    <UI.Portal>
      <ModalOverlay onClick={() => !submitting && onClose()}>
        <ModalDialog
          role="dialog"
          className="http-endpoint-dialog"
          onClick={e => e.stopPropagation()}
        >
          <div className="tools-modal-header">
            <h2 className="tools-modal-title">
              {tool ? 'Edit endpoint' : 'Add HTTP endpoint'}
            </h2>
            <div className="http-endpoint-mode-toggle">
              <button
                type="button"
                className={`http-endpoint-mode-btn ${mode === 'form' ? 'active' : ''}`}
                disabled={submitting}
                onClick={() => mode === 'json' && switchToForm()}
              >
                <ViewList />
                Form
              </button>
              <button
                type="button"
                className={`http-endpoint-mode-btn ${mode === 'json' ? 'active' : ''}`}
                disabled={submitting}
                onClick={() => mode === 'form' && switchToJson()}
              >
                <Code />
                JSON
              </button>
            </div>
            <IconButton size="small" onClick={onClose} disabled={submitting}>
              <Close />
            </IconButton>
          </div>
          <div className="tools-modal-body http-endpoint-form">
            {mode === 'json' ? (
              <>
                <p className="tools-configure-help">
                  Edit the full endpoint configuration as JSON. Switch back to{' '}
                  <strong>Form</strong> to use the guided editor. To use a saved
                  secret, set <code>auth.credentialId</code> to its id.
                </p>
                <UI.Input
                  label="Configuration (JSON)"
                  multiline
                  rows={20}
                  value={configJson}
                  disabled={submitting}
                  onChange={e => {
                    setConfigJson(e.target.value);
                    if (error) setError(null);
                  }}
                />
              </>
            ) : (
              <>
                <UI.Input
                  label="Tool name"
                  value={name}
                  disabled={submitting}
                  helperText="The name the assistant calls, e.g. lookup-order. Letters, digits, _ or -."
                  onChange={e => setName(e.target.value)}
                />
                <UI.Input
                  label="Description"
                  multiline
                  rows={2}
                  value={description}
                  disabled={submitting}
                  helperText="Tell the model when to call this tool."
                  onChange={e => setDescription(e.target.value)}
                />
                <p className="http-endpoint-section">Request</p>
                <div className="http-endpoint-row">
                  <div className="http-endpoint-method">
                    <UI.Select
                      label="Method"
                      value={method}
                      options={METHOD_OPTIONS}
                      disabled={submitting}
                      onChange={e => setMethod(e.target.value)}
                    />
                  </div>
                  <UI.Input
                    label="URL"
                    value={url}
                    disabled={submitting}
                    helperText="Use {{arg}} to drop in the inputs below."
                    onChange={e => setUrl(e.target.value)}
                  />
                </div>
                <div className="http-endpoint-list">
                  <div className="http-endpoint-list-head">
                    <span>Headers</span>
                    <UI.Button
                      size="small"
                      disabled={submitting}
                      onClick={() =>
                        setHeaders(prev => [...prev, { name: '', value: '' }])
                      }
                    >
                      <Add fontSize="small" />
                      <span className="button-text">Add</span>
                    </UI.Button>
                  </div>
                  {headers.map((h, i) => (
                    <div key={i} className="http-endpoint-kv">
                      <UI.Input
                        label="Name"
                        value={h.name}
                        disabled={submitting}
                        onChange={e =>
                          updateList(setHeaders, i, { name: e.target.value })
                        }
                      />
                      <UI.Input
                        label="Value"
                        value={h.value}
                        disabled={submitting}
                        onChange={e =>
                          updateList(setHeaders, i, { value: e.target.value })
                        }
                      />
                      <IconButton
                        size="small"
                        disabled={submitting}
                        onClick={() =>
                          setHeaders(prev => prev.filter((_, idx) => idx !== i))
                        }
                      >
                        <DeleteOutlined />
                      </IconButton>
                    </div>
                  ))}
                </div>
                <div className="http-endpoint-list">
                  <div className="http-endpoint-list-head">
                    <span>Query parameters</span>
                    <UI.Button
                      size="small"
                      disabled={submitting}
                      onClick={() =>
                        setQuery(prev => [...prev, { name: '', value: '' }])
                      }
                    >
                      <Add fontSize="small" />
                      <span className="button-text">Add</span>
                    </UI.Button>
                  </div>
                  {query.map((q, i) => (
                    <div key={i} className="http-endpoint-kv">
                      <UI.Input
                        label="Name"
                        value={q.name}
                        disabled={submitting}
                        onChange={e =>
                          updateList(setQuery, i, { name: e.target.value })
                        }
                      />
                      <UI.Input
                        label="Value"
                        value={q.value}
                        disabled={submitting}
                        onChange={e =>
                          updateList(setQuery, i, { value: e.target.value })
                        }
                      />
                      <IconButton
                        size="small"
                        disabled={submitting}
                        onClick={() =>
                          setQuery(prev => prev.filter((_, idx) => idx !== i))
                        }
                      >
                        <DeleteOutlined />
                      </IconButton>
                    </div>
                  ))}
                </div>
                {method !== utils.constants.HTTP_ENDPOINT_METHOD_GET && (
                  <div className="http-endpoint-list">
                    <div className="http-endpoint-list-head">
                      <span>Body</span>
                    </div>
                    <div className="http-endpoint-row">
                      <div className="http-endpoint-method">
                        <UI.Select
                          label="Format"
                          value={bodyKind}
                          options={BODY_KIND_OPTIONS}
                          disabled={submitting}
                          onChange={e => setBodyKind(e.target.value)}
                        />
                      </div>
                    </div>
                    {bodyKind !==
                      utils.constants.HTTP_ENDPOINT_BODY_KIND_NONE && (
                      <UI.Input
                        label="Body template"
                        multiline
                        rows={5}
                        value={bodyTemplate}
                        disabled={submitting}
                        helperText='Supports {{arg}}. For JSON it must parse, e.g. {"id":"{{orderId}}"}'
                        onChange={e => setBodyTemplate(e.target.value)}
                      />
                    )}
                  </div>
                )}
                <div className="http-endpoint-list">
                  <div className="http-endpoint-list-head">
                    <span>Inputs (model arguments)</span>
                    <UI.Button
                      size="small"
                      disabled={submitting}
                      onClick={() =>
                        setArgs(prev => [
                          ...prev,
                          {
                            name: '',
                            type: 'string',
                            required: false,
                            description: ''
                          }
                        ])
                      }
                    >
                      <Add fontSize="small" />
                      <span className="button-text">Add input</span>
                    </UI.Button>
                  </div>
                  <p className="http-endpoint-list-hint">
                    Arguments the model fills in when it calls this tool.
                    Reference them as {'{{name}}'} in the URL, headers, query,
                    or body.
                  </p>
                  {args.map((a, i) => (
                    <div key={i} className="http-endpoint-arg">
                      <div className="http-endpoint-arg-header">
                        <UI.Input
                          label="Name"
                          value={a.name}
                          disabled={submitting}
                          onChange={e =>
                            updateList(setArgs, i, { name: e.target.value })
                          }
                        />
                        <FormControlLabel
                          className="http-endpoint-arg-required"
                          control={
                            <Checkbox
                              size="small"
                              checked={a.required}
                              disabled={submitting}
                              onChange={e =>
                                updateList(setArgs, i, {
                                  required: e.target.checked
                                })
                              }
                            />
                          }
                          label="Required"
                        />
                        <IconButton
                          size="small"
                          disabled={submitting}
                          onClick={() =>
                            setArgs(prev => prev.filter((_, idx) => idx !== i))
                          }
                        >
                          <DeleteOutlined />
                        </IconButton>
                      </div>
                      <div className="http-endpoint-arg-fields">
                        <UI.Select
                          label="Type"
                          value={a.type}
                          options={ARG_TYPE_OPTIONS}
                          disabled={submitting}
                          onChange={e =>
                            updateList(setArgs, i, {
                              type: e.target.value as SchemaArg['type']
                            })
                          }
                        />
                        <UI.Input
                          label="Description"
                          value={a.description}
                          disabled={submitting}
                          helperText="The model reads this to decide what to pass."
                          onChange={e =>
                            updateList(setArgs, i, {
                              description: e.target.value
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="http-endpoint-form">
                  <p className="http-endpoint-section">Authentication</p>
                  <UI.Select
                    label="Auth type"
                    value={authKind}
                    options={AUTH_KIND_OPTIONS}
                    disabled={submitting}
                    onChange={e => setAuthKind(e.target.value)}
                  />
                  {authKind ===
                    utils.constants.HTTP_ENDPOINT_AUTH_KIND_API_KEY && (
                    <div className="http-endpoint-row">
                      <div className="http-endpoint-method">
                        <UI.Select
                          label="Send in"
                          value={apiKeyIn}
                          options={[
                            { value: 'header', label: 'Header' },
                            { value: 'query', label: 'Query param' }
                          ]}
                          disabled={submitting}
                          onChange={e => setApiKeyIn(e.target.value)}
                        />
                      </div>
                      <UI.Input
                        label="Parameter name"
                        value={apiKeyName}
                        disabled={submitting}
                        onChange={e => setApiKeyName(e.target.value)}
                      />
                    </div>
                  )}
                  {needsCredential && !addingSecret && (
                    <>
                      <UI.Select
                        label="Secret"
                        value={credChoice}
                        options={credentialOptions}
                        disabled={submitting || credentialOptions.length === 0}
                        helperText={
                          credentialOptions.length === 0
                            ? 'No saved secrets yet — add one below.'
                            : authKind ===
                                utils.constants.HTTP_ENDPOINT_AUTH_KIND_BASIC
                              ? 'Stored value should be "username:password".'
                              : 'The stored secret is sent with each request.'
                        }
                        onChange={e => setCredChoice(e.target.value)}
                      />
                      <UI.Button
                        size="small"
                        className="http-endpoint-add-secret"
                        disabled={submitting}
                        onClick={() => {
                          setAddingSecret(true);
                          setCredChoice('');
                        }}
                      >
                        <Add fontSize="small" />
                        <span className="button-text">Add new secret</span>
                      </UI.Button>
                    </>
                  )}
                  {needsCredential && addingSecret && (
                    <div className="http-endpoint-new-secret">
                      <UI.Input
                        label="Label"
                        value={newLabel}
                        disabled={submitting}
                        helperText="A name to recognize this secret later."
                        onChange={e => setNewLabel(e.target.value)}
                      />
                      <UI.Input
                        label={
                          authKind ===
                          utils.constants.HTTP_ENDPOINT_AUTH_KIND_BASIC
                            ? 'Secret (username:password)'
                            : 'Secret value'
                        }
                        type="password"
                        value={newSecret}
                        disabled={submitting}
                        onChange={e => setNewSecret(e.target.value)}
                      />
                      {credentialOptions.length > 0 && (
                        <UI.Button
                          size="small"
                          className="http-endpoint-add-secret"
                          disabled={submitting}
                          onClick={() => {
                            setAddingSecret(false);
                            setNewSecret('');
                            setNewLabel('');
                          }}
                        >
                          <span className="button-text">
                            Use an existing secret
                          </span>
                        </UI.Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="http-endpoint-advanced">
                  <button
                    type="button"
                    className="http-endpoint-advanced-toggle"
                    onClick={() => setShowAdvanced(v => !v)}
                  >
                    {showAdvanced ? <ExpandLess /> : <ExpandMore />}
                    Advanced options
                  </button>
                  {showAdvanced && (
                    <div className="http-endpoint-advanced-content">
                      <div className="http-endpoint-row">
                        <div className="http-endpoint-method">
                          <UI.Select
                            label="Response type"
                            value={contentType}
                            options={CONTENT_TYPE_OPTIONS}
                            disabled={submitting}
                            onChange={e => setContentType(e.target.value)}
                          />
                        </div>
                        <UI.Input
                          label="JSON path"
                          value={jsonPath}
                          disabled={submitting}
                          helperText="Extract a sub-tree, e.g. data.items"
                          onChange={e => setJsonPath(e.target.value)}
                        />
                      </div>
                      <div className="http-endpoint-row">
                        <UI.Input
                          label="Success statuses"
                          value={successStatus}
                          disabled={submitting}
                          helperText="Comma-separated, e.g. 200, 201. Defaults to 2xx."
                          onChange={e => setSuccessStatus(e.target.value)}
                        />
                        <UI.Input
                          label="Timeout (ms)"
                          type="number"
                          value={timeoutMs}
                          disabled={submitting}
                          helperText="Default 10000, max 30000."
                          onChange={e => setTimeoutMs(e.target.value)}
                        />
                      </div>
                      <UI.Input
                        label="Allowed hosts"
                        value={allowedHosts}
                        disabled={submitting}
                        helperText="Comma-separated allowlist. Private/loopback hosts are always blocked."
                        onChange={e => setAllowedHosts(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {error && <p className="http-endpoint-error">{error}</p>}
          </div>
          <div className="tools-modal-actions">
            <UI.Button size="small" disabled={submitting} onClick={onClose}>
              Cancel
            </UI.Button>
            <UI.Button
              variant="contained"
              size="small"
              disabled={submitting}
              onClick={save}
            >
              {submitting ? 'Saving...' : tool ? 'Save' : 'Add endpoint'}
            </UI.Button>
          </div>
        </ModalDialog>
      </ModalOverlay>
    </UI.Portal>
  );
};
