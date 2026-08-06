---
title: Cal.com
description: Consulta disponibilidad y agenda o cancela reuniones en una cuenta de Cal.com conectada.
order: 45
updated: 2026-07-07
---

La integración de **Cal.com** le permite a tu asistente manejar la agenda a través
de una cuenta de Cal.com — encontrar un tipo de reunión reservable, consultar los
espacios libres y crear o cancelar reservas. Ofrece **4 herramientas**. Cada una
actúa sobre el **tipo de evento por defecto** del artefacto, salvo que pases un
`eventTypeId`.

## Conéctala

Cal.com usa una **llave de API**. Pega tu llave una vez al agregar la integración —
no hay paso de OAuth.

## Herramientas

- **List Event Types** — lista las plantillas de reunión reservables de la cuenta
  (por ejemplo, "30 Min Meeting") con el ID, el título, la duración y el slug de
  cada una. Llámala para encontrar el ID del tipo de evento que quieres fijar como
  predeterminado o al que quieres apuntar.
- **List Available Slots** — encuentra los horarios disponibles para un tipo de
  evento entre un `start` y un `end` (ISO 8601, UTC). Pasa un `timeZone` para
  devolver los espacios en esa zona. Úsala para confirmar disponibilidad antes de
  reservar.
- **Create Booking** — reserva un espacio. Recibe un `start` (uno de los horarios
  devueltos por List Available Slots) más el `name` y el `email` de quien asiste. En
  una conversación de canal esos datos vienen del participante. Devuelve el UID de
  la reserva que se necesita para cancelarla después.
- **Cancel Booking** — cancela una reserva por su UID, con un motivo opcional; se
  notifica a quien asiste. Llámala solo cuando el usuario haya decidido claramente
  cancelar.

El flujo típico es List Available Slots → Create Booking. ¿Prefieres administrar un
Google Calendar directamente? Mira
[Google Calendar](/es/docs/tools/google-calendar).
