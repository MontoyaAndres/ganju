import { defineTool, type DataOperation } from '@ganju/sdk';

interface Input {
  customer: string;
  phone?: string;
  items: { dish: string; quantity: number }[];
}

/**
 * Take an order into the project's database.
 *
 * One `ctx.data.write`, so it all happens or none of it does: the order, a
 * line per dish pointing at it (`{ $ref: 0 }` is the order inserted first),
 * and a stock decrement per dish. Each decrement carries a guard, so two
 * customers ordering the last pizza can't both get it: the second write fails
 * whole, with how many are left.
 */
export default defineTool<Input>(async (input, ctx) => {
  const names = [...new Set(input.items.map(item => item.dish.trim()))];
  const menu = await ctx.data.query({
    table: 'menu',
    where: { name: { in: names } },
    limit: names.length
  });
  const byName = new Map(
    menu.rows.map(row => [String(row.name).toLowerCase(), row])
  );

  let total = 0;
  const lines: DataOperation[] = [];
  const stock: DataOperation[] = [];
  for (const item of input.items) {
    const dish = byName.get(item.dish.trim().toLowerCase());
    if (!dish) {
      throw new Error(
        `"${item.dish}" isn't on the menu. Dishes: ${menu.rows.map(r => r.name).join(', ') || 'none found'}.`
      );
    }
    const price = Number(dish.price);
    total += price * item.quantity;
    lines.push({
      op: 'insert',
      table: 'order_lines',
      values: {
        order: { $ref: 0 },
        dish: dish.id,
        quantity: item.quantity,
        price
      }
    });
    stock.push({
      op: 'update',
      table: 'menu',
      id: dish.id,
      set: { stock: { decrement: item.quantity } },
      where: { stock: { gte: item.quantity } }
    });
  }

  const { results } = await ctx.data.write([
    {
      op: 'insert',
      table: 'orders',
      values: { customer: input.customer, phone: input.phone ?? null, total }
    },
    ...lines,
    ...stock
  ]);
  const order = results[0] as { id: number };
  ctx.log(`order ${order.id}: ${input.items.length} dishes, ${total}`);
  return { orderId: order.id, total, status: 'pending' };
});
