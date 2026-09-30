// The linter's rules, pinned to the cases that shaped them: the `ganju init`
// template, tools written from one sentence template, real duplicates, and
// look-alikes of native and proxied tools. Run with `npm test` (node --test;
// Node strips the types itself, and toolLint.ts imports nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lintTools, TOOL_LINT_MAX_TOOLS } from '../src/toolLint.ts';
import type { LintableTool, ToolLintFinding } from '../src/toolLint.ts';

// A tool that passes every per-tool rule, to vary one thing at a time.
const clean = (name: string, description: string): LintableTool => ({
  name,
  description,
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to look for.' }
    }
  }
});

const rules = (findings: ToolLintFinding[]) =>
  findings.map(finding => [finding.rule, finding.tool]);

test('the ganju init template is clean', () => {
  const findings = lintTools([
    {
      name: 'lookup-order',
      title: 'Look up order',
      description:
        'Find an order by its id. Use when the customer gives an order number.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          orderId: {
            type: 'string',
            description: 'The order number the customer gave.'
          }
        },
        required: ['orderId']
      }
    }
  ]);
  assert.deepEqual(findings, []);
});

test('tools written from one sentence template are not look-alikes', () => {
  const probes = Array.from({ length: 21 }, (_, i) =>
    clean(
      `probe-${i}`,
      `Use when someone asks about topic${i} widget${i} gadget${i} thing${i}.`
    )
  );
  assert.deepEqual(lintTools(probes), []);
});

test('real duplicates are grouped, one finding per tool', () => {
  const description =
    'Use when the customer asks where their parcel is: returns the carrier, tracking number and delivery estimate.';
  const duplicates = Array.from({ length: 5 }, (_, i) =>
    clean(`track-parcel-${i}`, description)
  );
  const findings = lintTools(duplicates).filter(
    finding => finding.rule === 'overlapping-tools'
  );
  // Each pair is reported once, on the first of the two: 4 + 3 + 2 + 1.
  assert.equal(findings.length, 4);
  assert.deepEqual(findings[0].alike, [
    'track-parcel-1',
    'track-parcel-2',
    'track-parcel-3',
    'track-parcel-4'
  ]);
});

test('sibling tools on one domain are not look-alikes', () => {
  const findings = lintTools([
    clean(
      'order-lookup',
      'Use when the customer asks where their order is; returns status and tracking for an order id.'
    ),
    clean(
      'order-refund',
      'Use when the customer asks to refund their order; issues a refund for an order id and returns the refund id.'
    )
  ]);
  assert.deepEqual(findings, []);
});

test('a name that matches a native tool is a look-alike, whatever its style', () => {
  const findings = lintTools(
    [
      clean(
        'resourcesSearch',
        'Use when the user asks for a document: finds knowledge base articles by keyword.'
      )
    ],
    { others: [{ name: 'search-resources', description: 'Search resources' }] }
  );
  assert.deepEqual(rules(findings), [['overlapping-tools', 'resourcesSearch']]);
  assert.deepEqual(findings[0].alike, ['search-resources']);
});

test("a proxied tool's server prefix doesn't hide a look-alike", () => {
  const others = [
    { name: 'github__search_repositories', description: '[via github] x' },
    { name: 'github__list_issues', description: '[via github] x' }
  ];
  const findings = lintTools(
    [
      clean('search_repositories', 'Use to find a team repository by keyword.'),
      clean('listIssues', 'Use when the user asks which issues are open now.'),
      clean('search_issues', 'Use to search the tracker by keyword and label.')
    ],
    { others }
  );
  assert.deepEqual(rules(findings), [
    ['overlapping-tools', 'search_repositories'],
    ['overlapping-tools', 'listIssues']
  ]);
  assert.deepEqual(findings[0].alike, ['github__search_repositories']);
  assert.deepEqual(findings[1].alike, ['github__list_issues']);
});

test('usage guidance means when to use a tool, not how it works', () => {
  const lint = (description: string) =>
    rules(lintTools([clean('probe', description)]));
  const flagged = [['no-usage-guidance', 'probe']];

  assert.deepEqual(
    lint('This uses the Stripe API to create a charge for an amount in cents.'),
    flagged
  );
  assert.deepEqual(
    lint('Makes an API call to OpenWeather and returns the forecast for a city.'),
    flagged
  );
  assert.deepEqual(
    lint('Call this to get the OpenWeather forecast for a city the user names.'),
    []
  );
  assert.deepEqual(
    lint('Busca pedidos por número. Úsala cuando el cliente da un número de pedido.'),
    []
  );
  assert.deepEqual(
    lint('Procura pedidos pelo número, quando o cliente informa o código.'),
    []
  );
});

test('missing and very short descriptions', () => {
  assert.deepEqual(rules(lintTools([clean('a', '')])), [
    ['missing-description', 'a']
  ]);
  assert.deepEqual(rules(lintTools([clean('b', 'Finds orders.')])), [
    ['short-description', 'b']
  ]);
});

test('missing annotations only when neither hint is declared', () => {
  const description = 'Use when the customer wants to add a note to their order.';
  const withHints = (annotations: LintableTool['annotations']) =>
    rules(lintTools([{ ...clean('note', description), annotations }]));

  assert.deepEqual(withHints(undefined), [['missing-annotations', 'note']]);
  assert.deepEqual(withHints({ openWorldHint: true }), [
    ['missing-annotations', 'note']
  ]);
  assert.deepEqual(withHints({ readOnlyHint: false }), []);
  assert.deepEqual(withHints({ destructiveHint: false }), []);
});

test('undescribed inputs are reported by path, nested ones included', () => {
  const findings = lintTools([
    {
      ...clean('create-order', 'Use when the customer confirms a new order.'),
      inputSchema: {
        type: 'object',
        properties: {
          customer: {
            type: 'object',
            description: 'Who the order is for.',
            properties: {
              email: { type: 'string' },
              name: { type: 'string', description: 'Full name.' }
            }
          },
          items: {
            type: 'array',
            description: 'What they ordered.',
            items: {
              type: 'object',
              properties: { sku: { type: 'string' } }
            }
          },
          note: { type: 'string' }
        }
      }
    }
  ]);
  assert.deepEqual(rules(findings), [['undescribed-input', 'create-order']]);
  assert.deepEqual(findings[0].paths, ['customer.email', 'items[].sku', 'note']);
});

test('too many tools counts the rest of the server', () => {
  const tools = Array.from({ length: 5 }, (_, i) =>
    clean(`tool-${i}`, `Use when someone asks about subject${i} area${i}.`)
  );
  const serverWide = (otherCount: number) =>
    lintTools(tools, { otherCount }).filter(
      finding => finding.rule === 'too-many-tools'
    );

  assert.deepEqual(serverWide(TOOL_LINT_MAX_TOOLS - 5), []);
  const [finding] = serverWide(TOOL_LINT_MAX_TOOLS - 4);
  assert.equal(finding.count, TOOL_LINT_MAX_TOOLS + 1);
  assert.equal(finding.limit, TOOL_LINT_MAX_TOOLS);
});
