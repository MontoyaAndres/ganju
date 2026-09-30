import type { ToolContext } from '@ganju/sdk';

/**
 * A small store's orders, and what support has done to them.
 *
 * The orders themselves are sample data in this file, so the example runs with
 * nothing to connect. What the tools change — internal notes and refunds — is
 * saved on the project as one JSON resource per order under
 * `resource://orders/<id>`. An order nobody has touched has no resource yet and
 * reads from the sample data; the first note or refund writes it.
 *
 * To put this in front of a real store, replace `loadOrder` and `saveOrder`
 * with calls to its API and add its host to `allowedHosts`.
 */

export interface OrderItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  customer: string;
  status: 'processing' | 'shipped' | 'delivered' | 'cancelled';
  placedAt: string;
  currency: string;
  items: OrderItem[];
  notes: Array<{ at: string; text: string }>;
  refunds: Array<{ at: string; amount: number; reason: string }>;
}

const ORDERS_PREFIX = 'resource://orders/';

const SAMPLE_ORDERS: Order[] = [
  {
    id: 'A-1001',
    customer: 'Laura Gómez',
    status: 'delivered',
    placedAt: '2026-09-02T14:10:00Z',
    currency: 'USD',
    items: [
      { sku: 'MUG-01', name: 'Ceramic mug', quantity: 2, unitPrice: 14 },
      { sku: 'BEAN-250', name: 'Coffee beans, 250 g', quantity: 1, unitPrice: 18 }
    ],
    notes: [],
    refunds: []
  },
  {
    id: 'A-1002',
    customer: 'Daniel Ortiz',
    status: 'shipped',
    placedAt: '2026-09-20T09:42:00Z',
    currency: 'USD',
    items: [
      { sku: 'GRIND-PRO', name: 'Burr grinder', quantity: 1, unitPrice: 129 }
    ],
    notes: [],
    refunds: []
  },
  {
    id: 'A-1003',
    customer: 'Priya Nair',
    status: 'processing',
    placedAt: '2026-09-29T17:05:00Z',
    currency: 'USD',
    items: [
      { sku: 'KETTLE-GN', name: 'Gooseneck kettle', quantity: 1, unitPrice: 64 },
      { sku: 'FILTER-100', name: 'Paper filters, 100', quantity: 3, unitPrice: 6 }
    ],
    notes: [],
    refunds: []
  },
  {
    id: 'A-1004',
    customer: 'Tom Becker',
    status: 'cancelled',
    placedAt: '2026-09-11T11:30:00Z',
    currency: 'USD',
    items: [
      { sku: 'SCALE-01', name: 'Brewing scale', quantity: 1, unitPrice: 42 }
    ],
    notes: [],
    refunds: []
  }
];

export const orderTotal = (order: Order): number =>
  order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

export const refundedTotal = (order: Order): number =>
  order.refunds.reduce((sum, refund) => sum + refund.amount, 0);

/** Money is kept to the cent so repeated partial refunds add up exactly. */
export const cents = (amount: number): number => Math.round(amount * 100) / 100;

const orderUri = (id: string): string => `${ORDERS_PREFIX}${id.toUpperCase()}`;

/**
 * One order, with everything support has recorded on it.
 *
 * Only "not found" means the order is untouched. Any other failure is thrown:
 * reading the sample copy instead would hide earlier refunds, and a refund
 * written on top of it would erase them.
 */
export const loadOrder = async (
  ctx: ToolContext,
  id: string
): Promise<Order> => {
  const sample = SAMPLE_ORDERS.find(order => order.id === id.toUpperCase());
  if (!sample) {
    throw new Error(
      `There is no order ${id}. Order numbers look like A-1001; ask the customer to check theirs.`
    );
  }
  try {
    const saved = await ctx.resources.read(orderUri(sample.id));
    return JSON.parse(saved.text) as Order;
  } catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) {
      return structuredClone(sample);
    }
    throw error;
  }
};

export const saveOrder = async (ctx: ToolContext, order: Order) => {
  await ctx.resources.create({
    uri: orderUri(order.id),
    title: `Order ${order.id}`,
    description: `Support record for order ${order.id}`,
    mimeType: 'application/json',
    content: JSON.stringify(order, null, 2)
  });
};
