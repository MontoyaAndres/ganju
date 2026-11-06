// What a WhatsApp channel takes from a webhook its Meta app shares with other
// numbers: only its own number's messages and its own account's template
// events.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  whatsappAccountChanges,
  whatsappMessageChange
} from '../src/whatsappWebhook.ts';

const OWN = '1467707216416486';
const OTHER = '1475641792288940';

const message = (to: string | undefined, text: string) => ({
  field: 'messages',
  value: {
    ...(to ? { metadata: { phone_number_id: to } } : {}),
    messages: [
      { id: `wamid.${text}`, from: '573213726060', text: { body: text } }
    ]
  }
});

test('a message sent to another number on the same Meta app is ignored', () => {
  const payload = {
    entry: [{ id: 'waba', changes: [message(OTHER, '/link')] }]
  };
  assert.equal(whatsappMessageChange(payload, OWN), undefined);
});

test("the channel's own message is found anywhere in the batch", () => {
  const payload = {
    entry: [
      { id: 'other-waba', changes: [message(OTHER, 'not ours')] },
      {
        id: 'waba',
        changes: [
          { field: 'messages', value: { statuses: [{}] } },
          message(OWN, 'hola')
        ]
      }
    ]
  };
  assert.equal(
    (whatsappMessageChange(payload, OWN)?.messages?.[0] as { id: string }).id,
    'wamid.hola'
  );
});

test("a message that doesn't say which number it's for is kept", () => {
  const payload = { entry: [{ changes: [message(undefined, 'hola')] }] };
  assert.ok(whatsappMessageChange(payload, OWN));
  assert.equal(whatsappMessageChange({}, OWN), undefined);
});

test("template events come only from the channel's own business account", () => {
  const FIELDS = ['message_template_status_update', 'template_category_update'];
  const status = (id: string) => ({
    field: 'message_template_status_update',
    value: { message_template_id: id, event: 'APPROVED' }
  });
  const payload = {
    entry: [
      { id: 'own-waba', changes: [status('1'), message(OWN, 'hola')] },
      { id: 'other-waba', changes: [status('2')] }
    ]
  };
  assert.deepEqual(
    whatsappAccountChanges(payload, 'own-waba', FIELDS).map(
      c => c.value?.message_template_id
    ),
    ['1']
  );
  // No account saved: both are kept; each only touches this channel's rows.
  assert.equal(whatsappAccountChanges(payload, undefined, FIELDS).length, 2);
});
