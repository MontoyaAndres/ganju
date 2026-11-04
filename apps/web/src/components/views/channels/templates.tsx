import { useEffect, useRef, useState } from 'react';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';

import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import {
  Add,
  Close,
  DeleteOutlined,
  EditOutlined,
  RefreshOutlined
} from '@mui/icons-material';

import {
  TemplateChip,
  TemplateDialogContent,
  TemplateDialogFooter,
  TemplatesWrapper
} from './templatesStyles';
import { i18n } from '../../../lib';

import type { Translate } from '../../../lib';
import type {
  WhatsappTemplateCategory,
  WhatsappTemplateDraft,
  WhatsappTemplateIssue
} from '@ganju/utils';

// A WhatsApp channel's message templates: Meta's approved messages, the
// only ones that reach a customer more than 24 hours after they last wrote.

type Access = 'ok' | 'no_account' | 'permission' | 'token' | 'meta';

export interface WhatsappTemplate {
  id: string;
  templateId: string;
  name: string;
  language: string;
  category: string;
  status: string;
  rejectedReason: string | null;
  header: string | null;
  body: string;
  footer: string | null;
  buttons: string[];
  examples: string[];
  labels: string[];
  variableCount: number;
  sendable: boolean;
  syncedAt: string;
}

interface TemplateState {
  businessAccountId: string | null;
  access: Access | null;
  error: string | null;
  templates: WhatsappTemplate[];
  syncedAt: string | null;
}

type T = Translate<(typeof i18n.copy.WHATSAPP_TEMPLATES)['en']>;

const statusTone = (status: string): 'ok' | 'wait' | 'bad' | undefined =>
  status === utils.WHATSAPP_TEMPLATE_STATUS_APPROVED
    ? 'ok'
    : utils.WHATSAPP_TEMPLATE_STATUSES_WAITING.includes(status)
      ? 'wait'
      : ['REJECTED', ...utils.WHATSAPP_TEMPLATE_STATUSES_STOPPED].includes(
            status
          )
        ? 'bad'
        : undefined;

const STATUS_KEYS: Record<string, string> = {
  APPROVED: 'statusApproved',
  PENDING: 'statusPending',
  REJECTED: 'statusRejected',
  PAUSED: 'statusPaused',
  DISABLED: 'statusDisabled',
  IN_APPEAL: 'statusInAppeal'
};

export const templateStatusLabel = (t: T, status: string) =>
  STATUS_KEYS[status]
    ? t(STATUS_KEYS[status] as 'statusApproved')
    : status.toLowerCase().replace(/_/g, ' ');

const languageLabel = (code: string) => {
  const found = utils.WHATSAPP_TEMPLATE_LANGUAGES.find(l => l.code === code);
  return found ? `${found.name} · ${code}` : code;
};

const request = async <R,>(
  url: string,
  method = 'GET',
  body?: unknown
): Promise<{ ok: boolean; data: R; error: string }> => {
  try {
    const data = await utils.fetcher({
      url,
      config: {
        method,
        credentials: 'include',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      }
    });
    if (!data || data.error || data.errors) {
      return {
        ok: false,
        data: null as R,
        error: utils.getApiErrorMessage(data, '')
      };
    }
    return { ok: true, data: data as R, error: '' };
  } catch {
    return { ok: false, data: null as R, error: '' };
  }
};

interface TemplatesProps {
  // The channel's path: /organization/…/project/…/channel/<id>.
  channelPath: string;
}

export const WhatsappTemplates = ({ channelPath }: TemplatesProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.WHATSAPP_TEMPLATES);
  const c = i18n.useT(i18n.copy.COMMON);
  const base = `${channelPath}/whatsapp`;
  const [state, setState] = useState<TemplateState | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [editing, setEditing] = useState<WhatsappTemplate | 'new' | null>(null);
  const [deleting, setDeleting] = useState<WhatsappTemplate | null>(null);
  const [removing, setRemoving] = useState(false);

  // Reading from Meta is also the permission check.
  const sync = async () => {
    setLoading(true);
    const result = await request<TemplateState>(
      `${base}/template/sync`,
      'POST'
    );
    setLoading(false);
    if (!result.ok) {
      setFailed(result.error || t('loadFailed'));
      return;
    }
    setFailed(null);
    setState(result.data);
  };

  useEffect(() => {
    setState(null);
    sync();
  }, [base]);

  const handleSaved = (template: WhatsappTemplate) => {
    setEditing(null);
    setState(prev =>
      prev
        ? {
            ...prev,
            templates: [
              ...prev.templates.filter(x => x.id !== template.id),
              template
            ].sort((a, b) =>
              `${a.name} ${a.language}`.localeCompare(`${b.name} ${b.language}`)
            )
          }
        : prev
    );
  };

  const handleDelete = async () => {
    if (!deleting || removing) return;
    setRemoving(true);
    const result = await request(`${base}/template/${deleting.id}`, 'DELETE');
    setRemoving(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastDeleteFailed'));
      return;
    }
    const id = deleting.id;
    setDeleting(null);
    setState(prev =>
      prev
        ? { ...prev, templates: prev.templates.filter(x => x.id !== id) }
        : prev
    );
    snackbar.success(t('toastDeleted'));
  };

  const access = state?.access ?? null;
  const ready = access === 'ok';

  return (
    <TemplatesWrapper>
      <p className="templates-hint">{t('intro')}</p>
      <div className="templates-toolbar">
        <UI.Button
          size="small"
          variant="outlined"
          disabled={loading}
          onClick={sync}
        >
          <RefreshOutlined />
          <span className="button-text">
            {loading ? t('refreshing') : t('refresh')}
          </span>
        </UI.Button>
        <UI.Button
          size="small"
          variant="contained"
          disabled={!ready}
          onClick={() => setEditing('new')}
        >
          <Add />
          <span className="button-text">{t('newTemplate')}</span>
        </UI.Button>
      </div>

      {failed && <p className="templates-error">{failed}</p>}

      {state && access && access !== 'ok' && (
        <AccountNotice
          t={t}
          base={base}
          access={access}
          error={state.error}
          businessAccountId={state.businessAccountId}
          onSaved={next => setState(next)}
        />
      )}

      {!state && loading && <UI.Skeleton variant="rounded" height={72} />}

      {state && state.templates.length === 0 && ready && (
        <p className="templates-hint">{t('empty')}</p>
      )}

      {state && state.templates.length > 0 && (
        <div className="templates-list">
          {state.templates.map(template => (
            <div key={template.id} className="template-row">
              <div className="template-row-text">
                <span className="template-row-name">{template.name}</span>
                <div className="template-chips">
                  <TemplateChip tone={statusTone(template.status)}>
                    {templateStatusLabel(t, template.status)}
                  </TemplateChip>
                  <TemplateChip>
                    {languageLabel(template.language)}
                  </TemplateChip>
                  {!template.sendable && (
                    <Tooltip title={t('notSendableHint')}>
                      <TemplateChip tone="wait">
                        {t('notSendable')}
                      </TemplateChip>
                    </Tooltip>
                  )}
                  <TemplateChip>
                    {template.category === 'MARKETING'
                      ? t('categoryMarketing')
                      : template.category === 'UTILITY'
                        ? t('categoryUtility')
                        : template.category.toLowerCase()}
                  </TemplateChip>
                </div>
                {template.rejectedReason && (
                  <p className="templates-error">
                    {t('metaReason', { reason: template.rejectedReason })}
                  </p>
                )}
                <p className="template-row-body">{template.body}</p>
              </div>
              <Tooltip title={t('edit')}>
                <span>
                  <IconButton
                    size="small"
                    disabled={!ready || !template.sendable}
                    onClick={() => setEditing(template)}
                  >
                    <EditOutlined fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={t('delete')}>
                <span>
                  <IconButton
                    size="small"
                    disabled={!ready}
                    onClick={() => setDeleting(template)}
                  >
                    <DeleteOutlined fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </div>
          ))}
        </div>
      )}

      {state?.syncedAt && (
        <p className="templates-hint">
          {t('syncedAt', { when: new Date(state.syncedAt).toLocaleString() })}
        </p>
      )}

      {editing && (
        <TemplateDialog
          t={t}
          base={base}
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      <UI.Alert
        open={!!deleting}
        title={t('deleteTitle')}
        description={t('deleteText', {
          name: deleting?.name ?? '',
          language: deleting?.language ?? ''
        })}
        confirmText={t('delete')}
        cancelText={c('cancel')}
        loadingText={c('deleting')}
        loading={removing}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </TemplatesWrapper>
  );
};

interface AccountNoticeProps {
  t: T;
  base: string;
  access: Exclude<Access, 'ok'>;
  error: string | null;
  businessAccountId: string | null;
  onSaved: (state: TemplateState) => void;
}

// What templates need that the channel doesn't have yet: the business
// account's id, or a token allowed to manage templates.
const AccountNotice = ({
  t,
  base,
  access,
  error,
  businessAccountId,
  onSaved
}: AccountNoticeProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const [accountId, setAccountId] = useState(businessAccountId ?? '');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const wantsToken = access === 'permission' || access === 'token';

  const save = async () => {
    if (saving) return;
    const body: Record<string, string> = {};
    if (token.trim()) body.accessToken = token.trim();
    if (accountId.trim() && accountId.trim() !== businessAccountId) {
      body.businessAccountId = accountId.trim();
    }
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    setSaveError(null);
    const result = await request<TemplateState>(`${base}/account`, 'PUT', body);
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error || t('accountSaveFailed'));
      return;
    }
    setToken('');
    if (result.data.access === 'ok') snackbar.success(t('toastAccountSaved'));
    onSaved(result.data);
  };

  return (
    <div className="templates-notice">
      <p className="templates-notice-title">
        {access === 'no_account'
          ? t('noAccountTitle')
          : access === 'permission'
            ? t('permissionTitle')
            : access === 'token'
              ? t('tokenTitle')
              : t('metaTitle')}
      </p>
      {access === 'no_account' && <p>{t('noAccountText')}</p>}
      {access === 'permission' && (
        <>
          <p>
            {t('permissionTextBefore')}
            <code>whatsapp_business_management</code>
            {t('permissionTextAfter')}
          </p>
          <ol>
            <li>{t('permissionStep1')}</li>
            <li>
              {t('permissionStep2Before')}
              <code>whatsapp_business_management</code>
              {t('permissionStep2After')}
            </li>
            <li>{t('permissionStep3')}</li>
          </ol>
        </>
      )}
      {access === 'token' && <p>{t('tokenText')}</p>}
      {error && <p className="templates-error">{error}</p>}
      {wantsToken && (
        <UI.Input
          size="small"
          type="password"
          label={t('newToken')}
          value={token}
          disabled={saving}
          helperText={t('newTokenHelp')}
          onChange={e => setToken(e.target.value)}
        />
      )}
      {access !== 'meta' && (
        <UI.Input
          size="small"
          label={t('businessAccountId')}
          placeholder="102938475610293"
          value={accountId}
          disabled={saving}
          helperText={t('businessAccountIdHelp')}
          onChange={e => setAccountId(e.target.value.replace(/\D/g, ''))}
        />
      )}
      {saveError && <p className="templates-error">{saveError}</p>}
      {access !== 'meta' && (
        <div>
          <UI.Button
            size="small"
            variant="contained"
            disabled={
              saving ||
              (!token.trim() &&
                (!accountId.trim() || accountId.trim() === businessAccountId))
            }
            onClick={save}
          >
            <span className="button-text">
              {saving ? t('saving') : t('save')}
            </span>
          </UI.Button>
        </div>
      )}
    </div>
  );
};

interface Variable {
  label: string;
  example: string;
}

interface TemplateDialogProps {
  t: T;
  base: string;
  template: WhatsappTemplate | null;
  onClose: () => void;
  onSaved: (template: WhatsappTemplate) => void;
}

const NAME_PATTERN = /^[a-z0-9_]*$/;
// Shown when there is nothing to say yet: the form starts empty.
const QUIET_ISSUES = new Set(['body_empty', 'name_format']);

const TemplateDialog = ({
  t,
  base,
  template,
  onClose,
  onSaved
}: TemplateDialogProps) => {
  const c = i18n.useT(i18n.copy.COMMON);
  const snackbar = UI.Alert.useSnackbar();
  const [name, setName] = useState(template?.name ?? '');
  const [language, setLanguage] = useState(template?.language ?? 'es');
  const [category, setCategory] = useState<WhatsappTemplateCategory>(
    template?.category === 'MARKETING' ? 'MARKETING' : 'UTILITY'
  );
  const [header, setHeader] = useState(template?.header ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [footer, setFooter] = useState(template?.footer ?? '');
  const [buttons, setButtons] = useState<string[]>(template?.buttons ?? []);
  const [variables, setVariables] = useState<Variable[]>(
    Array.from({ length: template?.variableCount ?? 0 }, (_, i) => ({
      label: template?.labels[i] ?? '',
      example: template?.examples[i] ?? ''
    }))
  );
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [error]);

  // One entry per {{n}} in the body, whether typed or inserted.
  const count = utils.whatsappTemplateVariableCount(body);
  const vars: Variable[] = Array.from(
    { length: count },
    (_, i) => variables[i] ?? { label: '', example: '' }
  );

  const draft: WhatsappTemplateDraft = {
    name,
    language,
    category,
    header,
    body,
    footer,
    buttons,
    examples: vars.map(v => v.example),
    labels: vars.map(v => v.label)
  };
  const issues = utils
    .checkWhatsappTemplate(draft)
    .filter(issue => tried || !QUIET_ISSUES.has(issue.code));

  const issueText = (issue: WhatsappTemplateIssue) =>
    t(`issue_${issue.code}` as 'issue_name_format', {
      n: issue.n ?? '',
      max: ISSUE_MAX[issue.code] ?? ''
    });

  const setVariable = (index: number, patch: Partial<Variable>) =>
    setVariables(prev => {
      const next = Array.from(
        { length: Math.max(prev.length, index + 1) },
        (_, i) => prev[i] ?? { label: '', example: '' }
      );
      next[index] = { ...next[index], ...patch };
      return next;
    });

  // Puts the next {{n}} where the cursor is, with the label typed for it.
  const insertVariable = () => {
    const n = count + 1;
    const token = `{{${n}}}`;
    const el = bodyRef.current;
    const at = el ? el.selectionStart : body.length;
    const end = el ? el.selectionEnd : body.length;
    const before = body.slice(0, at);
    const after = body.slice(end);
    const pad = (s: string, side: 'l' | 'r') =>
      side === 'l'
        ? s && !/\s$/.test(s)
          ? ' '
          : ''
        : s && !/^[\s.,!?;:]/.test(s)
          ? ' '
          : '';
    setBody(`${before}${pad(before, 'l')}${token}${pad(after, 'r')}${after}`);
    setVariable(n - 1, { label: newLabel.trim() });
    setNewLabel('');
    requestAnimationFrame(() => el?.focus());
  };

  const preview = utils.fillWhatsappTemplate(
    body,
    vars.map((v, i) => v.example.trim() || `[${v.label.trim() || i + 1}]`)
  );

  const save = async () => {
    setTried(true);
    setError(null);
    const all = utils.checkWhatsappTemplate(draft);
    if (all.length > 0 || saving) return;
    setSaving(true);
    const content = {
      category,
      header: header.trim() || null,
      body: body.trim(),
      footer: footer.trim() || null,
      buttons: buttons.map(b => b.trim()).filter(Boolean),
      examples: vars.map(v => v.example.trim()),
      labels: vars.map(v => v.label.trim())
    };
    const result = template
      ? await request<WhatsappTemplate>(
          `${base}/template/${template.id}`,
          'PUT',
          content
        )
      : await request<WhatsappTemplate>(`${base}/template`, 'POST', {
          ...content,
          name,
          language
        });
    setSaving(false);
    if (!result.ok) {
      // Meta's own words.
      setError(result.error || t('saveFailed'));
      return;
    }
    snackbar.success(template ? t('toastUpdated') : t('toastCreated'));
    onSaved(result.data);
  };

  return (
    <UI.Modal
      open
      title={template ? t('editTitle', { name: template.name }) : t('newTitle')}
      closeLabel={c('close')}
      width={940}
      onClose={() => !saving && onClose()}
      footer={
        <TemplateDialogFooter>
          <UI.Button size="small" disabled={saving} onClick={onClose}>
            {c('cancel')}
          </UI.Button>
          <UI.Button
            size="small"
            variant="contained"
            disabled={saving || (tried && issues.length > 0)}
            onClick={save}
          >
            {saving
              ? t('submitting')
              : template
                ? t('submitEdit')
                : t('submitNew')}
          </UI.Button>
        </TemplateDialogFooter>
      }
    >
      <TemplateDialogContent>
        <div className="template-form">
          <p className="template-hint">{t('reviewNote')}</p>
          <div className="template-form-row">
            <UI.Input
              size="small"
              label={t('name')}
              placeholder="order_ready"
              value={name}
              disabled={saving || !!template}
              error={!!name && !NAME_PATTERN.test(name)}
              helperText={
                name && !NAME_PATTERN.test(name)
                  ? t('nameInvalid')
                  : t('nameHelp')
              }
              onChange={e => setName(e.target.value)}
            />
            <UI.Select
              size="small"
              label={t('language')}
              value={language}
              disabled={saving || !!template}
              options={utils.WHATSAPP_TEMPLATE_LANGUAGES.map(l => ({
                label: `${l.name} · ${l.code}`,
                value: l.code
              }))}
              onChange={e => setLanguage(String(e.target.value))}
            />
          </div>
          <UI.Select
            size="small"
            label={t('category')}
            value={category}
            disabled={saving}
            helperText={
              category === 'UTILITY'
                ? t('categoryUtilityHelp')
                : t('categoryMarketingHelp')
            }
            options={[
              { label: t('categoryUtilityRecommended'), value: 'UTILITY' },
              { label: t('categoryMarketing'), value: 'MARKETING' }
            ]}
            onChange={e =>
              setCategory(e.target.value as WhatsappTemplateCategory)
            }
          />
          <UI.Input
            size="small"
            label={t('header')}
            value={header}
            disabled={saving}
            helperText={t('optionalMax', {
              max: utils.WHATSAPP_TEMPLATE_HEADER_MAX
            })}
            onChange={e => setHeader(e.target.value.replace(/[\r\n]/g, ''))}
          />
          <UI.Input
            size="small"
            label={t('body')}
            placeholder={t('bodyPlaceholder')}
            multiline
            minRows={4}
            value={body}
            disabled={saving}
            inputRef={bodyRef}
            helperText={`${body.length}/${utils.WHATSAPP_TEMPLATE_BODY_MAX} · ${t('bodyHelp')}`}
            onChange={e => setBody(e.target.value)}
          />

          <p className="template-section-label">{t('variables')}</p>
          <div className="template-variable-add">
            <UI.Input
              size="small"
              label={t('variableLabel')}
              placeholder={t('variableLabelPlaceholder')}
              value={newLabel}
              disabled={
                saving || count >= utils.WHATSAPP_TEMPLATE_VARIABLES_MAX
              }
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  insertVariable();
                }
              }}
            />
            <UI.Button
              variant="outlined"
              size="small"
              disabled={
                saving || count >= utils.WHATSAPP_TEMPLATE_VARIABLES_MAX
              }
              onClick={insertVariable}
            >
              <Add />
              <span className="button-text">{t('addVariable')}</span>
            </UI.Button>
          </div>
          {vars.length === 0 && (
            <p className="template-hint">{t('variablesHelp')}</p>
          )}
          {vars.map((variable, i) => (
            <div key={i} className="template-variable">
              <span className="template-variable-chip">{`{{${i + 1}}}`}</span>
              <UI.Input
                size="small"
                label={t('variableLabel')}
                value={variable.label}
                disabled={saving}
                onChange={e => setVariable(i, { label: e.target.value })}
              />
              <UI.Input
                size="small"
                label={t('variableExample')}
                value={variable.example}
                disabled={saving}
                error={tried && !variable.example.trim()}
                onChange={e => setVariable(i, { example: e.target.value })}
              />
            </div>
          ))}

          <UI.Input
            size="small"
            label={t('footer')}
            value={footer}
            disabled={saving}
            helperText={t('optionalMax', {
              max: utils.WHATSAPP_TEMPLATE_FOOTER_MAX
            })}
            onChange={e => setFooter(e.target.value)}
          />

          <p className="template-section-label">{t('quickReplies')}</p>
          <div className="template-buttons">
            {buttons.map((button, i) => (
              <div key={i} className="template-button-row">
                <UI.Input
                  size="small"
                  label={t('quickReply', { n: i + 1 })}
                  value={button}
                  disabled={saving}
                  onChange={e =>
                    setButtons(prev =>
                      prev.map((b, j) => (j === i ? e.target.value : b))
                    )
                  }
                />
                <IconButton
                  size="small"
                  disabled={saving}
                  aria-label={t('removeQuickReply')}
                  onClick={() =>
                    setButtons(prev => prev.filter((_, j) => j !== i))
                  }
                >
                  <Close fontSize="small" />
                </IconButton>
              </div>
            ))}
            {buttons.length < utils.WHATSAPP_TEMPLATE_BUTTONS_MAX && (
              <div>
                <UI.Button
                  variant="outlined"
                  size="small"
                  disabled={saving}
                  onClick={() => setButtons(prev => [...prev, ''])}
                >
                  <Add />
                  <span className="button-text">{t('addQuickReply')}</span>
                </UI.Button>
              </div>
            )}
          </div>

          <p className="template-hint">{t('costNote')}</p>
          {issues.length > 0 && (
            <ul className="template-issues">
              {issues.map((issue, i) => (
                <li key={`${issue.code}-${issue.n ?? i}`}>
                  {issueText(issue)}
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p ref={errorRef} className="template-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="template-preview" aria-label={t('preview')}>
          <p className="template-section-label">{t('preview')}</p>
          <div className="template-bubble">
            {header.trim() && (
              <span className="template-bubble-header">{header.trim()}</span>
            )}
            <span className="template-bubble-body">
              {preview.trim() || t('previewEmpty')}
            </span>
            {footer.trim() && (
              <span className="template-bubble-footer">{footer.trim()}</span>
            )}
          </div>
          {buttons
            .filter(b => b.trim())
            .map((b, i) => (
              <span key={i} className="template-bubble-reply">
                {b.trim()}
              </span>
            ))}
        </div>
      </TemplateDialogContent>
    </UI.Modal>
  );
};

const ISSUE_MAX: Partial<Record<string, number>> = {
  name_long: utils.WHATSAPP_TEMPLATE_NAME_MAX,
  body_long: utils.WHATSAPP_TEMPLATE_BODY_MAX,
  header_long: utils.WHATSAPP_TEMPLATE_HEADER_MAX,
  footer_long: utils.WHATSAPP_TEMPLATE_FOOTER_MAX,
  button_long: utils.WHATSAPP_TEMPLATE_BUTTON_MAX,
  buttons_many: utils.WHATSAPP_TEMPLATE_BUTTONS_MAX,
  variables_many: utils.WHATSAPP_TEMPLATE_VARIABLES_MAX
};
