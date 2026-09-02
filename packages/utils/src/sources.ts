import { constants } from './constants';

export interface Source {
  resourceId: string;
  uri: string;
  title: string;
  sourceType: 'FILE' | 'WEBSITE' | 'CUSTOM_CODE';
  mimeType: string;
  fileName: string | null;
  pageNumber?: number;
  chunkIndex?: number;
  score?: number;
  excerpt?: string;
}

export interface ResourceUrlContext {
  apiUrl: string;
  organizationId: string;
  projectId: string;
}

/**
 * Does this source resolve to bytes we serve, rather than to a URL a reader can
 * open?
 *
 * The distinction the two formatters below need is "download link or web link",
 * and for a long time that was the same question as "is it a FILE". It stopped
 * being once a tool could write a resource: a script-created one holds bytes
 * exactly as an upload does, and its uri is a `resource://` address that means
 * nothing to a browser. Formatting it as a web link produced a dead button in
 * whichever channel the answer went to.
 */
export const isDownloadableSource = (
  sourceType: Source['sourceType']
): boolean =>
  sourceType === constants.RESOURCE_SOURCE_TYPE_FILE ||
  sourceType === constants.RESOURCE_SOURCE_TYPE_CUSTOM_CODE;

export const isResourceSourceEnabled = (
  resource: { showSource?: string | null } | null | undefined
): boolean =>
  (resource?.showSource ?? constants.STATUS_ACTIVE) !==
  constants.STATUS_DISABLED;

export const safeHostname = (url: string): string | null => {
  if (!URL.canParse(url)) return null;
  return new URL(url).hostname.replace(/^www\./, '');
};

export const buildResourceDownloadUrl = (
  ctx: ResourceUrlContext,
  resourceId: string,
  pageNumber?: number
): string => {
  const fragment = pageNumber ? `#page=${pageNumber}` : '';
  return `${ctx.apiUrl}/organization/${ctx.organizationId}/project/${ctx.projectId}/artifact/resource/${resourceId}/download${fragment}`;
};

export interface SourceButton {
  text: string;
  url: string;
}

const truncateLabel = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

export const formatSourcesAsButtons = (
  sources: Source[],
  ctx: ResourceUrlContext,
  options?: { maxLabelLength?: number }
): SourceButton[] => {
  const maxLabelLength = options?.maxLabelLength ?? 60;
  return sources.map((source, index) => {
    const position = index + 1;
    if (isDownloadableSource(source.sourceType)) {
      const label = source.fileName || source.title;
      const pageSuffix = source.pageNumber ? ` · p.${source.pageNumber}` : '';
      const url = buildResourceDownloadUrl(
        ctx,
        source.resourceId,
        source.pageNumber
      );
      return {
        text: truncateLabel(
          `${position} ${label}${pageSuffix}`,
          maxLabelLength
        ),
        url
      };
    }
    const domain = safeHostname(source.uri);
    const base = domain ? `${domain} — ${source.title}` : source.title;
    return {
      text: truncateLabel(`${position} ${base}`, maxLabelLength),
      url: source.uri
    };
  });
};

export const formatSourcesAsMarkdown = (
  sources: Source[],
  ctx: ResourceUrlContext
): string => {
  if (sources.length === 0) return '';
  const lines = sources.map((source, index) => {
    const position = index + 1;
    if (isDownloadableSource(source.sourceType)) {
      const label = source.fileName || source.title;
      const pageSuffix = source.pageNumber ? ` · p. ${source.pageNumber}` : '';
      const url = buildResourceDownloadUrl(
        ctx,
        source.resourceId,
        source.pageNumber
      );
      return `${position}. [${label}${pageSuffix}](${url})`;
    }
    const domain = safeHostname(source.uri);
    const label = domain ? `${domain} — ${source.title}` : source.title;
    return `${position}. [${label}](${source.uri})`;
  });
  return `**Sources**\n${lines.join('\n')}`;
};
