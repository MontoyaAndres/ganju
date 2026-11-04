// WhatsApp message templates: Meta's common rejection rules, the components
// sent to Meta and read back, and send errors in words. Run with `npm test`
// (node --test; whatsappTemplates.ts imports nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkWhatsappTemplate,
  cleanWhatsappTemplateParam,
  fillWhatsappTemplate,
  whatsappSendError,
  whatsappTemplateComponents,
  whatsappTemplateContent,
  whatsappTemplateSendable,
  whatsappTemplateVariableCount
} from '../src/whatsappTemplates.ts';
import type { WhatsappTemplateDraft } from '../src/whatsappTemplates.ts';

const draft = (
  patch: Partial<WhatsappTemplateDraft> = {}
): WhatsappTemplateDraft => ({
  name: 'order_ready',
  language: 'es',
  category: 'UTILITY',
  body: 'Hola {{1}}, tu pedido #{{2}} está listo para recoger.',
  examples: ['Ana', '42'],
  ...patch
});

const codes = (patch: Partial<WhatsappTemplateDraft>) =>
  checkWhatsappTemplate(draft(patch)).map(issue => issue.code);

test('a well-formed utility template has no issues', () => {
  assert.deepEqual(checkWhatsappTemplate(draft()), []);
});

test('names are lowercase, digits and underscores', () => {
  assert.ok(codes({ name: 'Order Ready' }).includes('name_format'));
  assert.ok(codes({ name: 'order-ready' }).includes('name_format'));
  assert.deepEqual(codes({ name: 'order_ready_2' }), []);
});

test('a variable at the very start or end is refused', () => {
  assert.ok(
    codes({ body: '{{1}}, tu pedido está listo para recoger hoy.' }).includes(
      'variable_at_start'
    )
  );
  assert.ok(
    codes({ body: 'Tu pedido ya está listo para recoger, {{1}}.' }).includes(
      'variable_at_end'
    )
  );
});

test('two variables side by side are refused', () => {
  assert.ok(
    codes({
      body: 'Hola, tu pedido {{1}} {{2}} está listo para recoger.'
    }).includes('variables_adjacent')
  );
});

test('too many variables for the text are refused', () => {
  assert.ok(
    codes({
      body: 'Hola {{1}} y {{2}} y {{3}} ok.',
      examples: ['a', 'b', 'c']
    }).includes('variables_dense')
  );
});

test('variables are numbered in order with no gaps', () => {
  assert.ok(
    codes({
      body: 'Hola {{2}}, tu pedido #{{1}} está listo para recoger.'
    }).includes('variables_order')
  );
  assert.ok(
    codes({
      body: 'Hola {{1}}, tu pedido #{{3}} está listo para recoger.',
      examples: ['a', 'b', 'c']
    }).includes('variables_order')
  );
});

test('each variable needs an example', () => {
  const issues = checkWhatsappTemplate(draft({ examples: ['Ana'] }));
  assert.deepEqual(issues, [{ code: 'example_missing', n: 2 }]);
});

test('header and footer take no variables, buttons are short', () => {
  const found = codes({
    header: 'Pedido {{1}}',
    footer: 'Gracias {{1}}',
    buttons: ['Sí', 'Sí', 'Una respuesta demasiado larga para un botón']
  });
  assert.ok(found.includes('header_variables'));
  assert.ok(found.includes('footer_variables'));
  assert.ok(found.includes('buttons_repeated'));
  assert.ok(found.includes('button_long'));
});

test('unknown languages and the authentication category are refused', () => {
  assert.ok(codes({ language: 'xx' }).includes('language'));
  assert.ok(
    codes({ category: 'AUTHENTICATION' as 'UTILITY' }).includes('category')
  );
});

test('components carry the examples, and read back the same', () => {
  const input = draft({
    header: 'Tu pedido',
    footer: 'Pizzería Nemo',
    buttons: ['Gracias', 'Ver pedido']
  });
  const components = whatsappTemplateComponents(input);
  assert.deepEqual(components[1], {
    type: 'BODY',
    text: input.body,
    example: { body_text: [['Ana', '42']] }
  });
  assert.deepEqual(whatsappTemplateContent(components), {
    header: 'Tu pedido',
    body: input.body,
    footer: 'Pizzería Nemo',
    buttons: ['Gracias', 'Ver pedido'],
    examples: ['Ana', '42']
  });
  assert.equal(whatsappTemplateVariableCount(input.body), 2);
});

test('values fill the body, and are cleaned the way Meta accepts them', () => {
  assert.equal(
    fillWhatsappTemplate('Hola {{1}}, pedido #{{2}}', ['Ana', '42']),
    'Hola Ana, pedido #42'
  );
  assert.equal(cleanWhatsappTemplateParam('a\nb\t c     d'), 'a b c d');
  assert.equal(cleanWhatsappTemplateParam('   '), '-');
  assert.equal(cleanWhatsappTemplateParam(null), '-');
});

test("Meta's send errors read as words, and say whether to retry", () => {
  assert.deepEqual(whatsappSendError(132015, 'x').retry, false);
  assert.match(whatsappSendError(131047, undefined).text, /24-hour window/);
  assert.equal(whatsappSendError(131056, undefined).retry, true);
  assert.deepEqual(whatsappSendError(999999, 'Something odd'), {
    text: 'Something odd',
    retry: true
  });
});

test('templates Ganju can fill are body-only, with static extras', () => {
  assert.equal(
    whatsappTemplateSendable(whatsappTemplateComponents(draft())),
    true
  );
  assert.equal(
    whatsappTemplateSendable([
      { type: 'HEADER', format: 'TEXT', text: 'Tu pedido' },
      { type: 'BODY', text: 'Hola {{1}}' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Ver', url: 'https://example.com/pedidos' },
          { type: 'PHONE_NUMBER', text: 'Llamar', phone_number: '+57300' }
        ]
      }
    ]),
    true
  );
  for (const extra of [
    { type: 'HEADER', format: 'IMAGE' },
    { type: 'HEADER', format: 'TEXT', text: 'Pedido {{1}}' },
    {
      type: 'BUTTONS',
      buttons: [{ type: 'URL', text: 'Ver', url: 'https://x.co/{{1}}' }]
    },
    { type: 'BUTTONS', buttons: [{ type: 'COPY_CODE', example: 'X' }] },
    { type: 'CAROUSEL', cards: [] }
  ]) {
    assert.equal(
      whatsappTemplateSendable([{ type: 'BODY', text: 'Hola' }, extra]),
      false,
      JSON.stringify(extra)
    );
  }
});
