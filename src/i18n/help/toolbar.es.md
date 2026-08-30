# Barra de formato

La barra de formato es una barra de botones sobre el editor para los gestos de edición frecuentes: formatos de carácter, encabezados, listas, cita, enlaces y tablas. Cada botón desencadena un comando del registro central — los mismos comandos que ejecutan el menú contextual del editor, los atajos de teclado y la paleta de comandos. La barra pertenece a la extensión desactivable «Barra de formato» (categoría Herramientas).

## Visibilidad

La barra aparece exactamente cuando la pestaña activa está en modo edición y la vista muestra un editor (vista Código, Dividida o Live). En la vista de lectura, en las páginas del manual y del sistema y en el modo de enfoque es invisible. En la disposición de ventana dividida, cada columna de editor lleva su propia barra; un clic en la barra de la segunda columna activa a la vez esa columna.

## Asignación estándar e indicación de estado

La asignación estándar agrupa mediante separadores: los formatos de carácter (negrita, cursiva, tachado, resaltar, código), el menú de encabezado, los tipos de lista (lista con viñetas, lista numerada, lista de tareas), la cita, las dos acciones de enlace (enlace wiki, enlace externo) y el botón de tabla. La información sobre herramientas muestra el nombre del comando y el atajo actualmente activo, los nombres visibles propios se anteponen.

Los botones pulsados muestran el estado en la posición del cursor: los botones de lista, encabezado y cita siguen la línea del cursor, los botones de formato de carácter siguen la selección o la palabra bajo el cursor. Pulsado significa aquí: un nuevo clic quita el formato — la indicación y el efecto de alternancia permanecen coincidentes.

## Menú de encabezado

El botón de encabezado abre la selección de nivel: nivel de encabezado uno a seis más «Sin encabezado», con una marca en el nivel de la línea del cursor. El propio botón aparece pulsado en cuanto la línea del cursor es un encabezado.

## Cuadrícula de tabla

El botón de tabla abre una cuadrícula de selección siguiendo el modelo de los procesadores de texto: al pasar por encima se marcan filas por columnas (la etiqueta muestra el tamaño, filas incluida la de encabezado), un clic inserta la tabla vacía con fila de encabezado y fila de separación en el cursor. Deshacer quita la tabla insertada en un solo paso. En todos los demás accesos (menú contextual, paleta, atajo), el comando de tabla inserta sin cambios su plantilla estándar compacta.

Junto a él hay un segundo botón para la [tabla Perspective](perspective-table.md): su icono muestra una tabla con la fila de encabezado combinada, y un clic inserta un esqueleto pequeño e inmediatamente válido con una fila de encabezado y una de datos; el cursor queda después en la primera celda de encabezado. Aquí no hay cuadrícula, porque una tabla Perspective se moldea de todos modos después mediante celdas combinadas. Con la extensión de las tablas Perspective desactivada, el botón no aparece.

## Desbordamiento

Si la asignación no cabe en el ancho de la columna de editor, las entradas finales pasan a un menú de más opciones en el borde derecho de la barra. Las entradas del menú muestran el icono, el nombre y la marca de estado; el menú de encabezado aparece allí como submenú, la entrada de tabla abre la cuadrícula de selección.

## Personalizar la asignación

La sección «Archivo → Configuración… → Barra de formato» gestiona la asignación como una lista: reordenar las entradas (subir/bajar), editarlas y quitarlas; los comandos nuevos se crean en un diálogo de tres pasos (comando mediante búsqueda con filtro, icono del conjunto seleccionado, nombre visible opcional). Los separadores y el menú de encabezado son tipos de entrada propios; «Restablecer al estándar» restablece la asignación estándar. Las entradas cuyo comando pertenece a una extensión desactivada no aparecen en la barra — la configuración se conserva y vuelve con la extensión.

## Delimitación

La barra de formato es el acceso de edición en modo edición. Los [botones propios de la barra de estado](command-placement.md) de la colocación de comandos son accesos permanentemente visibles y de asignación libre en la barra de estado; la paleta de comandos (véase [Herramientas](tools.md)) es el acceso fugaz por teclado a todos los comandos.

## Estado desactivado

Si se desactiva la extensión «Barra de formato», la barra desaparece por completo y la sección de configuración se oculta; todos los comandos de formato siguen accesibles a través del menú contextual, los atajos y la paleta. La asignación permanece guardada y se aplica sin cambios tras volver a activarla.
