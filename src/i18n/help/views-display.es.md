# Vistas y presentación

El aspecto de un documento se decide en dos niveles. La **vista** pertenece a la pestaña: determina si el documento se muestra renderizado, como código fuente, dividido o en vivo. La **apariencia** vale para toda la aplicación: tema, zoom, ancho del contenido y fuentes. Esta página reúne ambos niveles y nombra el lugar de cada ajuste.

## Las siete vistas

Cada pestaña está exactamente en una de las siete vistas. El modo elegido vale por pestaña y no globalmente: un documento puede estar abierto renderizado mientras al lado se edita un segundo como código fuente.

| Vista            | Qué muestra                                        | Atajo predeterminado |
| ---------------- | -------------------------------------------------- | -------------------- |
| **Renderizado**  | solo el resultado con formato                      | `Ctrl+1`             |
| **Dividido**     | el código y el resultado uno junto al otro         | `Ctrl+2`             |
| **Código fuente** | solo el código Markdown                           | `Ctrl+3`             |
| **En vivo**      | el código, con formato allí donde se escribe       | `Ctrl+4`             |
| **Mapa mental**  | la estructura del documento como mapa en vez de texto | `Ctrl+5`          |
| **Lienzo**       | una superficie con tarjetas y conexiones del documento | `Ctrl+6`             |
| **Tablero**      | las tareas del documento como tablero Kanban        | `Ctrl+7`             |

El cambio se hace con los botones de la barra de estado o por la parte superior del menú Ver; el mapa mental está en el menú y en su atajo, no en la barra de estado, el botón del lienzo permanece atenuado mientras el documento no contenga una superficie Canvas, y el botón del tablero igualmente mientras el documento no sea un tablero Kanban. Qué vista recibe una pestaña recién abierta se ajusta en la sección «Comportamiento» de la configuración.

### Modo en vivo

El modo en vivo renderiza el Markdown directamente en el editor: negrita y cursiva, enlaces, tablas, código, imágenes, fórmulas KaTeX y diagramas Mermaid aparecen tal como se ven en el resultado renderizado. Cuando el cursor está en una línea, justo esa línea muestra su fuente en bruto y sigue siendo editable. Así desaparece el ir y venir entre escribir y comprobar.

**Las tablas están exentas de esta regla.** Permanecen compuestas aunque el cursor esté dentro: el clic acierta la celda, el tabulador y las flechas llevan de celda en celda, y lo que se escribe llega al lugar correcto de la fuente. Quien necesite la sintaxis en bruto de una tabla —la fila separadora con sus dos puntos de alineación, por ejemplo— cambia a la vista de código o a la vista dividida.

**Los enlaces en el texto corrido están marcados de forma permanente.** Llevan su subrayado en todo momento, sin que el ratón tenga que estar encima: tanto los enlaces wiki como los de Markdown, tanto hacia un documento como hacia una dirección externa. La vista renderizada sigue subrayando un enlace solo al pasar el ratón; en la vista en la que se escribe, en cambio, debe verse sin esfuerzo que detrás de un texto hay un enlace. En la línea del cursor aparece la sintaxis en bruto como de costumbre.

### Mapa mental

El mapa mental muestra los títulos y las listas del documento como un árbol, y el texto corrido como nota en el nodo. Pertenece a la extensión del mismo nombre y desaparece con ella; estructura, manejo, la búsqueda en el mapa, las cinco posiciones de la raíz y el valor por documento se describen en la página [Vista de mapa mental](mindmap.md).

### Lienzo

El lienzo muestra una superficie con tarjetas y conexiones que se encuentra en el propio documento. Pertenece a la extensión del mismo nombre y desaparece con ella; además depende del documento y solo puede elegirse si este contiene una superficie Canvas. Estructura, manejo, varias superficies y el formato de almacenamiento se describen en la página [Superficie Canvas](canvas.md).

### Tablero

El tablero muestra las tareas del documento como tablero Kanban: las listas con nombre del documento como columnas y las líneas de tarea que contienen como tarjetas. Pertenece a la extensión «Kanban» y desaparece con ella; como el lienzo, depende del documento y solo puede elegirse si este lleva la marca de encabezado de un tablero. Crear y convertir, manejar tarjetas y columnas, mover con el ratón, fechas, etiquetas, límite, archivo y filtro, así como el formato de almacenamiento, se describen en la página [Tablero Kanban](kanban.md).

### Editar

El modo de edición activa el editor y actúa en la vista de código, la dividida y la de en vivo (predeterminado `Ctrl+E`, lápiz en la barra de estado, Ver → Editar). Un clic en el lápiz de la vista de solo lectura cambia por sí mismo a una vista de edición y activa allí el editor. Cuál de ellas la determina el ajuste «Vista al cambiar al modo de edición» (Archivo → Ajustes… → Comportamiento; se ofrecen Dividida, Código y En vivo, Dividida de forma predeterminada). Si la vista ya es una de las tres, se mantiene: allí el lápiz solo activa el editor. Con qué se da formato en el modo de edición lo describen las páginas [Menú contextual del editor](context-menu.md) y [Barra de formato](toolbar.md).

## Presentación del editor

El submenú Ver → Presentación del editor agrupa los cinco interruptores que afectan al editor mismo. Los mismos interruptores están como iconos en la barra de estado.

- **Plegado** muestra el margen de plegado en el borde izquierdo: encabezados, listas y bloques se pliegan allí, y la jerarquía queda visible como rastro.
- **Números de línea** muestra la columna de números.
- **Ajuste de línea** corta las líneas largas en el borde de la ventana en lugar de desplazarse en horizontal. La continuación de una línea partida empieza a la altura de la sangría de su contenido: en una entrada de lista tras la marca, en una numerada tras el número, en una línea sangrada en su propia sangría. Un párrafo sin sangría permanece alineado a la izquierda.
- **Sincronización de desplazamiento** acopla ambas mitades en la vista dividida: al desplazar el código, el resultado sigue por contenido, y a la inversa. El interruptor vale por pestaña.
- **Desplazamiento máquina de escribir** mantiene la línea del cursor centrada en vertical en cuanto el cursor se mueve. Solo actúa en el modo de edición.

Los tres primeros interruptores están **ligados al documento**: su valor pasa al frontmatter del archivo (`fold-gutter`, `line-numbers`, `word-wrap`) y viaja con él. El cambio escribe allí el nuevo valor y marca el archivo como modificado; un documento sin indicación propia sigue el ajuste predeterminado en Archivo → Configuración… → Apariencia. El orden de resolución se describe en la página [Frontmatter y propiedades](frontmatter.md).

## Apariencia

### Claro, oscuro y sistema

La aplicación funciona en un tema claro u oscuro; el valor predeterminado sigue el tema del sistema operativo. El cambio se hace con el icono de tema de la barra de estado o con Ver → Apariencia → Claro/Oscuro/Sistema. Qué colores usa cada tema se determina libremente mediante los esquemas de color, véase [Esquemas de color](color-schemes.md).

En Linux el valor predeterminado del sistema depende del entorno de escritorio: si no comunica ninguna preferencia de claro u oscuro, se mantiene el tema claro. El cambio manual funciona allí sin restricciones.

### Modo concentración

El modo concentración oculta la barra de pestañas, la barra de estado y la barra lateral y deja solo el documento (Ver → Apariencia → Modo concentración, predeterminado `Ctrl+Mayús+F`). La barra de menús sigue accesible con `Alt`. `Esc` abandona el modo, salvo que haya justo un diálogo o un menú abierto. Un estado contraído de la barra lateral no se ve afectado y sigue valiendo tras la salida.

### Línea activa

La línea del cursor recibe un fondo discreto en el modo de edición, tanto en la vista de código como en la de en vivo e incluida la columna de números de línea. En la vista de solo lectura queda sin marcar, porque allí no hay cursor. El tono es semitransparente y se posa así sobre cualquier esquema de color; la selección, los resultados de búsqueda y las marcas del linter siguen visibles por encima. Interruptor: Archivo → Configuración… → Apariencia.

### Zoom

El contenido de cada pestaña se amplía y se reduce de forma independiente en pasos de diez por ciento (predeterminado `Ctrl + +`, `Ctrl + −`, `Ctrl + 0`, además de `Ctrl` con la rueda del ratón). Si el factor se aparta del cien por cien, la barra de estado lo muestra; un clic encima lo restablece. El zoom es volátil y no sobrevive al cierre de la ventana.

### Ancho del contenido

El ancho del contenido determina como porcentaje cuánto espacio usa la presentación renderizada (20 a 100, predeterminado 80). Los valores más estrechos quedan centrados. Vale para la vista renderizada y la dividida; la exportación a PDF usa con independencia todo el ancho de impresión. Ajuste: Archivo → Configuración… → Apariencia.

### Fuente y tamaño

La fuente y el tamaño se eligen por separado para la superficie de edición y para la vista renderizada; el tamaño está entre 8 y 32. Los valores valen para todos los documentos y surten efecto de inmediato en todas las ventanas abiertas. Ajuste: Archivo → Configuración… → Apariencia.

## Estado de la ventana

La posición, el tamaño y el estado maximizado de una ventana se recuerdan al salir y se restauran en el siguiente arranque. Para ello no hay nada que ajustar. Lo que además devuelve una sesión completa con sus pestañas se describe en la página [Aplicaciones, ventanas y áreas](apps-windows.md).

## Barra de estado

La barra de estado en el borde inferior de la ventana es el punto de manejo que permanece visible en todas las vistas. Si su ancho no basta para todos los elementos, se pliega: en su borde izquierdo y en su borde derecho aparece un menú que recoge los elementos que ya no caben. Una entrada del menú muestra su rótulo y su estado y actúa igual que el botón de la barra; cuando la ventana vuelve a ensancharse, los elementos regresan y un menú que quedaría vacío desaparece. La zona de los mensajes breves sigue visible con cualquier ancho, y los conmutadores del centro se pliegan en último lugar.

Cuándo se pliega lo determina el ajuste «Plegado» (Archivo → Configuración… → Barra de estado). «Automáticamente cuando falta espacio» es la opción predeterminada y guarda solo lo que ya no cabe; «Siempre plegada» mantiene los botones en los dos menús con independencia del ancho de la ventana y deja la barra permanentemente sobria. La misma sección lleva también los botones de comando propios de la barra y la lista de los botones predeterminados ocultos, véase [Colocación de comandos](command-placement.md).

Cómo trata la barra los botones que en este momento no pueden hacer nada lo determina el ajuste «Botones no utilizables» (Archivo → Configuración… → Barra de estado). Afectados están los selectores de vista y los tres conmutadores de editor del centro, así como Editar, la sincronización del desplazamiento y el historial del documento de la derecha: por ejemplo mientras una página del sistema como los ajustes está delante, o mientras no haya ningún documento abierto. «Mostrar atenuados» es la opción predeterminada: el botón permanece en su sitio, se ve claramente desactivado y no reacciona. «Ocultar» lo retira de la barra mientras no pueda hacer nada, y también de los dos menús de los bordes de la barra plegada; en cuanto vuelve a poder actuar, regresa a su sitio. Los conmutadores de paneles de la izquierda, los botones de comando propios, la selección de idioma y el conmutador claro/oscuro no conocen este estado y nunca se ven afectados por la elección; el menú Ver permanece igualmente sin cambios y sigue mostrando atenuadas las entradas no disponibles.

Un botón puede faltar en la barra, por tanto, por tres razones distintas, y solo la tercera depende de este ajuste: está desmarcado en la lista de botones predeterminados ocultos y queda ausente de forma permanente — esa lista actúa antes de la elección, véase [Colocación de comandos](command-placement.md); pertenece a una extensión desactivada, y entonces la función no existe, véase [Extensiones](extensions.md); o no puede hacer nada en este momento y la elección está en «Ocultar», y entonces vuelve por sí solo.

## Estadística de palabras

La barra de estado muestra palabras, caracteres y el tiempo de lectura estimado del archivo activo. Si hay algo seleccionado en el editor, la indicación cambia a la selección. Un clic abre un diálogo de detalle con párrafos, oraciones y el número de encabezados por nivel. El frontmatter, los bloques de código y las fórmulas KaTeX no se cuentan.

## Configuración

La configuración se abre como pestaña propia (Archivo → Configuración…, predeterminado `Ctrl+,`). Su navegación se divide en cuatro bloques:

- **General** — todo lo que vale para la aplicación entera, por ejemplo apariencia, comportamiento, atajos de teclado y exportación.
- **Área actual** — los ajustes del área abierta. El bloque solo aparece mientras haya un área abierta.
- **Extensiones (internas)** — activar y desactivar las extensiones incluidas, con sus propias secciones.
- **Extensiones (externas)** — la gestión de paquetes de extensión instalados por uno mismo.

Los cambios actúan primero como borrador con vista previa en vivo de la apariencia. Aplicar y OK guardan; ambos solo se resaltan cuando hay cambios sin guardar, sin cambios Aplicar queda atenuado. Cancelar o cerrar la pestaña descarta el borrador. Los valores guardados valen de inmediato en todas las ventanas abiertas. Más sobre los dos bloques de extensiones está en la página [Extensiones](extensions.md).

## Idioma

La interfaz existe en alemán, inglés, francés, español e italiano. El cambio se hace con el selector de idioma de la barra de estado; las páginas del manual abiertas cambian de inmediato con él.

## Barra de menús

La barra de menús lleva los tres menús Archivo, Ver y Ayuda. `Alt` activa el manejo por teclado, y las letras subrayadas llevan directamente al menú correspondiente, por ejemplo `Alt+A` para Archivo. Los atajos actualmente activos de todos los comandos se listan en la página [Atajos de teclado](shortcuts.md).

Al final del menú Ver están las herramientas de desarrollo. Están fijadas a propósito en `F12` y no son reasignables: son una herramienta de diagnóstico y no parte del trabajo diario.
