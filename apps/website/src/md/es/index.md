# Ganju — Conecta tu IA con tus archivos, herramientas y apps

Ganju permite que asistentes de IA como Claude, ChatGPT y Gemini — y tus bots en
Telegram, Slack, WhatsApp y Discord — usen de forma segura tus propios
documentos, herramientas y aplicaciones. Tu IA responde con tu información y
hace trabajo real. Se configura en minutos, sin programar. Código abierto bajo
licencia Apache-2.0.

> Esta es la versión en español de nuestra [página principal](/).

## Qué hace

- **Sin instalación, sin servidores** — creas una conexión y queda activa al instante; Ganju aloja y opera todo.
- **Respuestas con tu contenido** — sube archivos, agrega un sitio web o conecta Google Drive / OneDrive; tu IA busca en todo.
- **Herramientas que tu IA puede usar** — correo, calendario, búsqueda web, Slack, o tus propias apps y servicios, sin escribir código.
- **Llévalo a tus apps de chat** — convierte la misma configuración en un bot en Telegram, Slack, WhatsApp o Discord.
- **Pensado para equipos** — proyectos, compañeros de equipo y permisos por rol desde el primer día.
- **Mira todo lo que hace** — cada pregunta, acción y mensaje queda registrado.
- **Agrega tus propias herramientas** — ¿necesitas algo que no traemos? La describes, completas qué hace y le das a Deploy; nosotros la ejecutamos.

## Cómo funciona

1. **Crea tu espacio de trabajo** — regístrate y empieza un proyecto.
2. **Agrega tu contenido y tus herramientas** — sube documentos, conecta un drive o un sitio web, activa herramientas.
3. **Conecta tu IA** — enlaza Claude, OpenAI o Gemini en un par de clics.
4. **Compártelo con tu equipo** — agrégalo como bot en tus apps de chat.

## Funciones — agrega tus propias herramientas

Una **función** es una herramienta pequeña que le agregas a tu asistente: buscar
algo en tu propio sistema, calcular algo, disparar un proceso en otro lado. La
describes, completas lo que hace y le das a Deploy — nosotros la ejecutamos, sin
servidor que administrar y sin instalar nada. Es una característica Pro; en Free,
`http-endpoint` apunta a tu propia aplicación sin nada de código.

1. **Descríbela** — ponle un nombre y di cuándo debería usarla tu asistente. El
   código inicial se escribe solo.
2. **Completa qué hace** — el editor sugiere lo que hay disponible mientras
   escribes y subraya los errores donde están.
3. **Pruébala en privado** — dale a Run con un ejemplo y mira qué devuelve. Nadie
   más puede llamarla y tu asistente en vivo sigue igual.
4. **Despliégala, o deshaz** — un botón la pone en vivo en todo lo que usa tu
   asistente, y todas las versiones se guardan, así que volver atrás es un clic.

Una herramienta completa, de principio a fin — lee una llave guardada, le
pregunta por un pedido al sistema de una tienda, avisa claro cuando ese pedido
no existe y devuelve una respuesta ordenada para el asistente:

```js
import { createHandler, defineTool } from './ganju-sdk.js';

export default createHandler({
  'lookup-order': defineTool(async (input, ctx) => {
    const key = await ctx.secret('SHOP_API_KEY');

    const res = await fetch(
      `https://api.mystore.com/v1/orders/${input.orderId}`,
      { headers: { authorization: `Bearer ${key}` } }
    );

    if (res.status === 404) {
      return { found: false, message: `No order ${input.orderId}.` };
    }
    if (!res.ok) throw new Error(`The shop answered ${res.status}`);

    const order = await res.json();
    ctx.log('looked up', order.id, order.status);

    return {
      found: true,
      status: order.status,
      placedOn: order.created_at,
      eta: order.shipping?.estimated_delivery ?? null,
      tracking: order.shipping?.tracking_url ?? null
    };
  })
});
```

Tu herramienta no tiene que hacerlo todo sola. Lo difícil y lo delicado se le
entrega hecho, para que lo que escribes se quede pequeño:

- **Actuar con tus cuentas conectadas** — `ctx.connection()` envía desde la cuenta
  de Gmail o de Slack que ya conectaste. Las contraseñas y los tokens se quedan
  en el servidor.
- **Usar una llave guardada** — `ctx.secret()` lee una llave de API que pegaste en
  Settings. Cifrada, y nunca se muestra de vuelta.
- **Buscar en tus documentos** — `ctx.resources.search / read / list`, sobre los
  mismos archivos con los que responde tu asistente.
- **Guardar algo de vuelta** — `ctx.resources.create()` escribe un reporte o una
  nota en el proyecto.
- **Enviar un adjunto de verdad** — `ctx.sendFile()` manda por correo o publica un
  archivo de hasta 40MB sin que pase por tu herramienta.
- **Llamar a cualquier sitio o API** — `fetch()`, con las direcciones internas
  siempre bloqueadas y una lista opcional de hosts permitidos.

Escríbela en el navegador, o desde la terminal si tus herramientas viven en un
repositorio:

```bash
npm install -g @ganju/cli
ganju init my-tools && cd my-tools
ganju login && ganju link
ganju deploy
```

Uso justo, en números claros: 5 segundos por ejecución más el timeout que elijas,
60 llamadas por minuto por herramienta y 1.000.000 de llamadas al mes incluidas
en Pro — solo cuentan las herramientas que escribiste tú. Documentación:
https://ganju.ai/es/docs/tools/functions y https://ganju.ai/es/docs/tools/cli

## Integraciones

Gmail, Outlook, Slack, Google Calendar, Cal.com, búsqueda web, Google Drive,
OneDrive, Notion, GitHub — además de `http-endpoint` (conecta tu propia
aplicación) y `mcp-proxy` (enchufa otros servicios ya listos). Sin código.

## Enlaces

- App: https://app.ganju.ai
- Documentación: https://ganju.ai/docs
- Precios: https://ganju.ai/pricing
- Código fuente: https://github.com/MontoyaAndres/ganju
- Privacidad: https://ganju.ai/es/privacidad
- Términos: https://ganju.ai/es/terminos
