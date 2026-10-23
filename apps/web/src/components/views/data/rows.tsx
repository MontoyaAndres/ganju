import { useEffect, useMemo, useRef, useState } from 'react';
import { UI } from '@ganju/ui';

import IconButton from '@mui/material/IconButton';
import {
  Add,
  DeleteOutlined,
  Refresh,
  SearchOutlined,
  UploadFileOutlined
} from '@mui/icons-material';
import {
  DataGrid,
  getGridBooleanOperators,
  getGridDateOperators,
  getGridNumericOperators,
  getGridSingleSelectOperators,
  getGridStringOperators,
  type GridColDef,
  type GridFilterModel,
  type GridPaginationModel,
  type GridRowSelectionModel,
  type GridSingleSelectColDef,
  type GridSortModel
} from '@mui/x-data-grid';
import { esES } from '@mui/x-data-grid/locales';

import { FooterActions } from './styles';
import { RowPanel, DeleteImpact, useDeleteImpact } from './row-panel';
import {
  browserTimeZone,
  columnTitle,
  dataRequest,
  isFilterable,
  isRelationValue
} from './api';
import { i18n } from '../../../lib';

import type { DataColumn, DataRow, DataTable, RowPage } from './types';

interface RowsTabProps {
  base: string;
  table: DataTable;
  tables: DataTable[];
  readOnly: boolean;
  onCount: (count: number) => void;
  onImport: () => void;
}

const PAGE_SIZES = [25, 50, 100];
const EMPTY_SELECTION: GridRowSelectionModel = {
  type: 'include',
  ids: new Set()
};

const STRING_OPERATORS = ['contains', 'equals', 'startsWith', 'isEmpty', 'isNotEmpty'];
const NUMBER_OPERATORS = ['=', '!=', '>', '>=', '<', '<=', 'isEmpty', 'isNotEmpty'];
const DATE_OPERATORS = ['is', 'not', 'after', 'onOrAfter', 'before', 'onOrBefore', 'isEmpty', 'isNotEmpty'];
const DATETIME_OPERATORS = ['after', 'onOrAfter', 'before', 'onOrBefore', 'isEmpty', 'isNotEmpty'];

const pad = (n: number) => String(n).padStart(2, '0');
// The grid's date filter is `new Date("2024-05-01")`, UTC midnight: read in
// local time it is the day before anywhere west of UTC (Bogotá).
const filterDate = (date: Date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

// The grid's filter as a `where` the API takes, or undefined when it has no
// value yet (a half-typed filter shouldn't empty the grid).
const whereFromFilter = (
  model: GridFilterModel,
  table: DataTable
): Record<string, unknown> | undefined => {
  const item = model.items[0];
  if (!item) return undefined;
  const column =
    table.columns.find(c => c.name === item.field) ??
    (item.field === 'id' ? ({ type: 'integer' } as DataColumn) : undefined);
  if (!column) return undefined;
  const field = item.field;
  if (item.operator === 'isEmpty') return { [field]: { isNull: true } };
  if (item.operator === 'isNotEmpty') return { [field]: { isNull: false } };
  const raw = item.value;
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = (() => {
    if (column.type === 'date' && raw instanceof Date) return filterDate(raw);
    if (column.type === 'datetime' && raw instanceof Date)
      return raw.toISOString();
    if (
      column.type === 'integer' ||
      column.type === 'decimal' ||
      column.type === 'relation'
    ) {
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    if (column.type === 'boolean') return raw === true || raw === 'true';
    return raw;
  })();
  if (value === undefined) return undefined;
  const op = (
    {
      contains: 'contains',
      startsWith: 'startsWith',
      equals: 'eq',
      is: 'eq',
      not: 'ne',
      '=': 'eq',
      '!=': 'ne',
      '>': 'gt',
      after: 'gt',
      '>=': 'gte',
      onOrAfter: 'gte',
      '<': 'lt',
      before: 'lt',
      '<=': 'lte',
      onOrBefore: 'lte',
      isAnyOf: 'in'
    } as Record<string, string>
  )[item.operator];
  if (!op) return undefined;
  if (op === 'in') {
    return Array.isArray(value) && value.length
      ? { [field]: { in: value.slice(0, 50) } }
      : undefined;
  }
  return { [field]: { [op]: value } };
};

export const RowsTab = ({
  base,
  table,
  tables,
  readOnly,
  onCount,
  onImport
}: RowsTabProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const tablePath = `/table/${encodeURIComponent(table.name)}`;
  const searchable = table.columns.some(column => column.searchable);

  const [rows, setRows] = useState<DataRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 25
  });
  const [sortModel, setSortModel] = useState<GridSortModel>([]);
  const [filterModel, setFilterModel] = useState<GridFilterModel>({
    items: []
  });
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selection, setSelection] =
    useState<GridRowSelectionModel>(EMPTY_SELECTION);
  const [openRow, setOpenRow] = useState<DataRow | 'new' | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reload, setReload] = useState(0);
  // A page cut short at the size limit has fewer rows than the page size,
  // so `total` no longer says how many pages there are: the grid then just
  // offers the next page while there is one.
  const [shortPages, setShortPages] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  // The cursor each page starts at: the API pages by cursor, the grid by
  // number. Reset whenever the query itself changes.
  const cursors = useRef<Record<number, string>>({});

  const where = useMemo(
    () => whereFromFilter(filterModel, table),
    [filterModel, table]
  );
  const sort = sortModel[0]
    ? `${sortModel[0].sort === 'desc' ? '-' : ''}${sortModel[0].field}`
    : undefined;
  const querySignature = JSON.stringify([where, sort, query, pagination.pageSize]);
  const columnSignature = table.columns.map(col => col.name).join(',');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    cursors.current = {};
    setShortPages(false);
    setPagination(prev => (prev.page === 0 ? prev : { ...prev, page: 0 }));
  }, [querySignature]);

  useEffect(() => {
    const controller = new AbortController();
    const page = pagination.page;
    const cursor = page === 0 ? undefined : cursors.current[page];
    if (page > 0 && !cursor) {
      setPagination(prev => ({ ...prev, page: 0 }));
      return;
    }
    setLoading(true);
    setError(null);
    dataRequest<RowPage>(base, `${tablePath}/row`, {
      signal: controller.signal,
      query: {
        limit: pagination.pageSize,
        cursor,
        sort,
        q: query || undefined,
        where: where ? JSON.stringify(where) : undefined,
        timeZone: browserTimeZone()
      }
    })
      .then(result => {
        if (controller.signal.aborted) return;
        setLoading(false);
        if (!result.ok) {
          setError(result.error || t('rowsLoadFailed'));
          setRows([]);
          return;
        }
        setRows(result.data.rows);
        if (result.data.nextCursor) {
          cursors.current[page + 1] = result.data.nextCursor;
          if (result.data.rows.length < pagination.pageSize) setShortPages(true);
        }
        setHasNextPage(!!result.data.nextCursor);
        if (result.data.total !== undefined) {
          setTotal(result.data.total);
          if (!where && !query) onCount(result.data.total);
        }
      })
      .catch(() => {
        // aborted
      });
    return () => controller.abort();
  }, [pagination.page, querySignature, reload, columnSignature]);

  const refresh = () => {
    cursors.current = {};
    setShortPages(false);
    if (pagination.page === 0) setReload(n => n + 1);
    else setPagination(prev => ({ ...prev, page: 0 }));
  };

  const selectedIds = useMemo(
    () => [...selection.ids].map(Number).filter(id => Number.isFinite(id)),
    [selection]
  );
  const impact = useDeleteImpact(
    base,
    tables,
    table,
    bulkConfirm ? selectedIds : []
  );

  const handleBulkDelete = async () => {
    if (deleting || selectedIds.length === 0) return;
    setDeleting(true);
    const chunks: number[][] = [];
    for (let i = 0; i < selectedIds.length; i += 50) {
      chunks.push(selectedIds.slice(i, i + 50));
    }
    const result = await dataRequest(base, '/write', {
      method: 'POST',
      body: {
        operations: chunks.map(ids => ({
          op: 'delete',
          table: table.name,
          where: { id: { in: ids } }
        }))
      }
    });
    setDeleting(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastDeleteRowsFailed'));
      return;
    }
    setBulkConfirm(false);
    setSelection(EMPTY_SELECTION);
    snackbar.success(t.plural('toastRowsDeleted', selectedIds.length));
    refresh();
  };

  const columns = useMemo<GridColDef[]>(() => {
    const defs: GridColDef[] = [
      {
        field: 'id',
        headerName: 'id',
        type: 'number',
        width: 80,
        // An id, not a quantity: no thousands separator.
        valueFormatter: (value: unknown) => String(value ?? ''),
        filterOperators: getGridNumericOperators().filter(op =>
          NUMBER_OPERATORS.includes(op.value)
        )
      }
    ];
    for (const column of table.columns) {
      const def: GridColDef = {
        field: column.name,
        headerName: columnTitle(column),
        description: column.description ?? undefined,
        minWidth: 120,
        flex: column.type === 'long_text' || column.type === 'json' ? 2 : 1,
        sortable: column.type !== 'json' && column.type !== 'long_text',
        filterable: isFilterable(column)
      };
      switch (column.type) {
        case 'integer':
        case 'decimal':
          def.type = 'number';
          def.valueFormatter = (value: unknown) =>
            typeof value === 'number' ? t.n(value) : '';
          def.filterOperators = getGridNumericOperators().filter(op =>
            NUMBER_OPERATORS.includes(op.value)
          );
          break;
        case 'boolean':
          def.type = 'boolean';
          def.filterOperators = getGridBooleanOperators();
          break;
        case 'date':
          def.type = 'date';
          def.valueGetter = (value: unknown) =>
            typeof value === 'string' ? new Date(`${value}T00:00:00`) : null;
          def.valueFormatter = (value: unknown) =>
            value instanceof Date ? t.date(value, { dateStyle: 'medium' }) : '';
          def.filterOperators = getGridDateOperators().filter(op =>
            DATE_OPERATORS.includes(op.value)
          );
          break;
        case 'datetime':
          def.type = 'dateTime';
          def.valueGetter = (value: unknown) =>
            typeof value === 'string' ? new Date(value) : null;
          def.valueFormatter = (value: unknown) =>
            value instanceof Date
              ? t.date(value, { dateStyle: 'medium', timeStyle: 'short' })
              : '';
          def.filterOperators = getGridDateOperators(true).filter(op =>
            DATETIME_OPERATORS.includes(op.value)
          );
          break;
        case 'enum':
          def.type = 'singleSelect';
          (def as GridSingleSelectColDef).valueOptions = column.values ?? [];
          def.filterOperators = getGridSingleSelectOperators();
          break;
        case 'relation':
          def.valueGetter = (value: unknown) =>
            isRelationValue(value) ? value.id : null;
          def.renderCell = params => {
            const value = params.row[column.name];
            if (!isRelationValue(value)) return '';
            return (
              <span className="data-cell-relation">
                {value.label !== null && value.label !== undefined
                  ? String(value.label)
                  : `#${value.id}`}
              </span>
            );
          };
          def.filterOperators = getGridNumericOperators().filter(op =>
            ['=', '!=', 'isEmpty', 'isNotEmpty'].includes(op.value)
          );
          break;
        case 'json':
          def.valueFormatter = (value: unknown) =>
            value === null || value === undefined ? '' : JSON.stringify(value);
          break;
        default:
          def.filterOperators = getGridStringOperators().filter(op =>
            STRING_OPERATORS.includes(op.value)
          );
      }
      defs.push(def);
    }
    defs.push({
      field: 'updated_at',
      headerName: t('columnUpdated'),
      type: 'dateTime',
      width: 170,
      filterable: false,
      valueGetter: (value: unknown) =>
        typeof value === 'string' ? new Date(value) : null,
      valueFormatter: (value: unknown) =>
        value instanceof Date
          ? t.date(value, { dateStyle: 'medium', timeStyle: 'short' })
          : ''
    });
    return defs;
  }, [table, t]);

  const localeText = {
    ...(t.lang === 'es'
      ? esES.components.MuiDataGrid.defaultProps.localeText
      : {}),
    // Short pages make "26–50" untrue: say which page instead.
    ...(shortPages
      ? {
          paginationDisplayedRows: () =>
            t('pageNumber', { page: pagination.page + 1 })
        }
      : {})
  };

  return (
    <div className="data-rows">
      <div className="data-rows-toolbar">
        {searchable && (
          <div className="data-rows-search">
            <SearchOutlined />
            <input
              type="search"
              value={search}
              placeholder={t('searchRows')}
              aria-label={t('searchRows')}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}
        <div className="data-rows-actions">
          {selectedIds.length > 0 && !readOnly && (
            <UI.Button
              size="small"
              className="data-danger-text"
              onClick={() => setBulkConfirm(true)}
            >
              <DeleteOutlined />
              <span className="button-text">
                {t.plural('deleteSelected', selectedIds.length)}
              </span>
            </UI.Button>
          )}
          <IconButton
            size="small"
            aria-label={t('refresh')}
            title={t('refresh')}
            onClick={refresh}
          >
            <Refresh />
          </IconButton>
          <UI.Button size="small" disabled={readOnly} onClick={onImport}>
            <UploadFileOutlined />
            <span className="button-text">{t('import')}</span>
          </UI.Button>
          <UI.Button
            variant="contained"
            size="small"
            disabled={readOnly}
            onClick={() => setOpenRow('new')}
          >
            <Add />
            <span className="button-text">{t('newRow')}</span>
          </UI.Button>
        </div>
      </div>
      {error && <p className="data-inline-error">{error}</p>}
      <div className="data-grid">
        <DataGrid
          rows={rows}
          columns={columns}
          rowCount={shortPages ? -1 : total}
          paginationMeta={{ hasNextPage }}
          loading={loading}
          paginationMode="server"
          sortingMode="server"
          filterMode="server"
          paginationModel={pagination}
          onPaginationModelChange={model => {
            if (model.pageSize !== pagination.pageSize) {
              setPagination({ page: 0, pageSize: model.pageSize });
            } else {
              setPagination(model);
            }
          }}
          pageSizeOptions={PAGE_SIZES}
          sortModel={sortModel}
          onSortModelChange={setSortModel}
          filterModel={filterModel}
          onFilterModelChange={setFilterModel}
          checkboxSelection={!readOnly}
          keepNonExistentRowsSelected={false}
          rowSelectionModel={selection}
          onRowSelectionModelChange={setSelection}
          disableRowSelectionOnClick
          onRowClick={params => setOpenRow(params.row as DataRow)}
          localeText={localeText}
          density="compact"
        />
      </div>
      {openRow && (
        <RowPanel
          base={base}
          table={table}
          tables={tables}
          row={openRow === 'new' ? null : openRow}
          readOnly={readOnly}
          onClose={() => setOpenRow(null)}
          onSaved={saved => {
            // An edit stays where it is; a new row needs the page read again.
            if (openRow === 'new') refresh();
            else {
              setRows(prev =>
                prev.map(row => (row.id === saved.id ? saved : row))
              );
            }
            setOpenRow(saved);
          }}
          onDeleted={() => {
            setOpenRow(null);
            refresh();
          }}
        />
      )}
      <UI.Modal
        open={bulkConfirm}
        title={t.plural('deleteRowsTitle', selectedIds.length)}
        closeLabel={c('close')}
        onClose={() => !deleting && setBulkConfirm(false)}
        footer={
          <FooterActions>
            <UI.Button
              size="small"
              disabled={deleting}
              onClick={() => setBulkConfirm(false)}
            >
              {c('cancel')}
            </UI.Button>
            <UI.Button
              variant="contained"
              size="small"
              color="error"
              disabled={deleting || impact.blocked || impact.loading}
              onClick={handleBulkDelete}
            >
              {deleting ? c('deleting') : t('deleteRowsAction')}
            </UI.Button>
          </FooterActions>
        }
      >
        <DeleteImpact impact={impact} />
      </UI.Modal>
    </div>
  );
};
