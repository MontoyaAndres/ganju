import { defineTool } from '@ganju/sdk';

/**
 * Sales per dish for a period, from a query the owner saved once
 * (`sales_by_dish` in ganju.data.json). Functions run saved queries by
 * name; none of them sends SQL. `data.access: "read"` in ganju.json means
 * this function can't write, whatever its code says.
 */
export default defineTool<{ from: string; to: string }>(async (input, ctx) => {
  const { rows, truncated } = await ctx.data.run('sales_by_dish', {
    from: input.from,
    to: input.to
  });
  return { rows, ...(truncated ? { note: truncated } : {}) };
});
