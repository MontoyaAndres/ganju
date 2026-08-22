import { useState } from 'react';
import dynamic from 'next/dynamic';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';
import { TerminalOutlined } from '@mui/icons-material';

import { FileExplorer } from './FileExplorer';

/**
 * The editor surface plus its chrome: a file bar, a note about what this editor
 * is not, and a status line with the caret position.
 *
 * Monaco — the editor VS Code is built on — does the editing. What lives here is
 * everything around it, and the dynamic import that keeps it off the server: it
 * builds a live DOM view on mount, which a Worker has nothing to give it.
 */

const Surface = dynamic(() => import('./MonacoSurface'), {
  ssr: false,
  loading: () => (
    <div className="tools-ide-loading">
      <UI.Skeleton variant="rounded" height={360} />
    </div>
  )
});

interface Props {
  // Every file in the script, keyed by the path it deploys as, and which one is
  // open. One file is the ordinary case and still just a map of one.
  files: Record<string, string>;
  activePath: string;
  onSelect: (path: string) => void;
  onChange: (next: string) => void;
  onCreateFile: (path: string) => void;
  onCreateFolder: (path: string) => void;
  onDeleteFile: (path: string) => void;
  emptyFolders: string[];
  // A CLI-uploaded bundle is deployable but not editable, so the same component
  // has to render as a viewer.
  readOnly?: boolean;
  dirty?: boolean;
  // Cmd/Ctrl+S. The editor doesn't know what saving means here, only that the
  // keystroke belongs to it rather than to the browser.
  onSave?: () => void;
  height?: string;
}

export const CodeEditor = ({
  files,
  activePath,
  onSelect,
  onChange,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  emptyFolders,
  readOnly = false,
  dirty = false,
  onSave,
  height = '440px'
}: Props) => {
  const [caret, setCaret] = useState({ line: 1, column: 1, lineCount: 1 });

  return (
    <div className={`tools-ide ${readOnly ? 'readonly' : ''}`}>
      <div className="tools-ide-bar">
        <span className="tools-ide-file">{activePath}</span>
        {readOnly && <span className="tools-ide-flag">read-only</span>}
        {dirty && !readOnly && (
          <span className="tools-ide-flag unsaved">unsaved</span>
        )}
        <span className="tools-ide-bar-right">
          {caret.lineCount} {caret.lineCount === 1 ? 'line' : 'lines'}
        </span>
      </div>
      {!readOnly && (
        <div className="tools-ide-notice">
          <TerminalOutlined fontSize="small" />
          <span>
            No terminal here, and no <code>npm install</code> — this file is
            deployed exactly as written. To use a package, bundle it into a
            single file on your machine and upload that bundle. Everything in{' '}
            <code>ctx</code> works without installing anything.
          </span>
        </div>
      )}
      <div className="tools-ide-body">
        <FileExplorer
          files={files}
          activePath={activePath}
          emptyFolders={emptyFolders}
          readOnly={readOnly}
          mainModule={utils.constants.CUSTOM_CODE_MAIN_MODULE}
          sdkModule={utils.constants.CUSTOM_CODE_SDK_MODULE}
          onSelect={onSelect}
          onCreateFile={onCreateFile}
          onCreateFolder={onCreateFolder}
          onDelete={onDeleteFile}
        />
        <div className="tools-ide-surface">
          <Surface
            value={files[activePath] ?? ''}
            onChange={onChange}
            editable={!readOnly}
            height={height}
            path={activePath}
            files={files}
            onSave={onSave}
            onCaret={(line, column, lineCount) =>
              setCaret({ line, column, lineCount })
            }
          />
        </div>
      </div>
      <div className="tools-ide-status">
        <span>
          Ln {caret.line}, Col {caret.column}
        </span>
        <span>Spaces: 2</span>
        <span>JavaScript</span>
        {onSave && !readOnly && (
          <span className="tools-ide-status-right">⌘S saves a draft</span>
        )}
      </div>
    </div>
  );
};
