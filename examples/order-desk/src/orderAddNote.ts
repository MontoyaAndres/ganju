import { defineTool } from '@ganju/sdk';

import { loadOrder, saveOrder } from './lib/orders';

/**
 * Add an internal note to an order.
 *
 * It writes, but only to the store's own records, and a note can be corrected
 * with another one — so `ganju.json` declares `destructiveHint: false`. Tools
 * like this run without a confirmation; the question is saved for the actions
 * that reach the customer or can't be taken back.
 */
export default defineTool<{ orderId: string; note: string }>(
  async (input, ctx) => {
    const text = input.note.trim();
    if (!text) throw new Error('A note needs some text');

    const order = await loadOrder(ctx, input.orderId);
    order.notes.push({ at: new Date().toISOString(), text });
    await saveOrder(ctx, order);

    ctx.log(`note on ${order.id}`);

    return { orderId: order.id, notes: order.notes.length };
  }
);
