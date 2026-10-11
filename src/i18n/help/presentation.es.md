# Presentación

Una **presentación** es un documento Markdown corriente cuyo contenido está dividido en **diapositivas**. La aplicación lo muestra diapositiva a diapositiva en la vista **Diapositivas**, lo proyecta a pantalla completa y exporta las diapositivas como PDF o como páginas HTML.

La presentación es **otra vista del mismo documento** y no un formato de archivo propio. Se escribe en las vistas Markdown; la vista **Diapositivas** solo muestra y nunca cambia nada del texto.

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

## El encabezado: claves de control

Además del indicador, el encabezado admite cinco claves de control, todas opcionales:

| Clave | Efecto | Predeterminado |
| ----- | ------ | -------------- |
| `theme` | aspecto de las diapositivas: `light`, `dark` o `accent`, a elección con valores propios (véase más abajo) | `light` |
| `paginate` | `true` muestra el número de página abajo a la derecha de cada diapositiva | `false` |
| `header` | texto de la línea de cabecera en cada diapositiva | ninguno |
| `footer` | texto de la línea de pie en cada diapositiva | ninguno |
| `size` | formato de las diapositivas: `16:9` o `4:3` | `16:9` |

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

Las demás claves del encabezado, como `title` o `tags`, quedan intactas y actúan como en cualquier otro documento. Si un valor no es válido, se aplica el predeterminado. Ante un tema desconocido o no válido y ante un formato desconocido, una **línea de aviso** encima de la diapositiva indica el motivo.

## Aspecto

### Los tres temas

| Tema | Aspecto |
| ---- | ------- |
| `light` | texto oscuro sobre blanco, acento en azul |
| `dark` | texto claro sobre casi negro, acento en azul claro |
| `accent` | texto blanco sobre azul intenso, acento en amarillo |

Las diapositivas se ven igual con cualquier esquema de colores de la aplicación: el tema pertenece a la presentación, no a la interfaz.

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

Cada diapositiva tiene un formato fijo, 16:9 o 4:3, y se ajusta de forma uniforme a la superficie disponible; el texto crece y se encoge con ella. Lo que no cabe en la diapositiva se corta en el borde, y una **barra rayada** en el borde inferior señala la diapositiva demasiado llena. La barra no aparece en la proyección ni en las exportaciones. El remedio es una diapositiva más.

## Número de página, cabecera y pie

`paginate: true` muestra en cada diapositiva su número abajo a la derecha. `header` y `footer` ponen una línea arriba o abajo de cada diapositiva; un formato sencillo como negrita, cursiva o un enlace aparece con formato. Un valor vacío no muestra ninguna línea, un texto demasiado largo termina con puntos suspensivos. Estas indicaciones valen igual para todas las diapositivas.

## Notas del orador

Los comentarios de una diapositiva son sus **notas del orador**. Valen las dos formas:

```markdown
# Resultados

- Ventas en alza
- Costes a la baja

%% Mencionar aquí las cifras del año anterior. %%

<!-- Ante preguntas, remitir al anexo. -->
```

Las notas están solo en el código fuente: no en la diapositiva, no en la proyección, no en el PDF y no en las páginas HTML. En el editor siguen visibles. Si la extensión «Comentarios» está desactivada, `%%` es texto corriente y aparece en la diapositiva; los comentarios HTML siguen siendo notas también entonces. Los comentarios privados con `%%` se describen en la página [Construcciones en línea](inline.md).

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

## Proyección

La proyección muestra la presentación a **pantalla completa**: la ventana pasa a pantalla completa, todas las barras de la aplicación desaparecen y solo se ve la diapositiva, tan grande como la pantalla la abarque. Se inicia en la vista **Diapositivas**:

- con **Ver → Presentación → Iniciar proyección**,
- con predeterminado `F5`,
- con el botón **Iniciar proyección** encima de la diapositiva.

La paleta de comandos también ofrece la orden. La proyección empieza en la diapositiva que la vista muestra en ese momento. Se pasa de diapositiva con las mismas teclas que en la vista; además, un **clic del ratón** avanza una diapositiva, y la **rueda del ratón** pasa una diapositiva por movimiento, hacia abajo la siguiente y hacia arriba la anterior.

Se **termina** con `Esc`. También termina cuando se sale de la pantalla completa de otra manera, cuando otra ventana pasa al primer plano o cuando cambian el documento o la vista. Después, la vista queda en la última diapositiva mostrada. La ventana vuelve a salir de la pantalla completa, salvo que ya estuviera en ella antes de la proyección.

## Exportar las diapositivas

Las dos exportaciones están en **Archivo → Más funciones de archivo → Exportar** y en la paleta de comandos. Pueden elegirse para cualquier documento de presentación, sea cual sea la vista en que se muestre; para un documento sin indicador siguen atenuadas. Cada diapositiva aparece en ellas tal como la muestra la vista, con tema, imágenes de fondo, número de página, cabecera y pie, diagramas y fórmulas, pero sin notas del orador y sin la barra de las diapositivas demasiado llenas. Si se cancela el diálogo, no se crea nada. Tras la exportación, la barra de estado informa del número de diapositivas y, si algo se omitió, de qué.

### Como PDF

**Exportar diapositivas como PDF…** pregunta por el destino, proponiendo el nombre del documento con la extensión `.pdf` en la misma carpeta, y escribe un archivo PDF con **una diapositiva por página**. La página tiene el formato de la diapositiva, 16:9 o 4:3, y ningún margen. Los ajustes de formato de papel y márgenes de la exportación a PDF corriente no tienen efecto aquí.

### Como páginas HTML

**Exportar diapositivas como HTML…** pregunta por una carpeta y crea en ella **una página HTML por diapositiva**: `folie-001.html`, `folie-002.html` y así sucesivamente, además de `index.html` como página de inicio con la primera diapositiva. Si la carpeta elegida está vacía o contiene una exportación anterior, las páginas se crean en ella; si no, se crea una subcarpeta con el nombre del documento y el sufijo `-diapositivas`, y los archivos ya presentes quedan intactos.

Cualquier navegador abre las páginas, sin la aplicación y sin conexión de red. Cada página está completa por sí sola: imágenes, diagramas y fórmulas van incrustados en ella, de modo que la carpeta puede moverse o entregarse entera. Debajo de la diapositiva están **Anterior**, el contador y **Siguiente**, en el idioma que tenía la interfaz al exportar; además se pasa de diapositiva con las mismas teclas que en la proyección, y la diapositiva se adapta al tamaño de la ventana del navegador. Los enlaces y las imágenes siguen las reglas de la exportación a HTML de un documento (véase [Herramientas](tools.md)): un enlace a otro documento queda como texto, y una imagen que no se puede incrustar aparece como su texto; una imagen de fondo así se omite.

## La extensión «Vista de presentación»

La función pertenece a las [extensiones internas](extensions.md) («Vista de presentación», grupo «Renderizado») y al modo de trabajo **Avanzado**: en el modo **Principiante** está desactivada, en **Avanzado** y **Completo** activada.

Si está desactivada, desaparecen la vista **Diapositivas**, el submenú **Presentación** del menú **Ver**, las dos órdenes de exportación y sus entradas en la paleta de comandos y en los atajos de teclado. El indicador no tiene entonces ningún efecto: un documento de presentación es un documento Markdown corriente, y `---` es en él una línea horizontal. Un documento que estaba abierto en la vista **Diapositivas** aparece en la vista de lectura. No se pierde nada, y al desactivar y activar nunca se escribe nada; tras volver a activarla, la presentación está ahí sin cambios.

## Compatibilidad con otras herramientas

El indicador, las claves de control, las líneas de separación y la notación de imagen con `bg` siguen a una herramienta extendida que crea diapositivas a partir de Markdown y marca sus archivos con `marp: true`. La compatibilidad es un compromiso explícito: una presentación escrita allí se abre aquí como presentación, sin que haya que cambiar nada en el archivo.

**Lo que vale aquí como allí:** el indicador `marp: true`, la separación en `---`, las claves `paginate`, `header`, `footer` y `size`, la notación de imagen `![bg …](…)` con la división en dos, y los comentarios HTML como notas del orador. Los comentarios con directivas de la otra herramienta no cuentan como notas ni aquí ni allí.

**Dónde difiere la aplicación:**

- **`***` y `___` no separan diapositivas aquí.** La otra herramienta también empieza en ellas una diapositiva nueva. Quien quiera un archivo dividido igual en ambas herramientas separa solo con `---` y no escribe líneas sobre una diapositiva con `***` o `___`.
- **La otra herramienta no conoce las notas `%%`** y las muestra como texto en la diapositiva. Quien necesite notas en ambas herramientas las escribe como comentario HTML `<!-- … -->`; estas valen en ambos sentidos.
- **Las directivas por diapositiva no tienen efecto aquí.** Comentarios como `<!-- _paginate: false -->` o `<!-- _class: lead -->`, con los que la otra herramienta da otro aspecto a diapositivas sueltas, se quedan en el documento pero no se ejecutan; las indicaciones del encabezado valen para todas las diapositivas. Tampoco tiene efecto la clave de encabezado `headingDivider`, con la que la otra herramienta empieza una diapositiva nueva en los títulos: un archivo que la usa da aquí menos diapositivas. Ambas cosas llegarán con una etapa de ampliación posterior.

**Qué más tener en cuenta:**

- La aplicación nunca escribe `marp: true` por sí misma. Quien quiera proyectar su archivo también en la otra herramienta lo añade junto a `presentation: true`.
- Los nombres de tema son distintos. Un nombre de tema de la otra herramienta es desconocido aquí; las diapositivas aparecen entonces con el tema `light`, y la línea de aviso cita el nombre. El bloque bajo `theme:` con valores propios es una notación de esta aplicación.
- La palabra `bg` tiene que ser aquí la **primera** palabra del texto alternativo. Otras palabras, como filtros de imagen, no se interpretan.

## Límites

- **Las notas solo aparecen en el código fuente.** No hay vista del orador con notas, diapositiva siguiente y reloj, ni notas en el PDF ni en las páginas HTML.
- **Una vista general** de las diapositivas como cuadrícula no existe; se pasa de una diapositiva a otra.
- **Los temas propios** surgen solo del bloque bajo `theme:` en el encabezado; no hay un editor de temas en la configuración.
- **Se exporta como PDF y como páginas HTML.** No se crea ningún archivo en formato pptx.
- **El aspecto vale para toda la serie de diapositivas.** No se puede indicar un tema, un fondo ni una cabecera propios para una sola diapositiva, y un título no empieza por sí mismo una diapositiva nueva.
- **Se edita en las vistas Markdown**, no en la diapositiva.

La vista del orador, la vista general de las diapositivas, el editor de temas, las indicaciones por diapositiva, la separación en los títulos y la exportación como archivo pptx están previstos para etapas de ampliación posteriores.
