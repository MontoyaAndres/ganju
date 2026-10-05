import * as z from 'zod';

export type JsonSchemaProperty = {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: string[];
  items?: JsonSchemaProperty;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
};

export type JsonSchema = {
  type: 'object';
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
};

const propertyToZod = (prop: JsonSchemaProperty): z.ZodTypeAny => {
  let field: z.ZodTypeAny;

  switch (prop.type) {
    case 'string': {
      if (prop.enum) {
        field = z.enum(prop.enum as [string, ...string[]]);
      } else {
        let str = z.string();
        if (prop.minLength !== undefined) str = str.min(prop.minLength);
        if (prop.maxLength !== undefined) str = str.max(prop.maxLength);
        if (prop.pattern !== undefined)
          str = str.regex(new RegExp(prop.pattern));
        field = str;
      }
      break;
    }
    case 'number':
    case 'integer': {
      let num = prop.type === 'integer' ? z.number().int() : z.number();
      if (prop.minimum !== undefined) num = num.min(prop.minimum);
      if (prop.maximum !== undefined) num = num.max(prop.maximum);
      field = num;
      break;
    }
    case 'boolean':
      field = z.boolean();
      break;
    case 'array': {
      let arr = z.array(prop.items ? propertyToZod(prop.items) : z.any());
      if (prop.minItems !== undefined) arr = arr.min(prop.minItems);
      if (prop.maxItems !== undefined) arr = arr.max(prop.maxItems);
      field = arr;
      break;
    }
    case 'object':
      // With declared properties, keep them: this shape is also what
      // `tools/list` advertises, and a bare record there tells the model an
      // item is any object at all, so it invents the field names. Loose,
      // because a schema without `additionalProperties: false` allows extras.
      field = prop.properties
        ? z.looseObject(shapeOf(prop.properties, prop.required))
        : z.record(z.string(), z.any());
      break;
    default:
      field = z.any();
  }

  if (prop.description) {
    field = field.describe(prop.description);
  }

  return field;
};

function shapeOf(
  properties: Record<string, JsonSchemaProperty> = {},
  required: string[] = []
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(properties)) {
    const field = propertyToZod(prop);
    shape[key] = required.includes(key) ? field : field.optional();
  }

  return shape;
}

export const jsonSchemaToZodShape = (
  schema: JsonSchema
): Record<string, z.ZodTypeAny> =>
  shapeOf(schema.properties, schema.required);

export interface SchemaViolation {
  // Dotted path to the offending field, empty for the value as a whole.
  path: string;
  message: string;
}

/**
 * Check a value against a declared JSON schema, returning the violations.
 *
 * The same compiler the MCP boot loop registers tools with, pointed at a value
 * instead of at a tool definition — so what the dashboard's Test panel calls
 * invalid is exactly what an MCP client would have refused to send. Written here
 * rather than in apps/api because zod lives here, and a second copy of this
 * would be a second opinion about what "valid" means.
 *
 * Unknown keys are allowed through: a JSON Schema without
 * `additionalProperties: false` does not forbid them, and refusing an extra
 * field on a test input that a real client would have passed along would make
 * the panel lie.
 */
export const validateAgainstJsonSchema = (
  schema: JsonSchema,
  value: unknown
): SchemaViolation[] => {
  const result = z.object(jsonSchemaToZodShape(schema)).safeParse(value ?? {});
  if (result.success) return [];
  return result.error.issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message
  }));
};
