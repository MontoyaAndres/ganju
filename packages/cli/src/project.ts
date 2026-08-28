import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { CliError } from './errors.js';

export const PROJECT_FILE = 'ganju.json';

/** Where a `ganju.json` with no `apiUrl` is assumed to point. */
export const DEFAULT_API_URL = 'https://api.ganju.ai';

/**
 * One tool, as its author declares it.
 *
 * `input`/`output` rather than `inputSchema`/`outputSchema`: this file is
 * hand-edited, and the wire names read as stutter next to `name` and `title`.
 * They are mapped on the way to the API, which is the only place the longer
 * names mean anything.
 */
export interface ProjectTool {
  name: string;
  title?: string;
  description?: string;
  /**
   * The module whose default export handles this tool. When every tool names
   * one, the router is generated from this file — so the manifest is the single
   * place a tool name is written, and `lookup-order` vs `lookupOrder` stops
   * being a thing that can happen.
   */
  entry?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface ProjectFile {
  /** The artifact's slug. Checked against the linked project, never resolved from. */
  artifact?: string;
  apiUrl?: string;
  organizationId?: string;
  projectId?: string;
  /** The author's own router, for projects that don't declare a per-tool `entry`. */
  main?: string;
  connections?: string[];
  allowedHosts?: string[];
  timeoutMs?: number;
  resourceAccess?: 'own' | 'all';
  tools?: ProjectTool[];
}

export interface LoadedProject {
  /** Absolute path to the directory holding `ganju.json`. */
  root: string;
  path: string;
  file: ProjectFile;
}

/**
 * Find `ganju.json` by walking up from the working directory.
 *
 * The same rule every tool in this position uses, and for the same reason: a
 * deploy run from `src/` is a deploy of the project that `src/` belongs to.
 */
export const findProject = async (
  from = process.cwd()
): Promise<LoadedProject | null> => {
  let current = resolve(from);
  for (;;) {
    const candidate = join(current, PROJECT_FILE);
    try {
      const raw = await readFile(candidate, 'utf8');
      return {
        root: current,
        path: candidate,
        file: parseProjectFile(raw, candidate)
      };
    } catch (error) {
      if (error instanceof CliError) throw error;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
};

export const loadProject = async (): Promise<LoadedProject> => {
  const project = await findProject();
  if (!project) {
    throw new CliError(
      `No ${PROJECT_FILE} found in this directory or any above it`,
      {
        hint: 'Run `ganju init` to create one.'
      }
    );
  }
  return project;
};

const parseProjectFile = (raw: string, path: string): ProjectFile => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CliError(
      `${path} is not valid JSON — ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CliError(`${path} must contain a JSON object`);
  }
  return parsed as ProjectFile;
};

export const writeProjectFile = async (
  path: string,
  file: ProjectFile
): Promise<void> => {
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`);
};

/**
 * The organization and project a command acts on.
 *
 * Ids rather than the slug, because that is what every endpoint is keyed by.
 * The slug stays in the file as the human-readable half — `ganju link` writes
 * both, and `ganju deploy` reports the slug so nobody has to recognise a uuid to
 * know which server they just changed.
 */
export interface ProjectTarget {
  organizationId: string;
  projectId: string;
  artifact?: string;
}

export const requireTarget = (project: LoadedProject): ProjectTarget => {
  const { organizationId, projectId } = project.file;
  if (!organizationId || !projectId) {
    throw new CliError(`${project.path} is not linked to a project`, {
      hint: 'Run `ganju link` to choose an organization and project.'
    });
  }
  return { organizationId, projectId, artifact: project.file.artifact };
};

export const apiUrlFor = (project?: LoadedProject | null): string => {
  const url =
    process.env.GANJU_API_URL ?? project?.file.apiUrl ?? DEFAULT_API_URL;
  return url.replace(/\/+$/, '');
};

/**
 * The tools, checked for the two mistakes that are cheaper to catch here than in
 * a 400: no tools at all, and a mix of tools that name an `entry` and tools that
 * don't.
 *
 * The mix is refused rather than resolved because both resolutions are wrong. If
 * a declared `entry` wins, the tools without one silently never register; if the
 * author's own router wins, the entries they wrote are silently never imported.
 * There is no reading of that file where the author got what they asked for.
 */
export const readTools = (project: LoadedProject): ProjectTool[] => {
  const tools = project.file.tools ?? [];
  if (tools.length === 0) {
    throw new CliError(`${project.path} declares no tools`, {
      hint: 'Add a `tools` array — each entry needs at least a `name`.'
    });
  }
  const withEntry = tools.filter(tool => tool.entry);
  if (withEntry.length > 0 && withEntry.length !== tools.length) {
    const missing = tools.filter(tool => !tool.entry).map(tool => tool.name);
    throw new CliError(
      `Every tool needs an "entry", or none of them do — missing on ${missing.join(', ')}`,
      {
        hint: 'With an `entry` on every tool the router is generated for you. With none, `main` is your own router.'
      }
    );
  }
  return tools;
};

/** The manifest the publish API takes, built from what the author wrote. */
export const buildManifest = (tools: ProjectTool[]) => ({
  tools: tools.map(tool => ({
    name: tool.name,
    ...(tool.title ? { title: tool.title } : {}),
    ...(tool.description ? { description: tool.description } : {}),
    ...(tool.input ? { inputSchema: tool.input } : {}),
    ...(tool.output ? { outputSchema: tool.output } : {})
  }))
});

/**
 * The row-level config, sent beside the manifest.
 *
 * Only keys the author actually wrote are sent. The server applies its own
 * defaults, and a CLI that filled them in first would freeze today's default
 * into every project file that ever ran a deploy.
 */
export const buildConfig = (
  file: ProjectFile
): Record<string, unknown> | undefined => {
  const config: Record<string, unknown> = {};
  if (file.connections) config.connections = file.connections;
  if (file.allowedHosts) config.allowedHosts = file.allowedHosts;
  if (typeof file.timeoutMs === 'number') config.timeoutMs = file.timeoutMs;
  if (file.resourceAccess) config.resourceAccess = file.resourceAccess;
  return Object.keys(config).length > 0 ? config : undefined;
};
