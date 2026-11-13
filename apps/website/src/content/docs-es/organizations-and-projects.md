---
title: Organizaciones y proyectos
description: Cómo está estructurado Ganju — una organización reúne a tu equipo, la facturación y el plan; cada proyecto dentro de ella es un espacio de trabajo independiente para un asistente.
order: 1
updated: 2026-11-13
---

Ganju tiene dos niveles. Tu **organización** representa a tu equipo o empresa —
ahí viven los miembros, la facturación, tu [plan](/es/docs/settings/) y tus
propios modelos de lenguaje. Dentro de ella, cada **proyecto** es un espacio de
trabajo independiente para un asistente, con su propio
[conocimiento](/es/docs/resources/), [prompts](/es/docs/prompts/),
[datos](/es/docs/data/), [herramientas](/es/docs/tools/),
[canales](/es/docs/channels/) y [URL de MCP](/es/docs/mcp/). Una organización
puede tener muchos proyectos.

## Qué vive dónde

| Organización | Proyecto |
| --- | --- |
| Plan, facturación y consumo | Recursos y prompts (**Conocimiento**) |
| Miembros (propietario y administradores) | Su propia lista de miembros |
| Los modelos de lenguaje que traes (**Modelos**) | Datos (tablas, disparadores, programaciones) |
| **Confirmar acciones sensibles** (aplica a todos los proyectos) | Herramientas: conexiones del catálogo, endpoints HTTP, funciones |
| Créditos del Asistente (compartidos por todos los proyectos) | Canales y sus **Instrucciones del bot** |
| | URL de MCP, actividad y salud de las herramientas |
| | Tokens de acceso para el CLI |

## Por qué dos niveles

- **Un espacio de trabajo por asistente.** Dale a cada cliente, producto o caso
  de uso su propio proyecto — su conocimiento, sus datos y sus herramientas se
  mantienen completamente separados.
- **Equipo y facturación compartidos.** Los miembros y el plan están a nivel de
  organización, así que todo lo de adentro queda cubierto por una sola
  suscripción y una sola lista de miembros.
- **Separación limpia, una sola cuenta.** Ten una organización Free para
  proyectos personales y una Pro para tu empresa, lado a lado, con el mismo
  inicio de sesión.

## Cambia entre ellos

El selector **Organizaciones y proyectos** — el ícono de cuadrícula arriba en la
barra lateral — es la forma de moverte. Elige una organización a la izquierda
(cada una muestra su número de miembros) para ver sus proyectos a la derecha, y
abre uno. Abajo: **Gestionar organizaciones** y **Nuevo proyecto**.

![El selector de organizaciones y proyectos: organizaciones a la izquierda, sus proyectos a la derecha, Administrar organizaciones y Nuevo proyecto](/images/org-project-switcher.webp)

## Crea un proyecto

1. Selecciona **Nuevo proyecto** en el selector. El diálogo **Crear un
   proyecto** muestra en qué organización queda (**En …**).
2. Escribe un **Nombre** (al menos 3 caracteres) y, si quieres, una
   **Descripción**.
3. Selecciona **Crear**.

Llegas al Inicio del proyecto nuevo, que empieza con las cinco herramientas
integradas. En Pro y Enterprise te ofrece **Abrir el Asistente**.

![El diálogo para crear un proyecto: nombre y descripción](/images/new-project-dialog.webp)

Las organizaciones **Free** tienen **un proyecto**. Crear un segundo te pide
mejorar el plan; Pro y Enterprise no tienen límite de proyectos.

## Gestiona tus organizaciones

**Gestionar organizaciones** abre la página **Organizaciones**, con cada
organización a la que perteneces. Cada tarjeta muestra tus insignias
(**Propietario** si la creaste, y su plan: **Free**, **Pro** o **Enterprise**),
su número de proyectos y miembros, y cuándo se creó — con las acciones
**Invitar** y **Ajustes**. Si te agregaron solo a un proyecto de una
organización, su tarjeta dice **Acceso al proyecto** y cuántos proyectos puedes
abrir.

Arriba de la lista, **Tus invitaciones** muestra las invitaciones que te esperan,
con **Aceptar** y **Rechazar**.

![La página de organizaciones: una tarjeta por organización con su rol y plan, contadores, e Invitar y Configuración](/images/new-org.webp)

### Crea otra organización

Selecciona **Nueva organización**. El diálogo **Crear una organización** pide el
**Nombre** de la organización y el **Nombre del proyecto** y la **Descripción del
proyecto** de su primer proyecto — toda organización empieza con uno.

Puedes ser propietario de **una sola organización Free**. Para crear más, al
menos una organización tuya tiene que estar en un plan de pago — pasa una a Pro
y podrás agregar otras (cada una nueva empieza en Free, con su propia
facturación).

## Quién puede hacer qué

Ser miembro de la organización y ser miembro de un proyecto son cosas
distintas:

- **Los miembros de la organización** ven todos sus **Ajustes** — cambiarle el
  nombre, la facturación, los miembros, los proyectos, los modelos. Quien crea
  una organización es su **Propietario**; todos los invitados a ella entran como
  **administradores** (ADMIN). Solo el propietario puede eliminar la
  organización.
- **Los miembros de un proyecto** pueden abrir ese proyecto. Quien crea un
  proyecto es miembro de él; a cualquier otra persona se la agrega desde
  **Ajustes → Proyectos → Miembros**, o con una invitación a ese proyecto.

Así que alguien puede estar en un proyecto sin estar en la organización (su
tarjeta en **Organizaciones** dice **Acceso al proyecto**, y en Ajustes solo ve
lo que le corresponde), y un miembro de la organización que abre un proyecto en
el que no está ve **No tienes acceso a este proyecto**, con un enlace a los
ajustes de la organización, donde alguien del proyecto puede agregarlo.

## Desde una terminal

El [`ganju` CLI](/es/docs/tools/cli/) trabaja con un proyecto a la vez. Vincula
una carpeta a una organización y un proyecto por nombre o por id:

```bash
ganju link                                                     # elige de una lista
ganju link --organization "Acme" --project "Bot de soporte"    # sin preguntas
ganju link --status                                            # a qué apunta esta carpeta
```

Sigue con: define cómo se comporta tu asistente con los
[prompts](/es/docs/prompts/), o deja que el [Asistente](/es/docs/assistant/) lo
construya contigo.
