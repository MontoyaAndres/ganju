import { defineTool } from '@ganju/sdk';

import {
  cents,
  loadOrder,
  orderTotal,
  refundedTotal,
  saveOrder
} from './lib/orders';

/**
 * Refund an order, in full or in part.
 *
 * Money going back to a customer can't be undone, so `ganju.json` declares
 * `destructiveHint: true`. With the organization's "Confirm sensitive actions"
 * on, that is all it takes for this tool to ask first:
 *
 * - a channel bot holds the call, asks the person in the chat, and runs the
 *   exact call it showed them only on a yes;
 * - an MCP client (Claude, Cursor) gets "not run yet" back with a one-time
 *   confirmation token, asks the person, and calls again with it.
 *
 * Nothing in this file or in the description asks the model to confirm: the
 * platform does, and a model told to ask as well asks twice.
 */
export default defineTool<{ orderId: string; amount?: number; reason: string }>(
  async (input, ctx) => {
    const order = await loadOrder(ctx, input.orderId);

    if (order.status === 'processing') {
      throw new Error(
        `Order ${order.id} hasn't shipped yet, so there is nothing to refund. Cancel it in the store instead.`
      );
    }

    const refundable = cents(orderTotal(order) - refundedTotal(order));
    if (refundable <= 0) {
      throw new Error(`Order ${order.id} has already been refunded in full.`);
    }

    const amount = cents(input.amount ?? refundable);
    if (amount <= 0 || amount > refundable) {
      throw new Error(
        `A refund on ${order.id} can be at most ${refundable} ${order.currency}.`
      );
    }

    order.refunds.push({
      at: new Date().toISOString(),
      amount,
      reason: input.reason.trim()
    });
    await saveOrder(ctx, order);

    ctx.log(`refunded ${amount} ${order.currency} on ${order.id}`);

    return {
      orderId: order.id,
      refunded: amount,
      currency: order.currency,
      remaining: cents(refundable - amount)
    };
  }
);
