import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';

/**
 * The script's files, as VS Code's Explorer.
 *
 * Not a decorative resemblance: this is the sidebar next to a Monaco editor, so
 * the person looking at it already knows how the real one behaves and will try
 * what it does — a twisty to fold a folder away, F2 to rename, right-click for
 * the rest, arrow keys to walk the tree. A tree that only *looks* like it and
 * answers none of those is worse than one that never invited the comparison.
 * So the behaviours come with the appearance: collapsible folders, indent
 * guides, per-type icons, inline creation and rename with the name selected and
 * the extension left alone, a context menu, and full keyboard navigation.
 *
 * What it is NOT is a filesystem. A project is a flat map of paths to source,
 * because that is what the Workers upload API takes — one module per file,
 * `index.js` the one the dispatcher calls. Folders are therefore not things
 * that exist; they are prefixes shared by paths. The tree is rebuilt from those
 * paths, which is why a folder created here and never filled disappears on
 * reload: there is nothing to store an empty prefix in, and inventing a
 * placeholder file to hold one would put a module in the deploy that nobody
 * wrote.
 */

interface Props {
  files: Record<string, string>;
  activePath: string;
  // Folders made in this session that hold nothing yet.
  emptyFolders: string[];
  readOnly: boolean;
  mainModule: string;
  sdkModule: string;
  onSelect: (path: string) => void;
  onCreateFile: (path: string) => void;
  onCreateFolder: (path: string) => void;
  onDelete: (path: string) => void;
  // A file, or a folder and everything beneath it. Both are one operation on a
  // map of paths, so they are one callback.
  onRename: (from: string, to: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
}

/** One visible line, after collapsed folders have been folded away. */
interface Row {
  node: TreeNode;
  depth: number;
}

type Draft =
  | { kind: 'file'; parent: string; value: string }
  | { kind: 'folder'; parent: string; value: string }
  | { kind: 'rename'; path: string; isFile: boolean; value: string };

const buildTree = (paths: string[], folders: string[]): TreeNode[] => {
  const root: TreeNode = { name: '', path: '', children: [], isFile: false };

  const folderAt = (segments: string[]): TreeNode => {
    let node = root;
    let prefix = '';
    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      let next = node.children.find(c => !c.isFile && c.name === segment);
      if (!next) {
        next = { name: segment, path: prefix, children: [], isFile: false };
        node.children.push(next);
      }
      node = next;
    }
    return node;
  };

  for (const folder of folders) folderAt(folder.split('/'));

  for (const path of paths) {
    const segments = path.split('/');
    const name = segments.pop() as string;
    folderAt(segments).children.push({
      name,
      path,
      children: [],
      isFile: true
    });
  }

  // Folders before files, then alphabetical inside each — VS Code's default
  // sort, and the reason a deep tree stays scannable.
  const sort = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach(node => sort(node.children));
    return nodes;
  };

  return sort(root.children);
};

/** The tree as the flat list of lines actually on screen. */
const flatten = (
  nodes: TreeNode[],
  collapsed: Set<string>,
  depth = 0,
  out: Row[] = []
): Row[] => {
  for (const node of nodes) {
    out.push({ node, depth });
    if (!node.isFile && !collapsed.has(node.path)) {
      flatten(node.children, collapsed, depth + 1, out);
    }
  }
  return out;
};

const folderPaths = (nodes: TreeNode[], out: string[] = []): string[] => {
  for (const node of nodes) {
    if (!node.isFile) {
      out.push(node.path);
      folderPaths(node.children, out);
    }
  }
  return out;
};

/** How many files a folder would take with it. */
const countUnder = (files: Record<string, string>, folder: string): number =>
  Object.keys(files).filter(path => path.startsWith(`${folder}/`)).length;

const parentOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

const join = (parent: string, name: string): string =>
  parent ? `${parent}/${name}` : name;

/**
 * Where a new file goes when the selection is a file rather than a folder:
 * beside it, which is what every editor does and what someone working inside a
 * folder means by "new file".
 */
// Enough to keep the menu on screen; it is a fixed set of items, so a measured
// height would be the same number arrived at more expensively.
const MENU_WIDTH = 180;
const MENU_HEIGHT = 170;

const containerOf = (node: TreeNode | null): string => {
  if (!node) return '';
  return node.isFile ? parentOf(node.path) : node.path;
};

// --- icons -----------------------------------------------------------------
//
// Drawn here rather than pulled from an icon font: this is five shapes, and the
// alternative is shipping a whole icon theme to draw them. Colours are Seti's,
// the theme VS Code ships enabled, so a `.js` file is the same yellow here as
// in the editor the author has open on their other screen.

const Twisty = ({ open }: { open: boolean }) => (
  <svg className="tools-explorer-twisty" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d={open ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const FolderIcon = ({ open }: { open: boolean }) => (
  <svg
    className="tools-explorer-icon folder"
    viewBox="0 0 16 16"
    aria-hidden="true"
  >
    {open ? (
      <path
        d="M1.5 13V4.5A1 1 0 0 1 2.5 3.5h3l1.2 1.6h5.8a1 1 0 0 1 1 1V7H4.6a1 1 0 0 0-1 .75L2 13z"
        fill="currentColor"
      />
    ) : (
      <path
        d="M1.5 12.5v-8a1 1 0 0 1 1-1h3.2l1.3 1.7h6.5a1 1 0 0 1 1 1v6.3a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1z"
        fill="currentColor"
      />
    )}
  </svg>
);

const FileIcon = ({ name }: { name: string }) => {
  const lower = name.toLowerCase();
  if (lower.endsWith('.js')) {
    return (
      <svg
        className="tools-explorer-icon js"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <rect x="1" y="1" width="14" height="14" rx="2" fill="currentColor" />
        <text
          x="8"
          y="11.4"
          textAnchor="middle"
          fontSize="7.5"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
          /* Literal, unlike everything else here: these letters are cut out of
             the yellow square and have to contrast with IT, not with the page.
             The two colours are one glyph. */
          fill="#1C1825"
        >
          JS
        </text>
      </svg>
    );
  }
  if (lower.endsWith('.json')) {
    return (
      <svg
        className="tools-explorer-icon json"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path
          d="M6.4 2.2c-1.6 0-2.2.8-2.2 2v2c0 1-.5 1.4-1.4 1.4v1c.9 0 1.4.4 1.4 1.4v2c0 1.2.6 2 2.2 2v-1.2c-.7 0-1-.3-1-1v-2c0-1-.4-1.5-1.2-1.7 .8-.2 1.2-.7 1.2-1.7v-2c0-.7.3-1 1-1zM9.6 2.2c1.6 0 2.2.8 2.2 2v2c0 1 .5 1.4 1.4 1.4v1c-.9 0-1.4.4-1.4 1.4v2c0 1.2-.6 2-2.2 2v-1.2c.7 0 1-.3 1-1v-2c0-1 .4-1.5 1.2-1.7-.8-.2-1.2-.7-1.2-1.7v-2c0-.7-.3-1-1-1z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return (
    <svg
      className="tools-explorer-icon plain"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d="M9.3 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.2zM9 2.6l3 3H9.4A.4.4 0 0 1 9 5.2z"
        fill="currentColor"
      />
    </svg>
  );
};

// --- component -------------------------------------------------------------

export const FileExplorer = ({
  files,
  activePath,
  emptyFolders,
  readOnly,
  mainModule,
  sdkModule,
  onSelect,
  onCreateFile,
  onCreateFolder,
  onDelete,
  onRename
}: Props) => {
  // Collapsed rather than expanded, so a folder that appears while someone is
  // working is open — which is what they want, and it means the empty set is
  // the correct initial state rather than something to compute.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // The row the keyboard and the context menu act on. Distinct from
  // `activePath`, which is the file the editor is showing: in VS Code selecting
  // a folder is an ordinary thing to do and does not change the open editor.
  const [selected, setSelected] = useState<string>(activePath);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    node: TreeNode | null;
  } | null>(null);
  // The section's own twisty, which in VS Code folds the whole tree away rather
  // than collapsing the folders inside it — that is what the toolbar's
  // Collapse Folders button is for, and they are two different actions.
  const [sectionOpen, setSectionOpen] = useState(true);
  // Deleting a folder takes every file under it and there is no trash to
  // recover them from, so that one asks first. A single file does not: it is
  // one thing, the person clicked its own row, and a dialog per file is the
  // kind of friction that gets clicked through without being read.
  const [confirmFolder, setConfirmFolder] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // Read when a menu opens rather than on every resize: it is only ever used to
  // place one, and there is no menu open while the window is being dragged.
  const [viewport, setViewport] = useState({ w: 1280, h: 800 });

  const tree = useMemo(
    () => buildTree(Object.keys(files), emptyFolders),
    [files, emptyFolders]
  );
  const rows = useMemo(() => flatten(tree, collapsed), [tree, collapsed]);

  // Opening a file from anywhere else — the tab bar, a rename, a new file —
  // moves the selection with it, so the keyboard picks up where the eye is.
  useEffect(() => {
    setSelected(activePath);
  }, [activePath]);

  const selectedNode = useMemo(
    () => rows.find(r => r.node.path === selected)?.node ?? null,
    [rows, selected]
  );

  // The name box takes focus the moment it appears, with the basename selected
  // and the extension left out of the selection — typing replaces the name and
  // keeps the `.js`, which is the one thing about VS Code's rename everyone has
  // in their fingers.
  // Keyed on which draft this is, not on its value — refocusing and reselecting
  // on every keystroke would fight the person typing.
  const draftKey = draft
    ? `${draft.kind}:${draft.kind === 'rename' ? draft.path : draft.parent}`
    : '';
  useEffect(() => {
    if (!draft) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (draft.kind === 'rename') {
      const dot = draft.value.lastIndexOf('.');
      input.setSelectionRange(0, dot > 0 ? dot : draft.value.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const requestDelete = (node: TreeNode) => {
    setMenu(null);
    if (readOnly || node.path === mainModule) return;
    if (node.isFile) onDelete(node.path);
    else setConfirmFolder(node.path);
  };

  const toggleFolder = (path: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const collapseAll = () => setCollapsed(new Set(folderPaths(tree)));

  const startCreate = (kind: 'file' | 'folder', node?: TreeNode | null) => {
    const parent = containerOf(node === undefined ? selectedNode : node);
    // The parent has to be open for the new row to be visible in it.
    if (parent) {
      setCollapsed(prev => {
        const next = new Set(prev);
        next.delete(parent);
        return next;
      });
    }
    setMenu(null);
    setSectionOpen(true);
    setDraft({ kind, parent, value: '' });
  };

  const startRename = (node: TreeNode) => {
    setMenu(null);
    if (readOnly || node.path === mainModule) return;
    setSectionOpen(true);
    setDraft({
      kind: 'rename',
      path: node.path,
      isFile: node.isFile,
      value: node.name
    });
  };

  /**
   * What is wrong with the name being typed, or null.
   *
   * The file rules are the server's own — `validateProjectPath` is what the
   * upload path runs — so the explorer refuses exactly what a deploy would, at
   * the keystroke rather than minutes later. A folder is checked against the
   * same character rules by borrowing a `.js` suffix for the test, since a
   * folder is only ever a prefix of legal file paths.
   */
  const draftError = useMemo((): string | null => {
    if (!draft) return null;
    const name = draft.value.trim().replace(/^\/+|\/+$/g, '');
    if (!name) return null;
    if (name.includes('/')) {
      return 'Use New Folder to nest — a name cannot contain "/"';
    }

    if (draft.kind === 'folder') {
      const path = join(draft.parent, name);
      return utils.validateProjectPath(`${path}/x.js`)
        ? `Invalid folder name "${name}" — letters, digits, dot, dash and underscore only`
        : null;
    }

    if (draft.kind === 'rename') {
      const path = join(parentOf(draft.path), name);
      if (path === draft.path) return null;
      if (!draft.isFile) {
        return utils.validateProjectPath(`${path}/x.js`)
          ? `Invalid folder name "${name}" — letters, digits, dot, dash and underscore only`
          : null;
      }
      // Its own path is excluded, or every rename collides with itself.
      const taken = Object.keys(files).filter(p => p !== draft.path);
      return utils.validateProjectPath(path, taken);
    }

    if (Object.keys(files).length >= utils.constants.CUSTOM_CODE_MAX_FILES) {
      return `A script can hold ${utils.constants.CUSTOM_CODE_MAX_FILES} files.`;
    }
    return utils.validateProjectPath(
      join(draft.parent, name.endsWith('.js') ? name : `${name}.js`),
      Object.keys(files)
    );
  }, [draft, files]);

  /**
   * Commit the name being typed.
   *
   * `fromBlur` is the difference between the two ways out of an input. Enter on
   * a name that doesn't validate keeps the box open with the reason under it —
   * the person is mid-correction and throwing their typing away is the one
   * thing not to do. Clicking away is a decision to stop, so it cancels.
   */
  const submitDraft = (fromBlur = false) => {
    if (!draft) return;
    const name = draft.value.trim().replace(/^\/+|\/+$/g, '');
    if (!name) return setDraft(null);
    if (draftError) {
      if (fromBlur) setDraft(null);
      return;
    }

    if (draft.kind === 'folder') {
      onCreateFolder(join(draft.parent, name));
    } else if (draft.kind === 'file') {
      onCreateFile(
        join(draft.parent, name.endsWith('.js') ? name : `${name}.js`)
      );
    } else {
      const next = join(parentOf(draft.path), name);
      if (next !== draft.path) onRename(draft.path, next);
    }
    setDraft(null);
  };

  const open = (node: TreeNode) => {
    setSelected(node.path);
    if (node.isFile) onSelect(node.path);
    else toggleFolder(node.path);
  };

  // Arrow keys walk the visible rows, which is why the tree is flattened: Up
  // and Down are one step in this list, and Left and Right are the twisty.
  const onTreeKeyDown = (event: ReactKeyboardEvent) => {
    if (draft) return;
    const index = rows.findIndex(r => r.node.path === selected);
    const move = (to: number) => {
      const row = rows[Math.max(0, Math.min(rows.length - 1, to))];
      if (row) setSelected(row.node.path);
      event.preventDefault();
    };

    switch (event.key) {
      case 'ArrowDown':
        return move(index + 1);
      case 'ArrowUp':
        return move(index - 1);
      case 'ArrowRight': {
        const node = rows[index]?.node;
        if (node && !node.isFile && collapsed.has(node.path)) {
          toggleFolder(node.path);
          event.preventDefault();
        } else if (node && !node.isFile) {
          move(index + 1);
        }
        return;
      }
      case 'ArrowLeft': {
        const node = rows[index]?.node;
        if (node && !node.isFile && !collapsed.has(node.path)) {
          toggleFolder(node.path);
          event.preventDefault();
          return;
        }
        const parent = node ? parentOf(node.path) : '';
        if (parent) {
          setSelected(parent);
          event.preventDefault();
        }
        return;
      }
      case 'Enter': {
        const node = rows[index]?.node;
        if (node) {
          open(node);
          event.preventDefault();
        }
        return;
      }
      case 'F2': {
        const node = rows[index]?.node;
        if (node) {
          startRename(node);
          event.preventDefault();
        }
        return;
      }
      case 'Delete':
      case 'Backspace': {
        const node = rows[index]?.node;
        if (node && !readOnly && node.path !== mainModule) {
          requestDelete(node);
          event.preventDefault();
        }
        return;
      }
      default:
    }
  };

  const nameInput = () => (
    <span className={`tools-explorer-input ${draftError ? 'invalid' : ''}`}>
      <input
        ref={inputRef}
        value={draft?.value ?? ''}
        spellCheck={false}
        placeholder={draft?.kind === 'folder' ? 'lib' : 'orders.js'}
        onChange={e =>
          setDraft(prev => (prev ? { ...prev, value: e.target.value } : prev))
        }
        onBlur={() => submitDraft(true)}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') submitDraft();
          if (e.key === 'Escape') setDraft(null);
        }}
      />
      {draftError && (
        <span className="tools-explorer-input-error" role="alert">
          {draftError}
        </span>
      )}
    </span>
  );

  const indent = (depth: number) => (
    <span className="tools-explorer-indent" aria-hidden="true">
      {Array.from({ length: depth }).map((_, i) => (
        <span key={i} className="tools-explorer-guide" />
      ))}
    </span>
  );

  const renderRow = ({ node, depth }: Row) => {
    const renaming = draft?.kind === 'rename' && draft.path === node.path;
    const isOpenFolder = !node.isFile && !collapsed.has(node.path);

    return (
      <div key={`${node.isFile ? 'f' : 'd'}:${node.path}`}>
        <div
          className={`tools-explorer-row ${node.isFile ? 'file' : 'folder'} ${
            node.path === selected ? 'selected' : ''
          } ${node.isFile && node.path === activePath ? 'active' : ''}`}
          onClick={() => !renaming && open(node)}
          onContextMenu={e => {
            e.preventDefault();
            setSelected(node.path);
            setViewport({ w: window.innerWidth, h: window.innerHeight });
            setMenu({ x: e.clientX, y: e.clientY, node });
          }}
          title={node.path}
        >
          {indent(depth)}
          {node.isFile ? (
            <span className="tools-explorer-twisty-slot" />
          ) : (
            <Twisty open={isOpenFolder} />
          )}
          {node.isFile ? (
            <FileIcon name={node.name} />
          ) : (
            <FolderIcon open={isOpenFolder} />
          )}
          {renaming ? (
            nameInput()
          ) : (
            <span className="tools-explorer-name">{node.name}</span>
          )}
          {node.path === mainModule && (
            <span
              className="tools-explorer-badge"
              title="The module the dispatcher calls"
            >
              entry
            </span>
          )}
        </div>

        {/* The new-name row sits inside the folder it will land in, at that
            folder's indent — so where the file is going is visible before it
            exists, rather than being described in a tooltip somewhere else. */}
        {draft &&
          draft.kind !== 'rename' &&
          draft.parent === node.path &&
          !node.isFile &&
          isOpenFolder && (
            <div className="tools-explorer-row draft">
              {indent(depth + 1)}
              <span className="tools-explorer-twisty-slot" />
              {draft.kind === 'folder' ? (
                <FolderIcon open={false} />
              ) : (
                <FileIcon name={draft.value || 'x.js'} />
              )}
              {nameInput()}
            </div>
          )}

        {!node.isFile &&
          isOpenFolder &&
          node.children.map(child =>
            renderRow({ node: child, depth: depth + 1 })
          )}
      </div>
    );
  };

  // Rendered from the tree rather than from `rows` so a folder's children stay
  // nested inside it in the DOM — `rows` is for the keyboard, which wants the
  // flat view.
  const topLevel = tree;

  return (
    <div className="tools-explorer">
      <div className="tools-explorer-title">Explorer</div>

      <div className="tools-explorer-section">
        <button
          type="button"
          className="tools-explorer-section-label"
          aria-expanded={sectionOpen}
          onClick={() => setSectionOpen(open => !open)}
        >
          <Twisty open={sectionOpen} />
          <span>Script</span>
        </button>
        <span className="tools-explorer-actions">
          {!readOnly && (
            <>
              <button
                type="button"
                title="New File…"
                aria-label="New File"
                onClick={() => startCreate('file')}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M9.3 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4.2M9 1.7V5a.4.4 0 0 0 .4.4h3.1M12.5 9.5v5M10 12h5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                title="New Folder…"
                aria-label="New Folder"
                onClick={() => startCreate('folder')}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M14 8.5V6a1 1 0 0 0-1-1H7.2L5.9 3.3H2.7a1 1 0 0 0-1 1v7.4a1 1 0 0 0 1 1H8M12 9.8v4.4M9.8 12h4.4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </>
          )}
          <button
            type="button"
            title="Collapse Folders in Explorer"
            aria-label="Collapse folders"
            onClick={collapseAll}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M2.5 3.5h11M2.5 12.5h11M5.5 6.6L8 9.1l2.5-2.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </span>
      </div>

      <div
        className="tools-explorer-tree"
        role="tree"
        hidden={!sectionOpen}
        tabIndex={0}
        onKeyDown={onTreeKeyDown}
        onContextMenu={e => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          setViewport({ w: window.innerWidth, h: window.innerHeight });
          setMenu({ x: e.clientX, y: e.clientY, node: null });
        }}
      >
        {topLevel.map(node => renderRow({ node, depth: 0 }))}

        {draft && draft.kind !== 'rename' && draft.parent === '' && (
          <div className="tools-explorer-row draft">
            {indent(0)}
            <span className="tools-explorer-twisty-slot" />
            {draft.kind === 'folder' ? (
              <FolderIcon open={false} />
            ) : (
              <FileIcon name={draft.value || 'x.js'} />
            )}
            {nameInput()}
          </div>
        )}

        {/* Not a file anyone wrote and not one they can edit — it is attached to
            every deploy. Shown because "what is in my script" is the question
            this panel answers, and the answer includes it. */}
        <div
          className="tools-explorer-row attached"
          title="Attached to every deploy"
        >
          {indent(0)}
          <span className="tools-explorer-twisty-slot" />
          <FileIcon name={sdkModule} />
          <span className="tools-explorer-name">{sdkModule}</span>
          <span className="tools-explorer-badge">attached</span>
        </div>
      </div>

      {/* The page's own confirm, not a second dialog that happens to look like
          it — remove-tool and disconnect already ask this way. */}
      <UI.Alert
        open={!!confirmFolder}
        title="Delete folder"
        description={
          confirmFolder
            ? `Delete "${confirmFolder}" and the ${countUnder(files, confirmFolder)} file${countUnder(files, confirmFolder) === 1 ? '' : 's'} in it? They are removed from this script, and there is no undo — a version you have already deployed still has them.`
            : ''
        }
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => {
          if (confirmFolder) onDelete(confirmFolder);
          setConfirmFolder(null);
        }}
        onCancel={() => setConfirmFolder(null)}
      />

      {menu && (
        <div
          className="tools-explorer-menu"
          ref={menuRef}
          // Clamped to the viewport: the menu is `position: fixed` at the
          // pointer, and a right-click near the bottom of a scrolled page would
          // otherwise open it below the fold with no way to reach Delete.
          style={{
            top: Math.min(menu.y, Math.max(8, viewport.h - MENU_HEIGHT)),
            left: Math.min(menu.x, Math.max(8, viewport.w - MENU_WIDTH))
          }}
          role="menu"
        >
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={() => startCreate('file', menu.node)}
              >
                New File…
              </button>
              <button
                type="button"
                onClick={() => startCreate('folder', menu.node)}
              >
                New Folder…
              </button>
            </>
          )}
          {menu.node && (
            <>
              {!readOnly && <span className="tools-explorer-menu-sep" />}
              {!readOnly && (
                <button
                  type="button"
                  disabled={menu.node.path === mainModule}
                  onClick={() => menu.node && startRename(menu.node)}
                >
                  Rename…
                </button>
              )}
              {!readOnly && (
                <button
                  type="button"
                  className="danger"
                  disabled={menu.node.path === mainModule}
                  onClick={() => menu.node && requestDelete(menu.node)}
                >
                  Delete
                </button>
              )}
              <span className="tools-explorer-menu-sep" />
              <button
                type="button"
                onClick={() => {
                  if (menu.node) {
                    navigator.clipboard
                      ?.writeText(menu.node.path)
                      .catch(() => {});
                  }
                  setMenu(null);
                }}
              >
                Copy Path
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
