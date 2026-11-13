---
title: Cal.com
description: Consulta disponibilidad y reserva o cancela reuniones en una cuenta de Cal.com conectada.
order: 45
updated: 2026-11-13
---

La integración de **Cal.com** le permite a tu asistente agendar a través de una
cuenta de Cal.com — encontrar un tipo de reunión reservable, consultar los
espacios libres y crear o cancelar reservas. Ofrece **4 herramientas**. Cal.com
aplica tu disponibilidad, tus márgenes y tus reglas de reserva, así que una
reserva del asistente sigue las mismas reglas que una hecha en tu página de
reservas.

## Conéctala

Cal.com usa una **API key** — no hay paso de inicio de sesión.

1. En Cal.com, crea una API key (en tu configuración de Cal.com, en la sección
   de desarrolladores / API keys) y cópiala.
2. En Ganju, abre **Herramientas → Catálogo**, elige la tarjeta **Cal.com** y
   luego **Agregar API key de Cal.com**.
3. Pega la llave y **Guardar**. La validamos con Cal.com antes de guardarla; se
   guarda cifrada y no vuelve a mostrarse.
4. Enciende las herramientas que quieras y elige los valores por defecto de
   abajo.

Para cambiar la llave después, usa **Actualizar API key**; **Desconectar** la
quita.

![El diálogo de la clave de API de una integración, con Cancelar y Guardar](/images/tools-api-key-dialog.webp)

## Valores por defecto de la integración

Con la llave guardada y al menos una herramienta de Cal.com encendida, el
encabezado del grupo muestra dos ajustes para todas las herramientas de Cal.com
(una que enciendas después los hereda):

- **Tipo de evento por defecto** — el tipo de reunión sobre el que se crean las
  reservas, por ejemplo "30 Min Meeting (30 min)", salvo que la llamada indique
  otro.
- **Zona horaria por defecto** — se usa para consultar disponibilidad y como
  zona horaria de reserva del invitado cuando la conversación no revela la suya.
  Sin una, se usa la zona de tu perfil de Cal.com.

![Cal.com conectado: actualizar la clave de API, Desconectar, tipo de evento y zona horaria por defecto, y las herramientas](/images/tools-calcom-defaults.webp)

## Herramientas

Los nombres entre paréntesis son los que muestran los clientes MCP y los
registros.

- **Listar tipos de evento** (`calcom-list-event-types`) — lista los tipos de
  reunión reservables de la cuenta con el ID, el título, la duración y el slug
  de cada uno.
- **Listar espacios disponibles** (`calcom-list-available-slots`) — encuentra
  horarios de inicio libres entre `start` y `end` (ISO 8601, UTC). `eventTypeId`
  y `timeZone` (IANA, para las horas devueltas) son opcionales.
- **Crear reserva** (`calcom-create-booking`) — reserva un `start` (uno de los
  horarios que devolvió Listar espacios disponibles) para el `name` y el `email`
  de un invitado. Opcionales: `attendeeTimeZone` — la zona de su confirmación y
  sus recordatorios, que el asistente pasa siempre que sepa dónde está —,
  `notes` y `eventTypeId`. En una conversación de canal, el nombre y el correo
  vienen de la persona. Devuelve el UID de la reserva y su estado.
- **Cancelar reserva** (`calcom-cancel-booking`) — cancela una reserva por
  `bookingUid`, con un `reason` opcional que ve el invitado, a quien se le
  notifica.

El flujo típico es **Listar espacios disponibles → Crear reserva**.

## Acciones sensibles

Con [Confirmar acciones sensibles](/es/docs/settings/#confirmar-acciones-sensibles)
encendido, el asistente pregunta antes de **Crear reserva** y **Cancelar
reserva**. Las dos herramientas de listado se ejecutan sin preguntar.

## Solución de problemas

- **"Invalid Cal.com API key (or Cal.com could not be reached)".** La llave se
  rechazó al guardarla. Cópiala de nuevo desde Cal.com, sin espacios.
- **"No pudimos cargar los tipos de evento. Revisa la API key e inténtalo de
  nuevo."** La llave dejó de funcionar; usa **Actualizar API key**.
- **"Error: no event type".** Elige un **Tipo de evento por defecto**, o pídele
  al asistente que use uno específico.
- **"Cal.com is not connected".** La llave se quitó. Agrégala de nuevo desde la
  tarjeta.

La API key solo la usan estas herramientas; las
[funciones](/es/docs/tools/functions/) no pueden tomarla prestada. Para llamar a
Cal.com desde tu propio código, guarda una llave como secreto de la función.

¿Prefieres administrar un Google Calendar directamente? Mira
[Google Calendar](/es/docs/tools/google-calendar/).
