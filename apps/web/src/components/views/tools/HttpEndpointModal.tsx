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

import { JsonEditor, useSchemaMetaSchema } from './JsonEditor';
import { ModalDialog, ModalOverlay } from './styles';
import { i18n } from '../../../lib';

// types
import type { Translate } from '../../../lib';

interface ArtifactTool {
  id: string;
  config: Record<string, unknown> | null;
  toolKey: string;
}

interface ArtifactCredential {
  id: string;
  provider: string;
  metadata?: Record<string, unknown> | null;
}

interface ArtifactConnection {
  provider: string;
  credentialId: string | null;
  connected: boolean;
  needsReauth: boolean;
}

interface Props {
  // null = create a new endpoint; otherwise edit this instance.
  tool: ArtifactTool | null;
  // The http-endpoint tool_definition id (needed to create a new instance).
  toolKey: string;
  credentials: ArtifactCredential[];
  // Managed OAuth providers, for the `oauth` auth kind. An endpoint calling a
  // vendor the artifact has already connected borrows that connection instead of
  // asking the user to paste a token that expires in an hour.
  connections: ArtifactConnection[];
  toolApiBase: string;
  credentialApiBase: string;
  // Reuses the tools view's own provider naming so a connection reads the same
  // here as it does on the card that established it.
  getProviderLabel: (provider: string) => string;
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
/**
 * The four option lists whose labels are words rather than protocol.
 *
 * Built from the translator rather than declared as constants: the *values* are
 * what gets stored and never vary, while the labels are read. `METHOD_OPTIONS`
 * above stays a constant for the same reason inverted — `GET` is `GET`.
 *
 * `oauth` sends the access token of a connection the artifact already holds,
 * refreshed on the server before every call. It is listed apart from the three
 * stored-secret kinds because the user picks a *provider* rather than pasting a
 * value, and because there is nothing to add inline when none is connected —
 * connecting happens on the Tools page.
 */
type ToolsT = Translate<(typeof i18n.copy.TOOLS)['en']>;

const bodyKindOptions = (t: ToolsT) => [
  {
    value: utils.constants.HTTP_ENDPOINT_BODY_KIND_NONE,
    label: t('epBodyNone')
  },
  {
    value: utils.constants.HTTP_ENDPOINT_BODY_KIND_JSON,
    label: t('epBodyJson')
  },
  {
    value: utils.constants.HTTP_ENDPOINT_BODY_KIND_FORM,
    label: t('epBodyForm')
  },
  {
    value: utils.constants.HTTP_ENDPOINT_BODY_KIND_TEXT,
    label: t('epBodyText')
  }
];
const contentTypeOptions = (t: ToolsT) => [
  {
    value: utils.constants.HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_AUTO,
    label: t('epResponseAuto')
  },
  {
    value: utils.constants.HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_JSON,
    label: t('epResponseJson')
  },
  {
    value: utils.constants.HTTP_ENDPOINT_RESPONSE_CONTENT_TYPE_TEXT,
    label: t('epResponseText')
  }
];
const authKindOptions = (t: ToolsT) => [
  {
    value: utils.constants.HTTP_ENDPOINT_AUTH_KIND_NONE,
    label: t('epAuthNone')
  },
  {
    value: utils.constants.HTTP_ENDPOINT_AUTH_KIND_BEARER,
    label: t('epAuthBearer')
  },
  {
    value: utils.constants.HTTP_ENDPOINT_AUTH_KIND_BASIC,
    label: t('epAuthBasic')
  },
  {
    value: utils.constants.HTTP_ENDPOINT_AUTH_KIND_API_KEY,
    label: t('epAuthApiKey')
  },
  {
    value: utils.constants.HTTP_ENDPOINT_AUTH_KIND_OAUTH,
    label: t('epAuthOauth')
  }
];
const argTypeOptions = (t: ToolsT) => [
  { value: 'string', label: t('epTypeString') },
  { value: 'number', label: t('epTypeNumber') },
  { value: 'boolean', label: t('epTypeBoolean') }
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
  toolKey,
  credentials,
  connections,
  toolApiBase,
  credentialApiBase,
  getProviderLabel,
  snackbar,
  onClose,
  onSaved
}: Props) => {
  const t = i18n.useT(i18n.copy.TOOLS);
  const c = i18n.useT(i18n.copy.COMMON);
  const schemaMetaSchema = useSchemaMetaSchema();
  const bodyKinds = useMemo(() => bodyKindOptions(t), [t]);
  const contentTypes = useMemo(() => contentTypeOptions(t), [t]);
  const authKinds = useMemo(() => authKindOptions(t), [t]);
  const argTypes = useMemo(() => argTypeOptions(t), [t]);

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
  // Raw JSON rather than the arg builder the input schema uses. An output
  // schema describes someone else's response, which is nested in ways a
  // two-column builder cannot express — and the same field on the Functions tab
  // is a JSON box, so the two tool shapes now ask for it the same way.
  const [outputSchema, setOutputSchema] = useState<string>(
    initial.outputSchema ? JSON.stringify(initial.outputSchema, null, 2) : ''
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

  const secretOptions = useMemo(
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

  // Only connections that actually resolved to a credential can be referenced —
  // `auth.credentialId` has to name a row. One needing re-authorization is still
  // offered, flagged: the endpoint will be correct again the moment it is
  // re-linked, and hiding it would read as "this connection is gone".
  const connectionOptions = useMemo(
    () =>
      connections
        .filter(c => c.connected && c.credentialId)
        .map(c => ({
          value: c.credentialId as string,
          label: c.needsReauth
            ? `${getProviderLabel(c.provider)} — needs re-authorization`
            : getProviderLabel(c.provider)
        })),
    [connections, getProviderLabel]
  );

  const usesConnection =
    authKind === utils.constants.HTTP_ENDPOINT_AUTH_KIND_OAUTH;
  const credentialOptions = usesConnection ? connectionOptions : secretOptions;

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
      ...(outputSchema.trim()
        ? { outputSchema: JSON.parse(outputSchema) }
        : {}),
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
    setOutputSchema(
      cfg.outputSchema ? JSON.stringify(cfg.outputSchema, null, 2) : ''
    );
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
        setError(t('epErrConfigObject'));
        return;
      }
      applyConfig(parsed);
      setError(null);
      setMode('form');
    } catch {
      setError(t('epErrConfigJsonSwitch'));
    }
  };

  const persist = async (config: unknown) => {
    const data = await utils.fetcher({
      url: tool ? `${toolApiBase}/${tool.id}` : toolApiBase,
      config: {
        method: tool ? 'PUT' : 'POST',
        credentials: 'include',
        body: JSON.stringify(tool ? { config } : { toolKey, config })
      }
    });
    if (data && !data.error) {
      snackbar.success(tool ? t('epOkUpdated') : t('epOkAdded'));
      onSaved();
      onClose();
    } else {
      snackbar.error(data?.error || t('epErrSave'));
    }
  };

  const saveJson = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(configJson);
    } catch {
      return setError(t('epErrInvalidJson'));
    }
    const result = utils.Schema.HTTP_ENDPOINT_CONFIG_WRITE.safeParse(parsed);
    if (!result.success) {
      return setError(
        result.error.issues[0]?.message || t('epErrInvalidConfig')
      );
    }
    setSubmitting(true);
    try {
      await persist(result.data);
    } catch {
      snackbar.error(t('epErrSave'));
    } finally {
      setSubmitting(false);
    }
  };

  const saveForm = async () => {
    if (!name.trim()) return setError(t('epErrNameRequired'));
    if (!url.trim()) return setError(t('epErrUrlRequired'));
    // Checked here rather than left to buildConfig, which runs after a
    // credential may already have been created — a typo in this box must not
    // leave a secret behind.
    if (outputSchema.trim()) {
      try {
        const parsed = JSON.parse(outputSchema);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return setError(t('epErrOutputSchemaObject'));
        }
      } catch {
        return setError(t('epErrOutputSchemaJson'));
      }
    }
    if (needsCredential && !addingSecret && !credChoice) {
      return setError(
        usesConnection ? t('epErrPickConnection') : t('epErrPickSecret')
      );
    }
    if (needsCredential && addingSecret && !newSecret.trim()) {
      return setError(t('epErrSecretValue'));
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
          setError(created?.error || t('epErrSaveSecret'));
          setSubmitting(false);
          return;
        }
        credentialId = created.id;
      }

      const result = utils.Schema.HTTP_ENDPOINT_CONFIG_WRITE.safeParse(
        buildConfig(credentialId)
      );
      if (!result.success) {
        setError(result.error.issues[0]?.message || t('epErrInvalidConfig'));
        setSubmitting(false);
        return;
      }
      await persist(result.data);
    } catch {
      snackbar.error(t('epErrSave'));
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
              {tool ? t('epTitleEdit') : t('epTitleNew')}
            </h2>
            <div className="http-endpoint-mode-toggle">
              <button
                type="button"
                className={`http-endpoint-mode-btn ${mode === 'form' ? 'active' : ''}`}
                disabled={submitting}
                onClick={() => mode === 'json' && switchToForm()}
              >
                <ViewList />
                {t('epModeForm')}
              </button>
              <button
                type="button"
                className={`http-endpoint-mode-btn ${mode === 'json' ? 'active' : ''}`}
                disabled={submitting}
                onClick={() => mode === 'form' && switchToJson()}
              >
                <Code />
                {t('epModeJson')}
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
                  {t('epJsonHelpBefore')} <strong>{t('epModeForm')}</strong>{' '}
                  {t('epJsonHelpMiddle')} <code>auth.credentialId</code>{' '}
                  {t('epJsonHelpAfter')}
                </p>
                <JsonEditor
                  id="endpoint-config"
                  label={t('epConfigLabel')}
                  height="420px"
                  readOnly={submitting}
                  value={configJson}
                  onChange={next => {
                    setConfigJson(next);
                    if (error) setError(null);
                  }}
                />
              </>
            ) : (
              <>
                <UI.Input
                  label={t('epName')}
                  value={name}
                  disabled={submitting}
                  helperText={t('epNameHelp')}
                  onChange={e => setName(e.target.value)}
                />
                <UI.Input
                  label={t('epDescription')}
                  multiline
                  rows={2}
                  value={description}
                  disabled={submitting}
                  helperText={t('epDescriptionHelp')}
                  onChange={e => setDescription(e.target.value)}
                />
                <p className="http-endpoint-section">{t('epSectionRequest')}</p>
                <div className="http-endpoint-row">
                  <div className="http-endpoint-method">
                    <UI.Select
                      label={t('epMethod')}
                      value={method}
                      options={METHOD_OPTIONS}
                      disabled={submitting}
                      onChange={e => setMethod(e.target.value)}
                    />
                  </div>
                  <UI.Input
                    label={t('epUrl')}
                    value={url}
                    disabled={submitting}
                    helperText={t('epUrlHelp')}
                    onChange={e => setUrl(e.target.value)}
                  />
                </div>
                <div className="http-endpoint-list">
                  <div className="http-endpoint-list-head">
                    <span>{t('epHeaders')}</span>
                    <UI.Button
                      size="small"
                      disabled={submitting}
                      onClick={() =>
                        setHeaders(prev => [...prev, { name: '', value: '' }])
                      }
                    >
                      <Add fontSize="small" />
                      <span className="button-text">{t('epAdd')}</span>
                    </UI.Button>
                  </div>
                  {headers.map((h, i) => (
                    <div key={i} className="http-endpoint-kv">
                      <UI.Input
                        label={t('epFieldName')}
                        value={h.name}
                        disabled={submitting}
                        onChange={e =>
                          updateList(setHeaders, i, { name: e.target.value })
                        }
                      />
                      <UI.Input
                        label={t('epFieldValue')}
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
                    <span>{t('epQuery')}</span>
                    <UI.Button
                      size="small"
                      disabled={submitting}
                      onClick={() =>
                        setQuery(prev => [...prev, { name: '', value: '' }])
                      }
                    >
                      <Add fontSize="small" />
                      <span className="button-text">{t('epAdd')}</span>
                    </UI.Button>
                  </div>
                  {query.map((q, i) => (
                    <div key={i} className="http-endpoint-kv">
                      <UI.Input
                        label={t('epFieldName')}
                        value={q.name}
                        disabled={submitting}
                        onChange={e =>
                          updateList(setQuery, i, { name: e.target.value })
                        }
                      />
                      <UI.Input
                        label={t('epFieldValue')}
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
                      <span>{t('epBody')}</span>
                    </div>
                    <div className="http-endpoint-row">
                      <div className="http-endpoint-method">
                        <UI.Select
                          label={t('epFormat')}
                          value={bodyKind}
                          options={bodyKinds}
                          disabled={submitting}
                          onChange={e => setBodyKind(e.target.value)}
                        />
                      </div>
                    </div>
                    {bodyKind !==
                      utils.constants.HTTP_ENDPOINT_BODY_KIND_NONE && (
                      // Highlighting and bracket matching, but no validation:
                      // a template is JSON-shaped and not JSON — `{{orderId}}`
                      // where a number goes is legal here and only has to parse
                      // once the arguments are substituted in.
                      <JsonEditor
                        id="endpoint-body-template"
                        label={t('epBodyTemplate')}
                        height="140px"
                        readOnly={submitting}
                        validate={false}
                        value={bodyTemplate}
                        onChange={setBodyTemplate}
                        help={t('epBodyTemplateHelp')}
                      />
                    )}
                  </div>
                )}
                <div className="http-endpoint-list">
                  <div className="http-endpoint-list-head">
                    <span>{t('epInputs')}</span>
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
                      <span className="button-text">{t('epAddInput')}</span>
                    </UI.Button>
                  </div>
                  <p className="http-endpoint-list-hint">{t('epInputsHint')}</p>
                  {args.map((a, i) => (
                    <div key={i} className="http-endpoint-arg">
                      <div className="http-endpoint-arg-header">
                        <UI.Input
                          label={t('epFieldName')}
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
                          label={t('epArgRequired')}
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
                          label={t('epArgType')}
                          value={a.type}
                          options={argTypes}
                          disabled={submitting}
                          onChange={e =>
                            updateList(setArgs, i, {
                              type: e.target.value as SchemaArg['type']
                            })
                          }
                        />
                        <UI.Input
                          label={t('epArgDescription')}
                          value={a.description}
                          disabled={submitting}
                          helperText={t('epArgDescriptionHelp')}
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
                  <p className="http-endpoint-section">{t('epSectionAuth')}</p>
                  <UI.Select
                    label={t('epAuthKind')}
                    value={authKind}
                    options={authKinds}
                    disabled={submitting}
                    onChange={e => {
                      // A credential id chosen for one kind never carries to
                      // another: stored secrets and connections are separate
                      // sets of rows, so keeping the old id would leave the
                      // field looking filled while pointing at nothing the new
                      // picker lists.
                      setAuthKind(e.target.value);
                      setCredChoice('');
                      setAddingSecret(false);
                    }}
                  />
                  {authKind ===
                    utils.constants.HTTP_ENDPOINT_AUTH_KIND_API_KEY && (
                    <div className="http-endpoint-row">
                      <div className="http-endpoint-method">
                        <UI.Select
                          label={t('epSendIn')}
                          value={apiKeyIn}
                          options={[
                            { value: 'header', label: t('epSendInHeader') },
                            { value: 'query', label: t('epSendInQuery') }
                          ]}
                          disabled={submitting}
                          onChange={e => setApiKeyIn(e.target.value)}
                        />
                      </div>
                      <UI.Input
                        label={t('epParamName')}
                        value={apiKeyName}
                        disabled={submitting}
                        onChange={e => setApiKeyName(e.target.value)}
                      />
                    </div>
                  )}
                  {needsCredential && !addingSecret && (
                    <>
                      <UI.Select
                        label={
                          usesConnection ? t('epConnection') : t('epSecret')
                        }
                        value={credChoice}
                        options={credentialOptions}
                        disabled={submitting || credentialOptions.length === 0}
                        helperText={
                          credentialOptions.length === 0
                            ? usesConnection
                              ? t('epNoConnections')
                              : t('epNoSecrets')
                            : usesConnection
                              ? t('epOauthHelp')
                              : authKind ===
                                  utils.constants.HTTP_ENDPOINT_AUTH_KIND_BASIC
                                ? t('epBasicHelp')
                                : t('epSecretHelp')
                        }
                        onChange={e => setCredChoice(e.target.value)}
                      />
                      {/* A connection is established by an OAuth redirect from
                          the catalog card, so there is nothing to add inline. */}
                      {!usesConnection && (
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
                          <span className="button-text">
                            {t('epAddSecret')}
                          </span>
                        </UI.Button>
                      )}
                    </>
                  )}
                  {needsCredential && !usesConnection && addingSecret && (
                    <div className="http-endpoint-new-secret">
                      <UI.Input
                        label={t('epSecretLabel')}
                        value={newLabel}
                        disabled={submitting}
                        helperText={t('epSecretLabelHelp')}
                        onChange={e => setNewLabel(e.target.value)}
                      />
                      <UI.Input
                        label={
                          authKind ===
                          utils.constants.HTTP_ENDPOINT_AUTH_KIND_BASIC
                            ? t('epSecretValueBasic')
                            : t('epSecretValue')
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
                            {t('epUseExistingSecret')}
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
                    {t('epAdvanced')}
                  </button>
                  {showAdvanced && (
                    <div className="http-endpoint-advanced-content">
                      <div className="http-endpoint-row">
                        <div className="http-endpoint-method">
                          <UI.Select
                            label={t('epResponseType')}
                            value={contentType}
                            options={contentTypes}
                            disabled={submitting}
                            onChange={e => setContentType(e.target.value)}
                          />
                        </div>
                        <UI.Input
                          label={t('epJsonPath')}
                          value={jsonPath}
                          disabled={submitting}
                          helperText={t('epJsonPathHelp')}
                          onChange={e => setJsonPath(e.target.value)}
                        />
                      </div>
                      <JsonEditor
                        id="endpoint-output-schema"
                        label={t('epOutputSchema')}
                        height="150px"
                        readOnly={submitting}
                        schema={schemaMetaSchema}
                        value={outputSchema}
                        onChange={setOutputSchema}
                        help={t('epOutputSchemaHelp')}
                      />
                      <div className="http-endpoint-row">
                        <UI.Input
                          label={t('epSuccessStatuses')}
                          value={successStatus}
                          disabled={submitting}
                          helperText={t('epSuccessStatusesHelp')}
                          onChange={e => setSuccessStatus(e.target.value)}
                        />
                        <UI.Input
                          label={t('epTimeout')}
                          type="number"
                          value={timeoutMs}
                          disabled={submitting}
                          helperText={t('epTimeoutHelp')}
                          onChange={e => setTimeoutMs(e.target.value)}
                        />
                      </div>
                      <UI.Input
                        label={t('epAllowedHosts')}
                        value={allowedHosts}
                        disabled={submitting}
                        helperText={t('epAllowedHostsHelp')}
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
              {submitting ? c('saving') : tool ? c('save') : t('epSubmitAdd')}
            </UI.Button>
          </div>
        </ModalDialog>
      </ModalOverlay>
    </UI.Portal>
  );
};
