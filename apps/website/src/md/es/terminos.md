# Términos y Condiciones del Servicio

**Última actualización: 1 de agosto de 2026 · Vigente desde: 1 de agosto de 2026**

Estos términos son el acuerdo entre tú y **Ganju S.A.S.**, sociedad por acciones
simplificada constituida bajo las leyes de Colombia con domicilio en Bogotá, D.C.,
Colombia ("Ganju", "nosotros"), respecto del servicio alojado de Ganju en `ganju.ai`,
`app.ganju.ai`, `api.ganju.ai` y `mcp.ganju.ai` (el "Servicio"). Al crear una cuenta o
usar el Servicio, los aceptas. Si no estás de acuerdo, no uses el Servicio.

**El software y el Servicio son dos cosas distintas.** El código fuente de Ganju se
publica bajo la [Licencia Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0), y
esa licencia — no este documento — rige lo que puedes hacer con el código. Estos
términos cubren únicamente el servicio alojado que nosotros operamos. Si lo instalas
por tu cuenta, nada de esto aplica.

> Esta es la traducción al español de nuestros [Terms of Service](/es/terminos). Si hay
> alguna discrepancia entre las dos versiones, **prevalece esta versión en español**
> para los usuarios en Colombia.

- [Definiciones](#definiciones)
- [Tu cuenta](#tu-cuenta)
- [Organizaciones, proyectos y miembros](#organizaciones-proyectos-y-miembros)
- [Planes, facturación y consumo](#planes-facturación-y-consumo)
- [Tu contenido](#tu-contenido)
- [Uso aceptable](#uso-aceptable)
- [Cuentas y servicios de terceros](#cuentas-y-servicios-de-terceros)
- [Resultados de IA y acciones automatizadas](#resultados-de-ia-y-acciones-automatizadas)
- [Disponibilidad, soporte y cambios](#disponibilidad-soporte-y-cambios)
- [Suspensión y terminación](#suspensión-y-terminación)
- [Propiedad intelectual](#propiedad-intelectual)
- [Sugerencias](#sugerencias)
- [Exclusión de garantías](#exclusión-de-garantías)
- [Limitación de responsabilidad](#limitación-de-responsabilidad)
- [Indemnidad](#indemnidad)
- [Ley aplicable y controversias](#ley-aplicable-y-controversias)
- [Cambios a estos términos](#cambios-a-estos-términos)
- [Generalidades](#generalidades)

## Definiciones

- **Organización** — el espacio de trabajo que agrupa tus proyectos y la unidad que
  facturamos.
- **Proyecto** — un espacio dentro de una organización; cada proyecto tiene
  exactamente un asistente.
- **Asistente** (un "artefacto" en la API) — el servidor MCP que expone un proyecto,
  con su propia dirección, prompts, recursos, herramientas, credenciales y canales.
- **Canal** — un bot de Telegram, Slack, WhatsApp o Discord vinculado a un asistente.
- **Usuario Final** — cualquier persona que interactúa con un asistente que tú operas,
  ya sea por un canal o por un cliente MCP.
- **Contenido de Cliente** — todo lo que tú o tus Usuarios Finales cargan en el
  Servicio: archivos, sitios web, carpetas sincronizadas, prompts, configuraciones de
  herramientas, credenciales, conversaciones y todo lo que devuelvan tus herramientas.
- **Respuesta del asistente** — un mensaje saliente generado por un asistente en un
  canal. Es la unidad que medimos. Los mensajes entrantes de Usuarios Finales son
  gratuitos.

## Tu cuenta

Debes tener al menos **18 años** — la mayoría de edad y capacidad legal en Colombia —
y por lo demás poder obligarte contractualmente. Si aceptas en nombre de una empresa,
declaras que tienes facultades para vincularla.

Mantén seguras tus credenciales. **Eres responsable de todo lo que ocurra bajo tu
cuenta y bajo las cuentas de los miembros de tu organización**, incluidas las acciones
que tus asistentes ejecuten por ti. Avísanos de inmediato a **hello@ganju.ai** si
crees que una cuenta fue comprometida.

Entréganos información veraz y mantenla actualizada. Podemos suspender cuentas cuya
información no podamos verificar.

## Organizaciones, proyectos y miembros

Quien crea una organización es su **Propietario**; los demás miembros son
**Administradores**. Los miembros que invites pueden ver y modificar los proyectos,
recursos, herramientas, canales y conversaciones de la organización, según las
membresías de proyecto que les otorgues.

Invita con cuidado — una invitación da acceso al Contenido de Cliente, incluidas las
conversaciones de Usuarios Finales. Eres responsable de a quién dejas entrar y de lo
que haga. Solo el Propietario puede eliminar una organización, y hacerlo **destruye
permanentemente todo lo que contiene**.

Entre tú y nosotros, tu organización es dueña de su Contenido de Cliente. Las disputas
sobre quién dentro de tu organización lo controla te corresponden a ti; nosotros
actuamos según las instrucciones de quien tenga el rol de Propietario.

## Planes, facturación y consumo

### Los planes

| | Gratis | Pro | Empresarial |
| --- | --- | --- | --- |
| Precio | $0 | **USD 20 / mes** más consumo | A convenir |
| Organizaciones propias | 1 | Ilimitadas | Ilimitadas |
| Proyectos | 1 | Ilimitados | Ilimitados |
| Herramientas · prompts · canales por asistente | 7 · 3 · 1 | Ilimitados | Ilimitados |
| Almacenamiento de archivos | 30 MB | Ilimitado | Ilimitado |
| Contenido indexado (buscable) | 5 MB | 5 GB incluidos | A convenir |
| Respuestas del asistente incluidas | 100 / mes | 3.000 / mes | A convenir |
| Invitar compañeros | — | ✓ | ✓ |
| Usar tu propia llave de modelo | — | ✓ | ✓ |

### Cómo funciona la medición

Solo medimos dos cosas, porque son las únicas que nos cuestan dinero: las **respuestas
del asistente** en canales y el **contenido indexado** almacenado como vectores. El
almacenamiento de archivos es gratuito, y las **llamadas a herramientas desde clientes
MCP como Claude, Cursor y ChatGPT están incluidas** en tu plan: nunca se facturan como
respuestas.

Todos los planes incluyen un cupo de respuestas que corren sobre el **modelo
compartido de Ganju**, cuya inferencia pagamos nosotros. Ese cupo no es ilimitado:

- **En Gratis**, al alcanzar el tope mensual tus asistentes dejan de responder hasta
  el siguiente ciclo o hasta que actualices el plan. Gratis no puede usar llave propia.
- **En Pro**, agotado el cupo del modelo compartido, un canal sigue respondiendo solo
  si corre sobre una llave de modelo que hayas agregado. No ofrecemos tarifa plana
  sobre la inferencia de nuestro modelo más allá del cupo incluido.

El contador de respuestas es por organización y cuenta **todas** las respuestas,
incluidas las que corren con tu propia llave. Superados los montos incluidos, el
excedente en Pro es de **USD 2 por cada 1.000 respuestas** — una tarifa de plataforma
por ejecutar cada turno, no una reventa de tokens del modelo, que pagas directamente a
tu proveedor — y **USD 0,50 por GB** de contenido indexado adicional sobre los 5 GB.
El complemento de dominio personalizado cuesta **USD 15 / mes**.

Nos reservamos el derecho de aplicar límites de uso justo a contextos anormalmente
grandes o a volúmenes de solicitudes que hagan inviable atender una cuenta. Te
contactaríamos antes de aplicarlos.

### Pago

Los planes pagos se facturan a través de **Stripe**. Las suscripciones se renuevan
automáticamente cada período hasta que se cancelen, y los cargos por consumo se
facturan al vencimiento del período en que se causaron. **Todos los precios están en
dólares estadounidenses** y no incluyen impuestos; cuando debamos recaudar IVA
colombiano, VAT, impuesto sobre ventas o un gravamen similar, se agrega al momento del
pago. Los costos de conversión de divisa y las comisiones por transacción
internacional de tu banco corren por tu cuenta.

Puedes cancelar en cualquier momento desde el portal de facturación de Stripe. **La
cancelación surte efecto al final del período vigente** — conservas las funciones
pagas hasta entonces y no se reembolsa el remanente. Salvo por el derecho de retracto
que se describe enseguida, las sumas ya pagadas no son reembolsables, excepto cuando
la ley lo exija.

### Derecho de retracto

Si eres **consumidor** en los términos del Estatuto del Consumidor, la Ley 1480 de
2011 (art. 47) te da **cinco (5) días hábiles** contados desde la contratación para
retractarte, por tratarse de una venta a distancia. No necesitas justificar el motivo.

Para ejercerlo, escribe a **hello@ganju.ai** desde el correo de tu cuenta dentro de
ese plazo indicando que ejerces tu *derecho de retracto*. Cancelaremos la suscripción
y **te devolveremos lo pagado dentro de los 30 días calendario** siguientes, por el
mismo medio de pago, como lo exige la norma.

Adicionalmente, el art. 51 de la misma ley y su decreto reglamentario te dan derecho a
solicitar la **reversión del pago** ante tu emisor de tarjeta en los casos allí
previstos, como fraude o servicio no prestado. Nada en estos términos limita ninguno
de estos derechos.

### Falta de pago

Si un pago falla o una suscripción caduca, tu organización **vuelve a los límites del
plan Gratis**, lo que puede pausar las respuestas de los canales y bloquear acciones
que superen esos cupos. No borramos tu contenido por falta de pago, pero puede
volverse inaccesible más allá de lo que permite el plan Gratis hasta que regularices
el pago. Avisaremos con al menos 30 días de anticipación por correo antes de subir el
precio de un plan que estés usando.

## Tu contenido

**Tu contenido es tuyo.** No reclamamos ningún derecho sobre él.

Para prestar el Servicio, nos otorgas una licencia mundial, no exclusiva y libre de
regalías para alojar, almacenar, copiar, transmitir, fragmentar, indexar, mostrar y
procesar tu Contenido de Cliente — y para transmitirlo a los proveedores de modelos,
herramientas y plataformas que hayas configurado — únicamente para prestarte el
Servicio y según se describe en nuestra [Política de Privacidad](/es/privacidad). Esta
licencia termina cuando borras el contenido o tu cuenta, salvo por las copias en
respaldos rutinarios que se rotan según su calendario.

**No usamos tu Contenido de Cliente para entrenar modelos de IA.**

Declaras que cuentas con los derechos sobre todo lo que cargas y que su tratamiento
conforme a lo anterior es lícito — incluidos los datos personales de tus Usuarios
Finales, empleados o clientes. Respecto de ese contenido tú eres el **responsable del
tratamiento** bajo la Ley 1581 de 2012 (y "controller" bajo el RGPD y regímenes
similares) y nosotros actuamos como **encargado**. Nuestro
[Acuerdo de Tratamiento de Datos](/es/dpa) se incorpora a estos términos y aplica
automáticamente a todos los clientes; los proveedores que nos autoriza a usar están en
la [página de subencargados](/es/subencargados).

Eres responsable de conservar tus propias copias. No somos un servicio de respaldo.

## Uso aceptable

No uses el Servicio para nada de lo siguiente, y no permitas que otros lo hagan a
través de tu organización.

**Contenido ilícito o dañino**

- Cualquier cosa contraria a la ley, o contenido que infrinja derechos de propiedad
  intelectual, privacidad o imagen de terceros.
- Software malicioso, phishing, fraude o material de explotación sexual infantil.
- Acoso, amenazas o contenido que promueva la violencia o la autolesión.

**Datos que no deberías estar tratando**

- Datos personales para los que no tengas autorización o base legal, u obtenidos sin
  el consentimiento exigido donde operas.
- Datos sensibles o regulados — historias clínicas, identificadores estatales, datos
  completos de tarjetas de pago, datos biométricos — salvo que cuentes con los
  derechos y garantías que exija la ley aplicable. Ganju no está certificado para
  HIPAA, PCI-DSS ni regímenes equivalentes, y no debes usarlo como si lo estuviera.

**Rastreo, endpoints y solicitudes salientes**

- No rastrees sitios que no sean tuyos o para los que no tengas permiso, y respeta el
  `robots.txt` y los términos de los sitios destino.
- No uses `http-endpoint`, `mcp-proxy`, el rastreador ni las herramientas de búsqueda
  web para escanear, sondear o alcanzar sistemas a los que no estés autorizado.
  Nuestro filtrado de direcciones privadas y de loopback es una red de seguridad, no
  una autorización.
- No enrutes tráfico a través de Ganju para ocultar su origen o evadir un bloqueo.

**Mensajería y automatización**

- Nada de spam, correo masivo no solicitado ni mensajería que infrinja normas
  antispam, de protección de datos o de telemercadeo — tampoco a través de las
  herramientas de Gmail, Outlook o Slack.
- Cumple los términos de cada plataforma de chat que conectes. Telegram, Slack, Meta
  (WhatsApp) y Discord tienen sus propias reglas para bots, y romperlas puede hacer
  que ellos terminen tu integración, no solo nosotros.
- Cuando la ley lo exija, informa a los Usuarios Finales que están hablando con un
  asistente automatizado. No construyas asistentes diseñados para engañar a las
  personas sobre si son humanos.

**El Servicio mismo**

- No intentes alcanzar datos de otro cliente, evadir la autenticación ni sondear
  nuestra infraestructura sin autorización escrita (los reportes responsables de
  vulnerabilidades a **hello@ganju.ai** son bienvenidos).
- No eludas los cupos del plan, los límites de tasa ni la medición — incluido repartir
  el consumo entre varias cuentas para no llegar al tope.
- No revendas, sublicencies ni ofrezcas el Servicio alojado como propio. (¿Quieres
  operar tu propia instancia? La licencia Apache-2.0 te lo permite, gratis.)
- No sobrecargues el Servicio ni interfieras con el uso de otras personas.

**Usos de alto riesgo**

Ganju no está diseñado ni certificado para usos en los que una falla pueda causar
muerte, lesiones personales o daños ambientales o financieros graves — diagnóstico o
tratamiento médico, sistemas de control críticos para la seguridad, respuesta a
emergencias, o decisiones legales o financieras automatizadas sin revisión humana. No
lo uses así.

## Cuentas y servicios de terceros

Cuando conectas Gmail, Google Drive, Google Calendar, Outlook, OneDrive, Slack,
Cal.com, Tavily, una plataforma de chat, un proveedor de modelos, un servidor MCP
remoto o tu propio endpoint HTTP, autorizas a Ganju a actuar sobre esas cuentas con
los permisos que otorgues.

Eres responsable de esas cuentas, de cumplir los términos de cada proveedor y de las
llaves que ingreses. Esos servicios son independientes de nosotros: no los
controlamos, no garantizamos su disponibilidad ni sus resultados y **no respondemos
por lo que hagan, cambien o cobren**. Si un proveedor suspende o modifica el acceso,
las funciones que dependan de él pueden dejar de operar, y eso no constituye un
incumplimiento nuestro.

## Resultados de IA y acciones automatizadas

Los asistentes generan resultados usando modelos de lenguaje. **Esos resultados pueden
ser incorrectos, incompletos, sesgados o inventados, incluso cuando suenan seguros.**
Revisa todo aquello en lo que vayas a confiar. No constituyen asesoría profesional,
legal, médica ni financiera.

Más importante aún: las herramientas ejecutan **acciones reales e irreversibles en el
mundo** — enviar y borrar correos, crear y cancelar eventos de calendario, agendar
reuniones, publicar en Slack y Discord, subir archivos y llamar a cualquier endpoint
HTTP que hayas configurado. Un modelo decide cuándo invocarlas, según lo que pida un
Usuario Final.

Eres responsable de qué herramientas tiene cada asistente, de cómo están configuradas,
de quién puede alcanzarlo y de todas las consecuencias de lo que haga. Otorga los
permisos más estrechos que funcionen. Prueba antes de apuntarlo a algo que importe.

## Disponibilidad, soporte y cambios

Buscamos mantener el Servicio en funcionamiento, pero se presta sin compromiso de
disponibilidad en los planes Gratis y Pro. Los compromisos de disponibilidad
empresariales, si los hay, constan en un acuerdo aparte. Podemos realizar
mantenimiento, y procuraremos programar los trabajos disruptivos con consideración.

Podemos agregar, cambiar o retirar funciones. Si retiramos o degradamos de forma
sustancial algo de lo que dependes, o si descontinuamos el Servicio, avisaremos con al
menos 30 días de anticipación por correo para que puedas exportar tu contenido. Las
funciones marcadas como beta o experimentales pueden cambiar o desaparecer sin previo
aviso y no tienen compromiso de disponibilidad.

Los niveles de soporte son los que describe la [página de precios](/es/precios) para tu
plan.

## Suspensión y terminación

**Tú** puedes dejar de usar el Servicio cuando quieras. Cancela la suscripción en el
portal de facturación, y elimina tus organizaciones desde **Configuración → Zona de
peligro** cuando quieras que el contenido desaparezca. Exporta antes lo que quieras
conservar — el borrado se propaga y es irreversible.

**Nosotros** podemos suspender o terminar una cuenta u organización si incumples estos
términos, si un pago falla y no se regulariza, si la ley nos obliga, o si el uso
continuado representa un riesgo real para el Servicio o para otras personas. Salvo que
el incumplimiento sea grave o que esperar cause daño, te avisaremos primero y te
daremos una oportunidad razonable de corregirlo.

Tras la terminación podemos eliminar tu Contenido de Cliente. Las secciones que por su
naturaleza deban subsistir — la licencia sobre respaldos ya realizados, la exclusión
de garantías, la limitación de responsabilidad, la indemnidad y la ley aplicable —
sobreviven a la terminación.

## Propiedad intelectual

El código fuente de Ganju está licenciado bajo Apache-2.0; consulta la
[licencia](https://www.apache.org/licenses/LICENSE-2.0) y el archivo `NOTICE` del
repositorio. Esa licencia te da derechos sobre el código, no sobre nuestra
infraestructura alojada.

El nombre, el logo y la marca **Ganju** son nuestros. Apache-2.0 no otorga derechos de
marca, y nada aquí lo hace tampoco. No uses nuestras marcas de forma que sugiera que
respaldamos u operamos tu producto.

## Sugerencias

Si nos envías ideas, reportes de errores o sugerencias, podemos usarlos sin
restricción, atribución ni pago. Conservas los derechos que tuvieras sobre ellos;
simplemente no queremos una disputa por haber lanzado una función que alguien sugirió.

## Exclusión de garantías

**El Servicio se presta "tal cual" y "según disponibilidad", sin garantías de ningún
tipo**, expresas o implícitas, incluidas las de comerciabilidad, idoneidad para un
propósito particular, titularidad y no infracción.

No garantizamos que el Servicio sea ininterrumpido, seguro o libre de errores, que los
defectos se corrijan, que la recuperación devuelva el contenido correcto, ni que los
resultados del modelo sean exactos o adecuados para tu propósito.

Nada de esto limita la responsabilidad que no puede limitarse legalmente, ni las
garantías legales que el Estatuto del Consumidor reconoce a los consumidores en
Colombia.

## Limitación de responsabilidad

En la máxima medida permitida por la ley, ninguna de las partes responderá por daños
indirectos, incidentales, especiales, consecuenciales o punitivos, ni por lucro
cesante, pérdida de ingresos, de reputación o de datos, cualquiera sea su causa.

**Nuestra responsabilidad total agregada derivada de estos términos o del Servicio se
limita al mayor de: (a) las sumas que nos hayas pagado en los 12 meses anteriores al
hecho que origina la reclamación, o (b) USD 100.** Si estás en el plan Gratis, eso
equivale a USD 100.

Esta distribución del riesgo es un elemento esencial del acuerdo entre las partes y
aplica aun si un remedio limitado falla en su propósito esencial. No aplica a los
derechos irrenunciables que la ley reconozca a los consumidores.

## Indemnidad

Nos defenderás, indemnizarás y mantendrás indemnes frente a reclamaciones, daños,
pérdidas y costos legales razonables derivados de tu Contenido de Cliente, de tu uso
del Servicio, de las acciones que ejecuten tus asistentes, de tu incumplimiento de
estos términos o de tu violación de cualquier ley o derecho de terceros — incluidas
las reclamaciones de tus Usuarios Finales o de un proveedor cuya cuenta hayas
conectado. Te notificaremos oportunamente de cualquier reclamación y te daremos
cooperación razonable y el control de la defensa, siempre que no se acuerde ninguna
transacción que nos imponga obligaciones sin nuestro consentimiento.

## Ley aplicable y controversias

Estos términos se rigen por las leyes de la **República de Colombia**, sin atender a
sus normas de conflicto de leyes, y no aplica la Convención de las Naciones Unidas
sobre Contratos de Compraventa Internacional de Mercaderías. Los jueces competentes de
**Bogotá, D.C., Colombia** tienen jurisdicción exclusiva y ambas partes aceptan ese
foro — salvo que cualquiera podrá solicitar medidas cautelares ante un juez competente
para proteger su propiedad intelectual o su información confidencial.

Si eres consumidor, nada aquí te priva de la protección de las normas imperativas de
consumo de tu país de residencia ni de tu derecho a demandar ante tus jueces locales.
Los consumidores en Colombia conservan todos los derechos del Estatuto del Consumidor
(Ley 1480 de 2011), incluido el de presentar quejas ante la Superintendencia de
Industria y Comercio, y esos derechos prevalecen sobre cualquier disposición de estos
términos que los contradiga.

Antes de iniciar una acción, escríbenos a **hello@ganju.ai**. La mayoría de las
controversias son un malentendido que una conversación resuelve más rápido que un
juzgado.

## Cambios a estos términos

Podemos actualizar estos términos a medida que cambien el producto y la ley. La fecha
de "Última actualización" siempre refleja la versión vigente. Ante cambios
sustanciales avisaremos por correo a los propietarios de las cuentas con al menos 30
días de anticipación. Seguir usando el Servicio después de esa fecha significa que
aceptas los nuevos términos; si no estás de acuerdo, cancela antes.

## Generalidades

- **Acuerdo íntegro.** Estos términos, la [Política de Privacidad](/es/privacidad) y
  cualquier orden de servicio empresarial constituyen el acuerdo completo entre las
  partes sobre esta materia y reemplazan lo dicho antes. Si un acuerdo empresarial
  contradice estos términos, prevalece aquel.
- **Cesión.** No puedes ceder estos términos sin nuestro consentimiento escrito.
  Nosotros podemos cederlos a una filial o en el marco de una fusión, adquisición o
  venta de activos.
- **Divisibilidad.** Si una disposición resulta inexigible, se limita o elimina en la
  medida mínima necesaria y el resto continúa vigente.
- **No renuncia.** No ejercer un derecho no equivale a renunciar a él.
- **Fuerza mayor.** Ninguna parte responde por demoras causadas por hechos fuera de su
  control razonable, incluidas caídas de proveedores, fallas de red y actos de
  autoridad.
- **Partes independientes.** Estos términos no crean sociedad, agencia ni relación
  laboral.
- **Notificaciones.** Te contactaremos al correo de tu cuenta; contáctanos a
  **hello@ganju.ai**.

## Contacto

- **Correo** — hello@ganju.ai
- **Teléfono** — +57 312 4678519
- **Dirección** — Ganju S.A.S., Bogotá, D.C., Colombia
- **Formulario** — [ganju.ai/contact](/es/contacto)
