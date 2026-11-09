export interface GuardVersion {
  id: string;
  version: number;
  sourceKind: string | null;
  tools: Array<{ name: string }> | null;
}

export interface DashboardLive {
  version: number;
  lost: string[];
}

/**
 * Whether a deploy would replace code made in the app, by the assistant. A
 * CLI deploy publishes this folder's code as the whole project, so anything
 * built in the app since is gone unless the author copied it back first.
 */
export const appLive = (
  list: { activeVersionId: string | null; versions: GuardVersion[] },
  nextTools: string[]
): DashboardLive | null => {
  const live = list.versions.find(row => row.id === list.activeVersionId);
  if (!live || live.sourceKind !== 'editor') {
    return null;
  }
  const next = new Set(nextTools);
  return {
    version: live.version,
    lost: (live.tools ?? [])
      .map(tool => tool.name)
      .filter(name => !next.has(name))
  };
};
