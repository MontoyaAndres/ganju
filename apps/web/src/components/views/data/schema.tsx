import { useEffect, useState } from 'react';
import { UI } from '@ganju/ui';

import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import { Add, DeleteOutlined, EditOutlined } from '@mui/icons-material';

import { DialogContent, FooterActions } from './styles';
import { ConfirmName } from './confirm-name';
import {
  ColumnFields,
  draftFromColumn,
  emptyDraft,
  inputFromDraft,
  patchFromDraft,
  type ColumnDraft
} from './column-fields';
import { columnTitle, dataRequest, incomingRelations, tableTitle } from './api';
import { i18n } from '../../../lib';

import type { DataAccess, DataColumn, DataTable } from './types';

// Columns a relation can show for its rows.
const DISPLAY_TYPES = ['text', 'email', 'url', 'phone', 'enum', 'integer', 'decimal', 'date', 'datetime'];

interface SchemaTabProps {
  base: string;
  table: DataTable;
  tables: DataTable[];
  readOnly: boolean;
  // `renamed` is the table's new name when it changed.
  onChanged: (renamed?: string) => Promise<void> | void;
  onDropped: (name: string, bookmark: string) => void;
  onColumnDropped: (table: string, column: string, bookmark: string) => void;
  // A type change answers with the bookmark from just before it.
  onColumnTypeChanged: (table: string, column: string, bookmark: string) => void;
}

interface Settings {
  name: string;
  label: string;
  description: string;
  displayColumn: string;
  access: DataAccess;
  customerScoped: boolean;
  history: boolean;
}

const settingsOf = (table: DataTable): Settings => ({
  name: table.name,
  label: table.label ?? '',
  description: table.description ?? '',
  displayColumn: table.displayColumn ?? '',
  access: table.access,
  customerScoped: table.customerScoped,
  history: table.history
});

export const SchemaTab = ({
  base,
  table,
  tables,
  readOnly,
  onChanged,
  onDropped,
  onColumnDropped,
  onColumnTypeChanged
}: SchemaTabProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const tablePath = `/table/${encodeURIComponent(table.name)}`;

  const [settings, setSettings] = useState<Settings>(() => settingsOf(table));
  const [savingSettings, setSavingSettings] = useState(false);
  // The column open in the dialog: a new one, or one being changed.
  const [editing, setEditing] = useState<{
    column: DataColumn | null;
    draft: ColumnDraft;
  } | null>(null);
  const [savingColumn, setSavingColumn] = useState(false);
  const [columnError, setColumnError] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<DataColumn | null>(null);
  const [dropTableOpen, setDropTableOpen] = useState(false);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    setSettings(settingsOf(table));
  }, [table]);

  const settingsPatch = () => {
    const before = settingsOf(table);
    const patch: Record<string, unknown> = {};
    if (settings.name.trim() !== before.name) patch.name = settings.name.trim();
    if (settings.label.trim() !== before.label) {
      patch.label = settings.label.trim() || null;
    }
    if (settings.description.trim() !== before.description) {
      patch.description = settings.description.trim() || null;
    }
    if (settings.displayColumn !== before.displayColumn) {
      patch.displayColumn = settings.displayColumn || null;
    }
    if (settings.access !== before.access) patch.access = settings.access;
    if (settings.customerScoped !== before.customerScoped) {
      patch.customerScoped = settings.customerScoped;
    }
    if (settings.history !== before.history) patch.history = settings.history;
    return patch;
  };
  const dirty = Object.keys(settingsPatch()).length > 0;

  const handleSaveSettings = async () => {
    const patch = settingsPatch();
    if (savingSettings || !Object.keys(patch).length) return;
    setSavingSettings(true);
    const result = await dataRequest<{ table: DataTable }>(base, tablePath, {
      method: 'PATCH',
      body: patch
    });
    setSavingSettings(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastSaveTableFailed'));
      return;
    }
    snackbar.success(t('toastTableSaved'));
    await onChanged(
      result.data.table.name !== table.name ? result.data.table.name : undefined
    );
  };

  const handleSaveColumn = async () => {
    if (!editing || savingColumn) return;
    setColumnError(null);
    const { column, draft } = editing;
    let result;
    let bookmark: string | null = null;
    if (column) {
      const patch = patchFromDraft(column, draft);
      if (!Object.keys(patch).length) {
        setEditing(null);
        return;
      }
      setSavingColumn(true);
      const patched = await dataRequest<{
        table: DataTable;
        bookmark: string | null;
      }>(base, `${tablePath}/column/${encodeURIComponent(column.name)}`, {
        method: 'PATCH',
        body: patch
      });
      if (patched.ok && patch.type) bookmark = patched.data.bookmark ?? null;
      result = patched;
    } else {
      setSavingColumn(true);
      result = await dataRequest<{ table: DataTable }>(
        base,
        `${tablePath}/column`,
        { method: 'POST', body: inputFromDraft(draft) }
      );
    }
    setSavingColumn(false);
    if (!result.ok) {
      setColumnError(result.error || t('toastSaveColumnFailed'));
      return;
    }
    setEditing(null);
    snackbar.success(column ? t('toastColumnSaved') : t('toastColumnAdded'));
    if (column && bookmark) {
      onColumnTypeChanged(table.name, draft.name.trim() || column.name, bookmark);
    }
    await onChanged();
  };

  const handleDropColumn = async () => {
    if (!dropColumn || dropping) return;
    setDropping(true);
    const result = await dataRequest<{ table: DataTable; bookmark: string }>(
      base,
      `${tablePath}/column/${encodeURIComponent(dropColumn.name)}`,
      { method: 'DELETE' }
    );
    setDropping(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastDropColumnFailed'));
      return;
    }
    const name = dropColumn.name;
    setDropColumn(null);
    onColumnDropped(table.name, name, result.data.bookmark);
    await onChanged();
  };

  const handleDropTable = async () => {
    if (dropping) return;
    setDropping(true);
    const result = await dataRequest<{ dropped: string; bookmark: string }>(
      base,
      tablePath,
      { method: 'DELETE', body: { confirmName: table.name } }
    );
    setDropping(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastDropTableFailed'));
      return;
    }
    setDropTableOpen(false);
    onDropped(table.name, result.data.bookmark);
  };

  const outgoing = table.columns.filter(column => column.type === 'relation');
  const incoming = incomingRelations(tables, table.name);
  const indexes = table.columns.flatMap(column => {
    const kinds: string[] = [];
    if (column.unique) kinds.push(t('indexUnique'));
    else if (column.filterable) kinds.push(t('indexFilter'));
    else if (column.type === 'relation' || column.type === 'file') {
      kinds.push(t('indexAuto'));
    }
    if (column.searchable) kinds.push(t('indexSearch'));
    return kinds.length ? [{ column, kinds }] : [];
  });
  const displayOptions = [
    { label: t('displayColumnId'), value: '' },
    ...table.columns
      .filter(column => DISPLAY_TYPES.includes(column.type))
      .map(column => ({ label: columnTitle(column), value: column.name }))
  ];
  const changingType =
    editing?.column && editing.draft.type !== editing.column.type;

  return (
    <div className="data-schema">
      <section className="data-card">
        <div className="data-card-header">
          <div>
            <h3>{t('columnsTitle')}</h3>
            <p className="data-card-muted">
              {t.plural('columnCount', table.columns.length)}
            </p>
          </div>
          <UI.Button
            size="small"
            variant="contained"
            disabled={readOnly}
            onClick={() => {
              setColumnError(null);
              setEditing({ column: null, draft: emptyDraft() });
            }}
          >
            <Add />
            <span className="button-text">{t('addColumn')}</span>
          </UI.Button>
        </div>
        {table.columns.length === 0 ? (
          <p className="data-card-muted">{t('noColumns')}</p>
        ) : (
          <div className="data-columns" role="table">
            <div className="data-columns-head" role="row">
              <span role="columnheader">{t('columnName')}</span>
              <span role="columnheader">{t('columnType')}</span>
              <span role="columnheader">{t('columnRules')}</span>
              <span aria-hidden="true" />
            </div>
            {table.columns.map(column => {
              const rules = [
                column.required && t('flagRequired'),
                column.unique && t('flagUnique'),
                column.filterable && t('flagFilterable'),
                column.searchable && t('flagSearchable'),
                column.min !== null && t('ruleMin', { min: column.min }),
                column.default !== undefined &&
                  column.default !== null &&
                  t('ruleDefault', { value: String(column.default) })
              ].filter((rule): rule is string => !!rule);
              return (
                <div key={column.name} className="data-column" role="row">
                  <div className="data-column-name" role="cell">
                    <span className="data-column-title">
                      {columnTitle(column)}
                    </span>
                    {column.label && <code>{column.name}</code>}
                    {column.description && (
                      <p className="data-column-description">
                        {column.description}
                      </p>
                    )}
                  </div>
                  <div className="data-column-type" role="cell">
                    <span className="data-chip">{t(`type_${column.type}`)}</span>
                    {column.type === 'relation' && column.table && (
                      <span className="data-column-meta">→ {column.table}</span>
                    )}
                    {column.type === 'enum' && column.values?.length ? (
                      <span
                        className="data-column-meta"
                        title={column.values.join(', ')}
                      >
                        {column.values.slice(0, 3).join(', ')}
                        {column.values.length > 3 ? '…' : ''}
                      </span>
                    ) : null}
                  </div>
                  <div className="data-column-rules" role="cell">
                    {rules.length ? (
                      rules.map(rule => (
                        <span key={rule} className="data-chip data-chip-muted">
                          {rule}
                        </span>
                      ))
                    ) : (
                      <span className="data-column-meta">—</span>
                    )}
                  </div>
                  <div className="data-column-actions" role="cell">
                    {!readOnly && (
                      <>
                        <IconButton
                          size="small"
                          aria-label={t('editColumn')}
                          title={t('editColumn')}
                          onClick={() => {
                            setColumnError(null);
                            setEditing({ column, draft: draftFromColumn(column) });
                          }}
                        >
                          <EditOutlined fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label={t('dropColumn')}
                          title={t('dropColumn')}
                          onClick={() => setDropColumn(column)}
                        >
                          <DeleteOutlined fontSize="small" />
                        </IconButton>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="data-card">
        <div className="data-card-header">
          <h3>{t('tableSettings')}</h3>
        </div>
        <div className="data-form">
          <div className="data-form-row">
            <UI.Input
              size="small"
              label={t('tableName')}
              helperText={t('tableNameHelp')}
              value={settings.name}
              disabled={readOnly || savingSettings}
              onChange={e => setSettings(s => ({ ...s, name: e.target.value }))}
            />
            <UI.Input
              size="small"
              label={t('tableLabel')}
              value={settings.label}
              disabled={readOnly || savingSettings}
              onChange={e => setSettings(s => ({ ...s, label: e.target.value }))}
            />
          </div>
          <UI.Input
            size="small"
            label={t('tableDescription')}
            helperText={t('tableDescriptionHelp')}
            value={settings.description}
            disabled={readOnly || savingSettings}
            multiline
            minRows={2}
            onChange={e =>
              setSettings(s => ({ ...s, description: e.target.value }))
            }
          />
          <UI.Select
            size="small"
            label={t('displayColumn')}
            helperText={t('displayColumnHelp')}
            value={settings.displayColumn}
            // "The row id" is the empty value, and should still show.
            slotProps={{
              select: { displayEmpty: true },
              inputLabel: { shrink: true }
            }}
            disabled={readOnly || savingSettings}
            onChange={e =>
              setSettings(s => ({ ...s, displayColumn: e.target.value }))
            }
            options={displayOptions}
          />
          <UI.Select
            size="small"
            label={t('access')}
            helperText={t(`accessHelp_${settings.access}`)}
            value={settings.access}
            disabled={readOnly || savingSettings}
            onChange={e =>
              setSettings(s => ({ ...s, access: e.target.value as DataAccess }))
            }
            options={(['none', 'read', 'add', 'full'] as const).map(level => ({
              label: t(`access_${level}`),
              value: level
            }))}
          />
          <FormControlLabel
            className="column-flag"
            control={
              <Checkbox
                size="small"
                checked={settings.customerScoped}
                disabled={readOnly || savingSettings}
                onChange={e =>
                  setSettings(s => ({ ...s, customerScoped: e.target.checked }))
                }
              />
            }
            label={
              <span>
                {t('customerScoped')}
                <small>{t('customerScopedHelp')}</small>
              </span>
            }
          />
          <FormControlLabel
            className="column-flag"
            control={
              <Checkbox
                size="small"
                checked={settings.history}
                disabled={readOnly || savingSettings}
                onChange={e =>
                  setSettings(s => ({ ...s, history: e.target.checked }))
                }
              />
            }
            label={
              <span>
                {t('history')}
                <small>{t('historyHelp')}</small>
              </span>
            }
          />
          {!readOnly && (
            <div className="data-form-actions">
              <UI.Button
                variant="contained"
                size="small"
                disabled={!dirty || savingSettings}
                onClick={handleSaveSettings}
              >
                {savingSettings ? c('saving') : c('save')}
              </UI.Button>
              {dirty && (
                <UI.Button
                  size="small"
                  disabled={savingSettings}
                  onClick={() => setSettings(settingsOf(table))}
                >
                  {c('cancel')}
                </UI.Button>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="data-card">
        <div className="data-card-header">
          <h3>{t('relationsTitle')}</h3>
        </div>
        {outgoing.length === 0 && incoming.length === 0 ? (
          <p className="data-card-muted">{t('noRelations')}</p>
        ) : (
          <ul className="data-plain-list">
            {outgoing.map(column => {
              const target = tables.find(other => other.name === column.table);
              return (
                <li key={`out-${column.name}`}>
                  {t('relationOut', {
                    column: columnTitle(column),
                    table: target ? tableTitle(target) : (column.table ?? '')
                  })}{' '}
                  <span className="data-chip data-chip-muted">
                    {t(`onDelete_${column.onDelete ?? 'restrict'}`)}
                  </span>
                </li>
              );
            })}
            {incoming.map(({ table: other, column }) => (
              <li key={`in-${other.name}.${column.name}`}>
                {t('relationIn', {
                  table: tableTitle(other),
                  column: columnTitle(column)
                })}{' '}
                <span className="data-chip data-chip-muted">
                  {t(`onDelete_${column.onDelete ?? 'restrict'}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="data-card">
        <div className="data-card-header">
          <h3>{t('indexesTitle')}</h3>
        </div>
        <p className="data-card-muted">{t('indexesHelp')}</p>
        {indexes.length > 0 && (
          <ul className="data-plain-list">
            {indexes.map(({ column, kinds }) => (
              <li key={column.name}>
                <code>{column.name}</code> · {kinds.join(', ')}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!readOnly && (
        <section className="data-card data-card-danger">
          <div className="data-card-header">
            <div>
              <h3>{t('dropTableTitle')}</h3>
              <p className="data-card-muted">{t('dropTableHelp')}</p>
            </div>
            <UI.Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => setDropTableOpen(true)}
            >
              <DeleteOutlined />
              <span className="button-text">{t('dropTable')}</span>
            </UI.Button>
          </div>
        </section>
      )}

      <UI.Modal
        open={!!editing}
        title={editing?.column ? t('editColumnTitle') : t('addColumnTitle')}
        closeLabel={c('close')}
        width={560}
        onClose={() => !savingColumn && setEditing(null)}
        footer={
          <FooterActions>
            <UI.Button
              size="small"
              disabled={savingColumn}
              onClick={() => setEditing(null)}
            >
              {c('cancel')}
            </UI.Button>
            <UI.Button
              variant="contained"
              size="small"
              disabled={savingColumn || !editing?.draft.name.trim()}
              onClick={handleSaveColumn}
            >
              {savingColumn ? c('saving') : c('save')}
            </UI.Button>
          </FooterActions>
        }
      >
        {editing && (
          <DialogContent>
            <ColumnFields
              draft={editing.draft}
              tables={tables}
              disabled={savingColumn}
              onChange={draft => setEditing({ ...editing, draft })}
            />
            {changingType && (
              <p className="dialog-warning">{t('typeChangeWarning')}</p>
            )}
            {columnError && <p className="dialog-danger">{columnError}</p>}
          </DialogContent>
        )}
      </UI.Modal>

      <ConfirmName
        open={!!dropColumn}
        title={t('dropColumnTitle')}
        name={dropColumn?.name ?? ''}
        confirmText={t('dropColumn')}
        loading={dropping}
        onConfirm={handleDropColumn}
        onClose={() => setDropColumn(null)}
      >
        <p>
          {t('dropColumnText', {
            column: dropColumn ? columnTitle(dropColumn) : '',
            table: tableTitle(table)
          })}
        </p>
      </ConfirmName>

      <ConfirmName
        open={dropTableOpen}
        title={t('dropTableTitle')}
        name={table.name}
        confirmText={t('dropTable')}
        loading={dropping}
        onConfirm={handleDropTable}
        onClose={() => setDropTableOpen(false)}
      >
        <p>{t('dropTableText', { table: tableTitle(table) })}</p>
        {incoming.length > 0 && (
          <p className="dialog-danger">
            {t('dropTableRelations', {
              tables: incoming.map(({ table: other }) => tableTitle(other)).join(', ')
            })}
          </p>
        )}
      </ConfirmName>
    </div>
  );
};
