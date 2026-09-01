# Enlaces

Los enlaces wiki, las anclas, las incrustaciones y las etiquetas conectan los archivos Markdown en una red. Los ejemplos de esta página muestran la sintaxis; sus destinos no existen en el manual, en tus propios archivos los enlaces abren el archivo de destino como pestaña.

## Enlaces wiki

`[[Destino]]` enlaza un archivo por su nombre, sin ruta y sin extensión; la búsqueda cubre la carpeta del archivo y hasta dos niveles de subcarpetas. La extensión `.md` puede omitirse o escribirse.

```markdown
[[Plan de proyecto]] abre plan de proyecto.md del ámbito de búsqueda.
[[Plan de proyecto|el plan]] muestra texto propio.
```

Si el nombre no acierta directamente con un archivo, se aplican dos alternativas: el acierto del índice sobre el ámbito de búsqueda y la [resolución de alias](frontmatter.md) mediante el campo de frontmatter `aliases:`; con varios candidatos pregunta un diálogo de selección. En celdas de tablas pipe, escapar la barra del texto mostrado como `\|`.

## Anclas de encabezado y de bloque

Los enlaces pueden apuntar a un encabezado o a un bloque dentro del archivo de destino:

```markdown
[[Plan de proyecto#Hitos]]        salta al encabezado
[[Plan de proyecto#^decision-1]]  salta al ancla de bloque
[[#Enlaces wiki]]                 ancla en el mismo documento
```

Las anclas de bloque se colocan con `^id` al final de la línea y anclan el bloque envolvente (párrafo, elemento de lista, tabla, bloque de código):

```markdown
Esta decisión es vinculante. ^decision-1
```

Los destinos de ancla rotos los marca el [linter Markdown](tools.md) en el editor.

## Enlaces Markdown a archivos

También los enlaces Markdown clásicos abren destinos `.md` como pestaña; las anclas funcionan igual. Los enlaces de ancla internos saltan dentro de la página — en vivo aquí: [al capítulo Etiquetas](#etiquetas).

```markdown
[Plan](subcarpeta/plan-de-proyecto.md#hitos)
```

## Nombres de archivo con espacios

Si un nombre de archivo contiene espacios, la notación depende del tipo de enlace. Los enlaces wiki llevan el espacio directamente:

```markdown
[[Mi nota]]
```

Los enlaces Markdown y de imagen colocan el destino entre corchetes angulares o codifican el espacio como `%20`:

```markdown
[Texto](<Mi nota.md>)
![Alt](<Imagen 01.png>)
[Texto](Mi%20nota.md)
```

Un espacio sin corchetes angulares termina el destino, de modo que el enlace no se reconoce (CommonMark). Al renombrar un archivo, la actualización de enlaces escribe los destinos con espacios en la forma `<…>`; los destinos ya codificados con `%` conservan su forma.

## Incrustaciones wiki

`![[Destino]]` incrusta contenido en lugar de enlazar:

```markdown
![[imagen.png]]            imagen, opcionalmente con ancho: ![[imagen.png|300]]
![[notas.md]]              archivo Markdown como bloque renderizado
![[manual.pdf]]            PDF en el visor interactivo
![[notas.md#Capítulo]]     solo la sección bajo el encabezado
![[notas.md#^bloque]]      solo el bloque anclado
```

Con anclas de bloque se incrusta el bloque envolvente completo (elemento de lista con sublistas, bloque de código, fila de tabla, cita). El Markdown incrustado se renderiza con su propia fuente como base; los enlaces internos se resuelven contra el archivo incrustado.

## Etiquetas

`#etiqueta` en el texto y el campo `tags:` del [frontmatter](frontmatter.md) se reconocen como etiquetas; las barras crean jerarquías como `#proyecto/markdown`. Las etiquetas son clicables en la vista Lectura y el modo En vivo y filtran la barra lateral de etiquetas. Los códigos de color hexadecimales, los números puros y los enlaces de ancla quedan excluidos del reconocimiento.

```markdown
Estado: #proyecto/markdown #review
```

## Autocompletado

Al escribir en modo edición se abre un menú de sugerencias:

- `[[` sugiere nombres de archivo y alias,
- `[[Archivo#` anclas de encabezado, `[[Archivo#^` IDs de bloque,
- `#` en el texto etiquetas conocidas.

Las flechas navegan, Intro o Tab selecciona, Esc cierra.

Mientras no se escriba nada tras `[[`, los archivos del área modificados más recientemente aparecen arriba, el más reciente primero. En cuanto se filtra, vuelve a mandar la calidad de coincidencia; la fecha de modificación solo decide entonces entre sugerencias del mismo rango.

Tras `#`, las etiquetas más usadas en el área aparecen arriba, la más frecuente primero; también aquí manda la calidad de coincidencia en cuanto se escribe algo, y entonces la frecuencia decide entre iguales. El número tras cada sugerencia la indica.

Al aceptar una sugerencia de archivo o de alias se escriben también los corchetes de cierre y el cursor queda detrás. Si ya están, no aparece un segundo par.

## Barras laterales de la red

Tres secciones de la barra lateral muestran la red del archivo activo: **Retroenlaces** (enlaces entrantes, incluido «vía alias»), **Enlaces salientes** (todas las referencias salientes en orden de documento) y **Etiquetas** (todas las etiquetas del ámbito de búsqueda con su frecuencia). Los accesos figuran en la [tabla de funciones](functions.md).

## Insertar una dirección en una selección

Cuando hay texto seleccionado y el portapapeles contiene una sola dirección, al pegar se crea un enlace a partir de ambos en lugar de reemplazar la selección. La selección `Página del proyecto` junto con la dirección `https://example.org` da como resultado:

```markdown
[Página del proyecto](https://example.org)
```

Si la dirección contiene espacios o paréntesis, el destino se escribe entre corchetes angulares; una dirección `www.` recibe el prefijo `https://`:

```markdown
[Entrada](<https://example.org/Titulo_(Extra)>)
```

Sin selección, con un contenido del portapapeles que no se reconoce como una sola dirección y dentro de áreas de código fuente se aplica el pegado normal. Un solo paso de deshacer revierte la conversión por completo. El acceso y el interruptor figuran en la [tabla de funciones](functions.md).
