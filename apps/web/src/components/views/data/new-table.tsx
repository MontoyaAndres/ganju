import { useEffect, useState } from 'react';
import { UI } from '@ganju/ui';
import { identifierIssue } from '@ganju/utils/dataImport';

import IconButton from '@mui/material/IconButton';
import { Add, RemoveCircleOutlined, TuneOutlined } from '@mui/icons-material';

import { DialogContent, FooterActions } from './styles';
import { ColumnFields, emptyDraft, inputFromDraft, type ColumnDraft } from './column-fields';
import { dataRequest } from './api';
import { i18n } from '../../../lib';

import type { DataTable } from './types';

interface NewTableDialogProps {
  open: boolean;
  base: string;
  tables: DataTable[];
  onClose: () => void;
  onCreated: (table: DataTable) => void;
}

const starterColumns = (): ColumnDraft[] => [{ ...emptyDraft(), name: 'name', required: true, searchable: true }];

export const NewTableDialog = ({
  open,
  base,
  tables,
  onClose,
  onCreated
}: NewTableDialogProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState<ColumnDraft[]>(starterColumns);
  // Which column shows every option.
  const [expanded, setExpanded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setLabel('');
    setDescription('');
    setColumns(starterColumns());
    setExpanded(null);
    setError(null);
  }, [open]);

  const nameIssue = !name.trim()
    ? null
    : identifierIssue(name.trim(), 'table')
      ? t('identifierInvalid')
      : tables.some(table => table.name === name.trim())
        ? t('tableNameTaken', { name: name.trim() })
        : null;

  const handleCreate = async () => {
    if (saving) return;
    setError(null);
    const body = {
      name: name.trim(),
      ...(label.trim() ? { label: label.trim() } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
      columns: columns.filter(col => col.name.trim()).map(inputFromDraft)
    };
    setSaving(true);
    const result = await dataRequest<{ table: DataTable }>(base, '/table', {
      method: 'POST',
      body
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error || t('toastCreateTableFailed'));
      return;
    }
    snackbar.success(t('toastTableCreated'));
    onCreated(result.data.table);
  };

  return (
    <UI.Modal
      open={open}
      title={t('newTableTitle')}
      closeLabel={c('close')}
      width={640}
      onClose={() => !saving && onClose()}
      footer={
        <FooterActions>
          <UI.Button size="small" disabled={saving} onClick={onClose}>
            {c('cancel')}
          </UI.Button>
          <UI.Button
            variant="contained"
            size="small"
            disabled={saving || !name.trim() || !!nameIssue}
            onClick={handleCreate}
          >
            {saving ? c('creating') : c('create')}
          </UI.Button>
        </FooterActions>
      }
    >
      <DialogContent>
        <div className="dialog-row">
          <UI.Input
            size="small"
            autoFocus
            label={t('tableName')}
            placeholder="menu"
            value={name}
            disabled={saving}
            error={!!nameIssue}
            helperText={nameIssue || t('tableNameHelp')}
            onChange={e => setName(e.target.value)}
          />
          <UI.Input
            size="small"
            label={t('tableLabel')}
            placeholder={t('tableLabelPlaceholder')}
            value={label}
            disabled={saving}
            onChange={e => setLabel(e.target.value)}
          />
        </div>
        <UI.Input
          size="small"
          label={t('tableDescription')}
          helperText={t('tableDescriptionHelp')}
          value={description}
          disabled={saving}
          onChange={e => setDescription(e.target.value)}
        />
        <h4 className="dialog-subtitle">{t('columnsTitle')}</h4>
        <p className="dialog-muted">{t('newTableColumnsHelp')}</p>
        <div className="dialog-columns">
          {columns.map((draft, index) => (
            <div key={index} className="dialog-column">
              <div className="dialog-column-header">
                <span className="dialog-column-title">
                  {draft.name.trim() || t('columnNumber', { n: index + 1 })}
                </span>
                <div className="dialog-column-actions">
                  <UI.Button
                    size="small"
                    className={expanded === index ? 'active' : ''}
                    aria-expanded={expanded === index}
                    onClick={() =>
                      setExpanded(prev => (prev === index ? null : index))
                    }
                  >
                    <TuneOutlined />
                    <span className="button-text">
                      {expanded === index ? t('fewerOptions') : t('moreOptions')}
                    </span>
                  </UI.Button>
                  <IconButton
                    size="small"
                    aria-label={t('removeColumn')}
                    title={t('removeColumn')}
                    disabled={saving}
                    onClick={() =>
                      setColumns(prev => prev.filter((_, i) => i !== index))
                    }
                  >
                    <RemoveCircleOutlined fontSize="small" />
                  </IconButton>
                </div>
              </div>
              <ColumnFields
                draft={draft}
                tables={tables}
                disabled={saving}
                compact={expanded !== index}
                onChange={next =>
                  setColumns(prev =>
                    prev.map((col, i) => (i === index ? next : col))
                  )
                }
              />
            </div>
          ))}
        </div>
        <div>
          <UI.Button
            size="small"
            disabled={saving}
            onClick={() => {
              setColumns(prev => [...prev, emptyDraft()]);
              setExpanded(null);
            }}
          >
            <Add />
            <span className="button-text">{t('addColumn')}</span>
          </UI.Button>
        </div>
        {error && <p className="dialog-danger">{error}</p>}
      </DialogContent>
    </UI.Modal>
  );
};
