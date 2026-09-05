---
title: Endpoints HTTP
description: Apunta el asistente a una API que ya tienes — describe una petición y se vuelve una herramienta con nombre, sin código y sin despliegue.
order: 38
updated: 2026-09-05
---

Los **endpoints HTTP** convierten una API que ya tienes en una herramienta.
Describes una petición — método, URL, encabezados, argumentos — y se registra como
una herramienta con nombre que el modelo puede llamar. Sin código, sin bundle,
sin paso de despliegue.

Este es el escalón intermedio entre el catálogo y las
[funciones](/es/docs/tools/functions): más flexible que una integración que
traigamos nosotros, y mucho menos trabajo que escribir una. Además es la
herramienta personalizada disponible en **todos los planes**, incluido Free.

## La pestaña

![La página de Herramientas en la pestaña HTTP Endpoints, vacía, con un botón New endpoint](/images/new-http-function.webp)

Cada endpoint que agregas se vuelve su propia herramienta, listada aquí con un
interruptor y un borrar. **Apagar conserva la fila y todo lo configurado en ella;
Eliminar se lleva la configuración** — usa el interruptor cuando quieras que la
herramienta se calle, y la papelera cuando ya no la necesites.

## Agregar un endpoint

**New endpoint** abre un formulario, con un selector **JSON** en la esquina para
quien prefiera escribir toda la configuración de una vez.

![El diálogo Add HTTP endpoint con método, URL, encabezados, entradas, autenticación y opciones avanzadas desplegadas](/images/new-http-function-advanced-options.webp)

### La petición

- **Método y URL** — usa `{{arg}}` en cualquier parte de la URL para insertar una
  entrada.
- **Encabezados** y **parámetros de consulta** — valores fijos, o marcadores
  `{{arg}}` que se llenan al momento de la llamada.
- **Entradas (argumentos del modelo)** — lo que el modelo provee cuando llama a la
  herramienta. Cada una lleva nombre, tipo y descripción; la descripción es cómo
  el modelo sabe qué poner ahí.
- **Cuerpo** — para `POST`/`PUT`/`PATCH`, una plantilla armada con los mismos
  marcadores.

### Autenticación

Elige un **tipo de autenticación** y la credencial se guarda cifrada, se aplica
justo antes de que salga la petición, y nunca se te devuelve ni se le muestra al
modelo. Un bearer token, un encabezado con llave de API, autenticación básica — o
**OAuth**, que deja a un endpoint reutilizar una cuenta que ya conectaste en el
[catálogo](/es/docs/tools/catalog) en lugar de guardar una segunda copia de la
misma credencial.

### Opciones avanzadas

- **Tipo de respuesta** — detección automática, o forzar JSON o texto.
- **JSON path** — extrae un subárbol, p. ej. `data.items`, para que el modelo
  reciba la parte que necesita y no el sobre completo.
- **Esquema de salida** — opcional. Si declaras uno, una respuesta JSON llega al
  cliente MCP como **salida estructurada** en vez de texto. La respuesta debe ser
  entonces un objeto JSON, o la llamada se reporta como error.
- **Estados de éxito** — separados por comas, p. ej. `200, 201`. Por defecto,
  cualquier 2xx.
- **Timeout** — por defecto 10.000ms, máximo 30.000.
- **Hosts permitidos** — una lista separada por comas. Los hosts privados y de
  loopback siempre están bloqueados, diga lo que diga este campo.

## Cómo corre una llamada

Cuando el modelo decide usar la herramienta, Ganju llena tus marcadores con sus
argumentos, aplica la credencial guardada y hace la petición desde nuestra
infraestructura. La respuesta — acotada por tu JSON path, moldeada por tu esquema
de salida — vuelve al modelo para que termine su respuesta.

Cada petición se filtra contra SSRF, así que un endpoint nunca se puede apuntar a
una dirección interna, y tiene límite de tasa para que un modelo hablador no
sature tu servicio. Los fallos vuelven marcados como errores y no como texto que
casualmente empieza con "Error", que es lo que permite al modelo distinguir "la
llamada falló" de "la respuesta es no".

## Cuándo usar cuál

| | Usa |
| --- | --- |
| El proveedor está en nuestro catálogo | **[Catálogo](/es/docs/tools/catalog)** — conectas una vez y listo |
| El proveedor publica un servidor MCP remoto | **Catálogo** → conecta el servidor y obtén todo su conjunto mantenido |
| Una petición contra tu propia API | **Endpoints HTTP** |
| Varios pasos, una transformación, ramificaciones o combinar una credencial con lógica | **[Funciones](/es/docs/tools/functions)** |

## Límites

Free permite **3 endpoints** por asistente. Pro y Enterprise son ilimitados. Las
llamadas a endpoints HTTP no se miden como llamadas de herramienta — solo se miden
los despachos a [tu propio código](/es/docs/tools/functions).
