# Menú contextual del editor

Un clic derecho en el editor abre un menú contextual que hace accesibles las construcciones de formato, párrafo e inserción directamente sobre el texto. Está disponible en modo código y en modo live. Los accesos y los atajos predeterminados están en la [tabla de funciones](functions.md).

## Estructura

De arriba abajo, el menú se divide en seis grupos:

- **Enlace** — envolver la selección como enlace wiki o como enlace externo.
- **Formato** — nivel de carácter: negrita, cursiva, tachado, resaltado, código, fórmula, comentario y «quitar formato».
- **Párrafo** — nivel de línea: lista con viñetas, lista numerada, lista de tareas, encabezado 1 a 6, sin encabezado y cita.
- **Insertar** — plantillas: nota al pie, tabla, bloque de aviso, línea horizontal y bloque de código.
- **Tabla** — operaciones de edición para la tabla en el cursor; aparece solo cuando el cursor está dentro de una tabla.
- **Portapapeles** — cortar, copiar, pegar, seleccionar todo.

Los atajos predeterminados para negrita (`Ctrl+B`) y cursiva (`Ctrl+I`) también funcionan sin el menú; todas las demás acciones pueden asociarse a un atajo en la configuración.

## Semántica de selección

Los formatos de carácter siguen la selección:

- Con una selección, la acción se aplica a los caracteres seleccionados.
- Sin selección, toma la palabra bajo el cursor.
- Si el cursor no está dentro de una palabra, se inserta un par de marcadores vacío y el cursor se coloca entre ellos.

Los espacios iniciales y finales quedan fuera de los marcadores.

## Alternadores y marcas de verificación

Todas las acciones de formato y párrafo son alternadores: si el formato ya está aplicado, la misma acción lo quita. Al cambiar el tipo de lista, el prefijo existente se reemplaza en lugar de apilarse. El submenú Párrafo indica con una marca de verificación qué estado está activo para la línea del cursor, por ejemplo un nivel de encabezado concreto o «sin encabezado».

## Varias líneas

Si la selección abarca varias líneas, una acción de párrafo se aplica a todas. Una lista numerada se numera de forma consecutiva.

## Submenú Tabla

Cuando el cursor está dentro de una tabla, aparece además el grupo **Tabla** con un submenú; fuera de las tablas no está. Las operaciones actúan sobre la tabla en el cursor y funcionan en ambos tipos de tabla, la tabla pipe y la [Perspective Table](perspective-table.md):

- **Alineación** — alinear la columna a la izquierda, al centro o a la derecha; una marca de verificación indica la alineación actual de la columna del cursor.
- **Filas** — mover hacia arriba o abajo, insertar debajo, eliminar.
- **Columnas** — mover a la izquierda o a la derecha, insertar a la derecha, eliminar.
- **Transponer** — intercambiar filas y columnas; la fila de encabezado se convierte en la primera columna.

Cada operación es un único paso de deshacer. Los destinos no posibles aparecen atenuados: la fila de encabezado y la fila de separación de una tabla pipe no se pueden mover ni eliminar, y la última columna no se puede eliminar. Al intervenir, las tablas pipe se reescriben con formato (pipes exteriores, columnas alineadas con espacios); esto también vale para las tablas sin bordes. En las tablas Perspective, las operaciones de fila trabajan sobre las secciones `|-`; las operaciones de columna y la transposición solo son posibles allí sin `colspan`/`rowspan` y, de lo contrario, se rechazan con un aviso. Todas las operaciones están también en la paleta de comandos y pueden asociarse a atajos; la extensión «Herramientas de tabla» desactiva el submenú y sus comandos.

## Protección en enlaces y código

Dentro de un destino de enlace wiki y dentro de código en línea, las acciones de formato quedan deliberadamente sin efecto, porque los marcadores destruirían la estructura allí. «Quitar formato», en cambio, sigue limpiando en esos lugares.

## Editor de solo lectura

Si el editor es de solo lectura, es decir, una vista sin modo edición, el menú muestra solo copiar y seleccionar todo; los grupos enlace, formato, párrafo e inserción se omiten.
