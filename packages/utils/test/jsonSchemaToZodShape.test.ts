// The JSON Schema → zod compiler that custom tools are registered and checked
// with. Pinned to the case that broke it: an array of objects, where each
// object's fields used to be erased to "any object", so a model calling the
// tool saw no field names and made its own up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as z from 'zod';

import {
  jsonSchemaToZodShape,
  validateAgainstJsonSchema
} from '../src/jsonSchemaToZodShape.ts';
import type { JsonSchema } from '../src/jsonSchemaToZodShape.ts';

const order: JsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      description: 'What was ordered',
      items: {
        type: 'object',
        properties: {
          producto: {
            type: 'string',
            enum: ['perro-sencillo', 'perro-americano'],
            description: 'Product id'
          },
          cantidad: {
            type: 'integer',
            minimum: 1,
            description: 'How many'
          }
        },
        required: ['producto', 'cantidad']
      }
    },
    notas: { type: 'object', description: 'Free-form' }
  },
  required: ['items']
};

test('nested object fields are advertised, not erased', () => {
  const advertised = z.toJSONSchema(z.object(jsonSchemaToZodShape(order))) as {
    properties: Record<string, any>;
  };
  const item = advertised.properties.items.items;
  assert.deepEqual(Object.keys(item.properties), ['producto', 'cantidad']);
  assert.deepEqual(item.required, ['producto', 'cantidad']);
  assert.deepEqual(item.properties.producto.enum, [
    'perro-sencillo',
    'perro-americano'
  ]);
  assert.equal(item.properties.cantidad.description, 'How many');
});

test('a valid nested value passes, extra keys included', () => {
  assert.deepEqual(
    validateAgainstJsonSchema(order, {
      items: [{ producto: 'perro-americano', cantidad: 2, nota: 'sin cebolla' }]
    }),
    []
  );
});

test('made-up item fields are refused with the path to fix', () => {
  const paths = validateAgainstJsonSchema(order, {
    items: [{ id: 'perro-americano', nombre: 'Perro americano' }]
  }).map(v => v.path);
  assert.ok(paths.includes('items.0.producto'));
  assert.ok(paths.includes('items.0.cantidad'));
});

test('enum, integer and array bounds are enforced inside items', () => {
  const paths = (value: unknown) =>
    validateAgainstJsonSchema(order, value).map(v => v.path);
  assert.deepEqual(paths({ items: [{ producto: 'pizza', cantidad: 1 }] }), [
    'items.0.producto'
  ]);
  assert.deepEqual(
    paths({ items: [{ producto: 'perro-sencillo', cantidad: 1.5 }] }),
    ['items.0.cantidad']
  );
  assert.deepEqual(paths({ items: [] }), ['items']);
});

test('an object without declared properties still takes anything', () => {
  assert.deepEqual(
    validateAgainstJsonSchema(order, {
      items: [{ producto: 'perro-sencillo', cantidad: 1 }],
      notas: { anything: true, nested: { ok: 1 } }
    }),
    []
  );
});
