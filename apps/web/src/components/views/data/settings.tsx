import { useEffect, useRef, useState } from 'react';
import { UI } from '@ganju/ui';

import { DownloadOutlined } from '@mui/icons-material';

import { DialogContent } from './styles';
import { ConfirmName } from './confirm-name';
import { dataRequest, downloadFile } from './api';
import { i18n } from '../../../lib';

import type { Database, ExportState } from './types';

const DAY = 24 * 60 * 60 * 1000;
const RESTORE_DAYS = 30;
const DELETE_GRACE_DAYS = 7;
const EXPORT_POLL_MS = 2000;
// An export still running after this is left to finish on its own; the
// owner can start another.
const EXPORT_POLL_LIMIT_MS = 15 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

interface ExportControlProps {
  base: string;
  // Just the button, for a banner.
  compact?: boolean;
}

/**
 * "Download a copy": starts an export, waits for it, and offers its files
 * (one per table, plus the schema). Works during the grace period after a
 * delete too.
 */
export const ExportControl = ({ base, compact }: ExportControlProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const [format, setFormat] = useState<'csv' | 'jsonl'>('csv');
  const [state, setState] = useState<ExportState | null>(null);
  const [starting, setStarting] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const poll = (exportId: string, startedAt = Date.now()) => {
    timer.current = setTimeout(async () => {
      if (Date.now() - startedAt > EXPORT_POLL_LIMIT_MS) {
        snackbar.error(t('toastExportTimedOut'));
        setState(null);
        return;
      }
      const result = await dataRequest<{ export: ExportState }>(base, '/export', {
        query: { exportId }
      });
      if (!result.ok) {
        snackbar.error(result.error || t('toastExportFailed'));
        setState(null);
        return;
      }
      setState(result.data.export);
      if (result.data.export.status === 'running') poll(exportId, startedAt);
    }, EXPORT_POLL_MS);
  };

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    const result = await dataRequest<{ exportId: string }>(base, '/export', {
      method: 'POST',
      body: { format }
    });
    setStarting(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastExportFailed'));
      return;
    }
    setState({
      id: result.data.exportId,
      format,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      files: []
    });
    poll(result.data.exportId);
  };

  const handleDownload = async (table: string | null) => {
    if (!state) return;
    const key = table ?? '';
    setDownloading(key);
    const params = new URLSearchParams({ exportId: state.id });
    if (table) params.set('table', table);
    const ok = await downloadFile(
      `${base}/export/file?${params.toString()}`,
      table ? `${table}.${state.format}` : 'schema.json'
    );
    setDownloading(null);
    if (!ok) snackbar.error(t('toastDownloadFailed'));
  };

  const running = starting || state?.status === 'running';

  return (
    <div className={`export-control ${compact ? 'compact' : ''}`}>
      {(!state || state.status !== 'done') && (
        <div className="export-start">
          {!compact && (
            <UI.Select
              size="small"
              label={t('exportFormat')}
              value={format}
              disabled={running}
              onChange={e => setFormat(e.target.value as 'csv' | 'jsonl')}
              options={[
                { label: 'CSV', value: 'csv' },
                { label: 'JSONL', value: 'jsonl' }
              ]}
            />
          )}
          <UI.Button
            size="small"
            variant={compact ? 'text' : 'outlined'}
            disabled={running}
            onClick={handleStart}
          >
            <DownloadOutlined />
            <span className="button-text">
              {running ? t('exportRunning') : t('downloadCopy')}
            </span>
          </UI.Button>
        </div>
      )}
      {state?.status === 'failed' && (
        <p className="dialog-danger">{state.error || t('toastExportFailed')}</p>
      )}
      {state?.status === 'done' && (
        <ul className="export-files">
          {state.files.map(file => (
            <li key={file.table ?? 'schema'}>
              <button
                type="button"
                disabled={downloading !== null}
                onClick={() => handleDownload(file.table)}
              >
                <DownloadOutlined />
                <span>
                  {file.table
                    ? `${file.table}.${state.format}`
                    : 'schema.json'}
                </span>
                {file.table && (
                  <small>{t.plural('exportRows', file.rows)}</small>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

interface SettingsDialogProps {
  open: boolean;
  base: string;
  database: Database;
  maxBytes: number | null;
  readOnly: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export const SettingsDialog = ({
  open,
  base,
  database,
  maxBytes,
  readOnly,
  onClose,
  onChanged
}: SettingsDialogProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const [restoreAt, setRestoreAt] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [undoBookmark, setUndoBookmark] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const now = new Date();
  const earliest = new Date(now.getTime() - RESTORE_DAYS * DAY + 60_000);
  const restoreDate = restoreAt ? new Date(restoreAt) : null;
  const restoreValid =
    !!restoreDate &&
    !Number.isNaN(restoreDate.getTime()) &&
    restoreDate >= earliest &&
    restoreDate <= now;
  const used = database.sizeBytes ?? 0;

  const restore = async (body: Record<string, unknown>, undo: boolean) => {
    if (restoring) return;
    setRestoring(true);
    const result = await dataRequest<{ bookmark: string; undoBookmark: string }>(
      base,
      '/restore-point',
      { method: 'POST', body }
    );
    setRestoring(false);
    setRestoreConfirm(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastRestoreFailed'));
      return;
    }
    setUndoBookmark(undo ? null : result.data.undoBookmark);
    snackbar.success(undo ? t('toastUndone') : t('toastRestored'));
    onChanged();
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const result = await dataRequest(base, '', {
      method: 'DELETE',
      body: { confirmName: database.name }
    });
    setDeleting(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastDeleteDatabaseFailed'));
      return;
    }
    setDeleteOpen(false);
    snackbar.success(t('toastDatabaseDeleted'));
    onClose();
    onChanged();
  };

  return (
    <>
      <UI.Modal
        open={open && !deleteOpen}
        title={t('settingsTitle')}
        closeLabel={c('close')}
        width={600}
        onClose={onClose}
      >
        <DialogContent>
          <section className="dialog-section">
            <h4 className="dialog-subtitle">{t('databaseSection')}</h4>
            <dl className="dialog-meta">
              <dt>{t('databaseName')}</dt>
              <dd>
                <code>{database.name}</code>
              </dd>
              <dt>{t('databaseSize')}</dt>
              <dd>
                {maxBytes
                  ? t('sizeOf', { used: t.bytes(used), max: t.bytes(maxBytes) })
                  : t.bytes(used)}
              </dd>
              <dt>{t('databaseCreated')}</dt>
              <dd>{t.date(database.createdAt, { dateStyle: 'medium' })}</dd>
            </dl>
            {maxBytes ? (
              <div
                className="dialog-meter"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={maxBytes}
                aria-valuenow={used}
              >
                <span style={{ width: `${Math.min(100, (used / maxBytes) * 100)}%` }} />
              </div>
            ) : null}
          </section>

          <section className="dialog-section">
            <h4 className="dialog-subtitle">{t('downloadCopy')}</h4>
            <p className="dialog-muted">{t('downloadCopyHelp')}</p>
            <ExportControl base={base} />
          </section>

          <section className="dialog-section">
            <h4 className="dialog-subtitle">{t('restoreTitle')}</h4>
            <p className="dialog-muted">{t('restoreHelp')}</p>
            <div className="dialog-row">
              <UI.Input
                size="small"
                type="datetime-local"
                label={t('restoreAt')}
                value={restoreAt}
                disabled={readOnly || restoring}
                error={!!restoreAt && !restoreValid}
                helperText={
                  restoreAt && !restoreValid ? t('restoreAtInvalid') : undefined
                }
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: {
                    min: toLocalInput(earliest),
                    max: toLocalInput(now)
                  }
                }}
                onChange={e => setRestoreAt(e.target.value)}
              />
              <UI.Button
                size="small"
                variant="outlined"
                disabled={readOnly || restoring || !restoreValid}
                onClick={() => setRestoreConfirm(true)}
              >
                <span className="button-text">{t('restoreAction')}</span>
              </UI.Button>
            </div>
            {undoBookmark && (
              <div className="dialog-notice">
                <span>{t('restoreDone')}</span>
                <UI.Button
                  size="small"
                  disabled={restoring}
                  onClick={() => restore({ bookmark: undoBookmark }, true)}
                >
                  <span className="button-text">{t('undoRestore')}</span>
                </UI.Button>
              </div>
            )}
          </section>

          <section className="dialog-section dialog-danger-zone">
            <h4 className="dialog-subtitle">{t('dangerZone')}</h4>
            <p className="dialog-muted">{t('deleteDatabaseHelp')}</p>
            <UI.Button
              size="small"
              variant="outlined"
              color="error"
              disabled={readOnly}
              onClick={() => setDeleteOpen(true)}
            >
              <span className="button-text">{t('deleteDatabase')}</span>
            </UI.Button>
          </section>
        </DialogContent>
      </UI.Modal>

      <UI.Alert
        open={restoreConfirm}
        title={t('restoreConfirmTitle')}
        description={t('restoreConfirmText', {
          date: restoreDate
            ? t.date(restoreDate, { dateStyle: 'long', timeStyle: 'short' })
            : ''
        })}
        confirmText={t('restoreAction')}
        cancelText={c('cancel')}
        loadingText={t('restoring')}
        loading={restoring}
        onConfirm={() =>
          restoreDate && restore({ timestamp: restoreDate.toISOString() }, false)
        }
        onCancel={() => setRestoreConfirm(false)}
      />

      <ConfirmName
        open={deleteOpen}
        title={t('deleteDatabaseTitle')}
        name={database.name}
        confirmText={t('deleteDatabase')}
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteOpen(false)}
      >
        <p>{t('deleteDatabaseText')}</p>
        <ul className="dialog-list">
          <li>{t('deleteDatabaseTables')}</li>
          <li>{t('deleteDatabaseTools')}</li>
        </ul>
        <p className="dialog-warning">
          {t.plural('deleteDatabaseGrace', DELETE_GRACE_DAYS)}
        </p>
      </ConfirmName>
    </>
  );
};
