---
title: Endpoints HTTP
description: Apunta tu bot a una API que ya tienes. Describe una petición y se convierte en una herramienta con nombre, sin código y sin despliegue.
order: 38
updated: 2026-11-13
---

Los **Endpoints HTTP** convierten una API que ya tienes en una herramienta.
Describes una petición (método, URL, cabeceras, argumentos) y se convierte en
una herramienta con nombre que el modelo puede llamar. Sin código, sin bundle,
sin paso de despliegue.

Es el escalón intermedio entre el catálogo y las
[funciones](/es/docs/tools/functions/): más flexible que una integración que
ofrecemos, y mucho menos trabajo que escribir código. También es la
herramienta personalizada disponible en **todos los planes**, incluido Free.

Puedes llenar el formulario tú mismo, o pedírselo al
[Asistente](/es/docs/assistant/): puede agregar y cambiar un endpoint HTTP como
parte de un conjunto de cambios que tú aplicas.

## La pestaña

![La pestaña Endpoints HTTP, vacía, con el botón Nuevo endpoint](/images/new-http-function.webp)

Cada endpoint que agregas se convierte en su propia herramienta, listada aquí
con un interruptor, un botón para editar y otro para eliminar. **Apagar
conserva el endpoint y todo lo configurado en él** (la fila muestra **Apagada ·
conserva su configuración**); **Eliminar lo borra con su configuración**. Usa
el interruptor cuando quieras que la herramienta se quede callada, y elimínala
cuando ya no la necesites. En Free, la pestaña muestra cuántos de tus 3
endpoints usaste.

## Agregar un endpoint

**Nuevo endpoint** abre **Agregar endpoint HTTP**. **Formulario** te guía campo
por campo; **JSON** te deja escribir toda la configuración de una vez (para usar
ahí un secreto guardado o una cuenta conectada, pon `auth.credentialId` con su
id).

![El diálogo Agregar endpoint HTTP con método, URL, cabeceras, entradas, autenticación y las opciones avanzadas abiertas](/images/new-http-function-advanced-options.webp)

### Nombre y descripción

- **Nombre de la herramienta**: lo que llama el modelo, p. ej. `lookup-order`.
  Letras, dígitos, `_` o `-`.
- **Descripción**: dile al modelo **cuándo** llamar a esta herramienta. Así es
  como decide.

### La petición

- **Método** (`GET`, `POST`, `PUT`, `PATCH` o `DELETE`) y **URL**. Usa `{{arg}}`
  en cualquier parte de la URL para insertar una entrada.
- **Qué hace**: si la llamada solo lee o cambia algo. El valor por defecto,
  **Según el método** (*GET solo lee, cualquier otro es sensible*), sirve para
  la mayoría de las APIs. Elige **Solo lee** (*consulta, no cambia nada*) para
  un `POST` que solo busca, **Cambia cosas que se pueden deshacer**, o **Envía,
  borra, cobra o no se puede deshacer**. Cuando la organización activa
  [Confirmar acciones sensibles](/es/docs/settings/#confirmar-acciones-sensibles),
  un bot de canal pregunta antes de llamar a un endpoint sensible.
- **Cabeceras** y **Parámetros de consulta**: valores fijos, o marcadores
  `{{arg}}` que se llenan al momento de la llamada.
- **Cuerpo**, para `POST`, `PUT` y `PATCH`: un **Formato** (**Ninguno**,
  **JSON**, **Formulario (urlencoded)** o **Texto**) y una **Plantilla del
  cuerpo** hecha con los mismos marcadores. Una plantilla JSON debe poder
  leerse como JSON una vez llenos los argumentos, p. ej. `{"id":"{{orderId}}"}`.
- **Entradas (argumentos del modelo)**: lo que el modelo aporta al llamar la
  herramienta. Cada una tiene un nombre, un **Tipo** (**Texto**, **Número** o
  **Booleano**), si es **Obligatorio**, y una **Descripción**, que es como el
  modelo sabe qué poner ahí.

### Autenticación

Elige un **Tipo de autenticación**:

| Tipo de autenticación | Qué se envía |
| --- | --- |
| **Ninguna** | Nada. |
| **Token Bearer** | El token guardado, como cabecera `Authorization: Bearer`. |
| **Basic (usuario:contraseña)** | El `usuario:contraseña` guardado, como autenticación básica. |
| **API key** | La clave guardada, en una **Cabecera** o un **Parámetro de consulta** con el **Nombre del parámetro** que elijas. |
| **Cuenta conectada** | Una cuenta que conectaste desde el [catálogo](/es/docs/tools/catalog/). Su token de acceso se renueva y se envía como cabecera Bearer en cada llamada. |

Una clave se guarda cifrada, se aplica justo antes de que salga la petición, y
nunca se te vuelve a mostrar ni se le envía al modelo. Puedes **Agregar secreto
nuevo** con una **Etiqueta** para reconocerlo, o **Usar un secreto existente**
que guardaste antes.

### Opciones avanzadas

- **Tipo de respuesta**: **Detectar automáticamente**, o forzar **JSON** o
  **Texto**.
- **Ruta JSON**: extrae un subárbol, p. ej. `data.items`, para que el modelo
  reciba la parte que necesita y no toda la envoltura.
- **Esquema de salida** (opcional): si declaras uno, una respuesta JSON llega a
  los clientes MCP como **salida estructurada** en vez de texto. La respuesta
  debe ser entonces un objeto JSON, o la llamada se reporta como error.
- **Estados de éxito**: separados por comas, p. ej. `200, 201`. Por defecto,
  cualquier 2xx.
- **Tiempo límite (ms)**: por defecto 10.000, máximo 30.000.
- **Hosts permitidos**: una lista separada por comas. Los hosts privados y de
  loopback siempre están bloqueados, diga lo que diga.

**Agregar endpoint** lo guarda.

## Cómo corre una llamada

Cuando el modelo decide usar la herramienta, Ganju llena tus marcadores con sus
argumentos, aplica la credencial guardada y hace la petición desde nuestra
infraestructura. La respuesta, recortada por tu ruta JSON y con la forma de tu
esquema de salida, vuelve al modelo para terminar su respuesta.

Cada petición se revisa, así que un endpoint nunca puede apuntar a una dirección
interna, y cada endpoint está limitado a 60 llamadas por minuto para que un
modelo insistente no sature tu servicio. Los fallos vuelven marcados como
errores, no como texto que casualmente empieza con "Error", y eso es lo que le
permite al modelo distinguir "la llamada falló" de "la respuesta es no".

## Cuándo usar cuál

| | Usa |
| --- | --- |
| El proveedor está en nuestro catálogo | **[Catálogo](/es/docs/tools/catalog/)**: conecta una vez y listo |
| El proveedor publica un servidor MCP remoto | **Catálogo**: conecta el servidor y obtén todas sus herramientas mantenidas |
| Una petición contra tu propia API | **Endpoints HTTP** |
| Varios pasos, lógica, tu base de datos, o una clave combinada con un cálculo | **[Funciones](/es/docs/tools/functions/)**, escritas por el [Asistente](/es/docs/assistant/) |

## Límites

Free permite **3 endpoints** por proyecto. Pro y Enterprise no tienen límite de
endpoints; cada endpoint encendido sigue contando para las
[herramientas](/es/docs/tools/#encender-y-apagar-herramientas) del proyecto.
Las llamadas a endpoints HTTP no se miden como llamadas a herramientas: solo
cuentan las llamadas a [tu propio código](/es/docs/tools/functions/).
