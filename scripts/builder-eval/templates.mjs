// Starting states for the golden cases, built through the same endpoints the
// dashboard uses. Each case runs in a fresh project.
import { mcp } from './api.mjs';

const D = '/artifact/data';

const createDatabase = async p => {
  await p.post(D, {});
  await p.patch(D, { timeZone: 'America/Bogota' });
};

const today = (h, m) => {
  const now = new Date();
  const bogota = new Date(now.getTime() - 5 * 3600_000);
  const day = bogota.toISOString().slice(0, 10);
  return `${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-05:00`;
};

const ORDER_DESK = `import { createHandler, defineTool } from './ganju-sdk.js';

const ORDERS = {
  'A-1001': { customer: 'Ana Gómez', total: 120, status: 'delivered' },
  'A-1002': { customer: 'Carlos Ruiz', total: 45, status: 'shipped' },
  'A-1003': { customer: 'Laura Méndez', total: 310, status: 'delivered' }
};

const orderLookup = async input => {
  const order = ORDERS[input.orderId];
  if (!order) return { found: false };
  return { found: true, orderId: input.orderId, ...order };
};

const orderRefund = async (input, ctx) => {
  const order = ORDERS[input.orderId];
  if (!order) return { refunded: false, reason: 'No such order' };
  if (input.amount > order.total) return { refunded: false, reason: 'More than the order total' };
  ctx.log(\`refund \${input.amount} on \${input.orderId}\`);
  return { refunded: true, orderId: input.orderId, amount: input.amount };
};

export default createHandler({
  'order-lookup': defineTool(orderLookup),
  'order-refund': defineTool(orderRefund)
});
`;

const ORDER_DESK_MANIFEST = {
  tools: [
    {
      name: 'order-lookup',
      description:
        'Use when a customer gives an order number and wants its status.',
      inputSchema: {
        type: 'object',
        properties: { orderId: { type: 'string', description: 'Like A-1001' } },
        required: ['orderId']
      },
      annotations: { readOnlyHint: true }
    },
    {
      name: 'order-refund',
      description: 'Use when a customer asks for money back on an order.',
      inputSchema: {
        type: 'object',
        properties: {
          orderId: { type: 'string' },
          amount: { type: 'number', description: 'Dollars to refund' }
        },
        required: ['orderId', 'amount']
      },
      annotations: { destructiveHint: true }
    }
  ]
};

// The forecast path moved from v0 to v1; v0 answers 404.
const WEATHER = `import { createHandler, defineTool } from './ganju-sdk.js';

const currentWeather = async input => {
  const geo = await fetch(
    'https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&name=' + encodeURIComponent(input.city)
  ).then(r => r.json());
  const place = geo.results?.[0];
  if (!place) return { found: false };
  const response = await fetch(
    \`https://api.open-meteo.com/v0/forecast?latitude=\${place.latitude}&longitude=\${place.longitude}&current=temperature_2m,precipitation\`
  );
  if (!response.ok) throw new Error('Weather service answered ' + response.status);
  const data = await response.json();
  return { city: place.name, temperature: data.current.temperature_2m, precipitation: data.current.precipitation };
};

export default createHandler({ 'current-weather': defineTool(currentWeather) });
`;

const WEATHER_MANIFEST = {
  tools: [
    {
      name: 'current-weather',
      description:
        'Use when a customer asks about the weather right now in a city.',
      inputSchema: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city']
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    }
  ]
};

const publishEditorVersion = async (session, files, manifest, config) => {
  const draft = await session.saveDraft({ files, manifest, config });
  return session.p.post(
    `/artifact/custom-code/version/${draft.versionId}/publish`,
    {}
  );
};

export const TEMPLATES = {
  empty: async () => {},

  'orders-table': async ({ p }) => {
    await createDatabase(p);
    await p.post(`${D}/table`, {
      name: 'orders',
      label: 'Orders',
      access: 'none',
      columns: [
        { name: 'customer', type: 'text', required: true },
        { name: 'items', type: 'long_text', required: true },
        { name: 'total', type: 'integer', required: true },
        { name: 'ordered_at', type: 'datetime', required: true }
      ]
    });
    await p.post(`${D}/table/orders/row`, {
      rows: [
        {
          customer: 'Ana Gómez',
          items: '2 croissants, 1 pan de bono',
          total: 14500,
          ordered_at: today(8, 10)
        },
        {
          customer: 'Carlos Ruiz',
          items: '1 torta de chocolate',
          total: 62000,
          ordered_at: today(10, 45)
        },
        {
          customer: 'Laura Méndez',
          items: '6 almojábanas, 2 cafés',
          total: 27000,
          ordered_at: today(12, 5)
        },
        {
          customer: 'Jorge Pérez',
          items: '1 pan francés, 1 jugo',
          total: 9500,
          ordered_at: today(16, 30)
        }
      ]
    });
  },

  'products-table': async ({ p }) => {
    await createDatabase(p);
    await p.post(`${D}/table`, {
      name: 'productos',
      label: 'Productos',
      access: 'read',
      columns: [
        { name: 'nombre', type: 'text', required: true, unique: true },
        { name: 'precio', type: 'integer', required: true },
        {
          name: 'categoria',
          type: 'enum',
          values: ['pizza', 'bebida', 'postre'],
          required: true
        }
      ]
    });
    await p.post(`${D}/table/productos/row`, {
      rows: [
        { nombre: 'Margherita', precio: 32000, categoria: 'pizza' },
        { nombre: 'Pepperoni', precio: 36000, categoria: 'pizza' },
        { nombre: 'Hawaiana', precio: 35000, categoria: 'pizza' },
        { nombre: 'Cuatro quesos', precio: 38000, categoria: 'pizza' },
        { nombre: 'Limonada', precio: 9000, categoria: 'bebida' },
        { nombre: 'Tiramisú', precio: 15000, categoria: 'postre' }
      ]
    });
  },

  'order-desk': async ({ session }) => {
    await publishEditorVersion(
      session,
      { 'index.js': ORDER_DESK },
      ORDER_DESK_MANIFEST
    );
  },

  // A weather action that worked until the service moved its path, with a few
  // failed calls in its logs.
  'weather-broken': async ({ session, slug }) => {
    await publishEditorVersion(
      session,
      { 'index.js': WEATHER },
      WEATHER_MANIFEST,
      {
        allowedHosts: ['geocoding-api.open-meteo.com', 'api.open-meteo.com']
      }
    );
    for (const city of ['Bogotá', 'Medellín', 'Cali']) {
      await mcp(slug, 'tools/call', {
        name: 'current-weather',
        arguments: { city }
      }).catch(() => {});
    }
  }
};
