import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import { utils } from '@anju/utils';
import {
  FolderOutlined,
  InsertDriveFileOutlined,
  Search,
  CloudOutlined,
  StarOutline,
  ScheduleOutlined,
  ErrorOutline,
  Close,
  PictureAsPdfOutlined,
  DescriptionOutlined,
  TableChartOutlined,
  SlideshowOutlined,
  ImageOutlined,
  TextSnippetOutlined,
  AudiotrackOutlined,
  VideoFileOutlined
} from '@mui/icons-material';
import type { ReactNode } from 'react';

import { Breadcrumbs } from '../breadcrumbs';
import { Skeleton } from '../skeleton';
import { Wrapper } from './styles';

const GDRIVE_FOLDER_MIME =
  utils.constants.MIMETYPE_APPLICATION_VND_GOOGLE_APPS_FOLDER;
const GDRIVE_API_BASE = utils.constants.GOOGLE_DRIVE_API_BASE;
const GDRIVE_LIST_FIELDS = utils.constants.GOOGLE_DRIVE_LIST_FIELDS;
const ONEDRIVE_API_BASE = utils.constants.MICROSOFT_GRAPH_API_BASE;
const ONEDRIVE_ITEM_SELECT = utils.constants.ONE_DRIVE_ITEM_SELECT;

export type CloudDriveProvider = 'google-drive' | 'onedrive';

export interface CloudDriveItem {
  provider: CloudDriveProvider;
  id: string;
  driveId?: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  iconLink?: string;
  webUrl?: string;
  modifiedTime?: string;
  size?: number;
}

interface Crumb {
  id: string;
  name: string;
  driveId?: string;
}

interface TabDef {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface ListEndpoint {
  url: string;
  kind: 'files' | 'drives';
}

interface ProviderConfig {
  defaultTab: string;
  tabs: ReadonlyArray<TabDef>;
  tabRootCrumb: (tab: string) => Crumb;
  buildEndpoint: (tab: string, path: Crumb[], search: string) => ListEndpoint;
  parseFiles: (payload: unknown) => CloudDriveItem[];
  parseDrives: (payload: unknown) => CloudDriveItem[];
  shouldShowSearch: (tab: string, path: Crumb[]) => boolean;
}

interface GDriveApiFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  iconLink?: string;
  webViewLink?: string;
  size?: string;
}

interface GDriveListResponse {
  files?: GDriveApiFile[];
  nextPageToken?: string;
}

interface GDriveSharedDrive {
  id: string;
  name: string;
}

interface GDriveSharedDriveListResponse {
  drives?: GDriveSharedDrive[];
  nextPageToken?: string;
}

interface GraphFile {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
  parentReference?: { driveId?: string; id?: string };
  remoteItem?: GraphFile;
}

interface GraphListResponse {
  value?: GraphFile[];
  '@odata.nextLink'?: string;
}

interface GraphDrive {
  id: string;
  name?: string;
}

interface GraphDrivesResponse {
  value?: GraphDrive[];
}

const buildGoogleConfig = (): ProviderConfig => ({
  defaultTab: utils.constants.GOOGLE_DRIVE_TAB_MY_DRIVE,
  tabs: utils.constants.GOOGLE_DRIVE_TAB_LABELS.map(t => ({
    value: t.value,
    label: t.label,
    icon:
      t.value === utils.constants.GOOGLE_DRIVE_TAB_SHARED_DRIVES ? (
        <CloudOutlined fontSize="small" />
      ) : t.value === utils.constants.GOOGLE_DRIVE_TAB_STARRED ? (
        <StarOutline fontSize="small" />
      ) : undefined
  })),
  tabRootCrumb: tab => {
    if (tab === utils.constants.GOOGLE_DRIVE_TAB_MY_DRIVE) {
      return {
        id: 'root',
        name: utils.constants.GOOGLE_DRIVE_TAB_LABEL_MY_DRIVE
      };
    }
    if (tab === utils.constants.GOOGLE_DRIVE_TAB_SHARED_WITH_ME) {
      return {
        id: '__shared-with-me__',
        name: utils.constants.GOOGLE_DRIVE_TAB_LABEL_SHARED_WITH_ME
      };
    }
    if (tab === utils.constants.GOOGLE_DRIVE_TAB_SHARED_DRIVES) {
      return {
        id: '__shared-drives__',
        name: utils.constants.GOOGLE_DRIVE_TAB_LABEL_SHARED_DRIVES
      };
    }
    return {
      id: '__starred__',
      name: utils.constants.GOOGLE_DRIVE_TAB_LABEL_STARRED
    };
  },
  buildEndpoint: (tab, path, search) => {
    const params = new URLSearchParams({
      fields: GDRIVE_LIST_FIELDS,
      pageSize: '100',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      orderBy: 'folder,name'
    });

    const hasSearch = search.trim().length > 0;
    const nameClause = hasSearch
      ? `name contains '${search.replace(/'/g, "\\'")}'`
      : '';

    const isAtRoot = path.length === 1;

    if (
      tab === utils.constants.GOOGLE_DRIVE_TAB_SHARED_DRIVES &&
      isAtRoot &&
      !hasSearch
    ) {
      return {
        url: `${GDRIVE_API_BASE}/drives?${new URLSearchParams({
          pageSize: '100'
        }).toString()}`,
        kind: 'drives'
      };
    }

    const current = path[path.length - 1];
    const driveId =
      tab === utils.constants.GOOGLE_DRIVE_TAB_SHARED_DRIVES
        ? current.driveId
        : undefined;
    if (driveId) {
      params.set('corpora', 'drive');
      params.set('driveId', driveId);
    }

    const clauses: string[] = ['trashed = false'];

    if (hasSearch) {
      clauses.push(nameClause);
      if (tab === utils.constants.GOOGLE_DRIVE_TAB_MY_DRIVE) {
        clauses.push("'me' in owners");
      } else if (tab === utils.constants.GOOGLE_DRIVE_TAB_SHARED_WITH_ME) {
        clauses.push('sharedWithMe');
      } else if (tab === utils.constants.GOOGLE_DRIVE_TAB_STARRED) {
        clauses.push('starred');
      }
    } else if (isAtRoot) {
      if (tab === utils.constants.GOOGLE_DRIVE_TAB_MY_DRIVE) {
        clauses.push("'root' in parents");
      } else if (tab === utils.constants.GOOGLE_DRIVE_TAB_SHARED_WITH_ME) {
        clauses.push('sharedWithMe');
      } else if (tab === utils.constants.GOOGLE_DRIVE_TAB_STARRED) {
        clauses.push('starred');
      }
    } else {
      clauses.push(`'${current.id}' in parents`);
    }

    params.set('q', clauses.join(' and '));
    return { url: `${GDRIVE_API_BASE}/files?${params.toString()}`, kind: 'files' };
  },
  parseFiles: payload => {
    const data = payload as GDriveListResponse;
    return (data.files || []).map(file => ({
      provider: 'google-drive' as const,
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      isFolder: file.mimeType === GDRIVE_FOLDER_MIME,
      iconLink: file.iconLink,
      webUrl: file.webViewLink,
      modifiedTime: file.modifiedTime,
      size: file.size ? Number(file.size) : undefined
    }));
  },
  parseDrives: payload => {
    const data = payload as GDriveSharedDriveListResponse;
    return (data.drives || []).map(drive => ({
      provider: 'google-drive' as const,
      id: drive.id,
      name: drive.name,
      mimeType: GDRIVE_FOLDER_MIME,
      isFolder: true
    }));
  },
  shouldShowSearch: (tab, path) =>
    !(
      tab === utils.constants.GOOGLE_DRIVE_TAB_SHARED_DRIVES &&
      path.length === 1
    )
});

const buildOnedriveConfig = (): ProviderConfig => {
  const normalize = (raw: GraphFile): GraphFile => {
    if (raw.remoteItem) {
      return {
        ...raw.remoteItem,
        parentReference: raw.remoteItem.parentReference || raw.parentReference
      };
    }
    return raw;
  };

  return {
    defaultTab: utils.constants.ONE_DRIVE_TAB_MY_FILES,
    tabs: utils.constants.ONE_DRIVE_TAB_LABELS.map(t => ({
      value: t.value,
      label: t.label,
      icon:
        t.value === utils.constants.ONE_DRIVE_TAB_DRIVES ? (
          <CloudOutlined fontSize="small" />
        ) : t.value === utils.constants.ONE_DRIVE_TAB_RECENT ? (
          <ScheduleOutlined fontSize="small" />
        ) : undefined
    })),
    tabRootCrumb: tab => {
      if (tab === utils.constants.ONE_DRIVE_TAB_MY_FILES) {
        return {
          id: 'root',
          name: utils.constants.ONE_DRIVE_TAB_LABEL_MY_FILES
        };
      }
      if (tab === utils.constants.ONE_DRIVE_TAB_SHARED_WITH_ME) {
        return {
          id: '__shared-with-me__',
          name: utils.constants.ONE_DRIVE_TAB_LABEL_SHARED_WITH_ME
        };
      }
      if (tab === utils.constants.ONE_DRIVE_TAB_RECENT) {
        return {
          id: '__recent__',
          name: utils.constants.ONE_DRIVE_TAB_LABEL_RECENT
        };
      }
      return {
        id: '__drives__',
        name: utils.constants.ONE_DRIVE_TAB_LABEL_DRIVES
      };
    },
    buildEndpoint: (tab, path, search) => {
      const hasSearch = search.trim().length > 0;
      const current = path[path.length - 1];
      const isAtRoot = path.length === 1;

      const driveBase = current.driveId
        ? `/drives/${encodeURIComponent(current.driveId)}`
        : '/me/drive';

      if (hasSearch) {
        const safe = search.replace(/'/g, "''");
        const params = new URLSearchParams({
          $select: ONEDRIVE_ITEM_SELECT,
          $top: '100'
        });
        return {
          url: `${ONEDRIVE_API_BASE}${driveBase}/root/search(q='${encodeURIComponent(safe)}')?${params.toString()}`,
          kind: 'files'
        };
      }

      if (isAtRoot) {
        if (tab === utils.constants.ONE_DRIVE_TAB_MY_FILES) {
          const params = new URLSearchParams({
            $select: ONEDRIVE_ITEM_SELECT,
            $top: '100',
            $orderby: 'name'
          });
          return {
            url: `${ONEDRIVE_API_BASE}/me/drive/root/children?${params.toString()}`,
            kind: 'files'
          };
        }
        if (tab === utils.constants.ONE_DRIVE_TAB_SHARED_WITH_ME) {
          return {
            url: `${ONEDRIVE_API_BASE}/me/drive/sharedWithMe`,
            kind: 'files'
          };
        }
        if (tab === utils.constants.ONE_DRIVE_TAB_RECENT) {
          return {
            url: `${ONEDRIVE_API_BASE}/me/drive/recent`,
            kind: 'files'
          };
        }
        return {
          url: `${ONEDRIVE_API_BASE}/me/drives`,
          kind: 'drives'
        };
      }

      const params = new URLSearchParams({
        $select: ONEDRIVE_ITEM_SELECT,
        $top: '100',
        $orderby: 'name'
      });
      return {
        url: `${ONEDRIVE_API_BASE}${driveBase}/items/${encodeURIComponent(current.id)}/children?${params.toString()}`,
        kind: 'files'
      };
    },
    parseFiles: payload => {
      const data = payload as GraphListResponse;
      const items = (data.value || []).map(raw => {
        const file = normalize(raw);
        const mimeType = file.file?.mimeType || (file.folder ? 'folder' : '');
        return {
          provider: 'onedrive' as const,
          id: file.id,
          driveId: file.parentReference?.driveId,
          name: file.name,
          mimeType,
          isFolder: !!file.folder,
          webUrl: file.webUrl,
          modifiedTime: file.lastModifiedDateTime,
          size: file.size
        };
      });
      return items.sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    },
    parseDrives: payload => {
      const data = payload as GraphDrivesResponse;
      return (data.value || []).map(drive => ({
        provider: 'onedrive' as const,
        id: 'root',
        driveId: drive.id,
        name: drive.name || drive.id,
        mimeType: 'folder',
        isFolder: true
      }));
    },
    shouldShowSearch: (tab, path) =>
      !(tab === utils.constants.ONE_DRIVE_TAB_DRIVES && path.length === 1)
  };
};

const providerConfig = (provider: CloudDriveProvider): ProviderConfig =>
  provider === 'google-drive' ? buildGoogleConfig() : buildOnedriveConfig();

const formatRelativeTime = (iso?: string): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return date.toLocaleDateString();
};

const getMimeIcon = (mimeType: string) => {
  const mime = mimeType || '';
  if (mime.startsWith('image/')) return <ImageOutlined />;
  if (mime.startsWith('audio/')) return <AudiotrackOutlined />;
  if (mime.startsWith('video/')) return <VideoFileOutlined />;
  if (mime === 'application/pdf') return <PictureAsPdfOutlined />;
  if (mime.includes('word') || mime.includes('document'))
    return <DescriptionOutlined />;
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv'))
    return <TableChartOutlined />;
  if (
    mime.includes('presentation') ||
    mime.includes('powerpoint') ||
    mime.includes('slide')
  )
    return <SlideshowOutlined />;
  if (mime.startsWith('text/')) return <TextSnippetOutlined />;
  return <InsertDriveFileOutlined />;
};

const friendlyMime = (item: CloudDriveItem): string => {
  if (item.isFolder) return 'Folder';
  if (item.provider === 'google-drive') {
    if (item.mimeType.startsWith('application/vnd.google-apps.')) {
      return item.mimeType
        .replace('application/vnd.google-apps.', 'Google ')
        .replace(/^./, c => c.toUpperCase());
    }
  }
  return item.mimeType || 'File';
};

const itemKey = (item: CloudDriveItem): string =>
  item.driveId ? `${item.driveId}:${item.id}` : item.id;

export interface IProps {
  provider: CloudDriveProvider;
  accessToken: string | null;
  defaultTab?: string;
  selected?: Map<string, CloudDriveItem>;
  onSelectionChange?: (selected: Map<string, CloudDriveItem>) => void;
  onTokenExpired?: () => void;
  emptyText?: string;
}

export const CloudDriveBrowser = (props: IProps) => {
  const {
    provider,
    accessToken,
    defaultTab,
    selected: controlledSelected,
    onSelectionChange,
    onTokenExpired,
    emptyText = 'No files in this folder'
  } = props;

  const config = useMemo(() => providerConfig(provider), [provider]);

  const [tab, setTab] = useState<string>(defaultTab ?? config.defaultTab);
  const [path, setPath] = useState<Crumb[]>([
    config.tabRootCrumb(defaultTab ?? config.defaultTab)
  ]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<CloudDriveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalSelected, setInternalSelected] = useState<
    Map<string, CloudDriveItem>
  >(new Map());

  const selected = controlledSelected ?? internalSelected;

  const onTokenExpiredRef = useRef(onTokenExpired);
  useEffect(() => {
    onTokenExpiredRef.current = onTokenExpired;
  }, [onTokenExpired]);

  useEffect(() => {
    if (searchInput === search) return;
    const handle = setTimeout(() => {
      setSearch(searchInput);
    }, utils.constants.SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput, search]);

  const resetSearch = () => {
    setSearchInput('');
    setSearch('');
  };

  const updateSelected = useCallback(
    (next: Map<string, CloudDriveItem>) => {
      if (!controlledSelected) setInternalSelected(next);
      onSelectionChange?.(next);
    },
    [controlledSelected, onSelectionChange]
  );

  useEffect(() => {
    if (!accessToken) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const endpoint = config.buildEndpoint(tab, path, search);
        const response = await fetch(endpoint.url, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (response.status === 401) {
          if (!cancelled) {
            onTokenExpiredRef.current?.();
            setError(
              'Session expired. Please reconnect and try again.'
            );
            setItems([]);
          }
          return;
        }
        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(`API ${response.status}: ${detail}`);
        }
        const payload = await response.json();
        if (cancelled) return;
        setItems(
          endpoint.kind === 'drives'
            ? config.parseDrives(payload)
            : config.parseFiles(payload)
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, tab, path, search, config]);

  const handleTabChange = (next: string) => {
    if (next === tab) return;
    setTab(next);
    setPath([config.tabRootCrumb(next)]);
    resetSearch();
  };

  const handleOpenFolder = (item: CloudDriveItem) => {
    const currentDriveId =
      path.length > 0 ? path[path.length - 1].driveId : undefined;
    const nextDriveId =
      provider === 'google-drive' &&
      tab === utils.constants.GOOGLE_DRIVE_TAB_SHARED_DRIVES &&
      path.length === 1
        ? item.id
        : item.driveId ?? currentDriveId;
    setPath(prev => [
      ...prev,
      { id: item.id, name: item.name, driveId: nextDriveId }
    ]);
    resetSearch();
  };

  const handleBreadcrumb = (index: number) => {
    setPath(prev => prev.slice(0, index + 1));
    resetSearch();
  };

  const toggleItem = (item: CloudDriveItem) => {
    const key = itemKey(item);
    const next = new Map(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.set(key, item);
    }
    updateSelected(next);
  };

  const breadcrumbItems = useMemo(
    () =>
      path.map((crumb, index) => ({
        label: crumb.name,
        onClick:
          index < path.length - 1 ? () => handleBreadcrumb(index) : undefined
      })),
    [path]
  );

  const ancestorSelectedCrumb = useMemo(() => {
    for (let i = 1; i < path.length; i++) {
      const crumb = path[i];
      if (selected.has(crumb.id)) return crumb;
    }
    return null;
  }, [path, selected]);

  const renderRow = (item: CloudDriveItem) => {
    const key = itemKey(item);
    const isSelected = selected.has(key);
    const coveredByAncestor = !!ancestorSelectedCrumb && !isSelected;
    const effectiveSelected = isSelected || coveredByAncestor;
    const ancestorTitle = ancestorSelectedCrumb
      ? `Already included via "${ancestorSelectedCrumb.name}"`
      : undefined;

    const onActivate = () => {
      if (item.isFolder) {
        handleOpenFolder(item);
      } else if (!coveredByAncestor) {
        toggleItem(item);
      }
    };

    return (
      <div
        key={key}
        className={`gdrive-row ${effectiveSelected ? 'selected' : ''} ${coveredByAncestor ? 'covered' : ''}`}
        role="button"
        tabIndex={0}
        title={coveredByAncestor ? ancestorTitle : undefined}
        onClick={onActivate}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onActivate();
          }
        }}
      >
        <Checkbox
          className="gdrive-row-checkbox"
          size="small"
          checked={effectiveSelected}
          disabled={coveredByAncestor}
          onClick={e => e.stopPropagation()}
          onChange={() => {
            if (!coveredByAncestor) toggleItem(item);
          }}
        />
        <div className="gdrive-row-icon">
          {item.isFolder ? (
            <FolderOutlined />
          ) : item.iconLink ? (
            <img src={item.iconLink} alt="" />
          ) : (
            getMimeIcon(item.mimeType)
          )}
        </div>
        <div className="gdrive-row-body">
          <p className="gdrive-row-name">{item.name}</p>
          {!item.isFolder && item.size != null && (
            <p className="gdrive-row-meta">
              {(item.size / 1024).toFixed(0)} KB
            </p>
          )}
        </div>
        <div className="gdrive-row-type">{friendlyMime(item)}</div>
        <div className="gdrive-row-time">
          {formatRelativeTime(item.modifiedTime)}
        </div>
      </div>
    );
  };

  const showSearch = config.shouldShowSearch(tab, path);

  return (
    <Wrapper>
      <Tabs
        className="gdrive-tabs"
        value={tab}
        onChange={(_, value) => handleTabChange(value as string)}
        variant="scrollable"
        scrollButtons="auto"
      >
        {config.tabs.map(t => (
          <Tab
            key={t.value}
            value={t.value}
            label={t.label}
            icon={t.icon as never}
            iconPosition="start"
          />
        ))}
      </Tabs>

      <Breadcrumbs items={breadcrumbItems} />

      {showSearch && (
        <div className="gdrive-toolbar">
          <div className={`gdrive-search ${searchInput ? 'has-value' : ''}`}>
            <Search />
            <input
              type="text"
              placeholder="Search across this tab"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <IconButton
                className="gdrive-search-clear"
                size="small"
                aria-label="Clear search"
                onClick={resetSearch}
              >
                <Close fontSize="small" />
              </IconButton>
            )}
          </div>
          {selected.size > 0 && (
            <span className="gdrive-selection-info">
              {selected.size} selected
            </span>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="gdrive-selected-tray">
          <div className="gdrive-selected-list">
            {Array.from(selected.values()).map(item => (
              <div
                key={itemKey(item)}
                className="gdrive-selected-chip"
                title={item.name}
              >
                <span className="gdrive-chip-icon">
                  {item.isFolder ? (
                    <FolderOutlined fontSize="inherit" />
                  ) : item.iconLink ? (
                    <img src={item.iconLink} alt="" />
                  ) : (
                    getMimeIcon(item.mimeType)
                  )}
                </span>
                <span className="gdrive-chip-name">{item.name}</span>
                <IconButton
                  className="gdrive-chip-remove"
                  size="small"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => toggleItem(item)}
                >
                  <Close fontSize="inherit" />
                </IconButton>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="gdrive-selected-clear"
            onClick={() => updateSelected(new Map())}
          >
            Clear all
          </button>
        </div>
      )}

      {error && (
        <div className="gdrive-error" role="alert">
          <ErrorOutline fontSize="small" style={{ verticalAlign: 'middle' }} />{' '}
          {error}
        </div>
      )}

      <div className="gdrive-list">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="gdrive-row" style={{ cursor: 'default' }}>
              <Skeleton variant="rounded" width={18} height={18} />
              <Skeleton variant="rounded" width={20} height={20} />
              <Skeleton variant="text" width="60%" height={14} />
              <Skeleton variant="text" width="80%" height={12} />
              <Skeleton variant="text" width="60%" height={12} />
            </div>
          ))}

        {!loading && items.length === 0 && !error && (
          <div className="gdrive-empty">
            <FolderOutlined />
            <p>{emptyText}</p>
          </div>
        )}

        {!loading && items.map(renderRow)}
      </div>
    </Wrapper>
  );
};
