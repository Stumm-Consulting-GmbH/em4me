# Presentación

Una **presentación** es un documento Markdown corriente cuyo contenido está dividido en **diapositivas**. La aplicación lo muestra diapositiva a diapositiva en la vista **Diapositivas**, lo proyecta a pantalla completa o en una ventana aparte, ofrece al orador una **vista del moderador** con notas y tiempo, y exporta las diapositivas como PDF, como páginas HTML, como archivo PowerPoint o como imágenes.

La presentación es **otra vista del mismo documento** y no un formato de archivo propio. Se escribe en las vistas Markdown; la vista **Diapositivas** solo muestra y nunca cambia nada del texto. La única excepción es el diálogo **Diseño de esta presentación…**, que, si se desea, escribe el diseño en el encabezado del archivo.

## Cómo se reconoce una presentación

Por el **indicador** `presentation: true` en el encabezado del documento:

```markdown
---
presentation: true
---

# Título de la primera diapositiva
```

El valor debe ser `true`; `presentation: false`, un texto como `"true"` o una clave ausente no dan un documento de presentación. `marp: true` se reconoce igualmente, para que las presentaciones de otra herramienta de diapositivas se abran aquí sin cambios (véase «Compatibilidad con otras herramientas» más abajo). La aplicación nunca escribe esa clave por sí misma.

Un documento sin indicador sigue siendo un documento corriente: `---` es allí una línea horizontal como en cualquier otro sitio.

## Crear una presentación

**Ver → Presentación → Nueva presentación** crea un documento nuevo, todavía sin nombre, y lo abre enseguida en la vista **Diapositivas**. Lleva el indicador, el tema `light` y el número de página, además de tres diapositivas de ejemplo: una diapositiva de título, una diapositiva con una lista y una nota del orador, y una diapositiva que muestra cómo se escriben imagen y texto uno junto al otro. Se guarda como cualquier documento nuevo, al guardar por primera vez. La orden está también en la paleta de comandos (predeterminado `Ctrl+K`).

Para convertir un documento existente en presentación, se añade uno mismo el indicador en su encabezado.

## Separar diapositivas

Una línea de tres guiones `---` separa dos diapositivas, exactamente allí donde según CommonMark es una línea horizontal. Lo más seguro es dejar una línea vacía antes y después:

```markdown
# Primera diapositiva

Texto de la primera diapositiva.

---

# Segunda diapositiva
```

**Lo que no separa:**

- `---` justo debajo de una línea de texto: es un subrayado de título (Setext) y no una línea.
- `---` en un bloque de código, en una cita, sangrado dentro de un elemento de lista o con cuatro espacios delante.
- `---` en un comentario.
- Las dos líneas que encierran el encabezado.
- `***` y `___`: siguen siendo líneas **sobre** la diapositiva, para que una diapositiva pueda llevar su propia línea divisoria.

La línea de separación no pertenece a ninguna diapositiva. Dos líneas de separación seguidas dan una diapositiva vacía, igual que una línea de separación justo después del encabezado o al final del documento; un documento sin línea de separación es una sola diapositiva.

### Separar en los títulos

Con la clave `headingDivider` en el encabezado empieza además una diapositiva nueva **antes de cada título** hasta el nivel indicado. El valor es un número del 1 al 6:

```markdown
---
presentation: true
headingDivider: 2
---

# Primera parte

## Un subapartado

## Otro subapartado
```

Aquí cada título de los niveles 1 y 2 da una diapositiva propia, es decir, tres diapositivas sin una sola línea de separación. El título queda arriba en su nueva diapositiva. Si delante de él en la diapositiva no hay más que líneas vacías y comentarios, no empieza ninguna diapositiva más; por eso las líneas de separación y los títulos pueden mezclarse sin que surjan diapositivas vacías. Los títulos dentro de bloques de código, citas y listas no separan.

La indicación vale para toda la serie de diapositivas, aunque esté en un comentario más abajo (véase «Indicaciones por diapositiva»); si hay varias, vale la última. Un valor no válido no se tiene en cuenta, y la línea de aviso lo cita. La notación como lista, por ejemplo `[1, 3]`, no tiene efecto.

## El encabezado: claves de control

Además del indicador, el encabezado admite seis claves de control, todas opcionales:

| Clave | Efecto | Predeterminado |
| ----- | ------ | -------------- |
| `theme` | aspecto de las diapositivas: `light`, `dark`, `accent` o el nombre de un tema propio, a elección con valores propios (véase más abajo) | `light` |
| `paginate` | `true` muestra el número de página abajo a la derecha de cada diapositiva | `false` |
| `header` | texto de la línea de cabecera en cada diapositiva | ninguno |
| `footer` | texto de la línea de pie en cada diapositiva | ninguno |
| `size` | formato de las diapositivas: `16:9` o `4:3` | `16:9` |
| `headingDivider` | número del 1 al 6: cada título hasta ese nivel empieza una diapositiva nueva (véase más arriba) | ninguno |

Un encabezado completo:

```markdown
---
presentation: true
theme: dark
paginate: true
header: Informe trimestral
footer: "**Departamento de ventas** · interno"
size: 4:3
---
```

Las demás claves del encabezado, como `title` o `tags`, quedan intactas y actúan como en cualquier otro documento. Si un valor no es válido, se aplica el predeterminado. Ante un tema desconocido o no válido, ante un formato desconocido y ante un valor no válido de `headingDivider`, una **línea de aviso** encima de la diapositiva indica el motivo. Tema, colores, cabecera, pie y número de página pueden indicarse de otra manera para diapositivas sueltas (véase «Indicaciones por diapositiva»).

## Aspecto

### Los tres temas

| Tema | Aspecto |
| ---- | ------- |
| `light` | texto oscuro sobre blanco, acento en azul |
| `dark` | texto claro sobre casi negro, acento en azul claro |
| `accent` | texto blanco sobre azul intenso, acento en amarillo |

Las diapositivas se ven igual con cualquier esquema de colores de la aplicación: el tema pertenece a la presentación, no a la interfaz.

Quien necesite un diseño a menudo lo crea como **tema propio** y lo elige por su nombre (véase «Temas propios»).

### Sustituir valores sueltos

En lugar de un nombre, `theme` lleva un bloque. La entrada `name` elige el tema de base (sin `name` es `light`); las demás entradas sustituyen valores sueltos:

```yaml
theme:
  name: dark
  accent: "#ff6b6b"
  font: Georgia, serif
```

| Entrada | Efecto |
| ------- | ------ |
| `background` | fondo de la diapositiva |
| `text` | color del texto corrido |
| `heading` | color de los títulos |
| `accent` | color de los enlaces y de las barras de cita |
| `font` | fuente de la diapositiva |
| `header-footer` | color de la cabecera y del pie |
| `page-number` | color del número de página |

Se admiten colores, degradados y listas de fuentes en la notación de CSS. Un valor que cargaría un archivo o una dirección no se adopta. Una entrada desconocida no se tiene en cuenta, un valor no válido se sustituye por el del tema; la línea de aviso indica ambas cosas. Los bloques de código y los resaltados siguen la luminosidad del tema de base; si cambia mucho el fondo, elija un tema de base claro u oscuro acorde.

### Imagen de fondo y división en dos

Una imagen pasa a ser el fondo de la diapositiva cuando la primera palabra de su texto alternativo es `bg`:

```markdown
![bg](imagenes/paisaje.jpg)
![bg contain](imagenes/grafico.png)
![bg left:40%](imagenes/retrato.jpg)
```

| Notación | Efecto |
| -------- | ------ |
| `bg` o `bg cover` | llena la diapositiva; lo que sobresale se recorta |
| `bg contain` o `bg fit` | muestra la imagen entera; las zonas libres muestran el fondo de la diapositiva |
| `bg auto` | muestra la imagen en su propio tamaño |
| `bg 50%` | muestra la imagen en el tamaño indicado |
| `bg left`, `bg right` | **división en dos**: la imagen llena la mitad izquierda o derecha, el texto pasa al otro lado |
| `bg left:40%`, `bg right:33%` | división en dos con un ancho propio del lado de la imagen |

Varias imágenes de fondo de una diapositiva se colocan una junto a otra, con `vertical` en la primera imagen una encima de otra; en la división en dos se reparten el lado de la imagen. Cabecera, pie y número de página quedan entonces en el lado del texto. Una imagen que no se puede cargar, por ejemplo porque falta su archivo, se omite; la diapositiva aparece sin ella. Las imágenes de fondo se cargan por el mismo camino que cualquier otra imagen del documento y siguen las mismas reglas.

### Diapositivas demasiado llenas

Cada diapositiva tiene un formato fijo, 16:9 o 4:3, y se ajusta de forma uniforme a la superficie disponible; el texto crece y se encoge con ella. Si el contenido de una diapositiva no cabe, se **reduce automáticamente** hasta que quepa, como mucho hasta la mitad de su tamaño. La cabecera, el pie y el número de página conservan su tamaño, y el margen de la diapositiva no cambia. La reducción actúa igual en todas partes: en la vista, en la proyección y la vista del moderador, en la vista general y en ambas exportaciones.

Solo lo que no cabe ni siquiera a la mitad de tamaño se corta en el borde, y una **barra rayada** en el borde inferior señala la diapositiva demasiado llena. La barra no aparece en la proyección ni en las exportaciones. El remedio es una diapositiva más.

## Temas propios

Un **tema propio** es un diseño con nombre que se basa en uno de los tres temas incluidos y fija de otra manera algunos de los siete valores. Vale en cada presentación que lo nombre en el encabezado:

```yaml
theme: Empresa
```

El nombre se encuentra sin distinguir mayúsculas y minúsculas; `theme: empresa` elige por tanto también el tema «Empresa». Como cualquier otro tema, un tema propio puede servir de base a un bloque cuya entrada `name` lo nombre. Si el tema nombrado no existe, por ejemplo en otro ordenador, las diapositivas aparecen con el tema `light`, y la línea de aviso cita el nombre.

Los temas propios pertenecen a la configuración de la aplicación, no al archivo. Valen en todas las ventanas y viajan con el archivo de su propia configuración (véase [Exportar e importar la configuración](setup-exchange.md)).

### La sección «Temas de diapositivas» de la configuración

En **Archivo → Configuración… → Temas de diapositivas**, dentro del bloque «Extensiones (internas)», se gestionan los temas propios:

- **Nuevo** crea un tema que se basa en el diseño `light`, `dark` o `accent` elegido en **Plantilla**; al principio se llama «Tema nuevo».
- **Duplicar** crea una copia del tema elegido, **Eliminar** lo quita.
- En el campo **Nombre** se cambia el nombre del tema. Un nombre no puede estar vacío, ni pertenecer a un tema incluido, ni estar ya ocupado, tampoco con otras mayúsculas y minúsculas; una infracción se indica en el acto, y Aplicar y OK quedan bloqueados hasta que se corrija.

Debajo están los siete valores de la tabla «Sustituir valores sueltos», cada uno en una fila: los colores tienen un selector de color y un campo de texto que admite cualquier notación de CSS, la fuente un campo de texto con sugerencias. **Restablecer** devuelve una fila al valor del tema de base. Un valor no válido se marca y no se adopta. Una **diapositiva de vista previa** muestra el diseño con cada entrada. Se guarda con **Aplicar** u **OK**; el cambio actúa en el acto en todas las presentaciones abiertas.

### Diseño de esta presentación

**Ver → Presentación → Diseño de esta presentación…** ajusta el diseño de un solo archivo sin escribir el encabezado a mano. La orden puede elegirse para cualquier presentación modificable, sea cual sea la vista en que se muestre, y está en la paleta de comandos.

Arriba, el diálogo indica el tema, elegido entre los temas incluidos y los propios; un nombre desconocido del encabezado sigue pudiéndose elegir como «Nombre (desconocido)». Debajo indica para cada valor si vale **como el tema**, con el valor del tema entre paréntesis, o como **valor propio**. Una entrada pone la fila en «valor propio», **Restablecer** la devuelve a «como el tema».

**OK** escribe la elección en el encabezado del archivo: sin valores propios como `theme:` con el nombre, si no como bloque con `name:` y los valores propios. El paso se puede deshacer de una vez. Las demás entradas del encabezado quedan sin cambios, y quien no ha cambiado nada tampoco cambia nada en el archivo. Si el documento ha cambiado mientras el diálogo estaba abierto, no se escribe nada, y la barra de estado lo indica.

Dos botones más van más allá del archivo suelto:

- **Guardar como tema…** pide un nombre, crea un tema propio a partir del tema elegido y los valores propios, y escribe en el archivo solo `theme:` con ese nombre. Si se cancela el nombre, todo queda como estaba.
- **Copiar los valores del tema en el archivo** puede elegirse con un tema propio. Escribe los siete valores como bloque en el encabezado, basado en el tema incluido subyacente. Así el archivo se ve igual también donde el tema propio no existe, por ejemplo tras pasarlo a otras personas.

## Número de página, cabecera y pie

`paginate: true` muestra en cada diapositiva su número abajo a la derecha. `header` y `footer` ponen una línea arriba o abajo de cada diapositiva; un formato sencillo como negrita, cursiva o un enlace aparece con formato. Un valor vacío no muestra ninguna línea, un texto demasiado largo termina con puntos suspensivos. En el encabezado, estas indicaciones valen igual para todas las diapositivas; para diapositivas sueltas pueden fijarse de otra manera (véase «Indicaciones por diapositiva»).

## Indicaciones por diapositiva

Algunas diapositivas pueden tener otro aspecto que el resto. Para ello, en la diapositiva va un comentario HTML con una o varias claves:

```markdown
# Situación intermedia

<!-- _backgroundColor: "#fff3bf" -->
<!-- _paginate: false -->
```

**El alcance depende del guion bajo:**

- Con `_` delante de la clave, la indicación vale **solo para esta diapositiva**.
- Sin `_`, vale **a partir de esta diapositiva** para todas las siguientes, hasta que llegue una indicación nueva de la misma clave.
- Solo `headingDivider` vale siempre para toda la serie de diapositivas (véase «Separar en los títulos»).

**Se interpretan estas claves:**

| Clave | Efecto |
| ----- | ------ |
| `theme` | cambia el tema, con el nombre de un tema incluido o propio |
| `backgroundColor`, `backgroundImage` | fondo de la diapositiva, por ejemplo un color o un degradado |
| `color` | color del texto corrido |
| `header`, `footer` | texto de la línea de cabecera y de la de pie; un texto vacío oculta la línea |
| `paginate` | `true` muestra el número de página, `false` lo oculta y sigue contando, `hold` lo muestra sin seguir contando, `skip` lo oculta sin seguir contando |
| `background`, `text`, `heading`, `accent`, `font`, `header-footer`, `page-number` | los siete valores de la tabla «Sustituir valores sueltos» |

Un cambio de tema sustituye el tema junto con los valores propios del bloque del encabezado; los colores y la fuente fijados por comentario siguen valiendo después del cambio. Los valores que cargarían un archivo o una dirección no se adoptan, igual que en el encabezado; una imagen de fondo se indica con la notación `bg` (véase «Imagen de fondo y división en dos»). Si un valor no es válido o un tema es desconocido, sigue valiendo el valor anterior, y la línea de aviso indica el motivo en esta diapositiva.

Estos comentarios no son notas del orador. Otras claves de la misma notación, como `class` o `style`, se quedan en el documento pero aquí no tienen efecto (véase «Compatibilidad con otras herramientas»).

## Notas del orador

Los comentarios de una diapositiva son sus **notas del orador**. Valen las dos formas:

```markdown
# Resultados

- Ventas en alza
- Costes a la baja

%% Mencionar aquí las cifras del año anterior. %%

<!-- Ante preguntas, remitir al anexo. -->
```

Son una excepción los comentarios con instrucciones para herramientas de formato, como `<!-- prettier-ignore -->` o `<!-- markdownlint-disable -->`: igual que los comentarios con indicaciones por diapositiva, no son notas del orador y no aparecen ni en la diapositiva, ni en la vista del moderador, ni en ninguna exportación.

Las notas no aparecen en la diapositiva ni en la proyección. La **vista del moderador** se las muestra al orador, con el formato de un texto en una diapositiva, es decir, con negrita, cursiva, listas y enlaces; el HTML de una nota aparece allí como texto. En el PDF y en las páginas HTML solo aparecen si están activadas (véase «Incluir las notas del orador»). En el editor siguen visibles. Si la extensión «Comentarios» está desactivada, `%%` es texto corriente y aparece en la diapositiva; los comentarios HTML siguen siendo notas también entonces. Los comentarios privados con `%%` se describen en la página [Construcciones en línea](inline.md).

## La vista «Diapositivas»

La presentación es el octavo modo de vista, junto a Renderizado, Dividido, Código fuente, En vivo, Mapa mental, Lienzo y Tablero: **Ver → Diapositivas**, el botón **Diapositivas** en la barra de estado o predeterminado `Ctrl+8`. Como en los demás modos, la elección vale por documento abierto y se restablece en el siguiente inicio.

**El modo depende del documento.** Solo puede elegirse para un documento con indicador. Si no, el botón y la entrada de menú siguen visibles y atenuados, y el título del botón indica el motivo: «Este documento no es una presentación». Un documento que se muestra en la vista **Diapositivas**, o que estaba abierto en ella al salir, y que ya no lleva el indicador aparece en la vista de lectura.

La vista muestra una diapositiva, encima el contador, por ejemplo «3 / 12», y los botones **Anterior**, **Siguiente** e **Iniciar proyección**. Al cambiar a la vista se muestra la diapositiva en la que está el cursor. Lo que se muestra es siempre el estado actual del documento, incluidos los cambios sin guardar.

**Pasar diapositivas** funciona con los botones, con la **rueda del ratón** sobre la diapositiva (hacia abajo la siguiente, hacia arriba la anterior, una diapositiva por movimiento de la rueda) y con el teclado en cuanto la superficie de las diapositivas tiene el foco:

| Tecla | Efecto |
| ----- | ------ |
| `Flecha derecha`, `Av Pág`, `Espacio` | diapositiva siguiente |
| `Flecha izquierda`, `Re Pág`, `Mayús+Espacio` | diapositiva anterior |
| `Inicio`, `Fin` | primera o última diapositiva |

En la primera y en la última diapositiva, el paso se detiene.

## Vista general de diapositivas

**Ver → Presentación → Vista general de diapositivas** muestra en la vista **Diapositivas** todas las diapositivas como **cuadrícula**, cada una como pequeña imagen con su número. Al principio está seleccionada la diapositiva que muestra la vista.

| Entrada | Efecto |
| ------- | ------ |
| `Flecha izquierda`, `Flecha derecha` | una diapositiva atrás o adelante |
| `Flecha arriba`, `Flecha abajo` | una fila de la cuadrícula arriba o abajo |
| `Inicio`, `Fin` | primera o última diapositiva |
| Clic, `Intro`, `Espacio` | ir a la diapositiva elegida y cerrar la vista general |
| `Esc` | cerrar la vista general sin cambiar de diapositiva |

La rueda del ratón desplaza la cuadrícula. Una segunda llamada de la orden también cierra la vista general, igual que el inicio de una proyección. La vista general muestra el estado en el momento de abrirla; al abrirla de nuevo muestra los cambios del documento. La orden también está en la paleta de comandos.

## Proyección

La proyección muestra la presentación a **pantalla completa**: la ventana pasa a pantalla completa, todas las barras de la aplicación desaparecen y solo se ve la diapositiva, tan grande como la pantalla la abarque. Se inicia en la vista **Diapositivas**:

- con **Ver → Presentación → Iniciar proyección**,
- con predeterminado `F5`,
- con el botón **Iniciar proyección** encima de la diapositiva.

La paleta de comandos también ofrece la orden. La proyección empieza en la diapositiva que la vista muestra en ese momento. Se pasa de diapositiva con las mismas teclas que en la vista; además, un **clic del ratón** avanza una diapositiva, y la **rueda del ratón** pasa una diapositiva por movimiento, hacia abajo la siguiente y hacia arriba la anterior. Las listas cuyos puntos deben aparecer paso a paso se describen en «Descubrir listas punto por punto».

Se **termina** con `Esc`. También termina cuando se sale de la pantalla completa de otra manera, cuando otra ventana pasa al primer plano o cuando cambian el documento o la vista. Después, la vista queda en la última diapositiva mostrada. La ventana vuelve a salir de la pantalla completa, salvo que ya estuviera en ella antes de la proyección.

Esta proyección se ejecuta siempre en la ventana de la aplicación, aunque haya una segunda pantalla conectada. Para presentar con proyector o segunda pantalla existen la proyección en una ventana aparte y la vista del moderador (véase «Presentar con dos pantallas»).

## Descubrir listas punto por punto

Los puntos de una lista pueden **descubrirse uno a uno** en la proyección. Lo decisivo es cómo está escrita la lista:

```markdown
* aparece con el primer paso
* aparece con el segundo paso

1) también listas numeradas
2) con paréntesis en lugar de punto

- aparece en el acto
1. también aparece en el acto
```

Los puntos con `*` y los puntos numerados con `)` se descubren; los puntos con `-` o `+` y los puntos numerados con `.` están ahí desde el principio. Cada punto es un paso, también uno sangrado; un punto sangrado sigue oculto mientras lo esté su punto superior.

En la proyección, tanto a pantalla completa como en una ventana aparte, y en la vista del moderador, «siguiente» descubre el punto siguiente, y solo después del último llega la diapositiva siguiente; «anterior» vuelve a ocultar el último punto descubierto. Una diapositiva a la que se llega hacia atrás aparece completa, una a la que se llega hacia delante, con los puntos ocultos. Los puntos ocultos conservan su espacio, de modo que la diapositiva no salta al descubrirlos.

En la vista **Diapositivas**, en la vista general, en la vista previa de la diapositiva siguiente y en ambas exportaciones, todos los puntos aparecen en el acto.

## Presentar con dos pantallas

Para una charla con proyector o segunda pantalla, una **ventana aparte** muestra al público solo la diapositiva, mientras la ventana de la aplicación sigue siendo utilizable. Ambas órdenes pueden elegirse en la vista **Diapositivas**, en el submenú **Ver → Presentación** y en la paleta de comandos; no tienen atajo predeterminado, pero se les puede asignar uno en Configuración → Atajos de teclado.

**La pantalla:** si hay dos o más pantallas conectadas, la ventana se abre a pantalla completa en una pantalla en la que no está la ventana de la aplicación. Con una sola pantalla se abre como ventana corriente, que se puede mover y cambiar de tamaño. La ventana no tiene menú ni pestañas, no cuenta entre las ventanas de la aplicación y no vuelve tras un reinicio.

### Proyección en una ventana aparte

**Ver → Presentación → Proyección en una ventana aparte** abre la ventana para el público y muestra en ella la diapositiva que la vista muestra en ese momento. Se pasa de diapositiva en ambas ventanas con las mismas teclas que en la vista; en la ventana del público también pasan diapositiva el clic y la rueda del ratón. Ambas ventanas muestran siempre la misma diapositiva. Los cambios en el documento aparecen en el acto también para el público.

Se **termina** con `Esc` en cualquiera de las dos ventanas, con **Ver → Presentación → Finalizar proyección** o cerrando la ventana del público. También termina cuando el documento deja de estar en la vista **Diapositivas**. Solo hay una proyección en marcha a la vez.

### Vista del moderador

**Ver → Presentación → Vista del moderador** inicia la proyección en una ventana aparte y convierte la ventana de la aplicación en el puesto del orador. Allí están:

- a la izquierda la **diapositiva actual**, tal como la ve el público;
- arriba a la derecha la **diapositiva siguiente**, en la última diapositiva la palabra «Fin» en su lugar;
- debajo, las **notas del orador** de la diapositiva actual, con formato y desplazables si son largas; sin notas, un breve aviso;
- debajo, el **tiempo transcurrido** desde el inicio y la **hora**, junto con los botones **Pausar** o **Reanudar** y **Restablecer**.

Encima de ambas columnas están, como siempre, el contador y los botones **Anterior** y **Siguiente**. El tiempo empieza con el inicio de la vista del moderador; **Restablecer** lo pone a cero, un tiempo en marcha sigue corriendo después, uno en pausa sigue en pausa.

Se pasa de diapositiva como en la proyección en una ventana aparte, en ambas ventanas con las mismas teclas; las listas con puntos por descubrir se descubren paso a paso con «siguiente». Si el documento se modifica durante la charla, la diapositiva actual, la siguiente y las notas se actualizan en el acto; si desaparece la diapositiva mostrada, la vista queda en la última que exista.

La vista del moderador se **termina** por los mismos caminos que la proyección en una ventana aparte. Después, el tiempo desaparece, y la vista **Diapositivas** queda en la última diapositiva mostrada.

## Exportar las diapositivas

Las cuatro exportaciones están en **Archivo → Más funciones de archivo → Exportar** y en la paleta de comandos. Pueden elegirse para cualquier documento de presentación, sea cual sea la vista en que se muestre; para un documento sin indicador siguen atenuadas. Cada diapositiva aparece en ellas tal como la muestra la vista, con tema, indicaciones por diapositiva, imágenes de fondo, número de página, cabecera y pie, diagramas y fórmulas, pero sin la barra de las diapositivas demasiado llenas. Las notas del orador solo van al PDF y a las páginas HTML si están activadas; el archivo PowerPoint las incluye siempre y las imágenes nunca (véase más abajo). Si se cancela el diálogo, no se crea nada. Tras la exportación, la barra de estado informa del número de diapositivas y, si algo se omitió, de qué.

### Como PDF

**Exportar diapositivas como PDF…** pregunta por el destino, proponiendo el nombre del documento con la extensión `.pdf` en la misma carpeta, y escribe un archivo PDF con **una diapositiva por página**. La página tiene el formato de la diapositiva, 16:9 o 4:3, y ningún margen. Los ajustes de formato de papel y márgenes de la exportación a PDF corriente no tienen efecto aquí.

### Como páginas HTML

**Exportar diapositivas como HTML…** pregunta por una carpeta y crea en ella **una página HTML por diapositiva**: `folie-001.html`, `folie-002.html` y así sucesivamente, además de `index.html` como página de inicio con la primera diapositiva. Si la carpeta elegida está vacía o contiene una exportación anterior, las páginas se crean en ella; si no, se crea una subcarpeta con el nombre del documento y el sufijo `-diapositivas`, y los archivos ya presentes quedan intactos.

Cualquier navegador abre las páginas, sin la aplicación y sin conexión de red. Cada página está completa por sí sola: imágenes, diagramas y fórmulas van incrustados en ella, de modo que la carpeta puede moverse o entregarse entera. Debajo de la diapositiva están **Anterior**, el contador y **Siguiente**, en el idioma que tenía la interfaz al exportar; además se pasa de diapositiva con las mismas teclas que en la proyección, y la diapositiva se adapta al tamaño de la ventana del navegador. Los enlaces y las imágenes siguen las reglas de la exportación a HTML de un documento (véase [Herramientas](tools.md)): un enlace a otro documento queda como texto, y una imagen que no se puede incrustar aparece como su texto; una imagen de fondo así se omite.

### Como archivo PowerPoint

**Exportar diapositivas como PowerPoint…** pregunta por el destino, proponiendo el nombre del documento con la extensión `.pptx` en la misma carpeta, y escribe un archivo PowerPoint con **una diapositiva de PowerPoint por diapositiva**. Cada una lleva una sola imagen que muestra la diapositiva exactamente como la proyección: con el tema o un tema propio, las indicaciones por diapositiva, las imágenes de fondo, las fórmulas, los diagramas, las imágenes y, en las diapositivas demasiado llenas, la reducción. La imagen tiene el doble de la resolución de la diapositiva, para que siga nítida también en pantallas grandes y proyectores. El archivo tiene el formato de la diapositiva, 16:9 o 4:3, según la clave `size`.

Las **notas del orador** figuran como texto en el campo de notas de la diapositiva correspondiente, donde el programa de presentaciones las muestra al orador sin que el público las vea. Se incluyen **siempre**, con independencia del interruptor **Incluir las notas del orador**, y aparecen tal como están escritas en el documento, sin formato; varias notas de una misma diapositiva quedan separadas por un párrafo vacío. Tras la exportación, el mensaje indica el número de diapositivas y de notas del orador incluidas.

Como cada diapositiva es una imagen, su texto no se puede editar ni buscar en PowerPoint; los cambios se hacen en el documento y después se exporta de nuevo.

### Como imágenes

**Exportar diapositivas como imágenes…** pregunta por una carpeta y crea en ella **una imagen por diapositiva** en formato PNG: `folie-001.png`, `folie-002.png` y así sucesivamente. Para la carpeta vale la misma regla que para las páginas HTML: si la carpeta elegida está vacía, se acaba de crear o contiene una exportación de imágenes anterior, las imágenes se crean en ella; si no, se crea una subcarpeta con el nombre del documento y el sufijo `-diapositivas`, y los archivos ya presentes quedan intactos. Las imágenes son las mismas que en el archivo PowerPoint, con doble resolución, y no contienen notas del orador. Tras la exportación, el mensaje indica el número de imágenes y la carpeta.

### Incluir las notas del orador

Si las notas van a la exportación lo decide el interruptor **Incluir las notas del orador** en **Archivo → Configuración… → Exportación**, grupo **Presentación de diapositivas**. Al principio está desactivado, para que al pasar un archivo nunca se incluyan notas sin darse cuenta, y vale para el PDF y las páginas HTML. El archivo PowerPoint lleva siempre las notas en su campo de notas (véase más arriba); las imágenes no llevan ninguna.

- **En el PDF**, a cada diapositiva con notas le sigue una **página de notas** con el formato de la diapositiva, titulada «Diapositiva N – Notas», y debajo las notas con formato sobre fondo blanco. Las notas más largas continúan en más páginas del mismo formato.
- **En las páginas HTML**, cada diapositiva con notas lleva, entre la diapositiva y la barra de navegación, una zona **Notas** plegada. Desplegada, se coloca sobre la diapositiva, como mucho hasta la mitad de la altura de la ventana del navegador, y se puede desplazar.

Las diapositivas sin notas no reciben ni página ni zona de notas. Con el interruptor activado, el mensaje tras la exportación indica el número de notas incluidas; desactivado, informa de que las notas del orador no están incluidas.

## La extensión «Vista de presentación»

La función pertenece a las [extensiones internas](extensions.md) («Vista de presentación», grupo «Renderizado») y al modo de trabajo **Avanzado**: en el modo **Principiante** está desactivada, en **Avanzado** y **Completo** activada.

Si está desactivada, desaparecen la vista **Diapositivas**, el submenú **Presentación** del menú **Ver** con todas sus órdenes, las cuatro órdenes de exportación de las diapositivas, sus entradas en la paleta de comandos y en los atajos de teclado y la sección **Temas de diapositivas** de la configuración. El indicador no tiene entonces ningún efecto: un documento de presentación es un documento Markdown corriente, y `---` es en él una línea horizontal. Un documento que estaba abierto en la vista **Diapositivas** aparece en la vista de lectura. No se pierde nada, y al desactivar y activar nunca se escribe nada; tras volver a activarla, la presentación y los temas propios están ahí sin cambios.

## Compatibilidad con otras herramientas

El indicador, las claves de control, las líneas de separación, las indicaciones por diapositiva y la notación de imagen con `bg` siguen a una herramienta extendida que crea diapositivas a partir de Markdown y marca sus archivos con `marp: true`. La compatibilidad es un compromiso explícito: una presentación escrita allí se abre aquí como presentación, sin que haya que cambiar nada en el archivo.

**Lo que vale aquí como allí:**

- el indicador `marp: true` y la separación en `---`;
- las claves `paginate`, `header`, `footer` y `size` en el encabezado y `headingDivider` con un número;
- las indicaciones por diapositiva en la misma notación, con `_` solo para la propia diapositiva y sin `_` a partir de esa diapositiva, para `backgroundColor`, `backgroundImage`, `color`, `header`, `footer` y `paginate`;
- la notación de imagen `![bg …](…)` con la división en dos;
- las listas con `*` y con `1)`, cuyos puntos aparecen uno a uno en la proyección;
- los comentarios HTML como notas del orador. Los comentarios con indicaciones por diapositiva no cuentan como notas ni aquí ni allí.

**Dónde difiere la aplicación:**

- **`***` y `___` no separan diapositivas aquí.** La otra herramienta también empieza en ellas una diapositiva nueva. Quien quiera un archivo dividido igual en ambas herramientas separa solo con `---` y no escribe líneas sobre una diapositiva con `***` o `___`.
- **La otra herramienta no conoce las notas `%%`** y las muestra como texto en la diapositiva. Quien necesite notas en ambas herramientas las escribe como comentario HTML `<!-- … -->`; estas valen en ambos sentidos.
- **Los temas de la otra herramienta no existen aquí.** `default`, `gaia` y `uncover` son desconocidos aquí; las diapositivas aparecen entonces con el tema `light`, y la línea de aviso cita el nombre. Sin embargo, un **tema propio** puede llevar exactamente ese nombre y entonces se aplica: quien crea un tema propio llamado `gaia` ve aquí el archivo con ese diseño, sin modificarlo.
- **`theme` en un comentario vale aquí a partir de su diapositiva.** La otra herramienta aplica un tema siempre a toda la serie de diapositivas. Quien quiera ver un archivo igual en ambas herramientas elige el tema en el encabezado.
- **Algunas indicaciones por diapositiva no tienen efecto:** `class`, `style`, `backgroundPosition`, `backgroundRepeat` y `backgroundSize`, así como `lang` y `math`. Se quedan en el documento y no se ejecutan, sin aviso. Una imagen de fondo mediante `backgroundImage` con un archivo o una dirección no se carga; para eso existe la notación `bg`.
- **`headingDivider` como lista**, por ejemplo `[1, 3]`, no tiene efecto; un archivo que la usa da aquí menos diapositivas.
- **El comentario `<!-- fit -->`**, con el que la otra herramienta ajusta un título al ancho de la diapositiva, no tiene efecto. Aquí, en cambio, una diapositiva demasiado llena se reduce en su conjunto.

**Qué más tener en cuenta:**

- La aplicación nunca escribe `marp: true` por sí misma. Quien quiera proyectar su archivo también en la otra herramienta lo añade junto a `presentation: true`.
- El bloque bajo `theme:` con valores propios y los siete valores como indicación por diapositiva, por ejemplo `<!-- accent: "#ff6b6b" -->`, son una notación de esta aplicación.
- La palabra `bg` tiene que ser aquí la **primera** palabra del texto alternativo. Otras palabras, como filtros de imagen, no se interpretan.

## Límites

- **Se exporta como PDF, como páginas HTML, como archivo PowerPoint y como imágenes.**
- **En el archivo PowerPoint, cada diapositiva es una imagen.** Su texto no se puede editar ni buscar allí. No se crea ningún archivo PowerPoint con objetos de texto editables, y los archivos PowerPoint no se pueden importar.
- **Programas comprobados:** la apertura del archivo está comprobada en Microsoft PowerPoint en Windows. LibreOffice Impress se comprueba en el banco de pruebas automático en Linux. Otros programas, como Keynote o Google Slides, leen el formato según el estándar, pero no están comprobados.
- **El diseño pasa por los temas y sus siete valores.** No hay reglas de estilo propias en CSS, ni diseños de diapositiva más allá de la división en dos, ni animaciones o transiciones entre diapositivas.
- **Solo se descubren puntos de lista**, ninguna otra parte de una diapositiva.
- **La reducción llega como mucho a la mitad.** Lo que aún no cabe se corta.
- **Se edita en las vistas Markdown**, no en la diapositiva.
