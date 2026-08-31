# Precios de Ganju

Empieza gratis, crece cuando estés listo — o instálalo tú mismo sin costo bajo
Apache-2.0.

> Esta es la versión en español de nuestra página de [Pricing](/pricing).

## Gratis — $0/mes

Ideal para proyectos personales y para probar.

- 1 espacio de trabajo, sin compañeros de equipo
- Hasta 7 herramientas, 3 prompts, 1 canal
- 30 MB de archivos · ~5 MB de contenido consultable (con embeddings)
- 100 mensajes de canal / mes en nuestro modelo de IA compartido
- Tu propio enlace de conexión
- Soporte de la comunidad

## Pro — $29/mes + consumo

Para equipos y productos en crecimiento. Una base fija que incluye una cuota; pagas
solo por lo que uses por encima de ella.

- Proyectos, compañeros de equipo, herramientas y prompts ilimitados
- Conecta tu propio modelo de IA (con tu propia llave)
- Incluye 3.000 mensajes de canal/mes — hasta 1.000 con nuestro modelo de IA — más 1 GB de contenido consultable cada mes
- Pasado eso: $2 por cada 1.000 mensajes con tu propia llave de IA, $15 por cada 1.000 con la nuestra · $2 por GB adicional
- Las llamadas a herramientas desde clientes MCP (Claude, Cursor, ChatGPT) están incluidas — no se cobran como mensajes
- Incluye 1.000.000 de llamadas al mes a las funciones que escribes en código; después, 5 USD por millón
- Complemento de dominio propio ($15/mes) · crea tus propias herramientas
- Soporte 24/7

Medimos tres cosas, porque son las únicas que nos cuestan dinero: las respuestas
del asistente en canales (cada una ejecuta un ciclo de llamadas a herramientas con un
LLM), el contenido consultable con embeddings (almacenado como vectores en Postgres)
y las llamadas a las funciones que escribiste en código (que corren en nuestro
cómputo). El almacenamiento de archivos en bruto es gratis, y las llamadas a las
integraciones que incluimos también.

## Empresarial — A la medida

Para organizaciones grandes con necesidades avanzadas.

- Todo lo de Pro
- Usa Ganju como proxy de tu propio servidor MCP
- Dirección web y herramientas a la medida
- SSO y condiciones contractuales
- Soporte dedicado con tiempos de respuesta garantizados

## Instalación propia

Ganju es software libre (Apache-2.0). Córrelo en tu propia cuenta de Cloudflare sin
costo. Código fuente: https://github.com/MontoyaAndres/ganju
