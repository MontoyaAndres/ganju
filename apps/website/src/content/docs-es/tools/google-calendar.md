---
title: Google Calendar
description: Crea y administra eventos de calendario, invita asistentes y encuentra espacios libres en una cuenta de Google conectada.
order: 44
updated: 2026-07-07
---

La integración de **Google Calendar** le permite a tu asistente leer y administrar
agendas en una cuenta de Google conectada — listar calendarios, recorrer y editar
eventos, y encontrar espacios libres para reunirse. Ofrece **6 herramientas**. La
mayoría actúa sobre el **calendario por defecto** del artefacto, salvo que pases un
`calendarId` específico.

## Conéctala

Google Calendar usa **OAuth de Google**. Las herramientas de lectura piden acceso de
solo lectura; las de crear, actualizar y eliminar piden acceso a los eventos del
calendario.

## Herramientas

- **List Calendars** — lista cada calendario de la cuenta con su ID, nombre, zona
  horaria y rol de acceso. Llámala para encontrar el ID que quieres fijar como
  predeterminado, o para apuntar a un calendario específico.
- **List Events** — lista los eventos en una ventana de tiempo (`timeMin`/`timeMax`,
  ISO 8601), expandiendo los eventos recurrentes en instancias individuales
  ordenadas por inicio. Una `query` opcional hace búsqueda de texto libre; deja
  `timeMin` vacío para que use el momento actual.
- **Create Event** — agrega un evento. Necesita un `summary` y un `startTime`,
  además de un `endTime` o un `durationMinutes`. Opcionalmente define descripción,
  ubicación, zona horaria y `attendees` (a quienes se les envía la invitación por
  correo); se agrega un enlace de Google Meet automáticamente cuando está
  configurado. El modelo convierte lenguaje natural como "mañana a las 7am" a ISO
  antes de llamarla.
- **Update Event** — modifica un evento existente por `eventId` — solo cambian los
  campos que pases. Muévelo con las horas de inicio y fin, o edita el resumen, la
  ubicación o los asistentes. Pasar `attendees` reemplaza la lista completa.
- **Delete Event** — elimina permanentemente un evento por su ID; se notifica a los
  asistentes. Llámala solo cuando el usuario haya decidido claramente cancelar.
- **Find Free Slots** — consulta la disponibilidad entre `timeMin` y `timeMax` para
  devolver los huecos libres, respetando el horario laboral, los márgenes y la
  antelación mínima que tengas configurados. Pasa `durationMinutes` para exigir
  huecos de al menos esa duración. El flujo típico es Find Free Slots → Create
  Event.

¿Prefieres agendar mediante una página de reservas? Mira
[Cal.com](/es/docs/tools/calcom).
