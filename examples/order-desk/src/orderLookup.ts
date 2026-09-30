import { defineTool } from '@ganju/sdk';

import { cents, loadOrder, orderTotal, refundedTotal } from './lib/orders';

/**
 * Look up one order.
 *
 * Declared `readOnlyHint: true` in `ganju.json`. That is what lets it run
 * straight away when the organization confirms sensitive actions: a tool that
 * declares nothing is treated as one that may change things, and would be
 * confirmed before every lookup.
 */
export default defineTool<{ orderId: string }>(async (input, ctx) => {
  const order = await loadOrder(ctx, input.orderId);
  const total = orderTotal(order);
  const refunded = refundedTotal(order);

  return {
    id: order.id,
    customer: order.customer,
    status: order.status,
    placedAt: order.placedAt,
    currency: order.currency,
    items: order.items,
    total,
    refunded,
    refundable: cents(total - refunded),
    notes: order.notes,
    refunds: order.refunds
  };
});
