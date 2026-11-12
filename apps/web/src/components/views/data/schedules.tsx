import { useEffect, useState } from 'react';
import { UI } from '@ganju/ui';
import {
  DATA_MAX_SCHEDULES,
  DATA_SCHEDULE_DAYS,
  DATA_SCHEDULE_PARAM_VALUES
} from '@ganju/utils/data';

import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Switch from '@mui/material/Switch';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import {
  Add,
  ArrowBack,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  TerminalOutlined
} from '@mui/icons-material';

import { DialogContent, FooterActions } from './styles';
import { dataRequest } from './api';
import { RunsDialog, disabledReason, useTargets } from './triggers';
import { i18n } from '../../../lib';

import type { DataQuery, DataTrigger } from './types';

type Every = 'day' | 'week';
type Action = 'email' | 'function' | 'webhook';
const ACTIONS: Action[] = ['email', 'function', 'webhook'];
const NAME_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;
// Monday first, the way a week reads.
const WEEK = [...DATA_SCHEDULE_DAYS.slice(1), DATA_SCHEDULE_DAYS[0]];

interface SchedulesViewProps {
  base: string;
  readOnly: boolean;
  timeZone: string | null;
  onBack: () => void;
}

/** Triggers on the clock: every day or on chosen weekdays, at a time. */
export const SchedulesView = ({
  base,
  readOnly,
  timeZone,
  onBack
}: SchedulesViewProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const [schedules, setSchedules] = useState<DataTrigger[] | null>(null);
  const [queries, setQueries] = useState<DataQuery[]>([]);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<DataTrigger | 'new' | null>(null);
  const [dropping, setDropping] = useState<DataTrigger | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [runsOf, setRunsOf] = useState<DataTrigger | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const targets = useTargets(base);

  const load = async () => {
    const [triggers, saved] = await Promise.all([
      dataRequest<{ triggers: DataTrigger[] }>(base, '/trigger'),
      dataRequest<{ queries: DataQuery[] }>(base, '/query')
    ]);
    if (!triggers.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setSchedules(triggers.data.triggers.filter(tr => tr.on === 'schedule'));
    if (saved.ok) setQueries(saved.data.queries);
  };

  useEffect(() => {
    load();
  }, [base]);

  const describeClock = (schedule: DataTrigger) =>
    schedule.every === 'week'
      ? t('scheduleEveryWeekAt', {
          days: (schedule.days ?? ['mon'])
            .map(day => t(`scheduleDay_${day as (typeof WEEK)[number]}`))
            .join(', '),
          at: schedule.at ?? ''
        })
      : t('scheduleEveryDayAt', { at: schedule.at ?? '' });

  const handleToggle = async (schedule: DataTrigger, enabled: boolean) => {
    if (toggling) return;
    setToggling(schedule.name);
    const result = await dataRequest<{ trigger: DataTrigger }>(
      base,
      `/trigger/${encodeURIComponent(schedule.name)}`,
      { method: 'PATCH', body: { enabled } }
    );
    setToggling(null);
    if (!result.ok) {
      snackbar.error(result.error || t('toastTriggerToggleFailed'));
      return;
    }
    setSchedules(prev =>
      prev
        ? prev.map(s => (s.name === schedule.name ? result.data.trigger : s))
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
    snackbar.success(t('toastScheduleDeleted'));
    load();
  };

  const full = (schedules?.length ?? 0) >= DATA_MAX_SCHEDULES;

  return (
    <>
      <div className="data-main-header">
        <IconButton
          className="data-back-btn"
          size="small"
          aria-label={c('close')}
          onClick={onBack}
        >
          <ArrowBack />
        </IconButton>
        <div className="data-main-title">
          <h2>{t('schedulesTitle')}</h2>
        </div>
        <UI.Button
          variant="contained"
          size="small"
          disabled={readOnly || full}
          onClick={() => setEditing('new')}
        >
          <Add />
          <span className="button-text">{t('newSchedule')}</span>
        </UI.Button>
      </div>
      <p className="data-main-description">
        {t('schedulesHelp', {
          zone: timeZone || 'UTC',
          max: t.n(DATA_MAX_SCHEDULES)
        })}
      </p>

      {failed && <p className="data-error">{c('somethingWentWrong')}</p>}
      {!schedules && !failed && <UI.Skeleton variant="rounded" height={120} />}
      {schedules && schedules.length === 0 && (
        <div className="data-main-placeholder">
          <p>{t('schedulesEmpty')}</p>
        </div>
      )}
      {schedules && schedules.length > 0 && (
        <ul className="query-list">
          {schedules.map(schedule => {
            const managed = schedule.managed === 'cli';
            const action = schedule.action;
            return (
              <li key={schedule.id} className="query-item">
                <div className="query-item-header">
                  <code className="query-item-name">{schedule.name}</code>
                  {managed && (
                    <span
                      className="query-badge"
                      title={t('triggerManagedHelp')}
                    >
                      <TerminalOutlined />
                      {t('triggerManagedBadge')}
                    </span>
                  )}
                  {!schedule.enabled && (
                    <span className="query-badge">{t('triggerOff')}</span>
                  )}
                  <div className="query-item-actions">
                    <Tooltip
                      title={t(
                        schedule.enabled ? 'triggerHint_on' : 'triggerHint_off'
                      )}
                    >
                      <span>
                        <Switch
                          size="small"
                          checked={schedule.enabled}
                          disabled={readOnly || toggling !== null}
                          slotProps={{
                            input: { 'aria-label': t('triggerToggle') }
                          }}
                          onChange={(_, checked) =>
                            handleToggle(schedule, checked)
                          }
                        />
                      </span>
                    </Tooltip>
                    <Tooltip title={t('triggerHint_runs')}>
                      <IconButton
                        size="small"
                        aria-label={t('triggerRuns')}
                        onClick={() => setRunsOf(schedule)}
                      >
                        <HistoryOutlined />
                      </IconButton>
                    </Tooltip>
                    {!managed && (
                      <>
                        <Tooltip title={t('triggerHint_edit')}>
                          <span>
                            <IconButton
                              size="small"
                              aria-label={t('editSchedule')}
                              disabled={readOnly}
                              onClick={() => setEditing(schedule)}
                            >
                              <EditOutlined />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={t('triggerHint_delete')}>
                          <span>
                            <IconButton
                              size="small"
                              aria-label={t('deleteSchedule')}
                              disabled={readOnly}
                              onClick={() => setDropping(schedule)}
                            >
                              <DeleteOutlined />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </>
                    )}
                  </div>
                </div>
                {schedule.description && (
                  <p className="query-item-description">
                    {schedule.description}
                  </p>
                )}
                {schedule.disabledReason && (
                  <p className="trigger-disabled-reason">
                    {t('triggerDisabledReason', {
                      reason: disabledReason(schedule.disabledReason, t)
                    })}
                  </p>
                )}
                <dl className="query-item-meta">
                  <dt>{t('triggerWhen')}</dt>
                  <dd>{describeClock(schedule)}</dd>
                  <dt>{t('scheduleQuery')}</dt>
                  <dd>
                    {schedule.query ? (
                      <code>{schedule.query}</code>
                    ) : (
                      t('scheduleNoQuery')
                    )}
                    {schedule.skipEmpty && ` · ${t('scheduleSkipEmptyShort')}`}
                  </dd>
                  <dt>{t('triggerAction')}</dt>
                  <dd>
                    {t(`triggerAction_${action.type}`)}:{' '}
                    {action.type === 'email'
                      ? action.to.join(', ')
                      : action.type === 'function'
                        ? action.function
                        : action.type === 'webhook'
                          ? action.url
                          : ''}
                  </dd>
                </dl>
              </li>
            );
          })}
        </ul>
      )}

      <ScheduleDialog
        open={editing !== null}
        base={base}
        schedule={editing === 'new' ? null : editing}
        queries={queries}
        functions={targets.functions}
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
        title={t('deleteScheduleTitle', { name: dropping?.name ?? '' })}
        description={t('deleteScheduleText')}
        confirmText={t('deleteSchedule')}
        cancelText={c('cancel')}
        loadingText={c('deleting')}
        loading={deleting}
        onConfirm={handleDrop}
        onCancel={() => setDropping(null)}
      />
    </>
  );
};

interface ScheduleDialogProps {
  open: boolean;
  base: string;
  schedule: DataTrigger | null;
  queries: DataQuery[];
  functions: { name: string }[] | null;
  onClose: () => void;
  onSaved: (secret?: string) => void;
}

const ScheduleDialog = ({
  open,
  base,
  schedule,
  queries,
  functions,
  onClose,
  onSaved
}: ScheduleDialogProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [every, setEvery] = useState<Every>('day');
  const [at, setAt] = useState('21:00');
  const [days, setDays] = useState<string[]>(['mon']);
  const [query, setQuery] = useState('');
  const [params, setParams] = useState<Record<string, string>>({});
  const [skipEmpty, setSkipEmpty] = useState(false);
  const [actionType, setActionType] = useState<Action>('email');
  const [emailTo, setEmailTo] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [fn, setFn] = useState('');
  const [webhook, setWebhook] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const action = schedule?.action;
    setName(schedule?.name ?? '');
    setDescription(schedule?.description ?? '');
    setEvery(schedule?.every ?? 'day');
    setAt(schedule?.at ?? '21:00');
    setDays(schedule?.days ?? ['mon']);
    setQuery(schedule?.query ?? '');
    setParams(
      Object.fromEntries(
        Object.entries(schedule?.params ?? {}).map(([k, v]) => [k, String(v)])
      )
    );
    setSkipEmpty(schedule?.skipEmpty ?? false);
    setActionType(
      action && (ACTIONS as string[]).includes(action.type)
        ? (action.type as Action)
        : 'email'
    );
    setEmailTo(action?.type === 'email' ? action.to.join(', ') : '');
    setSubject(action?.type === 'email' ? action.subject : '');
    setText(action?.type === 'email' ? action.text : '');
    setFn(action?.type === 'function' ? action.function : '');
    setWebhook(action?.type === 'webhook' ? action.url : '');
    setError(null);
  }, [open, schedule]);

  const picked = queries.find(q => q.name === query) ?? null;

  const save = async () => {
    if (saving) return;
    if (name && !NAME_PATTERN.test(name)) {
      setError(t('triggerNameInvalid'));
      return;
    }
    const body: Record<string, unknown> = {
      // Editing keeps its name; a new one never replaces another trigger.
      ...(schedule ? { name: schedule.name } : name ? { name } : {}),
      ...(schedule ? {} : { replace: false }),
      description: description.trim() || null,
      on: 'schedule',
      every,
      at,
      ...(every === 'week' ? { days } : {}),
      ...(query
        ? {
            query,
            params: Object.fromEntries(
              Object.entries(params).filter(([, v]) => v.trim() !== '')
            ),
            skipEmpty
          }
        : {}),
      ...(actionType === 'email'
        ? {
            email: {
              to: emailTo
                .split(/[,\s]+/)
                .map(v => v.trim())
                .filter(Boolean),
              ...(subject.trim() ? { subject: subject.trim() } : {}),
              text
            }
          }
        : actionType === 'function'
          ? { function: fn }
          : { webhook })
    };
    setSaving(true);
    setError(null);
    const result = await dataRequest<{
      trigger: DataTrigger;
      secret?: string;
      confirming?: string[];
    }>(base, '/trigger', { method: 'POST', body });
    setSaving(false);
    if (!result.ok) {
      setError(result.error || t('toastTriggerSaveFailed'));
      return;
    }
    const confirming = result.data.confirming ?? [];
    snackbar.success(
      confirming.length > 0
        ? t('toastTriggerSavedConfirming', { emails: confirming.join(', ') })
        : t('toastScheduleSaved')
    );
    onSaved(result.data.secret);
  };

  return (
    <UI.Modal
      open={open}
      title={schedule ? t('editSchedule') : t('newSchedule')}
      closeLabel={c('close')}
      width={620}
      onClose={onClose}
      footer={
        <FooterActions>
          <UI.Button size="small" variant="outlined" onClick={onClose}>
            {c('cancel')}
          </UI.Button>
          <UI.Button
            variant="contained"
            size="small"
            disabled={saving}
            onClick={save}
          >
            {saving ? c('saving') : c('save')}
          </UI.Button>
        </FooterActions>
      }
    >
      <DialogContent>
        <UI.Input
          size="small"
          label={t('triggerName')}
          placeholder="nightly-orders"
          value={name}
          disabled={!!schedule}
          onChange={e => setName(e.target.value)}
          helperText={schedule ? undefined : t('scheduleNameHelp')}
        />
        <UI.Input
          size="small"
          label={t('triggerDescription')}
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
        <div className="schedule-clock">
          <UI.Select
            size="small"
            label={t('scheduleEvery')}
            value={every}
            onChange={e => setEvery(e.target.value as Every)}
            options={[
              { value: 'day', label: t('scheduleEvery_day') },
              { value: 'week', label: t('scheduleEvery_week') }
            ]}
          />
          <UI.Input
            size="small"
            label={t('scheduleAt')}
            type="time"
            value={at}
            onChange={e => setAt(e.target.value)}
          />
        </div>
        {every === 'week' && (
          <div className="schedule-days">
            {WEEK.map(day => (
              <FormControlLabel
                key={day}
                control={
                  <Checkbox
                    size="small"
                    checked={days.includes(day)}
                    onChange={(_, checked) =>
                      setDays(prev =>
                        checked ? [...prev, day] : prev.filter(d => d !== day)
                      )
                    }
                  />
                }
                label={t(`scheduleDay_${day}`)}
              />
            ))}
          </div>
        )}
        <UI.Select
          size="small"
          label={t('scheduleQuery')}
          value={query}
          onChange={e => {
            setQuery(e.target.value as string);
            setParams({});
          }}
          options={[
            { value: '', label: t('scheduleNoQuery') },
            ...queries.map(q => ({ value: q.name, label: q.name }))
          ]}
        />
        <p className="data-card-muted">{t('scheduleQueryHelp')}</p>
        {picked?.params.map(param => (
          <UI.Input
            size="small"
            key={param.name}
            label={param.name}
            value={params[param.name] ?? ''}
            placeholder={param.type === 'date' ? '{{today}}' : ''}
            onChange={e =>
              setParams(prev => ({ ...prev, [param.name]: e.target.value }))
            }
            helperText={t('scheduleParamHelp', {
              values: DATA_SCHEDULE_PARAM_VALUES.join(', ')
            })}
          />
        ))}
        {query && (
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={skipEmpty}
                onChange={(_, checked) => setSkipEmpty(checked)}
              />
            }
            label={t('scheduleSkipEmpty')}
          />
        )}
        <UI.Select
          size="small"
          label={t('triggerAction')}
          value={actionType}
          onChange={e => setActionType(e.target.value as Action)}
          options={ACTIONS.map(a => ({
            value: a,
            label: t(`triggerAction_${a}`)
          }))}
        />
        {actionType === 'email' && (
          <>
            <UI.Input
              size="small"
              label={t('triggerEmailTo')}
              value={emailTo}
              onChange={e => setEmailTo(e.target.value)}
            />
            <UI.Input
              size="small"
              label={t('triggerEmailSubject')}
              value={subject}
              placeholder={`${query || 'schedule'}: {{date}}`}
              onChange={e => setSubject(e.target.value)}
            />
            <UI.Input
              size="small"
              label={t('triggerText')}
              value={text}
              multiline
              minRows={3}
              onChange={e => setText(e.target.value)}
              helperText={t('scheduleEmailHelp')}
            />
          </>
        )}
        {actionType === 'function' && (
          <UI.Select
            size="small"
            label={t('triggerFunction')}
            value={fn}
            onChange={e => setFn(e.target.value as string)}
            options={(functions ?? []).map(f => ({
              value: f.name,
              label: f.name
            }))}
          />
        )}
        {actionType === 'webhook' && (
          <UI.Input
            size="small"
            label={t('triggerWebhook')}
            placeholder="https://"
            value={webhook}
            onChange={e => setWebhook(e.target.value)}
          />
        )}
        {error && <p className="data-error">{error}</p>}
      </DialogContent>
    </UI.Modal>
  );
};
