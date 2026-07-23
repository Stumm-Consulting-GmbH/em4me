# Bases de Markdown

La aplicación renderiza Markdown sobre la base del estándar CommonMark, ampliado con tablas, listas de tareas, tachado y enlaces automáticos. Esta página cubre el núcleo; las construcciones especiales tienen sus propias páginas ([Construcciones de bloque](blocks.md), [Construcciones en línea](inline.md), [Enlaces](linking.md)).

## Encabezados

Seis niveles con `#` a `######`; cada encabezado recibe automáticamente un ancla para enlaces e índice.

```markdown
## Capítulo
### Subcapítulo
```

También existe la forma Setext para los niveles 1 y 2: una línea de texto subrayada con `===` (H1) o `---` (H2).

```markdown
Capítulo en forma Setext
------------------------
```

### Numeración automática

Los encabezados pueden numerarse automáticamente con números jerárquicos (1, luego 1.1, 1.2, y así sucesivamente). Los números aparecen en el panel de renderizado, el modo en vivo, el esquema y las exportaciones; el texto fuente permanece sin cambios.

El control se realiza en tres niveles que se sustituyen en este orden: el encabezado individual antes del documento, el documento antes del ajuste global. De forma global, el ajuste «Numerar títulos» activa la numeración y fija el nivel inicial (H1 o H2). Por documento, la clave de frontmatter `numbered-headings` sustituye el ajuste global:

```markdown
---
numbered-headings: true
---
```

Por encabezado, actúa un marcador al final de la línea: `{-}` excluye un encabezado, `{+}` lo incluye, cada uno también en contra del ajuste global. Una barra invertida inicial protege el marcador como texto literal (`\{-}` aparece como `{-}`).

```markdown
## Apéndice {-}
## Importante {+}
```

Los encabezados excluidos no se cuentan y no reinician los subcontadores; sus subencabezados siguen contando bajo el último encabezado numerado. Si se salta un nivel, por ejemplo de H1 directamente a H3, el nivel intermedio que falta cuenta como uno.

## Énfasis

```markdown
**negrita**, *cursiva*, ~~tachado~~, `código en línea`
```

**negrita**, *cursiva*, ~~tachado~~, `código en línea`

## Listas

Listas no ordenadas con `-`, `*` o `+`, ordenadas con `1.`. Un subelemento pertenece al elemento superior cuando empieza donde empieza el contenido de este: dos caracteres bajo `- `, tres bajo `1. `, cuatro bajo `10. `.

```markdown
- Primer punto
  - Subpunto
1. Primer paso
   1. Subpaso
```

- Primer punto
  - Subpunto

1. Primer paso
   1. Subpaso

### Editar la estructura

En el modo de edición, el esquema se cambia con el teclado. La profundidad se deriva siempre del elemento superior, no tienes que contar espacios.

- `Alt+Flecha arriba` y `Alt+Flecha abajo` mueven un elemento con todos sus subelementos. El salto abarca la rama vecina completa y el nivel permanece igual. Fuera de las listas, los atajos mueven la línea individual.
- `Tab` y `Mayús+Tab` aumentan y reducen la sangría del elemento con sus subelementos. Solo se aplica sangría donde existe un elemento superior bajo el cual pueda colocarse el actual.
- Si hay varias líneas seleccionadas, ambas teclas actúan exactamente sobre el rango seleccionado.
- El comando «Seleccionar la rama» marca un elemento con todo lo que cuelga de él.

### Numeración

Las listas numeradas se renumeran solas en el texto fuente en cuanto trabajas en ellas. El número inicial se conserva: una lista que empieza en `3.` continúa con `4.`.

Una línea vacía comienza una lista nueva. Si surge de tu edición, la lista siguiente empieza de nuevo en 1; si ya estaba allí, la segunda lista conserva su propio número inicial. El texto fuente y la vista muestran los mismos números.

```markdown
1. Primera lista
2. Segunda línea

1. Lista nueva
2. Segunda línea
```

1. Primera lista
2. Segunda línea

1. Lista nueva
2. Segunda línea

### Continuar y terminar

La tecla Intro continúa una lista y añade una viñeta, un número consecutivo o una casilla vacía. En un subelemento vacío reduce la sangría un nivel; en el nivel superior termina la lista.

## Tablas

Tablas pipe con fila de encabezado y fila separadora; los dos puntos en la fila separadora controlan la alineación. Para celdas-bloque multilínea existe [Perspective Table](perspective-table.md); para mayor comodidad al teclear, el editor de tablas (ver [Herramientas](tools.md)). Para reestructurar tablas existentes (mover, insertar y eliminar filas y columnas, alineación, transposición), utilice el submenú **Tabla** en el [Menú contextual del editor](context-menu.md).

```markdown
| Izquierda | Centrado | Derecha |
|:----------|:--------:|--------:|
| a         | b        | 12      |
```

| Izquierda | Centrado | Derecha |
|:----------|:--------:|--------:|
| a         | b        | 12      |

## Cita y línea separadora

```markdown
> Cita en
> varias líneas

---
```

> Cita en
> varias líneas

---

## Enlaces y enlaces automáticos

Enlaces Markdown con `[texto](destino)`; las URL entre corchetes angulares se convierten en enlaces automáticos. Las URL desnudas en el texto también se reconocen, pero el [linter Markdown](tools.md) recomienda allí la forma explícita.

```markdown
[Ejemplo](https://example.org) y <https://example.org>
```

[Ejemplo](https://example.org) y <https://example.org>

La forma de referencia separa el lugar del enlace de la definición del destino:

```markdown
Ver la [página de ejemplo][ref].

[ref]: https://example.org
```

Ver la [página de ejemplo][ref].

[ref]: https://example.org

## Saltos de línea forzados

Dos espacios al final de la línea o una barra invertida fuerzan un salto de línea dentro de un párrafo.

```markdown
Primera línea\
Segunda línea
```

Primera línea\
Segunda línea

## Código

En línea con acentos graves, en bloque con tres acentos graves; una etiqueta de idioma activa el resaltado de sintaxis (ver [Matemáticas y diagramas](math-diagrams.md)). También se aplica la forma CommonMark «código indentado»: las líneas con cuatro espacios de sangría se convierten en bloque de código.

## Tipografía

El tipógrafo sustituye secuencias de caracteres por caracteres tipográficos: `--` se convierte en raya (–), `...` en puntos suspensivos (…), las comillas rectas en tipográficas.

```markdown
Un pensamiento -- y otro más ...
```

Un pensamiento -- y otro más ...
