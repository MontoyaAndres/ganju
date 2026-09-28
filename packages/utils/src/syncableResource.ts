import { constants } from './constants';

// Which resources are sync roots: the rows a sync starts from and records its
// schedule on.
//
//  - a WEBSITE seed (the row with no parent) — a sync re-crawls the site;
//  - a Drive/OneDrive folder — a sync walks it for new, changed and removed
//    files;
//  - a Drive/OneDrive file imported on its own — a sync re-fetches it when it
//    changed.
//
// A page under a website or a file under a folder is not a root: its parent's
// sync covers it. An uploaded file has nothing to sync from.
export interface SyncableResource {
  sourceType?: string | null;
  parentResourceId?: string | null;
  metadata?: unknown;
}

export type ResourceSyncProvider = 'website' | 'google-drive' | 'one-drive';

export const resourceSyncProvider = (
  resource: SyncableResource
): ResourceSyncProvider | null => {
  if (resource.parentResourceId) return null;
  switch (resource.sourceType) {
    case constants.RESOURCE_SOURCE_TYPE_WEBSITE:
      return 'website';
    case constants.RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER:
      return 'google-drive';
    case constants.RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER:
      return 'one-drive';
    case constants.RESOURCE_SOURCE_TYPE_FILE: {
      const meta =
        resource.metadata && typeof resource.metadata === 'object'
          ? (resource.metadata as Record<string, unknown>)
          : null;
      if (typeof meta?.driveFileId === 'string') return 'google-drive';
      if (typeof meta?.oneDriveItemId === 'string') return 'one-drive';
      return null;
    }
    default:
      return null;
  }
};

export const isSyncableResource = (resource: SyncableResource): boolean =>
  resourceSyncProvider(resource) !== null;

// Whether a sync root is still genuinely syncing: PENDING, and started within
// RESOURCE_SYNC_STALE_MS. Past that, a PENDING root is stuck — a job was lost
// or gave up — and may be synced again, which re-queues whatever it left
// unfinished. A root that never synced counts from its creation, so a first
// import that stalled recovers too.
export const isResourceSyncInProgress = (
  resource: {
    status: string;
    syncStartedAt?: Date | string | null;
    createdAt: Date | string;
  },
  now: number = Date.now()
): boolean => {
  if (resource.status !== constants.STATUS_PENDING) return false;
  const startedAt = new Date(
    resource.syncStartedAt ?? resource.createdAt
  ).getTime();
  return now - startedAt < constants.RESOURCE_SYNC_STALE_MS;
};
