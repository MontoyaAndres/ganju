import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { utils } from '@ganju/utils';
import { UI } from '@ganju/ui';

import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import {
  InsertDriveFileOutlined,
  WarningAmberOutlined
} from '@mui/icons-material';

import {
  acquirePreview,
  columnTitle,
  releasePreview,
  resourceBase
} from './api';
import { i18n } from '../../../lib';

import type { DataColumn, DataTable, FileValue } from './types';

interface PickOption {
  id: string;
  uri: string;
  title: string;
  mimeType: string;
}

const isImage = (mimeType?: string) => !!mimeType?.startsWith('image/');

// A resource's uri for an upload: readable, and unique with a short suffix.
const uploadUri = (table: string, fileName: string) => {
  const stem = fileName.replace(/\.[^.]+$/, '');
  const slug =
    stem
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'file';
  const suffix = crypto.randomUUID().slice(0, 6);
  return `${utils.constants.CUSTOM_CODE_RESOURCE_URI_PREFIX}data/${table}/${slug}-${suffix}`;
};

// A resource's title must be 3 to 200 characters.
const uploadTitle = (fileName: string) => {
  const title = fileName.trim().slice(0, 200);
  return title.length >= 3 ? title : `${title} file`.trim();
};

// The grid previews images up to this size; past it, the title shows.
export const GRID_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

// The image preview, or nothing while it loads or for other files. Fetched
// only once it's on screen, and released when it leaves the page.
export const FilePreview = ({
  base,
  value,
  className,
  maxBytes
}: {
  base: string;
  value: FileValue;
  className: string;
  maxBytes?: number;
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const holder = useRef<HTMLSpanElement>(null);
  const shown =
    !!value.id &&
    isImage(value.mimeType) &&
    (maxBytes === undefined || (value.size ?? Infinity) <= maxBytes);

  useEffect(() => {
    if (!shown || visible || !holder.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setVisible(true);
    });
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, [shown, visible]);

  useEffect(() => {
    setUrl(null);
    if (!shown || !visible || !value.id) return;
    const id = value.id;
    let cancelled = false;
    acquirePreview(base, id).then(next => {
      if (!cancelled) setUrl(next);
    });
    return () => {
      cancelled = true;
      releasePreview(id);
    };
  }, [base, value.id, shown, visible]);

  if (!shown) return null;
  return (
    <span ref={holder} className={className}>
      {url && <img src={url} alt={value.title ?? ''} />}
    </span>
  );
};

interface FileFieldProps {
  base: string;
  table: DataTable;
  column: DataColumn;
  value: FileValue | null;
  disabled: boolean;
  error?: string;
  onChange: (value: FileValue | null) => void;
}

// A file column in the row form: the linked resource, and ways to upload a
// new one (kept under Data attachments), pick an existing one, or remove it.
export const FileField = ({
  base,
  table,
  column,
  value,
  disabled,
  error,
  onChange
}: FileFieldProps) => {
  const t = i18n.useT(i18n.copy.DATA);
  const router = useRouter();
  const snackbar = UI.Alert.useSnackbar();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<PickOption[]>([]);
  const [loading, setLoading] = useState(false);
  const resources = resourceBase(base);
  const label = `${columnTitle(column)}${column.required ? ' *' : ''}`;

  useEffect(() => {
    if (!picking) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      const q = search.trim();
      utils
        .fetcher({
          url: `${resources}/pick${q ? `?q=${encodeURIComponent(q)}` : ''}`,
          config: { credentials: 'include' }
        })
        .then(data => {
          if (!cancelled)
            setOptions(Array.isArray(data?.items) ? data.items : []);
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
  }, [picking, search, resources]);

  const upload = async (file: File) => {
    const mimeType =
      file.type || utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM;
    if (!(utils.constants.MIMETYPES as readonly string[]).includes(mimeType)) {
      snackbar.error(t('fileTypeUnsupported', { type: mimeType }));
      return;
    }
    setUploading(true);
    try {
      const created = await utils.fetcher({
        url: resources,
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({
            title: uploadTitle(file.name),
            uri: uploadUri(table.name, file.name),
            sourceType: utils.constants.RESOURCE_SOURCE_TYPE_FILE,
            mimeType,
            size: file.size,
            fileName: file.name,
            metadata: {
              dataAttachment: {
                table: table.name,
                column: column.name,
                index: column.searchable
              }
            }
          })
        }
      });
      if (!created?.id) {
        snackbar.error(created?.error || t('fileUploadFailed'));
        return;
      }
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}${resources}/${created.id}/upload`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': mimeType,
            'x-file-name': encodeURIComponent(file.name)
          },
          body: file
        }
      );
      if (!response.ok) {
        snackbar.error(t('fileUploadFailed'));
        return;
      }
      const stored = (await response.json()) as PickOption;
      onChange({
        uri: stored.uri,
        id: stored.id,
        title: stored.title,
        mimeType: stored.mimeType
      });
    } catch {
      snackbar.error(t('fileUploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const openInResources = () => {
    if (!value?.id) return;
    const { id, projectId } = router.query;
    router.push(
      `/organization/${id}/project/${projectId}/resources?selected=${value.id}`
    );
  };

  const busy = disabled || uploading;

  return (
    <div className={`data-file-field${error ? ' error' : ''}`}>
      <p className="data-file-label">{label}</p>
      {value && (
        <div className="data-file-current">
          {value.missing ? (
            <WarningAmberOutlined className="data-file-icon missing" />
          ) : isImage(value.mimeType) && value.id ? (
            <FilePreview
              base={base}
              value={value}
              className="data-file-thumb"
            />
          ) : (
            <InsertDriveFileOutlined className="data-file-icon" />
          )}
          <div className="data-file-text">
            {value.missing ? (
              <>
                <span className="data-file-title missing">
                  {t('fileMissing')}
                </span>
                <span className="data-file-uri">{value.uri}</span>
              </>
            ) : (
              <>
                {value.id ? (
                  <button
                    type="button"
                    className="data-file-title link"
                    title={t('fileOpen')}
                    onClick={openInResources}
                  >
                    {value.title ?? value.uri}
                  </button>
                ) : (
                  <span className="data-file-title">
                    {value.title ?? value.uri}
                  </span>
                )}
                <span className="data-file-uri">{value.uri}</span>
              </>
            )}
          </div>
        </div>
      )}
      {picking ? (
        <Autocomplete<PickOption>
          open
          options={options}
          loading={loading}
          disabled={busy}
          filterOptions={x => x}
          getOptionLabel={option => option.title}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onInputChange={(_, text, reason) => {
            if (reason === 'input' || reason === 'clear') setSearch(text);
          }}
          onChange={(_, next) => {
            if (next) {
              onChange({
                uri: next.uri,
                id: next.id,
                title: next.title,
                mimeType: next.mimeType
              });
            }
            setPicking(false);
            setSearch('');
          }}
          onClose={() => setPicking(false)}
          renderOption={(props, option) => (
            <li {...props} key={option.id}>
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
          noOptionsText={t('filePickEmpty')}
          loadingText={t('relationLoading')}
          renderInput={params => (
            <TextField
              {...params}
              size="small"
              autoFocus
              label={t('filePickSearch')}
            />
          )}
        />
      ) : (
        <div className="data-file-actions">
          <UI.Button
            size="small"
            variant="outlined"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <span className="button-text">
              {uploading ? t('fileUploading') : t('fileUpload')}
            </span>
          </UI.Button>
          <UI.Button
            size="small"
            variant="outlined"
            disabled={busy}
            onClick={() => setPicking(true)}
          >
            <span className="button-text">{t('filePick')}</span>
          </UI.Button>
          {value && (
            <UI.Button
              size="small"
              variant="text"
              disabled={busy}
              onClick={() => onChange(null)}
            >
              <span className="button-text">{t('fileRemove')}</span>
            </UI.Button>
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        hidden
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) upload(file);
        }}
      />
      <p className="data-file-help">
        {error ||
          (value?.missing
            ? column.required
              ? t('fileMissingRequiredHelp')
              : t('fileMissingHelp')
            : column.description || t('fileHelp'))}
      </p>
    </div>
  );
};
