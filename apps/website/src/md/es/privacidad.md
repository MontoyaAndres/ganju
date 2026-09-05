# Política de Privacidad y Tratamiento de Datos Personales

**Última actualización: 5 de septiembre de 2026 · Vigente desde: 5 de septiembre de 2026**

Esta política explica qué datos recoge Ganju cuando usas el servicio alojado en
`ganju.ai`, `app.ganju.ai`, `api.ganju.ai` y `mcp.ganju.ai`, para qué los usamos,
quién más los trata y qué puedes hacer al respecto. Es también nuestra **política de
tratamiento de la información** en los términos de la Ley 1581 de 2012 y del
Decreto 1074 de 2015.

Ganju además es software libre bajo licencia Apache-2.0. **Si instalas Ganju en tu
propia infraestructura, esta política no te aplica**: tú operas los servidores, tú
custodias los datos y nosotros nunca los vemos. Todo lo que sigue se refiere al
servicio que nosotros operamos.

> Esta es la traducción al español de nuestra
> [Privacy Policy](/es/privacidad). Si hay alguna discrepancia entre las dos versiones,
> **prevalece esta versión en español** para los titulares en Colombia.

- [Quiénes somos y qué papel cumplimos](#quiénes-somos-y-qué-papel-cumplimos)
- [Qué datos recogemos](#qué-datos-recogemos)
- [Para qué los usamos](#para-qué-los-usamos)
- [Modelos de IA, embeddings y tu contenido](#modelos-de-ia-embeddings-y-tu-contenido)
- [Cuentas y herramientas conectadas](#cuentas-y-herramientas-conectadas)
- [Datos de usuario de Google](#datos-de-usuario-de-google)
- [Canales de chat y sus usuarios finales](#canales-de-chat-y-sus-usuarios-finales)
- [Con quién compartimos los datos](#con-quién-compartimos-los-datos)
- [Cookies y rastreo](#cookies-y-rastreo)
- [Seguridad](#seguridad)
- [Cuánto tiempo conservamos los datos](#cuánto-tiempo-conservamos-los-datos)
- [Dónde están tus datos](#dónde-están-tus-datos)
- [Tus derechos como titular](#tus-derechos-como-titular)
- [Menores de edad](#menores-de-edad)
- [Cambios a esta política](#cambios-a-esta-política)
- [Contáctanos](#contáctanos)

## Quiénes somos y qué papel cumplimos

El servicio alojado de Ganju es operado por **Ganju S.A.S.**, sociedad por acciones
simplificada constituida bajo las leyes de Colombia, con domicilio en **Bogotá, D.C.,
Colombia** ("Ganju", "nosotros"). Puedes escribirnos a **hello@ganju.ai**.

Ganju S.A.S. es el **responsable del tratamiento** de los datos personales descritos
más adelante, en los términos de la Ley 1581 de 2012 y el Decreto 1074 de 2015. Las
solicitudes de los titulares las atiende el área de Privacidad, en
**hello@ganju.ai**.

Cumplimos dos papeles distintos, y la diferencia importa:

- **Somos responsables** de los datos de tu *cuenta*: quién eres, a qué organizaciones
  perteneces, cómo inicias sesión, qué pagas y los registros de operación que
  mantenemos para prestar y proteger el servicio.
- **Somos encargados** de tu *Contenido de Cliente*: los archivos, sitios web,
  prompts, configuraciones de herramientas, credenciales y conversaciones que cargas
  en un proyecto. Tratamos ese contenido siguiendo tus instrucciones, para entregarte
  las funciones que activaste. Tu organización decide qué entra, quién lo ve y cuándo
  se borra.

Si estás conversando con un bot que otra persona construyó sobre Ganju, la
organización de esa persona es la responsable de tu conversación — mira
[Canales de chat y sus usuarios finales](#canales-de-chat-y-sus-usuarios-finales).

## Qué datos recogemos

### Cuenta e identidad

| Dato | De dónde viene |
| --- | --- |
| Nombre, correo electrónico, foto de perfil, indicador de correo verificado | Inicio de sesión con Google o GitHub, o el perfil que configures |
| Hash de contraseña (solo si inicias sesión con contraseña) | Tú |
| Identificadores de cuenta, tokens de acceso y actualización, y permisos otorgados al proveedor de identidad | Google / GitHub |
| Registros de sesión: token, vencimiento, **dirección IP**, agente de usuario | Automáticamente, en cada inicio de sesión |
| Archivos de foto de perfil | Tú; se almacenan en Cloudflare R2 |

### Espacio de trabajo y membresías

Nombres y descripciones de organizaciones y proyectos, listas de miembros y roles
(Propietario / Administrador), conteos de lo que contiene cada espacio, e
invitaciones — incluido el **correo de cada persona que invitas**, quién la invitó, el
token de la invitación y si fue aceptada, rechazada o venció.

### Facturación y consumo

Plan y estado de la suscripción, período de facturación vigente, indicadores de
cancelación e identificadores de cliente y suscripción en Stripe. Medimos tres cosas
por organización: **respuestas del asistente** en canales de chat, **contenido
indexado (embebido) en megabytes** y **llamadas a las funciones que escribiste en
código**, además del excedente ya reportado a Stripe.

**Nunca vemos ni almacenamos los datos de tu tarjeta.** Los medios de pago los recoge
y custodia Stripe; nosotros solo recibimos identificadores y el estado de la
suscripción.

### Contenido de Cliente

Todo lo que cargas en un proyecto para que tu asistente lo use:

- **Recursos** — archivos cargados (en Cloudflare R2), texto pegado o con plantillas,
  páginas web rastreadas y archivos sincronizados desde carpetas de Google Drive o
  OneDrive. Guardamos los bytes del archivo, el texto extraído, el título, el URI, el
  tipo MIME, el tamaño y la configuración de rastreo o sincronización.
- **Fragmentos y embeddings** — los recursos indexables se dividen en fragmentos; el
  texto de cada uno y su vector de 3.072 dimensiones se guardan en Postgres con
  `pgvector` para que la búsqueda funcione.
- **Prompts** — títulos, descripciones, plantillas de mensajes y esquemas de entrada.
- **Herramientas** — cuáles tiene instaladas un asistente y su configuración,
  incluidas las URL, cabeceras y parámetros de cualquier endpoint HTTP o servidor MCP
  remoto que conectes.

### Credenciales y secretos

Tokens OAuth de acceso y actualización de las cuentas que conectas (Gmail, Google
Drive, Google Calendar, Outlook, OneDrive, Slack), llaves de API que ingresas
(Cal.com, Tavily, tus propias llaves de proveedores de IA), tokens de bots de
plataformas de chat y secretos de webhook por canal.

**Todo esto se cifra antes de escribirse en la base de datos** (XChaCha20-Poly1305),
nunca se devuelve al navegador en texto claro y nunca se escribe en registros. Mira
[Seguridad](#seguridad).

### Tráfico MCP

Cuando un cliente MCP (Claude, ChatGPT, Cursor y similares) se conecta a uno de tus
asistentes, registramos:

- **Sesión** — el nombre y versión que reporta el cliente, agente de usuario,
  **dirección IP**, tipo de autenticación, número de solicitudes y el usuario
  autenticado detrás, si lo hay.
- **Solicitud** — el método del protocolo, la herramienta, el recurso o el prompt
  invocado, **los argumentos enviados y el resultado devuelto**, la latencia y
  cualquier mensaje de error.

### Tráfico de canales de chat

Para cada canal de Telegram, Slack, WhatsApp o Discord que conectes:

- Conversaciones (el identificador externo del chat, un título y si es un mensaje
  directo, un grupo o un canal)
- **El contenido de los mensajes en ambos sentidos**, el rol de cada mensaje, conteo
  de tokens, latencia de respuesta y metadatos de la plataforma
- Participantes — el identificador y el nombre visible de todas las personas que le
  hablan al bot, y el vínculo con una cuenta de Ganju si esa persona decidió
  vincularla
- Un desglose por respuesta de qué herramientas, prompts y recursos usó cada turno

### Registros de operación

Una auditoría unificada — quién ejecutó qué herramienta, prompt o recurso, desde qué
origen y cuándo — y un registro de errores con el servicio, el método y la ruta HTTP,
la cadena de consulta, el nombre, mensaje y traza del error, el agente de usuario, la
**dirección IP** y el usuario, organización o proyecto al que pertenecía la solicitud.

### Formulario de contacto

Si nos escribes por el formulario de `ganju.ai`, recibimos tu nombre o empresa, tu
correo y tu mensaje, y lo enviamos al buzón de nuestro equipo. No lo guardamos en la
base de datos del producto.

## Para qué los usamos

Usamos los datos anteriores para:

- **Prestar el servicio** — autenticarte, servir tu panel, levantar un servidor MCP a
  partir de la configuración de tu artefacto, ejecutar herramientas, recuperar
  recursos y generar las respuestas de los bots de chat.
- **Hacer buscable tu contenido** — dividir e indexar los recursos para que la
  recuperación funcione.
- **Mostrarte qué pasó** — la gráfica de Actividad, los contadores de consumo y el
  historial reciente de cada proyecto se construyen con los registros descritos arriba.
- **Facturarte correctamente** — contar respuestas del asistente y almacenamiento
  indexado contra el cupo de tu plan, aplicar los topes del plan Gratis y reportar el
  excedente a Stripe.
- **Mantener todo seguro** — detectar abusos, depurar fallas, filtrar solicitudes
  salientes e investigar incidentes de seguridad.
- **Comunicarnos contigo** — correos transaccionales como las invitaciones, y
  respuestas a solicitudes de soporte.

**No** vendemos tus datos personales, **no** los compartimos para publicidad
conductual entre contextos, **no** usamos rastreadores publicitarios ni de analítica y
**no** usamos tu Contenido de Cliente para entrenar modelos de IA.

## Modelos de IA, embeddings y tu contenido

Esta es la parte que vale la pena leer dos veces, porque es donde tu contenido sale de
nuestra infraestructura.

### Embeddings — siempre Google

Cada recurso indexable que agregas se envía a la **API de Gemini de Google**
(`gemini-embedding-001`) usando **la llave de API de Ganju**, para convertirlo en
vectores. Las consultas de búsqueda se procesan igual. Esto ocurre en todos los
planes, incluido el Gratis, y hoy no hay forma de desactivarlo si usas el servicio
alojado y quieres conservar la búsqueda. Si eso no es aceptable para un documento en
particular, no lo cargues — o instala Ganju por tu cuenta.

### Respuestas en canales de chat

Cuando alguien le escribe a uno de tus bots, ejecutamos un ciclo de llamado a
herramientas contra un modelo de lenguaje. Lo que se envía a ese modelo es: tu prompt
de sistema, el historial reciente de la conversación (hasta 20 turnos, o 10 cuando
corre sobre nuestro modelo compartido), las definiciones de las herramientas
instaladas, los resultados que devuelven y los fragmentos de recursos recuperados para
responder.

Qué modelo lo recibe depende de tu configuración:

- **El modelo compartido de Ganju** — la opción por defecto, y la única en el plan
  Gratis. Hoy es un modelo **Gemini de Google**, invocado con nuestra llave.
- **Tu propio modelo** — en los planes pagos puedes agregar una llave de Anthropic,
  OpenAI, Google o cualquier endpoint compatible con OpenAI. Esas solicitudes van al
  proveedor bajo tu propia cuenta y sus términos.

### Clientes MCP

Cuando Claude, ChatGPT, Cursor u otro cliente MCP habla con tu asistente, **la
inferencia ocurre en el modelo de ese cliente, no en el nuestro**. Nosotros ejecutamos
las herramientas y servimos el contenido recuperado; el proveedor del cliente maneja
la conversación, y su política de privacidad rige ese lado.

No usamos tu contenido para entrenar modelos propios y no le damos a los proveedores
de modelos el derecho de entrenarse con él. Lo que cada proveedor haga se rige por sus
propios términos — si eso te importa, usa tu propia llave y elige un proveedor cuyos
términos hayas leído.

## Cuentas y herramientas conectadas

Cuando conectas una cuenta, le otorgas a Ganju un token con los permisos que las
herramientas necesitan:

| Conexión | Qué permite el token |
| --- | --- |
| **Gmail** | Leer, enviar, redactar y modificar mensajes, y administrar etiquetas |
| **Google Drive** | Leer archivos y metadatos |
| **Google Calendar** | Leer calendarios y crear, actualizar y eliminar eventos |
| **Outlook** | Leer y escribir correo, enviar correo, leer tu perfil básico |
| **OneDrive** | Leer archivos |
| **Slack** | Publicar mensajes, listar canales, consultar usuarios, subir archivos y — con un token de usuario — buscar mensajes |
| **Cal.com**, **Tavily** | Lo que permita la llave de API que entregues |

Guardamos el token, su vencimiento, sus permisos y metadatos ligeros — **no una copia
de tu buzón o de tu unidad**. El contenido se consulta en el momento en que corre la
herramienta y se devuelve a quien la invocó; lo que queda después es el registro de
auditoría descrito arriba, más los archivos que hayas sincronizado deliberadamente
como recursos.

Las herramientas ejecutan **acciones reales** sobre esas cuentas: enviar correos,
crear y borrar eventos, publicar en Slack. Tú decides qué herramientas tiene un
asistente y quién puede alcanzarlo.

Dos tipos de herramienta llegan a sistemas que no controlamos: **`http-endpoint`**
llama a tu propia API HTTP y **`mcp-proxy`** conecta un servidor MCP remoto (Notion,
GitHub y similares). Las solicitudes a ambos se filtran contra rangos de direcciones
privadas y de loopback, pero una vez que los datos salen hacia un destino que tú
configuraste, el operador de ese destino los trata bajo su propia responsabilidad.
Puedes desconectar cualquier cuenta desde el panel en cualquier momento, y también
revocar el acceso en el proveedor.

## Datos de usuario de Google

Las herramientas de Gmail, Google Drive y Google Calendar de Ganju llaman a las APIs
de Google Workspace, y «Iniciar sesión con Google» llama a las APIs de identidad de
Google. Todo lo dicho en esta política aplica a esos datos; esta sección precisa qué
le pedimos a Google, para qué, y qué pasa después con lo que recibimos.

Nada de esto se concede al registrarte. **Tú conectas cada cuenta de Google, una por
una, desde el panel**, y solo cuando quieres que funcionen las herramientas
correspondientes. Puedes desconectarla cuando quieras — ve a [Revocar el acceso y
borrar los datos](#revocar-el-acceso-y-borrar-los-datos).

### Qué pedimos y para qué

**Iniciar sesión con Google** usa `openid`, `email` y `profile`. Leemos tu nombre, tu
correo y tu foto de perfil para crear tu cuenta de Ganju e iniciarte sesión. Nada más.

**Gmail** — se piden solo cuando conectas una cuenta de Gmail para sus herramientas:

| Permiso | Para qué lo necesitan las herramientas |
| --- | --- |
| `gmail.readonly` | Listar, buscar y leer mensajes e hilos, para que tu asistente pueda responder preguntas sobre tu correo y leer una conversación antes de contestarla |
| `gmail.send` | Enviar los mensajes y respuestas que tú o tu asistente redacten |
| `gmail.compose` | Crear y actualizar borradores, para que una respuesta quede escrita y tú la revises antes de que salga |
| `gmail.modify` | Marcar mensajes como leídos o no leídos, archivarlos y aplicar etiquetas cuando lo pidas |
| `gmail.labels` | Listar y administrar etiquetas, para archivar el correo donde tú quieras |

**Google Drive** — `drive.readonly` y `drive.metadata.readonly`. Listamos tus carpetas
y archivos para que elijas cuáles sincronizar en un proyecto, y leemos el contenido de
los que elegiste para que tu asistente pueda responder con ellos. **Nunca pedimos
permiso de escritura sobre Drive.**

**Google Calendar** — `calendar.readonly` y `calendar.events`. Leemos tus calendarios
y eventos para que tu asistente pueda responder preguntas de agenda, y creamos,
actualizamos y eliminamos los eventos que le pidas.

### Cómo los usamos

Los datos de usuario de Google se usan para una sola cosa: **prestar las funciones que
activaste**. Una herramienta corre cuando tú, un compañero de equipo o un asistente de
IA que actúa por ti la invoca — nunca por iniciativa nuestra ni de forma
especulativa.

**No** usamos datos de usuario de Google para publicidad de ningún tipo. **No** los
vendemos. **No** los usamos para construir perfiles, para dar funciones a otros
clientes, ni para ningún fin que tú no hayas habilitado.

### Qué guardamos y por cuánto tiempo

- **Los tokens de OAuth** — token de acceso, token de refresco, vencimiento y permisos
  otorgados — cifrados con XChaCha20-Poly1305 antes de llegar a la base de datos,
  nunca devueltos al navegador en texto plano, nunca escritos en registros.
- **El contenido de mensajes, archivos y eventos se consulta en el momento en que
  corre la herramienta y se entrega directamente a quien la invocó.** No hacemos una
  copia de tu buzón, tu unidad ni tu calendario en nuestra base de datos.
- **La excepción que tú eliges**: los archivos de Drive que sincronizas
  deliberadamente en un proyecto se guardan como recursos — los bytes del archivo en
  Cloudflare R2, el texto extraído y sus vectores en nuestra base de datos — porque esa
  es precisamente la función que pediste. Borrar el recurso borra todo eso.
- **Registros de auditoría** de cada ejecución de herramienta, que incluyen los
  argumentos enviados y el resultado devuelto, para que puedas ver qué hizo tu
  asistente. Se eliminan automáticamente a los **90 días**.

### A quién llegan

Los datos de usuario de Google llegan a un tercero solo en dos situaciones, y las dos
las controlas tú:

- **El modelo de IA que responde.** Cuando una herramienta devuelve contenido de
  Gmail, Drive o Calendar en medio de una conversación, ese contenido va al modelo que
  la está atendiendo para que pueda usarlo en la respuesta: la API de Gemini de Google
  con nuestra llave si usas el modelo compartido, el proveedor cuya llave configuraste
  si trajiste la tuya, o —en el caso de clientes MCP— el proveedor detrás de Claude,
  ChatGPT o Cursor. El texto que sincronizas desde Drive como recurso también se envía
  a la API de Gemini de Google para convertirlo en vectores de búsqueda.
- **Un destino que tú mismo configuraste**, si armaste una herramienta
  `http-endpoint` o `mcp-proxy` que los envía allí.

**No usamos datos de usuario de Google — ni permitimos que nuestros proveedores los
usen — para desarrollar, mejorar o entrenar modelos de IA o de aprendizaje automático
de propósito general.** Los proveedores de modelos los reciben únicamente para
inferencia, es decir, para producir la respuesta que pediste.

Ninguna persona de Ganju lee tus datos de usuario de Google. Las excepciones son las
que permite la política de Google: con tu consentimiento expreso (por ejemplo, cuando
nos pides ayuda para depurar algo), cuando es necesario por seguridad —investigar un
abuso o una vulnerabilidad— o cuando la ley nos obliga.

### Uso limitado

**El uso y la transferencia por parte de Ganju, hacia cualquier otra aplicación, de la
información recibida de las APIs de Google se ajustará a la [Política de Datos de
Usuario de los Servicios de API de
Google](https://developers.google.com/terms/api-services-user-data-policy), incluidos
los requisitos de Uso Limitado.**

### Revocar el acceso y borrar los datos

- **En Ganju**: desconecta la cuenta desde el panel. Los tokens guardados se borran
  con ella.
- **En Google**: revoca el acceso de Ganju en
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- **Los recursos sincronizados desde Drive** se eliminan al borrar el recurso, el
  proyecto o la organización — cada borrado arrastra el archivo guardado, su texto
  extraído y sus vectores.
- Borrar tu cuenta de Ganju elimina las conexiones y todo lo que cuelga de ellas. Ve a
  [Cuánto tiempo conservamos los datos](#cuánto-tiempo-conservamos-los-datos).

## Canales de chat y sus usuarios finales

Si construyes un bot de Telegram, Slack, WhatsApp o Discord sobre Ganju, **habrá
personas que le escriban y nosotros guardaremos lo que digan** — el contenido de los
mensajes, su identificador y nombre visible en la plataforma, y los metadatos ya
descritos — por cuenta de tu organización.

Si operas un canal, eres el responsable del tratamiento de esas conversaciones. Te
corresponde informar a tus usuarios que un asistente de IA atiende la conversación,
contar con la autorización o base legal para tratar lo que envían y atender sus
solicitudes. Los administradores de tu organización pueden leer esas conversaciones en
el panel.

Si eres un usuario final que habló con un bot basado en Ganju y quieres que se
eliminen tus datos, contacta a la organización que opera el bot. Si no logras
identificarla, escribe a **hello@ganju.ai** y trasladaremos la solicitud al operador.

## Con quién compartimos los datos

No vendemos datos. Solo los compartimos con los proveedores que hacen funcionar el
servicio. La tabla siguiente es el resumen; la lista siempre actualizada, con el papel
y la ubicación de cada uno, está en la [página de subencargados](/es/subencargados),
donde además nos comprometemos a avisarte antes de que uno nuevo empiece a tratar tu
contenido.

| Proveedor | Qué trata | Para qué |
| --- | --- | --- |
| **Cloudflare** | Todo el tráfico; archivos cargados (R2); trabajos en cola; contenedores; enrutamiento de correo transaccional | Alojamiento y entrega de toda la plataforma |
| **Neon** (Postgres sobre AWS, `us-east-1`) | La base de datos principal: cuentas, espacios de trabajo, contenido, fragmentos, embeddings y registros | Nuestro sistema de registro |
| **Google** (API de Gemini) | Texto de recursos y consultas de búsqueda; contenido de chat cuando se usa el modelo compartido | Embeddings y modelo compartido por defecto |
| **Anthropic**, **OpenAI** o un endpoint compatible | Contenido de chat | Solo cuando configuras tu propio modelo |
| **Stripe** | Nombre, correo, datos de facturación, medio de pago, conteos de consumo | Pagos y administración de suscripciones |
| **Tavily** | Tus consultas de búsqueda y URL objetivo | Solo si instalas las herramientas de búsqueda web |
| **Telegram**, **Slack**, **Meta (WhatsApp)**, **Discord** | Mensajes hacia y desde tu bot | Solo para los canales que conectes |
| **Google**, **Microsoft**, **Slack**, **Cal.com** | Las solicitudes que hagan tus herramientas | Solo para las cuentas que conectes |
| **GitHub**, **Google** | Tu identidad al iniciar sesión | Inicio de sesión social |
| Cualquier **servidor MCP remoto** o **endpoint HTTP** que configures | Lo que envíen tus herramientas | Tú elegiste el destino |

También podemos revelar datos cuando la ley nos obligue, para hacer cumplir nuestros
[Términos](/es/terminos) o para proteger los derechos y la seguridad de los usuarios y del
público. Si Ganju llega a participar en una fusión, adquisición o venta de activos,
los datos podrían transferirse como parte de la operación — te avisaríamos antes de
que queden sujetos a una política distinta.

## Cookies y rastreo

**El sitio de marketing (`ganju.ai`) no instala cookies ni ejecuta analítica,
publicidad o rastreo de terceros de ningún tipo.** Las tipografías se sirven desde
nuestro propio origen, no desde una CDN. No hay nada que consentir porque no hay nada
que te rastree.

La **aplicación** (`app.ganju.ai` y `api.ganju.ai`) sí instala cookies estrictamente
necesarias para autenticarte:

- Una **cookie de sesión** emitida al iniciar sesión, compartida entre subdominios de
  `ganju.ai` para que el panel y la API usen la misma sesión, marcada `Secure` en
  producción y eliminada al cerrar sesión o al vencer.
- Cookies de corta duración usadas durante los flujos de OAuth y de consentimiento.

No usamos cookies para perfilamiento, remarketing ni medición.

## Seguridad

- **En tránsito** — todo viaja sobre TLS en la red de Cloudflare.
- **En reposo** — los tokens OAuth, llaves de API, credenciales de bots y secretos de
  webhook se cifran con XChaCha20-Poly1305 antes de almacenarse. Se descifran solo en
  el momento de usarlos, justo antes de la llamada saliente.
- **Nunca expuestos** — los secretos jamás se devuelven al panel en texto claro ni se
  escriben en registros o trazas de error.
- **Aislamiento** — cada consulta se limita a la organización y el proyecto de los que
  eres miembro; los servidores MCP se direccionan por artefacto.
- **Webhooks verificados** — las llamadas de las plataformas de chat se validan contra
  un secreto por canal antes de procesar cualquier cosa.
- **Salidas filtradas** — el rastreador, `http-endpoint` y `mcp-proxy` filtran los
  destinos contra rangos privados y de loopback.

Ningún sistema es perfectamente seguro. Hoy no contamos con certificación SOC 2,
ISO 27001 ni equivalente, y preferimos decirlo a insinuar lo contrario. Si encuentras
una vulnerabilidad, escribe a **hello@ganju.ai** — de verdad queremos saberlo.

## Cuánto tiempo conservamos los datos

Conservamos los datos mientras existan tu cuenta y tus organizaciones, con estos
límites automáticos:

| Dato | Conservación |
| --- | --- |
| Registro detallado de solicitudes MCP (argumentos y resultados de herramientas) | **90 días** |
| Registro de errores | **90 días** |
| Historial de mensajes de canales | **365 días** |
| Registros de auditoría de ejecución | **365 días** |
| Sesiones vencidas | Se depuran periódicamente |

Todo lo demás — cuentas, organizaciones, recursos, fragmentos, credenciales y
configuraciones — se conserva hasta que tú lo borres.

- **Borrar un recurso, prompt, herramienta, credencial o canal** elimina ese elemento
  y sus dependencias (fragmentos, embeddings, conversaciones, mensajes).
- **Borrar una organización** arrastra todo: cada proyecto, artefacto, recurso,
  fragmento, canal, conversación, mensaje, credencial, configuración de modelo,
  invitación y registro de auditoría. Es irreversible.
- **Los archivos cargados** en R2 se eliminan junto con el recurso que los referencia.
- **Los registros de facturación** los conservamos nosotros y Stripe por el tiempo que
  exijan las normas tributarias y contables, incluso después de que te vayas.
- **Las copias de respaldo** se rotan según el calendario de nuestro proveedor, así
  que los datos borrados pueden persistir en respaldos durante un período corto.

¿Quieres que todo desaparezca? Expórtalo desde **Configuración → Tus datos** y luego
elimina tus organizaciones y tu cuenta desde **Configuración → Zona de peligro**. Las
organizaciones de las que eres propietario van primero, porque eliminarlas también
destruye el trabajo de los demás miembros.

## Dónde están tus datos

Nuestra base de datos principal corre en Neon, en **AWS `us-east-1` (Estados
Unidos)**. Los archivos están en Cloudflare R2 y las solicitudes se atienden desde la
red global de Cloudflare, así que el tráfico se procesa en la región más cercana a
quien lo origina. Nuestros proveedores de modelos, pagos y plataforma operan
globalmente.

Estamos establecidos en Colombia pero almacenamos y tratamos datos en Estados Unidos,
de modo que **hay transferencia internacional de datos** para todos los usuarios.

- **Colombia.** Conforme a la Ley 1581 de 2012, al aceptar esta política autorizas la
  transferencia internacional de tus datos a los proveedores listados, para los fines
  aquí descritos. Nos apoyamos en esa autorización junto con las garantías
  contractuales de los términos de tratamiento de cada proveedor.
- **EEE, Reino Unido, Suiza.** Las transferencias se amparan en las Cláusulas
  Contractuales Tipo y garantías equivalentes en los términos de nuestros proveedores.

Nuestro [Acuerdo de Tratamiento de Datos](/es/dpa) aplica automáticamente a todos los
clientes. Si necesitas una copia firmada, escríbenos a **hello@ganju.ai**.

## Tus derechos como titular

Conforme a la Ley 1581 de 2012 y al Decreto 1074 de 2015, como titular tienes derecho
a:

- **Conocer, actualizar y rectificar** tus datos personales.
- **Solicitar prueba de la autorización** que otorgaste, salvo cuando la ley no la
  exija.
- **Ser informado** sobre el uso que le hemos dado a tus datos.
- **Presentar quejas ante la Superintendencia de Industria y Comercio (SIC)** por
  infracciones a la ley.
- **Revocar la autorización y solicitar la supresión** de tus datos cuando no exista
  un deber legal o contractual que lo impida, o cuando el tratamiento sea contrario a
  la ley.
- **Acceder gratuitamente** a tus datos.

La mayoría la puedes ejercer tú mismo, ahora, sin pedirnos nada:

- **Exportar tus datos** — **Configuración → Tus datos → Descargar mis datos** entrega
  un archivo JSON con tu perfil, métodos de inicio de sesión, sesiones, membresías,
  invitaciones que enviaste, identidades de chat vinculadas y tu registro de
  aceptación. Los secretos se reportan solo como indicadores de existencia, nunca en
  texto claro.
- **Eliminar tu cuenta** — **Configuración → Zona de peligro → Eliminar mi cuenta**.
  Antes debes eliminar o transferir las organizaciones de las que eres propietario.
- **Editar, desconectar o borrar** un perfil, una cuenta conectada, un recurso o un
  canal, desde la página donde vive.

Para lo demás, envía tu **consulta** o **reclamo** a **hello@ganju.ai**. Atendemos las
consultas en **10 días hábiles** y los reclamos en **15 días hábiles**, prorrogables
en los términos que la ley permite; si necesitamos la prórroga, te lo informaremos.
**La SIC normalmente solo admite una queja después de que la hayas presentado
primero ante nosotros.**

Si te encuentras en el EEE o el Reino Unido, tienes además los derechos de acceso,
rectificación, supresión, portabilidad, limitación y oposición del RGPD, y puedes
reclamar ante tu autoridad de control local.

**Residentes de California:** no vendemos información personal ni la compartimos para
publicidad conductual entre contextos, en el sentido de la CCPA/CPRA.

No te discriminaremos por ejercer cualquiera de estos derechos.

## Menores de edad

Ganju no está dirigido a menores y **debes tener al menos 18 años** — la mayoría de
edad en Colombia — para tener una cuenta. La Ley 1581 de 2012 (art. 7) da protección
especial a los datos de menores, y no los recogemos a sabiendas. Si crees que un menor
nos entregó datos personales, escribe a **hello@ganju.ai** y los eliminaremos.

Si operas un canal de chat al que pueden llegar menores, cumplir ese estándar frente a
tus usuarios finales es tu responsabilidad, no la nuestra.

## Cambios a esta política

Actualizaremos esta página cuando el producto cambie lo que hace con los datos. La
fecha de "Última actualización" siempre refleja la versión vigente. Ante cambios
sustanciales — una nueva categoría de datos, un nuevo subencargado que trate tu
contenido, una nueva finalidad — avisaremos por correo a los propietarios de las
cuentas antes de que el cambio entre en vigor. Seguir usando Ganju después de esa
fecha significa que aceptas la política actualizada.

## Contáctanos

Preguntas, solicitudes o quejas sobre privacidad:

- **Correo** — hello@ganju.ai
- **Teléfono** — +57 312 4678519
- **Dirección** — Ganju S.A.S., Bogotá, D.C., Colombia
- **Formulario** — [ganju.ai/contact](/es/contacto)
