import { useEffect, useMemo, useState } from 'react';
import { UI } from '@ganju/ui';

import Autocomplete from '@mui/material/Autocomplete';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import { Close, DeleteOutlined } from '@mui/icons-material';

import { DialogContent, FooterActions, PanelContent } from './styles';
import {
  browserTimeZone,
  columnTitle,
  dataRequest,
  incomingRelations,
  isRelationValue,
  tableTitle
} from './api';
import { i18n } from '../../../lib';

import type {
  DataColumn,
  DataOnDelete,
  DataRow,
  DataTable,
  RelationValue,
  RowPage
} from './types';

// What deleting rows does to the rows that point at them, read before the
// owner confirms. The database follows every cascade to the end; `depth` is
// how many cascades away from the deleted rows an effect is. `rows` is null
// when the preview couldn't be read.
export interface Impact {
  loading: boolean;
  blocked: boolean;
  // Past the preview's limit: each count is a lower bound.
  truncated: boolean;
  count: number;
  effects: {
    table: DataTable;
    column: DataColumn;
    onDelete: DataOnDelete;
    rows: number | null;
    depth: number;
  }[];
}

interface ImpactAnswer {
  effects: {
    table: string;
    column: string;
    onDelete: DataOnDelete;
    rows: number;
    depth: number;
  }[];
  blocked: boolean;
  truncated: boolean;
}

// `ids` is the rows to delete, or 'all' for every row of the table.
export const useDeleteImpact = (
  base: string,
  tables: DataTable[],
  table: DataTable,
  ids: number[] | 'all'
): Impact => {
  const [impact, setImpact] = useState<Impact>({
    loading: false,
    blocked: false,
    truncated: false,
    count: 0,
    effects: []
  });
  const key = ids === 'all' ? 'all' : ids.join(',');

  useEffect(() => {
    const count = ids === 'all' ? 0 : ids.length;
    const relations = incomingRelations(tables, table.name);
    if ((ids !== 'all' && ids.length === 0) || relations.length === 0) {
      setImpact({ loading: false, blocked: false, truncated: false, count, effects: [] });
      return;
    }
    const controller = new AbortController();
    setImpact({ loading: true, blocked: false, truncated: false, count, effects: [] });
    (async () => {
      const result = await dataRequest<ImpactAnswer>(
        base,
        `/table/${encodeURIComponent(table.name)}/delete-preview`,
        {
          method: 'POST',
          body: ids === 'all' ? {} : { ids },
          signal: controller.signal
        }
      );
      if (controller.signal.aborted) return;
      if (!result.ok) {
        // Unread: every column pointing here may be affected.
        setImpact({
          loading: false,
          blocked: false,
          truncated: false,
          count,
          effects: relations.map(({ table: other, column }) => ({
            table: other,
            column,
            onDelete: column.onDelete ?? 'restrict',
            rows: null,
            depth: 0
          }))
        });
        return;
      }
      const effects: Impact['effects'] = [];
      for (const effect of result.data.effects) {
        const other = tables.find(t => t.name === effect.table);
        const column = other?.columns.find(c => c.name === effect.column);
        if (other && column) effects.push({ ...effect, table: other, column });
      }
      setImpact({
        loading: false,
        blocked: result.data.blocked,
        truncated: result.data.truncated,
        count,
        effects
      });
    })().catch(() => {
      // Aborted: the rows to delete changed.
    });
    return () => controller.abort();
  }, [base, table.name, key]);

  return impact;
};

export const DeleteImpact = ({ impact }: { impact: Impact }) => {
  const t = i18n.useT(i18n.copy.DATA);
  return (
    <DialogContent>
      <p>{t.plural('deleteRowsText', impact.count)}</p>
      <ImpactList impact={impact} />
    </DialogContent>
  );
};

// What the delete does to other tables, and whether it is refused.
export const ImpactList = ({ impact }: { impact: Impact }) => {
  const t = i18n.useT(i18n.copy.DATA);
  return (
    <>
      {impact.loading && <p className="dialog-muted">{t('checkingRelated')}</p>}
      {impact.effects.length > 0 && (
        <ul className="dialog-list">
          {impact.effects.map((effect, index) => {
            const params = {
              table: tableTitle(effect.table),
              column: columnTitle(effect.column)
            };
            const rows = effect.rows;
            return (
              <li
                key={`${index}:${effect.table.name}.${effect.column.name}`}
                className={effect.onDelete === 'restrict' ? 'dialog-danger' : ''}
                // A cascade's own effects sit under it.
                style={effect.depth ? { marginLeft: effect.depth * 16 } : undefined}
              >
                {rows === null
                  ? t('impactUnknown', params)
                  : effect.onDelete === 'cascade'
                    ? t.plural('impactCascade', rows, params)
                    : effect.onDelete === 'set_null'
                      ? t.plural('impactSetNull', rows, params)
                      : t.plural('impactRestrict', rows, params)}
              </li>
            );
          })}
        </ul>
      )}
      {impact.truncated && (
        <p className="dialog-muted">{t('impactTruncated')}</p>
      )}
      {impact.blocked && (
        <p className="dialog-danger">{t('impactBlocked')}</p>
      )}
    </>
  );
};

// A form keeps every value as the input shows it; these turn a stored value
// into that and back.
type FormValue = string | RelationValue | null;

const pad = (n: number) => String(n).padStart(2, '0');

const toForm = (column: DataColumn, value: unknown): FormValue => {
  if (value === null || value === undefined) {
    return column.type === 'relation' ? null : '';
  }
  switch (column.type) {
    case 'relation':
      return isRelationValue(value) ? value : null;
    case 'boolean':
      return value ? 'true' : 'false';
    case 'json':
      return JSON.stringify(value, null, 2);
    case 'datetime': {
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) return String(value);
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    default:
      return String(value);
  }
};

const fromForm = (
  column: DataColumn,
  value: FormValue
): { ok: true; value: unknown } | { ok: false } => {
  if (column.type === 'relation') {
    return { ok: true, value: value && typeof value === 'object' ? value.id : null };
  }
  const text = typeof value === 'string' ? value : '';
  if (text.trim() === '') return { ok: true, value: null };
  switch (column.type) {
    case 'integer':
    case 'decimal': {
      const n = Number(text);
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
    }
    case 'boolean':
      return { ok: true, value: text === 'true' };
    case 'datetime': {
      const date = new Date(text);
      return Number.isNaN(date.getTime())
        ? { ok: false }
        : { ok: true, value: date.toISOString() };
    }
    case 'json':
      try {
        return { ok: true, value: JSON.parse(text) };
      } catch {
        return { ok: false };
      }
    default:
      return { ok: true, value: text };
  }
};

const sameValue = (a: FormValue, b: FormValue) =>
  a && b && typeof a === 'object' && typeof b === 'object'
    ? a.id === b.id
    : a === b;

interface RelationFieldProps {
  base: string;
  column: DataColumn;
  target: DataTable | undefined;
  value: RelationValue | null;
  disabled: boolean;
  error?: string;
  // In place of the column's name, e.g. the file value being matched.
  label?: string;
  onChange: (value: RelationValue | null) => void;
}

// A searchable select over the referenced table, showing its display column.
export const RelationField = ({
  base,
  column,
  target,
  value,
  disabled,
  error,
  label,
  onChange
}: RelationFieldProps) => {
  const t = i18n.useT(i18n.copy.DATA);
  const [input, setInput] = useState('');
  const [options, setOptions] = useState<RelationValue[]>([]);
  const [loading, setLoading] = useState(false);
  const display = target?.displayColumn ?? null;
  const searchable = target?.columns.some(c => c.searchable) ?? false;

  useEffect(() => {
    if (!target) return;
    const controller = new AbortController();
    const text = input.trim();
    const timer = setTimeout(() => {
      setLoading(true);
      const asId = Number(text);
      const where =
        text && Number.isSafeInteger(asId) && asId > 0
          ? { id: asId }
          : text && !searchable && display
            ? { [display]: { contains: text } }
            : undefined;
      dataRequest<RowPage>(base, `/table/${encodeURIComponent(target.name)}/row`, {
        signal: controller.signal,
        query: {
          limit: 20,
          q: text && searchable && !where ? text : undefined,
          where: where ? JSON.stringify(where) : undefined
        }
      })
        .then(result => {
          if (controller.signal.aborted) return;
          setLoading(false);
          if (!result.ok) return;
          setOptions(
            result.data.rows.map(row => ({
              id: row.id,
              label: display ? (row[display] ?? null) : null
            }))
          );
        })
        .catch(() => {
          // aborted
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input, target?.name]);

  const labelOf = (option: RelationValue) =>
    option.label !== null && option.label !== undefined && option.label !== ''
      ? `${String(option.label)} · #${option.id}`
      : `#${option.id}`;

  return (
    <Autocomplete
      options={options}
      value={value}
      loading={loading}
      disabled={disabled}
      filterOptions={x => x}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      getOptionLabel={labelOf}
      onInputChange={(_, text, reason) => {
        if (reason === 'input' || reason === 'clear') setInput(text);
      }}
      onChange={(_, next) => onChange(next)}
      noOptionsText={t('relationNoRows')}
      loadingText={t('relationLoading')}
      renderInput={params => (
        <TextField
          {...params}
          size="small"
          label={label ?? `${columnTitle(column)}${column.required ? ' *' : ''}`}
          error={!!error}
          helperText={
            error ||
            t('relationHelp', { table: target ? tableTitle(target) : (column.table ?? '') })
          }
        />
      )}
    />
  );
};

interface RowPanelProps {
  base: string;
  table: DataTable;
  tables: DataTable[];
  // null for a new row
  row: DataRow | null;
  readOnly: boolean;
  onClose: () => void;
  onSaved: (row: DataRow) => void;
  onDeleted: () => void;
}

export const RowPanel = ({
  base,
  table,
  tables,
  row,
  readOnly,
  onClose,
  onSaved,
  onDeleted
}: RowPanelProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const tablePath = `/table/${encodeURIComponent(table.name)}`;
  const initial = useMemo(
    () =>
      Object.fromEntries(
        table.columns.map(column => [
          column.name,
          row
            ? toForm(column, row[column.name])
            : column.default !== undefined && column.default !== null
              ? toForm(column, column.default)
              : toForm(column, null)
        ])
      ) as Record<string, FormValue>,
    [row, table]
  );
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<{
    current: DataRow;
    updatedBy: string | null;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const impact = useDeleteImpact(
    base,
    tables,
    table,
    confirmDelete && row ? [row.id] : []
  );

  useEffect(() => {
    setValues(initial);
    setErrors({});
    setConflict(null);
  }, [initial]);

  const setValue = (name: string, value: FormValue) => {
    setValues(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const reload = async (id: number) => {
    const result = await dataRequest<{ row: DataRow }>(
      base,
      `${tablePath}/row/${id}`,
      { query: { timeZone: browserTimeZone() } }
    );
    return result.ok ? result.data.row : null;
  };

  const handleSave = async () => {
    if (saving || readOnly) return;
    const out: Record<string, unknown> = {};
    const nextErrors: Record<string, string> = {};
    for (const column of table.columns) {
      const value = values[column.name];
      if (row && sameValue(value, initial[column.name])) continue;
      const parsed = fromForm(column, value);
      if (!parsed.ok) {
        nextErrors[column.name] =
          column.type === 'json' ? t('errorJson') : t('errorValue');
        continue;
      }
      if (parsed.value === null && column.required && !row && column.default !== undefined) {
        continue;
      }
      if (parsed.value === null && column.required) {
        nextErrors[column.name] = t('errorRequired');
        continue;
      }
      if (!row && parsed.value === null) continue;
      out[column.name] = parsed.value;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (row && Object.keys(out).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    if (row) {
      const result = await dataRequest<{ row: DataRow }>(
        base,
        `${tablePath}/row/${row.id}`,
        {
          method: 'PATCH',
          body: {
            set: out,
            ...(row.version !== undefined ? { version: row.version } : {})
          }
        }
      );
      setSaving(false);
      if (!result.ok) {
        const current = result.details?.current as DataRow | undefined;
        if (current) {
          setConflict({
            current,
            updatedBy: (result.details?.updatedBy as string) ?? null
          });
          return;
        }
        snackbar.error(result.error || t('toastSaveRowFailed'));
        return;
      }
      snackbar.success(t('toastRowSaved'));
      onSaved((await reload(row.id)) ?? result.data.row);
      return;
    }
    const result = await dataRequest<{ ids: number[] }>(base, `${tablePath}/row`, {
      method: 'POST',
      body: { values: out }
    });
    setSaving(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastSaveRowFailed'));
      return;
    }
    snackbar.success(t('toastRowCreated'));
    const created = await reload(result.data.ids[0]);
    if (created) onSaved(created);
    else onClose();
  };

  const handleDelete = async () => {
    if (!row || deleting) return;
    setDeleting(true);
    const result = await dataRequest(base, `${tablePath}/row/${row.id}`, {
      method: 'DELETE',
      body: row.version !== undefined ? { version: row.version } : {}
    });
    setDeleting(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastDeleteRowsFailed'));
      return;
    }
    setConfirmDelete(false);
    snackbar.success(t.plural('toastRowsDeleted', 1));
    onDeleted();
  };

  const renderField = (column: DataColumn) => {
    const value = values[column.name];
    const label = `${columnTitle(column)}${column.required ? ' *' : ''}`;
    const error = errors[column.name];
    const helperText = error || column.description || undefined;
    const disabled = saving || readOnly;
    const text = typeof value === 'string' ? value : '';
    switch (column.type) {
      case 'relation':
        return (
          <RelationField
            base={base}
            column={column}
            target={tables.find(other => other.name === column.table)}
            value={value && typeof value === 'object' ? value : null}
            disabled={disabled}
            error={error}
            onChange={next => setValue(column.name, next)}
          />
        );
      case 'boolean':
      case 'enum': {
        const options =
          column.type === 'boolean'
            ? [
                { label: t('yes'), value: 'true' },
                { label: t('no'), value: 'false' }
              ]
            : (column.values ?? []).map(v => ({ label: v, value: v }));
        return (
          <UI.Select
            size="small"
            label={label}
            value={text}
            disabled={disabled}
            error={!!error}
            helperText={helperText}
            onChange={e => setValue(column.name, e.target.value)}
            options={
              column.required ? options : [{ label: '—', value: '' }, ...options]
            }
          />
        );
      }
      default:
        return (
          <UI.Input
            size="small"
            label={label}
            value={text}
            disabled={disabled}
            error={!!error}
            helperText={helperText}
            onChange={e => setValue(column.name, e.target.value)}
            type={
              column.type === 'integer' || column.type === 'decimal'
                ? 'number'
                : column.type === 'date'
                  ? 'date'
                  : column.type === 'datetime'
                    ? 'datetime-local'
                    : column.type === 'email'
                      ? 'email'
                      : column.type === 'url'
                        ? 'url'
                        : column.type === 'phone'
                          ? 'tel'
                          : 'text'
            }
            slotProps={{
              inputLabel:
                column.type === 'date' || column.type === 'datetime'
                  ? { shrink: true }
                  : undefined,
              htmlInput:
                column.type === 'integer'
                  ? { step: 1, min: column.min ?? undefined }
                  : column.type === 'decimal'
                    ? { step: 'any', min: column.min ?? undefined }
                    : undefined
            }}
            multiline={column.type === 'long_text' || column.type === 'json'}
            minRows={column.type === 'json' ? 4 : column.type === 'long_text' ? 3 : undefined}
            className={column.type === 'json' ? 'data-json-input' : undefined}
          />
        );
    }
  };

  return (
    <Drawer
      anchor="right"
      open
      onClose={() => !saving && onClose()}
      slotProps={{ paper: { className: 'data-row-drawer' } }}
    >
      <PanelContent>
        <div className="panel-header">
          <h2 className="panel-title">
            {row ? t('rowTitle', { id: row.id }) : t('newRowTitle')}
          </h2>
          {row && !readOnly && (
            <IconButton
              size="small"
              aria-label={t('deleteRow')}
              title={t('deleteRow')}
              onClick={() => setConfirmDelete(true)}
            >
              <DeleteOutlined />
            </IconButton>
          )}
          <IconButton size="small" aria-label={c('close')} onClick={onClose}>
            <Close />
          </IconButton>
        </div>
        {conflict && (
          <div className="panel-conflict">
            <p>
              {conflict.updatedBy
                ? t('conflictBy', { actor: conflict.updatedBy })
                : t('conflict')}
            </p>
            <UI.Button
              size="small"
              variant="contained"
              onClick={async () => {
                const latest = row ? await reload(row.id) : null;
                setConflict(null);
                if (latest) onSaved(latest);
              }}
            >
              <span className="button-text">{t('conflictLoad')}</span>
            </UI.Button>
          </div>
        )}
        <div className="panel-form">
          {table.columns.map(column => (
            <div key={column.name} className="panel-field">
              {renderField(column)}
            </div>
          ))}
          {table.columns.length === 0 && (
            <p className="panel-muted">{t('noColumns')}</p>
          )}
        </div>
        {row && (
          <dl className="panel-meta">
            <dt>{t('metaCreated')}</dt>
            <dd>{t.date(row.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
            <dt>{t('metaUpdated')}</dt>
            <dd>{t.date(row.updated_at, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
            {row.version !== undefined && (
              <>
                <dt>{t('metaVersion')}</dt>
                <dd>{row.version}</dd>
              </>
            )}
          </dl>
        )}
        {!readOnly && (
          <div className="panel-actions">
            <UI.Button
              variant="contained"
              size="small"
              disabled={saving || table.columns.length === 0}
              onClick={handleSave}
            >
              {saving ? c('saving') : row ? c('save') : c('create')}
            </UI.Button>
            <UI.Button size="small" disabled={saving} onClick={onClose}>
              {c('cancel')}
            </UI.Button>
          </div>
        )}
      </PanelContent>
      <UI.Modal
        open={confirmDelete}
        title={t.plural('deleteRowsTitle', 1)}
        closeLabel={c('close')}
        onClose={() => !deleting && setConfirmDelete(false)}
        footer={
          <FooterActions>
            <UI.Button
              size="small"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
            >
              {c('cancel')}
            </UI.Button>
            <UI.Button
              variant="contained"
              size="small"
              color="error"
              disabled={deleting || impact.blocked || impact.loading}
              onClick={handleDelete}
            >
              {deleting ? c('deleting') : t('deleteRowsAction')}
            </UI.Button>
          </FooterActions>
        }
      >
        <DeleteImpact impact={impact} />
      </UI.Modal>
    </Drawer>
  );
};
