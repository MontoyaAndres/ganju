import { useEffect, useRef, useState } from 'react';
import { UI } from '@ganju/ui';
import {
  DATA_TIME_MAX_MINUTES,
  DATA_TIME_MIN_MINUTES,
  DATA_TRIGGER_DEFAULT_RATE,
  DATA_TRIGGER_MAX_DEPTH,
  DATA_TRIGGER_MAX_RATE
} from '@ganju/utils/data';

import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import {
  Add,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  ReplayOutlined,
  SendOutlined,
  TerminalOutlined
} from '@mui/icons-material';

import { DialogContent, FooterActions } from './styles';
import { dataRequest } from './api';
import { i18n } from '../../../lib';

import type { Translate } from '../../../lib';
import type {
  DataColumnType,
  DataTable,
  DataTrigger,
  DataTriggerAction,
  DataTriggerActionType,
  DataTriggerCondition,
  DataTriggerEvent,
  DataTriggerRun
} from './types';

const EVENTS: DataTriggerEvent[] = ['insert', 'update', 'delete', 'time'];
const ACTIONS: DataTriggerActionType[] = [
  'function',
  'webhook',
  'chat',
  'email',
  'customer'
];
type TestKey = 'changedTo' | 'changedFrom' | 'equals' | 'changed';
const TESTS: TestKey[] = ['changedTo', 'changedFrom', 'equals', 'changed'];

// A time trigger's delay, shown in the largest whole unit.
type TimeUnit = 'minutes' | 'hours' | 'days';
const UNITS: TimeUnit[] = ['minutes', 'hours', 'days'];
const UNIT_MINUTES: Record<TimeUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440
};
const SYSTEM_TIMES = ['created_at', 'updated_at'];

const splitMinutes = (minutes: number) => {
  const abs = Math.abs(minutes);
  const unit: TimeUnit =
    abs % 1440 === 0 ? 'days' : abs % 60 === 0 ? 'hours' : 'minutes';
  return { amount: abs / UNIT_MINUTES[unit], unit, before: minutes < 0 };
};

// The platforms a trigger can post to a group or channel on.
const CHAT_PLATFORMS: Record<string, string> = {
  telegram: 'Telegram',
  slack: 'Slack',
  discord: 'Discord'
};

const NAME_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;

interface ProjectFunction {
  name: string;
  expose?: boolean;
}

interface ProjectChannel {
  id: string;
  label: string;
}

// An approved WhatsApp template on one of the project's channels.
interface ProjectTemplate {
  name: string;
  language: string;
  body: string;
  labels: string[];
  variableCount: number;
}

const templateKey = (name: string, language: string) =>
  `${name}\u0000${language}`;
// A parameter that is exactly {{column}} reads that column of the row.
const FIELD_PARAM = /^\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/;

interface ChannelRow {
  id: string;
  platform: string;
  metadata: {
    telegram?: { bot?: { firstName?: string; username?: string } };
    slack?: { bot?: { teamName?: string; username?: string } };
    discord?: { bot?: { username?: string; globalName?: string | null } };
  } | null;
}

const channelLabel = (channel: ChannelRow) => {
  const meta = channel.metadata;
  const telegram = meta?.telegram?.bot;
  const bot =
    channel.platform === 'telegram'
      ? telegram?.username
        ? `@${telegram.username}`
        : telegram?.firstName
      : channel.platform === 'slack'
        ? meta?.slack?.bot?.teamName || meta?.slack?.bot?.username
        : meta?.discord?.bot?.globalName || meta?.discord?.bot?.username;
  return `${CHAT_PLATFORMS[channel.platform]} · ${bot || channel.id.slice(0, 8)}`;
};

// The live script's functions, the project's chat channels and its approved
// WhatsApp templates, for the dialog's selects. Each list comes back empty
// when it can't be read.
const useTargets = (base: string) => {
  const [functions, setFunctions] = useState<ProjectFunction[] | null>(null);
  const [channels, setChannels] = useState<ProjectChannel[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);

  useEffect(() => {
    const artifactBase = base.replace(/\/data$/, '');
    const projectBase = base.replace(/\/artifact\/data$/, '');
    dataRequest<{
      activeVersionId: string | null;
      versions: { id: string; tools: ProjectFunction[] }[];
    }>(artifactBase, '/custom-code/versions').then(result => {
      const live = result.ok
        ? result.data.versions?.find(v => v.id === result.data.activeVersionId)
        : null;
      setFunctions(live?.tools ?? []);
    });
    dataRequest<ChannelRow[]>(projectBase, '/channel').then(async result => {
      if (!result.ok || !Array.isArray(result.data)) return;
      setChannels(
        result.data
          .filter(channel => channel.platform in CHAT_PLATFORMS)
          .map(channel => ({ id: channel.id, label: channelLabel(channel) }))
      );
      const lists = await Promise.all(
        result.data
          .filter(channel => channel.platform === 'whatsapp')
          .map(channel =>
            dataRequest<{
              templates: (ProjectTemplate & {
                status: string;
                sendable: boolean;
              })[];
            }>(projectBase, `/channel/${channel.id}/whatsapp/template`)
          )
      );
      const found = new Map<string, ProjectTemplate>();
      for (const list of lists) {
        if (!list.ok) continue;
        for (const template of list.data.templates ?? []) {
          // Ganju fills body variables only; Meta would refuse the rest.
          if (template.status !== 'APPROVED' || !template.sendable) continue;
          found.set(templateKey(template.name, template.language), template);
        }
      }
      setTemplates([...found.values()]);
    });
  }, [base]);

  return { functions, channels, templates };
};

interface TriggersTabProps {
  base: string;
  table: DataTable;
  readOnly: boolean;
}

/** The table's triggers: what runs when its rows change. */
export const TriggersTab = ({ base, table, readOnly }: TriggersTabProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const [triggers, setTriggers] = useState<DataTrigger[] | null>(null);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);
  // null: closed; a trigger: editing it; 'new': a new one.
  const [editing, setEditing] = useState<DataTrigger | 'new' | null>(null);
  const [dropping, setDropping] = useState<DataTrigger | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [runsOf, setRunsOf] = useState<DataTrigger | null>(null);
  // A new webhook's secret, shown once.
  const [secret, setSecret] = useState<string | null>(null);
  const targets = useTargets(base);

  const load = async () => {
    const result = await dataRequest<{
      triggers: DataTrigger[];
      pending: number;
    }>(base, '/trigger');
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setTriggers(result.data.triggers.filter(tr => tr.table === table.name));
    setPending(result.data.pending ?? 0);
  };

  useEffect(() => {
    load();
  }, [base, table.name]);

  const handleToggle = async (trigger: DataTrigger, enabled: boolean) => {
    if (toggling) return;
    setToggling(trigger.name);
    const result = await dataRequest<{ trigger: DataTrigger }>(
      base,
      `/trigger/${encodeURIComponent(trigger.name)}`,
      { method: 'PATCH', body: { enabled } }
    );
    setToggling(null);
    if (!result.ok) {
      snackbar.error(result.error || t('toastTriggerToggleFailed'));
      return;
    }
    setTriggers(prev =>
      prev
        ? prev.map(tr => (tr.name === trigger.name ? result.data.trigger : tr))
        : prev
    );
  };

  const handleDrop = async () => {
    if (!dropping || deleting) return;
    setDeleting(true);
    const result = await dataRequest(
      base,
      `/trigger/${encodeURIComponent(dropping.name)}`,
      { method: 'DELETE' }
    );
    setDeleting(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastTriggerDeleteFailed'));
      return;
    }
    setDropping(null);
    snackbar.success(t('toastTriggerDeleted'));
    load();
  };

  const actionSummary = (action: DataTriggerAction) => {
    switch (action.type) {
      case 'function':
        return action.function;
      case 'webhook':
        return action.url;
      case 'chat': {
        const channel = targets.channels.find(ch => ch.id === action.channelId);
        return `${channel?.label ?? action.channelId} · ${action.chatId}`;
      }
      case 'email':
        return action.to.join(', ');
      case 'customer':
        return action.template
          ? `${t('triggerCustomerSummary')} · ${t('triggerTemplateSummary', { name: action.template.name })}`
          : t('triggerCustomerSummary');
    }
  };

  return (
    <div className="data-schema">
      <section className="data-card">
        <div className="data-card-header">
          <div>
            <h3>{t('triggersTitle')}</h3>
            <p className="data-card-muted">
              {t('triggersHelp', { depth: DATA_TRIGGER_MAX_DEPTH })}
            </p>
            {pending > 0 && (
              <p className="trigger-pending">
                {t.plural('triggersPending', pending)}
              </p>
            )}
          </div>
          <UI.Button
            variant="contained"
            size="small"
            disabled={readOnly}
            onClick={() => setEditing('new')}
          >
            <Add />
            <span className="button-text">{t('newTrigger')}</span>
          </UI.Button>
        </div>

        {failed && <p className="data-error">{c('somethingWentWrong')}</p>}
        {!triggers && !failed && <UI.Skeleton variant="rounded" height={120} />}
        {triggers && triggers.length === 0 && (
          <p className="data-card-muted">{t('triggersEmpty')}</p>
        )}
        {triggers && triggers.length > 0 && (
          <ul className="query-list">
            {triggers.map(trigger => {
              const managed = trigger.managed === 'cli';
              return (
                <li key={trigger.id} className="query-item">
                  <div className="query-item-header">
                    <code className="query-item-name">{trigger.name}</code>
                    {managed && (
                      <span
                        className="query-badge"
                        title={t('triggerManagedHelp')}
                      >
                        <TerminalOutlined />
                        {t('triggerManagedBadge')}
                      </span>
                    )}
                    {!trigger.enabled && (
                      <span className="query-badge">{t('triggerOff')}</span>
                    )}
                    <div className="query-item-actions">
                      <Switch
                        size="small"
                        checked={trigger.enabled}
                        disabled={readOnly || toggling !== null}
                        slotProps={{
                          input: { 'aria-label': t('triggerToggle') }
                        }}
                        onChange={(_, checked) =>
                          handleToggle(trigger, checked)
                        }
                      />
                      <IconButton
                        size="small"
                        title={t('triggerRuns')}
                        aria-label={t('triggerRuns')}
                        onClick={() => setRunsOf(trigger)}
                      >
                        <HistoryOutlined />
                      </IconButton>
                      {!managed && (
                        <>
                          <IconButton
                            size="small"
                            title={t('editTrigger')}
                            aria-label={t('editTrigger')}
                            disabled={readOnly}
                            onClick={() => setEditing(trigger)}
                          >
                            <EditOutlined />
                          </IconButton>
                          <IconButton
                            size="small"
                            title={t('deleteTrigger')}
                            aria-label={t('deleteTrigger')}
                            disabled={readOnly}
                            onClick={() => setDropping(trigger)}
                          >
                            <DeleteOutlined />
                          </IconButton>
                        </>
                      )}
                    </div>
                  </div>
                  {trigger.description && (
                    <p className="query-item-description">
                      {trigger.description}
                    </p>
                  )}
                  {trigger.disabledReason && (
                    <p className="trigger-disabled-reason">
                      {t('triggerDisabledReason', {
                        reason: disabledReason(trigger.disabledReason, t)
                      })}
                    </p>
                  )}
                  <dl className="query-item-meta">
                    <dt>{t('triggerWhen')}</dt>
                    <dd>
                      {t(`triggerOn_${trigger.on}`)}
                      {trigger.after &&
                        ` · ${describeSchedule(trigger.after, t)}`}
                    </dd>
                    <dt>{t('triggerCondition')}</dt>
                    <dd>
                      {trigger.when ? (
                        <code>{describeCondition(trigger.when, t)}</code>
                      ) : (
                        t('triggerConditionAlways')
                      )}
                    </dd>
                    <dt>{t('triggerAction')}</dt>
                    <dd>
                      {t(`triggerAction_${trigger.action.type}`)}:{' '}
                      {actionSummary(trigger.action)}
                    </dd>
                    <dt>{t('triggerRateLimit')}</dt>
                    <dd>{t.n(trigger.rateLimit)}</dd>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <TriggerDialog
        open={editing !== null}
        base={base}
        table={table}
        trigger={editing === 'new' ? null : editing}
        functions={targets.functions}
        channels={targets.channels}
        templates={targets.templates}
        onClose={() => setEditing(null)}
        onSaved={newSecret => {
          setEditing(null);
          if (newSecret) setSecret(newSecret);
          load();
        }}
      />
      {runsOf && (
        <RunsDialog
          base={base}
          trigger={runsOf}
          readOnly={readOnly}
          onClose={() => setRunsOf(null)}
        />
      )}
      <UI.Modal
        open={!!secret}
        title={t('webhookSecretTitle')}
        closeLabel={c('close')}
        width={560}
        closeOnBackdrop={false}
        onClose={() => setSecret(null)}
        footer={
          <FooterActions>
            <UI.Button
              variant="contained"
              size="small"
              onClick={() => setSecret(null)}
            >
              {c('close')}
            </UI.Button>
          </FooterActions>
        }
      >
        <DialogContent>
          <p>{t('webhookSecretText')}</p>
          <UI.CopyableBlock
            label={t('webhookSecretLabel')}
            text={secret ?? ''}
            onCopy={() => snackbar.success(t('webhookSecretCopied'))}
          />
        </DialogContent>
      </UI.Modal>
      <UI.Alert
        open={!!dropping}
        title={t('deleteTriggerTitle', { name: dropping?.name ?? '' })}
        description={t('deleteTriggerText')}
        confirmText={t('deleteTrigger')}
        cancelText={c('cancel')}
        loadingText={c('deleting')}
        loading={deleting}
        onConfirm={handleDrop}
        onCancel={() => setDropping(null)}
      />
    </div>
  );
};

type DataT = Translate<(typeof i18n.copy.DATA)['en']>;

// "30 minutes after created_at".
const describeSchedule = (
  after: { column: string; minutes: number },
  t: DataT
) => {
  const { amount, unit, before } = splitMinutes(after.minutes);
  return t(before ? 'schedule_before' : 'schedule_after', {
    amount: t.n(amount),
    unit: t(`triggerUnit_${unit}`),
    column: after.column
  });
};

// Why Ganju turned a trigger off, in the reader's words when it is one of
// the reasons Ganju writes; anything else as it was written.
const disabledReason = (reason: string, t: DataT) => {
  const failures =
    /^Turned off by Ganju after (\d+) failed runs in a row\.$/.exec(reason);
  if (failures) return t('triggerReason_failures', { n: failures[1] });
  const cap = /^This database's time triggers fired ([\d,]+) events today/.exec(
    reason
  );
  if (cap) return t('triggerReason_dailyCap', { n: cap[1] });
  const column = /^(\S+) is no longer a date or datetime column\.$/.exec(
    reason
  );
  if (column) return t('triggerReason_column', { column: column[1] });
  if (reason === "The organization's plan no longer includes Data.")
    return t('triggerReason_noData');
  if (reason === "This month's trigger runs reached the plan's limit.")
    return t('triggerReason_monthCap');
  return reason;
};

// "status changes to READY" for a one-column test; JSON for anything else.
const describeCondition = (when: DataTriggerCondition, t: DataT) => {
  const simple = simpleCondition(when);
  if (!simple) return JSON.stringify(when);
  const value = JSON.stringify(simple.raw);
  return t(`condition_${simple.test}`, { column: simple.column, value });
};

interface SimpleCondition {
  column: string;
  test: TestKey;
  raw: unknown;
}

// A condition the form's one row can show, or null when it needs the JSON.
const simpleCondition = (
  when: DataTriggerCondition | null
): SimpleCondition | null => {
  if (!when) return null;
  const columns = Object.keys(when);
  if (columns.length !== 1 || columns[0] === 'all' || columns[0] === 'any') {
    return null;
  }
  const test = (when as Record<string, Record<string, unknown>>)[columns[0]];
  const keys = test && typeof test === 'object' ? Object.keys(test) : [];
  if (keys.length !== 1 || !TESTS.includes(keys[0] as TestKey)) return null;
  return { column: columns[0], test: keys[0] as TestKey, raw: test[keys[0]] };
};

// A typed value from the form's text, as the condition compares it.
const conditionValue = (type: DataColumnType | 'id', text: string) => {
  if (text === '') return null;
  if (type === 'boolean') return text === 'true';
  if (
    type === 'id' ||
    type === 'integer' ||
    type === 'decimal' ||
    type === 'relation'
  ) {
    const number = Number(text);
    return Number.isNaN(number) ? text : number;
  }
  return text;
};

interface TriggerDialogProps {
  open: boolean;
  base: string;
  table: DataTable;
  trigger: DataTrigger | null;
  functions: ProjectFunction[] | null;
  channels: ProjectChannel[];
  templates: ProjectTemplate[];
  onClose: () => void;
  onSaved: (secret: string | null) => void;
}

const TriggerDialog = ({
  open,
  base,
  table,
  trigger,
  functions,
  channels,
  templates,
  onClose,
  onSaved
}: TriggerDialogProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [on, setOn] = useState<DataTriggerEvent>('insert');
  const [afterColumn, setAfterColumn] = useState('created_at');
  const [afterAmount, setAfterAmount] = useState('30');
  const [afterUnit, setAfterUnit] = useState<TimeUnit>('minutes');
  const [afterBefore, setAfterBefore] = useState(false);
  const [column, setColumn] = useState('');
  const [test, setTest] = useState<TestKey>('changedTo');
  const [value, setValue] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [json, setJson] = useState('');
  const [actionType, setActionType] =
    useState<DataTriggerActionType>('function');
  const [fn, setFn] = useState('');
  const [webhook, setWebhook] = useState('');
  const [channelId, setChannelId] = useState('');
  const [chatId, setChatId] = useState('');
  const [text, setText] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [subject, setSubject] = useState('');
  const [useTemplate, setUseTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateLanguage, setTemplateLanguage] = useState('');
  const [templateParams, setTemplateParams] = useState<string[]>([]);
  const [rateLimit, setRateLimit] = useState(String(DATA_TRIGGER_DEFAULT_RATE));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!open) return;
    const action = trigger?.action;
    const simple = simpleCondition(trigger?.when ?? null);
    const complex = !!trigger?.when && !simple;
    setName(trigger?.name ?? '');
    setDescription(trigger?.description ?? '');
    setOn(trigger?.on ?? 'insert');
    const split = trigger?.after ? splitMinutes(trigger.after.minutes) : null;
    setAfterColumn(trigger?.after?.column ?? 'created_at');
    setAfterAmount(String(split?.amount ?? 30));
    setAfterUnit(split?.unit ?? 'minutes');
    setAfterBefore(split?.before ?? false);
    setColumn(simple?.column ?? '');
    setTest(simple?.test ?? 'changedTo');
    setValue(
      simple && simple.raw !== null && simple.test !== 'changed'
        ? String(simple.raw)
        : ''
    );
    setAdvanced(complex);
    setJson(trigger?.when ? JSON.stringify(trigger.when, null, 2) : '');
    setActionType(action?.type ?? 'function');
    setFn(action?.type === 'function' ? action.function : '');
    setWebhook(action?.type === 'webhook' ? action.url : '');
    setChannelId(action?.type === 'chat' ? action.channelId : '');
    setChatId(action?.type === 'chat' ? action.chatId : '');
    setText(
      action?.type === 'chat' ||
        action?.type === 'email' ||
        action?.type === 'customer'
        ? action.text
        : ''
    );
    setEmailTo(action?.type === 'email' ? action.to.join(', ') : '');
    setSubject(action?.type === 'email' ? action.subject : '');
    const template = action?.type === 'customer' ? action.template : undefined;
    setUseTemplate(!!template);
    setTemplateName(template?.name ?? '');
    setTemplateLanguage(template?.language ?? '');
    setTemplateParams(template?.params ?? []);
    setRateLimit(String(trigger?.rateLimit ?? DATA_TRIGGER_DEFAULT_RATE));
    setError(null);
  }, [open, trigger]);

  // The dialog scrolls; a save error lands under the fields, out of view.
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [error]);

  const columns: {
    name: string;
    type: DataColumnType | 'id';
    values: string[];
  }[] = [
    { name: 'id', type: 'id', values: [] },
    ...table.columns.map(col => ({
      name: col.name,
      type: col.type,
      values: col.values ?? []
    }))
  ];
  const picked = columns.find(col => col.name === column);
  const timed = on === 'time';
  // The columns a time trigger can count from; only a date or datetime can
  // be counted back from.
  const timeColumns = [
    ...SYSTEM_TIMES,
    ...table.columns
      .filter(col => col.type === 'date' || col.type === 'datetime')
      .map(col => col.name)
  ];
  const canBefore = !SYSTEM_TIMES.includes(afterColumn);
  const tests = timed ? (['equals'] as TestKey[]) : TESTS;
  const pickEvent = (next: DataTriggerEvent) => {
    setOn(next);
    if (next === 'time' && test !== 'equals') setTest('equals');
  };
  const pickAfterColumn = (next: string) => {
    setAfterColumn(next);
    if (SYSTEM_TIMES.includes(next)) setAfterBefore(false);
  };

  const actions = ACTIONS.filter(
    type =>
      type !== 'customer' ||
      table.customerScoped ||
      trigger?.action.type === 'customer'
  );

  // Kept in the list when it isn't in the live script any more.
  const functionOptions = [
    ...(functions ?? []).map(f => ({
      label:
        f.expose === false
          ? t('triggerFunctionTriggersOnly', { name: f.name })
          : f.name,
      value: f.name
    })),
    ...(fn && functions && !functions.some(f => f.name === fn)
      ? [{ label: t('triggerFunctionMissing', { name: fn }), value: fn }]
      : [])
  ];
  const channelOptions = [
    ...channels.map(ch => ({ label: ch.label, value: ch.id })),
    ...(channelId && !channels.some(ch => ch.id === channelId)
      ? [{ label: channelId, value: channelId }]
      : [])
  ];

  const pickedTemplate = templates.find(
    tpl => tpl.name === templateName && tpl.language === templateLanguage
  );
  const templateOptions = [
    ...templates.map(tpl => ({
      label: `${tpl.name} · ${tpl.language}`,
      value: templateKey(tpl.name, tpl.language)
    })),
    ...(templateName && !pickedTemplate
      ? [
          {
            label: t('triggerTemplateMissing', {
              name: `${templateName} · ${templateLanguage}`
            }),
            value: templateKey(templateName, templateLanguage)
          }
        ]
      : [])
  ];
  const pickTemplate = (key: string) => {
    const next = templates.find(
      tpl => templateKey(tpl.name, tpl.language) === key
    );
    if (!next) return;
    setTemplateName(next.name);
    setTemplateLanguage(next.language);
    setTemplateParams(prev =>
      Array.from({ length: next.variableCount }, (_, i) => prev[i] ?? '')
    );
  };
  const setTemplateParam = (index: number, value: string) =>
    setTemplateParams(prev =>
      Array.from({ length: Math.max(prev.length, index + 1) }, (_, i) =>
        i === index ? value : (prev[i] ?? '')
      )
    );
  // Each variable as a column of the row, or fixed text.
  const FIXED = '\u0000fixed';
  const paramSource = (param: string) => {
    const field = FIELD_PARAM.exec(param.trim())?.[1];
    return field && columns.some(col => col.name === field) ? field : FIXED;
  };

  const pickColumn = (next: string) => {
    setColumn(next);
    const col = columns.find(col => col.name === next);
    setValue(
      col?.type === 'boolean'
        ? 'true'
        : col?.type === 'enum'
          ? (col.values[0] ?? '')
          : ''
    );
  };

  const toggleAdvanced = (checked: boolean) => {
    if (checked) {
      const when = simpleWhen();
      setJson(when ? JSON.stringify(when, null, 2) : '');
    } else {
      const parsed = (() => {
        try {
          return json.trim() ? JSON.parse(json) : null;
        } catch {
          return undefined;
        }
      })();
      const simple = parsed ? simpleCondition(parsed) : null;
      if (parsed === null) setColumn('');
      if (simple) {
        setColumn(simple.column);
        setTest(simple.test);
        setValue(
          simple.raw !== null && simple.test !== 'changed'
            ? String(simple.raw)
            : ''
        );
      }
    }
    setAdvanced(checked);
  };

  const simpleWhen = (): DataTriggerCondition | null => {
    if (!column || !picked) return null;
    return {
      [column]: {
        [test]: test === 'changed' ? true : conditionValue(picked.type, value)
      }
    } as DataTriggerCondition;
  };

  const actionBody = (): Record<string, unknown> => {
    switch (actionType) {
      case 'function':
        return { function: fn.trim() };
      case 'webhook':
        return { webhook: webhook.trim() };
      case 'chat':
        return { chat: { channelId, chatId: chatId.trim(), text } };
      case 'email':
        return {
          email: {
            to: emailTo
              .split(',')
              .map(address => address.trim())
              .filter(Boolean),
            ...(subject.trim() ? { subject: subject.trim() } : {}),
            text
          }
        };
      case 'customer': {
        const params = templateParams.map(param => param.trim());
        return {
          customer: {
            text,
            ...(useTemplate
              ? {
                  template: {
                    name: templateName.trim(),
                    language: templateLanguage.trim(),
                    ...(params.length ? { params } : {})
                  }
                }
              : {})
          }
        };
      }
    }
  };

  const actionReady = (() => {
    switch (actionType) {
      case 'function':
        return !!fn.trim();
      case 'webhook':
        return !!webhook.trim();
      case 'chat':
        return !!channelId && !!chatId.trim() && !!text.trim();
      case 'email':
        return !!emailTo.trim() && !!text.trim();
      case 'customer':
        return (
          !!text.trim() &&
          (!useTemplate ||
            (!!templateName.trim() &&
              !!templateLanguage.trim() &&
              (!pickedTemplate ||
                (templateParams.length === pickedTemplate.variableCount &&
                  templateParams.every(param => !!param.trim())))))
        );
    }
  })();

  const handleSave = async () => {
    if (saving) return;
    setError(null);
    const trimmedName = name.trim();
    if (!trigger && trimmedName && !NAME_PATTERN.test(trimmedName)) {
      setError(t('triggerNameInvalid'));
      return;
    }
    const rate = Number(rateLimit);
    if (!Number.isInteger(rate) || rate < 1 || rate > DATA_TRIGGER_MAX_RATE) {
      setError(t('triggerRateLimitInvalid', { max: DATA_TRIGGER_MAX_RATE }));
      return;
    }
    const minutes =
      Number(afterAmount) * UNIT_MINUTES[afterUnit] * (afterBefore ? -1 : 1);
    if (
      timed &&
      (!Number.isInteger(minutes) ||
        Math.abs(minutes) < DATA_TIME_MIN_MINUTES ||
        Math.abs(minutes) > DATA_TIME_MAX_MINUTES)
    ) {
      setError(t('triggerAfterInvalid', { min: DATA_TIME_MIN_MINUTES }));
      return;
    }
    let when: unknown = null;
    if (advanced) {
      if (json.trim()) {
        try {
          when = JSON.parse(json);
        } catch {
          setError(t('triggerAdvancedInvalid'));
          return;
        }
        if (!when || typeof when !== 'object' || Array.isArray(when)) {
          setError(t('triggerAdvancedNotObject'));
          return;
        }
      }
    } else {
      when = simpleWhen();
    }
    setSaving(true);
    const result = await dataRequest<{
      trigger: DataTrigger;
      secret?: string;
      confirming?: string[];
    }>(base, '/trigger', {
      method: 'POST',
      body: {
        ...(trigger
          ? { name: trigger.name }
          : trimmedName
            ? { name: trimmedName }
            : {}),
        description: description.trim() || null,
        table: table.name,
        on,
        ...(timed ? { after: { column: afterColumn, minutes } } : {}),
        when,
        // Saving replaces the trigger: keep it on or off as it was. A new
        // one never replaces another of the same name.
        ...(trigger ? { enabled: trigger.enabled } : { replace: false }),
        rateLimit: rate,
        ...actionBody()
      }
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error || t('toastTriggerSaveFailed'));
      return;
    }
    const confirming = result.data.confirming ?? [];
    snackbar.success(
      confirming.length > 0
        ? t('toastTriggerSavedConfirming', { emails: confirming.join(', ') })
        : t('toastTriggerSaved')
    );
    onSaved(result.data.secret ?? null);
  };

  return (
    <UI.Modal
      open={open}
      title={
        trigger
          ? t('editTriggerTitle', { name: trigger.name })
          : t('newTriggerTitle', { table: table.name })
      }
      closeLabel={c('close')}
      width={720}
      onClose={() => !saving && onClose()}
      footer={
        <FooterActions>
          <UI.Button size="small" disabled={saving} onClick={onClose}>
            {c('cancel')}
          </UI.Button>
          <UI.Button
            variant="contained"
            size="small"
            disabled={saving || !actionReady}
            onClick={handleSave}
          >
            {saving ? c('saving') : c('save')}
          </UI.Button>
        </FooterActions>
      }
    >
      <DialogContent>
        <div className="dialog-row">
          <UI.Input
            size="small"
            label={t('triggerName')}
            placeholder="order_ready"
            value={name}
            disabled={saving || !!trigger}
            helperText={trigger ? t('triggerNameFixed') : t('triggerNameHelp')}
            onChange={e => setName(e.target.value)}
          />
          <UI.Input
            size="small"
            label={t('triggerDescription')}
            value={description}
            disabled={saving}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        <UI.Select
          size="small"
          label={t('triggerWhen')}
          value={on}
          disabled={saving}
          onChange={e => pickEvent(e.target.value as DataTriggerEvent)}
          options={EVENTS.map(event => ({
            label: t(`triggerOn_${event}`),
            value: event
          }))}
        />

        {timed && (
          <>
            <h4 className="dialog-subtitle">{t('triggerAfterTitle')}</h4>
            <div className="query-param-row">
              <UI.Input
                size="small"
                type="number"
                label={t('triggerAfterAmount')}
                value={afterAmount}
                disabled={saving}
                onChange={e => setAfterAmount(e.target.value)}
              />
              <UI.Select
                size="small"
                label={t('triggerAfterUnit')}
                value={afterUnit}
                disabled={saving}
                onChange={e => setAfterUnit(e.target.value as TimeUnit)}
                options={UNITS.map(unit => ({
                  label: t(`triggerUnit_${unit}`),
                  value: unit
                }))}
              />
              <UI.Select
                size="small"
                label={t('triggerAfterDirection')}
                value={afterBefore ? 'before' : 'after'}
                disabled={saving || !canBefore}
                onChange={e => setAfterBefore(e.target.value === 'before')}
                options={(['after', 'before'] as const).map(direction => ({
                  label: t(`triggerDirection_${direction}`),
                  value: direction
                }))}
              />
              <UI.Select
                size="small"
                label={t('triggerAfterColumn')}
                value={afterColumn}
                disabled={saving}
                onChange={e => pickAfterColumn(String(e.target.value))}
                options={timeColumns.map(name => ({
                  label:
                    name === 'created_at' || name === 'updated_at'
                      ? t(`triggerAfterColumn_${name}`)
                      : name,
                  value: name
                }))}
              />
            </div>
            <p className="dialog-muted">{t('triggerAfterHelp')}</p>
          </>
        )}

        <h4 className="dialog-subtitle">{t('triggerCondition')}</h4>
        {timed && (
          <p className="dialog-muted">{t('triggerTimeConditionHelp')}</p>
        )}
        {advanced ? (
          <UI.Input
            size="small"
            className="query-sql"
            label="JSON"
            multiline
            minRows={5}
            placeholder={
              '{\n  "any": [\n    { "status": { "changedTo": "READY" } },\n    { "total": { "equals": 0 } }\n  ]\n}'
            }
            value={json}
            disabled={saving}
            helperText={t('triggerAdvancedHelp')}
            onChange={e => setJson(e.target.value)}
          />
        ) : (
          <div className="query-param-row">
            <UI.Select
              size="small"
              label={t('triggerConditionColumn')}
              value={column || '-'}
              disabled={saving}
              onChange={e =>
                pickColumn(e.target.value === '-' ? '' : e.target.value)
              }
              options={[
                { label: t('triggerConditionNone'), value: '-' },
                ...columns.map(col => ({ label: col.name, value: col.name }))
              ]}
            />
            {column && (
              <UI.Select
                size="small"
                label={t('triggerConditionTest')}
                value={test}
                disabled={saving}
                onChange={e => setTest(e.target.value as TestKey)}
                options={tests.map(key => ({
                  label: t(`triggerTest_${key}`),
                  value: key
                }))}
              />
            )}
            {column &&
              test !== 'changed' &&
              (picked?.type === 'boolean' ||
              (picked?.type === 'enum' && picked.values.length > 0) ? (
                <UI.Select
                  size="small"
                  label={t('triggerConditionValue')}
                  value={value}
                  disabled={saving}
                  onChange={e => setValue(String(e.target.value))}
                  options={(picked.type === 'boolean'
                    ? ['true', 'false']
                    : picked.values
                  ).map(option => ({ label: option, value: option }))}
                />
              ) : (
                <UI.Input
                  size="small"
                  label={t('triggerConditionValue')}
                  value={value}
                  disabled={saving}
                  helperText={t('triggerConditionValueHelp')}
                  onChange={e => setValue(e.target.value)}
                />
              ))}
          </div>
        )}
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={advanced}
              disabled={saving}
              onChange={e => toggleAdvanced(e.target.checked)}
            />
          }
          label={t('triggerAdvanced')}
        />

        <h4 className="dialog-subtitle">{t('triggerAction')}</h4>
        <UI.Select
          size="small"
          label={t('triggerAction')}
          value={actionType}
          disabled={saving}
          onChange={e => setActionType(e.target.value as DataTriggerActionType)}
          options={actions.map(type => ({
            label: t(`triggerAction_${type}`),
            value: type
          }))}
        />

        {actionType === 'function' &&
          (functions && functions.length > 0 ? (
            <UI.Select
              size="small"
              label={t('triggerFunction')}
              value={fn}
              disabled={saving}
              helperText={t('triggerFunctionHelp')}
              onChange={e => setFn(String(e.target.value))}
              options={functionOptions}
            />
          ) : (
            <UI.Input
              size="small"
              label={t('triggerFunction')}
              placeholder="notify-kitchen"
              value={fn}
              disabled={saving}
              helperText={t('triggerFunctionFreeHelp')}
              onChange={e => setFn(e.target.value)}
            />
          ))}

        {actionType === 'webhook' && (
          <UI.Input
            size="small"
            label={t('triggerWebhook')}
            placeholder="https://example.com/hooks/orders"
            type="url"
            value={webhook}
            disabled={saving}
            helperText={t('triggerWebhookHelp')}
            onChange={e => setWebhook(e.target.value)}
          />
        )}

        {actionType === 'chat' && (
          <>
            {channelOptions.length === 0 ? (
              <p className="dialog-warning">{t('triggerChannelNone')}</p>
            ) : (
              <div className="dialog-row">
                <UI.Select
                  size="small"
                  label={t('triggerChannel')}
                  value={channelId}
                  disabled={saving}
                  onChange={e => setChannelId(String(e.target.value))}
                  options={channelOptions}
                />
                <UI.Input
                  size="small"
                  label={t('triggerChatId')}
                  placeholder="-1001234567890"
                  value={chatId}
                  disabled={saving}
                  helperText={t('triggerChatIdHelp')}
                  onChange={e => setChatId(e.target.value)}
                />
              </div>
            )}
          </>
        )}

        {actionType === 'email' && (
          <>
            <UI.Input
              size="small"
              label={t('triggerEmailTo')}
              placeholder="kitchen@example.com, owner@example.com"
              value={emailTo}
              disabled={saving}
              helperText={t('triggerEmailToHelp')}
              onChange={e => setEmailTo(e.target.value)}
            />
            <UI.Input
              size="small"
              label={t('triggerEmailSubject')}
              value={subject}
              disabled={saving}
              onChange={e => setSubject(e.target.value)}
            />
          </>
        )}

        {actionType === 'customer' && (
          <p className="dialog-muted">{t('triggerCustomerHelp')}</p>
        )}

        {(actionType === 'chat' ||
          actionType === 'email' ||
          actionType === 'customer') && (
          <UI.Input
            size="small"
            label={t('triggerText')}
            multiline
            minRows={3}
            value={text}
            disabled={saving}
            helperText={t('triggerTextHelp')}
            onChange={e => setText(e.target.value)}
          />
        )}

        {actionType === 'customer' && (
          <>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={useTemplate}
                  disabled={saving}
                  onChange={e => setUseTemplate(e.target.checked)}
                />
              }
              label={
                <span className="query-assistant-label">
                  {t('triggerTemplate')}
                  <small>{t('triggerTemplateHelp')}</small>
                </span>
              }
            />
            {useTemplate && (
              <>
                <UI.Select
                  size="small"
                  label={t('triggerTemplateName')}
                  value={
                    templateName
                      ? templateKey(templateName, templateLanguage)
                      : ''
                  }
                  disabled={saving || templateOptions.length === 0}
                  helperText={
                    templateOptions.length === 0
                      ? t('triggerTemplateNone')
                      : t('triggerTemplatePickHelp')
                  }
                  options={templateOptions}
                  onChange={e => pickTemplate(String(e.target.value))}
                />
                {pickedTemplate && (
                  <>
                    <p className="dialog-muted">{pickedTemplate.body}</p>
                    {Array.from(
                      { length: pickedTemplate.variableCount },
                      (_, i) => {
                        const param = templateParams[i] ?? '';
                        const source = paramSource(param);
                        const label = pickedTemplate.labels[i];
                        return (
                          <div key={i} className="dialog-row">
                            <UI.Select
                              size="small"
                              label={`{{${i + 1}}}${label ? ` · ${label}` : ''}`}
                              value={source}
                              disabled={saving}
                              options={[
                                ...columns.map(col => ({
                                  label: t('triggerTemplateFromColumn', {
                                    column: col.name
                                  }),
                                  value: col.name
                                })),
                                {
                                  label: t('triggerTemplateFixed'),
                                  value: FIXED
                                }
                              ]}
                              onChange={e => {
                                const next = String(e.target.value);
                                setTemplateParam(
                                  i,
                                  next === FIXED ? '' : `{{${next}}}`
                                );
                              }}
                            />
                            {source === FIXED && (
                              <UI.Input
                                size="small"
                                label={t('triggerTemplateFixedValue')}
                                value={param}
                                disabled={saving}
                                onChange={e =>
                                  setTemplateParam(i, e.target.value)
                                }
                              />
                            )}
                          </div>
                        );
                      }
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}

        {actionType === 'customer' && (
          <CustomerTestSend
            open={open}
            base={base}
            table={table}
            customer={actionBody().customer}
            ready={actionReady}
            hasTemplate={useTemplate && !!templateName.trim()}
            templateBody={pickedTemplate?.body ?? null}
            disabled={saving}
          />
        )}

        <UI.Input
          size="small"
          label={t('triggerRateLimit')}
          type="number"
          value={rateLimit}
          disabled={saving}
          helperText={t('triggerRateLimitHelp', {
            default: DATA_TRIGGER_DEFAULT_RATE,
            max: DATA_TRIGGER_MAX_RATE
          })}
          slotProps={{ htmlInput: { min: 1, max: DATA_TRIGGER_MAX_RATE } }}
          onChange={e => setRateLimit(e.target.value)}
        />
        {error && (
          <p ref={errorRef} className="dialog-danger" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
    </UI.Modal>
  );
};

interface TestRecipient {
  participantId: string;
  channelId: string;
  platform: string;
  name: string | null;
  bot: string | null;
}

interface TestSent {
  sent: 'text' | 'template';
  text: string | null;
  template: { name: string; language: string; params: string[] } | null;
  rowId: number;
  recipient: TestRecipient;
}

const PLATFORM_NAMES: Record<string, string> = {
  whatsapp: 'WhatsApp',
  ...CHAT_PLATFORMS
};

const recipientLabel = (recipient: TestRecipient) =>
  [
    PLATFORM_NAMES[recipient.platform] ?? recipient.platform,
    recipient.bot,
    recipient.name
  ]
    .filter(Boolean)
    .join(' · ');

// A row in the picker: its id and display column, or its first text.
const rowLabel = (table: DataTable, row: Record<string, unknown>) => {
  const column =
    table.displayColumn ?? table.columns.find(col => col.type === 'text')?.name;
  const value = column ? row[column] : null;
  const shown =
    value && typeof value === 'object' && 'label' in value
      ? String((value as { label: unknown }).label ?? '')
      : value === null || value === undefined || typeof value === 'object'
        ? ''
        : String(value);
  return shown ? `#${row.id} · ${shown.slice(0, 60)}` : `#${row.id}`;
};

const NEWEST = '-';

interface CustomerTestSendProps {
  open: boolean;
  base: string;
  table: DataTable;
  customer: unknown;
  ready: boolean;
  hasTemplate: boolean;
  templateBody: string | null;
  disabled: boolean;
}

// Sends the customer message as the dialog has it to the owner's own chat
// with the bot, built from a row of the table.
const CustomerTestSend = ({
  open,
  base,
  table,
  customer,
  ready,
  hasTemplate,
  templateBody,
  disabled
}: CustomerTestSendProps) => {
  const t = i18n.useT(i18n.copy.DATA);
  const [recipients, setRecipients] = useState<TestRecipient[] | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [rowId, setRowId] = useState(NEWEST);
  const [participantId, setParticipantId] = useState('');
  // Checking the template is what the test is for, so it starts on.
  const [asTemplate, setAsTemplate] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<TestSent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRowId(NEWEST);
    setAsTemplate(true);
    setSent(null);
    setError(null);
    setRecipients(null);
    setRows([]);
    // A close or reopen cancels these, so a late answer can't land on a
    // newer dialog.
    const controller = new AbortController();
    const { signal } = controller;
    const ignoreAbort = (error: unknown) => {
      if ((error as Error)?.name !== 'AbortError') throw error;
    };
    dataRequest<{ recipients: TestRecipient[] }>(base, '/trigger/test-send', {
      signal
    })
      .then(result => {
        const list = result.ok ? (result.data.recipients ?? []) : [];
        if (!result.ok) setError(result.error || t('triggerTestFailed'));
        setRecipients(list);
        setParticipantId(list[0]?.participantId ?? '');
      })
      .catch(ignoreAbort);
    dataRequest<{ rows: Record<string, unknown>[] }>(
      base,
      `/table/${encodeURIComponent(table.name)}/row`,
      { query: { sort: '-id', limit: 20 }, signal }
    )
      .then(result => setRows(result.ok ? (result.data.rows ?? []) : []))
      .catch(ignoreAbort);
    return () => controller.abort();
  }, [open, base, table.name]);

  // Templates are WhatsApp's: the switch shows only for a WhatsApp chat.
  const recipient =
    recipients?.find(r => r.participantId === participantId) ?? recipients?.[0];
  const templateChoice = hasTemplate && recipient?.platform === 'whatsapp';

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    setSent(null);
    setError(null);
    const result = await dataRequest<TestSent>(base, '/trigger/test-send', {
      method: 'POST',
      body: {
        table: table.name,
        customer,
        ...(rowId !== NEWEST ? { rowId: Number(rowId) } : {}),
        ...(participantId ? { participantId } : {}),
        ...(templateChoice ? { asTemplate } : {})
      }
    });
    setSending(false);
    if (!result.ok) {
      setError(
        result.code === 'rate_limited'
          ? t('triggerTestRateLimited')
          : result.error || t('triggerTestFailed')
      );
      return;
    }
    setSent(result.data);
  };

  const sentTemplate = sent?.template;
  const sentContent = sentTemplate
    ? templateBody
      ? templateBody.replace(
          /\{\{\s*(\d+)\s*\}\}/g,
          (match, n: string) => sentTemplate.params[Number(n) - 1] ?? match
        )
      : sentTemplate.params.length > 0
        ? sentTemplate.params.map((p, i) => `{{${i + 1}}} = ${p}`).join('\n')
        : t('triggerTestNoValues')
    : (sent?.text ?? '');

  return (
    <div className="trigger-test">
      <h4 className="dialog-subtitle">{t('triggerTestTitle')}</h4>
      <p className="dialog-muted">
        {t('triggerTestHelp', { table: table.label || table.name })}
      </p>
      {recipients === null ? (
        <UI.Skeleton variant="rounded" height={40} width="100%" />
      ) : recipients.length === 0 ? (
        !error && <p className="dialog-warning">{t('triggerTestNoLink')}</p>
      ) : (
        <>
          <div className="dialog-row">
            <UI.Select
              size="small"
              label={t('triggerTestRow')}
              value={rowId}
              disabled={disabled || sending}
              onChange={e => setRowId(String(e.target.value))}
              options={[
                { label: t('triggerTestRowNewest'), value: NEWEST },
                ...rows.map(row => ({
                  label: rowLabel(table, row),
                  value: String(row.id)
                }))
              ]}
            />
            {recipients.length > 1 && (
              <UI.Select
                size="small"
                label={t('triggerTestRecipient')}
                value={participantId}
                disabled={disabled || sending}
                onChange={e => setParticipantId(String(e.target.value))}
                options={recipients.map(recipient => ({
                  label: recipientLabel(recipient),
                  value: recipient.participantId
                }))}
              />
            )}
          </div>
          {templateChoice && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={asTemplate}
                  disabled={disabled || sending}
                  onChange={e => setAsTemplate(e.target.checked)}
                />
              }
              label={
                <span className="query-assistant-label">
                  {t('triggerTestAsTemplate')}
                  <small>{t('triggerTestAsTemplateHelp')}</small>
                </span>
              }
            />
          )}
          <UI.Button
            variant="outlined"
            size="small"
            disabled={disabled || sending || !ready}
            onClick={handleSend}
          >
            <SendOutlined />
            <span className="button-text">
              {sending ? t('triggerTestSending') : t('triggerTestSend')}
            </span>
          </UI.Button>
        </>
      )}
      {sent && (
        <>
          <p role="status">
            {sentTemplate
              ? t('triggerTestSentTemplate', {
                  who: recipientLabel(sent.recipient),
                  name: sentTemplate.name,
                  language: sentTemplate.language,
                  row: sent.rowId
                })
              : t('triggerTestSentText', {
                  who: recipientLabel(sent.recipient),
                  row: sent.rowId
                })}
          </p>
          <p className="trigger-test-sent dialog-muted">{sentContent}</p>
        </>
      )}
      {error && (
        <p className="dialog-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

interface RunsDialogProps {
  base: string;
  trigger: DataTrigger;
  readOnly: boolean;
  onClose: () => void;
}

const RunsDialog = ({ base, trigger, readOnly, onClose }: RunsDialogProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const [runs, setRuns] = useState<DataTriggerRun[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = async () => {
    const result = await dataRequest<{ runs: DataTriggerRun[] }>(
      base,
      `/trigger/${encodeURIComponent(trigger.name)}/run`,
      { query: { limit: 50 } }
    );
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRuns(result.data.runs);
  };

  useEffect(() => {
    load();
  }, [base, trigger.name]);

  const handleRetry = async (run: DataTriggerRun) => {
    if (retrying) return;
    setRetrying(run.id);
    const result = await dataRequest<{ run: DataTriggerRun }>(
      base,
      `/trigger/${encodeURIComponent(trigger.name)}/run/${encodeURIComponent(run.id)}/retry`,
      { method: 'POST' }
    );
    setRetrying(null);
    if (!result.ok) {
      snackbar.error(result.error || t('toastRunRetryFailed'));
      return;
    }
    snackbar.success(t('toastRunRetried'));
    setRuns(prev =>
      prev ? prev.map(r => (r.id === run.id ? result.data.run : r)) : prev
    );
  };

  return (
    <UI.Modal
      open
      title={t('triggerRunsTitle', { name: trigger.name })}
      closeLabel={c('close')}
      width={720}
      onClose={onClose}
      footer={
        <FooterActions>
          <UI.Button size="small" onClick={load}>
            {t('triggerRunsRefresh')}
          </UI.Button>
          <UI.Button variant="contained" size="small" onClick={onClose}>
            {c('close')}
          </UI.Button>
        </FooterActions>
      }
    >
      <DialogContent>
        {failed && <p className="dialog-danger">{c('somethingWentWrong')}</p>}
        {!runs && !failed && <UI.Skeleton variant="rounded" height={120} />}
        {runs && runs.length === 0 && (
          <p className="dialog-muted">{t('triggerRunsEmpty')}</p>
        )}
        {runs && runs.length > 0 && (
          <ul className="trigger-runs">
            {runs.map(run => (
              <li key={run.id} className="trigger-run">
                <div className="trigger-run-header">
                  <span className={`trigger-run-status is-${run.status}`}>
                    {t(`triggerRunStatus_${run.status}`)}
                  </span>
                  <span className="trigger-run-meta">
                    {t.date(run.createdAt, {
                      dateStyle: 'medium',
                      timeStyle: 'medium'
                    })}
                    {' · '}
                    {t(`triggerRunRow_${run.event}`, { id: run.rowId ?? '' })}
                    {' · '}
                    {t.plural('triggerRunAttempts', run.attempts)}
                    {run.durationMs !== null &&
                      ` · ${t('triggerRunDuration', { ms: t.n(run.durationMs) })}`}
                  </span>
                  {(run.status === 'failed' || run.status === 'skipped') && (
                    <UI.Button
                      size="small"
                      className="trigger-run-retry"
                      disabled={readOnly || retrying !== null}
                      onClick={() => handleRetry(run)}
                    >
                      <ReplayOutlined />
                      <span className="button-text">
                        {retrying === run.id
                          ? t('triggerRunRetrying')
                          : t('triggerRunRetry')}
                      </span>
                    </UI.Button>
                  )}
                </div>
                {run.error && <p className="trigger-run-error">{run.error}</p>}
                <code className="trigger-run-event">{run.eventId}</code>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </UI.Modal>
  );
};
