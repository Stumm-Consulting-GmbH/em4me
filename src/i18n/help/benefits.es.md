# Utilidad y formas de trabajar

Esta página no responde **cómo** se hace algo, sino **para qué sirve**. Tiene dos mitades: la primera mitad muestra qué **formas de trabajar** abre la aplicación, desde el documento suelto hasta un espacio de trabajo con nombre. La segunda mitad muestra qué puede **expresar** un archivo Markdown más allá del estándar Markdown. Donde la cosa se vuelve concreta, un enlace al final de cada sección lleva a la página que trata el asunto en detalle.

## Un documento, tal como lo necesitas ahora

Leer, escribir y revisar son actividades distintas y requieren presentaciones distintas del mismo texto. En lugar de imponer un compromiso, la aplicación mantiene siete vistas listas y una tecla basta para cambiar entre ellas: la página terminada para leer, el código fuente para el trabajo preciso, ambos en paralelo para comparar, el modo en vivo para escribir con fluidez, el mapa mental para ver la estructura, el lienzo para tarjetas sobre una superficie y el tablero para tareas en columnas. El cambio no cuesta nada y nunca modifica el archivo.

- **Renderizada** para leer, **código fuente** para el trabajo preciso con la sintaxis.
- **Dividida** muestra fuente y resultado uno junto al otro, para construcciones delicadas.
- **En vivo** da formato mientras escribes y muestra los caracteres Markdown solo en la línea actual.
- **Mapa mental** convierte la estructura de títulos en un árbol.
- **Lienzo** muestra una superficie con tarjetas y conexiones que se encuentra en el propio documento.
- **Tablero** coloca las tareas del documento una junto a otra, como tarjetas en columnas.

En detalle: [Vistas y presentación](views-display.md), [Vista de mapa mental](mindmap.md), [Superficie Canvas](canvas.md), [Tablero Kanban](kanban.md).

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

- **Área** significa límite de carpeta: lo que queda fuera no entra — con exactamente una excepción, y la pone usted.
- **Espacio de trabajo** significa estado de trabajo guardado, con nombre y color.
- **Ambos juntos** dan un estado de trabajo con nombre y con un límite de carpeta fijo.
- **Las áreas vinculadas** son esa excepción: un prefijo que usted introduce, un sentido, un enlace que cruza. Una puerta, no un límite abierto.

En detalle: [Aplicaciones, ventanas y áreas](apps-windows.md).

## Una red en lugar de un archivador

El conocimiento rara vez crece en carpetas. Crece en conexiones: una nota remite a una segunda, una tercera recoge ambas, y al cabo de un año su material lleva más relaciones de las que una estructura de carpetas podría representar. Esas relaciones se conservan y pueden leerse desde dos lados: como una superficie que muestra qué se conecta con qué, y como un árbol que muestra qué cuelga de un punto de entrada y a qué profundidad.

- **Enlaces en ambos sentidos**: qué nombra este documento y quién nombra este documento.
- **La red** muestra el entorno de un documento; **el árbol**, desde una raíz elegida, el orden que cuelga de ella.
- **Cada archivo exactamente una vez** en el árbol, en su camino más corto hacia la raíz; un clic lo abre.
- **Lo que nadie enlaza** no queda oculto: las estadísticas del área nombran esos archivos.

En detalle: [Conexión](linking.md) y [Vista de grafo](graph.md).

## Cuando el orden ya no basta

Algunas ideas no tienen orden. Colocar alternativas una junto a otra, esbozar un flujo u ordenar relaciones pide superficie en lugar de líneas, y pide decidir uno mismo qué va dónde. Un lienzo es justo eso: una superficie dentro de un archivo Markdown corriente en la que usted dispone libremente tarjetas con texto propio y las une con líneas de color y con rótulo. A diferencia de la vista de grafo no calcula nada, sino que conserva lo que usted ha colocado; y como está dentro del documento, los textos de las tarjetas siguen siendo legibles en cualquier otro programa de texto.

- **Tarjetas con texto propio**, colocadas libremente y de tamaño ajustable; su contenido es Markdown corriente.
- **Conexiones con sentido, color y rótulo**, también con flecha en ambos extremos y con el lado de enganche a elegir.
- **Su disposición sigue siendo suya**: la superficie no calcula posiciones, recuerda lo que usted ha colocado.
- **Texto claro en el documento**: la superficie está en un bloque de código del archivo Markdown y se lee también sin EM4me.
- **También sin ratón**: una lista junto a la superficie enumera todos los elementos y permite crearlos, rotularlos, conectarlos y borrarlos con el teclado, y también buscarlos.
- **Abierto hacia fuera**: una superficie puede guardarse en el formato abierto JSON Canvas y volver a leerse desde él — para el intercambio con otras herramientas.

En detalle: [Superficie Canvas](canvas.md).

## Tareas que se empujan hacia adelante

Quien lleva muchas tareas a la vez no quiere leer lo que falta por hacer, sino ver en qué punto está cada cosa. Un tablero Kanban ordena las tareas de un documento en columnas — por hacer, en curso, hecho, o como llames a los pasos de tu flujo de trabajo — y sus tarjetas se empujan con el ratón de una columna a la siguiente; una columna puede configurarse para marcar enseguida como hecha cada tarea que se arrastre a ella. Todo ello sigue siendo texto corriente en el documento: las columnas son sus títulos, las tarjetas sus líneas de tarea, y lo que está marcado en el tablero lo está igualmente en cualquier otra vista. Un tablero escrito con la herramienta de tableros más extendida para notas Markdown se abre aquí, se edita aquí y se sigue usando allí.

En detalle: [Tablero Kanban](kanban.md).

## De archivos nace un libro

Una obra larga consta de muchos archivos, y su orden reside si no en el nombre del archivo o en la ubicación de la carpeta, donde cada cambio de nombre vuelve a ponerlo en cuestión. Un libro le da la vuelta a esto y escribe su estructura de forma explícita: los capítulos siguen siendo archivos Markdown corrientes, legibles incluso sin la aplicación, pero su orden y anidamiento quedan fijados, el índice los muestra y la guía de lectura recorre la obra entera más allá de los límites de capítulo. Las estanterías agrupan varios libros.

- **Orden de lectura declarado** en lugar de una ordenación alfabética por nombre de archivo.
- **Los capítulos siguen siendo archivos**, legibles por separado y utilizables en otro sitio.
- **Guía de lectura** continua, el índice reordena arrastrando o con el teclado.
- **Estanterías** que agrupan varios libros.

En detalle: [Libros](books.md).

## Cuando un documento supera el tamaño de un archivo

A veces un documento crece más allá de lo que se puede editar con fluidez. En lugar de imponerte un límite, la aplicación divide ese documento en varios archivos al guardarlo y lo vuelve a unir al abrirlo. Tú no notas nada: un texto continuo, un historial de deshacer, un resultado de búsqueda. El corte se realiza solo en encabezados, para que ninguna construcción quede partida, y cada archivo de parte sigue siendo un archivo Markdown corriente, legible sin la aplicación.

- **El tamaño deja de ser un límite**: incluso los documentos muy extensos siguen siendo manejables.
- **Invisible en tu trabajo**: una pestaña, un texto, un resultado de búsqueda.
- **El corte se hace en encabezados**, nunca en medio de una tabla, una lista o un bloque de código.
- **Reversible**: un comando de menú convierte las partes de nuevo en un único archivo.

En detalle: [División de documentos grandes](document-parts.md).

## Datos y prosa en los mismos archivos

Una carpeta de archivos Markdown puede ser al mismo tiempo una base de datos, y no hace falta que la declares: en cuanto un documento describe la base de datos, el área contiene una, y un resumen propio responde en un solo lugar a qué hay en ella, es decir el nombre y la descripción, las tablas con el número de sus campos y las incidencias en claro. Las tablas mismas son archivos corrientes: la definición está en el encabezado, los registros están en el cuerpo debajo, y así una tabla queda completa en un único archivo. La verdadera ganancia está al lado. Desde cualquier texto del área enlazas a una sola fila de una tabla, igual que enlazas a un archivo en otro sitio; la nota sobre una reunión apunta entonces al registro de la persona de la que habla.

- **El área se convierte en base de datos** en cuanto un documento la describe, y recibe su propio resumen como vista de solo lectura.
- **La tabla reside en su archivo**: los campos en el encabezado, los registros en el cuerpo. Renombrar y mover no cambian nada de eso, tampoco fuera de la aplicación.
- **Ocho tipos de columna**, con etiquetas que pueden existir en varios idiomas.
- **El enlace a un registro concreto** se escribe como un ancla y se comporta como cualquier otro enlace: el linter de Markdown indica si vale, y un clic abre el archivo de tabla.
- **Los grandes conjuntos siguen siendo una sola tabla**: a partir de unos 0,7 MB, la aplicación reparte los registros al guardar entre varios archivos contiguos, sin que ningún enlace se vea afectado.

Lo que esta primera etapa todavía no trae: los registros se siguen introduciendo en el texto del archivo, no hay formulario de entrada, ni comprobación de los valores al escribir, ni consulta sobre los registros.

En detalle: [Base de datos](database.md).

## La aplicación se adapta — y te acompaña

Quien trabaja mucho tiempo con un programa acaba moldeándolo: colores, atajos de teclado, botones, plantillas y favoritos crecen con tu manera de trabajar, y en algún momento también el idioma en el que habla la interfaz forma parte de ello. Hasta ahora ese trabajo estaba ligado a un solo ordenador y a los idiomas que vienen con la aplicación. Ambas cosas están abiertas: tu configuración puede escribirse en un archivo legible y volver a leerse en otro sitio, y quien necesita un sexto idioma traduce la interfaz por su cuenta. A ello se suma la vista del conjunto: una página que muestra uno junto a otro todos tus espacios de trabajo, áreas, libros y estanterías, incluidos los que ahora mismo no están conectados.

- **La configuración como archivo**: exportarla, llevártela, volver a leerla en otro sitio, por completo o en parte, con una vista previa que dice de antemano qué va a ocurrir.
- **Un sexto idioma: el tuyo.** Traducir una plantilla, instalarla, elegirla en la barra de estado; lo que falte en ella aparece en inglés y no como una clave en bruto.
- **Todos los contenedores en un solo lugar**: añadidos a mano en vez de recogidos automáticamente, con cifras y el momento en que se tomaron.
- **Nada ocurre a tus espaldas**: no se recorre ningún disco, y ninguna lectura escribe nada antes de que lo confirmes.

En detalle: [Exportar e importar la configuración](setup-exchange.md), [Idioma de interfaz propio](custom-locale.md), [My Extended Memory](my-extended-memory.md).

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
- **Presentación** con fórmulas, diagramas y código resaltado; en la exportación portátil un diagrama viaja como imagen terminada y se ve también donde EM4me no está instalado.
- **Referencias dentro del texto** mediante anclas, inserciones y etiquetas.
- **Jornada de trabajo** con tareas, recordatorios, citas, plantillas y diarios.
- **Activables una a una** y abierto a extensiones propias mediante una interfaz documentada.

En detalle: [Funciones](functions.md), [Extensiones](extensions.md), [Crear extensiones](extensions-dev.md).

## Colaboración con un asistente de IA

Quien pide a un asistente de IA que escriba archivos obtiene por lo general Markdown corriente: el modelo no conoce el lenguaje ampliado de EM4me. Por eso EM4me entrega además la descripción de su propio lenguaje Markdown en una forma que un modelo puede leer. Si se la entrega a su asistente, obtiene archivos con consultas, tablas de datos, eventos y superficies en lugar de simples párrafos, y no tiene que repasarlos a mano.

- **Una referencia de sintaxis en un solo archivo**: todo el lenguaje, escrito para un modelo. Se entrega con el programa y está en la red bajo una dirección fija, `em4me.ch/<idioma>/manual/em4me-syntax.md`.
- **Cada página del manual además como Markdown**, en su propia dirección, para la pregunta sobre un solo tema.
- **Un archivo índice `llms.txt` por idioma** según el patrón extendido, con el que un asistente encuentra las páginas por sí mismo.
- **Siempre en el estado entregado**: todo se genera de nuevo en cada compilación a partir del manual. No hay una segunda fuente que pudiera quedar anticuada.
