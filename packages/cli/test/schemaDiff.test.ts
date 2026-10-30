// `ganju data schema diff/push`: the steps between the database's schema and
// the file's, and the order they have to run in.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DataTableInput } from '@ganju/utils/data';

import {
  SchemaFileError,
  checkSchemaFile,
  describeStep,
  diffSchema,
  type SchemaStep
} from '../src/data/schemaDiff.ts';

// A table as `schema pull` writes it: every setting spelled out.
const pulled = (
  table: Partial<DataTableInput> & Pick<DataTableInput, 'name' | 'columns'>
): DataTableInput => ({
  label: null,
  description: null,
  displayColumn: table.columns.find(c => c.type === 'text')?.name ?? null,
  access: 'read',
  customerScoped: false,
  history: true,
  ...table
});

const menu = pulled({
  name: 'menu',
  columns: [
    { name: 'name', type: 'text', required: true, searchable: true },
    { name: 'price', type: 'integer', min: 0 },
    { name: 'stock', type: 'integer', min: 0, default: 0 }
  ]
});
const orders = pulled({
  name: 'orders',
  columns: [
    { name: 'customer', type: 'text', required: true },
    { name: 'status', type: 'enum', values: ['open', 'done'], default: 'open' }
  ]
});
const lines = pulled({
  name: 'order_lines',
  displayColumn: null,
  columns: [
    {
      name: 'order',
      type: 'relation',
      table: 'orders',
      onDelete: 'cascade',
      required: true
    },
    {
      name: 'product',
      type: 'relation',
      table: 'menu',
      onDelete: 'restrict',
      required: true
    },
    { name: 'qty', type: 'integer', min: 1 }
  ]
});

const kinds = (steps: SchemaStep[]) =>
  steps.map(s => `${s.kind} ${s.table}${'column' in s ? `.${s.column}` : ''}`);

test('the same schema is no change', () => {
  const plan = diffSchema([menu, orders, lines], [menu, orders, lines]);
  assert.deepEqual(plan.steps, []);
  assert.deepEqual(plan.destructive, []);
});

test("a file that leaves defaults out matches the database's spelled-out ones", () => {
  const terse: DataTableInput[] = [
    {
      name: 'menu',
      columns: [
        { name: 'name', type: 'text', required: true, searchable: true },
        { name: 'price', type: 'integer', min: 0 },
        { name: 'stock', type: 'integer', min: 0, default: 0 }
      ]
    },
    {
      name: 'order_lines',
      displayColumn: 'id',
      columns: [
        // onDelete left out is restrict.
        { name: 'product', type: 'relation', table: 'menu', required: true }
      ]
    }
  ];
  const current = [
    menu,
    pulled({
      name: 'order_lines',
      displayColumn: null,
      columns: [
        {
          name: 'product',
          type: 'relation',
          table: 'menu',
          onDelete: 'restrict',
          required: true
        }
      ]
    })
  ];
  assert.deepEqual(diffSchema(current, terse).steps, []);
});

test('tables are created so that a relation’s target exists first', () => {
  // The file lists them in the worst order. Tables ready at the same time
  // keep the file's order.
  const plan = diffSchema([], [lines, orders, menu]);
  assert.deepEqual(kinds(plan.steps), [
    'createTable orders',
    'createTable menu',
    'createTable order_lines'
  ]);
  assert.deepEqual(plan.destructive, []);
});

test('a new table pointing at an existing one is created right away', () => {
  const plan = diffSchema([menu, orders], [menu, orders, lines]);
  assert.deepEqual(kinds(plan.steps), ['createTable order_lines']);
});

test('a self-relation does not hold its own table back', () => {
  const staff = pulled({
    name: 'staff',
    columns: [
      { name: 'name', type: 'text' },
      {
        name: 'manager',
        type: 'relation',
        table: 'staff',
        onDelete: 'set_null'
      }
    ]
  });
  const plan = diffSchema([], [staff]);
  assert.deepEqual(kinds(plan.steps), ['createTable staff']);
  assert.equal(
    (plan.steps[0] as { input: DataTableInput }).input.columns.length,
    2
  );
});

test('two new tables that point at each other: one waits for its relation column', () => {
  const customers = pulled({
    name: 'customers',
    columns: [
      { name: 'name', type: 'text' },
      {
        name: 'last_order',
        type: 'relation',
        table: 'orders',
        onDelete: 'set_null'
      }
    ]
  });
  const ordersWithCustomer = pulled({
    name: 'orders',
    columns: [
      { name: 'total', type: 'integer' },
      {
        name: 'customer',
        type: 'relation',
        table: 'customers',
        onDelete: 'restrict'
      }
    ]
  });
  const plan = diffSchema([], [ordersWithCustomer, customers]);
  assert.deepEqual(kinds(plan.steps), [
    'createTable customers',
    'createTable orders',
    'addColumn customers.last_order'
  ]);
  const first = plan.steps[0] as { input: DataTableInput };
  assert.deepEqual(
    first.input.columns.map(c => c.name),
    ['name']
  );
  // The same file always gives the same plan.
  assert.deepEqual(
    diffSchema([], [customers, ordersWithCustomer]).steps,
    plan.steps
  );
});

test('a cycle where every table is only relations is refused', () => {
  const a: DataTableInput = {
    name: 'a',
    columns: [{ name: 'b', type: 'relation', table: 'b' }]
  };
  const b: DataTableInput = {
    name: 'b',
    columns: [{ name: 'a', type: 'relation', table: 'a' }]
  };
  assert.throws(() => diffSchema([], [a, b]), SchemaFileError);
});

test('a display column that waits for its column is set once it exists', () => {
  const a: DataTableInput = {
    name: 'a',
    displayColumn: 'b_ref',
    columns: [
      { name: 'title', type: 'text' },
      { name: 'b_ref', type: 'relation', table: 'b' }
    ]
  };
  const b: DataTableInput = {
    name: 'b',
    columns: [
      { name: 'title', type: 'text' },
      { name: 'a_ref', type: 'relation', table: 'a' }
    ]
  };
  const plan = diffSchema([], [a, b]);
  assert.deepEqual(kinds(plan.steps), [
    'createTable a',
    'createTable b',
    'addColumn a.b_ref',
    'updateTable a'
  ]);
  assert.equal(
    (plan.steps[0] as { input: DataTableInput }).input.displayColumn,
    null
  );
  assert.deepEqual((plan.steps[3] as { patch: unknown }).patch, {
    displayColumn: 'b_ref'
  });
});

test('new columns, and a new column pointing at a new table, after the creates', () => {
  const customers = pulled({
    name: 'customers',
    columns: [{ name: 'name', type: 'text' }]
  });
  const ordersNext = {
    ...orders,
    columns: [
      ...orders.columns,
      { name: 'notes', type: 'long_text' as const },
      {
        name: 'customer_ref',
        type: 'relation' as const,
        table: 'customers',
        onDelete: 'set_null' as const
      }
    ]
  };
  const plan = diffSchema([orders], [ordersNext, customers]);
  assert.deepEqual(kinds(plan.steps), [
    'createTable customers',
    'addColumn orders.notes',
    'addColumn orders.customer_ref'
  ]);
  assert.deepEqual(plan.destructive, []);
});

test('labels, flags and table settings are safe changes', () => {
  const next = pulled({
    ...menu,
    label: 'Menu',
    access: 'full',
    columns: [
      {
        name: 'name',
        type: 'text',
        required: true,
        searchable: true,
        label: 'Dish'
      },
      { name: 'price', type: 'integer', min: 0, filterable: true },
      { name: 'stock', type: 'integer', min: 0, default: 0 }
    ]
  });
  const plan = diffSchema([menu], [next]);
  assert.deepEqual(kinds(plan.steps), [
    'updateColumn menu.name',
    'updateColumn menu.price',
    'updateTable menu'
  ]);
  assert.deepEqual(plan.destructive, []);
  assert.deepEqual((plan.steps[0] as { patch: unknown }).patch, {
    label: 'Dish'
  });
  assert.deepEqual(
    (plan.steps[1] as { patch: unknown; copies: boolean }).patch,
    { filterable: true }
  );
  assert.equal((plan.steps[1] as { copies: boolean }).copies, false);
  assert.deepEqual((plan.steps[2] as { patch: unknown }).patch, {
    label: 'Menu',
    access: 'full'
  });
});

test('a setting taken out of the file goes back to its default', () => {
  const next = pulled({
    ...menu,
    columns: [
      { name: 'name', type: 'text', required: true },
      { name: 'price', type: 'integer' },
      { name: 'stock', type: 'integer', min: 0 }
    ]
  });
  const plan = diffSchema([menu], [next]);
  assert.deepEqual(
    plan.steps.map(s => (s as { patch: unknown }).patch),
    [{ searchable: false }, { min: null }, { default: null }]
  );
  // A minimum or a default copies the table; still no data is lost.
  assert.deepEqual(
    plan.steps.map(s => (s as { copies: boolean }).copies),
    [false, true, true]
  );
  assert.deepEqual(plan.destructive, []);
});

test('a type change is destructive, and carries what the new type needs', () => {
  const next = pulled({
    ...orders,
    columns: [
      { name: 'customer', type: 'text', required: true },
      { name: 'status', type: 'text', default: 'open' }
    ]
  });
  const plan = diffSchema([orders], [next]);
  assert.deepEqual(kinds(plan.destructive), ['updateColumn orders.status']);
  assert.deepEqual((plan.steps[0] as { patch: unknown }).patch, {
    type: 'text',
    values: null
  });

  const toEnum = diffSchema([next], [orders]);
  assert.deepEqual((toEnum.steps[0] as { patch: unknown }).patch, {
    type: 'enum',
    values: ['open', 'done']
  });
});

test('pointing a relation at another table is destructive', () => {
  const next = pulled({
    ...lines,
    columns: lines.columns.map(c =>
      c.name === 'product' ? { ...c, table: 'orders' } : c
    )
  });
  const plan = diffSchema([menu, orders, lines], [menu, orders, next]);
  assert.deepEqual(kinds(plan.destructive), [
    'updateColumn order_lines.product'
  ]);
  assert.deepEqual((plan.steps[0] as { patch: unknown }).patch, {
    table: 'orders',
    onDelete: 'restrict'
  });
});

test('a renamed column reads as a drop and an add, and the drop needs --yes', () => {
  const next = pulled({
    ...menu,
    columns: menu.columns.map(c =>
      c.name === 'price' ? { ...c, name: 'cost' } : c
    )
  });
  const plan = diffSchema([menu], [next]);
  assert.deepEqual(kinds(plan.steps), [
    'addColumn menu.cost',
    'dropColumn menu.price'
  ]);
  assert.deepEqual(kinds(plan.destructive), ['dropColumn menu.price']);
});

test('safe steps come first, then type changes, column drops and table drops', () => {
  const ordersNext = pulled({
    ...orders,
    label: 'Orders',
    columns: [{ name: 'customer', type: 'long_text', required: true }]
  });
  const plan = diffSchema([menu, orders], [ordersNext]);
  assert.deepEqual(kinds(plan.steps), [
    'updateTable orders',
    'updateColumn orders.customer',
    'dropColumn orders.status',
    'dropTable menu'
  ]);
  assert.deepEqual(kinds(plan.destructive), [
    'updateColumn orders.customer',
    'dropColumn orders.status',
    'dropTable menu'
  ]);
});

test('a table that points at another dropped table is dropped before it', () => {
  const plan = diffSchema([menu, orders, lines], []);
  assert.deepEqual(kinds(plan.steps), [
    'dropTable order_lines',
    'dropTable menu',
    'dropTable orders'
  ]);
});

test('dropping tables that point at each other drops a relation column first', () => {
  // The API refuses to drop a table while any other table points at it, even
  // one dropped by the same push.
  const customers = pulled({
    name: 'customers',
    columns: [
      { name: 'name', type: 'text' },
      {
        name: 'last_order',
        type: 'relation',
        table: 'orders',
        onDelete: 'set_null'
      }
    ]
  });
  const ordersWithCustomer = pulled({
    name: 'orders',
    columns: [
      { name: 'total', type: 'integer' },
      {
        name: 'customer',
        type: 'relation',
        table: 'customers',
        onDelete: 'restrict'
      }
    ]
  });
  const plan = diffSchema([menu, customers, ordersWithCustomer], [menu]);
  assert.deepEqual(kinds(plan.steps), [
    'dropColumn orders.customer',
    'dropTable customers',
    'dropTable orders'
  ]);
  assert.deepEqual(plan.destructive, plan.steps);
  // Every drop is one the API takes: no remaining table points at it.
  const left = new Map(
    [customers, ordersWithCustomer].map(t => [t.name, [...t.columns]])
  );
  for (const step of plan.steps) {
    if (step.kind === 'dropColumn') {
      left.set(
        step.table,
        left.get(step.table)!.filter(c => c.name !== step.column)
      );
    } else if (step.kind === 'dropTable') {
      left.delete(step.table);
      for (const [name, columns] of left) {
        assert.ok(
          !columns.some(c => c.type === 'relation' && c.table === step.table),
          `${name} still points at ${step.table}`
        );
      }
    }
  }
});

test('a cycle of three dropped tables, and a self-relation, still drop in a valid order', () => {
  const a: DataTableInput = {
    name: 'a',
    columns: [
      { name: 'to_b', type: 'relation', table: 'b' },
      { name: 'parent', type: 'relation', table: 'a' }
    ]
  };
  const b: DataTableInput = {
    name: 'b',
    columns: [{ name: 'to_c', type: 'relation', table: 'c' }]
  };
  const c: DataTableInput = {
    name: 'c',
    columns: [{ name: 'to_a', type: 'relation', table: 'a' }]
  };
  const plan = diffSchema([a, b, c], []);
  // c.to_a goes, which frees a; then the chain unwinds. The self-relation
  // never holds a table back.
  assert.deepEqual(kinds(plan.steps), [
    'dropColumn c.to_a',
    'dropTable a',
    'dropTable b',
    'dropTable c'
  ]);
});

test('describeStep reads as a plan', () => {
  const plan = diffSchema([orders], [lines, orders, menu]);
  assert.deepEqual(plan.steps.map(describeStep), [
    'create table menu (name, price, stock)',
    'create table order_lines (order, product, qty)'
  ]);
  const change = diffSchema(
    [orders],
    [
      pulled({
        ...orders,
        columns: [orders.columns[0], { name: 'status', type: 'text' }]
      })
    ]
  );
  assert.equal(
    describeStep(change.steps[0]),
    'change orders.status: type "text", values none, default none (copies the table)'
  );
});

test('the file is checked for its own mistakes before anything is sent', () => {
  assert.deepEqual(checkSchemaFile({ tables: [] }), []);
  const problems = (value: unknown) => {
    try {
      checkSchemaFile(value);
      return [];
    } catch (error) {
      assert.ok(error instanceof SchemaFileError);
      return error.problems;
    }
  };
  assert.deepEqual(problems([]), ['the file is { "tables": [ ... ] }']);
  assert.deepEqual(problems({ tables: [{ name: 'a', columns: [] }] }), [
    'a: "columns" lists at least one column'
  ]);
  assert.deepEqual(
    problems({
      tables: [
        {
          name: 'a',
          columns: [
            { name: 'x', type: 'text' },
            { name: 'x', type: 'text' }
          ]
        },
        {
          name: 'a',
          columns: [{ name: 'y', type: 'relation', table: 'nowhere' }]
        }
      ]
    }),
    [
      'a.x is listed twice',
      'table "a" is listed twice',
      'a.y points at "nowhere", which the file doesn\'t have'
    ]
  );
});
