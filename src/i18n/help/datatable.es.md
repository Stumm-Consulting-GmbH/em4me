# Perspective Datatable

La Perspective Datatable es una **tabla de datos tipada con funciones de cálculo**: las columnas tienen tipos de valores fijos, las celdas solo aceptan valores conformes al tipo, las filas de agregados calculan en vivo y las columnas calculadas evalúan expresiones por fila. La edición se realiza directamente en la cuadrícula renderizada; todos los datos permanecen como texto plano en el documento.

Delimitación: la [Perspective Table](perspective-table.md) apunta a contenidos de texto ricos (celdas de bloque multilínea, spans, resaltado de estado). La Datatable apunta a **datos estructurados y calculables**: conjuntos pequeños como gastos, registro de tiempos o inventarios. La tabla de datos pertenece a las [extensiones internas](extensions.md) y puede desactivarse allí; desactivada, el bloque sigue siendo un bloque de código normal.

## Estructura del bloque

Un bloque de código con la etiqueta de lenguaje `perspective-datatable` contiene directivas de cabecera y filas de datos:

````markdown
```perspective-datatable
columns: Nombre:text, Fecha:date, Importe:number(2), Hecho:boolean
aggregate: Importe:sum+avg, Hecho:count
| Anna | 2026-07-08 | 12.50 | x |
| Bert | 2026-06-30 | -3 |  |
```
````

Renderizada, la cuadrícula aparece con fila de cabecera, símbolos de tipo y fila de agregados:

```perspective-datatable
columns: Nombre:text, Fecha:date, Importe:number(2), Hecho:boolean
aggregate: Importe:sum+avg, Hecho:count
| Anna | 2026-07-08 | 12.50 | x |
| Bert | 2026-06-30 | -3 |  |
```

- **`columns:`** (obligatoria) declara las columnas como `Nombre:tipo`, separadas por comas. Los nombres de columna pueden contener espacios.
- **`aggregate:`** (opcional) asigna funciones de agregado a las columnas; varias por columna se combinan con `+`.
- **Las filas de datos** usan notación de barras (`| … | … |`), una línea por registro. Un `|` dentro del texto se escribe `\|`.

## Tipos de columna y formatos

| Tipo | Forma de almacenamiento | Ejemplo |
|---|---|---|
| `text` | texto libre | `Anna` |
| `number` | decimal con punto | `12.5`, `-3` |
| `date` | `AAAA-MM-DD` | `2026-07-08` |
| `time` | `HH:MM` | `09:30` |
| `boolean` | `x` (verdadero) o vacío (falso) | `x` |

`number` admite un formato de visualización opcional: `Importe:number(2)` muestra dos decimales. Visualización y forma de almacenamiento permanecen deliberadamente legibles por igual (sin reformateo regional); las celdas vacías son válidas en todos los tipos. Un valor que no coincide con el tipo de columna se marca como **celda de error**: el texto se conserva, una descripción emergente explica el formato esperado y el valor no entra en los agregados.

## Agregados

Funciones disponibles según el tipo de columna:

| Función | Significado | Permitida en |
|---|---|---|
| `sum` | suma | `number` |
| `avg` | promedio (redondeado al formato de la columna) | `number` |
| `min` / `max` | valor mínimo/máximo | `number`, `date`, `time` |
| `count` | número de celdas no vacías (en `boolean`: número de verdaderas) | todos los tipos |

Las celdas vacías o con error quedan excluidas. La fila de agregados aparece bajo los datos y recalcula con cada cambio; con vista filtrada calcula sobre las filas visibles.

## Columnas calculadas

Una columna con `= expresión` tras el tipo calcula su valor por fila a partir de otras columnas:

```perspective-datatable
columns: Articulo:text, Precio:number(2), Cant:number, Total:number(2) = Precio * Cant
aggregate: Total:sum
| Boli | 1.20 | 10 |
| Bloc | 3.50 | 4 |
```

- El lenguaje de expresiones es el mismo que en la [Consulta Perspective](frontmatter-query.md): aritmética, comparaciones, `choice(…)`, `default(…)`, funciones de texto y más.
- Los nombres de columna en la expresión se refieren a los valores de la fila correspondiente; también pueden usarse otras columnas calculadas en cualquier orden de declaración (la evaluación resuelve las dependencias). Las referencias circulares se notifican como errores de estructura.
- El resultado debe coincidir con el tipo de columna declarado; de lo contrario, la celda muestra un error.
- Los valores calculados **nunca se guardan en el código fuente**: siempre se calculan de nuevo y por eso no tienen celda de datos en las filas de barras. Los agregados sobre columnas calculadas calculan sobre los valores calculados.

## Editar en la cuadrícula

En la **vista dividida** y en el **modo en vivo** la cuadrícula es directamente editable; la vista de lectura y las páginas del manual la muestran en modo de solo lectura. Cada confirmación escribe de vuelta en el bloque de código del código fuente: el documento queda sin guardar como de costumbre y deshacer/rehacer funcionan con normalidad.

- **Editar una celda**: un clic en la celda (o `Intro`/`F2` con la celda enfocada) abre un campo de entrada adecuado al tipo. `Intro` o perder el foco confirma, `Esc` descarta, `Tab`/`Mayús+Tab` confirma y salta a la celda siguiente o anterior.
- **Restricción de tipo**: un valor que no coincide con el tipo de columna se rechaza (aviso en la barra de estado); la celda permanece abierta para corregir.
- **Boolean**: un clic en la celda (o la barra espaciadora) conmuta el valor directamente.
- **Filas**: el botón bajo la tabla añade una fila al final de los datos; el símbolo × al inicio de la fila la elimina.
- Las celdas de columnas calculadas no son editables; las entradas en sus columnas de origen las actualizan de inmediato.
- Una tabla con errores de estructura (véase más abajo) no es editable en la cuadrícula hasta corregir el error en el código fuente.

## Ordenar y filtrar (vista)

Ordenar y filtrar actúan **solo sobre la vista**: el código fuente permanece sin cambios, nada se guarda ni se exporta; al reabrir el archivo la vista es neutra.

- **Ordenar**: un clic en la cabecera de columna ordena según el tipo de forma ascendente, un segundo clic descendente y un tercero quita la ordenación. Los valores ausentes se colocan al final.
- **Filtrar**: el conmutador en el borde derecho de la tabla muestra la fila de filtros: las columnas de texto filtran por búsqueda de contenido, las booleanas mediante un conmutador de tres estados (todos/sí/no). Una nota muestra «n de m filas»; la fila de agregados calcula sobre las filas visibles.
- La edición sigue siendo posible en vista ordenada o filtrada y siempre alcanza la fila correcta del código fuente.

## Errores

- **Los errores de estructura** (tipo desconocido, nombres de columna duplicados, número de celdas divergente, expresiones no válidas) aparecen como lista sobre la cuadrícula con el número de línea dentro del bloque.
- **Los errores de celda** (valor no conforme al tipo) marcan solo la celda afectada; el texto se conserva.

## Exportación

La exportación portable y la exportación a PDF generan la tabla como tabla estática en el orden del documento: con todas las filas, los valores calculados de las columnas calculadas y la fila de agregados, sin interactividad.

## Límites

A partir de 1000 filas de datos, la cuadrícula muestra solo la cabecera y los agregados con una nota; los agregados siguen calculando sobre todas las filas. Los conjuntos de datos muy grandes pertenecen a una herramienta de datos dedicada.
