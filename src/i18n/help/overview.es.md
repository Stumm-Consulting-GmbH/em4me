# Manual

![EM4me](../assets/em4me-logo.svg)

_extended memory for me_

Bienvenido al manual de EM4me. Esta página de resumen es el punto de entrada; cada sección se abre en su propia pestaña y se comporta como cualquier otra: muévela, colócala en la segunda columna o mantenla abierta junto a tu propio trabajo.

## Referencia

- [Funciones](functions.md) — todas las funciones de la aplicación en una tabla: qué hacen y cómo se accede a ellas.
- [Atajos de teclado](shortcuts.md) — los atajos actualmente activos, incluidas tus propias reasignaciones.

## Escribir Markdown

- [Bases de Markdown](markdown-basics.md) — el núcleo Markdown: encabezados, énfasis, listas, tablas, enlaces, más particularidades de CommonMark.
- [Menú contextual del editor](context-menu.md) — dar formato con clic derecho: estructura del menú, semántica de selección, alternadores con marcas, solo lectura y modo live.
- [Barra de formato](toolbar.md) — dar formato con botón: visibilidad en modo edición, indicación de estado, menú de encabezado, cuadrícula de tabla, asignación personalizada.
- [Construcciones de bloque](blocks.md) — callouts, contenedores personalizados, listas de definición, bloques de líneas, notas al pie.
- [Construcciones en línea](inline.md) — resaltado, subíndice/superíndice, subrayado, spoiler, Critic Markup, spans y abreviaturas.
- [Listas de tareas](tasks.md) — listas de tareas con estados estándar y ampliados.
- [Recordatorios](reminders.md) — momentos de aviso en tareas con ⏰: diálogo de notificación y de recuperación, lista de recordatorios; el aviso solo funciona con la aplicación en ejecución.
- [Imágenes](images.md) — sintaxis de imágenes, tamaños, figuras implícitas.
- [Matemáticas y diagramas](math-diagrams.md) — fórmulas KaTeX, diagramas Mermaid, bloques de código con resaltado de sintaxis.
- [Emoji](emoji.md) — funcionamiento de los códigos y selección curada.

## Conectar y gestionar

- [Enlaces](linking.md) — enlaces wiki, anclas, incrustaciones, etiquetas y autocompletado.
- [Subpáginas](subpages.md) — jerarquía de páginas mediante nombres de archivo: separador ∕ (U+2215), enlaces relativos, ruta de navegación y renombrado en cascada.
- [Vista de grafo](graph.md) — relaciones de enlaces como grafo interactivo: grafo del área como pestaña, grafo del archivo como panel con profundidad y dirección.
- [Frontmatter y propiedades](frontmatter.md) — metadatos YAML y la barra Propiedades.
- [Perfiles de propiedades](property-profiles.md) — definiciones de campos centralizadas con tipo, rango de valores y valor predeterminado: archivos de perfil, asignación y perfil estándar, efecto en ambos editores de propiedades.
- [Consulta Perspective](frontmatter-query.md) — listas y tablas de archivos dinámicas: lenguaje de cláusulas, fuentes, campos de archivo, funciones, ordenación, multicolumna, exportación.
- [Bloques de script](scripts.md) — JavaScript en el documento: sandbox aislado, modelo de confianza desactivado por defecto, API pq de solo lectura con funciones de datos, salida y ayuda, ejemplos.
- [Plantillas](templates.md) — aplicar plantillas Markdown: carpeta de plantillas con anulación por área, marcadores con diálogos, destino del cursor, reglas de carpeta.
- [Diarios](journals.md) — documentos periódicos por área: estanterías y granularidades, esquemas de carpeta y nombre, panel de calendario, bloque de navegación, propiedades de fecha automáticas.
- [Barra lateral](sidebar.md) — organizar paneles: lado, orden, grupos de pestañas, anchuras.
- [Esquemas de color](color-schemes.md) — colores mediante ranuras con nombre: asignación por modo, esquemas propios como copia, vista previa en vivo, límites.
- [Aplicaciones, ventanas y áreas](apps-windows.md) — inicio múltiple, gestión de ventanas y sistemática de títulos.
- [Historial del documento](history.md) — registrar cambios: archivo acompañante Markdown-Data, interruptores en tres niveles, comparar y restaurar revisiones.
- [Notas del documento](notes.md) — una nota por documento: panel de barra lateral con vista previa conmutable, guardado automático en el archivo acompañante, distinción del historial.
- [Propiedades de bloque](block-properties.md) — propiedades tipadas por ancla de bloque: panel que sigue al cursor, datos huérfanos, renombrado de anclas, indicador en el bloque.
- [Herramientas](tools.md) — linter Markdown, búsqueda con regex, buscar y reemplazar, editor de tablas.
- [Colocación de comandos](command-placement.md) — comandos como accesos propios permanentes: botones de la barra de estado, lista de ocultación, entradas de menú contextual, macros.
- [Extensiones](extensions.md) — activar o desactivar funciones individualmente: categorías, dependencias, efecto del estado desactivado.
- [Crear extensiones](extensions-dev.md) — desarrollar extensiones externas propias: manifiesto, API de extensiones, ejemplo de referencia, avisos de seguridad.
- [Perspective Table](perspective-table.md) — tablas con celdas-bloque multilínea: sintaxis, ejemplos, ordenación, exportación.
- [Perspective Datatable](datatable.md) — tabla de datos tipada con funciones de cálculo: tipos de columna, agregados, columnas calculadas, edición en cuadrícula, ordenación y filtrado.
- [Eventos](events.md) — citas, cumpleaños y aniversarios en el documento: bloque de eventos con diferencias de tiempo escalonadas, hitos, filtros y cuatro vistas, agregación mediante frontmatter, vínculos.
- [Sistemas de calendario](custom-calendars.md) — cronologías libremente definibles por área: bloques con calendarios paralelos, niveles con cinco tipos de relación, épocas, conversión, sintaxis de valores en el documento y selector.

## Consejos de uso

- Todas las páginas del manual son de solo lectura; las cuatro vistas (Renderizado, Dividido, Código, En vivo) se pueden elegir libremente.
- La **vista dividida** muestra el código Markdown y el resultado renderizado uno junto al otro — ideal para comparar los ejemplos de sintaxis de las páginas temáticas con su resultado.
- El **índice** de la barra lateral navega dentro de una página; la **búsqueda de texto completo** (predeterminado `Ctrl+F`) la recorre.
- Al cambiar el idioma en la barra de estado, las páginas del manual abiertas cambian inmediatamente.
- Las novedades, la hoja de ruta y la versión actual están en el sitio web del producto [em4me.ch](https://em4me.ch/es/). El enlace se abre en el navegador predeterminado.
