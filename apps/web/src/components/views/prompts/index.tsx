import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';

import IconButton from '@mui/material/IconButton';
import {
  Add,
  Close,
  DeleteOutlined,
  EditOutlined,
  ArrowBack,
  RemoveCircleOutlined,
  Code,
  ViewList,
  ChatBubbleOutlineOutlined
} from '@mui/icons-material';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';

import { Wrapper } from './styles';
import { i18n } from '../../../lib';

interface Prompt {
  id: string;
  title: string;
  description: string | null;
  messages: { role: 'user' | 'assistant'; content: string }[];
  schema: Record<string, unknown>;
  artifactId: string;
  createdAt: string;
  updatedAt: string;
}

export const Prompts = () => {
  const router = useRouter();
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.PROMPTS);
  const c = i18n.useT(i18n.copy.COMMON);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editValues, setEditValues] = useState({
    title: '',
    description: '',
    messagesJson: ''
  });
  const [visualMessages, setVisualMessages] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([{ role: utils.constants.ROLE_MESSAGE_USER, content: '' }]);
  const [messageMode, setMessageMode] = useState<'visual' | 'json'>('visual');
  const [schemaVars, setSchemaVars] = useState<
    {
      name: string;
      type: 'string' | 'number' | 'boolean';
      required: boolean;
      description: string;
    }[]
  >([]);
  const [status, setStatus] = useState<
    'idle' | 'pending' | 'resolved' | 'rejected'
  >('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteAlert, setDeleteAlert] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [schemaViewMode, setSchemaViewMode] = useState<'visual' | 'json'>(
    'visual'
  );
  const [panelWidth, setPanelWidth] = useState(480);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const { id: organizationId, projectId } = router.query as {
    id: string;
    projectId: string;
  };
  const apiBase = `/organization/${organizationId}/project/${projectId}/artifact/prompt`;

  const fetchPrompts = async (signal?: AbortSignal) => {
    if (!organizationId || !projectId) return;
    setStatus('pending');
    try {
      const data = await utils.fetcher({
        url: apiBase,
        config: { credentials: 'include', signal }
      });
      if (signal?.aborted) return;
      if (data && !data.error) {
        setPrompts(data);
      }
      setStatus('resolved');
    } catch {
      if (!signal?.aborted) setStatus('rejected');
    }
  };

  useEffect(() => {
    if (!organizationId || !projectId) return;
    const controller = new AbortController();
    fetchPrompts(controller.signal);
    return () => controller.abort();
  }, [organizationId, projectId]);

  useEffect(() => {
    const requestedId = router.query.selected;
    if (typeof requestedId !== 'string' || !prompts.length) return;
    const match = prompts.find(p => p.id === requestedId);
    if (match && selectedPrompt?.id !== match.id) {
      setSelectedPrompt(match);
      setIsEditing(false);
      setIsCreating(false);
    }
  }, [router.query.selected, prompts]);

  useEffect(() => {
    if (!isCreating && !isEditing) return;
    syncSchemaVars();
  }, [
    visualMessages,
    editValues.messagesJson,
    messageMode,
    isCreating,
    isEditing
  ]);

  const handleSelect = (prompt: Prompt) => {
    setSelectedPrompt(prompt);
    setIsEditing(false);
    setIsCreating(false);
  };

  const handleCreate = () => {
    setSelectedPrompt(null);
    setIsEditing(false);
    setIsCreating(true);
    setEditValues({ title: '', description: '', messagesJson: '' });
    setVisualMessages([
      { role: utils.constants.ROLE_MESSAGE_USER, content: '' }
    ]);
    setMessageMode('visual');
    setSchemaVars([]);
    setErrors({});
  };

  const parseZodErrors = (err: unknown) => {
    if (
      err &&
      typeof err === 'object' &&
      'issues' in err &&
      Array.isArray((err as { issues: unknown[] }).issues)
    ) {
      const formatted = (
        err as { issues: { path: string[]; message: string }[] }
      ).issues.reduce(
        (acc, curr) => ({ ...acc, [curr.path[0]]: curr.message }),
        {} as Record<string, string>
      );
      setErrors(formatted);
    }
  };

  const getMessages = (): { role: string; content: string }[] | null => {
    if (messageMode === 'visual') {
      return visualMessages.filter(m => m.content.trim());
    }
    try {
      return JSON.parse(editValues.messagesJson);
    } catch {
      setErrors({ messages: t('errorInvalidJson') });
      return null;
    }
  };

  const detectVariables = () => {
    let allContent = '';
    if (messageMode === 'visual') {
      allContent = visualMessages.map(m => m.content).join(' ');
    } else {
      try {
        const parsed = JSON.parse(editValues.messagesJson);
        if (Array.isArray(parsed)) {
          allContent = parsed
            .map((m: { content?: string }) => m?.content || '')
            .join(' ');
        }
      } catch {
        return [];
      }
    }
    const matches = allContent.match(/\{\{(\w+)\}\}/g);
    if (!matches) return [];
    return Array.from(new Set(matches.map(m => m.replace(/\{\{|\}\}/g, ''))));
  };

  const syncSchemaVars = () => {
    const detected = detectVariables();
    setSchemaVars(prev => {
      const existing = new Map(prev.map(v => [v.name, v]));
      const synced = detected.map(
        name =>
          existing.get(name) || {
            name,
            type: 'string' as const,
            required: true,
            description: ''
          }
      );
      // keep manually-added vars that aren't in detected
      const manual = prev.filter(
        v => !detected.includes(v.name) && v.description
      );
      return [...synced, ...manual];
    });
  };

  const buildSchema = () => {
    const properties: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];

    for (const v of schemaVars) {
      const prop: Record<string, unknown> = { type: v.type };
      if (v.description) prop.description = v.description;
      properties[v.name] = prop;
      if (v.required) required.push(v.name);
    }

    return {
      type: 'object' as const,
      properties,
      ...(required.length > 0 && { required })
    };
  };

  const handleCreateSubmit = async () => {
    if (submitting) return;
    setErrors({});
    const parsedMessages = getMessages();
    if (!parsedMessages) return;
    if (parsedMessages.length === 0) {
      setErrors({ messages: t('errorNoMessages') });
      return;
    }

    const body = {
      title: editValues.title,
      description: editValues.description,
      messages: parsedMessages,
      schema: buildSchema()
    };

    try {
      await utils.Schema.ARTIFACT_CREATE_PROMPT_VIEW.parseAsync(body);
    } catch (err) {
      parseZodErrors(err);
      return;
    }

    setSubmitting(true);
    try {
      const data = await utils.fetcher({
        url: apiBase,
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify(body)
        }
      });

      if (data && !data.error) {
        setIsCreating(false);
        setSelectedPrompt(data);
        fetchPrompts();
        snackbar.success(t('toastCreated'));
      } else {
        snackbar.error(data?.error || t('toastCreateFailed'));
      }
    } catch {
      snackbar.error(t('toastCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = () => {
    if (!selectedPrompt) return;
    setEditValues({
      title: selectedPrompt.title,
      description: selectedPrompt.description || '',
      messagesJson: JSON.stringify(selectedPrompt.messages, null, 2)
    });
    setVisualMessages(
      selectedPrompt.messages.map(m => ({ role: m.role, content: m.content }))
    );
    setMessageMode('visual');
    setErrors({});

    const schema = selectedPrompt.schema as {
      properties?: Record<string, { type?: string; description?: string }>;
      required?: string[];
    };
    const props = schema?.properties || {};
    const required = schema?.required || [];
    setSchemaVars(
      Object.entries(props).map(([name, def]) => ({
        name,
        type: (def.type as 'string' | 'number' | 'boolean') || 'string',
        required: required.includes(name),
        description: def.description || ''
      }))
    );

    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (isCreating) {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setSelectedPrompt(null);
    setIsEditing(false);
    setIsCreating(false);
  };

  const handleUpdate = async () => {
    if (!selectedPrompt || submitting) return;
    setErrors({});
    const parsedMessages = getMessages();
    if (!parsedMessages) return;
    if (parsedMessages.length === 0) {
      setErrors({ messages: t('errorNoMessages') });
      return;
    }

    const body = {
      title: editValues.title,
      description: editValues.description,
      messages: parsedMessages,
      schema: buildSchema()
    };

    try {
      await utils.Schema.ARTIFACT_UPDATE_PROMPT_VIEW.parseAsync(body);
    } catch (err) {
      parseZodErrors(err);
      return;
    }

    setSubmitting(true);
    try {
      const data = await utils.fetcher({
        url: `${apiBase}/${selectedPrompt.id}`,
        config: {
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify(body)
        }
      });

      if (data && !data.error) {
        setSelectedPrompt(data);
        setIsEditing(false);
        fetchPrompts();
        snackbar.success(t('toastUpdated'));
      } else {
        snackbar.error(data?.error || t('toastUpdateFailed'));
      }
    } catch {
      snackbar.error(t('toastUpdateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = () => {
    if (!selectedPrompt) return;
    setDeleteAlert(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedPrompt || submitting) return;
    setSubmitting(true);
    try {
      const data = await utils.fetcher({
        url: `${apiBase}/${selectedPrompt.id}`,
        config: {
          method: 'DELETE',
          credentials: 'include'
        }
      });

      if (data && !data.error) {
        setDeleteAlert(false);
        setSelectedPrompt(null);
        setIsEditing(false);
        fetchPrompts();
        snackbar.success(t('toastDeleted'));
      } else {
        snackbar.error(data?.error || t('toastDeleteFailed'));
      }
    } catch {
      snackbar.error(t('toastDeleteFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleResizeMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const diff = startX.current - moveEvent.clientX;
      const newWidth = Math.max(
        360,
        Math.min(startWidth.current + diff, window.innerWidth - 300)
      );
      setPanelWidth(newWidth);
    };

    const handleResizeEnd = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  return (
    <Wrapper panelWidth={panelWidth}>
      <div
        className={`prompts-list ${selectedPrompt || isCreating ? 'has-selection' : ''}`}
      >
        <div className="prompts-header">
          <div className="prompts-header-text">
            <h1 className="prompts-title">{t('title')}</h1>
            <p className="prompts-subtitle">{t('subtitle')}</p>
          </div>
          <UI.Button variant="contained" size="small" onClick={handleCreate}>
            <Add />
            <span className="button-text">{t('newPrompt')}</span>
          </UI.Button>
        </div>
        {status === 'pending' && prompts.length === 0 && (
          <div className="prompts-items">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="prompt-item prompt-item-skeleton">
                <UI.Skeleton variant="text" width="35%" height={18} />
                <UI.Skeleton variant="text" width="85%" height={14} />
                <UI.Skeleton variant="text" width="25%" height={12} />
              </div>
            ))}
          </div>
        )}
        {status !== 'pending' && prompts.length === 0 && (
          <div className="prompts-empty-state">
            <ChatBubbleOutlineOutlined />
            <h3>{t('emptyTitle')}</h3>
            <p>{t('emptyText')}</p>
            <UI.Button variant="contained" size="small" onClick={handleCreate}>
              <Add />
              <span className="button-text">{t('newPrompt')}</span>
            </UI.Button>
          </div>
        )}
        <div className="prompts-items">
          {prompts.map(prompt => (
            <div
              key={prompt.id}
              className={`prompt-item ${selectedPrompt?.id === prompt.id ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => handleSelect(prompt)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelect(prompt);
                }
              }}
            >
              <p className="prompt-item-title">{prompt.title}</p>
              {utils.slugifyTitle(prompt.title) && (
                <code
                  className="prompt-item-command"
                  title={t('commandTooltip')}
                >
                  /{utils.slugifyTitle(prompt.title)}
                </code>
              )}
              {prompt.description && (
                <p className="prompt-item-description">{prompt.description}</p>
              )}
              <p className="prompt-item-date">
                {t.date(prompt.updatedAt || prompt.createdAt)}
              </p>
            </div>
          ))}
        </div>
      </div>
      {(selectedPrompt || isCreating) && (
        <div className="prompt-panel">
          <div
            className="panel-resize-handle"
            onMouseDown={handleResizeStart}
          />
          <div className="panel-header">
            <IconButton className="panel-back-btn" onClick={handleClose}>
              <ArrowBack />
            </IconButton>
            <h2 className="panel-title">
              {isCreating
                ? t('panelNew')
                : isEditing
                  ? t('panelEdit')
                  : selectedPrompt!.title}
            </h2>
            <div className="panel-actions">
              {!isEditing && !isCreating && (
                <>
                  <IconButton onClick={handleEdit} size="small">
                    <EditOutlined />
                  </IconButton>
                  <IconButton onClick={handleDeleteClick} size="small">
                    <DeleteOutlined />
                  </IconButton>
                </>
              )}
              <IconButton className="panel-close-btn" onClick={handleClose}>
                <Close />
              </IconButton>
            </div>
          </div>
          <div className="panel-content">
            {isCreating || isEditing ? (
              <div className="panel-edit-form">
                <UI.Input
                  label={t('titleLabel')}
                  name="title"
                  placeholder={t('titlePlaceholder')}
                  value={editValues.title}
                  disabled={submitting}
                  error={!!errors.title}
                  helperText={errors.title || t('titleHelp')}
                  onChange={e => {
                    setEditValues(prev => ({ ...prev, title: e.target.value }));
                    if (errors.title)
                      setErrors(prev => {
                        const n = { ...prev };
                        delete n.title;
                        return n;
                      });
                  }}
                />
                {utils.slugifyTitle(editValues.title) && (
                  <p className="panel-command-hint">
                    {t('slashCommand')}{' '}
                    <code>/{utils.slugifyTitle(editValues.title)}</code>
                  </p>
                )}
                <UI.Input
                  label={t('descriptionLabel')}
                  name="description"
                  placeholder={t('descriptionPlaceholder')}
                  value={editValues.description}
                  disabled={submitting}
                  error={!!errors.description}
                  helperText={errors.description}
                  onChange={e => {
                    setEditValues(prev => ({
                      ...prev,
                      description: e.target.value
                    }));
                    if (errors.description)
                      setErrors(prev => {
                        const n = { ...prev };
                        delete n.description;
                        return n;
                      });
                  }}
                  multiline
                  rows={2}
                />
                <div className="panel-messages-section">
                  <div className="panel-messages-header">
                    <p className="panel-messages-label">{t('messages')}</p>
                    <div className="panel-messages-mode-toggle">
                      <button
                        type="button"
                        className={`panel-mode-btn ${messageMode === 'visual' ? 'active' : ''}`}
                        disabled={submitting}
                        onClick={() => {
                          if (messageMode === 'json') {
                            try {
                              const parsed = JSON.parse(
                                editValues.messagesJson
                              );
                              setVisualMessages(parsed);
                            } catch {
                              // keep current visual messages
                            }
                          }
                          setMessageMode('visual');
                        }}
                      >
                        <ViewList />
                        {t('modeVisual')}
                      </button>
                      <button
                        type="button"
                        className={`panel-mode-btn ${messageMode === 'json' ? 'active' : ''}`}
                        disabled={submitting}
                        onClick={() => {
                          setEditValues(prev => ({
                            ...prev,
                            messagesJson: JSON.stringify(
                              visualMessages,
                              null,
                              2
                            )
                          }));
                          setMessageMode('json');
                        }}
                      >
                        <Code />
                        {t('modeJson')}
                      </button>
                    </div>
                  </div>
                  {errors.messages && (
                    <p className="panel-messages-error">{errors.messages}</p>
                  )}
                  {messageMode === 'visual' ? (
                    <div className="panel-message-builder">
                      {visualMessages.map((msg, i) => (
                        <div
                          key={i}
                          className={`panel-message-card panel-message-card-${msg.role}`}
                        >
                          <div className="panel-message-card-header">
                            <div className="panel-message-role-toggle">
                              <button
                                type="button"
                                className={`panel-role-btn ${msg.role === utils.constants.ROLE_MESSAGE_USER ? 'active' : ''}`}
                                disabled={submitting}
                                onClick={() =>
                                  setVisualMessages(prev =>
                                    prev.map((m, idx) =>
                                      idx === i
                                        ? {
                                            ...m,
                                            role: utils.constants
                                              .ROLE_MESSAGE_USER
                                          }
                                        : m
                                    )
                                  )
                                }
                              >
                                {t('roleUser')}
                              </button>
                              <button
                                type="button"
                                className={`panel-role-btn ${msg.role === utils.constants.ROLE_MESSAGE_ASSISTANT ? 'active' : ''}`}
                                disabled={submitting}
                                onClick={() =>
                                  setVisualMessages(prev =>
                                    prev.map((m, idx) =>
                                      idx === i
                                        ? {
                                            ...m,
                                            role: utils.constants
                                              .ROLE_MESSAGE_ASSISTANT
                                          }
                                        : m
                                    )
                                  )
                                }
                              >
                                {t('roleAssistant')}
                              </button>
                            </div>
                            {visualMessages.length > 1 && (
                              <IconButton
                                size="small"
                                disabled={submitting}
                                onClick={() =>
                                  setVisualMessages(prev =>
                                    prev.filter((_, idx) => idx !== i)
                                  )
                                }
                              >
                                <RemoveCircleOutlined />
                              </IconButton>
                            )}
                          </div>
                          <UI.Input
                            placeholder={
                              msg.role === utils.constants.ROLE_MESSAGE_USER
                                ? t('userPlaceholder')
                                : t('assistantPlaceholder')
                            }
                            value={msg.content}
                            disabled={submitting}
                            onChange={e =>
                              setVisualMessages(prev =>
                                prev.map((m, idx) =>
                                  idx === i
                                    ? { ...m, content: e.target.value }
                                    : m
                                )
                              )
                            }
                            multiline
                            rows={3}
                          />
                        </div>
                      ))}
                      <div className="panel-add-message">
                        <UI.Button
                          size="small"
                          disabled={submitting}
                          onClick={() =>
                            setVisualMessages(prev => [
                              ...prev,
                              {
                                role: utils.constants.ROLE_MESSAGE_USER,
                                content: ''
                              }
                            ])
                          }
                        >
                          <Add />
                          <span className="button-text">{t('addMessage')}</span>
                        </UI.Button>
                      </div>
                    </div>
                  ) : (
                    <UI.Input
                      label={t('messagesJson')}
                      name="messagesJson"
                      value={editValues.messagesJson}
                      disabled={submitting}
                      error={!!errors.messages}
                      helperText={errors.messages || t('messagesJsonHelp')}
                      onChange={e => {
                        setEditValues(prev => ({
                          ...prev,
                          messagesJson: e.target.value
                        }));
                        if (errors.messages)
                          setErrors(prev => {
                            const n = { ...prev };
                            delete n.messages;
                            return n;
                          });
                      }}
                      multiline
                      rows={10}
                    />
                  )}
                  {schemaVars.length > 0 && (
                    <div className="panel-schema-editor">
                      <p className="panel-schema-label">{t('variables')}</p>
                      <p className="panel-schema-hint">{t('variablesHint')}</p>
                      <div className="panel-schema-vars">
                        {schemaVars.map((v, i) => (
                          <div key={v.name} className="panel-schema-var">
                            <div className="panel-schema-var-header">
                              <span className="panel-schema-var-name">
                                {`{{${v.name}}}`}
                              </span>
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    size="small"
                                    checked={v.required}
                                    disabled={submitting}
                                    onChange={e =>
                                      setSchemaVars(prev =>
                                        prev.map((sv, idx) =>
                                          idx === i
                                            ? {
                                                ...sv,
                                                required: e.target.checked
                                              }
                                            : sv
                                        )
                                      )
                                    }
                                  />
                                }
                                label={t('variableRequired')}
                              />
                            </div>
                            <div className="panel-schema-var-fields">
                              <UI.Select
                                label={t('variableType')}
                                value={v.type}
                                disabled={submitting}
                                onChange={e =>
                                  setSchemaVars(prev =>
                                    prev.map((sv, idx) =>
                                      idx === i
                                        ? {
                                            ...sv,
                                            type: e.target.value as
                                              | 'string'
                                              | 'number'
                                              | 'boolean'
                                          }
                                        : sv
                                    )
                                  )
                                }
                                options={[
                                  { label: 'String', value: 'string' },
                                  { label: 'Number', value: 'number' },
                                  { label: 'Boolean', value: 'boolean' }
                                ]}
                              />
                              <UI.Input
                                label={t('variableDescription')}
                                placeholder={t(
                                  'variableDescriptionPlaceholder'
                                )}
                                value={v.description}
                                disabled={submitting}
                                onChange={e =>
                                  setSchemaVars(prev =>
                                    prev.map((sv, idx) =>
                                      idx === i
                                        ? {
                                            ...sv,
                                            description: e.target.value
                                          }
                                        : sv
                                    )
                                  )
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="panel-edit-actions">
                  <UI.Button
                    variant="contained"
                    size="small"
                    disabled={submitting}
                    onClick={isCreating ? handleCreateSubmit : handleUpdate}
                  >
                    {submitting
                      ? isCreating
                        ? c('creating')
                        : c('saving')
                      : isCreating
                        ? c('create')
                        : c('save')}
                  </UI.Button>
                  <UI.Button
                    size="small"
                    disabled={submitting}
                    onClick={handleCancel}
                  >
                    {c('cancel')}
                  </UI.Button>
                </div>
              </div>
            ) : selectedPrompt ? (
              <div className="panel-view">
                {selectedPrompt.description && (
                  <div className="panel-section">
                    <h3 className="panel-section-label">
                      {t('viewDescription')}
                    </h3>
                    <p className="panel-section-text">
                      {selectedPrompt.description}
                    </p>
                  </div>
                )}
                <div className="panel-section">
                  <h3 className="panel-section-label">{t('viewMessages')}</h3>
                  <div className="panel-messages">
                    {selectedPrompt.messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`panel-message panel-message-${msg.role}`}
                      >
                        <span className="panel-message-role">{msg.role}</span>
                        <p className="panel-message-content">{msg.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {selectedPrompt.schema &&
                  Object.keys(
                    (selectedPrompt.schema as { properties?: object })
                      ?.properties || {}
                  ).length > 0 && (
                    <div className="panel-section">
                      <div className="panel-schema-header">
                        <h3 className="panel-section-label">
                          {t('variables')}
                        </h3>
                        <div className="panel-schema-view-toggle">
                          <button
                            type="button"
                            className={`panel-mode-btn ${schemaViewMode === 'visual' ? 'active' : ''}`}
                            onClick={() => setSchemaViewMode('visual')}
                          >
                            <ViewList />
                            {t('modeVisual')}
                          </button>
                          <button
                            type="button"
                            className={`panel-mode-btn ${schemaViewMode === 'json' ? 'active' : ''}`}
                            onClick={() => setSchemaViewMode('json')}
                          >
                            <Code />
                            {t('modeJson')}
                          </button>
                        </div>
                      </div>
                      {schemaViewMode === 'visual' ? (
                        <div className="panel-schema-visual">
                          {(() => {
                            const schema = selectedPrompt.schema as {
                              properties?: Record<
                                string,
                                { type?: string; description?: string }
                              >;
                              required?: string[];
                            };
                            const props = schema?.properties || {};
                            const required = schema?.required || [];
                            return Object.entries(props).map(([name, def]) => (
                              <div
                                key={name}
                                className="panel-schema-visual-var"
                              >
                                <div className="panel-schema-visual-row">
                                  <span className="panel-schema-visual-name">
                                    {`{{${name}}}`}
                                  </span>
                                  <span className="panel-schema-visual-type">
                                    {def.type || 'string'}
                                  </span>
                                  {required.includes(name) ? (
                                    <span className="panel-schema-visual-required">
                                      {t('variableRequired')}
                                    </span>
                                  ) : (
                                    <span className="panel-schema-visual-optional">
                                      {t('variableOptional')}
                                    </span>
                                  )}
                                </div>
                                {def.description && (
                                  <p className="panel-schema-visual-description">
                                    {def.description}
                                  </p>
                                )}
                              </div>
                            ));
                          })()}
                        </div>
                      ) : (
                        <pre className="panel-schema">
                          {JSON.stringify(selectedPrompt.schema, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
              </div>
            ) : null}
          </div>
        </div>
      )}
      <UI.Alert
        open={deleteAlert}
        title={t('confirmDeleteTitle')}
        description={t('confirmDeleteText', {
          title: selectedPrompt?.title ?? ''
        })}
        confirmText={t('confirmDelete')}
        cancelText={c('cancel')}
        loadingText={c('deleting')}
        loading={submitting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteAlert(false)}
      />
    </Wrapper>
  );
};
