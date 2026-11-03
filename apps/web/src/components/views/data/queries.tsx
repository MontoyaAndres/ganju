import { useEffect, useRef, useState } from 'react';
import { UI } from '@ganju/ui';

import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import {
  Add,
  ArrowBack,
  DeleteOutlined,
  EditOutlined,
  PlayArrowOutlined,
  RemoveCircleOutlined,
  SmartToyOutlined
} from '@mui/icons-material';

import { DialogContent, FooterActions } from './styles';
import { browserTimeZone, dataRequest } from './api';
import { i18n } from '../../../lib';

import type { DataQuery, DataQueryParam, DataQueryParamType } from './types';

const PARAM_TYPES: DataQueryParamType[] = [
  'text',
  'integer',
  'decimal',
  'boolean',
  'date',
  'datetime'
];

// Plan lines that read a whole table: "SCAN orders" with no index after it.
const scannedTables = (plan: string[]) =>
  plan
    .map(line => /^SCAN (\S+)$/.exec(line.trim())?.[1])
    .filter((name): name is string => !!name);

interface QueriesViewProps {
  base: string;
  readOnly: boolean;
  onBack: () => void;
}

/** The database's named queries: saved SELECTs run by name. */
export const QueriesView = ({ base, readOnly, onBack }: QueriesViewProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const [queries, setQueries] = useState<DataQuery[] | null>(null);
  const [failed, setFailed] = useState(false);
  // null: closed; a query: editing it; 'new': a new one.
  const [editing, setEditing] = useState<DataQuery | 'new' | null>(null);
  const [running, setRunning] = useState<DataQuery | null>(null);
  const [dropping, setDropping] = useState<DataQuery | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    const result = await dataRequest<{ queries: DataQuery[] }>(base, '/query');
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setQueries(result.data.queries);
  };

  useEffect(() => {
    load();
  }, [base]);

  const handleDrop = async () => {
    if (!dropping || deleting) return;
    setDeleting(true);
    const result = await dataRequest(
      base,
      `/query/${encodeURIComponent(dropping.name)}`,
      { method: 'DELETE' }
    );
    setDeleting(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastQueryDeleteFailed'));
      return;
    }
    setDropping(null);
    snackbar.success(t('toastQueryDeleted'));
    load();
  };

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
          <h2>{t('queriesTitle')}</h2>
        </div>
        <UI.Button
          variant="contained"
          size="small"
          disabled={readOnly}
          onClick={() => setEditing('new')}
        >
          <Add />
          <span className="button-text">{t('newQuery')}</span>
        </UI.Button>
      </div>
      <p className="data-main-description">{t('queriesHelp')}</p>

      {failed && <p className="data-error">{c('somethingWentWrong')}</p>}
      {!queries && !failed && <UI.Skeleton variant="rounded" height={120} />}
      {queries && queries.length === 0 && (
        <div className="data-main-placeholder">
          <p>{t('queriesEmpty')}</p>
        </div>
      )}
      {queries && queries.length > 0 && (
        <ul className="query-list">
          {queries.map(query => {
            const scans = scannedTables(query.plan);
            return (
              <li key={query.name} className="query-item">
                <div className="query-item-header">
                  <code className="query-item-name">{query.name}</code>
                  {query.assistant && (
                    <span
                      className="query-badge"
                      title={t('queryAssistantHelp')}
                    >
                      <SmartToyOutlined />
                      {t('queryAssistantBadge')}
                    </span>
                  )}
                  <div className="query-item-actions">
                    <IconButton
                      size="small"
                      title={t('runQuery')}
                      aria-label={t('runQuery')}
                      onClick={() => setRunning(query)}
                    >
                      <PlayArrowOutlined />
                    </IconButton>
                    <IconButton
                      size="small"
                      title={t('editQuery')}
                      aria-label={t('editQuery')}
                      disabled={readOnly}
                      onClick={() => setEditing(query)}
                    >
                      <EditOutlined />
                    </IconButton>
                    <IconButton
                      size="small"
                      title={t('deleteQuery')}
                      aria-label={t('deleteQuery')}
                      disabled={readOnly}
                      onClick={() => setDropping(query)}
                    >
                      <DeleteOutlined />
                    </IconButton>
                  </div>
                </div>
                {query.description && (
                  <p className="query-item-description">{query.description}</p>
                )}
                <dl className="query-item-meta">
                  <dt>{t('queryParams')}</dt>
                  <dd>
                    {query.params.length
                      ? query.params
                          .map(p => `:${p.name} (${t(`type_${p.type}`)})`)
                          .join(', ')
                      : '—'}
                  </dd>
                  <dt>{t('queryReads')}</dt>
                  <dd>{query.tables.join(', ') || '—'}</dd>
                </dl>
                {scans.length > 0 && (
                  <p className="query-item-scan">
                    {t('queryScans', { tables: scans.join(', ') })}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <QueryDialog
        open={editing !== null}
        base={base}
        query={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
      {running && (
        <RunDialog
          base={base}
          query={running}
          onClose={() => setRunning(null)}
        />
      )}
      <UI.Alert
        open={!!dropping}
        title={t('deleteQueryTitle', { name: dropping?.name ?? '' })}
        description={t('deleteQueryText')}
        confirmText={t('deleteQuery')}
        cancelText={c('cancel')}
        loadingText={c('deleting')}
        loading={deleting}
        onConfirm={handleDrop}
        onCancel={() => setDropping(null)}
      />
    </>
  );
};

interface QueryDialogProps {
  open: boolean;
  base: string;
  query: DataQuery | null;
  onClose: () => void;
  onSaved: () => void;
}

const emptyParam = (): DataQueryParam => ({
  name: '',
  type: 'text',
  description: '',
  required: true
});

const QueryDialog = ({
  open,
  base,
  query,
  onClose,
  onSaved
}: QueryDialogProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sql, setSql] = useState('');
  const [params, setParams] = useState<DataQueryParam[]>([]);
  const [assistant, setAssistant] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(query?.name ?? '');
    setDescription(query?.description ?? '');
    setSql(query?.sql ?? '');
    setParams(
      query?.params.map(p => ({ ...p, required: p.required !== false })) ?? []
    );
    setAssistant(query?.assistant ?? false);
    setError(null);
  }, [open, query]);

  // The dialog scrolls; a save error lands under the fields, out of view.
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [error]);

  // The :names the SQL uses that have no row yet, offered as one click.
  const used = [
    ...new Set([...sql.matchAll(/:([a-z][a-z0-9_]*)/g)].map(m => m[1]))
  ];
  const missing = used.filter(n => !params.some(p => p.name === n));

  const setParam = (index: number, next: Partial<DataQueryParam>) =>
    setParams(prev =>
      prev.map((p, i) => (i === index ? { ...p, ...next } : p))
    );

  const handleSave = async () => {
    if (saving) return;
    setError(null);
    setSaving(true);
    const result = await dataRequest<{ query: DataQuery }>(base, '/query', {
      method: 'POST',
      body: {
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        sql,
        params: params
          .filter(p => p.name.trim())
          .map(p => ({
            name: p.name.trim(),
            type: p.type,
            ...(p.description?.trim()
              ? { description: p.description.trim() }
              : {}),
            ...(p.required === false ? { required: false } : {})
          })),
        assistant
      }
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error || t('toastQuerySaveFailed'));
      return;
    }
    snackbar.success(t('toastQuerySaved'));
    onSaved();
  };

  return (
    <UI.Modal
      open={open}
      title={
        query ? t('editQueryTitle', { name: query.name }) : t('newQueryTitle')
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
            disabled={saving || !name.trim() || !sql.trim()}
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
            autoFocus={!query}
            label={t('queryName')}
            placeholder="sales_by_product"
            value={name}
            disabled={saving || !!query}
            helperText={query ? t('queryNameFixed') : t('queryNameHelp')}
            onChange={e => setName(e.target.value)}
          />
          <UI.Input
            size="small"
            label={t('queryDescription')}
            placeholder={t('queryDescriptionPlaceholder')}
            value={description}
            disabled={saving}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
        <UI.Input
          size="small"
          className="query-sql"
          label="SQL"
          multiline
          minRows={6}
          placeholder={
            'SELECT p.name, sum(l.quantity) AS units\nFROM order_lines l JOIN products p ON p.id = l.product\nWHERE l.created_at >= :from AND l.created_at < :to\nGROUP BY p.name ORDER BY units DESC'
          }
          value={sql}
          disabled={saving}
          helperText={t('querySqlHelp')}
          onChange={e => setSql(e.target.value)}
        />

        <h4 className="dialog-subtitle">{t('queryParams')}</h4>
        <p className="dialog-muted">{t('queryParamsHelp')}</p>
        {params.map((param, index) => (
          <div key={index} className="query-param-row">
            <UI.Input
              size="small"
              label={t('queryParamName')}
              placeholder="from"
              value={param.name}
              disabled={saving}
              onChange={e => setParam(index, { name: e.target.value })}
            />
            <UI.Select
              size="small"
              label={t('columnType')}
              value={param.type}
              disabled={saving}
              onChange={e =>
                setParam(index, { type: e.target.value as DataQueryParamType })
              }
              options={PARAM_TYPES.map(type => ({
                label: t(`type_${type}`),
                value: type
              }))}
            />
            <UI.Input
              size="small"
              label={t('queryParamDescription')}
              value={param.description ?? ''}
              disabled={saving}
              onChange={e => setParam(index, { description: e.target.value })}
            />
            <FormControlLabel
              className="query-param-required"
              control={
                <Checkbox
                  size="small"
                  checked={param.required !== false}
                  disabled={saving}
                  onChange={e =>
                    setParam(index, { required: e.target.checked })
                  }
                />
              }
              label={t('queryParamRequired')}
            />
            <IconButton
              size="small"
              aria-label={t('removeQueryParam')}
              title={t('removeQueryParam')}
              disabled={saving}
              onClick={() =>
                setParams(prev => prev.filter((_, i) => i !== index))
              }
            >
              <RemoveCircleOutlined fontSize="small" />
            </IconButton>
          </div>
        ))}
        <div className="query-param-add">
          {missing.map(n => (
            <UI.Button
              key={n}
              size="small"
              disabled={saving}
              onClick={() =>
                setParams(prev => [...prev, { ...emptyParam(), name: n }])
              }
            >
              <Add />
              <span className="button-text">:{n}</span>
            </UI.Button>
          ))}
          <UI.Button
            size="small"
            disabled={saving}
            onClick={() => setParams(prev => [...prev, emptyParam()])}
          >
            <Add />
            <span className="button-text">{t('addQueryParam')}</span>
          </UI.Button>
        </div>

        <FormControlLabel
          control={
            <Switch
              checked={assistant}
              disabled={saving}
              onChange={e => setAssistant(e.target.checked)}
            />
          }
          label={
            <span className="query-assistant-label">
              {t('queryAssistant')}
              <small>{t('queryAssistantHelp')}</small>
            </span>
          }
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

interface RunDialogProps {
  base: string;
  query: DataQuery;
  onClose: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

// A param's form text as the API takes it, or undefined when left empty.
const paramValue = (param: DataQueryParam, text: string): unknown => {
  if (text.trim() === '') return undefined;
  switch (param.type) {
    case 'integer':
    case 'decimal':
      return Number(text);
    case 'boolean':
      return text === 'true';
    case 'datetime': {
      const date = new Date(text);
      return Number.isNaN(date.getTime()) ? text : date.toISOString();
    }
    default:
      return text;
  }
};

const RunDialog = ({ base, query, onClose }: RunDialogProps) => {
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const now = new Date();
    return Object.fromEntries(
      query.params.map(p => [
        p.name,
        p.type === 'boolean'
          ? 'true'
          : p.type === 'date'
            ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
            : ''
      ])
    );
  });
  const [result, setResult] = useState<{
    rows: Record<string, unknown>[];
    truncated?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningNow, setRunningNow] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // The dialog scrolls; a run error lands under the fields, out of view.
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [error]);

  const handleRun = async () => {
    if (runningNow) return;
    setError(null);
    setRunningNow(true);
    const params = Object.fromEntries(
      query.params
        .map(p => [p.name, paramValue(p, values[p.name] ?? '')] as const)
        .filter(([, value]) => value !== undefined)
    );
    const response = await dataRequest<{
      rows: Record<string, unknown>[];
      truncated?: string;
    }>(base, `/query/${encodeURIComponent(query.name)}/run`, {
      method: 'POST',
      body: { params, limit: 100, timeZone: browserTimeZone() }
    });
    setRunningNow(false);
    if (!response.ok) {
      setResult(null);
      setError(response.error || t('toastQueryRunFailed'));
      return;
    }
    setResult(response.data);
  };

  const columns = result?.rows[0] ? Object.keys(result.rows[0]) : [];

  return (
    <UI.Modal
      open
      title={t('runQueryTitle', { name: query.name })}
      closeLabel={c('close')}
      width={840}
      onClose={() => !runningNow && onClose()}
      footer={
        <FooterActions>
          <UI.Button size="small" disabled={runningNow} onClick={onClose}>
            {c('close')}
          </UI.Button>
          <UI.Button
            variant="contained"
            size="small"
            disabled={runningNow}
            onClick={handleRun}
          >
            <PlayArrowOutlined />
            <span className="button-text">
              {runningNow ? t('runningQuery') : t('runQuery')}
            </span>
          </UI.Button>
        </FooterActions>
      }
    >
      <DialogContent>
        {query.description && (
          <p className="dialog-muted">{query.description}</p>
        )}
        {query.params.length > 0 && (
          <div className="query-run-params">
            {query.params.map(param =>
              param.type === 'boolean' ? (
                <UI.Select
                  key={param.name}
                  size="small"
                  label={param.name}
                  value={values[param.name] ?? 'true'}
                  onChange={e =>
                    setValues(prev => ({
                      ...prev,
                      [param.name]: String(e.target.value)
                    }))
                  }
                  options={[
                    { label: 'true', value: 'true' },
                    { label: 'false', value: 'false' }
                  ]}
                />
              ) : (
                <UI.Input
                  key={param.name}
                  size="small"
                  label={`${param.name}${param.required !== false ? ' *' : ''}`}
                  helperText={param.description || undefined}
                  value={values[param.name] ?? ''}
                  type={
                    param.type === 'integer' || param.type === 'decimal'
                      ? 'number'
                      : param.type === 'date'
                        ? 'date'
                        : param.type === 'datetime'
                          ? 'datetime-local'
                          : 'text'
                  }
                  slotProps={{
                    inputLabel:
                      param.type === 'date' || param.type === 'datetime'
                        ? { shrink: true }
                        : undefined
                  }}
                  onChange={e =>
                    setValues(prev => ({
                      ...prev,
                      [param.name]: e.target.value
                    }))
                  }
                />
              )
            )}
          </div>
        )}
        {error && (
          <p ref={errorRef} className="dialog-danger" role="alert">
            {error}
          </p>
        )}
        {result && result.rows.length === 0 && (
          <p className="dialog-muted">{t('queryNoRows')}</p>
        )}
        {result && result.rows.length > 0 && (
          <div className="query-results">
            <table>
              <thead>
                <tr>
                  {columns.map(column => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i}>
                    {columns.map(column => (
                      <td key={column}>
                        {row[column] === null || row[column] === undefined
                          ? '—'
                          : typeof row[column] === 'object'
                            ? JSON.stringify(row[column])
                            : String(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result?.truncated && (
          <p className="dialog-warning">{result.truncated}</p>
        )}
      </DialogContent>
    </UI.Modal>
  );
};
