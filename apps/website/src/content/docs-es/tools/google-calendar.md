---
title: Google Calendar
description: Crea y administra eventos, invita asistentes y encuentra espacios libres en una cuenta de Google conectada.
order: 44
updated: 2026-11-13
---

La integración de **Google Calendar** le permite a tu asistente leer y
administrar una agenda en una cuenta de Google conectada: listar calendarios,
revisar y editar eventos, y encontrar tiempo libre para reunirse. Ofrece **6
herramientas**, y el calendario y la zona horaria que usan los defines una sola
vez, para toda la integración.

## Conéctala

1. Abre **Acciones → Catálogo** y elige la tarjeta **Google Calendar**.
2. Elige **Conectar Google Calendar**, escoge la cuenta de Google y aprueba.
3. Enciende las herramientas que quieras y define los valores por defecto de
   abajo.

Al conectar se le piden a Google `calendar.readonly` (calendarios, eventos y
disponibilidad) y `calendar.events` (crear, cambiar y eliminar eventos).

## Valores por defecto de la integración

Con la integración conectada y al menos una herramienta de calendario
encendida, el encabezado del grupo muestra tres ajustes que aplican a todas las
herramientas de calendario (una que enciendas después los hereda):

- **Calendario por defecto**: el calendario que usan los eventos y las
  consultas de disponibilidad, salvo que la llamada indique otro. Mientras no
  elijas uno, se usa el calendario principal de la cuenta.
- **Zona horaria por defecto**: cómo se interpretan las horas de los eventos, y
  la zona del horario laboral de Buscar espacios libres. Sin una, se usa la zona
  configurada en Google Calendar.
- **Notificaciones a invitados**: si Google envía correo a los invitados cuando
  se crean, cambian o cancelan eventos: **Notificar a todos**, **Notificar solo
  a invitados externos** o **No enviar notificaciones**.

![Google Calendar conectado: calendario por defecto, zona horaria por defecto, notificaciones a invitados y las herramientas](/images/tools-calendar-defaults.webp)

## Ajustes por herramienta

Tres herramientas tienen ajustes extra, bajo el ícono de lápiz (**Configurar**)
de su fila:

**Crear evento**

- **Duración por defecto (minutos)**: se usa cuando un evento no tiene hora de
  fin (60 si no la defines).
- **Agregar un enlace de Google Meet**: adjunta una conferencia de Meet a cada
  evento nuevo.
- **Ubicación por defecto**: se usa cuando la llamada no indica ninguna.
- **Visibilidad**: **La del calendario**, **Público** o **Privado**.

**Listar eventos**

- **Máximo de resultados por defecto**: cuántos eventos devuelve una llamada
  que no lo indica (1–50; 10 si no lo defines).
- **Ventana por defecto (días)**: sin hora de fin, lista los eventos de estos
  días hacia adelante.

**Buscar espacios libres** (tu política de reservas):

- **Inicio del horario laboral (0–23)** y **Fin del horario laboral (1–24)**:
  horas locales, en la zona horaria por defecto (o la configurada en Google
  Calendar).
- **Días laborales**: qué días de la semana cuentan.
- **Duración del espacio por defecto (minutos)**: el hueco más corto que vale
  la pena devolver.
- **Margen entre reuniones (minutos)**: tiempo libre que se reserva alrededor
  de cada bloque ocupado.
- **Antelación mínima (horas)**: nada antes de este tiempo a partir de ahora.
- **Antelación máxima (días)**: nada más lejos que esto.

## Herramientas

Los nombres entre paréntesis son los que muestran los clientes MCP y los
registros. Todas menos Listar calendarios aceptan un `calendarId` opcional para
usar otro calendario distinto al predeterminado.

- **Listar calendarios** (`calendar-list-calendars`): lista cada calendario de
  la cuenta con su ID, nombre, zona horaria, rol de acceso y si es el
  principal.
- **Listar eventos** (`calendar-list-events`): lista los eventos entre
  `timeMin` y `timeMax` (ISO 8601), con los recurrentes expandidos en
  ocurrencias individuales, ordenados por inicio. `timeMin` es ahora si no
  lo indicas; `query` busca en el texto de los eventos; `maxResults` de 1 a 50, 10
  por defecto. Devuelve título, inicio, fin, ubicación e ID del evento.
- **Crear evento** (`calendar-create-event`): agrega un evento. Necesita
  `summary` y `startTime`; da `endTime` o `durationMinutes`, o se aplica la
  duración por defecto. Las horas son la hora local que se quiere decir (por
  ejemplo `2026-09-30T15:00:00`) en la zona del evento; el modelo convierte
  "mañana a las 7am" a ese formato. `description`, `location`, `timeZone`
  (IANA) y `attendees` (correos, que reciben una invitación) son opcionales.
  Devuelve el ID del evento y un enlace.
- **Actualizar evento** (`calendar-update-event`): cambia un evento por
  `eventId`; solo cambian los campos que se pasan (`summary`, `startTime`,
  `endTime`, `description`, `location`, `timeZone`, `attendees`). Pasar
  `attendees` **reemplaza** toda la lista de invitados.
- **Eliminar evento** (`calendar-delete-event`): borra para siempre un evento
  por `eventId`; los invitados reciben aviso según **Notificaciones a
  invitados**.
- **Buscar espacios libres** (`calendar-find-free-slots`): devuelve los huecos
  libres entre `timeMin` y `timeMax` (ambos obligatorios), según la
  disponibilidad de Google, después de aplicar tu política de reservas.
  `durationMinutes` pide huecos de al menos esa duración.

El flujo típico es **Buscar espacios libres → Crear evento**.

## Acciones sensibles

Con [Confirmar acciones sensibles](/es/docs/settings/#confirmar-acciones-sensibles)
encendido, el asistente pregunta antes de **Crear evento**, **Actualizar
evento** y **Eliminar evento**, porque cada uno puede enviarles correo a los
invitados. Las tres herramientas de lectura se ejecutan sin preguntar.

## Usa la conexión desde tu propio código

Una [función](/es/docs/tools/functions/) puede llamar a la API de Google
Calendar con la misma conexión: agrega `google-calendar` a sus conexiones y
llama a `ctx.connection('google-calendar')`.

## Solución de problemas

- **"No pudimos cargar los calendarios. Vuelve a conectar Google Calendar e
  inténtalo de nuevo."** La conexión venció; conecta de nuevo desde la tarjeta.
- **"Google Calendar credential not connected".** La integración se desconectó.
- **Los eventos quedan corridos una hora.** Define una **Zona horaria por
  defecto**, o dile al asistente la zona; una hora con `Z` o con desfase se toma
  como ese instante exacto.
- **"No free slots: the search window is empty after applying the booking
  policy".** La antelación mínima o máxima recortó toda la ventana. Pide otro
  rango o flexibiliza la política.

¿Prefieres reservar a través de una página de agendamiento? Mira
[Cal.com](/es/docs/tools/calcom/).
