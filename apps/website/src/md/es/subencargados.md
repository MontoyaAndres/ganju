# Subencargados

**Última actualización: 1 de agosto de 2026**

Un subencargado es una empresa que usamos para prestar el servicio alojado de Ganju y
que puede tratar datos personales por cuenta nuestra. Esta página es la lista
autoritativa. Hace parte de nuestra [Política de Privacidad](/es/privacidad) y de
nuestro [Acuerdo de Tratamiento de Datos](/es/dpa).

**Si instalas Ganju en tu propia infraestructura, nada de esto te aplica**: tú eliges
tus propios proveedores, y los únicos que heredas son los que configures tú mismo.

> Esta es la traducción al español de nuestra página de
> [Subprocessors](/subprocessors). Si hay alguna discrepancia entre las dos versiones,
> **prevalece esta versión en español** para los titulares en Colombia.

## Cómo cambiamos esta lista

Antes de que un nuevo subencargado empiece a tratar Contenido de Cliente:

1. Actualizamos esta página y la fecha que aparece arriba.
2. Escribimos al Propietario de cada organización con plan de pago **al menos 30 días
   antes** de que el cambio entre en vigor.
3. Te damos una forma de oponerte. Si tienes una objeción razonable y documentada en
   materia de protección de datos que no podamos resolver, puedes terminar tu
   suscripción al servicio afectado y te devolvemos la parte no usada del período en
   curso.

Los reemplazos de emergencia — un proveedor que falla o al que se le termina el
contrato por justa causa — pueden ocurrir más rápido. Te avisaremos apenas podamos y
te explicaremos por qué.

Para recibir estos avisos, escríbenos a **hello@ganju.ai** y pide que te agreguemos a
la lista de notificación de subencargados. También publicaremos los cambios en esta
misma página que estás leyendo.

## Infraestructura

Estos tratan datos de todos los clientes. No puedes excluirlos y seguir usando el
servicio alojado.

| Subencargado | Finalidad | Datos que trata | Ubicación |
| --- | --- | --- | --- |
| **Cloudflare, Inc.** | Alojamiento de la aplicación, CDN, almacenamiento de objetos (R2), colas, contenedores, enrutamiento de correo transaccional | Todo el tráfico; archivos subidos; trabajos en cola; correo saliente | Estados Unidos / red global |
| **Neon, Inc.** (sobre AWS) | Postgres administrado con `pgvector` — nuestro sistema de registro | Cuentas, espacios de trabajo, Contenido de Cliente, fragmentos de texto y embeddings, conversaciones, registros de auditoría y de error | AWS `us-east-1`, Estados Unidos |
| **Google LLC** (API de Gemini) | Generación de embeddings para cada recurso y cada consulta de búsqueda | Texto de los recursos y consultas de búsqueda | Estados Unidos / global |
| **Stripe, Inc.** | Facturación de suscripciones y procesamiento de pagos | Nombre, correo, dirección de facturación, medio de pago, contadores de consumo | Estados Unidos / global |

**Google aparece en este nivel deliberadamente.** Los embeddings corren con nuestra
llave para todos los clientes en todos los planes, así que el texto de tus recursos
llega a Google hayas configurado algo o no. Consulta
[Modelos de IA, embeddings y tu contenido](/es/privacidad#modelos-de-ia-embeddings-y-tu-contenido).

## Condicionales — solo si los activas

Estos tratan datos únicamente de las organizaciones que encienden la función
correspondiente. Si nunca los conectas, nunca ven nada tuyo.

| Subencargado | Se activa al | Datos que trata |
| --- | --- | --- |
| **Google LLC** (modelo compartido) | Ejecutar respuestas de canal en el modelo compartido de Ganju — la opción por defecto, y la única en el plan Gratis | Historial de conversación, prompt de sistema, definiciones y resultados de herramientas, fragmentos recuperados |
| **Anthropic, PBC** | Agregar una llave de modelo de Anthropic | El mismo contenido del turno, en tu propia cuenta |
| **OpenAI, L.L.C.** | Agregar una llave de modelo de OpenAI o compatible con OpenAI | El mismo contenido del turno, en tu propia cuenta |
| **Tavily** | Instalar las herramientas de búsqueda o extracción web | Tus consultas de búsqueda y las URL de destino |
| **Telegram**, **Slack**, **Meta (WhatsApp)**, **Discord** | Conectar un canal en esa plataforma | Mensajes hacia y desde tu bot, identificadores de los participantes |
| **Google**, **Microsoft**, **Slack**, **Cal.com** | Conectar una cuenta para que las herramientas actúen sobre ella | Lo que cada solicitud de herramienta envíe y reciba |
| Cualquier **servidor MCP remoto** que conectes vía `mcp-proxy` | Instalar ese servidor | Lo que tus herramientas le envíen |
| Cualquier **endpoint HTTP** que configures vía `http-endpoint` | Instalar esa herramienta | Lo que tus herramientas le envíen |

Las dos últimas filas son destinos que eliges **tú**. No podemos evaluarlos, no los
controlamos y no están cubiertos por nuestros compromisos — los listamos para que el
panorama quede completo.

## Proveedores de identidad

| Subencargado | Finalidad | Datos que trata |
| --- | --- | --- |
| **Google LLC** | Inicio de sesión social | Tu nombre, correo, imagen de perfil |
| **GitHub, Inc.** | Inicio de sesión social | Tu nombre, correo, imagen de perfil |

## Preguntas

Escríbenos a **hello@ganju.ai** o llámanos al **+57 312 4678519**.

Ganju S.A.S. · Bogotá, D.C., Colombia
