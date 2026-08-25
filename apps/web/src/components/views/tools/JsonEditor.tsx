import { useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { UI } from '@ganju/ui';
import { AutoFixHighOutlined } from '@mui/icons-material';

import { i18n } from '../../../lib';

/**
 * A JSON field: the Monaco surface plus a label, a Format button, and whatever
 * the language service has to say about what is in it.
 *
 * Every JSON on this page is written by hand into something that then has to
 * parse — an input schema, an output schema, a sample input, a request body. A
 * textarea gives none of that back until a form is submitted, which is the wrong
 * moment to find out a quote is missing.
 */

const Surface = dynamic(() => import('./JsonSurface'), {
  ssr: false,
  loading: () => (
    <div className="tools-json-loading">
      <UI.Skeleton variant="rounded" height={120} />
    </div>
  )
});

/**
 * The shape of a schema this platform accepts, as a JSON Schema — so the two
 * schema fields complete their own keys and flag the ones the server would
 * reject. Mirrors SCHEMA_DEFINITION in @ganju/utils; it is a deliberate subset
 * of JSON Schema, not all of it.
 *
 * A hook rather than a constant because the `description`s are copy: Monaco
 * shows them on hover and in completion, which makes them the one part of this
 * object a person reads. The keys and types are protocol and stay as they are.
 */
export const useSchemaMetaSchema = () => {
  const t = i18n.useT(i18n.copy.TOOLS);
  return useMemo(
    () => ({
      type: 'object',
      required: ['type'],
      properties: {
        type: {
          type: 'string',
          enum: ['string', 'number', 'boolean', 'object', 'array'],
          description: t('jsonSchemaType')
        },
        properties: {
          type: 'object',
          description: t('jsonSchemaProperties'),
          additionalProperties: { $ref: '#' }
        },
        required: {
          type: 'array',
          items: { type: 'string' },
          description: t('jsonSchemaRequired')
        },
        items: { $ref: '#', description: t('jsonSchemaItems') },
        description: { type: 'string' },
        minimum: { type: 'number' },
        maximum: { type: 'number' },
        minLength: { type: 'number' },
        maxLength: { type: 'number' },
        pattern: { type: 'string' },
        enum: { type: 'array' }
      }
    }),
    [t]
  );
};

interface Props {
  value: string;
  onChange: (next: string) => void;
  // Unique on the page — it becomes the editor's model path, which is what a
  // schema binds to.
  id: string;
  label: string;
  help?: string;
  height?: string;
  readOnly?: boolean;
  // Validate the content against this JSON Schema, live.
  schema?: object | null;
  // Turned off where the content is JSON-shaped but not JSON: a body template
  // carrying {{placeholders}} is legal here and would be flagged otherwise.
  validate?: boolean;
  // Rendered in the header row, beside Format. What belongs here is an action on
  // this field's content — Run, for a sample input — rather than a second row of
  // its own above the label.
  action?: ReactNode;
  // Inside a panel rather than a form: the label takes the weight of the labels
  // around it instead of a form field's.
  compact?: boolean;
}

export const JsonEditor = ({
  value,
  onChange,
  id,
  label,
  help,
  height = '160px',
  readOnly = false,
  schema = null,
  validate = true,
  action,
  compact = false
}: Props) => {
  const t = i18n.useT(i18n.copy.TOOLS);
  const [errors, setErrors] = useState<string[]>([]);

  // An empty optional field is not a broken one. The language service says
  // "value expected" for an empty buffer, which is true of JSON and wrong about
  // an output schema nobody declared.
  const shown = value.trim() ? errors : [];

  const format = () => {
    try {
      onChange(JSON.stringify(JSON.parse(value || '{}'), null, 2));
    } catch {
      // Unparseable, which the editor is already saying in place. Reformatting
      // is not the answer to that, and refusing quietly beats a second message.
    }
  };

  return (
    <div
      className={`tools-json-field ${compact ? 'compact' : ''} ${
        shown.length ? 'invalid' : ''
      }`}
    >
      <div className="tools-json-field-head">
        <span>{label}</span>
        <div className="tools-json-field-head-actions">
          {!readOnly && (
            <button
              type="button"
              className="tools-json-format"
              onClick={format}
            >
              <AutoFixHighOutlined fontSize="small" />
              {t('jsonFormat')}
            </button>
          )}
          {action}
        </div>
      </div>
      <div className="tools-json-field-surface">
        <Surface
          value={value}
          onChange={onChange}
          modelId={id}
          height={height}
          editable={!readOnly}
          schema={validate ? schema : null}
          validate={validate}
          onValidate={setErrors}
        />
      </div>
      {shown.length > 0 && (
        <ul className="tools-json-field-errors">
          {shown.slice(0, 3).map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      )}
      {help && <small className="tools-json-field-help">{help}</small>}
    </div>
  );
};
