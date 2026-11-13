---
title: Iniciar sesión
description: Crea tu cuenta de Ganju con Google o GitHub, acepta una invitación y gestiona tu perfil.
order: 2
updated: 2026-11-13
---

Empezar en Ganju es gratis — no necesitas tarjeta de crédito. No hay un registro
aparte: la primera vez que inicias sesión, se crea tu cuenta.

## Inicia sesión

1. Ve a [app.ganju.ai](https://app.ganju.ai).
2. Marca **He leído y acepto los Términos y Condiciones y la Política de
   Privacidad**. Los botones para entrar siguen desactivados hasta que lo hagas.
3. Selecciona **Entrar con Google** o **Entrar con GitHub** y aprueba la
   solicitud en ese sitio.

Llegas a tus organizaciones. La primera vez, eso es el formulario **Crea tu
organización** — siguiente paso:
[crear una organización y un proyecto](/es/docs/getting-started/organization-and-project/).

![La página de inicio de sesión: Google, GitHub y la casilla de Términos y Privacidad](/images/sign-in.webp)

La app está en inglés y en español. La página de inicio de sesión ofrece el otro
idioma abajo (**Prefer English?** cuando la ves en español), y la app recuerda
tu elección.

## Si te invitaron

Una invitación llega por correo y lleva a una página que dice **Te invitaron**.
Inicia sesión con **el mismo correo al que se envió la invitación** y selecciona
**Aceptar invitación** (o **Rechazar**).

- ¿Entraste con otra dirección? La página te dice para qué dirección es la
  invitación. Cierra sesión y entra con esa.
- Las invitaciones vencen a los **7 días**. Un enlace vencido, revocado o ya
  usado lo indica — pídele a quien te invitó que te mande uno nuevo.
- También puedes aceptar desde la página **Organizaciones**, en **Tus
  invitaciones**, con **Aceptar** o **Rechazar**.

Una invitación es a toda una organización o a un solo proyecto. Una invitación a
un proyecto te da solo ese proyecto; la tarjeta de la organización muestra
**Acceso al proyecto**.

## Tu cuenta

Tu avatar, abajo en la barra lateral, abre un menú con **Cuenta**, **Ajustes**,
**Documentación** y **Cerrar sesión**. **Cuenta** te permite:

- Subir una foto de perfil y cambiar tu **Nombre**.
- Ver tus **Cuentas vinculadas** y **Vincular** o **Desvincular** Google y
  GitHub, para entrar con cualquiera de las dos. Debes mantener al menos una
  cuenta vinculada.

Para descargar tus datos personales o eliminar tu cuenta, mira
[Configuración → Tus datos](/es/docs/settings/#tus-datos) y
[Zona de riesgo](/es/docs/settings/#zona-de-riesgo).

## Iniciar sesión desde una terminal

Los desarrolladores que usan el [`ganju` CLI](/es/docs/tools/cli/) inician
sesión una vez por máquina. Abre el mismo inicio de sesión en tu navegador:

```bash
ganju login     # inicia sesión en esta máquina
ganju whoami    # con qué cuenta está esta máquina
ganju logout    # olvida el token guardado
```

## Solución de problemas

- **Los botones no responden.** Marca primero la casilla de Términos y
  Privacidad.
- **Entré y no veo la organización de mi equipo.** Entraste con otra cuenta
  distinta a la invitada. Cierra sesión y entra con la dirección invitada.
- **"No tienes acceso a este proyecto".** Estás en la organización, pero no en
  ese proyecto. Alguien del proyecto puede agregarte desde los miembros del
  proyecto, en los ajustes de la organización.

Sigue con: [crear una organización y un proyecto](/es/docs/getting-started/organization-and-project/).
