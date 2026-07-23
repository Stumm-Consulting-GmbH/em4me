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
