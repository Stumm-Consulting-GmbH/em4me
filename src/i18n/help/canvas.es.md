# Superficie Canvas

Un **lienzo** es una superficie de trabajo espacial dentro de un documento Markdown corriente: **tarjetas** con texto propio se colocan libremente sobre ella, **conexiones** trazan las relaciones entre ellas, **formas** ponen señales a su lado y **grupos** reúnen lo que va junto. Cuando se colocan alternativas una junto a otra, se esboza un flujo o se ordenan primero las ideas, aquí el orden proviene de la posición y no de la secuencia.

La superficie la sostiene un bloque de código con la etiqueta de lenguaje `perspective-canvas`. Un documento puede contener tantos como se quiera, y todo lo demás en él sigue siendo Markdown corriente.

La función pertenece a las [extensiones internas](extensions.md) («Vista de lienzo»). Desactivada, el bloque sigue siendo un bloque de código corriente, el modo de vista desaparece y los comandos de superficie, tarjeta, forma, grupo y orden de apilamiento se van. El documento permanece legible sin cambios; no se pierde nada.

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

- Una tarjeta lleva **texto propio**; no hay otros tipos de tarjeta. Las formas y los grupos forman parte de la superficie, pero no llevan contenido renderizado, sino como mucho una etiqueta de texto sencillo.
- **No hay dibujo libre.** La superficie conoce las seis clases de forma y ninguna otra geometría; los trazos a mano alzada, las flechas dibujadas por uno mismo y la entrada con lápiz no forman parte de ella.
- Una **conexión** va únicamente entre tarjetas; no se conecta ni a una forma ni a un grupo.
- Un enlace en el texto de una tarjeta **no** aparece en el grafo de enlaces ni en los retroenlaces: el índice del área omite el contenido de los bloques de código.
- La superficie se maneja con el ratón; el teclado lleva deshacer, eliminar y las entradas de texto.
- Una superficie pertenece a su documento. Las tarjetas no pueden arrastrarse de una superficie a otra.
