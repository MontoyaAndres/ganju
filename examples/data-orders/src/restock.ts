import { defineTool, type DataOperation, type TriggerEvent } from '@ganju/sdk';

/**
 * Puts a cancelled order's dishes back in stock. A trigger runs it when an
 * order's status changes to `cancelled`, whoever cancelled it: the owner in
 * the dashboard, or the bot when the customer asked.
 *
 * One write: the order is marked `restocked` with a guard that it wasn't
 * yet, and each dish's stock goes up by its line's quantity. The same event
 * can come twice; the second time the guard fails, nothing is written, and
 * it's skipped.
 */
export default defineTool<TriggerEvent>(async (event, ctx) => {
  const order = event.row;
  if (!order) return { skipped: 'no row' };
  if (order.restocked === true) return { skipped: 'already restocked' };

  const { rows } = await ctx.data.query({
    table: 'order_lines',
    where: { order: order.id as number },
    limit: 50
  });
  const stock: DataOperation[] = rows.map(line => ({
    op: 'update',
    table: 'menu',
    id: (line.dish as { id: number }).id,
    set: { stock: { increment: Number(line.quantity) } }
  }));

  try {
    await ctx.data.write([
      {
        op: 'update',
        table: 'orders',
        id: order.id as number,
        set: { restocked: true },
        where: { restocked: false }
      },
      ...stock
    ]);
  } catch (error) {
    // The guard's message shows the stored value: booleans are 1 or 0.
    if (/restocked = (1|true)\b/.test(String(error))) {
      return { skipped: 'already restocked' };
    }
    throw error;
  }
  ctx.log(`order ${order.id}: ${stock.length} dishes back in stock`);
  return { restocked: stock.length };
});
