# Superficie Canvas

Un **lienzo** es una superficie de trabajo espacial dentro de un documento Markdown corriente: **tarjetas** con texto propio se colocan libremente sobre ella, **conexiones** trazan las relaciones entre ellas, **formas** ponen señales a su lado y **grupos** reúnen lo que va junto. Una tarjeta lleva o bien texto propio, o bien muestra el contenido de otro documento o una imagen del área. Cuando se colocan alternativas una junto a otra, se esboza un flujo o se ordenan primero las ideas, aquí el orden proviene de la posición y no de la secuencia.

La superficie la sostiene un bloque de código con la etiqueta de lenguaje `perspective-canvas`. Un documento puede contener tantos como se quiera, y todo lo demás en él sigue siendo Markdown corriente.

La función pertenece a las [extensiones internas](extensions.md) («Vista de lienzo»). Desactivada, el bloque sigue siendo un bloque de código corriente, el modo de vista desaparece y los comandos de superficie, tarjeta, tarjeta de enlace, tarjeta de imagen, forma, grupo y orden de apilamiento se van. El documento permanece legible sin cambios; no se pierde nada.

## Diferencia con la vista de grafo

Ambas muestran recuadros y líneas, y significan cosas distintas:

| Pregunta | [Vista de grafo](graph.md) | Lienzo |
| -------- | -------------------------- | ------ |
| ¿De dónde vienen los nodos? | de los archivos del área | los crea el usuario |
| ¿De dónde vienen las líneas? | de los enlaces existentes | las traza el usuario |
| ¿De dónde viene la disposición? | la aplicación la **calcula** | el usuario la **decide** |
| ¿Cuál es el resultado? | un análisis de lo existente | una superficie de trabajo con contenido propio |

En resumen: la vista de grafo **analiza** y calcula ella misma su disposición; el lienzo **deja disponer** y recuerda lo dispuesto. Una tarjeta movida se queda donde se la dejó, un nodo del grafo no.

Lo mismo vale frente a la [vista de mapa mental](mindmap.md): esta deriva su árbol de los títulos y las listas del documento y nunca cambia el texto. El lienzo lleva su contenido él mismo y lo devuelve al documento a medida que se edita.

## Crear una superficie

El comando **«Lienzo»** inserta una superficie vacía en el punto de inserción. Dos caminos llevan allí: la paleta de comandos (`Ctrl+K` predeterminado) y el menú contextual del editor → Insertar → Lienzo. No hay atajo preasignado; puede asignarse en la configuración.

El comando exige un documento editable; si falta, la barra de estado lo dice en lugar de no hacer nada en silencio. Lo que se inserta es un bloque vacío:

````markdown
```perspective-canvas
```
````

## Abrir la vista de lienzo

El lienzo es el sexto modo de vista, junto a Código, Dividida, Renderizada, Live y Mapa mental: **Ver → Lienzo**, el botón de la barra de estado o `Ctrl+6` predeterminado. Como en los demás modos, la elección vale por documento abierto y no para toda la aplicación.

**Es el único de los seis modos que depende del documento.** Solo puede elegirse si el documento contiene una superficie Canvas: una vista de lienzo sin superficie no mostraría más que un aviso. Sin superficie, el botón y la entrada de menú siguen **visibles y atenuados**; el motivo figura en la ayuda emergente del botón. El camino por el atajo y la paleta de comandos no lleva entonces a ninguna parte y tampoco expulsa de la vista actual. En cuanto aparece una superficie en el texto o desaparece de él, el acceso se ajusta. Un documento que estaba abierto en la vista de lienzo al cerrar la aplicación y cuya superficie ha desaparecido entretanto se abre en la vista de lectura.

## Varias superficies en un documento

Si un documento lleva más de una superficie, aparece sobre la superficie una barra con una **pestaña** por superficie; un clic cambia la superficie mostrada y la ajusta. Con exactamente una superficie no hay barra.

El rótulo se deriva y no se declara: la primera línea útil de la primera tarjeta y, si no, un recuento («Lienzo 2»). En el documento no se guarda nada para ello. Qué superficie está elegida vale por documento abierto, sobrevive a la escritura y al cambio de modo y no se guarda: una acción puramente de vista no debe cambiar el documento.

## Tarjetas

### Crear

- Un **doble clic** sobre el fondo libre crea una tarjeta en el punto del clic y abre enseguida su entrada de texto.
- Un **clic derecho** sobre el fondo → «Añadir tarjeta al lienzo» hace lo mismo en el punto del clic.
- El comando **«Añadir tarjeta al lienzo»** (paleta de comandos, menú Ver, atajo asignable) la coloca en el centro de la porción visible. Fuera de la vista de lienzo avisa en la barra de estado de que las tarjetas solo nacen allí.

### Seleccionar, mover, cambiar el tamaño

- Un **clic** selecciona una tarjeta, un clic en el fondo anula la selección. Como máximo hay un elemento seleccionado: una tarjeta, una conexión, una forma o un grupo.
- **Arrastrar** mueve la tarjeta; sus conexiones la siguen ya durante el arrastre. No hay cuadrícula.
- El **tirador de la esquina inferior derecha** cambia el tamaño. Este es independiente del contenido: si el texto no cabe, la tarjeta se desplaza — nunca crece por sí sola.

### Escribir el texto

Un **doble clic dentro de una tarjeta** la conmuta a su texto en bruto. Allí hay Markdown corriente, que se representa dentro de la tarjeta: títulos, resaltes, listas, tablas, fórmulas y diagramas incluidos.

| Entrada | Efecto |
| ------- | ------ |
| Clic fuera de la tarjeta | acepta |
| `Ctrl+Intro` | acepta |
| `Esc` | descarta |

Un texto sin cambios no escribe nada en el documento.

### Tarjetas de enlace

En lugar de llevar texto propio, una tarjeta muestra a elección el contenido de **otro documento**: entero, o desde un título o desde un bloque. El contenido permanece donde está: la tarjeta no guarda ninguna copia y no se modifica en este lugar. Si no cabe en la tarjeta, esta se desplaza.

- **Crear** — el comando **«Añadir tarjeta de enlace al lienzo»** (paleta de comandos, menú Ver) la coloca en el centro de la parte visible; el clic derecho sobre el fondo libre, en el punto del clic. Ambos preguntan primero por el destino: `Intro` crea la tarjeta, `Esc` cancela. Sin destino no se crea ninguna tarjeta.
- **Definir, cambiar y quitar el destino** — una tarjeta seleccionada lleva una **barra** con el campo «Destino del enlace»; al escribir ofrece los documentos del área. Así una tarjeta de texto se convierte en tarjeta de enlace, y «Quitar enlace» la devuelve a tarjeta de texto: su texto propio se queda. Las mismas acciones están en el **menú contextual** de la tarjeta.
- **Abrir el destino** — un **doble clic sobre el contenido mostrado** abre el documento enlazado en el lugar enlazado, igual que «Abrir destino» en la barra y en el menú contextual. Esto sigue permitido en la vista pura, porque abrir no cambia nada.
- **Línea de encabezado** — indica la **etiqueta** de la tarjeta, es decir, su texto propio, y si no, el destino con su ancla. Un doble clic sobre la línea de encabezado edita la etiqueta como el texto de cualquier otra tarjeta.

Si el destino no se encuentra, la tarjeta se queda e indica, en lugar del contenido, qué ha buscado; en el archivo no cambia nada. Si el destino se edita en otro documento abierto, la tarjeta lo sigue de inmediato; un cambio en un archivo que no está abierto en ninguna parte aparece la próxima vez que se dibuja la superficie.

### Tarjetas de imagen

Igualmente, una tarjeta muestra a elección una **imagen** del área. Tampoco aquí guarda copia alguna: la imagen sigue siendo un archivo y la tarjeta apunta a ella, mediante una ruta relativa al documento o mediante el mero nombre de archivo. Se **ajusta** a la tarjeta conservando sus proporciones; en una tarjeta de imagen no se desplaza nada.

Se maneja como la tarjeta de enlace: el comando **«Añadir tarjeta de imagen al lienzo»** y la misma entrada en el menú contextual de la superficie, en la barra de la tarjeta seleccionada el campo «Imagen» —con los archivos de imagen del área como propuestas— así como «Quitar imagen» y «Abrir destino». Un doble clic sobre la imagen abre el archivo tal como la aplicación abre cualquier [adjunto](attachments.md). La línea de encabezado indica la etiqueta y, si no, el nombre del archivo de imagen.

Si la imagen no se encuentra, es demasiado grande o no lleva extensión de imagen, la tarjeta lo dice en lugar de la imagen. **Una tarjeta muestra o bien un documento o bien una imagen;** si ambos atributos están uno junto a otro, vale el documento.

### Eliminar

`Supr` elimina la tarjeta seleccionada, igual que «Eliminar la tarjeta» en su menú contextual. Las conexiones cuyo extremo apunta a ella desaparecen con ella, en un paso que se deshace en bloque.

## Conexiones

### Crear

Una tarjeta seleccionada muestra cuatro **tiradores de conexión**, uno por lado. Un arrastre desde un tirador hasta otra tarjeta crea la conexión; una línea de vista previa sigue al puntero. Durante el arrastre, la tarjeta bajo el puntero muestra cuatro **zonas de destino** a lo largo de sus bordes: soltar sobre una zona fija el lado de destino, soltar sobre el cuerpo de la tarjeta deja ese lado a la aplicación. Un arrastre al vacío o de vuelta sobre la misma tarjeta no crea nada.

### Cambiar

Una conexión seleccionada lleva una pequeña **barra de herramientas** en el medio de su trazado:

- **Cambiar la dirección** — en ciclo: flecha hacia el destino (→), flecha en ambos extremos (↔), sin punta (—). El signo del botón muestra el estado actual.
- **Invertir la dirección** — intercambia el principio y el final junto con sus lados de conexión.
- **Color** — ocho colores del esquema de colores, más «Sin color».
- **Lado de inicio** y **Lado de destino** — automático, izquierda, derecha, arriba o abajo. «Automático» elige el lado según la posición de las dos tarjetas; un lado elegido expresamente se queda incluso al mover una tarjeta.
- **Etiqueta** — abre la misma entrada de texto que un doble clic sobre la conexión. El texto queda después a lo largo de la línea.

Las mismas acciones están en el **menú contextual** de la conexión (clic derecho). `Supr` elimina la conexión seleccionada.

## Formas

Además de las tarjetas, la superficie admite **formas geométricas**. No llevan contenido, sino que estructuran: destacan una zona, marcan un paso de un flujo o ponen una señal junto a una tarjeta.

### Crear

- Un **clic derecho** en el fondo libre → «Insertar forma» abre un submenú con las seis clases y coloca la elegida en el punto del clic.
- El comando **«Añadir forma al lienzo»** (paleta de comandos, menú Ver, atajo asignable) coloca un rectángulo en el centro de la porción visible.

Hay seis clases a elegir: **rectángulo**, **rectángulo redondeado**, **elipse**, **triángulo**, **rombo** y **estrella**. No hay herramienta para trazos a mano alzada.

### Seleccionar, mover, cambiar el tamaño

Como en una tarjeta: un clic selecciona la forma, arrastrar la mueve, el tirador de la esquina inferior derecha cambia el tamaño. El contorno llena su rectángulo y no conserva sus proporciones: una elipse estirada a lo ancho sigue siendo ancha.

Lo que se toma es la **figura dibujada** y no el rectángulo que la rodea: un clic en la esquina vacía junto a un triángulo alcanza lo que hay detrás.

### Clase, colores y etiqueta

Una forma seleccionada lleva una **barra de herramientas**:

- **Clase de la forma**: cambia entre las seis clases; la posición y el tamaño se mantienen.
- **Color del borde**: ocho colores del esquema de color. Sin elección rige el color predeterminado.
- **Color de relleno**: los mismos ocho colores, dibujados como tinte, además de «Sin relleno».
- **Editar etiqueta**: abre la misma entrada que un doble clic sobre la forma.

La **etiqueta** es **texto sencillo**, centrado en la forma. A diferencia de una tarjeta, en ella no se renderiza Markdown ni se desplaza: la forma estructura, la tarjeta lleva el contenido. `Ctrl+Intro` y un clic al lado aplican, `Escape` descarta; un texto vaciado retira de nuevo la etiqueta.

Las mismas acciones están en el **menú contextual** de la forma.

### Eliminar

`Supr` elimina la forma seleccionada, igual que «Eliminar forma» en su menú contextual. Una conexión no se conecta a una forma; las conexiones van únicamente entre tarjetas.

## Grupos

Un **grupo** es un rectángulo que reúne una parte de la superficie y la nombra: «Análisis», «descartado», «primera versión». Su interior sigue siendo manejable: las tarjetas y las formas que hay dentro se pueden seguir tomando, y un doble clic en medio de un grupo crea una tarjeta igual que en cualquier otro sitio.

### Crear

- Un **clic derecho** en el fondo libre → «Insertar grupo» lo coloca en el punto del clic.
- El comando **«Añadir grupo al lienzo»** lo coloca en el centro de la porción visible.

Un grupo nuevo nace **al fondo del todo** y por tanto no tapa nada.

### Etiqueta y color

Un grupo seleccionado lleva una barra de herramientas con el **color del grupo** —ocho colores del esquema de color, además de «Color predeterminado», que retira de nuevo el dato— y con **Editar etiqueta**. La etiqueta se sitúa arriba a la izquierda del marco y es texto sencillo, como en la forma. Las mismas acciones están en el **menú contextual** del grupo.

### Miembros

**Es miembro lo que queda por completo dentro del grupo.** No está escrito en ninguna parte: el rectángulo mismo es la afirmación, y no hay una segunda lista que pudiera apartarse de él. Los bordes cuentan como interior; lo que sobresale de una arista no es miembro. Un grupo dentro de un grupo es miembro y se desplaza con él.

De ahí se siguen las tres acciones:

| Acción | Efecto sobre los miembros |
| ------ | ------------------------- |
| Mover el grupo | los miembros lo acompañan, su disposición entre sí queda inalterada |
| Cambiar el tamaño | no se mueve nada; quién es miembro se recalcula después |
| Eliminar el grupo | los miembros se quedan donde están |

Quién acompaña el movimiento queda fijado al **comienzo del arrastre**: lo que estaba dentro del grupo al tomarlo va con él, aunque el grupo se aleje por el camino mucho más allá de su propio sitio. Todo el arrastre es **un** paso de deshacer.

Una conexión nunca es miembro; de todos modos sigue a sus tarjetas.

## Orden de apilamiento en la superficie

Las tarjetas, las formas y los grupos están en **un orden común**. Cuando dos elementos se solapan, él decide cuál queda encima; ninguna clase queda permanentemente por encima de otra.

Para el elemento seleccionado hay cuatro comandos:

| Comando | Efecto |
| ------- | ------ |
| Traer al frente | por encima de todos los demás elementos |
| Traer adelante | delante del siguiente elemento que tiene por delante |
| Enviar atrás | detrás del siguiente elemento que tiene por detrás |
| Enviar al fondo | por debajo de todos los demás elementos |

Dos caminos llevan allí: el **menú contextual** del elemento y **Ver → Orden de apilamiento del lienzo**. Los mismos comandos están en la paleta de comandos (`Ctrl+K` predeterminado); no hay atajos preasignados y pueden asignarse en los ajustes.

**Los elementos nuevos tienen su sitio:** un grupo nuevo nace al fondo del todo, y una forma nueva o una tarjeta nueva, al frente del todo.

**Las conexiones no se ven afectadas.** Se dibujan en una capa propia bajo todos los elementos y no pueden moverse dentro del orden.

## Deshacer

`Ctrl+Z` retira la última acción sobre la superficie, `Ctrl+Y` y `Ctrl+Mayús+Z` la restablecen. Cada acción es exactamente un paso: una tarjeta movida, un tamaño cambiado, una conexión creada, un texto modificado. Mientras esté abierta la entrada de texto de una tarjeta o de una conexión, `Ctrl+Z` se aplica al texto escrito allí.

## Navegar

- **Desplazar** — arrastrar el fondo libre con el botón del ratón pulsado.
- **Zoom** — rueda del ratón sobre la superficie, centrada en el puntero.
- **Ajustar** — al entrar en la vista y al cambiar de superficie, la porción se ajusta sola al contenido.

## Lista del lienzo y manejo sin ratón

Junto a la superficie puede mostrarse una **lista del lienzo**. Enumera lo que hay en la superficie mostrada en ese momento y hace así que la superficie sea **enumerable**: un elemento situado fuera de la porción visible se encuentra por la lista sin recorrer la superficie, y una conexión que pasa por debajo de una tarjeta se acierta allí con seguridad.

Tres caminos muestran y ocultan la lista, como en cualquier otro panel de la [barra lateral](sidebar.md): el **botón** de la barra de estado, **Ver → Barra lateral → Paneles → Lista del lienzo** y la paleta de comandos (`Ctrl+K` predeterminado). No hay atajo preasignado; se puede asignar uno en los ajustes. El estado rige por columna y sobrevive al cambio de documento y a un reinicio. Si la vista de lienzo está desactivada como [extensión interna](extensions.md), la lista no existe: ni el botón, ni la entrada de menú, ni la entrada en la paleta de comandos.

### Lo que la lista muestra

- **Todas las clases de elemento**: tarjetas, formas y grupos, cada fila reconocible por su clase.
- **Bajo cada tarjeta sus conexiones**, cada una con su sentido y su contraparte. Un tirador de plegado en la tarjeta las muestra y las oculta.
- **El orden de la lista es el orden de superposición:** lo que está más abajo en la lista está más adelante en la superficie. Así no hace falta una segunda presentación del orden.
- Si el documento lleva **varias superficies**, la lista pertenece a la que se muestra; un cambio por la barra de pestañas cambia la lista con él.
- Una fila sobre la lista indica el **número de elementos** — o dice en su lugar que no hay documento abierto, que el documento no lleva ninguna superficie o que la superficie aún está vacía.

**La selección y la lista muestran lo mismo, en ambos sentidos.** Lo seleccionado en la superficie está resaltado en la lista; lo seleccionado en la lista está resaltado en la superficie y se sitúa **en el centro de la porción**; la ampliación queda como está. Si el documento no está en la vista de lienzo, seleccionar una entrada lleva primero allí; si el documento no lleva ninguna superficie, la barra de estado dice que esa vista no existe para él.

### Las teclas en la lista

| Tecla | Efecto |
| ----- | ------ |
| `Flecha arriba`, `Flecha abajo` | a la fila anterior o siguiente; la superficie selecciona con ella y sitúa el elemento en el centro |
| `Inicio`, `Fin` | a la primera o a la última fila |
| `Intro` | edita el elemento seleccionado: el texto de una tarjeta, el rótulo de una forma, de un grupo o de una conexión |
| `Supr` | elimina el elemento seleccionado |
| tecla de menú contextual, `Mayús+F10` | abre el menú contextual del elemento; sin elemento seleccionado, el menú de la superficie con sus vías de creación |
| `Escape` | levanta la selección |

Editar y eliminar exigen un documento modificable y una vista de lienzo abierta. Si falta una de las dos condiciones, la barra de estado lo dice en vez de no hacer nada en silencio; en un documento no modificable la lista sigue mostrando y seleccionando.

### Añadir una conexión sin ratón

La entrada **«Añadir conexión al lienzo…»** del menú contextual de una tarjeta inicia la **elección del destino en la lista**. Transcurre en dos pasos, porque una conexión tiene dos extremos y, sin puntero, no hay lugar donde nombrar la contraparte de pasada:

1. La tarjeta de partida es la tarjeta seleccionada.
2. La lista recorre después solo las **demás tarjetas**, y la fila sobre ella dice que hay que elegir un destino. `Intro` confirma, un clic sobre una fila de tarjeta también, `Escape` cancela y restablece el estado anterior.

Los lados de conexión los determina la aplicación a partir de la posición de las dos tarjetas; después se cambian en la barra de la conexión seleccionada. Si no hay una segunda tarjeta, la barra de estado lo dice.

### Buscar dentro de la superficie

En la cabecera de la lista hay un **campo de filtro**. Reduce la lista a los elementos que contienen el texto escrito. Se recorren

- el **texto** de una tarjeta, así como el rótulo de una forma y de un grupo,
- el **destino de enlace** de una tarjeta de enlace y el **nombre de imagen** de una tarjeta de imagen,
- el **rótulo** de una conexión.

Se busca como una secuencia de caracteres seguida, sin atender a mayúsculas y minúsculas — la misma regla que en la paleta de comandos; no hay patrones ni coincidencias aproximadas. Las coincidencias se resaltan en la fila, la fila sobre la lista las cuenta y, si no queda nada, lo dice en vez de vaciar la lista sin una palabra. Una tarjeta permanece cuando coincide una de sus conexiones; cuando coincide la tarjeta misma, todas sus conexiones permanecen con ella. Mientras un filtro está activo, las tarjetas están desplegadas: una coincidencia bajo una tarjeta plegada no lo sería.

| Entrada | Efecto |
| ------- | ------ |
| `Intro` | salta a la coincidencia: seleccionada, centrada, foco en la lista. Se toma la fila seleccionada si está entre las coincidencias, y si no, la primera |
| `Flecha abajo` | lo mismo; desde allí las flechas recorren las demás coincidencias |
| `Escape` | vacía el campo sin tocar la selección. Con el campo vacío no surte efecto |

**`Ctrl+F` lleva a este campo en la vista de lienzo** y no a la barra de búsqueda. La razón: quien busca en esta vista busca en la superficie que tiene delante; la barra de búsqueda, en cambio, recorre el texto del documento y muestra sus coincidencias donde en esta vista no hay nada que ver. En cualquier otra vista `Ctrl+F` abre la barra de búsqueda sin cambios, y si la extensión de lienzo está desactivada, esa vista no existe y tampoco este desvío.

## Solo mirar

La superficie sigue la editabilidad de su documento. Mientras el documento esté en simple visualización, sin el modo de edición activado, la superficie es **solo de consulta**: sin tiradores, sin arrastre, sin creación, sin entrada de texto, sin barra de herramientas, sin reordenación, y el menú contextual queda sin entradas. Esto rige para cada clase: tarjeta, conexión, forma y grupo. El camino por la paleta de comandos y el menú tampoco lo evita; el fallo se dice en la barra de estado y no se calla. Desplazar la porción, ampliar y seleccionar un elemento con un clic siguen permitidos, porque no tocan el documento.

El modo de edición libera el manejo — lápiz en la barra de estado, `Ctrl+E` predeterminado; los detalles están en la página [Vistas y presentación](views-display.md).

## La superficie fuera de la vista de lienzo

Como la superficie se encuentra en un documento Markdown corriente, aparece en todas las vistas de ese documento:

| Vista | Qué aparece |
| ----- | ----------- |
| Código | el bloque en texto claro — esta vista **es** la fuente |
| Dividida | el texto claro a la izquierda, el bloque resumen a la derecha |
| Renderizada | **el bloque resumen**: tipo, volumen en tarjetas, conexiones, formas y grupos, una vista previa de los textos de las tarjetas y el botón «Abrir la vista Canvas» |
| Live | el mismo bloque; cuando el punto de inserción toca el bloque, este se despliega en texto en bruto y allí es editable |
| Mapa mental | una nota breve con tipo y volumen en lugar del texto en bruto |
| Lienzo | la superficie misma |

La vista previa muestra como máximo seis tarjetas; debajo consta cuántas más hay. El bloque se puede **plegar**, quedándose su línea de encabezado; ese estado vale para la sesión en curso y no se escribe en el documento. La impresión y la exportación a PDF siguen la vista renderizada, sin imprimir los dos botones del bloque.

## Los enlaces en la red del área

Una tarjeta de enlace es un **enlace como uno del texto corrido**, solo que sobre una superficie. Por eso aparece en todos los lugares donde la aplicación muestra enlaces:

| Lugar | Qué aparece |
| ----- | ----------- |
| retroenlaces del destino | la superficie como origen, marcada con «en un lienzo»; el extracto es la etiqueta de la tarjeta |
| enlaces salientes del documento | una entrada del tipo «Tarjeta de enlace en un lienzo», marcada con `C` |
| [Vista de grafo](graph.md) | una arista como cualquier otro enlace |

Los retroenlaces y los enlaces salientes se describen en conjunto en la página [Enlaces](linking.md).

Si el destino se **renombra o se mueve**, el atributo de la tarjeta lo sigue, como un enlace del texto corrido; lo mismo vale para la imagen de una tarjeta de imagen.

Dos cosas no cuentan: una **imagen** no obtiene ningún nodo en el grafo de enlaces, igual que tampoco lo obtiene una imagen del texto corrido. Y un enlace en el **texto propio** de una tarjeta queda fuera: solo cuenta el destino de la tarjeta.

## El formato de almacenamiento

La superficie está en texto claro dentro del documento. Por eso puede interpretarse sin esta aplicación, y lo que hay en las tarjetas es legible en cualquier herramienta de texto.

### Estructura

Dentro del bloque, cada elemento empieza con un **marcador en la columna 0**. Sus atributos están en la línea del marcador; las líneas siguientes, hasta el marcador siguiente, son su contenido.

Un atributo tiene la forma `nombre=valor`. Un valor es o bien una palabra sin espacios, o bien una cadena entre comillas rectas, en la que `\"` representa una comilla y `\\` una barra invertida. Los identificadores se componen de letras, cifras, guion y guion bajo.

### Tarjetas

```text
!karte <identificador> x=<número> y=<número> b=<número> h=<número>
```

| Atributo | Significado |
| -------- | ----------- |
| `x`, `y` | esquina superior izquierda de la tarjeta |
| `b`, `h` | anchura y altura |

Los cuatro son **números enteros** contados en píxeles con zoom 1. El **origen está en el centro de la superficie**: los valores negativos quedan a su izquierda o por encima. Las líneas bajo el marcador son el texto de la tarjeta.

Otros dos atributos hacen de la tarjeta una **tarjeta de enlace** o una **tarjeta de imagen**:

```text
!karte <identificador> x=<número> y=<número> b=<número> h=<número> doc="<destino>"
!karte <identificador> x=<número> y=<número> b=<número> h=<número> bild="<imagen>"
```

`doc=` muestra el contenido de un documento. El destino admite las mismas formas que el destino de una incrustación: el nombre del documento o una ruta relativa al propio documento, seguida a elección de `#Título` o de `#^block-id`.

`bild=` muestra una imagen. El valor es una ruta relativa al documento o el mero nombre de un archivo de imagen del área; las extensiones admitidas son `png`, `jpg`, `jpeg`, `gif`, `svg`, `webp`, `bmp` e `ico`.

Si ambos atributos están en la misma tarjeta, vale `doc=`. Un valor vacío y una extensión fuera de la lista son un **hallazgo**; aun así el atributo permanece sin cambios en el archivo. Las líneas bajo el marcador son también aquí el texto propio de la tarjeta; en una tarjeta de enlace y en una de imagen, su **etiqueta**.

### Conexiones

```text
!linie <identificador> <primer extremo> <flecha> <segundo extremo> von=<lado> nach=<lado> farbe=<nombre>
```

Los dos extremos son identificadores de tarjetas, y la **flecha entre ellos lleva la dirección**:

| Flecha | Significado |
| ------ | ----------- |
| `->` | dirigida, punta en el segundo extremo |
| `<->` | punta en ambos extremos |
| `--` | sin punta |

`von=` nombra el lado de conexión en el primer extremo, `nach=` el del segundo; se admiten `links` (izquierda), `rechts` (derecha), `oben` (arriba), `unten` (abajo) y `auto`. `farbe=` da color a la línea; se admiten `blau`, `rot`, `grün`, `gelb`, `lila`, `orange`, `türkis` y `pink` — azul, rojo, verde, amarillo, morado, naranja, turquesa y rosa. Sin ese atributo, la línea se dibuja en el color predeterminado del esquema de colores. Las líneas bajo el marcador son la **etiqueta**.

### Formas

```text
!form <identificador> x=<número> y=<número> b=<número> h=<número> art=<nombre> rand=<color> füllung=<color>
```

La posición y el tamaño cuentan como en una tarjeta. `art=` es uno de seis nombres: `rechteck` (rectángulo), `abgerundet` (redondeado), `oval` (elipse), `dreieck` (triángulo), `raute` (rombo) y `stern` (estrella). `rand=` y `füllung=` toman los mismos ocho nombres de color que la conexión, y `füllung=keine` deja la forma sin relleno. Sin `art` rige el rectángulo, sin `rand` el color predeterminado y sin `füllung` la forma queda sin relleno: un valor por defecto no se escribe, porque su ausencia ya lo dice. Las líneas bajo el marcador son la **etiqueta**.

Un nombre desconocido en `art` o en uno de los dos colores es un **hallazgo**: la forma se conserva, se dibuja como rectángulo o en el color predeterminado, y su texto queda sin cambios en el archivo.

### Grupos

```text
!gruppe <identificador> x=<número> y=<número> b=<número> h=<número> farbe=<nombre>
```

La posición y el tamaño describen el rectángulo, `farbe=` toma uno de los ocho nombres de color; sin ese dato rige el color predeterminado. Las líneas bajo el marcador son la **etiqueta**. **En el archivo no hay ninguna lista de miembros**: quién está dentro del grupo se desprende de los rectángulos y de nada más.

### El orden dentro del bloque

El **orden dentro del bloque es a la vez el orden de apilamiento** sobre tarjetas, formas y grupos: lo que está más abajo queda más adelante. Las conexiones están en la misma secuencia, pero no se ven afectadas por ella; se dibujan en una capa propia bajo todos los elementos.

### Dos reglas que protegen el archivo

- **La salida de emergencia del signo de exclamación.** Una línea de contenido que empieza por `!` recibe una barra invertida delante al escribirse y la pierde de nuevo al leerse: en el documento consta `\!Atención`, en la tarjeta aparece `!Atención`. Si la línea debe leerse literalmente `\!Atención`, en el documento consta `\\!Atención`.
- **Lo desconocido se conserva.** Un marcador o un atributo que la aplicación no conoce se arrastra y se reescribe sin cambios; un elemento no modificado se emite palabra por palabra. Quien abre una superficie y la guarda sin cambios recupera el mismo archivo. Un atributo defectuoso tampoco tira nada: el elemento se dibuja entonces de forma llamativa o no se dibuja, pero nunca desaparece del archivo.

### Un ejemplo

````markdown
```perspective-canvas
!gruppe g1 x=-360 y=-200 b=740 h=220 farbe=blau
Análisis

!karte k1 x=-320 y=-140 b=260 h=120
## Punto de partida

La importación solo lee hoy una fuente.

!karte k2 x=40 y=-140 b=260 h=120
## Objetivo

Varias fuentes, una fusión.

!karte k3 x=-140 y=120 b=260 h=160
## Pregunta abierta

¿Cómo se resuelven los conflictos?

!karte k4 x=420 y=-200 b=240 h=160 doc="Conceptos/Import.md#Objetivo"
El objetivo en el concepto

!karte k5 x=420 y=-20 b=240 h=140 bild="adjuntos/boceto.png"
Boceto de la interfaz

!form f1 x=260 y=140 b=120 h=120 art=stern rand=rot füllung=gelb
Idea central

!linie e1 k1 -> k2 von=rechts nach=links farbe=blau
da como resultado

!linie e2 k3 -- k1
boceto para ello

!linie e3 k2 <-> k3 von=unten nach=oben
se condicionan
```
````

Al representarse, aquí aparece el bloque resumen, y el botón que contiene lleva a la superficie:

```perspective-canvas
!gruppe g1 x=-360 y=-200 b=740 h=220 farbe=blau
Análisis

!karte k1 x=-320 y=-140 b=260 h=120
## Punto de partida

La importación solo lee hoy una fuente.

!karte k2 x=40 y=-140 b=260 h=120
## Objetivo

Varias fuentes, una fusión.

!karte k3 x=-140 y=120 b=260 h=160
## Pregunta abierta

¿Cómo se resuelven los conflictos?

!karte k4 x=420 y=-200 b=240 h=160 doc="Conceptos/Import.md#Objetivo"
El objetivo en el concepto

!karte k5 x=420 y=-20 b=240 h=140 bild="adjuntos/boceto.png"
Boceto de la interfaz

!form f1 x=260 y=140 b=120 h=120 art=stern rand=rot füllung=gelb
Idea central

!linie e1 k1 -> k2 von=rechts nach=links farbe=blau
da como resultado

!linie e2 k3 -- k1
boceto para ello

!linie e3 k2 <-> k3 von=unten nach=oben
se condicionan
```

## Límites

- El **contenido mostrado** de una tarjeta de enlace no se modifica en la tarjeta; se modifica en el documento al que apunta. Las formas y los grupos no llevan contenido renderizado alguno, sino como mucho una etiqueta de texto sencillo.
- **Las incrustaciones dentro del contenido mostrado no se resuelven.** Si una tarjeta de enlace muestra un documento que a su vez incrusta algo, ese lugar queda vacío en la tarjeta; todo lo demás aparece sin cambios.
- Un cambio en el destino aparece **de inmediato** mientras este se edite en otro documento abierto; si se cambia un archivo que no está abierto en ninguna parte, eso aparece la próxima vez que se dibuja la superficie.
- **No hay dibujo libre.** La superficie conoce las seis clases de forma y ninguna otra geometría; los trazos a mano alzada, las flechas dibujadas por uno mismo y la entrada con lápiz no forman parte de ella.
- Una **conexión** va únicamente entre tarjetas; no se conecta ni a una forma ni a un grupo.
- Un enlace en el **texto propio** de una tarjeta no aparece en el grafo de enlaces ni en los retroenlaces; solo cuenta el destino de una tarjeta de enlace. Una imagen no obtiene ningún nodo en el grafo de enlaces.
- **El arrastre libre y el zoom no existen por teclado.** La lista del lienzo selecciona, edita, elimina y crea; la posición de un elemento solo se cambia por teclado con los cuatro comandos del orden. Mover, cambiar el tamaño y desplazar la porción quedan reservados al ratón.
- **La lista hace manejable la superficie, no gráfica.** Enumera lo que allí hay y no sustituye lo que muestra la disposición espacial.
- **La búsqueda en el área sigue encontrando un documento con superficie por su texto**, porque la superficie está en él en texto plano; una fuente propia de coincidencias no lo es. Las tarjetas, formas y grupos por separado no aparecen, pues, como coincidencias propias: las encuentra el campo de filtro de la lista del lienzo.
- Una superficie pertenece a su documento. Las tarjetas no pueden arrastrarse de una superficie a otra.
