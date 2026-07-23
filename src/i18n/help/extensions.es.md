# Extensiones

Muchas funciones de la aplicación son extensiones integradas y pueden activarse o desactivarse individualmente. El núcleo — editor, pestañas y ventanas, gestión de archivos, modos de vista, marco de la barra lateral, configuración, manual, tema, idiomas y el renderizado base CommonMark — no es desactivable a propósito; la aplicación permanece así siempre operativa.

## Activar y desactivar

La sección Extensiones de la configuración (Archivo → Configuración → Extensiones) lista todas las extensiones integradas en tres categorías:

- **Renderizado** — construcciones Markdown como callouts, notas al pie, resaltado, tipografía, tablas Perspective, fórmulas KaTeX, diagramas Mermaid o resaltado de sintaxis.
- **Conexiones** — enlaces wiki, incrustaciones wiki, etiquetas y autocompletado.
- **Herramientas** — linter de Markdown, marcadores, modo de enfoque con desplazamiento de máquina de escribir, estadísticas de palabras y botón de copiar código.

Cada fila muestra un nombre y una breve descripción. Los cambios surten efecto con Aplicar u OK: de inmediato, sin reiniciar y en todas las ventanas.

## Efecto del estado desactivado

- **Extensiones de renderizado:** la sintaxis se muestra como texto sin formato o Markdown estándar. `==resaltado==` queda por ejemplo como texto visible, y un bloque Mermaid se convierte en un bloque de código normal.
- **Paneles y accesos:** los paneles laterales, botones de la barra de estado, entradas de menú y atajos asociados desaparecen; no quedan controles muertos.
- **Secciones de configuración:** si una extensión aporta su propia sección de configuración (por ejemplo los estados de tareas), esta solo aparece en la navegación mientras la extensión está activa.

## Dependencias

Algunas extensiones se apoyan en otras: las incrustaciones wiki necesitan los enlaces wiki. Si se desactiva la base, las extensiones dependientes se desactivan con ella; la sección muestra entonces la indicación «Desactivado por dependencia». La extensión dependiente conserva su propio interruptor y vuelve a surtir efecto en cuanto la base se reactiva.

## Los datos se conservan

Desactivar no borra nada: el árbol de marcadores, las definiciones de estados de tareas, la visibilidad de los paneles, los atajos propios y el resto de la configuración permanecen guardados y regresan al activar.

## Extensiones externas

Además de las extensiones internas, la aplicación también carga paquetes de extensión externos creados por ti. Se gestionan en la sección de configuración Extensiones (externas): los paquetes recién detectados están desactivados, la activación requiere una confirmación explícita en el diálogo de advertencia (el código de terceros obtiene acceso completo a los documentos y a la aplicación) y los paquetes defectuosos se desactivan automáticamente. Cómo crear un paquete propio se describe en la página [Crear extensiones](extensions-dev.md).
