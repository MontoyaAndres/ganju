---
title: Configuración
description: 'La sala de control de tu organización: cámbiale el nombre, administra la facturación y el consumo, invita miembros, crea tokens de acceso, trae tus propios modelos de lenguaje y maneja las acciones destructivas.'
order: 6
updated: 2026-11-25
---

**Ajustes** es la sala de control de tu organización. Ábrelo desde el menú de tu
avatar, abajo en la barra lateral (**Ajustes**), o con **Ajustes** en la tarjeta
de una organización en la página **Organizaciones**. Un submenú a la izquierda
salta entre cada área:

| Sección                                       | Qué hay                                                                           | Quién la ve                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| [**Organización**](#organización)             | Nombre, conteos, **Confirmar acciones sensibles**                                 | Miembros de la organización                           |
| [**Plan y facturación**](#facturación-y-plan) | Plan, prueba, consumo, gestionar la facturación, límite de créditos del Asistente | Miembros de la organización                           |
| [**Miembros**](#miembros)                     | Quién está en la organización, invitaciones                                       | Miembros de la organización                           |
| [**Proyectos**](#proyectos)                   | Los miembros y los tokens de acceso de cada proyecto                              | Todos                                                 |
| [**Modelos**](#modelos-trae-el-tuyo)          | Tus propios modelos de lenguaje                                                   | Miembros de la organización                           |
| [**Tus datos**](#tus-datos)                   | Exporta tus datos personales, Términos y Privacidad                               | Todos                                                 |
| [**Zona de riesgo**](#zona-de-riesgo)         | Eliminar la organización, eliminar tu cuenta                                      | Todos (eliminar la organización: solo el propietario) |

Quien está solo en un proyecto, y no en la organización, ve únicamente
**Proyectos**, **Tus datos** y **Zona de riesgo**.

## Organización

La sección **Organización** muestra cuándo se **Creó**, cuántos **Proyectos** y
**Miembros** tiene, y te deja cambiar el **Nombre de la organización** (de 3 a
100 caracteres) → **Guardar cambios**.

![Configuración, Organización: fecha de creación, proyectos y miembros, el nombre y Confirmar acciones sensibles](/images/settings-organization.webp)

### Confirmar acciones sensibles

Viene desactivado. Actívalo (**La confirmación está activada**) y el asistente le
pregunta a la persona antes de cualquier acción que llegue a otra persona o que
no se pueda deshacer, y solo la ejecuta si responde que sí. Aplica a todos los
proyectos de la organización.

- **En los canales** (Telegram, WhatsApp, Slack, Discord), el bot retiene la
  llamada y pregunta en el chat. Debajo de su pregunta lista exactamente lo que
  ejecutará un sí (la herramienta y cada argumento), escrito por la plataforma,
  no por el modelo. Solo la persona a la que se le preguntó puede responder. Un
  sí dentro de 30 minutos ejecuta esas llamadas guardadas; cualquier otra cosa,
  incluso "sí, pero cambia la hora", las descarta. Los chats privados de
  Telegram, Discord y WhatsApp ofrecen botones **Sí / No**; en los demás la
  respuesta se escribe.
- **En los clientes MCP** (Claude, Cursor, ChatGPT), la primera llamada vuelve
  como _todavía no ejecutada_ con un token de un solo uso. El asistente pregunta
  en su propio chat y, si le dicen que sí, vuelve a llamar con el token. Solo
  sirve para esos mismos argumentos, una vez, dentro de 10 minutos.

**Qué cuenta como sensible** sale de las
[anotaciones MCP](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-annotations)
de cada herramienta: se confirma todo lo que no esté marcado como de solo
lectura (`readOnlyHint: true`) o seguro de deshacer (`destructiveHint: false`).

- **Las herramientas integradas** ya vienen marcadas. Buscar, listar y leer se
  ejecutan de inmediato. Enviar o reenviar correo, publicar en Slack, crear,
  cambiar o borrar eventos y reservas, y borrar correos o borradores se
  confirman.
- **[Endpoints HTTP](/es/docs/tools/http-endpoints/)**: elige **Qué hace** en el
  diálogo del endpoint. Si lo dejas vacío, un `GET` cuenta como lectura y
  cualquier otro método se confirma.
- **[Funciones](/es/docs/tools/functions/)**: cada función declara sus
  `annotations`; los desarrolladores las definen en `ganju.json`. El
  [ejemplo del mostrador de pedidos](/es/docs/tools/examples/#order-desk) muestra
  una herramienta de cada tipo.
- **Los servidores MCP conectados** usan las anotaciones que declara el servidor
  remoto, y puedes marcar cuáles de sus herramientas solo leen.

Una herramienta que no declara nada se trata como una que puede cambiar cosas,
así que se confirma en cada llamada, incluso las consultas. `ganju build` te
avisa.

Lo que no hace: al asistente de un cliente MCP se le indica que pregunte, pero el
servidor nunca ve las palabras de la persona, solo la segunda llamada. Evita que
una acción sensible ocurra en un solo paso, no que un asistente decidido se salte
la pregunta.

**Después de contenido externo, diga lo que diga este ajuste.** Cuando la sesión
de un cliente MCP ya leyó contenido externo (un correo, una página web, la
respuesta de otro servidor), una acción sensible necesita la aprobación de la
propia persona en el panel. Mira
[Clientes MCP → Aprobar acciones](/es/docs/mcp/#aprobar-acciones).

## Facturación y plan

**Plan y facturación** muestra el plan de tu organización, su fecha de
renovación y tu consumo frente a cada cupo. Una organización está en uno de estos
estados:

- **Prueba de Pro**: toda organización nueva puede empezar una
  [prueba gratis de Pro de 7 días](#la-prueba-gratis-de-7-días). La página
  muestra los días que quedan, la fecha en que termina la prueba y **Empezar Pro
  ahora**.
- **Plan Pro** o **Plan Enterprise**: **Gestionar la facturación** abre el
  portal de facturación (de Polar, nuestro proveedor de pagos): método de pago,
  facturas, cancelación y tu próximo cobro con el consumo hasta hoy. Si el plan
  va a terminar, dice **Tu plan termina el …**.
- **Sin plan**: la organización nunca empezó su prueba, o la prueba o el plan
  terminaron. La página explica qué está apagado y ofrece **Empezar prueba
  gratis de 7 días**, o **Empezar Pro** si ya usaste tu prueba. Mira
  [Sin plan](#sin-plan).

Un plan **Enterprise** pagado por transferencia dice que **se factura según tu
acuerdo** con Ganju, con el consumo de este periodo abajo.

![Plan y facturación en Pro: el uso del mes, los créditos del asistente, los créditos extra al mes y el aviso por correo de acciones rotas](/images/settings-billing-pro.webp)

### La prueba gratis de 7 días

Justo después de crear una organización, Ganju te ofrece **Empieza tu prueba
gratis de 7 días**:

- **Empezar prueba gratis** abre el pago. Agregas una tarjeta, pero no se cobra
  nada durante la prueba. Cuando termina, Pro empieza solo a 29 USD al mes más
  el consumo, a menos que canceles antes. Polar te envía un recordatorio por
  correo 3 días antes de que termine la prueba.
- **Ahora no** deja la organización [sin plan](#sin-plan). Puedes empezar la
  prueba después desde **Plan y facturación**.

Hay una prueba por persona: es del propietario de la organización. Otra
organización que crees después empieza pagada.

Durante la prueba tienes todo lo de Pro, con estos topes:

- **300 respuestas del bot con el modelo de IA de Ganju**. Las respuestas con tu
  [propio modelo](#modelos-trae-el-tuyo) no cuentan para este tope.
- **300 créditos del Asistente**, sin créditos extra.
- No se cobra consumo adicional.

Un aviso arriba de cada página muestra cuántos días de prueba quedan. Para quitar
los topes antes, selecciona **Empezar Pro ahora** en **Plan y facturación**: la
prueba termina, se cobra el primer mes a tu tarjeta y los topes desaparecen.

### Sin plan

Una organización sin plan conserva todo lo que construyó, y puedes seguir
editándola dentro de estos límites: **1 proyecto**, **7 herramientas**, **3
prompts** y **1 canal**, sin archivos nuevos. Pero nada funciona:

- Los bots no responden. El propietario y los administradores reciben un correo
  al respecto, como mucho una vez al día.
- El servidor MCP de la organización rechaza las solicitudes.
- El [Asistente](/es/docs/assistant/), [Datos](/es/docs/data/), las
  [funciones](/es/docs/tools/functions/), la sincronización automática de
  recursos y las subidas que necesitan indexarse están apagados.

Empieza la prueba, o Pro, desde **Plan y facturación** para volver a encender
todo.

### Qué significa cada fila

| Fila                                  | Cuenta                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Respuestas del asistente este mes** | Las respuestas de tu bot en todos los canales. Los mensajes que entran son gratis.                                                                     |
| **De esas, con nuestro modelo de IA** | Las respuestas que usaron el modelo compartido de Ganju en vez de uno tuyo.                                                                            |
| **Contenido indexado (RAG)**          | El texto consultable de tus recursos.                                                                                                                  |
| **Llamadas a tus funciones**          | Llamadas a [funciones](/es/docs/tools/functions/), es decir, tu propio código. Las integraciones del catálogo y los servidores MCP remotos no cuentan. |
| **Créditos del asistente**            | Lo que usaron el [Asistente](/es/docs/assistant/) y su chat de prueba.                                                                                 |
| **Almacenamiento de archivos**        | Los archivos subidos.                                                                                                                                  |
| **Proyectos**                         | Los proyectos de la organización.                                                                                                                      |

Pasado un cupo incluido, la fila muestra cuánto te pasaste y la tarifa a la que
se cobra. Cuando la organización tuvo notas de voz en el periodo, una línea bajo
las filas muestra cuántas (transcribirlas va incluido; solo cuenta la
respuesta). Un bloque **Datos** muestra el almacenamiento de bases de datos del
periodo, las filas escritas y leídas, las solicitudes y las ejecuciones de
disparadores. Se miden, pero todavía no se cobran: Datos va incluido en tu plan.

### Créditos del Asistente

El Asistente se cobra en **créditos**: Pro y Enterprise incluyen 1.000 al mes
(300 durante la prueba). Debajo de la fila de créditos:

- **Créditos extra al mes**: cuántos créditos más allá de los incluidos puede
  usar la organización, a 2 USD por cada 100. **2.000** por defecto; **0** se
  detiene en los incluidos. Selecciona **Guardar**. Los créditos extra empiezan
  con Pro, no durante la prueba.
- **Avisar por correo al dueño y a los administradores cuando una acción de un
  proyecto deja de funcionar**: un interruptor para el aviso que se envía
  cuando una acción que armó el Asistente sigue fallando.

Si el Asistente funciona con la clave de Anthropic de tu organización (elegida en
la pestaña Asistente, en **Pagar con**, a partir de un modelo Claude de
[Modelos](#modelos-trae-el-tuyo)), no gasta créditos; solo los usa su chat de
prueba como cliente.

### Compara los planes

|                                        | **Pro**                                              | **Enterprise**         |
| -------------------------------------- | ---------------------------------------------------- | ---------------------- |
| Precio                                 | **29 USD / mes** más el consumo                      | A medida               |
| Respuestas del asistente incluidas     | **3.000 / mes** (hasta 1.000 con el modelo de Ganju) | Condiciones a medida   |
| Pasadas las respuestas incluidas       | Sigue funcionando y se cobra como consumo adicional  | Condiciones a medida   |
| Contenido indexado (RAG)               | 1 GB, luego 2 USD / GB                               | Condiciones a medida   |
| Almacenamiento de archivos             | Ilimitado                                            | Ilimitado              |
| Proyectos                              | Ilimitados                                           | Ilimitados             |
| Prompts por proyecto                   | Ilimitados                                           | Ilimitados             |
| Herramientas activadas por proyecto    | 40                                                   | 40                     |
| Endpoints HTTP por proyecto            | Ilimitados                                           | Ilimitados             |
| Canales por proyecto                   | Ilimitados                                           | Ilimitados             |
| Sincronización automática de recursos  | Cada día o cada semana                               | Cada día o cada semana |
| [Asistente](/es/docs/assistant/)       | ✓ 1.000 créditos / mes incluidos                     | ✓                      |
| [Datos](/es/docs/data/)                | ✓ hasta 50 tablas, 9 GB por base de datos            | ✓                      |
| [Funciones](/es/docs/tools/functions/) | ✓ 1.000.000 de llamadas / mes incluidas              | ✓                      |
| Invitar miembros del equipo            | ✓                                                    | ✓                      |
| Traer tu propio modelo                 | ✓                                                    | ✓                      |

La [prueba de 7 días](#la-prueba-gratis-de-7-días) es Pro con 300 respuestas con
el modelo de Ganju y 300 créditos del Asistente.

**Enterprise** es un plan a medida para organizaciones más grandes: todo lo de
Pro sin límites de proyectos, herramientas, prompts ni canales, una dirección web
y herramientas a medida, y un contacto con nombre para el soporte. El precio, los
cupos y las condiciones del contrato se acuerdan directamente.
[Habla con ventas](/es/contacto/).

### Cómo funciona de verdad la cuota de mensajes

El único número que hay que entender es el de **respuestas del asistente**. Solo
cuentan las _respuestas_ de tu asistente; los mensajes que envían los usuarios
siempre son gratis.

Cada plan incluye un cupo de respuestas que corren con el **modelo compartido de
Ganju**. Como Ganju paga esa inferencia, el modelo compartido es un _cupo_, no
algo ilimitado:

- **Pro**: 3.000 respuestas al mes incluidas, de las cuales hasta **1.000
  pueden correr con el modelo compartido**. Pasadas esas 1.000, las respuestas
  compartidas siguen funcionando y se cobran a la tarifa compartida, más alta.
  Agregar tu propia clave de proveedor en [Modelos](#modelos-trae-el-tuyo) las
  pasa a la tarifa con clave propia, mucho más barata. Es lo que hace la
  mayoría cuando ya maneja volumen real. La página de facturación te lleva
  directo (**conecta tu propio modelo**).
- **Prueba**: hasta 300 respuestas con el modelo compartido, sin consumo
  adicional. Las respuestas con tu propia clave de modelo no cuentan para este
  tope.

### Consumo adicional (Pro)

Pro no suma nada a tu factura hasta que superas los cupos incluidos:

- **Respuestas extra con tu propia clave de modelo**: 2 USD por cada 1.000. Es
  una **tarifa de plataforma** por correr las herramientas y el cómputo de cada
  turno, _no_ una reventa de tokens del modelo (a tu proveedor le pagas
  directamente con tu clave).
- **Respuestas extra con el modelo de Ganju**: 15 USD por cada 1.000 más allá de
  las primeras 1.000. Más alta porque Ganju compra la inferencia por ti, así que
  esta tarifa cubre un costo real y no solo el trabajo de la plataforma.
- **Contenido indexado (RAG) extra**: 2 USD por GB más allá del 1 GB incluido.
  El contenido consultable se guarda con un índice de búsqueda varias veces más
  grande que el propio contenido, por eso cuesta más por GB que el
  almacenamiento de archivos (que es gratis).
- **Llamadas extra a herramientas que escribiste**: 5 USD por millón más allá
  del 1.000.000 incluido. Aquí solo cuenta tu propio código; las llamadas a las
  integraciones que trae Ganju, y a los servidores MCP remotos que conectes, van
  incluidas.
- **Créditos extra del [Asistente](/es/docs/assistant/)**: 2 USD por cada 100
  más allá de los 1.000 incluidos, hasta el límite que pongas en **Créditos extra
  al mes**.
- **Dominio propio**: complemento de 15 USD / mes.

### Si un pago falla o cancelas

Mientras una suscripción está activa, en prueba o con el pago atrasado, todo
sigue funcionando. Una vez cancelada o impaga, la organización queda
[sin plan](#sin-plan): no se borra nada de lo que construiste, pero sus bots y lo
demás dejan de funcionar hasta que vuelva a tener un plan.

> ¿Prefieres tu propio servidor? Ganju es Apache-2.0, así que puedes
> [instalarlo tú mismo](/es/docs/deploy/) gratis y usar tus propias claves.

## Miembros

**Miembros** lista a todos en la organización, con **Tú** junto a tu nombre y
**Propietario** junto a quien la creó; todos los demás son administradores
(ADMIN).

- **Invita a alguien de tu equipo por correo** y luego **Invitar**. Recibe un
  correo y acepta la invitación dentro de la app cuando inicia sesión con esa
  dirección. Las invitaciones vencen a los 7 días.
- **Invitaciones pendientes** muestra quién no ha respondido; **Revocar la
  invitación** cancela una.
- **Quitar miembro** saca a alguien de inmediato.

Invitar miembros es una función de **Pro**. También puedes invitar desde la
tarjeta de una organización en la página **Organizaciones** (**Invitar**).

![Configuración, Miembros: el dueño y un administrador, y el campo para invitar por correo](/images/settings-members.webp)

## Proyectos

**Proyectos** lista los proyectos de la organización. Cada proyecto tiene:

- **Abrir →**: ve al proyecto.
- **Miembros**: la lista de miembros propia del proyecto, con las mismas
  acciones de invitar, quitar y revocar. Los miembros de un proyecto pueden
  abrirlo aunque no estén en la organización.
- **Tokens de acceso**: credenciales duraderas para el
  [`ganju` CLI](/es/docs/tools/cli/) en máquinas que no pueden abrir un
  navegador.

![Configuración, Proyectos: cada proyecto con Miembros, Tokens de acceso y Abrir](/images/settings-members.webp)

### Tokens de acceso

Un token actúa como tú, sobre ese proyecto y nada más. Sirve para un job de CI, un
contenedor o un servidor al que llegas por SSH.

1. En el proyecto, abre **Tokens de acceso**.
2. Completa **Para qué es** (por ejemplo, "GitHub Actions, despliegue"). Es lo
   único con lo que alguien podrá decidir si revocarlo rompe un despliegue.
3. Elige **Caduca**: **En 30 días**, **En 90 días**, **En un año** o **Nunca**.
4. Selecciona **Crear token**, copia el valor y selecciona **Ya lo copié**. Se
   muestra **una sola vez**: Ganju solo guarda un hash.

Configúralo como `GANJU_API_TOKEN` donde se ejecute el CLI; `ganju deploy`
funciona con él sin cambiar nada. Cada token muestra cuándo se usó por última vez
y cuándo caduca; **Revocar token** lo detiene de inmediato. Un token cuyo
propietario fue eliminado aparece como **Inactivo** y ya no funciona. Revócalo y
crea uno nuevo.

![Los tokens de acceso de un proyecto: para qué es, vencimiento y Crear token](/images/settings-access-tokens.webp)

Lo mismo desde una terminal, en una carpeta vinculada al proyecto:

```bash
ganju token create "GitHub Actions" --expires 90   # días, o "never"
ganju token list
ganju token revoke "GitHub Actions"
```

Un token no puede crear otros tokens: ejecuta `ganju token create` con un inicio
de sesión desde el navegador (`ganju login`).

## Modelos: trae el tuyo

Por defecto tus canales usan el **Modelo por defecto**. En **Modelos** puedes
traer el tuyo. Selecciona **Agregar modelo** y completa:

- **Nombre visible**: una etiqueta para reconocerlo (por ejemplo, "Gemini de
  producción").
- **Modelo**: elige del catálogo: Gemini 3.8 Flash, Gemini 3.1 Pro,
  GPT-5.4 mini, GPT-5.5, Claude Haiku 4.5, Claude Sonnet 5, Claude Opus 5, o
  **Personalizado (compatible con OpenAI)** para cualquier servicio que hable el
  protocolo de chat-completions de OpenAI (una pasarela, un agregador o tu propio
  servidor). Un modelo personalizado también necesita su **ID del modelo** (por
  ejemplo, `anthropic/claude-opus-5`).
- **Clave de API**: tu propia clave de ese proveedor; se guarda cifrada. Al
  editar, déjala vacía para conservar la actual.
- **URL base**: opcional para los modelos del catálogo; obligatoria para uno
  personalizado, y tiene que ser una dirección `https://` pública.
- **Prompt de sistema** _(opcional)_: una instrucción permanente para este
  modelo. Para instrucciones que aplican a todo el bot, usa las
  [Instrucciones del bot](/es/docs/getting-started/channels/#dile-al-bot-cómo-responder)
  del proyecto.

Selecciona **Crear modelo**. Agrega un modelo una vez y reutilízalo en cualquier
[canal](/es/docs/channels/) de la organización: cada canal elige uno de tus
modelos en **Modelo de lenguaje**, o usa el modelo por defecto. Usa **Editar** o
**Quitar** en la fila de un modelo; si un canal lo usa, primero hay que
reasignarlo.

![El formulario Nuevo modelo: nombre, modelo, clave de API, URL base y prompt de sistema](/images/settings-models-new.webp)

## Tus datos

Es personal, no de la organización:

- **Exporta tus datos** → **Descargar mis datos** descarga en JSON todo lo que
  Ganju tiene sobre ti: perfil, métodos de inicio de sesión, sesiones,
  membresías, invitaciones que enviaste y tu registro de aceptación. El contenido
  de la organización (recursos, prompts, conversaciones) le pertenece a la
  organización y se descarga desde sus propias páginas.
- **Términos y privacidad** muestra cuándo aceptaste los Términos y la Política
  de Privacidad vigentes. Si cambiaron, revísalos y selecciona **Acepto**.

## Zona de riesgo

Acciones permanentes. Exporta antes lo que quieras conservar.

- **Eliminar la organización**: borra para siempre la organización y todo lo que
  contiene: cada proyecto, canal, conversación, mensaje, recurso, herramienta y
  modelo de lenguaje. Solo la ve el **Propietario**. Confirma con **Sí, eliminar
  para siempre**.
- **Eliminar tu cuenta**: borra tu perfil, tus métodos de inicio de sesión, tus
  sesiones, tus identidades de chat vinculadas y tu registro de aceptación, y te
  saca de todas las organizaciones y proyectos. Las organizaciones que **te
  pertenecen** hay que eliminarlas o transferirlas primero; la app te las lista
  si queda alguna. Confirma con **Sí, eliminar mi cuenta**.

![La Zona de peligro: Eliminar organización y Eliminar tu cuenta](/images/settings-danger-zone.webp)

## Solución de problemas

- **No encuentro Facturación ni Miembros.** Estás en un proyecto, pero no en la
  organización. Pídele a un miembro de la organización que te invite.
- **Mi bot dejó de responder y un aviso dice que no hay plan.** La prueba
  terminó, o el plan se canceló o quedó impago. Empieza la prueba, o Pro, en
  Plan y facturación. Mira [Sin plan](#sin-plan).
- **El Asistente se detuvo a mitad de mes.** La organización usó sus créditos
  incluidos y sus **Créditos extra al mes**. Un miembro de la organización puede
  subir el límite en Plan y facturación. Durante la prueba no hay créditos
  extra: selecciona **Empezar Pro ahora** para tenerlos.
- **No puedo quitar un modelo.** Algún canal todavía lo usa. Cambia primero el
  **Modelo de lenguaje** de ese canal.
