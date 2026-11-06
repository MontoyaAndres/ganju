import { useEffect, useRef, useState } from 'react';
import { utils } from '@ganju/utils';
import { UI } from '@ganju/ui';

import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { SyncOutlined, TableViewOutlined } from '@mui/icons-material';

import { columnTitle, dataRequest, resourceBase } from './api';
import { i18n } from '../../../lib';

import type { DataTable } from './types';

interface PickOption {
  id: string;
  uri: string;
  title: string;
  mimeType: string;
}

// A sync runs in the background; the banner looks for its result this often,
// for up to this long.
const SYNC_POLL_MS = 3000;
const SYNC_POLL_LIMIT_MS = 90_000;
// A sync can also finish on its own (the file changed); the banner looks this
// often, and whenever the window comes back into focus.
const SYNC_WATCH_MS = 30_000;

// The file's name, as the API saved it with the source.
const sourceName = (table: DataTable) =>
  table.source?.title || table.source?.uri || '';

// Queues "Sync now" and waits until the table's last sync is newer than
// `since`, or gives up quietly. Resolves to whether it saw one.
const useSyncNow = (base: string, table: DataTable, onSynced: () => void) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const [syncing, setSyncing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const syncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    const since = table.sync?.at ?? null;
    const result = await dataRequest(
      base,
      `/table/${encodeURIComponent(table.name)}/sync`,
      { method: 'POST' }
    );
    if (!result.ok) {
      setSyncing(false);
      snackbar.error(result.error || t('toastSyncFailed'));
      return;
    }
    snackbar.success(t('toastSyncQueued'));
    const started = Date.now();
    const poll = () => {
      timer.current = setTimeout(async () => {
        const tables = await dataRequest<{ tables: DataTable[] }>(
          base,
          '/table'
        );
        const now = tables.ok
          ? tables.data.tables.find(x => x.name === table.name)
          : undefined;
        if (now?.sync && now.sync.at !== since) {
          setSyncing(false);
          onSynced();
          return;
        }
        if (Date.now() - started > SYNC_POLL_LIMIT_MS) {
          setSyncing(false);
          onSynced();
          return;
        }
        poll();
      }, SYNC_POLL_MS);
    };
    poll();
  };

  return { syncing, syncNow };
};

interface SyncBannerProps {
  base: string;
  table: DataTable;
  readOnly: boolean;
  onSynced: () => void;
}

// Above a synced table's rows: where they come from, how the last sync went,
// and "Sync now". The rows themselves are read-only.
export const SyncBanner = ({
  base,
  table,
  readOnly,
  onSynced
}: SyncBannerProps) => {
  const t = i18n.useT(i18n.copy.DATA);
  const { syncing, syncNow } = useSyncNow(base, table, onSynced);
  const sync = table.sync;
  const failed = sync?.status === 'failed';
  const shownAt = sync?.at ?? null;
  // The latest callback, so a parent's re-render doesn't restart the watch.
  const synced = useRef(onSynced);
  synced.current = onSynced;

  useEffect(() => {
    if (syncing) return;
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      const tables = await dataRequest<{ tables: DataTable[] }>(base, '/table');
      if (cancelled || !tables.ok) return;
      const now = tables.data.tables.find(x => x.name === table.name);
      if (now?.sync && now.sync.at !== shownAt) synced.current();
    };
    const timer = setInterval(check, SYNC_WATCH_MS);
    window.addEventListener('focus', check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [base, table.name, shownAt, syncing]);

  return (
    <div
      className={`data-banner ${failed ? 'data-banner-danger' : ''}`}
      role="status"
    >
      <div className="data-banner-text">
        <strong>
          {t('syncedFrom', { file: sourceName(table) })}
          {' · '}
          {syncing
            ? t('syncRunning')
            : sync
              ? failed
                ? t('syncRefusedAgo', { ago: t.relative(sync.at) })
                : t('syncedAgo', { ago: t.relative(sync.at) })
              : t('syncNever')}
        </strong>
        <span>
          {failed && sync?.error
            ? utils.localizeDataError(sync.error, t.lang)
            : t('syncRowsReadOnly')}
        </span>
      </div>
      <div className="data-banner-actions">
        <UI.Button
          size="small"
          variant="outlined"
          disabled={readOnly || syncing}
          onClick={syncNow}
        >
          <SyncOutlined />
          <span className="button-text">{t('syncNow')}</span>
        </UI.Button>
      </div>
    </div>
  );
};

interface SourceCardProps {
  base: string;
  table: DataTable;
  readOnly: boolean;
  onChanged: () => Promise<void> | void;
}

interface Draft {
  file: PickOption | null;
  sheet: string;
  key: string;
}

// "Source: spreadsheet" in the table's schema: the file the rows come from,
// the sheet, and the key column that matches them; or none.
export const SourceCard = ({
  base,
  table,
  readOnly,
  onChanged
}: SourceCardProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<PickOption[]>([]);
  const [loading, setLoading] = useState(false);
  const resources = resourceBase(base);
  const keys = table.columns.filter(column => column.unique);
  const { syncing, syncNow } = useSyncNow(base, table, () => onChanged());

  useEffect(() => {
    if (!draft) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      const q = search.trim();
      utils
        .fetcher({
          url: `${resources}/pick?tabular=1${q ? `&q=${encodeURIComponent(q)}` : ''}`,
          config: { credentials: 'include' }
        })
        .then(data => {
          if (!cancelled) {
            setOptions(Array.isArray(data?.items) ? data.items : []);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft !== null, search, resources]);

  const startEditing = () => {
    const source = table.source;
    setDraft({
      file: source
        ? {
            id: '',
            uri: source.uri,
            title: source.title || source.uri,
            mimeType: ''
          }
        : null,
      sheet: source?.sheet ?? '',
      key: source?.key ?? keys[0]?.name ?? ''
    });
  };

  const save = async (source: Record<string, unknown> | null) => {
    if (saving) return;
    setSaving(true);
    const result = await dataRequest<{ table: DataTable }>(
      base,
      `/table/${encodeURIComponent(table.name)}`,
      { method: 'PATCH', body: { source } }
    );
    setSaving(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastSourceFailed'));
      return false;
    }
    snackbar.success(source ? t('toastSourceSaved') : t('toastSourceStopped'));
    setDraft(null);
    setStopOpen(false);
    await onChanged();
    return true;
  };

  const handleSave = () => {
    if (!draft?.file || !draft.key) return;
    save({
      uri: draft.file.uri,
      sheet: draft.sheet.trim() || null,
      key: draft.key
    });
  };

  const source = table.source;

  return (
    <section className="data-card">
      <div className="data-card-header">
        <div>
          <h3>{t('sourceTitle')}</h3>
          <p className="data-card-muted">{t('sourceHelp')}</p>
        </div>
        {!draft && !readOnly && !source && (
          <UI.Button size="small" variant="outlined" onClick={startEditing}>
            <TableViewOutlined />
            <span className="button-text">{t('sourceSet')}</span>
          </UI.Button>
        )}
      </div>

      {!draft && source && (
        <div className="data-form">
          <dl className="data-source-meta">
            <dt>{t('sourceFile')}</dt>
            <dd>
              {sourceName(table)}
              {source.title && (
                <>
                  {' '}
                  <code>{source.uri}</code>
                </>
              )}
            </dd>
            <dt>{t('sourceSheet')}</dt>
            <dd>{source.sheet || t('sourceFirstSheet')}</dd>
            <dt>{t('sourceKey')}</dt>
            <dd>
              <code>{source.key}</code>
            </dd>
            <dt>{t('sourceLastSync')}</dt>
            <dd>
              {table.sync
                ? table.sync.status === 'ok'
                  ? t('sourceLastSyncOk', {
                      ago: t.relative(table.sync.at),
                      inserted: t.n(table.sync.inserted),
                      updated: t.n(table.sync.updated),
                      deleted: t.n(table.sync.deleted)
                    })
                  : t('syncRefusedAgo', { ago: t.relative(table.sync.at) })
                : t('syncNever')}
            </dd>
          </dl>
          {table.sync?.status === 'failed' && table.sync.error && (
            <p className="data-inline-error">
              {utils.localizeDataError(table.sync.error, t.lang)}
            </p>
          )}
          {!readOnly && (
            <div className="data-form-actions">
              <UI.Button
                size="small"
                variant="contained"
                disabled={syncing}
                onClick={syncNow}
              >
                <SyncOutlined />
                <span className="button-text">
                  {syncing ? t('syncRunning') : t('syncNow')}
                </span>
              </UI.Button>
              <UI.Button size="small" onClick={startEditing}>
                {t('sourceChange')}
              </UI.Button>
              <UI.Button
                size="small"
                className="data-danger-text"
                onClick={() => setStopOpen(true)}
              >
                {t('sourceStop')}
              </UI.Button>
            </div>
          )}
        </div>
      )}

      {!draft && !source && (
        <p className="data-card-muted">{t('sourceNone')}</p>
      )}

      {draft && (
        <div className="data-form">
          <Autocomplete<PickOption>
            options={options}
            value={draft.file}
            loading={loading}
            disabled={saving}
            filterOptions={x => x}
            getOptionLabel={option => option.title}
            isOptionEqualToValue={(a, b) => a.uri === b.uri}
            onInputChange={(_, text, reason) => {
              if (reason === 'input' || reason === 'clear') setSearch(text);
            }}
            onChange={(_, next) =>
              setDraft(d => (d ? { ...d, file: next } : d))
            }
            renderOption={(props, option) => (
              <li {...props} key={option.uri}>
                <span
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0
                  }}
                >
                  <span>{option.title}</span>
                  <span
                    style={{
                      fontSize: '0.75em',
                      opacity: 0.6,
                      wordBreak: 'break-all'
                    }}
                  >
                    {option.uri}
                  </span>
                </span>
              </li>
            )}
            noOptionsText={t('sourcePickEmpty')}
            loadingText={t('relationLoading')}
            renderInput={params => (
              <TextField
                {...params}
                size="small"
                label={t('sourceFile')}
                helperText={t('sourceFileHelp')}
              />
            )}
          />
          <div className="data-form-row">
            <UI.Input
              size="small"
              label={t('sourceSheet')}
              helperText={t('sourceSheetHelp')}
              value={draft.sheet}
              disabled={saving}
              onChange={e =>
                setDraft(d => (d ? { ...d, sheet: e.target.value } : d))
              }
            />
            {keys.length > 0 ? (
              <UI.Select
                size="small"
                label={t('sourceKey')}
                helperText={t('sourceKeyHelp')}
                value={draft.key}
                disabled={saving}
                onChange={e =>
                  setDraft(d => (d ? { ...d, key: String(e.target.value) } : d))
                }
                options={keys.map(column => ({
                  label: columnTitle(column),
                  value: column.name
                }))}
              />
            ) : (
              <p className="data-inline-error">{t('sourceNoKey')}</p>
            )}
          </div>
          <p className="data-source-warning">{t('sourceWarning')}</p>
          <div className="data-form-actions">
            <UI.Button
              size="small"
              variant="contained"
              disabled={saving || !draft.file || !draft.key}
              onClick={handleSave}
            >
              {saving ? c('saving') : t('sourceSave')}
            </UI.Button>
            <UI.Button
              size="small"
              disabled={saving}
              onClick={() => setDraft(null)}
            >
              {c('cancel')}
            </UI.Button>
          </div>
        </div>
      )}

      <UI.Alert
        open={stopOpen}
        title={t('sourceStopTitle', { table: table.name })}
        description={t('sourceStopText')}
        confirmText={t('sourceStop')}
        cancelText={c('cancel')}
        loadingText={c('saving')}
        loading={saving}
        onConfirm={() => save(null)}
        onCancel={() => setStopOpen(false)}
      />
    </section>
  );
};
