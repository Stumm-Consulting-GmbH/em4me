# Construcciones de bloque

Extensiones de bloque más allá del núcleo Markdown. Cada capítulo muestra la sintaxis como bloque de código y el resultado renderizado justo debajo; la vista dividida los pone uno junto al otro.

## Callouts

Cuadros de aviso: `> [!tipo]` como primera línea de una cita, opcionalmente con título propio. Diez tipos con icono y color de acento propios: `note`, `info`, `tip`, `success`, `question`, `warning`, `failure`, `danger`, `example`, `quote`. Los tipos desconocidos los señala el [linter Markdown](tools.md).

```markdown
> [!tip] Título propio
> Contenido del cuadro, se permite Markdown normal.
```

> [!tip] Título propio
> Contenido del cuadro, se permite Markdown normal.

Un `+` o `-` tras el tipo hace el callout plegable: `+` empieza abierto, `-` plegado — el plegado funciona también aquí en el manual.

```markdown
> [!note]- Empieza plegado
> Visible solo tras hacer clic en el título.
```

> [!note]- Empieza plegado
> Visible solo tras hacer clic en el título.

Da igual si el tipo se escribe en mayúsculas o minúsculas: `[!note]`, `[!Note]` y `[!NOTE]` producen el mismo cuadro con el mismo icono, el mismo color de acento y el mismo título por defecto; `+`, `-` y un título propio funcionan igual. El texto del archivo se queda tal como se escribió: las mayúsculas procedentes de otros programas Markdown no se reescriben. La lista de los diez tipos no cambia: los nombres que no figuran en ella, como `[!IMPORTANT]`, son tipos desconocidos en cualquier forma de escritura.

```markdown
> [!WARNING]
> En mayúsculas — el mismo cuadro que con `[!warning]`.
```

> [!WARNING]
> En mayúsculas — el mismo cuadro que con `[!warning]`.

## Contenedores personalizados

Bloques contenedores entre `::: tipo` y `:::`. Los diez tipos de callout se muestran en estilo callout, los nombres desconocidos como caja neutra con el nombre como título.

```markdown
::: warning
Contenido en estilo callout.
:::
```

::: warning
Contenido en estilo callout.
:::

Da igual si el nombre se escribe en mayúsculas o minúsculas: `::: warning`, `::: Warning` y `::: WARNING` producen el mismo cuadro, `::: Mi-Caja` la misma caja neutra que `::: mi-caja`, y `::: COLUMNS 2` reparte el contenido en dos columnas igual que `::: columns 2`. El texto del archivo se queda tal como se escribió; una caja neutra muestra el nombre como título tal como aparece. La lista de los diez tipos de callout no cambia.

```markdown
::: WARNING
En mayúsculas: el mismo cuadro que con `::: warning`.
:::
```

::: WARNING
En mayúsculas: el mismo cuadro que con `::: warning`.
:::

## Bloque multicolumna

Un contenedor `::: columns <n>` muestra el contenido incluido en varias columnas; son válidas de 2 a 5 columnas. El texto fluye de forma automática y equilibrada por las columnas; una línea `+++` fuerza el salto a la columna siguiente. Los números de columnas no válidos (ausente, 1, más de 5, no numérico) recurren a la caja neutra; fuera de un bloque multicolumna, `+++` no tiene efecto.

```markdown
::: columns 2
Primera columna con texto fluido.

+++

La segunda columna empieza aquí.
:::
```

::: columns 2
Primera columna con texto fluido.

+++

La segunda columna empieza aquí.
:::

Los contenidos anchos (tablas, diagramas, líneas de código largas) pueden desbordar una columna; en bloques muy cortos el equilibrado automático puede parecer desigual. En el modo En vivo el bloque aparece como contenedor neutro con las líneas de marcador visibles; la composición en columnas vale para la vista renderizada y la exportación a PDF.

## Listas de definición

Término en una línea, definición debajo introducida con `: `; `~` también vale como marcador. Son posibles varias definiciones por término.

```markdown
Cutover
: Puesta en producción de un sistema.

Rollback
: Vuelta al estado anterior al cambio.
```

Cutover
: Puesta en producción de un sistema.

Rollback
: Vuelta al estado anterior al cambio.

## Bloques de líneas

Las líneas que empiezan con `| ` conservan saltos de línea y espacios iniciales — pensado para direcciones y poemas.

```markdown
| Stumm-Consulting GmbH
|   4410 Liestal
|   Suiza
```

| Stumm-Consulting GmbH
|   4410 Liestal
|   Suiza

## Notas al pie

Tres formas: referencia `[^id]` en el texto con definición `[^id]: texto` (habitualmente al final del archivo), más la forma en línea `^[texto directo]` sin definición separada. El render muestra un número en superíndice; las definiciones se agrupan al final de la página con flechas de retorno.

```markdown
Una afirmación con fuente[^1] y otra con nota en línea^[anotada directamente].

[^1]: La definición vive al final del archivo.
```

Una afirmación con fuente[^1] y otra con nota en línea^[anotada directamente].

[^1]: La definición vive al final del archivo.

## Bloque de índice

Un bloque de código con el identificador `toc` muestra en su posición los encabezados del documento como lista sangrada; cada entrada es un enlace, y un clic salta al encabezado. Una línea `depth: N` en el bloque limita el índice a los niveles 1 a N, con valores válidos de 1 a 6; sin esta línea aparecen todos los niveles. Las demás líneas y los valores fuera de 1 a 6 no tienen efecto.

````markdown
```toc
depth: 2
```
````

Renderizado, para esta página:

```toc
depth: 2
```

El índice sigue cada cambio por sí solo: los encabezados nuevos, renombrados o eliminados se actualizan al instante, en la vista renderizada igual que en el modo En vivo. Las entradas saltan a los mismos anclajes que los enlaces a los encabezados, también con encabezados de igual texto y con identificadores propios mediante `{#id}`. Si la [numeración automática](markdown-basics.md) de los encabezados está activa, los números aparecen también en el índice. Los encabezados dentro de bloques de código y en el frontmatter no aparecen. Si el documento no tiene ningún encabezado, el bloque muestra el aviso «Este documento no tiene encabezados.». Varios bloques en el mismo documento muestran el mismo índice.

El bloque se inserta desde el [menú contextual del editor](context-menu.md): **Insertar → Bloque de índice** coloca un bloque `toc` sin línea `depth:` en una línea propia; la profundidad se añade a mano si hace falta.

La impresión, la exportación a PDF y la exportación a HTML contienen el índice tal como lo muestra la vista renderizada. La exportación portable lo escribe como lista Markdown corriente con enlaces a los encabezados, sin números; un documento sin encabezados recibe una línea vacía en ese lugar. En una [presentación](presentation.md), cada diapositiva se muestra por separado; un bloque en una diapositiva lista los encabezados de esa diapositiva.

El bloque pertenece a la [extensión interna](extensions.md) «Bloque de índice», que está activada a partir del modo de trabajo **Principiante**. Si está desactivada, el bloque aparece como un bloque de código corriente con su texto, y el menú contextual no ofrece **Bloque de índice**; el documento no cambia, y al volver a activarla el índice reaparece.

El panel «Índice» de la [barra lateral](sidebar.md) es independiente: muestra los encabezados del documento abierto junto al texto y no forma parte del documento. El bloque, en cambio, está en el propio documento y por eso aparece también en la impresión y la exportación.
