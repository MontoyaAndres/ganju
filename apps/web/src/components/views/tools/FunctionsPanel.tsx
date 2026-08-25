import { useEffect, useMemo, useState } from 'react';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import {
  Add,
  Close,
  CodeOutlined,
  DeleteOutlined,
  EditOutlined,
  ExpandMore,
  PlayArrowOutlined,
  RocketLaunchOutlined,
  SaveOutlined,
  UndoOutlined,
  Warning
} from '@mui/icons-material';
import Switch from '@mui/material/Switch';

import { CodeEditor } from './CodeEditor';
import { MetaGridSkeleton, ToolRowsSkeleton } from './Skeletons';
import { JsonEditor, SCHEMA_META_SCHEMA } from './JsonEditor';
import { ModalDialog, ModalOverlay } from './styles';

export interface ManifestTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface CustomCodeVersion {
  id: string;
  version: number;
  status: string;
  tools: ManifestTool[];
  error: string | null;
  sourceKind?: string;
  scriptTag?: string | null;
  publishedAt: string | null;
  createdAt: string;
}

interface Props {
  apiBase: string;
  loading: boolean;
  activeVersionId: string | null;
  versions: CustomCodeVersion[];
  // The enabled subset of the live version's tools, from the row's config.
  // Null/empty means all of them — the convention mcp-proxy already uses.
  allowedTools: string[] | null;
  onSetAllowedTools: (next: string[] | null) => Promise<void>;
  // Reload the version list alone. Saving a draft changes nothing else on the
  // page, and the full reload below moves the whole view back to a loading
  // state — which unmounts this panel and everything in it.
  onVersionsChanged: () => Promise<void> | void;
  // Reload the page's data. Only for what really changes it: publishing or
  // rolling back moves which tools the server exposes, and the first publish can
  // create the install row the budget meter counts.
  onChanged: () => Promise<void> | void;
}

interface TestRun {
  tool: string;
  pending: boolean;
  ran?: boolean;
  output?: unknown;
  logs?: string[];
  error?: string;
  durationMs?: number;
  inputViolations?: { path: string; message: string }[];
  outputViolations?: { path: string; message: string }[];
}

const DRAFT = utils.constants.CUSTOM_CODE_VERSION_STATUS_DRAFT;
const MAIN = utils.constants.CUSTOM_CODE_MAIN_MODULE;

// What a brand-new script looks like. The import specifier is the sibling module
// the publish pipeline attaches to every deploy — there is no build step, so what
// is in this box is what runs.
const STARTER_SOURCE = `import { createHandler, defineTool } from '${utils.constants.CUSTOM_CODE_SDK_SPECIFIER}';

export default createHandler({});
`;

// A tool name is kebab-case and an identifier cannot be, so the handler that
// implements `lookup-order` is `lookupOrder`. The map below is what ties the two
// together, which is the point of writing the handler as a named function rather
// than inline: a tool becomes something you can read, move and jump to, and the
// map stays a table of contents.
const identifierFor = (name: string): string => {
  const camel = name
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_, next: string | undefined) =>
      next ? next.toUpperCase() : ''
    )
    .replace(/^[^a-zA-Z_$]+/, '');
  return camel || 'handler';
};

// Two functions can camel-case to the same identifier (`lookup-order` and
// `lookup_order`), and the author may already have used the name themselves.
const freeIdentifier = (source: string, base: string): string => {
  let candidate = base;
  let suffix = 2;
  while (new RegExp(`\\b${candidate}\\b`).test(source)) {
    candidate = `${base}${suffix++}`;
  }
  return candidate;
};

// The JSON-schema types the platform accepts, as the TypeScript they mean.
const TS_TYPES: Record<string, string> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  object: 'Record<string, unknown>',
  array: 'unknown[]'
};

/**
 * The handler's type, written as JSDoc.
 *
 * `defineTool` types a function passed straight to it, and the handlers here are
 * declared above the map and passed by name — which is worth the trade, but it
 * means inference has nothing to work with and `input` and `ctx` land as `any`.
 * A JSDoc `@type` restores both, and it is the only way to say so in a file that
 * is deployed exactly as written: a TypeScript annotation would reach the
 * runtime as a syntax error.
 *
 * The input type is generated from the tool's own declared schema, so
 * `input.orderId` completes and a property nobody declared does not. It is
 * rewritten whenever the schema changes, the same way a rename rewrites the
 * handler's name.
 */
const typeFor = (tool: ManifestTool): string => {
  const properties = (tool.inputSchema?.properties || {}) as Record<
    string,
    { type?: string }
  >;
  const required = new Set(
    (tool.inputSchema?.required as string[] | undefined) || []
  );
  const fields = Object.entries(properties).map(([name, schema]) => {
    const type = TS_TYPES[schema?.type || ''] || 'unknown';
    return `${name}${required.has(name) ? '' : '?'}: ${type}`;
  });
  const input = fields.length ? `{ ${fields.join('; ')} }` : 'never';
  return `/** @type {import('${utils.constants.CUSTOM_CODE_SDK_SPECIFIER}').ToolHandler<${input}>} */`;
};

/**
 * Render one handler stub for a newly declared function.
 *
 * Generated rather than left to the author because the manifest and the code are
 * checked against each other at publish time: a function declared here whose
 * handler is missing (or spelled differently) deploys and then fails the health
 * probe. Writing both from the same click is what keeps them from ever
 * disagreeing.
 */
const scaffold = (
  tool: ManifestTool,
  identifier: string
): { declaration: string; entry: string } => {
  const params = Object.keys(
    (tool.inputSchema?.properties as Record<string, unknown>) || {}
  );
  const example = params.length
    ? `  // input.${params[0]} is declared in this tool's input schema\n`
    : '';
  return {
    declaration: `${typeFor(tool)}
const ${identifier} = async (input, ctx) => {
${example}  ctx.log('${tool.name} called');
  return { ok: true };
};
`,
    entry: `  '${tool.name}': defineTool(${identifier})`
  };
};

// Add a declared function to the source: its handler above, its entry in the
// map. A regex rather than a parser because the shape is ours — the starter file
// above is what every editor session begins from — and because a splice that
// cannot find its landmark falls back to a comment rather than corrupting the
// author's file.
const withStub = (source: string, tool: ManifestTool): string => {
  const { declaration, entry } = scaffold(
    tool,
    freeIdentifier(source, identifierFor(tool.name))
  );

  const exportAt = source.search(/export\s+default\s+createHandler\s*\(/);
  if (exportAt === -1) {
    return `${source}\n\n// Add this tool to your handler:\n// ${declaration.replace(/\n/g, '\n// ')}\n// ${entry.trim()}\n`;
  }

  // The handler goes immediately above the export, so the file reads top to
  // bottom: imports, the functions, then the map that names them.
  const withDeclaration = `${source.slice(0, exportAt)}${declaration}\n${source.slice(exportAt)}`;

  const empty = withDeclaration.match(/createHandler\(\{\s*\}\)/);
  if (empty) {
    return withDeclaration.replace(empty[0], `createHandler({\n${entry}\n})`);
  }
  const open = withDeclaration.indexOf('createHandler({');
  const insertAt = open + 'createHandler({'.length;
  return `${withDeclaration.slice(0, insertAt)}\n${entry},${withDeclaration.slice(insertAt)}`;
};

// Renaming a declared function has to rename its handler too, or the next deploy
// fails the health probe on a name the author thought they had changed. The key
// is renamed always; the identifier only when the map still reads the way this
// file wrote it — `'name': defineTool(identifier)` — because anything else is
// the author's own arrangement and not ours to rewrite.
const restubType = (
  source: string,
  identifier: string,
  tool: ManifestTool
): string => {
  // Anchored on the generated line immediately above the declaration. If the
  // author rewrote or removed it, it is theirs now and this leaves it alone —
  // the same rule the rename below follows.
  const pattern = new RegExp(
    `/\\*\\* @type \\{import\\('[^']*'\\)\\.ToolHandler<[^\n]*>\\} \\*/\\n(?=const ${identifier}\\b)`
  );
  return pattern.test(source)
    ? source.replace(pattern, `${typeFor(tool)}\n`)
    : source;
};

// Renaming a declared function has to rename its handler too, or the next deploy
// fails the health probe on a name the author thought they had changed. The key
// is renamed always; the identifier only when the map still reads the way this
// file wrote it — `'name': defineTool(identifier)` — because anything else is
// the author's own arrangement and not ours to rewrite.
const renameStub = (source: string, from: string, to: ManifestTool): string => {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let next = source;
  const wired = next.match(
    new RegExp(
      `(['"\`])${escaped}\\1\\s*:\\s*defineTool\\(\\s*([A-Za-z_$][\\w$]*)\\s*\\)`
    )
  );

  if (wired) {
    let current = wired[2];
    const wanted = identifierFor(to.name);
    if (current !== wanted) {
      // Excluding its own occurrences, so a rename never collides with the
      // identifier it is replacing.
      const others = next.replace(new RegExp(`\\b${current}\\b`, 'g'), '');
      const free = freeIdentifier(others, wanted);
      next = next.replace(new RegExp(`\\b${current}\\b`, 'g'), free);
      current = free;
    }
    // The schemas can have changed in the same dialog, and the handler's type is
    // generated from them — so it is refreshed here rather than left describing
    // the arguments the tool used to take.
    next = restubType(next, current, to);
  }

  return next.replace(
    new RegExp(`(['"\`])${escaped}\\1(\\s*:)`, 'g'),
    `'${to.name}'$2`
  );
};

const emptySchema = () => ({ type: 'object', properties: {} });

const parseSchema = (raw: string): Record<string, unknown> | null => {
  const text = raw.trim();
  if (!text) return null;
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Schema must be a JSON object');
  }
  return parsed as Record<string, unknown>;
};

const formatWhen = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : '—';

const argCount = (tool: ManifestTool): number =>
  Object.keys((tool.inputSchema?.properties as Record<string, unknown>) || {})
    .length;

export const FunctionsPanel = ({
  apiBase,
  loading: versionsLoading,
  activeVersionId,
  versions,
  allowedTools,
  onSetAllowedTools,
  onVersionsChanged,
  onChanged
}: Props) => {
  const snackbar = UI.Alert.useSnackbar();
  const customCodeBase = `${apiBase}/custom-code`;

  // The version being edited. Defaults to whatever is live, so opening the tab
  // shows what the server is actually serving rather than a stale draft.
  const [openVersionId, setOpenVersionId] = useState<string | null>(null);
  // The whole script, keyed by the path each file deploys as. One file is the
  // ordinary case and is simply a map of one.
  const [files, setFiles] = useState<Record<string, string>>({
    [MAIN]: STARTER_SOURCE
  });
  const [activePath, setActivePath] = useState(MAIN);
  // Folders someone made that hold nothing yet. Session-only, because a folder
  // is a shared prefix of paths and an empty one has no path to live in.
  const [emptyFolders, setEmptyFolders] = useState<string[]>([]);
  const [manifest, setManifest] = useState<ManifestTool[]>([]);
  const [editable, setEditable] = useState(true);
  const [sourceKind, setSourceKind] = useState<string | null>(null);
  // Pulling one version's stored source.
  const [sourceLoading, setSourceLoading] = useState(false);
  // One flag rather than several booleans: every one of these disables the same
  // buttons, and two of them running at once is never right.
  const [busy, setBusy] = useState<'draft' | 'deploy' | 'rollback' | null>(
    null
  );
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<
    { mode: 'create' } | { mode: 'edit'; tool: ManifestTool } | null
  >(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Sample input per function, kept while the tab is open so a run can be
  // repeated after an edit without retyping it.
  const [testInput, setTestInput] = useState<Record<string, string>>({});
  const [testRun, setTestRun] = useState<TestRun | null>(null);
  const [togglingTool, setTogglingTool] = useState<string | null>(null);

  // Either half of the load means the panel does not yet know what it is
  // showing, and both resolve into the same screen — so they collapse into one
  // flag rather than two states with two different placeholders.
  const loading = versionsLoading || sourceLoading;

  const openVersion = useMemo(
    () => versions.find(v => v.id === openVersionId) || null,
    [versions, openVersionId]
  );
  const latest = versions[0] || null;
  const activeVersion = versions.find(v => v.id === activeVersionId) || null;
  const isLive = !!openVersion && openVersion.id === activeVersionId;
  const isDraft = openVersion?.status === DRAFT;

  useEffect(() => {
    if (openVersionId) return;
    const target = activeVersionId || latest?.id || null;
    if (target) setOpenVersionId(target);
  }, [activeVersionId, latest, openVersionId]);

  // Pull the stored source whenever the open version changes. A version with no
  // object in storage answers `source: null` — say so rather than silently
  // handing back an empty file that a deploy would then publish.
  useEffect(() => {
    if (!openVersionId) return;
    let cancelled = false;
    setSourceLoading(true);
    utils
      .fetcher({
        url: `${customCodeBase}/version/${openVersionId}/source`,
        config: { credentials: 'include' }
      })
      .then(data => {
        if (cancelled || !data) return;
        setEditable(data.editable !== false);
        setSourceKind(data.sourceKind ?? null);
        setManifest(Array.isArray(data.tools) ? data.tools : []);
        // `files` is what a project stores; `source` is what a single-file
        // version and every CLI bundle still are.
        const loaded =
          data.files && typeof data.files === 'object'
            ? (data.files as Record<string, string>)
            : {
                [MAIN]:
                  typeof data.source === 'string' && data.source
                    ? data.source
                    : STARTER_SOURCE
              };
        setFiles(loaded);
        setActivePath(
          loaded[MAIN] !== undefined ? MAIN : Object.keys(loaded)[0]
        );
        setEmptyFolders([]);
        setDirty(false);
        setExpanded(null);
      })
      .catch(() => {
        if (!cancelled) snackbar.error('Could not load this version’s code');
      })
      .finally(() => !cancelled && setSourceLoading(false));
    return () => {
      cancelled = true;
    };
  }, [openVersionId]);

  const startFresh = () => {
    setOpenVersionId(null);
    setFiles({ [MAIN]: STARTER_SOURCE });
    setActivePath(MAIN);
    setEmptyFolders([]);
    setManifest([]);
    setEditable(true);
    setSourceKind(utils.constants.CUSTOM_CODE_SOURCE_KIND_EDITOR);
    setDirty(true);
  };

  // The manifest and the handlers live in the main module, so declaring or
  // renaming a function edits that file wherever the author happens to be.
  const editMain = (edit: (source: string) => string) => {
    setFiles(prev => ({ ...prev, [MAIN]: edit(prev[MAIN] ?? STARTER_SOURCE) }));
  };

  const saveFunction = (tool: ManifestTool) => {
    const previous = editing?.mode === 'edit' ? editing.tool : null;
    if (previous) {
      setManifest(prev => prev.map(t => (t.name === previous.name ? tool : t)));
      editMain(prev => renameStub(prev, previous.name, tool));
    } else {
      setManifest(prev => [...prev, tool]);
      editMain(prev => withStub(prev, tool));
    }
    setDirty(true);
    setEditing(null);
  };

  const createFile = (path: string) => {
    if (files[path] !== undefined) {
      snackbar.error('That file already exists');
      return;
    }
    if (Object.keys(files).length >= utils.constants.CUSTOM_CODE_MAX_FILES) {
      snackbar.error(
        `A script can hold ${utils.constants.CUSTOM_CODE_MAX_FILES} files.`
      );
      return;
    }
    setFiles(prev => ({
      ...prev,
      [path]: `// ${path}\n// Import this from ${MAIN}: import { … } from './${path}';\n`
    }));
    // The folder it went into is no longer empty, so it stops being carried.
    setEmptyFolders(prev =>
      prev.filter(folder => !path.startsWith(`${folder}/`))
    );
    setActivePath(path);
    setDirty(true);
  };

  const createFolder = (path: string) => {
    setEmptyFolders(prev => (prev.includes(path) ? prev : [...prev, path]));
  };

  // Deletes a file, or a folder and everything beneath it — the explorer offers
  // both and they are the same operation on a map of paths. The main module is
  // refused either way: directly, and as a folder that happens to contain it,
  // because "delete lib/" should never be the way a script loses its entry
  // point.
  const deleteFile = (path: string) => {
    if (path === MAIN) return;
    const prefix = `${path}/`;
    if (MAIN.startsWith(prefix)) return;

    setFiles(prev => {
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (key === path || key.startsWith(prefix)) continue;
        next[key] = value;
      }
      return next;
    });
    setEmptyFolders(prev =>
      prev.filter(folder => folder !== path && !folder.startsWith(prefix))
    );
    if (activePath === path || activePath.startsWith(prefix)) {
      setActivePath(MAIN);
    }
    setDirty(true);
  };

  /**
   * Rename a file, or a folder and every path under it.
   *
   * A folder is a prefix, so renaming one is a prefix rewrite across the map —
   * there is no directory to move. Key order is preserved rather than the moved
   * entries being appended, so the file list doesn't reshuffle under someone who
   * only renamed one thing.
   *
   * The name itself was already checked in the explorer against
   * `validateProjectPath`, the same rule the upload path enforces. What is
   * checked here is the one thing that isn't about the name: the main module
   * cannot move, because the dispatcher calls it by that exact path.
   */
  const renamePath = (from: string, to: string) => {
    if (from === to || from === MAIN) return;
    const prefix = `${from}/`;
    if (MAIN === from || MAIN.startsWith(prefix)) return;

    setFiles(prev => {
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (key === from) next[to] = value;
        else if (key.startsWith(prefix))
          next[to + key.slice(from.length)] = value;
        else next[key] = value;
      }
      return next;
    });
    setEmptyFolders(prev =>
      prev.map(folder =>
        folder === from
          ? to
          : folder.startsWith(prefix)
            ? to + folder.slice(from.length)
            : folder
      )
    );
    if (activePath === from) setActivePath(to);
    else if (activePath.startsWith(prefix)) {
      setActivePath(to + activePath.slice(from.length));
    }
    setDirty(true);
  };

  // Local only, and deliberately: the manifest is written at deploy time, so a
  // function stops being advertised on the next deploy and not before. The
  // handler stays in the code — an export the manifest doesn't declare is
  // harmless, and deleting someone's code from under them is not.
  const removeFunction = (name: string) => {
    setManifest(prev => prev.filter(t => t.name !== name));
    if (expanded === name) setExpanded(null);
    setDirty(true);
  };

  /**
   * Create a version and attach the source to it.
   *
   * Two calls rather than one because that is the shape of the API: the manifest
   * is JSON and the source is a body, and one request carries one body. A
   * failure at either step leaves a visible draft with its error recorded, which
   * is the behaviour worth having — a half-finished deploy you can see beats one
   * that silently didn't happen.
   */
  const createVersion = async (): Promise<CustomCodeVersion | null> => {
    const created = await utils.fetcher({
      url: `${customCodeBase}/version`,
      config: {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ manifest: { tools: manifest } })
      }
    });
    if (created?.error || !created?.id) {
      snackbar.error(created?.error || 'Could not create the version');
      return null;
    }

    // Uploaded as a project envelope rather than one file's text: the server
    // stores it whole and deploys one module per file, which is what lets
    // index.js import the rest.
    const uploaded = await utils.fetcher({
      url: `${customCodeBase}/version/${created.id}/bundle?kind=${utils.constants.CUSTOM_CODE_SOURCE_KIND_EDITOR}`,
      config: {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: utils.encodeProject(files)
      }
    });
    if (uploaded?.error) {
      snackbar.error(uploaded.error);
      await onVersionsChanged();
      return null;
    }

    setOpenVersionId(created.id);
    setDirty(false);
    return created as CustomCodeVersion;
  };

  const activate = async (
    versionId: string,
    route: 'publish' | 'rollback'
  ): Promise<boolean> => {
    const data = await utils.fetcher({
      url: `${customCodeBase}/version/${versionId}/${route}`,
      config: { method: 'POST', credentials: 'include' }
    });
    if (data?.error) {
      snackbar.error(data.error);
      await onVersionsChanged();
      return false;
    }
    return true;
  };

  // Save without exposing anything: the version exists, holds this code, and is
  // not served to a single MCP client until it is published.
  const saveDraft = async () => {
    if (busy || !editable) return;
    if (manifest.length === 0) {
      snackbar.error('Declare at least one function first');
      return;
    }
    setBusy('draft');
    try {
      const created = await createVersion();
      if (created) snackbar.success(`Draft v${created.version} saved`);
      await onVersionsChanged();
    } catch {
      snackbar.error('Could not save the draft');
    } finally {
      setBusy(null);
    }
  };

  const deploy = async () => {
    if (busy) return;
    if (manifest.length === 0) {
      snackbar.error('Declare at least one function before deploying');
      return;
    }
    setBusy('deploy');
    try {
      // An untouched draft is already stored exactly as it would be re-uploaded,
      // so publish it rather than minting a second version that differs from it
      // in nothing but its number.
      const target =
        !dirty && isDraft && openVersion ? openVersion : await createVersion();
      if (!target) return;
      if (await activate(target.id, 'publish')) {
        snackbar.success(`v${target.version} deployed`);
      }
      await onChanged();
    } catch {
      snackbar.error('Deploy failed');
    } finally {
      setBusy(null);
    }
  };

  const rollback = async (version: CustomCodeVersion) => {
    if (busy) return;
    setBusy('rollback');
    try {
      if (await activate(version.id, 'rollback')) {
        snackbar.success(`Rolled back to v${version.version}`);
        setOpenVersionId(version.id);
      }
      await onChanged();
    } finally {
      setBusy(null);
    }
  };

  /**
   * Run one function against a sample input, without publishing it.
   *
   * The server deploys this version to a preview script nothing dispatches to,
   * calls the one tool, and removes it again — so the answer comes from the real
   * runtime, with the artifact's real connections and the real egress rules, and
   * the live version keeps serving MCP clients throughout.
   */
  const runTest = async (tool: ManifestTool) => {
    if (!openVersionId || testRun?.pending) return;

    let input: unknown = {};
    const raw = (testInput[tool.name] ?? '').trim();
    if (raw) {
      try {
        input = JSON.parse(raw);
      } catch {
        setTestRun({
          tool: tool.name,
          pending: false,
          ran: false,
          error: 'The sample input is not valid JSON.'
        });
        return;
      }
    }

    setTestRun({ tool: tool.name, pending: true });
    try {
      const data = await utils.fetcher({
        url: `${customCodeBase}/version/${openVersionId}/test`,
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ tool: tool.name, input })
        }
      });
      if (data?.error && data.ran === undefined) {
        // An API-level failure (not deployed, no code, over plan) rather than a
        // failure inside the tool. Both belong in the panel, and they read
        // differently, so only this one loses the run.
        setTestRun({
          tool: tool.name,
          pending: false,
          ran: false,
          error: data.error
        });
        return;
      }
      setTestRun({ tool: tool.name, pending: false, ...data });
    } catch {
      setTestRun({
        tool: tool.name,
        pending: false,
        ran: false,
        error: 'The test could not be run.'
      });
    }
  };

  /**
   * Turn one live function on or off without redeploying.
   *
   * The switch writes the row's `allowedTools`, not the manifest: the code stays
   * exactly as deployed and only what the MCP server offers changes. Absent or
   * empty means everything, so turning the first one off has to write the full
   * list minus that name rather than an empty one.
   */
  const toggleExposed = async (name: string, next: boolean) => {
    if (togglingTool) return;
    const names = (activeVersion?.tools || []).map(t => t.name);
    const current =
      allowedTools && allowedTools.length > 0 ? allowedTools : names;
    const updated = next
      ? Array.from(new Set([...current, name]))
      : current.filter(entry => entry !== name);

    // An empty allow-list means "all of them" — that is the convention the boot
    // loop and mcp-proxy share, and it makes "none of them" unrepresentable. So
    // the last one on cannot be turned off, exactly as mcp-proxy refuses to save
    // a server with zero tools enabled. A script that should serve nothing is a
    // script to roll back, not one to switch off a function at a time.
    if (!next && updated.length === 0) {
      snackbar.error(
        'At least one function has to stay on. Roll back to a version without it instead.'
      );
      return;
    }

    setTogglingTool(name);
    try {
      // Every tool on means the same thing as no list at all, and storing the
      // shorter of the two keeps a version that adds a tool from silently
      // shipping it disabled.
      await onSetAllowedTools(updated.length === names.length ? null : updated);
    } finally {
      setTogglingTool(null);
    }
  };

  const headline = openVersion
    ? `v${openVersion.version} · ${isLive ? 'live' : openVersion.status}`
    : 'New script — not deployed yet';

  return (
    <div className="tools-functions">
      <div className="tools-section-header">
        <div>
          <h2 className="tools-section-title">Functions</h2>
          <p className="tools-section-subtitle">
            {loading ? (
              <UI.Skeleton variant="text" width={190} height={14} />
            ) : (
              <>
                {versions.length === 0 && `${headline} · `}
                {manifest.length}{' '}
                {manifest.length === 1 ? 'function' : 'functions'}
                {dirty && ' · unsaved changes'}
              </>
            )}
          </p>
        </div>
        <div className="tools-functions-actions">
          {/* Which version is open, and what it is. Picking one loads its code —
              the source is fetched for whatever `openVersionId` names — so this
              is both the history and the way into it. */}
          {versions.length > 0 && (
            <div className="tools-version-picker">
              <UI.Select
                label="Version"
                size="small"
                value={openVersionId ?? ''}
                disabled={!!busy}
                options={[
                  // Only while a fresh script is being written: there is no row
                  // to name yet, and a blank select would read as broken.
                  ...(openVersionId === null
                    ? [{ value: '', label: 'New script · unsaved' }]
                    : []),
                  ...versions.map(v => ({
                    value: v.id,
                    label: `v${v.version} · ${
                      v.id === activeVersionId
                        ? 'live'
                        : v.error
                          ? `${v.status} · failed`
                          : v.status
                    }`
                  }))
                ]}
                onChange={e => setOpenVersionId(e.target.value || null)}
              />
            </div>
          )}
          {/* A published version that is not the live one is a rollback, not a
              deploy — the endpoints differ and so does what happened. Hidden
              while dirty, because then the button below is minting a new
              version out of what is in the editor. */}
          {openVersion && !isLive && !isDraft && !dirty && (
            <UI.Button
              size="small"
              disabled={!!busy}
              onClick={() => rollback(openVersion)}
            >
              <UndoOutlined />
              <span className="button-text">
                {busy === 'rollback'
                  ? 'Rolling back…'
                  : `Roll back to v${openVersion.version}`}
              </span>
            </UI.Button>
          )}
          <UI.Button
            size="small"
            disabled={!editable}
            onClick={() => setEditing({ mode: 'create' })}
          >
            <Add />
            <span className="button-text">New function</span>
          </UI.Button>
          <UI.Button
            size="small"
            disabled={!!busy || !editable || manifest.length === 0}
            onClick={saveDraft}
          >
            <SaveOutlined />
            <span className="button-text">
              {busy === 'draft' ? 'Saving…' : 'Save draft'}
            </span>
          </UI.Button>
          <UI.Button
            variant="contained"
            size="small"
            disabled={!!busy || !editable || manifest.length === 0}
            onClick={deploy}
          >
            <RocketLaunchOutlined />
            <span className="button-text">
              {busy === 'deploy' ? 'Deploying…' : 'Deploy'}
            </span>
          </UI.Button>
        </div>
      </div>

      {(openVersion?.error || latest?.error) && (
        <div className="tools-banner tools-banner-error">
          <Warning />
          <span>
            {openVersion?.error
              ? `v${openVersion.version} failed to publish — ${openVersion.error}`
              : `v${latest!.version} failed to publish — ${latest!.error}`}
          </span>
        </div>
      )}

      {!editable && (
        <div className="tools-banner tools-banner-warning">
          <Warning />
          <span>
            This version was uploaded from the CLI, so its code is a compiled
            bundle and can’t be edited here.{' '}
            <button
              type="button"
              className="tools-inline-link"
              onClick={startFresh}
            >
              Start a new script
            </button>{' '}
            to edit in the dashboard.
          </span>
        </div>
      )}

      {/* What is actually deployed, and when. A version is the unit of both
          code and contract here — the tool names an MCP client sees come from
          this row, not from the running script — so its metadata is worth
          reading before changing anything. */}
      {loading && <MetaGridSkeleton />}

      {!loading && openVersion && (
        <dl className="tools-meta-grid">
          <div>
            <dt>Version</dt>
            <dd>v{openVersion.version}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span
                className={`tools-version-chip ${isLive ? 'live' : openVersion.status}`}
              >
                {isLive ? 'live' : openVersion.status}
              </span>
            </dd>
          </div>
          <div>
            <dt>Functions</dt>
            <dd>{openVersion.tools?.length || 0}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              {sourceKind === utils.constants.CUSTOM_CODE_SOURCE_KIND_EDITOR
                ? 'Dashboard editor'
                : 'CLI bundle'}
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatWhen(openVersion.createdAt)}</dd>
          </div>
          <div>
            <dt>Published</dt>
            <dd>{formatWhen(openVersion.publishedAt)}</dd>
          </div>
        </dl>
      )}

      {/* "No functions yet" is only true once the version and its manifest have
          been read. Before that it is a guess, and the wrong one for anyone who
          has already deployed something. */}
      {loading ? (
        <ToolRowsSkeleton rows={2} />
      ) : manifest.length === 0 ? (
        <div className="tools-empty-state">
          <CodeOutlined />
          <h3>No functions yet</h3>
          <p>
            Declare a function — its name, description and input — and its
            handler is written into the editor for you.
          </p>
          <UI.Button
            variant="contained"
            size="small"
            disabled={!editable}
            onClick={() => setEditing({ mode: 'create' })}
          >
            <Add />
            <span className="button-text">New function</span>
          </UI.Button>
        </div>
      ) : (
        <div className="tools-function-list">
          {manifest.map(fn => {
            const open = expanded === fn.name;
            // The switch writes the row's config, which applies to whatever is
            // live — so it is only meaningful, and only shown, while looking at
            // the live version.
            const exposed =
              !allowedTools ||
              allowedTools.length === 0 ||
              allowedTools.includes(fn.name);
            const run = testRun?.tool === fn.name ? testRun : null;
            return (
              <div
                key={fn.name}
                className={`tools-function-item ${open ? 'expanded' : ''}`}
              >
                <div className="tools-function-item-row">
                  <button
                    type="button"
                    className="tools-function-item-main"
                    onClick={() => setExpanded(open ? null : fn.name)}
                    aria-expanded={open}
                  >
                    <p className="tools-function-item-title">
                      {fn.title || fn.name}
                    </p>
                    {fn.description && (
                      <p className="tools-function-item-description">
                        {fn.description}
                      </p>
                    )}
                    <span className="tools-function-item-tags">
                      <code className="tools-function-item-id">{fn.name}</code>
                      <span className="tools-function-tag">
                        {argCount(fn)} {argCount(fn) === 1 ? 'input' : 'inputs'}
                      </span>
                      {fn.outputSchema && (
                        <span className="tools-function-tag">
                          structured output
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="tools-function-item-actions">
                    {isLive && !exposed && (
                      <span className="tools-state-chip">Off</span>
                    )}
                    <ExpandMore
                      className={`tools-function-chevron ${open ? 'open' : ''}`}
                      fontSize="small"
                    />
                    {/* Deployed either way — this only decides whether the MCP
                        server offers it, which is why it needs no redeploy and
                        why it is the cheap way to shorten a tool list. */}
                    {isLive && (
                      <Tooltip
                        title={
                          exposed
                            ? 'On your MCP server — turn off to stop offering it, without redeploying'
                            : 'Deployed but not offered — turn on to expose it'
                        }
                      >
                        <span>
                          <Switch
                            size="small"
                            checked={exposed}
                            disabled={togglingTool !== null}
                            onChange={(_, checked) =>
                              toggleExposed(fn.name, checked)
                            }
                          />
                        </span>
                      </Tooltip>
                    )}
                    <Tooltip
                      title={
                        openVersion
                          ? 'Run this function against a sample input'
                          : 'Save a draft before running this'
                      }
                    >
                      <span>
                        <IconButton
                          size="small"
                          disabled={!openVersion || !!testRun?.pending}
                          onClick={() => {
                            setExpanded(fn.name);
                            runTest(fn);
                          }}
                        >
                          <PlayArrowOutlined fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    {editable && (
                      <>
                        <Tooltip title="Edit name, description and schemas">
                          <IconButton
                            size="small"
                            onClick={() =>
                              setEditing({ mode: 'edit', tool: fn })
                            }
                          >
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Stop declaring this function — its handler stays in your code">
                          <IconButton
                            size="small"
                            onClick={() => removeFunction(fn.name)}
                          >
                            <DeleteOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </div>
                </div>
                {open && (
                  <div className="tools-function-item-detail">
                    <div>
                      <p className="tools-function-detail-label">
                        Input schema
                      </p>
                      <pre className="tools-function-detail-code">
                        {JSON.stringify(
                          fn.inputSchema || emptySchema(),
                          null,
                          2
                        )}
                      </pre>
                    </div>
                    <div>
                      <p className="tools-function-detail-label">
                        Output schema
                      </p>
                      {fn.outputSchema ? (
                        <pre className="tools-function-detail-code">
                          {JSON.stringify(fn.outputSchema, null, 2)}
                        </pre>
                      ) : (
                        <p className="tools-function-detail-empty">
                          None — this tool returns text.
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {open && (
                  <div className="tools-function-test">
                    {/* Validated against the function's own input schema, so
                        the field refuses what the server would refuse — and
                        completes the arguments this tool declares rather than
                        leaving them to be remembered. Run sits in its header,
                        beside Format: it acts on what is in this box, and a row
                        of its own above the label only repeated the label. */}
                    <JsonEditor
                      compact
                      id={`test-input-${fn.name}`}
                      label="Sample input"
                      height="110px"
                      schema={fn.inputSchema || emptySchema()}
                      value={testInput[fn.name] ?? '{}'}
                      onChange={next =>
                        setTestInput(prev => ({ ...prev, [fn.name]: next }))
                      }
                      action={
                        <UI.Button
                          size="small"
                          disabled={!openVersion || !!testRun?.pending}
                          onClick={() => runTest(fn)}
                        >
                          <PlayArrowOutlined fontSize="small" />
                          <span className="button-text">
                            {run?.pending ? 'Running…' : 'Run'}
                          </span>
                        </UI.Button>
                      }
                    />
                    <p className="tools-function-detail-empty">
                      Runs this version on a preview script — your live tools
                      keep serving clients. Real connections, real resources,
                      real egress rules.
                    </p>

                    {run && !run.pending && (
                      <div className="tools-function-test-result">
                        {/* Refused by the input schema, so nothing ran. An MCP
                            client would have refused it the same way. */}
                        {!!run.inputViolations?.length && (
                          <div className="tools-test-block error">
                            <p className="tools-function-detail-label">
                              Input doesn’t match the schema
                            </p>
                            <ul>
                              {run.inputViolations.map((issue, index) => (
                                <li key={index}>
                                  <code>{issue.path || 'input'}</code>{' '}
                                  {issue.message}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {run.error && (
                          <div className="tools-test-block error">
                            <p className="tools-function-detail-label">Error</p>
                            <pre>{run.error}</pre>
                          </div>
                        )}

                        {run.ran && !run.error && (
                          <div className="tools-test-block">
                            <p className="tools-function-detail-label">
                              Output{' '}
                              {run.durationMs !== undefined &&
                                `· ${run.durationMs}ms`}
                            </p>
                            <pre>
                              {JSON.stringify(run.output ?? null, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* It returned, and it returned something other than
                            what it promised. The boot loop turns exactly this
                            into a failed call, so it is worth its own block. */}
                        {!!run.outputViolations?.length && (
                          <div className="tools-test-block error">
                            <p className="tools-function-detail-label">
                              Output doesn’t match the schema
                            </p>
                            <ul>
                              {run.outputViolations.map((issue, index) => (
                                <li key={index}>
                                  <code>{issue.path || 'output'}</code>{' '}
                                  {issue.message}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {!!run.logs?.length && (
                          <div className="tools-test-block">
                            <p className="tools-function-detail-label">
                              ctx.log
                            </p>
                            <pre>{run.logs.join('\n')}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* No editor until there is a function to write. The handler stub is
          generated from the declaration — that is what keeps the manifest and
          the code from disagreeing — so an empty editor offers a file whose
          keys nothing would match, next to a Save draft and a Deploy that are
          both disabled for the same reason. The empty state above is the one
          thing to do from here. */}
      {loading ? (
        <div className="tools-ide-loading">
          <UI.Skeleton variant="rounded" height={360} />
        </div>
      ) : manifest.length > 0 ? (
        <CodeEditor
          files={files}
          activePath={activePath}
          emptyFolders={emptyFolders}
          onSelect={setActivePath}
          onChange={next => {
            setFiles(prev => ({ ...prev, [activePath]: next }));
            setDirty(true);
          }}
          onCreateFile={createFile}
          onCreateFolder={createFolder}
          onDeleteFile={deleteFile}
          onRenamePath={renamePath}
          readOnly={!editable}
          dirty={dirty}
          onSave={saveDraft}
        />
      ) : null}

      {editing && (
        <FunctionModal
          initial={editing.mode === 'edit' ? editing.tool : null}
          existing={manifest.map(t => t.name)}
          onCancel={() => setEditing(null)}
          onSave={saveFunction}
        />
      )}
    </div>
  );
};

/**
 * Declare one function: what the model sees, and what it may pass.
 *
 * Metadata first, code second — the schemas are the contract the MCP client
 * reads at boot, and they are written to Postgres at publish time rather than
 * discovered from the running script.
 */
const FunctionModal = ({
  initial,
  existing,
  onCancel,
  onSave
}: {
  initial: ManifestTool | null;
  existing: string[];
  onCancel: () => void;
  onSave: (tool: ManifestTool) => void;
}) => {
  const [name, setName] = useState(initial?.name || '');
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [input, setInput] = useState(
    JSON.stringify(initial?.inputSchema || emptySchema(), null, 2)
  );
  const [output, setOutput] = useState(
    initial?.outputSchema ? JSON.stringify(initial.outputSchema, null, 2) : ''
  );
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setError('Name may only contain letters, digits, underscore or hyphen');
      return;
    }
    // Checked here as well as on the server: the server owns the rule, but
    // finding out after a deploy round-trip is a poor way to learn it.
    if (utils.isReservedToolName(trimmed)) {
      setError(utils.constants.RESERVED_TOOL_NAME_MESSAGE);
      return;
    }
    if (trimmed !== initial?.name && existing.includes(trimmed)) {
      setError('This script already declares a function by that name');
      return;
    }
    let inputSchema: Record<string, unknown> | null;
    let outputSchema: Record<string, unknown> | null;
    try {
      inputSchema = parseSchema(input) || emptySchema();
      outputSchema = parseSchema(output);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Schema is not valid JSON');
      return;
    }
    onSave({
      name: trimmed,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      inputSchema,
      ...(outputSchema ? { outputSchema } : {})
    });
  };

  return (
    <UI.Portal>
      <ModalOverlay onClick={onCancel}>
        <ModalDialog
          className="function-dialog"
          role="dialog"
          onClick={e => e.stopPropagation()}
        >
          <div className="tools-modal-header">
            <h2 className="tools-modal-title">
              {initial ? 'Edit function' : 'New function'}
            </h2>
            <IconButton size="small" onClick={onCancel}>
              <Close />
            </IconButton>
          </div>
          <div className="tools-modal-body">
            <label className="tools-field">
              <span>Name</span>
              <input
                value={name}
                placeholder="lookup-order"
                onChange={e => setName(e.target.value)}
              />
              <small>
                What the model calls. Becomes the MCP tool name and the key in
                your handler — renaming it here renames that key too.
              </small>
            </label>
            <label className="tools-field">
              <span>Title</span>
              <input
                value={title}
                placeholder="Look up order"
                onChange={e => setTitle(e.target.value)}
              />
            </label>
            <label className="tools-field">
              <span>Description</span>
              <textarea
                rows={3}
                value={description}
                placeholder="Find an order by its id. Use when the customer gives an order number."
                onChange={e => setDescription(e.target.value)}
              />
              <small>
                This is how the model decides whether to call it. Say when to
                use it, not just what it does.
              </small>
            </label>
            {/* Both fields validate against the schema shape the server
                accepts, so a key it would reject is underlined here rather than
                returned as a 400 after Add function. */}
            <JsonEditor
              id="function-input-schema"
              label="Input schema"
              height="170px"
              schema={SCHEMA_META_SCHEMA}
              value={input}
              onChange={setInput}
              help="What the model may pass. Every property it declares is offered to the model as an argument."
            />
            <JsonEditor
              id="function-output-schema"
              label="Output schema — optional"
              height="140px"
              schema={SCHEMA_META_SCHEMA}
              value={output}
              onChange={setOutput}
              help="Declare one and your tool must return a matching object — the MCP client gets structured output instead of text."
            />
            {error && <p className="tools-field-error">{error}</p>}
          </div>
          <div className="tools-modal-actions">
            <UI.Button onClick={onCancel}>
              <span className="button-text">Cancel</span>
            </UI.Button>
            <UI.Button variant="contained" onClick={submit}>
              <span className="button-text">
                {initial ? 'Save changes' : 'Add function'}
              </span>
            </UI.Button>
          </div>
        </ModalDialog>
      </ModalOverlay>
    </UI.Portal>
  );
};
