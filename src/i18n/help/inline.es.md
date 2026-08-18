# Construcciones en línea

Marcado dentro de una línea, más allá de negrita/cursiva. Sintaxis como bloque de código, resultado debajo.

## Resaltado

```markdown
Destacar ==lo importante==; \== queda como texto plano.
```

Destacar ==lo importante==; \== queda como texto plano.

## Subíndice y superíndice

Subíndice con `~…~`, superíndice con `^^…^^` (doble caret, porque el `^` simple está ocupado por notas al pie y anclas de bloque).

```markdown
H~2~O y x^^2^^
```

H~2~O y x^^2^^

## Subrayado

```markdown
++texto subrayado++
```

++texto subrayado++

## Spoiler

Texto oculto, se revela al pasar el ratón o con foco de teclado. En celdas de tablas pipe, escapar las barras como `\|`; de lo contrario la separación de celdas corta el spoiler.

```markdown
La respuesta: ||42||
```

La respuesta: ||42||

## Critic Markup

Seguimiento de cambios con cinco formas: inserción, eliminación, sustitución, resaltado, comentario.

```markdown
{++insertado++} {--eliminado--} {~~antiguo~>nuevo~~} {==resaltado==} {>>comentario<<}
```

{++insertado++} {--eliminado--} {~~antiguo~>nuevo~~} {==resaltado==} {>>comentario<<}

## Comentarios

El texto entre marcadores `%%` es un comentario privado: se conserva en el código fuente, pero no aparece en ninguna vista renderizada ni en ninguna exportación. Los comentarios funcionan dentro de una línea y en varias líneas; un `%%` de apertura sin cierre actúa hasta el final del documento. En bloques de código y spans de código, `%%` queda como texto normal; `\%%` produce un `%%` literal en el texto corriente (cada marcador se escapa por separado). En el editor, las zonas de comentario están discretamente coloreadas (vistas código y en vivo). El comentario Critic Markup visible `{>>…<<}` de la sección anterior es independiente de esto: sirve para la revisión y se renderiza, mientras que el comentario `%%` permanece privado.

```markdown
Texto visible %%comentario privado%% y sigue la frase.

%%
Comentario de varias líneas: todo hasta el
marcador de cierre permanece privado.
%%
```

Esta línea demuestra el comportamiento en vivo; entre «aquí» y «allí» hay un comentario: aquí %%invisible para los lectores%% allí.

## Spans y atributos de encabezado

Spans en línea con atributos: `[texto]{.clase #id}`; solo se permiten `id` y `class`. Los encabezados reciben un ancla propia con `{#mi-id}`, que gana al ancla automática (útil para enlaces estables cuando cambian los títulos, ver [Enlaces](linking.md)).

```markdown
Una [sección marcada]{#span-demo} en el texto corriente.

### Encabezado con ID fija {#id-fija}
```

Una [sección marcada]{#span-demo} en el texto corriente.

### Encabezado con ID fija {#id-fija}

## Abreviaturas

Línea de definición `*[sigla]: texto largo`; cada aparición de la sigla recibe un subrayado punteado con el texto largo como tooltip (pasar el ratón sobre la sigla).

```markdown
*[HTML]: Hyper Text Markup Language

La aplicación genera HTML al renderizar.
```

*[HTML]: Hyper Text Markup Language

La aplicación genera HTML al renderizar.

## Cálculos en línea

Expresiones de cálculo entre `{=` y `=}` en cualquier lugar del texto corriente: la vista renderizada, el modo en vivo y las exportaciones muestran el **resultado**, el código fuente conserva la expresión; la expresión en bruto aparece como tooltip (pasar el ratón sobre el resultado). En modo en vivo, la línea del cursor muestra la expresión en bruto para editarla; un clic en el resultado coloca el cursor dentro. El cálculo usa el lenguaje de expresiones de la [Consulta Perspective](frontmatter-query.md): números, paréntesis, cadenas, valores de fecha y duración así como el catálogo de funciones. Los accesos a campos (p. ej. `file.name`) no están disponibles en los cálculos en línea.

```markdown
Suma {= 2+3*4 =}, Fecha {= date(2026-01-01) + dur(30d) =}, Texto {= upper('abc') =}
```

Suma {= 2+3*4 =}, Fecha {= date(2026-01-01) + dur(30d) =}, Texto {= upper('abc') =}

Reglas y particularidades:

- **Operadores**: `+`, `-`, `*`, `/` con la precedencia habitual y paréntesis; las comparaciones `=`, `!=`, `<`, `<=`, `>`, `>=` así como `AND`, `OR`, `NOT` dan `true`/`false`. Entre números, el menos necesita un espacio (`4 - 1`, no `4-1` — esto último lo lee el lenguaje de expresiones como un nombre de campo).
- **Fecha y duración**: `date(...)` y `dur(...)` como en el lenguaje de consulta; fecha ± duración da una fecha, fecha − fecha una duración.
- **Funciones**: el catálogo de funciones del lenguaje de consulta (`number`, `string`, `lower`, `upper`, `length`, `startswith`, `endswith`, `contains`, `default`, `choice`, `dateformat`, `days`, `numberformat`, `currencyformat`, `sum`, `min`, `max`, `average`). Las funciones que necesitan una referencia de archivo no surten efecto aquí: no hay ningún documento al que referirse.
- **Error**: una expresión no evaluable muestra un discreto ⚠︎ con el aviso de error en el tooltip; el código fuente permanece sin cambios.
- **Escape**: `\{=` produce un `{=` literal en el texto corriente.

```markdown
Comparación {= 10/4 >= 2 =}, Condición {= choice(1 = 2, 'sí', 'no') =}, Error {= 2+ =}
```

Comparación {= 10/4 >= 2 =}, Condición {= choice(1 = 2, 'sí', 'no') =}, Error {= 2+ =}
