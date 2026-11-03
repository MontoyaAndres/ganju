import { defineTool, type TriggerEvent } from '@ganju/sdk';

/**
 * Tells the kitchen about a new order, in the staff's Telegram group. A
 * trigger on `orders` runs it for every insert (see "triggers" in
 * ganju.json); with `"expose": false` the assistant never sees it.
 *
 * The group is set once, as two secrets of this tool: the channel's id from
 * the dashboard (KITCHEN_CHANNEL_ID) and the group's chat id
 * (KITCHEN_CHAT_ID, e.g. -1001234567890).
 *
 * At least once: the same event can come twice, so a repeat is skipped by
 * its `eventId`, kept on the order.
 */
export default defineTool<TriggerEvent>(async (event, ctx) => {
  const order = event.row;
  if (!order) return { skipped: 'no row' };
  if (order.notified_event === event.eventId)
    return { skipped: 'already sent' };

  const { rows } = await ctx.data.query({
    table: 'order_lines',
    where: { order: order.id as number },
    limit: 50
  });
  const lines = rows.map(line => {
    const dish = line.dish as { label?: unknown } | null;
    return `${line.quantity}× ${String(dish?.label ?? 'dish')}`;
  });

  await ctx.channels.post({
    channelId: await ctx.secret('KITCHEN_CHANNEL_ID'),
    chatId: await ctx.secret('KITCHEN_CHAT_ID'),
    text: `New order #${order.id}: ${lines.join(', ') || 'no dishes'}`
  });
  // Written as this trigger, so it doesn't fire the trigger again.
  await ctx.data.update('orders', order.id as number, {
    notified_event: event.eventId
  });
  return { posted: lines.length };
});
