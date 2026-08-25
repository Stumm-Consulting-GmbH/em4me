# Utilidad y formas de trabajar

Esta página no responde **cómo** se hace algo, sino **para qué sirve**. Tiene dos mitades: las primeras cinco secciones muestran qué **formas de trabajar** abre la aplicación, desde el documento suelto hasta un espacio de trabajo con nombre. La segunda mitad muestra qué puede **expresar** un archivo Markdown más allá del estándar Markdown. Donde la cosa se vuelve concreta, un enlace al final de cada sección lleva a la página que trata el asunto en detalle.

## Un documento, tal como lo necesitas ahora

Leer, escribir y revisar son actividades distintas y requieren presentaciones distintas del mismo texto. En lugar de imponer un compromiso, la aplicación mantiene cinco vistas listas y una tecla basta para cambiar entre ellas: la página terminada para leer, el código fuente para el trabajo preciso, ambos en paralelo para comparar, el modo en vivo para escribir con fluidez y el mapa mental para ver la estructura. El cambio no cuesta nada y nunca modifica el archivo.

- **Renderizada** para leer, **código fuente** para el trabajo preciso con la sintaxis.
- **Dividida** muestra fuente y resultado uno junto al otro, para construcciones delicadas.
- **En vivo** da formato mientras escribes y muestra los caracteres Markdown solo en la línea actual.
- **Mapa mental** convierte la estructura de títulos en un árbol.

En detalle: [Vistas y presentación](views-display.md), [Vista de mapa mental](mindmap.md).

## Muchos documentos uno junto a otro

Una idea rara vez cabe en un solo archivo. Por eso hay varios documentos abiertos a la vez, en pestañas que se pueden ordenar: los grupos de color mantienen unido lo que va junto, la segunda columna coloca dos documentos en paralelo, y la barra lateral mantiene a la vista el índice, los retroenlaces, las notas o las tareas mientras escribes. Todo esto lo decides tú, no el programa: los paneles se mueven entre el lado izquierdo y el derecho, y anchos y alturas se quedan como los has ajustado.

- **Pestañas** para cuantos documentos abiertos quieras, con selección múltiple y posición a elegir.
- **Grupos de pestañas** que agrupan por color los documentos relacionados.
- **Dos columnas** en la misma ventana para origen y destino, borrador y plantilla, capítulo y nota.
- **Paneles laterales** a la izquierda o a la derecha, con orden, ancho y alto libremente ajustados.

En detalle: [Aplicaciones, ventanas y áreas](apps-windows.md), [Barra lateral](sidebar.md).

## Más de una ventana, más de un contexto

Quien trabaja en varias cosas a la vez no llega lejos con una sola ventana. Una pestaña pasa a una ventana nueva desde el menú contextual, y varias ventanas pertenecen a una aplicación, el contexto de trabajo común. De estas se pueden iniciar varias: cada aplicación tiene sus propias ventanas y su propia numeración, de modo que dos proyectos nunca se estorban, aunque ambos usen la misma aplicación. En el siguiente inicio, la restauración de sesión devuelve el conjunto.

- **Ventanas** en número libre, las pestañas viajan entre ellas.
- **Aplicaciones** como contextos de trabajo autónomos con sus propias ventanas.
- **Restauración de sesión** que recupera aplicaciones, ventanas y pestañas.

En detalle: [Aplicaciones, ventanas y áreas](apps-windows.md).

## Orden por límites, orden por memoria

Hay dos formas distintas de orden, y vale la pena conocer la diferencia. Un **área** vincula una aplicación a una carpeta y la convierte en límite: el diálogo de apertura, la lista de recientes, el guardado y la búsqueda se quedan dentro, de manera que un proyecto confidencial nunca se desborda por descuido hacia otro. Un **espacio de trabajo**, en cambio, recuerda un estado: todas las ventanas, pestañas, grupos y borradores bajo un nombre, mantenidos al día sin paso de guardado. Al abrirlo semanas después vuelves exactamente al punto donde lo dejaste. Ambos se pueden combinar.

- **Área** significa límite de carpeta: lo que queda fuera no entra.
- **Espacio de trabajo** significa estado de trabajo guardado, con nombre y color.
- **Ambos juntos** dan un estado de trabajo con nombre y con un límite de carpeta fijo.

En detalle: [Aplicaciones, ventanas y áreas](apps-windows.md).

## De archivos nace un libro

Una obra larga consta de muchos archivos, y su orden reside si no en el nombre del archivo o en la ubicación de la carpeta, donde cada cambio de nombre vuelve a ponerlo en cuestión. Un libro le da la vuelta a esto y escribe su estructura de forma explícita: los capítulos siguen siendo archivos Markdown corrientes, legibles incluso sin la aplicación, pero su orden y anidamiento quedan fijados, el índice los muestra y la guía de lectura recorre la obra entera más allá de los límites de capítulo. Las estanterías agrupan varios libros.

- **Orden de lectura declarado** en lugar de una ordenación alfabética por nombre de archivo.
- **Los capítulos siguen siendo archivos**, legibles por separado y utilizables en otro sitio.
- **Guía de lectura** continua, el índice reordena arrastrando o con el teclado.
- **Estanterías** que agrupan varios libros.

En detalle: [Libros](books.md).

## Tablas que sostienen más de una línea

Aquí termina la pregunta por las formas de trabajar y empieza la pregunta por lo que el archivo puede expresar. El estándar Markdown no necesita explicación; lo interesante es lo que va más allá, y eso empieza por la tabla. Una tabla estándar se basa en líneas y por eso solo admite texto breve. La Perspective Table admite bloques enteros en una celda: listas anidadas, varios párrafos, bloques de código, imágenes e incluso una tabla dentro de la tabla. Así la tabla se convierte en una herramienta de estructuración para contenidos reales en lugar de una colección de palabras sueltas.

- **Celdas de bloque** con listas, párrafos, código e imágenes en lugar de campos de una sola línea.
- **Anidamiento**, combinación de celdas y alineación para presentaciones exigentes.
- **Ordenación y resaltado de estados** directamente en la tabla renderizada.
- **Legible también en otro sitio:** el bloque sigue siendo un bloque de código limpio en otros programas Markdown en lugar de romper el texto.

En detalle: [Perspective Table](perspective-table.md).

## Tablas que calculan

Para números en lugar de texto está el segundo tipo de tabla. La Perspective Datatable es una tabla de datos tipada: cada columna tiene un tipo de valor, las celdas solo aceptan valores acordes, las filas de agregado calculan en vivo y las columnas calculadas evalúan una expresión por fila. Se edita directamente en la cuadrícula renderizada, sin el rodeo por el código fuente. Eso sostiene gastos, registro de tiempos o inventarios sin convertirse en un archivo de base de datos, porque todo sigue siendo texto plano en el documento.

- **Tipos de valor fijos** por columna, para que los números sigan siendo números y las fechas, fechas.
- **Agregados** que calculan en vivo y **columnas calculadas** por fila.
- **Edición en la cuadrícula**, sin cambiar al código fuente.
- **Calcular también en el texto corrido:** los cálculos en línea usan el mismo lenguaje de expresiones en mitad de la frase.
- **El texto plano sigue siendo texto plano:** los datos están sin cambios en el archivo Markdown.

En detalle: [Perspective Datatable](datatable.md).

## Tipos de documentos que se apoyan unos en otros

Muchos documentos de un área comparten los mismos campos: un estado, una fecha, una categoría. Los perfiles de propiedades describen estos campos una sola vez, de forma centralizada, con tipo, valores permitidos y valor predeterminado; los editores de propiedades los sugieren y ofrecen los rangos de valores como listas de selección. Los perfiles heredan unos de otros: un perfil base dice lo que vale para todos, y un tipo de documento como artículo o reunión añade solo su propia parte, excluye campos heredados si es necesario o los reemplaza. Las desviaciones producen avisos en lugar de bloqueos. Qué perfil rige no tiene que estar escrito en el documento: basta una etiqueta o su carpeta, y un símbolo en el documento muestra cuál ha resultado. También los valores permitidos de un campo pueden venir del propio fondo en lugar de la definición.

- **Describir los campos una sola vez** en lugar de en cada documento: sugerencias, listas de selección y tipos vienen del perfil.
- **Herencia con exclusión y reemplazo:** lo común en el perfil padre, lo propio en el tipo de documento.
- **Avisos suaves en lugar de bloqueos:** las desviaciones se nombran, nada se bloquea.
- **Asignación sin entrada en el documento:** una etiqueta o la carpeta decide qué perfil rige.
- **Listas de valores que se mantienen solas:** los valores permitidos vienen de una nota o de una consulta sobre el fondo.
- **Campos que llevan una estructura:** Una reunión con tres participantes necesita un campo en lugar de tres listas paralelas para nombre, función y empresa; en el bloque de metadatos sigue siendo YAML corriente y legible.

En detalle: [Perfiles de propiedades](property-profiles.md).

## Listas que se mantienen al día

Quien lleva muchos archivos mantiene si no las vistas de conjunto a mano, y envejecen el mismo día. Una consulta Perspective describe en cambio **qué** se busca, y el resultado aparece allí mismo en el documento: una lista o tabla en la que se puede hacer clic sobre todo el conjunto, filtrada por propiedades, etiquetas y campos de archivo, hasta los bloques de texto y las tareas. Si cambia el conjunto, cambia la salida, sin que nadie actualice nada.

- **Páginas temáticas** que listan por sí solas sus archivos asociados.
- **Filtros** por propiedades del frontmatter, etiquetas y campos de archivo.
- **Nivel de bloque y de tarea**, no solo archivos enteros.
- **Cada resultado con enlace** que lleva directo a su destino.

En detalle: [Consulta Perspective](frontmatter-query.md).

## Cuando la consulta no basta: los scripts

Algunos análisis no se pueden formular como condición, por ejemplo un árbol recursivo siguiendo los enlaces o una vista que calcula por el camino. De eso se encargan los bloques de script: un bloque ejecuta un pequeño programa, lee el mismo conjunto que la consulta y produce listas, tablas o texto ya formateado en el documento. Como eso significa más libertad, la función está ligada a un modelo de confianza explícito y a límites de ejecución, y no está simplemente activa de fábrica.

- **Análisis libres** sobre los mismos datos que la consulta.
- **Estructuras recursivas** y vistas calculadas que no se pueden expresar de forma declarativa.
- **Modelo de confianza explícito** y límites de ejecución en lugar de ejecución silenciosa.

En detalle: [Bloques de script](scripts.md).

## Y el resto del lenguaje

Más allá de las cuatro construcciones grandes, el lenguaje aporta más de cincuenta extensiones: bloques de aviso y notas al pie para el texto, fórmulas y diagramas para la presentación, enlaces, etiquetas e inserciones para las relaciones, tareas, recordatorios y citas para la jornada de trabajo, además de plantillas y diarios. Nada de esto es obligatorio: cada extensión tiene su propio interruptor, y lo que está apagado desaparece de menús, comandos y presentación en lugar de estorbar.

- **Extensiones de texto** para bloques de aviso, notas al pie, resaltado y abreviaturas.
- **Presentación** con fórmulas, diagramas y código resaltado.
- **Relaciones** mediante enlaces, anclas, inserciones y etiquetas.
- **Jornada de trabajo** con tareas, recordatorios, citas, plantillas y diarios.
- **Activables una a una** y abierto a extensiones propias mediante una interfaz documentada.

En detalle: [Funciones](functions.md), [Extensiones](extensions.md), [Crear extensiones](extensions-dev.md).
