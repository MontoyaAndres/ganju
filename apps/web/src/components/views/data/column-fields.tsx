import { UI } from '@ganju/ui';

import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';

import { tableTitle } from './api';
import { i18n } from '../../../lib';

import type {
  DataColumn,
  DataColumnInput,
  DataColumnType,
  DataOnDelete,
  DataTable
} from './types';

// The order types are offered in: the everyday ones first.
export const COLUMN_TYPES: DataColumnType[] = [
  'text',
  'long_text',
  'integer',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'enum',
  'relation',
  'email',
  'url',
  'phone',
  'json',
  'file'
];

const SEARCHABLE: DataColumnType[] = ['text', 'long_text', 'email', 'url', 'phone', 'enum'];
const UNIQUE: DataColumnType[] = ['text', 'email', 'url', 'phone', 'integer', 'decimal', 'date', 'datetime', 'enum', 'relation'];
// Relations and files are indexed on their own.
const FILTERABLE: DataColumnType[] = ['text', 'email', 'url', 'phone', 'integer', 'decimal', 'boolean', 'date', 'datetime', 'enum'];
const WITH_DEFAULT: DataColumnType[] = ['text', 'long_text', 'integer', 'decimal', 'boolean', 'date', 'datetime', 'enum', 'email', 'url', 'phone'];

// A column as its form holds it: every field as typed.
export interface ColumnDraft {
  name: string;
  type: DataColumnType;
  label: string;
  description: string;
  required: boolean;
  unique: boolean;
  filterable: boolean;
  searchable: boolean;
  values: string;
  table: string;
  onDelete: DataOnDelete;
  min: string;
  defaultValue: string;
}

export const emptyDraft = (type: DataColumnType = 'text'): ColumnDraft => ({
  name: '',
  type,
  label: '',
  description: '',
  required: false,
  unique: false,
  filterable: false,
  searchable: false,
  values: '',
  table: '',
  onDelete: 'restrict',
  min: '',
  defaultValue: ''
});

export const draftFromColumn = (
  column: DataColumn | DataColumnInput
): ColumnDraft => ({
  name: column.name,
  type: column.type,
  label: column.label ?? '',
  description: column.description ?? '',
  required: !!column.required,
  unique: !!column.unique,
  filterable: !!column.filterable,
  searchable: !!column.searchable,
  values: (column.values ?? []).join(', '),
  table: column.table ?? '',
  onDelete: column.onDelete ?? 'restrict',
  min: column.min === null || column.min === undefined ? '' : String(column.min),
  defaultValue:
    column.default === null || column.default === undefined
      ? ''
      : String(column.default)
});

const defaultOf = (draft: ColumnDraft) => {
  const text = draft.defaultValue.trim();
  if (!text || !WITH_DEFAULT.includes(draft.type) || draft.unique) return undefined;
  if (draft.type === 'integer' || draft.type === 'decimal') {
    const n = Number(text);
    return Number.isFinite(n) ? n : text;
  }
  if (draft.type === 'boolean') return text === 'true';
  return text;
};

// What the API takes for a new column. Flags a type can't have are dropped
// here rather than refused there.
export const inputFromDraft = (draft: ColumnDraft): DataColumnInput => {
  const input: DataColumnInput = {
    name: draft.name.trim(),
    type: draft.type
  };
  if (draft.label.trim()) input.label = draft.label.trim();
  if (draft.description.trim()) input.description = draft.description.trim();
  if (draft.required) input.required = true;
  if (draft.unique && UNIQUE.includes(draft.type)) input.unique = true;
  if (draft.filterable && FILTERABLE.includes(draft.type)) input.filterable = true;
  if (draft.searchable && SEARCHABLE.includes(draft.type)) input.searchable = true;
  if (draft.type === 'enum') {
    input.values = draft.values
      .split(/[,\n]/)
      .map(v => v.trim())
      .filter(Boolean);
  }
  if (draft.type === 'relation') {
    input.table = draft.table;
    input.onDelete = draft.onDelete;
  }
  if ((draft.type === 'integer' || draft.type === 'decimal') && draft.min.trim()) {
    const min = Number(draft.min);
    if (Number.isFinite(min)) input.min = min;
  }
  const value = defaultOf(draft);
  if (value !== undefined) input.default = value;
  return input;
};

// Only what changed, for PATCH. A null puts a setting back to its default.
export const patchFromDraft = (
  before: DataColumn,
  draft: ColumnDraft
): Record<string, unknown> => {
  const next = inputFromDraft(draft);
  const patch: Record<string, unknown> = {};
  if (next.name !== before.name) patch.name = next.name;
  if (next.type !== before.type) patch.type = next.type;
  if ((next.label ?? null) !== before.label) patch.label = next.label ?? null;
  if ((next.description ?? null) !== before.description) {
    patch.description = next.description ?? null;
  }
  for (const flag of ['required', 'unique', 'filterable', 'searchable'] as const) {
    if (!!next[flag] !== before[flag]) patch[flag] = !!next[flag];
  }
  if (
    next.type === 'enum' &&
    JSON.stringify(next.values ?? []) !== JSON.stringify(before.values ?? [])
  ) {
    patch.values = next.values;
  }
  if (next.type === 'relation') {
    if (next.table !== before.table) patch.table = next.table;
    // A relation saved without one restricts.
    if (next.onDelete !== (before.onDelete ?? 'restrict')) {
      patch.onDelete = next.onDelete;
    }
  }
  if ((next.min ?? null) !== (before.min ?? null)) patch.min = next.min ?? null;
  // No default and a null default are the same thing.
  if ((next.default ?? null) !== (before.default ?? null)) {
    patch.default = next.default ?? null;
  }
  return patch;
};

interface ColumnFieldsProps {
  draft: ColumnDraft;
  onChange: (draft: ColumnDraft) => void;
  tables: DataTable[];
  disabled?: boolean;
  // Name, type and required only; the rest behind "More options".
  compact?: boolean;
}

export const ColumnFields = ({
  draft,
  onChange,
  tables,
  disabled,
  compact
}: ColumnFieldsProps) => {
  const t = i18n.useT(i18n.copy.DATA);
  const set = <K extends keyof ColumnDraft>(key: K, value: ColumnDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const typeOptions = COLUMN_TYPES.map(type => ({
    label: t(`type_${type}`),
    value: type
  }));

  const flag = (
    key: 'required' | 'unique' | 'filterable' | 'searchable',
    label: string,
    help: string
  ) => (
    <FormControlLabel
      key={key}
      className="column-flag"
      control={
        <Checkbox
          size="small"
          checked={draft[key]}
          disabled={disabled}
          onChange={e => set(key, e.target.checked)}
        />
      }
      label={
        <span>
          {label}
          <small>{help}</small>
        </span>
      }
    />
  );

  return (
    <div className={`column-fields ${compact ? 'compact' : ''}`}>
      <div className="column-fields-row">
        <UI.Input
          size="small"
          label={t('columnName')}
          placeholder="price"
          value={draft.name}
          disabled={disabled}
          onChange={e => set('name', e.target.value)}
        />
        <UI.Select
          size="small"
          label={t('columnType')}
          value={draft.type}
          disabled={disabled}
          onChange={e => set('type', e.target.value as DataColumnType)}
          options={typeOptions}
        />
      </div>
      {draft.type === 'enum' && (
        <UI.Input
          size="small"
          label={t('columnValues')}
          placeholder="small, medium, large"
          helperText={t('columnValuesHelp')}
          value={draft.values}
          disabled={disabled}
          onChange={e => set('values', e.target.value)}
        />
      )}
      {draft.type === 'relation' && (
        <div className="column-fields-row">
          <UI.Select
            size="small"
            label={t('columnTarget')}
            value={draft.table}
            disabled={disabled}
            onChange={e => set('table', e.target.value)}
            options={tables.map(table => ({
              label: tableTitle(table),
              value: table.name
            }))}
          />
          <UI.Select
            size="small"
            label={t('columnOnDelete')}
            value={draft.onDelete}
            disabled={disabled}
            onChange={e => set('onDelete', e.target.value as DataOnDelete)}
            options={[
              { label: t('onDelete_restrict'), value: 'restrict' },
              { label: t('onDelete_cascade'), value: 'cascade' },
              { label: t('onDelete_set_null'), value: 'set_null' }
            ]}
          />
        </div>
      )}
      {!compact && (
        <>
          <div className="column-fields-row">
            <UI.Input
              size="small"
              label={t('columnLabel')}
              placeholder={t('columnLabelPlaceholder')}
              value={draft.label}
              disabled={disabled}
              onChange={e => set('label', e.target.value)}
            />
            {WITH_DEFAULT.includes(draft.type) && !draft.unique && (
              <UI.Input
                size="small"
                label={t('columnDefault')}
                helperText={t('columnDefaultHelp')}
                value={draft.defaultValue}
                disabled={disabled}
                onChange={e => set('defaultValue', e.target.value)}
              />
            )}
          </div>
          <UI.Input
            size="small"
            label={t('columnDescription')}
            helperText={t('columnDescriptionHelp')}
            value={draft.description}
            disabled={disabled}
            onChange={e => set('description', e.target.value)}
          />
          {(draft.type === 'integer' || draft.type === 'decimal') && (
            <UI.Input
              size="small"
              type="number"
              label={t('columnMin')}
              helperText={t('columnMinHelp')}
              value={draft.min}
              disabled={disabled}
              onChange={e => set('min', e.target.value)}
            />
          )}
        </>
      )}
      <div className="column-flags">
        {flag('required', t('flagRequired'), t('flagRequiredHelp'))}
        {!compact &&
          UNIQUE.includes(draft.type) &&
          flag('unique', t('flagUnique'), t('flagUniqueHelp'))}
        {!compact &&
          FILTERABLE.includes(draft.type) &&
          flag('filterable', t('flagFilterable'), t('flagFilterableHelp'))}
        {!compact &&
          SEARCHABLE.includes(draft.type) &&
          flag('searchable', t('flagSearchable'), t('flagSearchableHelp'))}
      </div>
    </div>
  );
};
