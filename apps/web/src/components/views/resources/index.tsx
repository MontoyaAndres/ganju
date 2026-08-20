import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import {
  Add,
  Close,
  DeleteOutlined,
  EditOutlined,
  ArrowBack,
  OpenInNew,
  UploadFile,
  TextFields,
  ExpandMore,
  ExpandLess,
  RemoveCircleOutlined,
  FolderOpenOutlined,
  LanguageOutlined,
  ViewListOutlined,
  GridViewOutlined,
  Search,
  Sync,
  PictureAsPdfOutlined,
  DescriptionOutlined,
  TableChartOutlined,
  SlideshowOutlined,
  ImageOutlined,
  TextSnippetOutlined,
  InsertDriveFileOutlined,
  AudiotrackOutlined,
  VideoFileOutlined
} from '@mui/icons-material';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';

import { Wrapper } from './styles';
import { i18n } from '../../../lib';

import type { CloudDriveItem } from '@ganju/ui';
import type { Translate } from '../../../lib';

interface Resource {
  id: string;
  title: string;
  uri: string;
  type: string;
  sourceType: string;
  status: string;
  showSource: string;
  description: string | null;
  mimeType: (typeof utils.constants.MIMETYPES)[0];
  content: string | null;
  size: number;
  encoding: string | null;
  fileKey: string | null;
  fileName: string | null;
  annotations: Record<string, unknown> | null;
  icons: { src: string }[] | null;
  metadata: Record<string, unknown> | null;
  crawlConfig: { maxPages?: number; maxDepth?: number } | null;
  parentResourceId: string | null;
  childResourceCount: number;
  artifactId: string;
  createdAt: string;
  updatedAt: string;
}

type ViewMode = 'sources' | 'all';
type FolderId = 'files' | 'websites' | 'gdrive' | 'onedrive' | null;
type AddingType = 'file' | 'website' | null;

const isFolderResource = (resource: {
  sourceType: string;
  parentResourceId: string | null;
}): boolean => {
  if (
    resource.sourceType ===
      utils.constants.RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER ||
    resource.sourceType ===
      utils.constants.RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER
  ) {
    return true;
  }
  if (
    resource.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE &&
    !resource.parentResourceId
  ) {
    return true;
  }
  return false;
};

const isGoogleDriveResource = (resource: {
  sourceType: string;
  metadata: Record<string, unknown> | null;
}): boolean => {
  if (
    resource.sourceType ===
    utils.constants.RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER
  ) {
    return true;
  }
  const meta = resource.metadata as { driveFileId?: string } | null;
  return !!meta?.driveFileId;
};

const isOneDriveResource = (resource: {
  sourceType: string;
  metadata: Record<string, unknown> | null;
}): boolean => {
  if (
    resource.sourceType ===
    utils.constants.RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER
  ) {
    return true;
  }
  const meta = resource.metadata as { oneDriveItemId?: string } | null;
  return !!meta?.oneDriveItemId;
};

const ResourceFavicon = ({ favicon }: { favicon: string | null }) => {
  const [errored, setErrored] = useState(false);
  if (!favicon || errored) return <LanguageOutlined />;
  return (
    <img
      src={favicon}
      alt=""
      className="resource-item-favicon"
      onError={() => setErrored(true)}
    />
  );
};

const ResourceIconLink = ({ src }: { src: string }) => {
  const [errored, setErrored] = useState(false);
  if (errored) return <InsertDriveFileOutlined />;
  return (
    <img
      src={src}
      alt=""
      className="resource-item-iconlink"
      onError={() => setErrored(true)}
    />
  );
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

const getResourceIcon = (resource: {
  sourceType: string;
  mimeType: string;
  metadata: Record<string, unknown> | null;
}) => {
  if (
    resource.sourceType ===
      utils.constants.RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER ||
    resource.sourceType ===
      utils.constants.RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER
  ) {
    return <FolderOpenOutlined />;
  }
  const meta = resource.metadata as { iconLink?: string } | null;
  if (meta?.iconLink) {
    return <ResourceIconLink src={meta.iconLink} />;
  }
  return getMimeIcon(resource.mimeType);
};

/**
 * Values the API sends, mapped to a catalog key rather than to a string, so the
 * badge reads as words in either language while the wire keeps `FILE` and
 * `static`. An unrecognised value falls back to what the API said.
 */
type ResourcesT = Translate<(typeof i18n.copy.RESOURCES)['en']>;

const SOURCE_TYPE_KEY = {
  [utils.constants.RESOURCE_SOURCE_TYPE_FILE]: 'sourceTypeFile',
  [utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE]: 'sourceTypeWebsite',
  [utils.constants.RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER]:
    'sourceTypeGoogleDrive',
  [utils.constants.RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER]: 'sourceTypeOneDrive',
  [utils.constants.RESOURCE_SOURCE_TYPE_CUSTOM_CODE]: 'sourceTypeCustomCode'
} as const satisfies Record<string, keyof (typeof i18n.copy.RESOURCES)['en']>;

const TYPE_KEY = {
  [utils.constants.RESOURCE_TYPE_STATIC]: 'typeStaticBadge',
  [utils.constants.RESOURCE_TYPE_TEMPLATE]: 'typeTemplateBadge'
} as const satisfies Record<string, keyof (typeof i18n.copy.RESOURCES)['en']>;

const labelFor = (
  map: Record<string, keyof (typeof i18n.copy.RESOURCES)['en']>,
  value: string,
  t: ResourcesT
): string => {
  const key = map[value];
  return key ? t(key) : value;
};

const INITIAL_FILE_VALUES = {
  title: '',
  uri: '',
  type: 'static',
  description: '',
  mimeType: utils.constants.MIMETYPE_TEXT as string,
  content: '',
  size: '0',
  encoding: 'utf-8'
};

const INITIAL_WEBSITE_VALUES = {
  title: '',
  uri: '',
  description: '',
  maxPages: String(utils.constants.CRAWL_DEFAULT_MAX_PAGES),
  maxDepth: String(utils.constants.CRAWL_DEFAULT_MAX_DEPTH)
};

export const Resources = () => {
  const router = useRouter();
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.RESOURCES);
  const c = i18n.useT(i18n.copy.COMMON);
  const driveLabels = {
    empty: t('uiDriveEmpty'),
    sessionExpired: t('uiDriveSessionExpired'),
    loadError: t('uiDriveLoadError'),
    search: t('uiDriveSearch'),
    clearSearch: t('uiDriveClearSearch'),
    clearAll: t('uiDriveClearAll'),
    folder: t('uiDriveFolder'),
    file: t('uiDriveFile'),
    tabs: {
      [utils.constants.GOOGLE_DRIVE_TAB_MY_DRIVE]: t('uiDriveTabMyDrive'),
      [utils.constants.GOOGLE_DRIVE_TAB_SHARED_WITH_ME]: t(
        'uiDriveTabSharedWithMe'
      ),
      [utils.constants.GOOGLE_DRIVE_TAB_SHARED_DRIVES]: t(
        'uiDriveTabSharedDrives'
      ),
      [utils.constants.GOOGLE_DRIVE_TAB_STARRED]: t('uiDriveTabStarred'),
      [utils.constants.ONE_DRIVE_TAB_MY_FILES]: t('uiDriveTabMyFiles'),
      [utils.constants.ONE_DRIVE_TAB_RECENT]: t('uiDriveTabRecent'),
      [utils.constants.ONE_DRIVE_TAB_DRIVES]: t('uiDriveTabDrives')
    },
    selectedCount: (count: number) => t.plural('uiDriveSelected', count),
    remove: (name: string) => t('uiDriveRemove', { name }),
    alreadyIncluded: (name: string) => t('uiDriveAlreadyIncluded', { name })
  };
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    null
  );
  const [isEditing, setIsEditing] = useState(false);
  const [addingType, setAddingType] = useState<AddingType>(null);
  const [view, setView] = useState<ViewMode>('sources');
  const [folder, setFolder] = useState<FolderId>(null);
  const [search, setSearch] = useState('');
  const [uriTouched, setUriTouched] = useState(false);
  const [editValues, setEditValues] = useState(INITIAL_FILE_VALUES);
  const [websiteValues, setWebsiteValues] = useState(INITIAL_WEBSITE_VALUES);
  const [status, setStatus] = useState<
    'idle' | 'pending' | 'resolved' | 'rejected'
  >('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteAlert, setDeleteAlert] = useState(false);
  const [resourceToDelete, setResourceToDelete] = useState<Resource | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [sourceVisibilityUpdating, setSourceVisibilityUpdating] =
    useState(false);
  const [contentMode, setContentMode] = useState<'text' | 'file'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [filePreviewError, setFilePreviewError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );
  const [annotations, setAnnotations] = useState<{
    audience: string[];
    priority: string;
  }>({ audience: [], priority: '' });
  const [icons, setIcons] = useState<{ src: string; theme: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [panelWidth, setPanelWidth] = useState(480);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const { id: organizationId, projectId } = router.query as {
    id: string;
    projectId: string;
  };
  const hasPendingResources = resources.some(
    r => r.status === utils.constants.STATUS_PENDING
  );
  const apiBase = `/organization/${organizationId}/project/${projectId}/artifact/resource`;
  const gdriveApiBase = `/organization/${organizationId}/project/${projectId}/artifact/google-drive`;
  const onedriveApiBase = `/organization/${organizationId}/project/${projectId}/artifact/one-drive`;
  const isCreating = addingType !== null;

  const [gdriveOpen, setGdriveOpen] = useState(false);
  const [gdriveToken, setGdriveToken] = useState<string | null>(null);
  const [gdriveLoadingToken, setGdriveLoadingToken] = useState(false);
  const [gdriveSelected, setGdriveSelected] = useState<
    Map<string, CloudDriveItem>
  >(new Map());
  const [gdriveImporting, setGdriveImporting] = useState(false);
  const [gdriveSyncingId, setGdriveSyncingId] = useState<string | null>(null);

  const [onedriveOpen, setOnedriveOpen] = useState(false);
  const [onedriveToken, setOnedriveToken] = useState<string | null>(null);
  const [onedriveLoadingToken, setOnedriveLoadingToken] = useState(false);
  const [onedriveSelected, setOnedriveSelected] = useState<
    Map<string, CloudDriveItem>
  >(new Map());
  const [onedriveImporting, setOnedriveImporting] = useState(false);
  const [onedriveSyncingId, setOnedriveSyncingId] = useState<string | null>(
    null
  );

  const fileResources = useMemo(
    () =>
      resources.filter(
        r =>
          (r.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_FILE ||
            r.sourceType ===
              utils.constants.RESOURCE_SOURCE_TYPE_CUSTOM_CODE) &&
          !isGoogleDriveResource(r) &&
          !isOneDriveResource(r)
      ),
    [resources]
  );

  const gdriveTopResources = useMemo(
    () =>
      resources.filter(r => !r.parentResourceId && isGoogleDriveResource(r)),
    [resources]
  );

  const gdriveChildrenTotal = useMemo(
    () =>
      gdriveTopResources.reduce(
        (total, r) => total + (r.childResourceCount ?? 0),
        0
      ),
    [gdriveTopResources]
  );

  const onedriveTopResources = useMemo(
    () => resources.filter(r => !r.parentResourceId && isOneDriveResource(r)),
    [resources]
  );

  const onedriveChildrenTotal = useMemo(
    () =>
      onedriveTopResources.reduce(
        (total, r) => total + (r.childResourceCount ?? 0),
        0
      ),
    [onedriveTopResources]
  );

  const websiteParents = useMemo(
    () =>
      resources.filter(
        r =>
          r.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE &&
          !r.parentResourceId
      ),
    [resources]
  );

  const websitePagesCount = useMemo(
    () =>
      websiteParents.reduce(
        (total, w) => total + (w.childResourceCount ?? 0),
        0
      ),
    [websiteParents]
  );

  const [childrenByParent, setChildrenByParent] = useState<
    Record<string, Resource[]>
  >({});
  const [loadingChildrenIds, setLoadingChildrenIds] = useState<Set<string>>(
    new Set()
  );
  const [folderPath, setFolderPath] = useState<string[]>([]);
  const currentFolderId = folderPath[folderPath.length - 1] || null;

  const findResourceById = (id: string): Resource | undefined => {
    const top = resources.find(r => r.id === id);
    if (top) return top;
    for (const list of Object.values(childrenByParent)) {
      const found = list.find(r => r.id === id);
      if (found) return found;
    }
    return undefined;
  };

  const computeAncestry = (resourceId: string): string[] => {
    const chain: string[] = [];
    const seen = new Set<string>();
    let cursor: Resource | undefined = findResourceById(resourceId);
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      chain.unshift(cursor.id);
      if (!cursor.parentResourceId) break;
      cursor = findResourceById(cursor.parentResourceId);
    }
    return chain;
  };

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list: Resource[];
    if (currentFolderId) {
      list = childrenByParent[currentFolderId] || [];
    } else if (view === 'all') {
      list = resources.filter(r => !r.parentResourceId);
    } else if (folder === 'files') {
      list = fileResources;
    } else if (folder === 'websites') {
      list = websiteParents;
    } else if (folder === 'gdrive') {
      list = gdriveTopResources;
    } else if (folder === 'onedrive') {
      list = onedriveTopResources;
    } else {
      list = [];
    }
    if (!q) return list;
    return list.filter(
      r =>
        r.title.toLowerCase().includes(q) ||
        r.uri.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
    );
  }, [
    view,
    folder,
    currentFolderId,
    childrenByParent,
    fileResources,
    websiteParents,
    gdriveTopResources,
    onedriveTopResources,
    resources,
    search
  ]);

  const getFavicon = (resource: Resource): string | null => {
    const seo = (resource.metadata as { seo?: { favicon?: string } } | null)
      ?.seo;
    if (seo?.favicon) return seo.favicon;
    if (
      resource.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE &&
      !resource.parentResourceId
    ) {
      const children = childrenByParent[resource.id] || [];
      for (const child of children) {
        const childSeo = (
          child.metadata as { seo?: { favicon?: string } } | null
        )?.seo;
        if (childSeo?.favicon) return childSeo.favicon;
      }
    }
    return null;
  };

  const fetchResources = async (signal?: AbortSignal) => {
    if (!organizationId || !projectId) return;
    setStatus('pending');
    try {
      const data = await utils.fetcher({
        url: apiBase,
        config: { credentials: 'include', signal }
      });
      if (signal?.aborted) return;
      if (data && !data.error) {
        setResources(data);
        setSelectedResource(prev =>
          prev ? (data.find((r: Resource) => r.id === prev.id) ?? prev) : prev
        );
      }
      setStatus('resolved');
    } catch {
      if (!signal?.aborted) setStatus('rejected');
    }
  };

  const fetchChildren = async (parentId: string, signal?: AbortSignal) => {
    setLoadingChildrenIds(prev => {
      if (prev.has(parentId)) return prev;
      const next = new Set(prev);
      next.add(parentId);
      return next;
    });
    try {
      const data = await utils.fetcher({
        url: `${apiBase}?parentResourceId=${parentId}`,
        config: { credentials: 'include', signal }
      });
      if (signal?.aborted) return;
      if (Array.isArray(data)) {
        setChildrenByParent(prev => ({ ...prev, [parentId]: data }));
        setSelectedResource(prev =>
          prev && prev.parentResourceId === parentId
            ? (data.find((r: Resource) => r.id === prev.id) ?? prev)
            : prev
        );
      }
    } catch {
      // ignore — UI keeps showing previous data
    } finally {
      if (!signal?.aborted) {
        setLoadingChildrenIds(prev => {
          if (!prev.has(parentId)) return prev;
          const next = new Set(prev);
          next.delete(parentId);
          return next;
        });
      }
    }
  };

  useEffect(() => {
    if (!organizationId || !projectId) return;
    const controller = new AbortController();
    fetchResources(controller.signal);
    return () => controller.abort();
  }, [organizationId, projectId]);

  const openParentId = (() => {
    if (!selectedResource) return null;
    if (
      selectedResource.sourceType ===
        utils.constants.RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER ||
      selectedResource.sourceType ===
        utils.constants.RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER
    ) {
      return selectedResource.id;
    }
    if (
      selectedResource.sourceType ===
        utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE &&
      !selectedResource.parentResourceId
    ) {
      return selectedResource.id;
    }
    return selectedResource.parentResourceId || null;
  })();

  useEffect(() => {
    if (!openParentId) return;
    if (childrenByParent[openParentId]) return;
    const controller = new AbortController();
    fetchChildren(openParentId, controller.signal);
    return () => controller.abort();
  }, [openParentId]);

  useEffect(() => {
    if (!currentFolderId) return;
    if (childrenByParent[currentFolderId]) return;
    const controller = new AbortController();
    fetchChildren(currentFolderId, controller.signal);
    return () => controller.abort();
  }, [currentFolderId]);

  useEffect(() => {
    setFolderPath([]);
  }, [folder, view]);

  const openParentRecord = openParentId
    ? resources.find(r => r.id === openParentId)
    : null;
  const openChildren = openParentId ? childrenByParent[openParentId] || [] : [];
  const openParentPending =
    openParentRecord?.status === utils.constants.STATUS_PENDING;
  const openChildrenPending = openChildren.some(
    c => c.status === utils.constants.STATUS_PENDING
  );

  useEffect(() => {
    if (!hasPendingResources && !openParentPending && !openChildrenPending)
      return;
    const interval = setInterval(() => {
      if (hasPendingResources) fetchResources();
      if (openParentId && (openParentPending || openChildrenPending)) {
        fetchChildren(openParentId);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [
    hasPendingResources,
    openParentPending,
    openChildrenPending,
    openParentId
  ]);

  useEffect(() => {
    const requestedId = router.query.selected;
    if (typeof requestedId !== 'string' || !resources.length) return;
    const match = resources.find(r => r.id === requestedId);
    if (!match) return;
    if (view === 'sources') {
      if (isGoogleDriveResource(match)) {
        setFolder('gdrive');
      } else if (isOneDriveResource(match)) {
        setFolder('onedrive');
      } else if (
        match.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE
      ) {
        setFolder('websites');
      } else if (
        match.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_FILE
      ) {
        setFolder('files');
      }
    }
    if (isFolderResource(match)) {
      setFolderPath(computeAncestry(match.id));
      setSelectedResource(null);
      setIsEditing(false);
      setAddingType(null);
      return;
    }
    if (selectedResource?.id !== match.id) {
      setSelectedResource(match);
      setIsEditing(false);
      setAddingType(null);
    }
  }, [router.query.selected, resources]);

  useEffect(() => {
    if (!selectedResource?.fileKey) {
      setFilePreviewUrl(null);
      setFilePreviewError(null);
      return;
    }

    let revoked = false;
    setFilePreviewError(null);

    const fetchFilePreview = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}${apiBase}/${selectedResource.id}/download`,
          { credentials: 'include' }
        );
        if (!response.ok) {
          if (!revoked) setFilePreviewError(t('toastFilePreviewFailed'));
          return;
        }
        const blob = await response.blob();
        if (revoked) return;
        const url = URL.createObjectURL(blob);
        setFilePreviewUrl(url);
      } catch {
        if (!revoked) setFilePreviewError(t('toastFilePreviewFailed'));
      }
    };

    fetchFilePreview();

    return () => {
      revoked = true;
      setFilePreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [selectedResource?.id, selectedResource?.fileKey, apiBase]);

  useEffect(() => {
    setExpandedSections(new Set());
  }, [selectedResource?.id]);

  const renderCollapsibleJson = (
    sectionKey: 'metadata' | 'annotations',
    label: 'sectionMetadata' | 'sectionAnnotations',
    show: 'showMetadata' | 'showAnnotations',
    hide: 'hideMetadata' | 'hideAnnotations',
    value: unknown,
    threshold = 600
  ) => {
    const json = JSON.stringify(value, null, 2);
    const isLarge = json.length > threshold;
    const expanded = expandedSections.has(sectionKey);
    return (
      <div className="panel-section">
        <h3 className="panel-section-label">{t(label)}</h3>
        {isLarge && !expanded ? (
          <button
            type="button"
            className="panel-section-toggle"
            onClick={() =>
              setExpandedSections(prev => {
                const next = new Set(prev);
                next.add(sectionKey);
                return next;
              })
            }
          >
            {t(show, { count: t.n(json.length) })}
          </button>
        ) : (
          <>
            <pre className="panel-content-pre">{json}</pre>
            {isLarge && (
              <button
                type="button"
                className="panel-section-toggle"
                onClick={() =>
                  setExpandedSections(prev => {
                    const next = new Set(prev);
                    next.delete(sectionKey);
                    return next;
                  })
                }
              >
                {t(hide)}
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  const fetchResourceDetail = async (resourceId: string) => {
    try {
      const data = await utils.fetcher({
        url: `${apiBase}/${resourceId}`,
        config: { credentials: 'include' }
      });
      if (data && !data.error) {
        setSelectedResource(prev =>
          prev && prev.id === resourceId ? data : prev
        );
      }
    } catch {
      // best-effort — keep showing the cached row
    }
  };

  const handleSelect = (resource: Resource) => {
    if (isFolderResource(resource)) {
      setFolderPath(computeAncestry(resource.id));
      setSelectedResource(null);
      setIsEditing(false);
      setAddingType(null);
      return;
    }
    setSelectedResource(resource);
    setIsEditing(false);
    setAddingType(null);
    fetchResourceDetail(resource.id);
  };

  const startCreate = (type: 'file' | 'website') => {
    setSelectedResource(null);
    setIsEditing(false);
    setAddingType(type);
    setShowAdvanced(false);
    setAnnotations({ audience: [], priority: '' });
    setIcons([]);
    setUriTouched(false);
    setErrors({});
    if (type === 'file') {
      setEditValues(INITIAL_FILE_VALUES);
      setContentMode('file');
      setFile(null);
    } else {
      setWebsiteValues(INITIAL_WEBSITE_VALUES);
    }
  };

  const buildFileBody = () => ({
    title: editValues.title,
    uri: editValues.uri,
    type: editValues.type,
    sourceType: utils.constants.RESOURCE_SOURCE_TYPE_FILE,
    description: editValues.description,
    mimeType: editValues.mimeType,
    content:
      contentMode === 'text' ? editValues.content || undefined : undefined,
    size: Number(editValues.size),
    encoding: editValues.encoding || undefined,
    fileName:
      contentMode === 'file'
        ? file?.name || selectedResource?.fileName || undefined
        : undefined,
    ...buildAdvancedFields()
  });

  const buildWebsiteCreateBody = () => ({
    title: websiteValues.title.trim(),
    uri: websiteValues.uri.trim(),
    sourceType: utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE,
    description: websiteValues.description || undefined,
    crawlConfig: {
      maxPages: Number(websiteValues.maxPages),
      maxDepth: Number(websiteValues.maxDepth)
    }
  });

  const buildWebsiteUpdateBody = () => ({
    title: websiteValues.title.trim(),
    description: websiteValues.description || undefined
  });

  const parseZodErrors = (err: unknown) => {
    if (
      err &&
      typeof err === 'object' &&
      'issues' in err &&
      Array.isArray((err as { issues: unknown[] }).issues)
    ) {
      const formatted = (
        err as { issues: { path: string[]; message: string }[] }
      ).issues.reduce(
        (acc, curr) => ({
          ...acc,
          [curr.path[0]]: utils.localizeZodIssue(curr, t.lang)
        }),
        {} as Record<string, string>
      );
      setErrors(formatted);
    }
  };

  type ResourceKind = 'file' | 'website';
  type SubmitMode = 'create' | 'update';

  interface KindOps {
    validate: () => Promise<boolean>;
    buildBody: () => Record<string, unknown>;
    afterPersist?: (resourceId: string) => Promise<void>;
  }

  const runValidation = async (
    schema: { parseAsync: (data: unknown) => Promise<unknown> },
    data: unknown
  ): Promise<boolean> => {
    try {
      await schema.parseAsync(data);
      setErrors({});
      return true;
    } catch (err) {
      parseZodErrors(err);
      return false;
    }
  };

  const fileOps = (mode: SubmitMode): KindOps => ({
    validate: () =>
      runValidation(
        mode === 'create'
          ? utils.Schema.ARTIFACT_CREATE_RESOURCE_VIEW
          : utils.Schema.ARTIFACT_UPDATE_RESOURCE_VIEW,
        buildFileBody()
      ),
    buildBody: buildFileBody,
    afterPersist: async resourceId => {
      if (contentMode === 'file' && file) await uploadFile(resourceId);
    }
  });

  const websiteOps = (mode: SubmitMode): KindOps =>
    mode === 'create'
      ? {
          validate: () =>
            runValidation(utils.Schema.ARTIFACT_CREATE_WEBSITE_VIEW, {
              title: websiteValues.title.trim(),
              uri: websiteValues.uri.trim(),
              description: websiteValues.description || undefined,
              maxPages: Number(websiteValues.maxPages),
              maxDepth: Number(websiteValues.maxDepth)
            }),
          buildBody: buildWebsiteCreateBody
        }
      : {
          validate: () =>
            runValidation(utils.Schema.ARTIFACT_UPDATE_WEBSITE_VIEW, {
              title: websiteValues.title.trim(),
              description: websiteValues.description || undefined
            }),
          buildBody: buildWebsiteUpdateBody
        };

  const opsFor = (kind: ResourceKind, mode: SubmitMode): KindOps =>
    kind === 'website' ? websiteOps(mode) : fileOps(mode);

  const kindOf = (resource: { sourceType: string } | null): ResourceKind =>
    resource?.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE
      ? 'website'
      : 'file';

  const handleCreateSubmit = async () => {
    if (submitting || !addingType) return;
    const ops = opsFor(addingType, 'create');
    if (!(await ops.validate())) return;

    setSubmitting(true);
    try {
      const data = await utils.fetcher({
        url: apiBase,
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify(ops.buildBody())
        }
      });

      if (data && !data.error) {
        if (ops.afterPersist) await ops.afterPersist(data.id);
        setAddingType(null);
        setFile(null);
        fetchResources();
        if (addingType === 'website') {
          setSelectedResource(null);
          setIsEditing(false);
          setFolderPath([data.id]);
          fetchChildren(data.id);
        } else {
          setSelectedResource(data);
        }
        snackbar.success(
          t(addingType === 'website' ? 'toastCrawlStarted' : 'toastCreated')
        );
      } else {
        snackbar.error(data?.error || t('toastCreateFailed'));
      }
    } catch {
      snackbar.error(t('toastCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = () => {
    if (!selectedResource) return;
    if (
      selectedResource.sourceType ===
      utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE
    ) {
      setWebsiteValues({
        title: selectedResource.title,
        uri: selectedResource.uri,
        description: selectedResource.description || '',
        maxPages: String(
          selectedResource.crawlConfig?.maxPages ??
            utils.constants.CRAWL_DEFAULT_MAX_PAGES
        ),
        maxDepth: String(
          selectedResource.crawlConfig?.maxDepth ??
            utils.constants.CRAWL_DEFAULT_MAX_DEPTH
        )
      });
      setShowAdvanced(false);
      setIsEditing(true);
      return;
    }
    setEditValues({
      title: selectedResource.title,
      uri: selectedResource.uri,
      type: selectedResource.type,
      description: selectedResource.description || '',
      mimeType: selectedResource.mimeType,
      content: selectedResource.content || '',
      size: String(selectedResource.size || 0),
      encoding: selectedResource.encoding || ''
    });
    setContentMode(selectedResource.fileKey ? 'file' : 'text');
    setFile(null);
    const ann = selectedResource.annotations as Record<string, unknown> | null;
    setAnnotations({
      audience: Array.isArray(ann?.audience) ? (ann.audience as string[]) : [],
      priority: ann?.priority != null ? String(ann.priority) : ''
    });
    const icn = selectedResource.icons as
      | { src: string; theme?: string }[]
      | null;
    setIcons(
      Array.isArray(icn)
        ? icn.map(i => ({ src: i.src, theme: i.theme || '' }))
        : []
    );
    setShowAdvanced(false);
    setUriTouched(true);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (isCreating) setAddingType(null);
  };

  const handleClose = () => {
    setSelectedResource(null);
    setIsEditing(false);
    setAddingType(null);
  };

  const handleShowSourceToggle = async () => {
    if (!selectedResource || sourceVisibilityUpdating) return;
    const enabled = utils.isResourceSourceEnabled(selectedResource);
    const next = enabled
      ? utils.constants.STATUS_DISABLED
      : utils.constants.STATUS_ACTIVE;
    setSourceVisibilityUpdating(true);
    try {
      const data = await utils.fetcher({
        url: `${apiBase}/${selectedResource.id}/show-source`,
        config: {
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify({ showSource: next })
        }
      });
      if (data && !data.error) {
        setSelectedResource(data);
        fetchResources();
        snackbar.success(
          next === utils.constants.STATUS_ACTIVE
            ? t('toastSourcesEnabled')
            : t('toastSourcesHidden')
        );
      } else {
        snackbar.error(data?.error || t('toastSourcesFailed'));
      }
    } catch {
      snackbar.error(t('toastSourcesFailed'));
    } finally {
      setSourceVisibilityUpdating(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedResource || submitting) return;
    const ops = opsFor(kindOf(selectedResource), 'update');
    if (!(await ops.validate())) return;

    setSubmitting(true);
    try {
      const data = await utils.fetcher({
        url: `${apiBase}/${selectedResource.id}`,
        config: {
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify(ops.buildBody())
        }
      });

      if (data && !data.error) {
        if (ops.afterPersist) await ops.afterPersist(data.id);
        setSelectedResource(data);
        setFile(null);
        setIsEditing(false);
        fetchResources();
        snackbar.success(t('toastUpdated'));
      } else {
        snackbar.error(data?.error || t('toastUpdateFailed'));
      }
    } catch {
      snackbar.error(t('toastUpdateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const buildAdvancedFields = () => {
    const result: Record<string, unknown> = {};
    if (annotations.audience.length > 0 || annotations.priority !== '') {
      result.annotations = {
        ...(annotations.audience.length > 0 && {
          audience: annotations.audience
        }),
        ...(annotations.priority !== '' && {
          priority: Number(annotations.priority)
        })
      };
    }
    if (icons.length > 0 && icons.some(i => i.src)) {
      result.icons = icons
        .filter(i => i.src)
        .map(i => ({
          src: i.src,
          ...(i.theme && { theme: i.theme })
        }));
    }
    return result;
  };

  const handleDeleteClick = () => {
    if (!selectedResource) return;
    setResourceToDelete(selectedResource);
    setDeleteAlert(true);
  };

  const handleDeleteRow = (e: React.MouseEvent, resource: Resource) => {
    e.stopPropagation();
    setResourceToDelete(resource);
    setDeleteAlert(true);
  };

  const handleDeleteConfirm = async () => {
    if (!resourceToDelete || submitting) return;
    const target = resourceToDelete;
    setSubmitting(true);
    try {
      const data = await utils.fetcher({
        url: `${apiBase}/${target.id}`,
        config: { method: 'DELETE', credentials: 'include' }
      });
      if (data && !data.error) {
        setDeleteAlert(false);
        setResourceToDelete(null);
        if (selectedResource?.id === target.id) {
          setSelectedResource(null);
          setIsEditing(false);
        }
        const folderIdx = folderPath.indexOf(target.id);
        if (folderIdx !== -1) {
          setFolderPath(prev => prev.slice(0, folderIdx));
        }
        fetchResources();
        snackbar.success(t('toastDeleted'));
      } else {
        snackbar.error(data?.error || t('toastDeleteFailed'));
      }
    } catch {
      snackbar.error(t('toastDeleteFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewFile = () => {
    if (filePreviewUrl) window.open(filePreviewUrl, '_blank');
  };

  const isImageMime = (mime: string) => mime.startsWith('image/');

  const titleToUri = utils.resourceUriFromTitle;

  // Its own B→GB ladder rather than `t.bytes`, which floors at MB, and its own
  // `B`/`KB` rather than CLDR's `byte`/`kB` — the same call `overview` makes.
  // Only the number goes through `Intl`, which is the part that was wrong:
  // `.toFixed(1)` hands a Spanish reader `1.5`.
  const formatSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB'];
    if (!bytes || bytes <= 0) return `${t.n(0)} ${units[0]}`;
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const decimals = i === 0 ? 0 : 1;
    return `${t.n(bytes / Math.pow(1024, i), {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })} ${units[i]}`;
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleResizeMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const diff = startX.current - moveEvent.clientX;
      const newWidth = Math.max(
        360,
        Math.min(startWidth.current + diff, window.innerWidth - 300)
      );
      setPanelWidth(newWidth);
    };

    const handleResizeEnd = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name === 'uri') setUriTouched(true);
    setEditValues(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'title' && !uriTouched) {
        next.uri = titleToUri(value);
      }
      return next;
    });
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleWebsiteChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setWebsiteValues(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.size > utils.constants.MAX_FILE_SIZE) {
      setErrors(prev => ({
        ...prev,
        file: t('errorFileTooLarge', {
          size: utils.constants.MAX_FILE_SIZE / (1024 * 1024)
        })
      }));
      e.target.value = '';
      return;
    }

    const detectedMime =
      selected.type || utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM;
    if (
      !(utils.constants.MIMETYPES as readonly string[]).includes(detectedMime)
    ) {
      setErrors(prev => ({
        ...prev,
        file: t('errorFileType', { type: detectedMime })
      }));
      e.target.value = '';
      return;
    }

    setErrors(prev => {
      const next = { ...prev };
      delete next.file;
      delete next.mimeType;
      delete next.size;
      return next;
    });
    setFile(selected);
    const nameWithoutExt = selected.name.replace(/\.[^.]+$/, '');
    setEditValues(prev => {
      const next = {
        ...prev,
        mimeType: detectedMime,
        size: String(selected.size),
        title: prev.title || nameWithoutExt
      };
      if (!uriTouched) {
        next.uri = `resource://${selected.name
          .toLowerCase()
          .replace(/[^a-z0-9.]+/g, '-')
          .replace(/^-|-$/g, '')}`;
      }
      return next;
    });
  };

  const handleContentChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const value = e.target.value;
    const size = new TextEncoder().encode(value).length;
    setEditValues(prev => ({ ...prev, content: value, size: String(size) }));
  };

  const uploadFile = async (resourceId: string) => {
    if (!file) return;
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}${apiBase}/${resourceId}/upload`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type':
            file.type || utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM,
          'x-file-name': encodeURIComponent(file.name)
        },
        body: file
      }
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        detail || t('errorUploadFailed', { status: response.status })
      );
    }
    return await response.json();
  };

  const startGoogleDriveConnect = async () => {
    try {
      const data = await utils.fetcher({
        url: `/oauth/${utils.constants.OAUTH_PROVIDER_GOOGLE_DRIVE}/authorize?organizationId=${organizationId}&projectId=${projectId}`,
        config: { credentials: 'include' }
      });
      if (data?.url) {
        window.location.href = data.url;
      } else {
        snackbar.error(t('toastGdriveConnectFailed'));
      }
    } catch {
      snackbar.error(t('toastGdriveConnectFailed'));
    }
  };

  const handleOpenGoogleDrive = async () => {
    if (gdriveLoadingToken) return;
    setGdriveLoadingToken(true);
    try {
      const data = await utils.fetcher({
        url: `${gdriveApiBase}/token`,
        config: { credentials: 'include' }
      });
      if (data?.error) {
        snackbar.error(t('toastGdriveConnectToImport'));
        await startGoogleDriveConnect();
        return;
      }
      if (data?.accessToken) {
        setGdriveToken(data.accessToken);
        setGdriveSelected(new Map());
        setGdriveOpen(true);
      } else {
        await startGoogleDriveConnect();
      }
    } catch {
      snackbar.error(t('toastGdriveOpenFailed'));
    } finally {
      setGdriveLoadingToken(false);
    }
  };

  const handleGoogleDriveImport = async () => {
    if (gdriveImporting || gdriveSelected.size === 0) return;
    setGdriveImporting(true);
    try {
      const items = Array.from(gdriveSelected.values()).map(item => ({
        fileId: item.id,
        name: item.name,
        mimeType: item.mimeType,
        isFolder: item.isFolder,
        iconLink: item.iconLink,
        webViewLink: item.webUrl,
        modifiedTime: item.modifiedTime,
        size: item.size
      }));
      const data = await utils.fetcher({
        url: gdriveApiBase,
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ items })
        }
      });
      if (data && !data.error) {
        setGdriveOpen(false);
        setGdriveSelected(new Map());
        setFolder('gdrive');
        fetchResources();
        const count = items.length;
        snackbar.success(t.plural('toastImportingGdrive', count));
      } else {
        snackbar.error(data?.error || t('toastGdriveImportFailed'));
      }
    } catch {
      snackbar.error(t('toastGdriveImportFailed'));
    } finally {
      setGdriveImporting(false);
    }
  };

  const handleGoogleDriveSync = async () => {
    if (gdriveSyncingId) return;
    const currentFolder = currentFolderId
      ? findResourceById(currentFolderId)
      : null;
    const targets =
      currentFolder && isGoogleDriveResource(currentFolder)
        ? [currentFolder]
        : gdriveTopResources;
    if (targets.length === 0) {
      snackbar.error(t('toastNothingToSync'));
      return;
    }
    try {
      const tokenData = await utils.fetcher({
        url: `${gdriveApiBase}/token`,
        config: { credentials: 'include' }
      });
      if (tokenData?.error || !tokenData?.accessToken) {
        snackbar.error(t('toastGdriveConnectToSync'));
        await startGoogleDriveConnect();
        return;
      }
    } catch {
      snackbar.error(t('toastGdriveConnectToSync'));
      await startGoogleDriveConnect();
      return;
    }
    setGdriveSyncingId(currentFolder?.id ?? '__all__');
    try {
      const results = await Promise.allSettled(
        targets.map(t =>
          utils.fetcher({
            url: `${gdriveApiBase}/${t.id}/sync`,
            config: { method: 'POST', credentials: 'include' }
          })
        )
      );
      fetchResources();
      if (currentFolderId) fetchChildren(currentFolderId);
      const failed = results.filter(
        r =>
          r.status === 'rejected' ||
          (r.status === 'fulfilled' && r.value?.error)
      ).length;
      if (failed > 0) {
        snackbar.error(t.plural('toastSyncFailed', failed));
      } else {
        snackbar.success(t('toastSyncStarted'));
      }
    } finally {
      setGdriveSyncingId(null);
    }
  };

  const startOneDriveConnect = async () => {
    try {
      const data = await utils.fetcher({
        url: `/oauth/${utils.constants.OAUTH_PROVIDER_ONE_DRIVE}/authorize?organizationId=${organizationId}&projectId=${projectId}`,
        config: { credentials: 'include' }
      });
      if (data?.url) {
        window.location.href = data.url;
      } else {
        snackbar.error(t('toastOnedriveConnectFailed'));
      }
    } catch {
      snackbar.error(t('toastOnedriveConnectFailed'));
    }
  };

  const handleOpenOneDrive = async () => {
    if (onedriveLoadingToken) return;
    setOnedriveLoadingToken(true);
    try {
      const data = await utils.fetcher({
        url: `${onedriveApiBase}/token`,
        config: { credentials: 'include' }
      });
      if (data?.error) {
        snackbar.error(t('toastOnedriveConnectToImport'));
        await startOneDriveConnect();
        return;
      }
      if (data?.accessToken) {
        setOnedriveToken(data.accessToken);
        setOnedriveSelected(new Map());
        setOnedriveOpen(true);
      } else {
        await startOneDriveConnect();
      }
    } catch {
      snackbar.error(t('toastOnedriveOpenFailed'));
    } finally {
      setOnedriveLoadingToken(false);
    }
  };

  const handleOneDriveImport = async () => {
    if (onedriveImporting || onedriveSelected.size === 0) return;
    setOnedriveImporting(true);
    try {
      const items = Array.from(onedriveSelected.values()).map(item => ({
        itemId: item.id,
        driveId: item.driveId,
        name: item.name,
        mimeType: item.mimeType,
        isFolder: item.isFolder,
        webUrl: item.webUrl,
        lastModifiedDateTime: item.modifiedTime,
        size: item.size
      }));
      const data = await utils.fetcher({
        url: onedriveApiBase,
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ items })
        }
      });
      if (data && !data.error) {
        setOnedriveOpen(false);
        setOnedriveSelected(new Map());
        setFolder('onedrive');
        fetchResources();
        const count = items.length;
        snackbar.success(t.plural('toastImportingOnedrive', count));
      } else {
        snackbar.error(data?.error || t('toastOnedriveImportFailed'));
      }
    } catch {
      snackbar.error(t('toastOnedriveImportFailed'));
    } finally {
      setOnedriveImporting(false);
    }
  };

  const handleOneDriveSync = async () => {
    if (onedriveSyncingId) return;
    const currentFolder = currentFolderId
      ? findResourceById(currentFolderId)
      : null;
    const targets =
      currentFolder && isOneDriveResource(currentFolder)
        ? [currentFolder]
        : onedriveTopResources;
    if (targets.length === 0) {
      snackbar.error(t('toastNothingToSync'));
      return;
    }
    try {
      const tokenData = await utils.fetcher({
        url: `${onedriveApiBase}/token`,
        config: { credentials: 'include' }
      });
      if (tokenData?.error || !tokenData?.accessToken) {
        snackbar.error(t('toastOnedriveConnectToSync'));
        await startOneDriveConnect();
        return;
      }
    } catch {
      snackbar.error(t('toastOnedriveConnectToSync'));
      await startOneDriveConnect();
      return;
    }
    setOnedriveSyncingId(currentFolder?.id ?? '__all__');
    try {
      const results = await Promise.allSettled(
        targets.map(t =>
          utils.fetcher({
            url: `${onedriveApiBase}/${t.id}/sync`,
            config: { method: 'POST', credentials: 'include' }
          })
        )
      );
      fetchResources();
      if (currentFolderId) fetchChildren(currentFolderId);
      const failed = results.filter(
        r =>
          r.status === 'rejected' ||
          (r.status === 'fulfilled' && r.value?.error)
      ).length;
      if (failed > 0) {
        snackbar.error(t.plural('toastSyncFailed', failed));
      } else {
        snackbar.success(t('toastSyncStarted'));
      }
    } finally {
      setOnedriveSyncingId(null);
    }
  };

  const renderFolderHome = () => (
    <div className="resources-folders">
      <div
        className="resource-folder"
        role="button"
        tabIndex={0}
        onClick={() => setFolder('gdrive')}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setFolder('gdrive');
          }
        }}
      >
        <div className="resource-folder-icon gdrive">
          <img src="/GOOGLE_DRIVE.svg" alt="" />
        </div>
        <div className="resource-folder-body">
          <p className="resource-folder-title">{t('folderGoogleDrive')}</p>
          <p className="resource-folder-meta">
            {t.plural('countItems', gdriveTopResources.length)}
            {gdriveChildrenTotal > 0 && (
              <>
                {' · '}
                {t.plural('countDocuments', gdriveChildrenTotal)}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          className="resource-folder-action"
          onClick={e => {
            e.stopPropagation();
            handleOpenGoogleDrive();
          }}
          disabled={gdriveLoadingToken}
        >
          <Add />
          {gdriveLoadingToken ? t('loading') : t('addFromGoogleDrive')}
        </button>
      </div>
      <div
        className="resource-folder"
        role="button"
        tabIndex={0}
        onClick={() => setFolder('onedrive')}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setFolder('onedrive');
          }
        }}
      >
        <div className="resource-folder-icon onedrive">
          <img src="/ONEDRIVE.svg" alt="" />
        </div>
        <div className="resource-folder-body">
          <p className="resource-folder-title">{t('folderOneDrive')}</p>
          <p className="resource-folder-meta">
            {t.plural('countItems', onedriveTopResources.length)}
            {onedriveChildrenTotal > 0 && (
              <>
                {' · '}
                {t.plural('countDocuments', onedriveChildrenTotal)}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          className="resource-folder-action"
          onClick={e => {
            e.stopPropagation();
            handleOpenOneDrive();
          }}
          disabled={onedriveLoadingToken}
        >
          <Add />
          {onedriveLoadingToken ? t('loading') : t('addFromOneDrive')}
        </button>
      </div>
      <div
        className="resource-folder"
        role="button"
        tabIndex={0}
        onClick={() => setFolder('websites')}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setFolder('websites');
          }
        }}
      >
        <div className="resource-folder-icon websites">
          <LanguageOutlined />
        </div>
        <div className="resource-folder-body">
          <p className="resource-folder-title">{t('folderWebsites')}</p>
          <p className="resource-folder-meta">
            {t.plural('countWebsites', websiteParents.length)}
            {websitePagesCount > 0 && (
              <>
                {' · '}
                {t.plural('countPages', websitePagesCount)}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          className="resource-folder-action"
          onClick={e => {
            e.stopPropagation();
            startCreate('website');
          }}
        >
          <Add />
          {t('addWebsite')}
        </button>
      </div>
      <div
        className="resource-folder"
        role="button"
        tabIndex={0}
        onClick={() => setFolder('files')}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setFolder('files');
          }
        }}
      >
        <div className="resource-folder-icon files">
          <FolderOpenOutlined />
        </div>
        <div className="resource-folder-body">
          <p className="resource-folder-title">{t('folderMine')}</p>
          <p className="resource-folder-meta">
            {t.plural('countItems', fileResources.length)}
          </p>
        </div>
        <button
          type="button"
          className="resource-folder-action"
          onClick={e => {
            e.stopPropagation();
            startCreate('file');
          }}
        >
          <Add />
          {t('addFiles')}
        </button>
      </div>
    </div>
  );

  const renderResourceRow = (resource: Resource) => {
    const isWebsite =
      resource.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE;
    const isFolder = isFolderResource(resource);
    const childCount = isWebsite
      ? (childrenByParent[resource.id]?.length ??
        resource.childResourceCount ??
        0)
      : 0;
    return (
      <div
        key={resource.id}
        className={`resource-item ${selectedResource?.id === resource.id ? 'active' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => handleSelect(resource)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSelect(resource);
          }
        }}
      >
        <div className="resource-item-icon">
          {isWebsite ? (
            <ResourceFavicon favicon={getFavicon(resource)} />
          ) : (
            getResourceIcon(resource)
          )}
        </div>
        <div className="resource-item-body">
          <div className="resource-item-top">
            <div className="resource-item-top-between">
              <p className="resource-item-title">{resource.title}</p>
              <UI.Status
                status={resource.status}
                pendingLabel={t('uiIndexing')}
                completedLabel={t('uiReady')}
                failedLabel={t('uiFailed')}
              />
            </div>
            <UI.TruncatedText
              text={isWebsite ? t('badgeWebsite') : resource.mimeType}
              className="resource-item-type"
            />
          </div>
          <div className="resource-item-meta">
            <span className="resource-item-uri">{resource.uri}</span>
            {isWebsite && childCount > 0 && (
              <span>{t.plural('countPages', childCount)}</span>
            )}
            {!isWebsite && resource.size > 0 && (
              <span>{formatSize(resource.size)}</span>
            )}
            <span>{t.date(resource.updatedAt)}</span>
          </div>
        </div>
        {isFolder && (
          <IconButton
            size="small"
            aria-label={t('deleteFolder')}
            className="resource-item-remove-button"
            onClick={e => handleDeleteRow(e, resource)}
          >
            <DeleteOutlined fontSize="small" />
          </IconButton>
        )}
      </div>
    );
  };

  const folderTitle =
    folder === 'files'
      ? t('folderMine')
      : folder === 'websites'
        ? t('folderWebsites')
        : folder === 'gdrive'
          ? t('folderGoogleDrive')
          : folder === 'onedrive'
            ? t('folderOneDrive')
            : '';
  const folderEmptyLabel = t(folder === 'websites' ? 'addWebsite' : 'addFiles');
  const folderEmptyType: 'file' | 'website' =
    folder === 'websites' ? 'website' : 'file';

  return (
    <Wrapper panelWidth={panelWidth}>
      <div
        className={`resources-list ${selectedResource || isCreating ? 'has-selection' : ''}`}
      >
        <div className="resources-header">
          <div className="resources-header-text">
            <h1 className="resources-title">{t('title')}</h1>
            <p className="resources-subtitle">{t('subtitle')}</p>
          </div>
          <div className="resources-header-actions">
            <div className="resources-view-toggle">
              <button
                type="button"
                className={view === 'sources' ? 'active' : ''}
                onClick={() => {
                  setView('sources');
                }}
              >
                <GridViewOutlined />
                {t('viewSources')}
              </button>
              <button
                type="button"
                className={view === 'all' ? 'active' : ''}
                onClick={() => {
                  setView('all');
                  setFolder(null);
                }}
              >
                <ViewListOutlined />
                {t('viewAll')}
              </button>
            </div>
          </div>
        </div>
        {(view === 'all' || folder !== null) && (
          <div className="resources-toolbar">
            {(folderPath.length > 0 ||
              (view === 'sources' && folder !== null)) && (
              <button
                type="button"
                className="resources-back"
                onClick={() => {
                  if (folderPath.length > 0) {
                    setFolderPath(prev => prev.slice(0, -1));
                  } else {
                    setFolder(null);
                  }
                }}
              >
                <ArrowBack />
                {t('back')}
              </button>
            )}
            <div className="resources-search">
              <Search />
              <input
                type="text"
                placeholder={t('search')}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {view === 'sources' &&
              folder === 'files' &&
              folderPath.length === 0 && (
                <UI.Button
                  variant="contained"
                  size="small"
                  onClick={() => startCreate('file')}
                >
                  <Add />
                  <span className="button-text">{t('addFiles')}</span>
                </UI.Button>
              )}
            {view === 'sources' &&
              folder === 'websites' &&
              folderPath.length === 0 && (
                <UI.Button
                  variant="contained"
                  size="small"
                  onClick={() => startCreate('website')}
                >
                  <Add />
                  <span className="button-text">{t('addWebsite')}</span>
                </UI.Button>
              )}
            {view === 'sources' &&
              folder === 'gdrive' &&
              folderPath.length === 0 && (
                <UI.Button
                  variant="contained"
                  size="small"
                  onClick={handleOpenGoogleDrive}
                  disabled={gdriveLoadingToken}
                >
                  <Add />
                  <span className="button-text">
                    {gdriveLoadingToken
                      ? t('loading')
                      : t('addFromGoogleDrive')}
                  </span>
                </UI.Button>
              )}
            {folder === 'gdrive' && (
              <UI.Button
                variant="outlined"
                size="small"
                onClick={handleGoogleDriveSync}
                disabled={gdriveSyncingId !== null}
              >
                <Sync />
                <span className="button-text">
                  {gdriveSyncingId !== null ? t('syncing') : t('sync')}
                </span>
              </UI.Button>
            )}
            {view === 'sources' &&
              folder === 'onedrive' &&
              folderPath.length === 0 && (
                <UI.Button
                  variant="contained"
                  size="small"
                  onClick={handleOpenOneDrive}
                  disabled={onedriveLoadingToken}
                >
                  <Add />
                  <span className="button-text">
                    {onedriveLoadingToken ? t('loading') : t('addFromOneDrive')}
                  </span>
                </UI.Button>
              )}
            {folder === 'onedrive' && (
              <UI.Button
                variant="outlined"
                size="small"
                onClick={handleOneDriveSync}
                disabled={onedriveSyncingId !== null}
              >
                <Sync />
                <span className="button-text">
                  {onedriveSyncingId !== null ? t('syncing') : t('sync')}
                </span>
              </UI.Button>
            )}
          </div>
        )}
        {view === 'sources' && folder !== null && folderPath.length === 0 && (
          <h2 className="resources-folder-heading">{folderTitle}</h2>
        )}
        {folderPath.length > 0 && (
          <div className="resources-breadcrumbs">
            <UI.Breadcrumbs
              items={[
                ...(view === 'sources' && folder !== null
                  ? [
                      {
                        label: folderTitle,
                        onClick: () => setFolderPath([])
                      }
                    ]
                  : []),
                ...folderPath.map((id, idx) => {
                  const r = findResourceById(id);
                  return {
                    label: r?.title ?? '…',
                    onClick:
                      idx < folderPath.length - 1
                        ? () => setFolderPath(prev => prev.slice(0, idx + 1))
                        : undefined
                  };
                })
              ]}
            />
          </div>
        )}
        {view === 'sources' && folder === null && renderFolderHome()}
        {(view === 'all' || folder !== null) && (
          <>
            {(() => {
              const listLoading = currentFolderId
                ? loadingChildrenIds.has(currentFolderId) &&
                  !childrenByParent[currentFolderId]
                : status === 'pending';
              if (!listLoading || filteredList.length > 0) return null;
              const skeletonCount = currentFolderId
                ? Math.min(
                    findResourceById(currentFolderId)?.childResourceCount ?? 3,
                    6
                  ) || 3
                : 3;
              return (
                <div className="resources-items">
                  {Array.from({ length: skeletonCount }).map((_, i) => (
                    <div
                      key={i}
                      className="resource-item resource-item-skeleton"
                    >
                      <UI.Skeleton variant="rounded" width={32} height={32} />
                      <div className="resource-item-body">
                        <UI.Skeleton variant="text" width="45%" height={18} />
                        <UI.Skeleton variant="text" width="80%" height={12} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {(() => {
              const listLoading = currentFolderId
                ? loadingChildrenIds.has(currentFolderId) &&
                  !childrenByParent[currentFolderId]
                : status === 'pending';
              if (listLoading || filteredList.length > 0) return null;
              return folderPath.length > 0 ? (
                <div className="resources-empty-state">
                  <FolderOpenOutlined />
                  <h3>{t('folderEmpty')}</h3>
                </div>
              ) : (
                <div className="resources-empty-state">
                  {folder === 'websites' ? (
                    <LanguageOutlined />
                  ) : folder === 'gdrive' ? (
                    <img
                      src="/GOOGLE_DRIVE.svg"
                      alt=""
                      className="resources-empty-icon-img"
                    />
                  ) : folder === 'onedrive' ? (
                    <img
                      src="/ONEDRIVE.svg"
                      alt=""
                      className="resources-empty-icon-img"
                    />
                  ) : (
                    <FolderOpenOutlined />
                  )}
                  <h3>
                    {view === 'all'
                      ? t('emptyAll')
                      : folder === 'websites'
                        ? t('emptyWebsites')
                        : folder === 'gdrive'
                          ? t('emptyGdrive')
                          : folder === 'onedrive'
                            ? t('emptyOnedrive')
                            : t('emptyFiles')}
                  </h3>
                  <p>
                    {folder === 'websites'
                      ? t('emptyWebsitesText')
                      : folder === 'gdrive'
                        ? t('emptyGdriveText')
                        : folder === 'onedrive'
                          ? t('emptyOnedriveText')
                          : t('emptyFilesText')}
                  </p>
                  {view === 'sources' &&
                    (folder === 'gdrive' ? (
                      <UI.Button
                        variant="contained"
                        size="small"
                        onClick={handleOpenGoogleDrive}
                        disabled={gdriveLoadingToken}
                      >
                        <Add />
                        <span className="button-text">
                          {gdriveLoadingToken
                            ? t('loading')
                            : t('addFromGoogleDrive')}
                        </span>
                      </UI.Button>
                    ) : folder === 'onedrive' ? (
                      <UI.Button
                        variant="contained"
                        size="small"
                        onClick={handleOpenOneDrive}
                        disabled={onedriveLoadingToken}
                      >
                        <Add />
                        <span className="button-text">
                          {onedriveLoadingToken
                            ? t('loading')
                            : t('addFromOneDrive')}
                        </span>
                      </UI.Button>
                    ) : (
                      <UI.Button
                        variant="contained"
                        size="small"
                        onClick={() => startCreate(folderEmptyType)}
                      >
                        <Add />
                        <span className="button-text">{folderEmptyLabel}</span>
                      </UI.Button>
                    ))}
                </div>
              );
            })()}
            <div className="resources-items">
              {filteredList.map(renderResourceRow)}
            </div>
          </>
        )}
      </div>
      {(selectedResource || isCreating) && (
        <div className="resource-panel">
          <div
            className="panel-resize-handle"
            onMouseDown={handleResizeStart}
          />
          <div className="panel-header">
            <IconButton className="panel-back-btn" onClick={handleClose}>
              <ArrowBack />
            </IconButton>
            <h2 className="panel-title">
              {addingType === 'website'
                ? t('panelAddWebsite')
                : addingType === 'file'
                  ? t('panelNewResource')
                  : isEditing
                    ? t('panelEditResource')
                    : selectedResource!.title}
            </h2>
            {!isEditing && !isCreating && selectedResource && (
              <UI.Status
                status={selectedResource.status}
                variant="badge"
                pendingLabel={t('uiIndexing')}
                completedLabel={t('uiReady')}
                failedLabel={t('uiFailed')}
              />
            )}
            <div className="panel-actions">
              {!isEditing && !isCreating && (
                <>
                  <IconButton onClick={handleEdit} size="small">
                    <EditOutlined />
                  </IconButton>
                  <IconButton onClick={handleDeleteClick} size="small">
                    <DeleteOutlined />
                  </IconButton>
                </>
              )}
              <IconButton className="panel-close-btn" onClick={handleClose}>
                <Close />
              </IconButton>
            </div>
          </div>
          <div className="panel-content">
            {addingType === 'website' ||
            (isEditing &&
              selectedResource?.sourceType ===
                utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE) ? (
              <div className="panel-edit-form">
                {addingType === 'website' && (
                  <UI.Input
                    label={t('websiteUrl')}
                    name="uri"
                    placeholder={t('websiteUrlPlaceholder')}
                    value={websiteValues.uri}
                    disabled={submitting}
                    onChange={handleWebsiteChange}
                    error={!!errors.uri}
                    helperText={errors.uri || t('websiteUrlHelp')}
                  />
                )}
                <UI.Input
                  label={t('websiteTitle')}
                  name="title"
                  placeholder={t('websiteTitlePlaceholder')}
                  value={websiteValues.title}
                  disabled={submitting}
                  onChange={handleWebsiteChange}
                  error={!!errors.title}
                  helperText={errors.title}
                />
                <UI.Input
                  label={t('websiteDescription')}
                  name="description"
                  placeholder={t('websiteDescriptionPlaceholder')}
                  value={websiteValues.description}
                  disabled={submitting}
                  onChange={handleWebsiteChange}
                  error={!!errors.description}
                  helperText={errors.description}
                  multiline
                  rows={2}
                />
                {addingType === 'website' && (
                  <div className="panel-crawl-grid">
                    <UI.Input
                      label={t('maxPages')}
                      name="maxPages"
                      type="number"
                      value={websiteValues.maxPages}
                      disabled={submitting}
                      slotProps={{
                        htmlInput: {
                          min: 1,
                          max: utils.constants.CRAWL_MAX_PAGES_LIMIT
                        }
                      }}
                      onChange={handleWebsiteChange}
                      error={!!errors.maxPages}
                      helperText={
                        errors.maxPages ||
                        `1 – ${utils.constants.CRAWL_MAX_PAGES_LIMIT}`
                      }
                    />
                    <UI.Input
                      label={t('maxDepth')}
                      name="maxDepth"
                      type="number"
                      value={websiteValues.maxDepth}
                      disabled={submitting}
                      slotProps={{
                        htmlInput: {
                          min: 0,
                          max: utils.constants.CRAWL_MAX_DEPTH_LIMIT
                        }
                      }}
                      onChange={handleWebsiteChange}
                      error={!!errors.maxDepth}
                      helperText={
                        errors.maxDepth ||
                        `0 – ${utils.constants.CRAWL_MAX_DEPTH_LIMIT}`
                      }
                    />
                  </div>
                )}
                <div className="panel-edit-actions">
                  <UI.Button
                    variant="contained"
                    size="small"
                    className="small"
                    disabled={submitting}
                    onClick={isCreating ? handleCreateSubmit : handleUpdate}
                  >
                    {submitting
                      ? isCreating
                        ? t('startingCrawl')
                        : c('saving')
                      : isCreating
                        ? t('startCrawl')
                        : c('save')}
                  </UI.Button>
                  <UI.Button
                    size="small"
                    disabled={submitting}
                    onClick={handleCancel}
                  >
                    {c('cancel')}
                  </UI.Button>
                </div>
              </div>
            ) : isCreating || isEditing ? (
              <div className="panel-edit-form">
                <UI.Input
                  label={t('resourceTitle')}
                  name="title"
                  placeholder={t('resourceTitlePlaceholder')}
                  value={editValues.title}
                  disabled={submitting}
                  onChange={handleEditChange}
                  error={!!errors.title}
                  helperText={errors.title || t('resourceTitleHelp')}
                />
                <UI.Input
                  label={t('uri')}
                  name="uri"
                  placeholder={t('uriPlaceholder')}
                  value={editValues.uri}
                  disabled={submitting}
                  onChange={handleEditChange}
                  error={!!errors.uri}
                  helperText={errors.uri || t('uriHelp')}
                />
                <UI.Select
                  label={t('type')}
                  name="type"
                  value={editValues.type}
                  disabled={submitting}
                  onChange={e =>
                    setEditValues(prev => ({
                      ...prev,
                      type: e.target.value as string
                    }))
                  }
                  helperText={
                    editValues.type === utils.constants.RESOURCE_TYPE_STATIC
                      ? t('typeStaticHelp')
                      : t('typeTemplateHelp')
                  }
                  options={[
                    {
                      label: t('typeStatic'),
                      value: utils.constants.RESOURCE_TYPE_STATIC
                    },
                    {
                      label: t('typeTemplate'),
                      value: utils.constants.RESOURCE_TYPE_TEMPLATE
                    }
                  ]}
                />
                <UI.Input
                  label={t('description')}
                  name="description"
                  placeholder={t('descriptionPlaceholder')}
                  value={editValues.description}
                  disabled={submitting}
                  onChange={handleEditChange}
                  error={!!errors.description}
                  helperText={errors.description}
                  multiline
                  rows={2}
                />
                {isCreating && (
                  <div className="panel-content-mode">
                    <p className="panel-content-mode-label">
                      {t('contentSource')}
                    </p>
                    <div className="panel-content-mode-toggle">
                      <button
                        type="button"
                        className={`panel-content-mode-btn ${contentMode === 'file' ? 'active' : ''}`}
                        disabled={submitting}
                        onClick={() => setContentMode('file')}
                      >
                        <UploadFile />
                        {t('contentSourceFile')}
                      </button>
                      <button
                        type="button"
                        className={`panel-content-mode-btn ${contentMode === 'text' ? 'active' : ''}`}
                        disabled={submitting}
                        onClick={() => {
                          setContentMode('text');
                          setFile(null);
                        }}
                      >
                        <TextFields />
                        {t('contentSourceText')}
                      </button>
                    </div>
                  </div>
                )}
                {contentMode === 'text' ? (
                  <>
                    <UI.Select
                      label={t('mimeType')}
                      name="mimeType"
                      value={editValues.mimeType}
                      disabled={submitting}
                      onChange={e =>
                        setEditValues(prev => ({
                          ...prev,
                          mimeType: e.target.value as string
                        }))
                      }
                      options={utils.constants.TEXT_MIME_TYPES.map(t => ({
                        label: t,
                        value: t
                      }))}
                    />
                    <UI.Select
                      label={t('encoding')}
                      name="encoding"
                      value={editValues.encoding}
                      disabled={submitting}
                      onChange={e =>
                        setEditValues(prev => ({
                          ...prev,
                          encoding: e.target.value as string
                        }))
                      }
                      options={utils.constants.ENCODINGS.map(e => ({
                        label: e,
                        value: e
                      }))}
                    />
                    <UI.Input
                      label={t('content')}
                      name="content"
                      value={editValues.content}
                      disabled={submitting}
                      onChange={handleContentChange}
                      multiline
                      rows={8}
                    />
                    <p className="panel-size-hint">
                      {t('sizeHint', {
                        size: formatSize(Number(editValues.size))
                      })}
                    </p>
                  </>
                ) : (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="panel-file-input-hidden"
                      onChange={handleFileChange}
                      disabled={submitting}
                    />
                    <div
                      className="panel-file-dropzone"
                      role="button"
                      tabIndex={0}
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                    >
                      {file ? (
                        <div className="panel-file-info">
                          {isImageMime(file.type) && (
                            <img
                              className="panel-file-preview"
                              src={URL.createObjectURL(file)}
                              alt={file.name}
                            />
                          )}
                          <p className="panel-file-name">{file.name}</p>
                          <p className="panel-file-meta">
                            {file.type || t('fileUnknownType')} &middot;{' '}
                            {formatSize(file.size)}
                          </p>
                        </div>
                      ) : filePreviewUrl && selectedResource?.fileKey ? (
                        <div className="panel-file-info">
                          {isImageMime(selectedResource.mimeType) && (
                            <img
                              className="panel-file-preview"
                              src={filePreviewUrl}
                              alt={selectedResource.title}
                            />
                          )}
                          <p className="panel-file-name">
                            {selectedResource.title}
                          </p>
                          {selectedResource.fileName && (
                            <p className="panel-file-original">
                              {selectedResource.fileName}
                            </p>
                          )}
                          <p className="panel-file-meta">
                            {selectedResource.mimeType} &middot;{' '}
                            {formatSize(selectedResource.size)}
                          </p>
                          <p className="panel-file-hint">{t('fileReplace')}</p>
                        </div>
                      ) : (
                        <div className="panel-file-placeholder">
                          <UploadFile />
                          <p>{t('fileSelect')}</p>
                        </div>
                      )}
                    </div>
                    {errors.file && (
                      <p className="panel-file-error">{errors.file}</p>
                    )}
                  </>
                )}
                <div className="panel-advanced">
                  <button
                    type="button"
                    className="panel-advanced-toggle"
                    onClick={() => setShowAdvanced(prev => !prev)}
                  >
                    {showAdvanced ? <ExpandLess /> : <ExpandMore />}
                    {t('advancedOptions')}
                  </button>
                  {showAdvanced && (
                    <div className="panel-advanced-content">
                      <div className="panel-advanced-section">
                        <p className="panel-advanced-label">{t('audience')}</p>
                        <div className="panel-audience-checks">
                          {utils.constants.ROLE_MESSAGES.map(role => (
                            <FormControlLabel
                              key={role}
                              control={
                                <Checkbox
                                  size="small"
                                  disabled={submitting}
                                  checked={annotations.audience.includes(role)}
                                  onChange={e =>
                                    setAnnotations(prev => ({
                                      ...prev,
                                      audience: e.target.checked
                                        ? [...prev.audience, role]
                                        : prev.audience.filter(r => r !== role)
                                    }))
                                  }
                                />
                              }
                              label={role}
                            />
                          ))}
                        </div>
                      </div>
                      <UI.Input
                        label={t('priority')}
                        name="priority"
                        type="number"
                        value={annotations.priority}
                        disabled={submitting}
                        slotProps={{ htmlInput: { min: 0, max: 1, step: 0.1 } }}
                        onChange={e =>
                          setAnnotations(prev => ({
                            ...prev,
                            priority: e.target.value
                          }))
                        }
                      />
                      <div className="panel-advanced-section">
                        <div className="panel-advanced-section-header">
                          <p className="panel-advanced-label">{t('icons')}</p>
                          <IconButton
                            size="small"
                            disabled={submitting}
                            onClick={() =>
                              setIcons(prev => [
                                ...prev,
                                { src: '', theme: '' }
                              ])
                            }
                          >
                            <Add />
                          </IconButton>
                        </div>
                        {icons.map((icon, i) => (
                          <div key={i} className="panel-icon-row">
                            <UI.Input
                              label={t('iconUrl')}
                              value={icon.src}
                              disabled={submitting}
                              onChange={e =>
                                setIcons(prev =>
                                  prev.map((ic, idx) =>
                                    idx === i
                                      ? { ...ic, src: e.target.value }
                                      : ic
                                  )
                                )
                              }
                            />
                            <UI.Select
                              label={t('iconTheme')}
                              value={icon.theme}
                              disabled={submitting}
                              onChange={e =>
                                setIcons(prev =>
                                  prev.map((ic, idx) =>
                                    idx === i
                                      ? {
                                          ...ic,
                                          theme: e.target.value as string
                                        }
                                      : ic
                                  )
                                )
                              }
                              options={[
                                { label: t('iconThemeNone'), value: '' },
                                ...utils.constants.RESOURCE_ICON_THEMES.map(
                                  t => ({
                                    label: t,
                                    value: t
                                  })
                                )
                              ]}
                            />
                            <IconButton
                              size="small"
                              disabled={submitting}
                              onClick={() =>
                                setIcons(prev =>
                                  prev.filter((_, idx) => idx !== i)
                                )
                              }
                            >
                              <RemoveCircleOutlined />
                            </IconButton>
                          </div>
                        ))}
                        {icons.length === 0 && (
                          <p className="panel-advanced-hint">
                            {t('iconsEmpty')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="panel-edit-actions">
                  <UI.Button
                    variant="contained"
                    size="small"
                    disabled={submitting}
                    onClick={isCreating ? handleCreateSubmit : handleUpdate}
                  >
                    {submitting
                      ? isCreating
                        ? c('creating')
                        : c('saving')
                      : isCreating
                        ? c('create')
                        : c('save')}
                  </UI.Button>
                  <UI.Button
                    size="small"
                    disabled={submitting}
                    onClick={handleCancel}
                  >
                    {c('cancel')}
                  </UI.Button>
                </div>
              </div>
            ) : selectedResource ? (
              <div className="panel-view">
                {(() => {
                  const chain: Resource[] = [];
                  const seen = new Set<string>();
                  let cursor: Resource | undefined = selectedResource;
                  while (cursor && !seen.has(cursor.id)) {
                    seen.add(cursor.id);
                    chain.unshift(cursor);
                    if (!cursor.parentResourceId) break;
                    const parentId = cursor.parentResourceId;
                    cursor =
                      resources.find(r => r.id === parentId) ??
                      Object.values(childrenByParent)
                        .flat()
                        .find(r => r.id === parentId);
                  }
                  if (chain.length < 2) return null;
                  return (
                    <UI.Breadcrumbs
                      items={chain.map((item, idx) => ({
                        label: item.title,
                        onClick:
                          idx < chain.length - 1
                            ? () => handleSelect(item)
                            : undefined
                      }))}
                    />
                  );
                })()}
                <div className="panel-info-grid">
                  <div className="panel-info-item">
                    <span className="panel-info-label">{t('infoSource')}</span>
                    <span className="panel-info-badge">
                      {labelFor(
                        SOURCE_TYPE_KEY,
                        selectedResource.sourceType,
                        t
                      )}
                    </span>
                  </div>
                  <div className="panel-info-item">
                    <span className="panel-info-label">{t('infoType')}</span>
                    <span className="panel-info-badge">
                      {labelFor(TYPE_KEY, selectedResource.type, t)}
                    </span>
                  </div>
                  <div className="panel-info-item">
                    <span className="panel-info-label">
                      {t('infoMimeType')}
                    </span>
                    <span className="panel-info-value">
                      {selectedResource.mimeType}
                    </span>
                  </div>
                  <div className="panel-info-item">
                    <span className="panel-info-label">{t('infoSize')}</span>
                    <span className="panel-info-value">
                      {formatSize(selectedResource.size)}
                    </span>
                  </div>
                  {selectedResource.encoding && (
                    <div className="panel-info-item">
                      <span className="panel-info-label">
                        {t('infoEncoding')}
                      </span>
                      <span className="panel-info-value">
                        {selectedResource.encoding}
                      </span>
                    </div>
                  )}
                  {selectedResource.fileName && (
                    <div className="panel-info-item">
                      <span className="panel-info-label">
                        {t('infoFileName')}
                      </span>
                      <UI.TruncatedText
                        text={selectedResource.fileName}
                        className="panel-info-value"
                      />
                    </div>
                  )}
                </div>
                <div className="panel-section">
                  <h3 className="panel-section-label">{t('sectionUri')}</h3>
                  <p className="panel-section-text">{selectedResource.uri}</p>
                </div>
                <div className="panel-section">
                  <h3 className="panel-section-label">{t('sectionSources')}</h3>
                  <div className="panel-toggle-row">
                    <div>
                      <p className="panel-toggle-label">
                        {t(
                          utils.isResourceSourceEnabled(selectedResource)
                            ? 'sourcesOn'
                            : 'sourcesOff'
                        )}
                      </p>
                      <p className="panel-toggle-hint">{t('sourcesHint')}</p>
                    </div>
                    <Switch
                      checked={utils.isResourceSourceEnabled(selectedResource)}
                      disabled={sourceVisibilityUpdating}
                      onChange={handleShowSourceToggle}
                    />
                  </div>
                </div>
                {selectedResource.description && (
                  <div className="panel-section">
                    <h3 className="panel-section-label">
                      {t('sectionDescription')}
                    </h3>
                    <p className="panel-section-text">
                      {selectedResource.description}
                    </p>
                  </div>
                )}
                {selectedResource.fileKey && (
                  <div className="panel-section">
                    <h3 className="panel-section-label">{t('sectionFile')}</h3>
                    {filePreviewError ? (
                      <p className="panel-file-error">{filePreviewError}</p>
                    ) : (
                      <>
                        {filePreviewUrl &&
                          isImageMime(selectedResource.mimeType) && (
                            <img
                              className="panel-view-image"
                              src={filePreviewUrl}
                              alt={selectedResource.title}
                            />
                          )}
                        <UI.Button
                          variant="outlined"
                          size="small"
                          onClick={handleViewFile}
                          disabled={!filePreviewUrl}
                        >
                          <OpenInNew />
                          <span className="button-text">
                            {filePreviewUrl ? (
                              t('openFile')
                            ) : (
                              <UI.Skeleton
                                variant="text"
                                width={60}
                                height={14}
                              />
                            )}
                          </span>
                        </UI.Button>
                      </>
                    )}
                  </div>
                )}
                {selectedResource.content &&
                  (() => {
                    const text = selectedResource.content;
                    const threshold = 600;
                    const isLarge = text.length > threshold;
                    const expanded = expandedSections.has('content');
                    return (
                      <div className="panel-section">
                        <h3 className="panel-section-label">
                          {t('sectionContent')}
                        </h3>
                        {isLarge && !expanded ? (
                          <button
                            type="button"
                            className="panel-section-toggle"
                            onClick={() =>
                              setExpandedSections(prev => {
                                const next = new Set(prev);
                                next.add('content');
                                return next;
                              })
                            }
                          >
                            {t('showContent', { count: t.n(text.length) })}
                          </button>
                        ) : (
                          <>
                            <pre className="panel-content-pre">{text}</pre>
                            {isLarge && (
                              <button
                                type="button"
                                className="panel-section-toggle"
                                onClick={() =>
                                  setExpandedSections(prev => {
                                    const next = new Set(prev);
                                    next.delete('content');
                                    return next;
                                  })
                                }
                              >
                                {t('hideContent')}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                {selectedResource.metadata &&
                  Object.keys(selectedResource.metadata).length > 0 &&
                  renderCollapsibleJson(
                    'metadata',
                    'sectionMetadata',
                    'showMetadata',
                    'hideMetadata',
                    selectedResource.metadata
                  )}
                {selectedResource.annotations &&
                  Object.keys(selectedResource.annotations).length > 0 &&
                  renderCollapsibleJson(
                    'annotations',
                    'sectionAnnotations',
                    'showAnnotations',
                    'hideAnnotations',
                    selectedResource.annotations
                  )}
              </div>
            ) : null}
          </div>
        </div>
      )}
      <UI.Alert
        open={deleteAlert}
        title={t('confirmDeleteTitle')}
        description={(() => {
          const title = resourceToDelete?.title ?? '';
          const isFolder = resourceToDelete
            ? isFolderResource(resourceToDelete)
            : false;
          const childCount = resourceToDelete?.childResourceCount ?? 0;
          if (isFolder && childCount > 0) {
            return t.plural('confirmDeleteFolder', childCount, { title });
          }
          return t('confirmDeleteText', { title });
        })()}
        confirmText={t('confirmDelete')}
        cancelText={c('cancel')}
        loadingText={c('deleting')}
        loading={submitting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteAlert(false);
          setResourceToDelete(null);
        }}
      />
      <UI.Modal
        open={gdriveOpen}
        title={t('importGoogleDrive')}
        width={820}
        closeLabel={c('close')}
        onClose={() => {
          if (gdriveImporting) return;
          setGdriveOpen(false);
          setGdriveSelected(new Map());
        }}
        footer={
          <>
            <UI.Button
              size="small"
              className="small"
              disabled={gdriveImporting}
              onClick={() => {
                setGdriveOpen(false);
                setGdriveSelected(new Map());
              }}
            >
              {c('cancel')}
            </UI.Button>
            <UI.Button
              variant="contained"
              size="small"
              className="small"
              disabled={gdriveImporting || gdriveSelected.size === 0}
              onClick={handleGoogleDriveImport}
            >
              {gdriveImporting
                ? t('importing')
                : gdriveSelected.size === 0
                  ? t('addSelected')
                  : t('addSelectedCount', { count: gdriveSelected.size })}
            </UI.Button>
          </>
        }
      >
        <UI.CloudDriveBrowser
          provider="google-drive"
          accessToken={gdriveToken}
          labels={driveLabels}
          locale={t.locale}
          selected={gdriveSelected}
          onSelectionChange={setGdriveSelected}
          onTokenExpired={() => {
            setGdriveToken(null);
            setGdriveOpen(false);
            startGoogleDriveConnect();
          }}
        />
      </UI.Modal>
      <UI.Modal
        open={onedriveOpen}
        title={t('importOneDrive')}
        width={820}
        closeLabel={c('close')}
        onClose={() => {
          if (onedriveImporting) return;
          setOnedriveOpen(false);
          setOnedriveSelected(new Map());
        }}
        footer={
          <>
            <UI.Button
              size="small"
              className="small"
              disabled={onedriveImporting}
              onClick={() => {
                setOnedriveOpen(false);
                setOnedriveSelected(new Map());
              }}
            >
              {c('cancel')}
            </UI.Button>
            <UI.Button
              variant="contained"
              size="small"
              className="small"
              disabled={onedriveImporting || onedriveSelected.size === 0}
              onClick={handleOneDriveImport}
            >
              {onedriveImporting
                ? t('importing')
                : onedriveSelected.size === 0
                  ? t('addSelected')
                  : t('addSelectedCount', { count: onedriveSelected.size })}
            </UI.Button>
          </>
        }
      >
        <UI.CloudDriveBrowser
          provider="onedrive"
          accessToken={onedriveToken}
          labels={driveLabels}
          locale={t.locale}
          selected={onedriveSelected}
          onSelectionChange={setOnedriveSelected}
          onTokenExpired={() => {
            setOnedriveToken(null);
            setOnedriveOpen(false);
            startOneDriveConnect();
          }}
        />
      </UI.Modal>
    </Wrapper>
  );
};
