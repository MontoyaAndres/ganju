import { defineTool, type TriggerEvent } from '@ganju/sdk';

/**
 * Tells the customer their order is ready. A trigger runs it when an order's
 * status changes to `ready`, and only then: editing an order that is already
 * ready doesn't run it again.
 *
 * `participant_id` is the customer the bot took the order from (orders is
 * customer-scoped). An order the owner typed in has none, and is skipped.
 * The message is recorded on the customer's conversation, so if they ask
 * "is it ready?" the bot knows it told them.
 *
 * On WhatsApp, a customer who last wrote more than 24 hours ago can only get
 * an approved template; without one, send() fails saying so.
 */
export default defineTool<TriggerEvent>(async (event, ctx) => {
  const order = event.row;
  const participantId = order?.participant_id;
  if (typeof participantId !== 'string') return { skipped: 'no customer' };

  const sent = await ctx.channels.send({
    participantId,
    text: `Your order #${order!.id} is ready. Thank you!`
  });
  return { sent: sent.sent };
});
