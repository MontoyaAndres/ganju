import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { UI } from '@ganju/ui';

import IconButton from '@mui/material/IconButton';
import {
  Add,
  ArrowBack,
  LockOutlined,
  SettingsOutlined,
  StorageOutlined,
  TableChartOutlined,
  UploadFileOutlined
} from '@mui/icons-material';

import { Wrapper } from './styles';
import { SchemaTab } from './schema';
import { NewTableDialog } from './new-table';
import { ImportDialog } from './import';
import { SettingsDialog, ExportControl } from './settings';
import { dataRequest, tableTitle } from './api';
import { i18n } from '../../../lib';

import type { Plan } from '../../../utils';
import type { Database, DataTable, RowPage } from './types';

// How often a database still being set up is checked again.
const CREATING_POLL_MS = 3000;

// The grid is the heaviest thing on the page; every view shares one bundle,
// so it loads only when a table's rows are shown.
const RowsTab = dynamic(() => import('./rows').then(m => m.RowsTab), {
  ssr: false,
  loading: () => <UI.Skeleton variant="rounded" height={360} />
});

interface DataProps {
  plan: Plan | null;
}

type Tab = 'rows' | 'schema';

type ImportTarget = { mode: 'new' } | { mode: 'existing'; table: string };

export const Data = ({ plan }: DataProps) => {
  const router = useRouter();
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const { id: organizationId, projectId } = router.query as {
    id: string;
    projectId: string;
  };
  const base = `/organization/${organizationId}/project/${projectId}/artifact/data`;
  // Optimistic when the plan could not be resolved: the API still enforces it.
  const canUseData = plan?.limits.canUseData !== false;

  const [database, setDatabase] = useState<Database | null>(null);
  const [tables, setTables] = useState<DataTable[]>([]);
  const [status, setStatus] = useState<
    'idle' | 'pending' | 'resolved' | 'rejected'
  >('idle');
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('rows');
  const [tableSearch, setTableSearch] = useState('');
  const [rowCounts, setRowCounts] = useState<Record<string, number>>({});
  // Bumped after an import, so the open table reads its rows again.
  const [rowsVersion, setRowsVersion] = useState(0);
  const [newTableOpen, setNewTableOpen] = useState(false);
  const [importTarget, setImportTarget] = useState<ImportTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // The bookmark a drop answered with: restoring to it undoes the drop.
  const [undo, setUndo] = useState<{ message: string; bookmark: string } | null>(
    null
  );
  const [undoConfirm, setUndoConfirm] = useState(false);
  // Until the first list of tables arrives, the page can't tell "no tables"
  // from "not loaded yet".
  const [tablesLoading, setTablesLoading] = useState(false);
  const [replaceConfirm, setReplaceConfirm] = useState(false);

  const readOnly = !!database && !canUseData;
  const ready = database?.status === 'READY';
  const selectedTable = tables.find(table => table.name === selected) ?? null;

  // Each table's row count for the menu, read in the background.
  const loadCounts = async (list: DataTable[]) => {
    const entries = await Promise.all(
      list.map(async table => {
        const result = await dataRequest<RowPage>(
          base,
          `/table/${encodeURIComponent(table.name)}/row`,
          { query: { limit: 1 } }
        );
        return [table.name, result.ok ? result.data.total : undefined] as const;
      })
    );
    setRowCounts(
      Object.fromEntries(
        entries.filter((entry): entry is readonly [string, number] =>
          entry[1] !== undefined
        )
      )
    );
  };

  const loadTables = async () => {
    setTablesLoading(true);
    const result = await dataRequest<{ tables: DataTable[] }>(base, '/table');
    setTablesLoading(false);
    if (!result.ok) return null;
    setTables(result.data.tables);
    loadCounts(result.data.tables);
    setSelected(prev =>
      prev && result.data.tables.some(table => table.name === prev)
        ? prev
        : null
    );
    return result.data.tables;
  };

  const load = async (signal?: AbortSignal) => {
    if (!organizationId || !projectId) return;
    setStatus('pending');
    try {
      const result = await dataRequest<{ database: Database | null }>(
        base,
        '',
        { signal }
      );
      if (signal?.aborted) return;
      if (!result.ok) {
        setStatus('rejected');
        return;
      }
      const live = result.data.database?.status === 'READY';
      if (live) setTablesLoading(true);
      setDatabase(result.data.database);
      if (live) await loadTables();
      else setTables([]);
      // A restore or an undo changed rows the open table still shows.
      setRowsVersion(n => n + 1);
      setStatus('resolved');
    } catch {
      if (!signal?.aborted) setStatus('rejected');
    }
  };

  useEffect(() => {
    if (!organizationId || !projectId) return;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [organizationId, projectId]);

  // A create still running elsewhere (another tab, a slow init) finishes on
  // its own: check again until it is READY or FAILED.
  useEffect(() => {
    if (database?.status !== 'CREATING') return;
    const timer = setTimeout(() => load(), CREATING_POLL_MS);
    return () => clearTimeout(timer);
  }, [database]);

  // A narrow screen shows one pane at a time: the table list, or the open
  // table. On a wide one both stay up, so open the first table.
  useEffect(() => {
    if (selected || tables.length === 0) return;
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      setSelected(tables[0].name);
    }
  }, [tables]);

  const visibleTables = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();
    if (!query) return tables;
    return tables.filter(
      table =>
        table.name.includes(query) ||
        (table.label ?? '').toLowerCase().includes(query)
    );
  }, [tables, tableSearch]);

  // `replaceDeleted` starts over while a deleted database is still in its
  // grace period; that one can then no longer be restored. The new one keeps
  // its name.
  const handleCreateDatabase = async (replaceDeleted = false) => {
    if (creating) return;
    setCreating(true);
    // A replacement or a retry keeps the name the database already had.
    const name = createName.trim() || (database?.name ?? '');
    const result = await dataRequest<{ database: Database }>(base, '', {
      method: 'POST',
      body: {
        ...(name ? { name } : {}),
        ...(replaceDeleted ? { replaceDeleted: true } : {})
      }
    });
    setCreating(false);
    setReplaceConfirm(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastCreateDatabaseFailed'));
      return;
    }
    snackbar.success(t('toastDatabaseCreated'));
    setCreateName('');
    load();
  };

  const handleRestoreDeleted = async () => {
    if (restoring) return;
    setRestoring(true);
    const result = await dataRequest(base, '/restore', { method: 'POST' });
    setRestoring(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastRestoreFailed'));
      return;
    }
    snackbar.success(t('toastDatabaseRestored'));
    load();
  };

  const handleUndo = async () => {
    if (!undo || restoring) return;
    setRestoring(true);
    const result = await dataRequest(base, '/restore-point', {
      method: 'POST',
      body: { bookmark: undo.bookmark }
    });
    setRestoring(false);
    setUndoConfirm(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastRestoreFailed'));
      return;
    }
    setUndo(null);
    snackbar.success(t('toastUndone'));
    load();
  };

  // The answer already has the table: show it now, and read the list again
  // behind it rather than make the owner wait for the round trip.
  const handleTableCreated = (table: DataTable) => {
    setTables(prev => [...prev.filter(other => other.name !== table.name), table]);
    setRowCounts(prev => ({ ...prev, [table.name]: 0 }));
    setSelected(table.name);
    setTab('rows');
    loadTables();
  };

  const handleTableDropped = async (name: string, bookmark: string) => {
    setUndo({ message: t('undoTableDropped', { name }), bookmark });
    setSelected(null);
    await loadTables();
  };

  const handleColumnDropped = (
    table: string,
    column: string,
    bookmark: string
  ) => {
    setUndo({
      message: t('undoColumnDropped', { name: `${table}.${column}` }),
      bookmark
    });
  };

  const handleColumnTypeChanged = (
    table: string,
    column: string,
    bookmark: string
  ) => {
    setUndo({
      message: t('undoColumnChanged', { name: `${table}.${column}` }),
      bookmark
    });
  };

  const renderBanners = () => (
    <>
      {database?.status === 'DELETING' && (
        <div className="data-banner data-banner-danger">
          <div className="data-banner-text">
            <strong>{t('deletedBannerTitle')}</strong>
            <span>
              {t('deletedBannerText', {
                date: database.deleteAfter
                  ? t.date(database.deleteAfter, {
                      dateStyle: 'long',
                      timeStyle: 'short'
                    })
                  : '—'
              })}
            </span>
          </div>
          <div className="data-banner-actions">
            <ExportControl base={base} compact />
            <UI.Button
              size="small"
              variant="outlined"
              disabled={restoring || creating || !canUseData}
              onClick={() => setReplaceConfirm(true)}
            >
              <Add />
              <span className="button-text">
                {creating ? t('creatingDatabase') : t('createNewDatabase')}
              </span>
            </UI.Button>
            <UI.Button
              variant="contained"
              size="small"
              disabled={restoring || creating || readOnly}
              onClick={handleRestoreDeleted}
            >
              <span className="button-text">
                {restoring ? t('restoring') : t('restoreDatabase')}
              </span>
            </UI.Button>
          </div>
        </div>
      )}
      {readOnly && database && (
        <div className="data-banner data-banner-warning">
          <div className="data-banner-text">
            <strong>{t('readOnlyTitle')}</strong>
            <span>{t('readOnlyText')}</span>
          </div>
          <div className="data-banner-actions">
            <UI.Button
              variant="contained"
              size="small"
              onClick={() =>
                router.push(`/organization/${organizationId}/settings`)
              }
            >
              <span className="button-text">{t('upgrade')}</span>
            </UI.Button>
          </div>
        </div>
      )}
      {undo && (
        <div className="data-banner">
          <div className="data-banner-text">
            <span>{undo.message}</span>
          </div>
          <div className="data-banner-actions">
            <UI.Button
              size="small"
              disabled={restoring || readOnly}
              onClick={() => setUndoConfirm(true)}
            >
              <span className="button-text">{t('undo')}</span>
            </UI.Button>
            <UI.Button size="small" onClick={() => setUndo(null)}>
              <span className="button-text">{c('dismiss')}</span>
            </UI.Button>
          </div>
        </div>
      )}
    </>
  );

  const renderEmpty = () => {
    if (!canUseData) {
      return (
        <div className="data-locked">
          <div className="data-locked-badge">
            <LockOutlined fontSize="small" />
            <span>{t('lockedBadge')}</span>
          </div>
          <h3>{t('lockedTitle')}</h3>
          <p>{t('lockedText')}</p>
          <div className="data-when">
            <p>{t('whenData')}</p>
            <p>{t('whenResources')}</p>
          </div>
          <UI.Button
            variant="contained"
            onClick={() =>
              router.push(`/organization/${organizationId}/settings`)
            }
          >
            <span className="button-text">{t('upgrade')}</span>
          </UI.Button>
        </div>
      );
    }
    return (
      <div className="data-empty-state">
        <StorageOutlined />
        <h3>{t('emptyTitle')}</h3>
        <p>{t('emptyText')}</p>
        <div className="data-when">
          <p>{t('whenData')}</p>
          <p>{t('whenResources')}</p>
        </div>
        <div className="data-create">
          <UI.Input
            size="small"
            label={t('databaseNameLabel')}
            placeholder={t('databaseNamePlaceholder')}
            helperText={t('databaseNameHelp')}
            value={createName}
            disabled={creating}
            onChange={e => setCreateName(e.target.value)}
          />
          <UI.Button
            variant="contained"
            size="small"
            disabled={creating}
            onClick={() => handleCreateDatabase()}
          >
            <Add />
            <span className="button-text">
              {creating ? t('creatingDatabase') : t('createDatabase')}
            </span>
          </UI.Button>
        </div>
      </div>
    );
  };

  // The page's own shape, so nothing jumps when the tables arrive.
  const renderSkeleton = () => (
    <div className="data-layout data-layout-skeleton" aria-busy="true">
      <aside className="data-tables">
        <div className="data-tables-header">
          <UI.Skeleton variant="text" width={60} height={16} />
        </div>
        <div className="data-tables-items">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="data-table-item">
              <UI.Skeleton variant="rounded" width={18} height={18} />
              <UI.Skeleton variant="text" width={`${70 - i * 10}%`} height={18} />
            </div>
          ))}
        </div>
      </aside>
      <section className="data-main">
        <div className="data-main-header">
          <UI.Skeleton variant="text" width={160} height={28} />
        </div>
        <div className="data-skeleton-toolbar">
          <UI.Skeleton variant="rounded" width={280} height={36} />
          <UI.Skeleton variant="rounded" width={110} height={36} />
        </div>
        <div className="data-skeleton-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <UI.Skeleton key={i} variant="text" height={28} />
          ))}
        </div>
      </section>
    </div>
  );

  const renderNoTables = () => (
    <div className="data-empty-state">
      <TableChartOutlined />
      <h3>{t('noTablesTitle')}</h3>
      <p>{t('noTablesText')}</p>
      <div className="data-empty-actions">
        <UI.Button
          variant="contained"
          size="small"
          disabled={readOnly}
          onClick={() => setNewTableOpen(true)}
        >
          <Add />
          <span className="button-text">{t('newTable')}</span>
        </UI.Button>
        <UI.Button
          size="small"
          variant="outlined"
          disabled={readOnly}
          onClick={() => setImportTarget({ mode: 'new' })}
        >
          <UploadFileOutlined />
          <span className="button-text">{t('newTableFromFile')}</span>
        </UI.Button>
      </div>
      <p className="data-empty-hint">{t('noTablesHint')}</p>
    </div>
  );

  const renderTables = () => (
    <div
      className={`data-layout ${selectedTable ? 'has-selection' : ''}`}
    >
      <aside className="data-tables">
        <div className="data-tables-header">
          <span className="data-tables-title">{t('tables')}</span>
          <div className="data-tables-actions">
            <IconButton
              size="small"
              title={t('newTableFromFile')}
              aria-label={t('newTableFromFile')}
              disabled={readOnly}
              onClick={() => setImportTarget({ mode: 'new' })}
            >
              <UploadFileOutlined />
            </IconButton>
            <IconButton
              size="small"
              title={t('newTable')}
              aria-label={t('newTable')}
              disabled={readOnly}
              onClick={() => setNewTableOpen(true)}
            >
              <Add />
            </IconButton>
          </div>
        </div>
        <div className="data-tables-search">
          <UI.Input
            size="small"
            placeholder={t('searchTables')}
            value={tableSearch}
            onChange={e => setTableSearch(e.target.value)}
          />
        </div>
        <div className="data-tables-items">
          {visibleTables.map(table => (
            <button
              key={table.name}
              type="button"
              className={`data-table-item ${selected === table.name ? 'active' : ''}`}
              onClick={() => {
                setSelected(table.name);
                setTab('rows');
              }}
            >
              <TableChartOutlined />
              <span className="data-table-item-name">{tableTitle(table)}</span>
              {rowCounts[table.name] !== undefined && (
                <span className="data-table-item-count">
                  {t.n(rowCounts[table.name])}
                </span>
              )}
            </button>
          ))}
          {tables.length > 0 && visibleTables.length === 0 && (
            <p className="data-tables-none">{t('noTablesMatch')}</p>
          )}
        </div>
      </aside>
      <section className="data-main">
        {selectedTable ? (
          <>
            <div className="data-main-header">
              <IconButton
                className="data-back-btn"
                size="small"
                aria-label={c('close')}
                onClick={() => setSelected(null)}
              >
                <ArrowBack />
              </IconButton>
              <div className="data-main-title">
                <h2>{tableTitle(selectedTable)}</h2>
                {selectedTable.label && <code>{selectedTable.name}</code>}
              </div>
              <div className="data-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'rows'}
                  className={`data-tab ${tab === 'rows' ? 'active' : ''}`}
                  onClick={() => setTab('rows')}
                >
                  {t('tabRows')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'schema'}
                  className={`data-tab ${tab === 'schema' ? 'active' : ''}`}
                  onClick={() => setTab('schema')}
                >
                  {t('tabSchema')}
                </button>
              </div>
            </div>
            {selectedTable.description && (
              <p className="data-main-description">
                {selectedTable.description}
              </p>
            )}
            {tab === 'rows' ? (
              <RowsTab
                key={`${selectedTable.name}:${rowsVersion}`}
                base={base}
                table={selectedTable}
                tables={tables}
                readOnly={readOnly}
                onCount={count =>
                  setRowCounts(prev => ({
                    ...prev,
                    [selectedTable.name]: count
                  }))
                }
                onImport={() =>
                  setImportTarget({
                    mode: 'existing',
                    table: selectedTable.name
                  })
                }
              />
            ) : (
              <SchemaTab
                key={selectedTable.name}
                base={base}
                table={selectedTable}
                tables={tables}
                readOnly={readOnly}
                onChanged={async renamed => {
                  await loadTables();
                  if (renamed) setSelected(renamed);
                }}
                onDropped={handleTableDropped}
                onColumnDropped={handleColumnDropped}
                onColumnTypeChanged={handleColumnTypeChanged}
              />
            )}
          </>
        ) : (
          tables.length > 0 && (
            <div className="data-main-placeholder">
              <TableChartOutlined />
              <p>{t('pickTable')}</p>
            </div>
          )
        )}
      </section>
    </div>
  );

  return (
    <Wrapper>
      <div className="data-header">
        <div className="data-header-text">
          <h1 className="data-title">{t('title')}</h1>
          <p className="data-subtitle">
            {database ? database.name : t('subtitle')}
            {database?.sizeBytes !== null &&
              database?.sizeBytes !== undefined &&
              ready &&
              ` · ${t.bytes(database.sizeBytes)}`}
          </p>
        </div>
        {database && database.status !== 'DELETING' && (
          <IconButton
            aria-label={t('settings')}
            title={t('settings')}
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsOutlined />
          </IconButton>
        )}
      </div>

      {renderBanners()}

      {status === 'pending' && !database && renderSkeleton()}
      {status === 'rejected' && !database && (
        <p className="data-error">{c('somethingWentWrong')}</p>
      )}
      {status === 'resolved' && !database && renderEmpty()}
      {database?.status === 'CREATING' && (
        <p className="data-status">{t('statusCreating')}</p>
      )}
      {database?.status === 'FAILED' && (
        <div className="data-empty-state">
          <StorageOutlined />
          <h3>{t('statusFailed')}</h3>
          {database.error && <p>{database.error}</p>}
          <UI.Button
            variant="contained"
            size="small"
            disabled={creating || !canUseData}
            onClick={() => handleCreateDatabase()}
          >
            <span className="button-text">
              {creating ? t('creatingDatabase') : t('tryAgain')}
            </span>
          </UI.Button>
        </div>
      )}
      {database?.status === 'PURGING' && (
        <div className="data-empty-state">
          <StorageOutlined />
          <p>{t('statusPurging')}</p>
          <UI.Button
            variant="contained"
            size="small"
            disabled={creating || !canUseData}
            onClick={() => handleCreateDatabase(true)}
          >
            <Add />
            <span className="button-text">
              {creating ? t('creatingDatabase') : t('createNewDatabase')}
            </span>
          </UI.Button>
        </div>
      )}
      {ready &&
        (tables.length > 0
          ? renderTables()
          : tablesLoading
            ? renderSkeleton()
            : renderNoTables())}

      <NewTableDialog
        open={newTableOpen}
        base={base}
        tables={tables}
        onClose={() => setNewTableOpen(false)}
        onCreated={table => {
          setNewTableOpen(false);
          handleTableCreated(table);
        }}
      />
      {importTarget && (
        <ImportDialog
          base={base}
          tables={tables}
          table={
            importTarget.mode === 'existing'
              ? (tables.find(table => table.name === importTarget.table) ??
                null)
              : null
          }
          onClose={() => setImportTarget(null)}
          onDone={async name => {
            const latest = await loadTables();
            if (latest?.some(table => table.name === name)) {
              setSelected(name);
              setTab('rows');
            }
            setRowCounts(prev => {
              const next = { ...prev };
              delete next[name];
              return next;
            });
            setRowsVersion(n => n + 1);
          }}
        />
      )}
      {database && (
        <SettingsDialog
          open={settingsOpen}
          base={base}
          database={database}
          maxBytes={plan?.limits.maxDataBytes ?? null}
          readOnly={readOnly}
          onClose={() => setSettingsOpen(false)}
          onChanged={() => load()}
        />
      )}
      <UI.Alert
        open={replaceConfirm}
        title={t('replaceConfirmTitle')}
        description={t('replaceConfirmText')}
        confirmText={t('createNewDatabase')}
        cancelText={c('cancel')}
        loadingText={t('creatingDatabase')}
        loading={creating}
        onConfirm={() => handleCreateDatabase(true)}
        onCancel={() => setReplaceConfirm(false)}
      />
      <UI.Alert
        open={undoConfirm}
        title={t('undoConfirmTitle')}
        description={t('undoConfirmText')}
        confirmText={t('undo')}
        cancelText={c('cancel')}
        loadingText={t('restoring')}
        loading={restoring}
        onConfirm={handleUndo}
        onCancel={() => setUndoConfirm(false)}
      />
    </Wrapper>
  );
};
