import { useEffect, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { SDK_EDITOR_TYPES } from '@ganju/sdk/editorTypes';

import { i18n } from '../../../lib';

import './monacoLoader';

/**
 * The editor VS Code is built on, in its own module so it can be loaded through
 * `next/dynamic` with `ssr: false`.
 *
 * Monaco is an editor and nothing else: no terminal, no filesystem, no package
 * manager, no way to run what is in the buffer. That is the shape of the thing,
 * not a lock we added — the code here runs in a Worker isolate on our
 * infrastructure, and the only way into that isolate is Deploy. What this file
 * does is make the boundary legible while someone is typing, so the refusals
 * land in the editor rather than at deploy time or, worse, at call time.
 */

export interface MonacoSurfaceProps {
  value: string;
  onChange: (next: string) => void;
  editable: boolean;
  height: string;
  // The file being edited, and every other file in the project. The rest are
  // here so `import './lib/orders.js'` resolves to something: TypeScript answers
  // out of its own file map, and a module it has never been shown is a red
  // squiggle on a file that deploys perfectly well.
  path: string;
  files: Record<string, string>;
  onSave?: () => void;
  onCaret?: (line: number, column: number, lineCount: number) => void;
}

/**
 * Globals that do not exist in the runtime this code is deployed to, each with
 * the reason and the way around it.
 *
 * The Workers runtime has no Node built-ins (no `nodejs_compat` on user scripts)
 * and no module resolution: what is uploaded is what runs, beside the SDK and
 * nothing else. TypeScript alone would not catch most of these — the DOM library
 * that gives us honest `fetch` and `Response` types also brings `window` and
 * `localStorage`, which are just as absent here.
 *
 * Each rule carries the catalog key of its explanation rather than the sentence
 * itself: the pattern is what the runtime enforces and never varies, while the
 * message is copy and is read in whichever language the author is working in.
 */
type MarkerKey =
  | 'markerRequire'
  | 'markerProcess'
  | 'markerNodeGlobals'
  | 'markerEval'
  | 'markerBrowser'
  | 'markerBareImport';

const FORBIDDEN: {
  pattern: RegExp;
  key: MarkerKey;
}[] = [
  { pattern: /\brequire\s*\(/g, key: 'markerRequire' },
  { pattern: /\bprocess\s*\./g, key: 'markerProcess' },
  { pattern: /\b(?:Buffer|__dirname|__filename)\b/g, key: 'markerNodeGlobals' },
  { pattern: /\beval\s*\(|new\s+Function\s*\(/g, key: 'markerEval' },
  {
    pattern: /\b(?:window|document|localStorage|sessionStorage|alert)\b\s*\./g,
    key: 'markerBrowser'
  },
  {
    // Relative paths are fine — they are the project's own files, uploaded as
    // modules beside this one. A bare specifier is not: nothing resolves
    // packages at runtime, because there is no install step.
    pattern: /\bfrom\s+'(?![.\/])[^']*'/g,
    key: 'markerBareImport'
  }
];

const MARKER_OWNER = 'ganju-runtime';

// Every file in a project is a model under this root, and the deployed module
// paths are exactly these minus the root — which is what makes a relative import
// resolve the same way here and in the runtime.
const MODEL_ROOT = 'file:///';
const modelUri = (path: string) => `${MODEL_ROOT}${path}`;

const markRuntimeLimits = (
  monaco: Monaco,
  model: MonacoEditor.ITextModel,
  describe: (key: MarkerKey) => string
) => {
  const text = model.getValue();
  const markers: MonacoEditor.IMarkerData[] = [];

  for (const rule of FORBIDDEN) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(text)) !== null) {
      const start = model.getPositionAt(match.index);
      const end = model.getPositionAt(match.index + match[0].length);
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: describe(rule.key),
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column
      });
    }
  }

  monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
};

const configure = (monaco: Monaco) => {
  const ts = monaco.languages.typescript;

  // JavaScript, not TypeScript, and this is not a preference: the file is
  // deployed byte for byte with no build step, so type annotations would reach
  // the runtime as syntax errors. Monaco flags them as such, which is the honest
  // answer. Type checking still runs — through the SDK's declarations below and
  // whatever JSDoc the author writes.
  ts.javascriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    allowJs: true,
    checkJs: true,
    // `lib` is deliberately NOT set. Naming the libraries — `['esnext', 'dom']`
    // — resolves to `lib.esnext.d.ts`, which is a file of `/// <reference lib>`
    // lines rather than declarations, and the worker does not chase them from an
    // explicit list: every script then opened on `Cannot find global type
    // 'Promise'`. Left alone, the target's own default library is loaded whole,
    // which is `esnext` plus `dom` — exactly what was being asked for.
    //
    // What matters here is what is NOT loaded: no @types/node, so `process`,
    // `require` and `Buffer` are unknown, because they are unknown in the
    // runtime this deploys to. `dom` is what supplies honest types for fetch,
    // Request, Response, URL and crypto, which a Worker does have; the
    // browser-only half of it is caught by the markers above.
    noEmit: true,
    strict: false
  });

  ts.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false
  });

  // The SDK, resolved from the import the script actually writes. Registered at
  // both paths Node-style resolution tries for `./ganju-sdk.js` — the extension
  // substitution and the literal append — so completion works regardless of
  // which one this Monaco build reaches for.
  for (const uri of ['file:///ganju-sdk.d.ts', 'file:///ganju-sdk.js.d.ts']) {
    ts.javascriptDefaults.addExtraLib(SDK_EDITOR_TYPES, uri);
  }
};

const MonacoSurface = ({
  value,
  onChange,
  editable,
  height,
  path,
  files,
  onSave,
  onCaret
}: MonacoSurfaceProps) => {
  // Held in a ref so the command registered on mount always calls the current
  // handler without re-registering.
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  // Same reason: the marker pass runs from listeners registered once on mount,
  // and it has to render its reasons in whatever language is current then.
  const t = i18n.useT(i18n.copy.TOOLS);
  const describeRef = useRef(t);
  describeRef.current = t;
  const describe = (key: MarkerKey) => describeRef.current(key);

  const monacoRef = useRef<Monaco | null>(null);

  // Keep a model per file. The <Editor> below owns the one it is showing; these
  // are the others, created so they can be imported and disposed when their file
  // is deleted, since a model left behind keeps resolving a path that no longer
  // exists.
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    const wanted = new Set(Object.keys(files).map(name => modelUri(name)));

    for (const [name, content] of Object.entries(files)) {
      const uri = monaco.Uri.parse(modelUri(name));
      const existing = monaco.editor.getModel(uri);
      if (!existing) {
        monaco.editor.createModel(content, 'javascript', uri);
      } else if (name !== path && existing.getValue() !== content) {
        // Not the open file, so nobody is typing into it — the state is the
        // truth and the model follows.
        existing.setValue(content);
      }
    }

    for (const model of monaco.editor.getModels()) {
      const uri = model.uri.toString();
      if (uri.startsWith(MODEL_ROOT) && !wanted.has(uri)) model.dispose();
    }
  }, [files, path]);

  const handleMount = (
    instance: MonacoEditor.IStandaloneCodeEditor,
    monaco: Monaco
  ) => {
    monacoRef.current = monaco;
    for (const [name, content] of Object.entries(files)) {
      const uri = monaco.Uri.parse(modelUri(name));
      if (!monaco.editor.getModel(uri)) {
        monaco.editor.createModel(content, 'javascript', uri);
      }
    }

    // Where the caret is and how long the file is. Reported on mount and on
    // every change, not only when the cursor moves — a file that has just been
    // opened and not clicked into is the ordinary case, and it used to read "1
    // line" however long it was.
    const report = () => {
      const current = instance.getModel();
      if (!current) return;
      const position = instance.getPosition();
      onCaret?.(
        position?.lineNumber || 1,
        position?.column || 1,
        current.getLineCount()
      );
    };

    const model = instance.getModel();
    if (model) markRuntimeLimits(monaco, model, describe);
    report();

    instance.onDidChangeModelContent(() => {
      const current = instance.getModel();
      if (current) markRuntimeLimits(monaco, current, describe);
      report();
    });

    // Switching files swaps the model under the editor, so the count belongs to
    // a different file from that moment on.
    instance.onDidChangeModel(() => {
      const current = instance.getModel();
      if (current) markRuntimeLimits(monaco, current, describe);
      report();
    });

    instance.onDidChangeCursorPosition(event =>
      onCaret?.(
        event.position.lineNumber,
        event.position.column,
        instance.getModel()?.getLineCount() || 1
      )
    );

    // ⌘S / Ctrl+S saves a draft rather than opening the browser's save dialog.
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
      saveRef.current?.()
    );
  };

  return (
    <Editor
      height={height}
      language="javascript"
      // Named so relative imports resolve against it: './ganju-sdk.js' and
      // './lib/orders.js' are both looked up next to this file.
      path={modelUri(path)}
      theme="vs"
      value={value}
      beforeMount={configure}
      onMount={handleMount}
      onChange={next => onChange(next ?? '')}
      options={{
        readOnly: !editable,
        // A viewer should not look like it is waiting for input.
        domReadOnly: !editable,
        fontSize: 13,
        lineHeight: 21,
        tabSize: 2,
        insertSpaces: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        wordWrap: 'off',
        renderWhitespace: 'selection',
        smoothScrolling: true,
        padding: { top: 10, bottom: 10 },
        // Off deliberately: a URL in a comment becomes a clickable link out of
        // the dashboard, and code someone pasted is not a place to invite
        // clicking.
        links: false,
        // Nothing useful can come of dropping a file into a Worker script, and
        // dropping the wrong one silently replaces the buffer.
        dropIntoEditor: { enabled: false },
        // No inline suggestions from anywhere but the SDK's own types.
        inlineSuggest: { enabled: false },
        scrollbar: { alwaysConsumeMouseWheel: false }
      }}
    />
  );
};

export default MonacoSurface;
