---
title: Configuración
description: Administra tu organización, tu plan, los miembros, los modelos, los tokens de acceso y más desde un solo lugar.
order: 8
updated: 2026-11-13
minutes: 3
outcome: "Ya sabes dónde cambiar el plan, invitar gente y elegir el modelo."
---

**Ajustes** es la sala de control de tu organización. Ábrelo desde el menú de tu
avatar (**Ajustes**) o desde la tarjeta de una organización en la página
**Organizaciones**. Un submenú a la izquierda salta entre cada área:
**Organización**, **Plan y facturación**, **Miembros**, **Proyectos**,
**Modelos**, **Tus datos** y la **Zona de riesgo**.

> **¿Quieres el panorama completo?** Esta es la versión rápida. La guía completa
> de **[Configuración](/es/docs/settings/)** explica cómo funcionan de verdad los
> planes Free, Pro y Enterprise, la facturación y el consumo adicional, los
> miembros, los tokens de acceso y cómo traer tu propio modelo.

## Organización

Mira cuándo se creó la organización y cuántos proyectos y miembros tiene, y
cámbiale el nombre en **Nombre de la organización** → **Guardar cambios**.

Aquí también está **Confirmar acciones sensibles**. Actívalo y tus bots le
preguntan a la persona antes de enviar un correo o mensaje, agendar o cambiar un
evento, borrar algo o hacer cualquier otra acción que no sea de solo lectura, y
solo actúan si responde que sí. Detalles en
[Configuración → Confirmar acciones sensibles](/es/docs/settings/#confirmar-acciones-sensibles).

![Configuración, Organización: fecha de creación, proyectos y miembros, el nombre y Confirmar acciones sensibles](/images/settings-organization.webp)

## Plan y facturación

Tu plan actual y su fecha de renovación, y el consumo frente a cada cupo:
respuestas del asistente (y cuántas usaron el modelo de Ganju), contenido
indexado (RAG), llamadas a tus funciones, créditos del Asistente, almacenamiento
de archivos y proyectos. Solo las respuestas de tu asistente cuentan para la
facturación; los mensajes que entran son gratis. En Free verás **Pasar a Pro**;
en un plan de pago, **Gestionar la facturación**.

![Plan y facturación en Pro: el uso del mes, los créditos del asistente, los créditos extra al mes y el aviso por correo de acciones rotas](/images/settings-billing-pro.webp)

## Miembros y proyectos

**Miembros** lista a todos en la organización. Invita a alguien de tu equipo por
correo (acepta la invitación dentro de la app), y quita miembros o revoca
invitaciones pendientes. Invitar es una función de Pro.

**Proyectos** lista cada proyecto; cada uno tiene sus propios **Miembros**
(quiénes pueden abrir ese proyecto) y **Tokens de acceso** (para desplegar desde
CI con el [`ganju` CLI](/es/docs/tools/cli/)).

![Configuración: Miembros con el campo para invitar, y Proyectos con Miembros, Tokens de acceso y Abrir](/images/settings-members.webp)

## Modelos de lenguaje

Por defecto tus canales usan el modelo del sistema. En Pro puedes traer el tuyo:
en **Modelos**, selecciona **Agregar modelo**, ponle un **Nombre visible**, elige
el **Modelo** (modelos de Gemini, GPT o Claude, o **Personalizado (compatible con
OpenAI)**) y pega tu **Clave de API**, con una **URL base** y un **Prompt de
sistema** opcionales. Agrégalo una vez y elígelo en el **Modelo de lenguaje** de
cualquier canal.

![El formulario Nuevo modelo: nombre, modelo, clave de API, URL base y prompt de sistema](/images/settings-models-new.webp)

## Tus datos y Zona de riesgo

**Tus datos** descarga en JSON todo lo que Ganju tiene sobre ti y muestra los
Términos y la Política de Privacidad que aceptaste. La **Zona de riesgo** tiene
**Eliminar la organización** (solo el propietario) y **Eliminar tu cuenta**.
Ambas son permanentes.

Con esto terminas la guía: tu bot ya está en vivo en un canal. Para ir más
lejos, cada parte tiene su guía completa, empezando por
[Organizaciones y proyectos](/es/docs/organizations-and-projects/).
