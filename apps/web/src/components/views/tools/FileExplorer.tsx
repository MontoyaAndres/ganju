import { useMemo, useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import {
  CreateNewFolderOutlined,
  DeleteOutlined,
  DescriptionOutlined,
  FolderOpenOutlined,
  NoteAddOutlined
} from '@mui/icons-material';

/**
 * What this script is made of, as a tree.
 *
 * A project is a flat map of paths to source, because that is what the Workers
 * upload API takes — one module per file, `index.js` the one the dispatcher
 * calls. Folders are therefore not things that exist; they are prefixes shared
 * by paths. The tree is rebuilt from those paths, which is why a folder created
 * here and never filled disappears on reload: there is nothing to store an empty
 * prefix in, and inventing a placeholder file to hold one would put a file in
 * the deploy that nobody wrote.
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
}

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
}

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
  onDelete
}: Props) => {
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null);
  const [draft, setDraft] = useState('');

  const tree = useMemo(
    () => buildTree(Object.keys(files), emptyFolders),
    [files, emptyFolders]
  );

  // A new file lands beside whatever is selected, which is what every editor
  // does and what someone working inside a folder means by "new file".
  const parent = activePath.includes('/')
    ? activePath.slice(0, activePath.lastIndexOf('/'))
    : '';

  const submit = () => {
    const name = draft.trim().replace(/^\/+|\/+$/g, '');
    if (!name) return setCreating(null);
    const path = parent ? `${parent}/${name}` : name;
    if (creating === 'folder') onCreateFolder(path);
    else onCreateFile(path.endsWith('.js') ? path : `${path}.js`);
    setDraft('');
    setCreating(null);
  };

  const renderNode = (node: TreeNode, depth: number) => {
    if (!node.isFile) {
      return (
        <div key={`folder:${node.path}`}>
          <div
            className="tools-explorer-row folder"
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            <FolderOpenOutlined fontSize="small" />
            <span className="tools-explorer-name">{node.name}</span>
          </div>
          {node.children.map(child => renderNode(child, depth + 1))}
        </div>
      );
    }

    return (
      <div
        key={node.path}
        className={`tools-explorer-row file ${
          node.path === activePath ? 'active' : ''
        }`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <button
          type="button"
          className="tools-explorer-open"
          onClick={() => onSelect(node.path)}
        >
          <DescriptionOutlined fontSize="small" />
          <span className="tools-explorer-name">{node.name}</span>
        </button>
        {/* The main module is what the dispatcher calls, so it is the one file a
            script cannot be without. */}
        {!readOnly && node.path !== mainModule && (
          <Tooltip title="Delete this file">
            <IconButton size="small" onClick={() => onDelete(node.path)}>
              <DeleteOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </div>
    );
  };

  return (
    <div className="tools-explorer">
      <div className="tools-explorer-head">
        <span>Files</span>
        {!readOnly && (
          <span className="tools-explorer-actions">
            <Tooltip title={`New file${parent ? ` in ${parent}` : ''}`}>
              <IconButton
                size="small"
                onClick={() => {
                  setCreating('file');
                  setDraft('');
                }}
              >
                <NoteAddOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={`New folder${parent ? ` in ${parent}` : ''}`}>
              <IconButton
                size="small"
                onClick={() => {
                  setCreating('folder');
                  setDraft('');
                }}
              >
                <CreateNewFolderOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          </span>
        )}
      </div>

      {creating && (
        <div className="tools-explorer-new">
          {parent && (
            <span className="tools-explorer-new-parent">{parent}/</span>
          )}
          <input
            autoFocus
            value={draft}
            placeholder={creating === 'file' ? 'orders.js' : 'lib'}
            onChange={e => setDraft(e.target.value)}
            onBlur={submit}
            onKeyDown={e => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') setCreating(null);
            }}
          />
        </div>
      )}

      <div className="tools-explorer-tree">
        {tree.map(node => renderNode(node, 0))}
        {/* Not a file anyone wrote and not one they can edit — it is attached to
            every deploy. Shown because "what is in my script" is the question
            this panel answers, and the answer includes it. */}
        <div className="tools-explorer-row attached">
          <DescriptionOutlined fontSize="small" />
          <span className="tools-explorer-name">{sdkModule}</span>
          <span className="tools-explorer-note">attached</span>
        </div>
      </div>
    </div>
  );
};
