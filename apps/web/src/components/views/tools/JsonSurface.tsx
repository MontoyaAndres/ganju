import { useEffect, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';

import './monacoLoader';

/**
 * Monaco with the JSON language service, for the fields that hold JSON.
 *
 * Separate from MonacoSurface rather than a language switch on it: that one
 * carries the whole custom-code contract — the SDK's declarations, the JavaScript
 * compiler options, the markers for globals the Workers runtime doesn't have —
 * and none of it means anything to a schema. What these two share is the loader
 * and therefore the Monaco instance, so a JSON field costs nothing extra once
 * the Functions tab has loaded the editor.
 *
 * What this buys over a textarea is the JSON language service: a syntax error is
 * underlined where it is rather than reported as "not valid JSON" after clicking
 * Save, brackets and quotes close themselves, and — when a schema is attached —
 * the field completes the keys it accepts and flags the ones it doesn't.
 */

// Every model needs its own path, because a JSON schema is bound to models by
// file match: two editors sharing `file:///schema.json` would share validation.
// Registered here rather than per instance so that mounting one field never
// drops another field's schema — setDiagnosticsOptions replaces the whole list.
const registry = new Map<string, object>();

const applySchemas = (monaco: Monaco) => {
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    // Trailing commas are a JSON5 habit that JSON.parse refuses, so the editor
    // should refuse them too — this is going to a server that parses strictly.
    allowComments: false,
    trailingCommas: 'error',
    enableSchemaRequest: false,
    schemas: Array.from(registry.entries()).map(([path, schema]) => ({
      uri: `ganju://${path}`,
      fileMatch: [path],
      schema
    }))
  });
};

export interface JsonSurfaceProps {
  value: string;
  onChange: (next: string) => void;
  // Unique per field on the page: it becomes the model path a schema binds to.
  modelId: string;
  height: string;
  editable: boolean;
  // A JSON Schema to validate this field against. Omitted where the content is
  // JSON-shaped but not JSON — a body template carrying {{placeholders}}.
  schema?: object | null;
  validate?: boolean;
  onValidate?: (errors: string[]) => void;
}

const JsonSurface = ({
  value,
  onChange,
  modelId,
  height,
  editable,
  schema,
  validate = true,
  onValidate
}: JsonSurfaceProps) => {
  const monacoRef = useRef<Monaco | null>(null);
  const path = `file:///${modelId}.json`;

  // The schema can arrive after mount (a function's input schema changes while
  // the sample-input field is open), so it is re-registered on change rather
  // than only in beforeMount.
  useEffect(() => {
    if (schema) registry.set(path, schema);
    else registry.delete(path);
    if (monacoRef.current) applySchemas(monacoRef.current);
    return () => {
      registry.delete(path);
      if (monacoRef.current) applySchemas(monacoRef.current);
    };
  }, [path, schema]);

  return (
    <Editor
      height={height}
      language="json"
      path={path}
      theme="vs"
      value={value}
      beforeMount={monaco => {
        monacoRef.current = monaco;
        if (schema) registry.set(path, schema);
        applySchemas(monaco);
      }}
      onChange={next => onChange(next ?? '')}
      onValidate={markers =>
        onValidate?.(
          validate
            ? markers
                .filter(m => m.severity >= 8)
                .map(m => `Line ${m.startLineNumber}: ${m.message}`)
            : []
        )
      }
      options={{
        readOnly: !editable,
        domReadOnly: !editable,
        fontSize: 13,
        lineHeight: 20,
        tabSize: 2,
        insertSpaces: true,
        minimap: { enabled: false },
        lineNumbers: 'off',
        glyphMargin: false,
        folding: false,
        lineDecorationsWidth: 4,
        lineNumbersMinChars: 0,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        wordWrap: 'on',
        smoothScrolling: true,
        padding: { top: 8, bottom: 8 },
        links: false,
        dropIntoEditor: { enabled: false },
        // A JSON field is small and lives inside a scrolling dialog; the editor
        // taking the wheel over would trap the page behind it.
        scrollbar: { alwaysConsumeMouseWheel: false },
        overviewRulerLanes: 0,
        renderLineHighlight: 'none'
      }}
    />
  );
};

export default JsonSurface;
