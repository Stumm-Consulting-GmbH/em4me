# Bloques de script

Un bloque de código con la etiqueta de lenguaje `perspective-script` ejecuta **JavaScript** e incrusta el resultado en el documento renderizado. Los scripts leen los datos del ámbito de búsqueda (archivos con campos de frontmatter y de archivo, propiedades de bloque) mediante la **API pq** y producen listas, tablas, elementos o Markdown. Esto permite evaluaciones libres más allá de la [Consulta Perspective](frontmatter-query.md) declarativa, por ejemplo estructuras recursivas o resúmenes calculados.

Los ejemplos de esta página están puestos deliberadamente como bloques de código; la propia página del manual no ejecuta ningún script.

## Activación y modelo de confianza

La ejecución de scripts está **desactivada por defecto**. Sin activación, un bloque de script muestra su código fuente con un aviso; no se crea ningún entorno de ejecución.

Se activa en **Ajustes → Comportamiento → Ejecutar bloques de script**. La activación es una decisión de confianza deliberada: los scripts provienen de los documentos abiertos. Actívela solo si sus propios documentos son de confianza. El cambio surte efecto de inmediato en todas las ventanas, sin reiniciar.

## Límites de ejecución

Los scripts se ejecutan **confinados** en un sandbox aislado, nunca en el contexto de la aplicación:

- **Sin acceso a archivos, sin acceso a la red, sin importación de módulos.** El sandbox no tiene acceso al sistema de archivos, a las interfaces de la aplicación ni a direcciones externas.
- **Sin acceso al DOM del documento.** Los scripts nunca escriben directamente en la vista; la salida viaja como descripción estructurada a través de la API pq y se traduce de forma controlada (se permiten elementos estructurales y de texto, los atributos `class`, `title` y `colspan`/`rowspan` en celdas).
- **Solo lectura.** La API pq entrega una instantánea de datos; los archivos y metadatos no pueden modificarse desde scripts.
- **Límite de tiempo.** Una ejecución se cancela tras 5 segundos; el bloque muestra entonces un aviso de cancelación. Los bloques de una ventana se ejecutan uno tras otro: un script de larga duración solo retrasa los bloques siguientes hasta su cancelación, y la aplicación sigue siendo utilizable mientras tanto.
- **Tope de salida.** Las salidas muy grandes se truncan y se marcan con un aviso.

## Estructura básica

El script es el contenido del bloque de código; `pq` es el único objeto predefinido. Se muestra lo que informan las funciones de salida; el valor de retorno del script no se muestra. Si el script devuelve una promesa, el bloque espera a que se resuelva.

````markdown
```perspective-script
pq.out('Resultado: ' + (6 * 7));
```
````

## Leer datos

Todas las funciones de datos son de solo lectura y trabajan sobre una instantánea del índice tomada al inicio de la ejecución. Si cambia el conjunto de archivos, el bloque se vuelve a ejecutar automáticamente.

- `pq.pages([fuente])` — todos los archivos del ámbito de búsqueda como objetos de página, opcionalmente filtrados por una fuente.
- `pq.current()` — el objeto de página del documento propio (o `null`).
- `pq.file(ref)` — una página por ruta absoluta, ruta relativa a la raíz o nombre lógico (sin distinción de mayúsculas); `null` si nada coincide.
- `pq.blocks([fuente])` — las propiedades de bloque del ámbito de búsqueda (véase [Propiedades de bloque](block-properties.md)); solo cuentan las anclas activas.
- `pq.indexStatus` — estado de la base de datos (`ready`; `none` sin base consultable).
- `pq.version` — número de versión de la API pq (actualmente `1`).

### Objetos de página

Un objeto de página lleva los **campos de frontmatter en plano** (nombres de campos en minúsculas, p. ej. `pagina.status`) más el objeto `file` con los campos de archivo implícitos:

| Campo | Contenido |
|---|---|
| `file.name` | nombre lógico (nombre de archivo sin extensión) |
| `file.folder` | carpeta relativa a la raíz del ámbito de búsqueda (`''` en la raíz) |
| `file.path` | ruta relativa a la raíz |
| `file.absPath` | ruta absoluta (identidad para `pq.link` y `pq.file`) |
| `file.ext` | extensión del archivo (minúsculas, sin punto) |
| `file.size` | tamaño en bytes |
| `file.ctimeMs`, `file.mtimeMs` | fecha de creación/modificación en milisegundos |
| `file.tags` | tags del archivo |
| `file.aliases` | alias del frontmatter |
| `file.inlinks`, `file.outlinks` | referencias entrantes y salientes, cada una `{ path, name }` |

### Fuentes

El parámetro opcional `fuente` filtra como la selección de fuentes de la consulta, de forma simplificada:

- `'#tag'` — archivos con el tag, jerarquía incluida (`#proyecto` también cubre `proyecto/alpha`).
- `'[[Nombre]]'` — archivos que referencian el destino (enlace saliente).
- `'Carpeta'` o `'Carpeta/Subcarpeta'` — archivos bajo la ruta de la carpeta.

### Propiedades de bloque

`pq.blocks()` devuelve por entrada `{ file: { path, absPath, name }, anchor, values, updatedMs }`; `values` son los valores de propiedades del bloque. El filtro de fuente actúa a través del archivo portador.

## Producir salida

Las funciones de salida informan contenido al bloque (en orden de llamada):

- `pq.out(...contenidos)` — emite valores, nodos constructores o arrays de estos; los valores simples se convierten en texto.
- `pq.list(entradas)` — lista con viñetas. Una entrada es contenido o `{ content, children }` para estructuras de árbol (anidamiento libre).
- `pq.table(cabecera, filas)` — tabla; `cabecera` es un array de contenidos de celda, `filas` un array de arrays de fila.

Las funciones constructoras crean nodos **sin** salida propia; se usan como contenido en `pq.out`, entradas de lista y celdas de tabla:

- `pq.el(tag, contenido, atributos)` — un elemento de la lista de elementos permitidos (p. ej. `p`, `span`, `strong`, `code`, `ul`, `table`, `h1`–`h6`); los elementos y atributos no permitidos se descartan.
- `pq.link(destino, etiqueta, ancla)` — referencia interna clicable. `destino` es un objeto de página, `file` o de bloque, o una ruta/nombre; los destinos de bloque saltan automáticamente a su ancla. Sin `etiqueta` se muestra el nombre lógico.
- `pq.md(texto)` — Markdown mediante el pipeline de renderizado normal (énfasis, listas, enlaces, etc.); los bloques de consulta y de script incrustados no se ejecutan ahí.

## Ayudas

- `pq.date(valor)` — fecha a partir de cadenas de tipo ISO (`2026-07-09`, `2026-07-09 14:30`), milisegundos u objetos de fecha; interpretada localmente, `null` si es ilegible.
- `pq.dur(texto)` — duración en milisegundos a partir de expresiones de unidades como `'7 days'` o `'1h 30min'` (unidades como en el literal `dur(…)` de la consulta; meses/años como aproximaciones de 30/365 días).
- `pq.sort(lista, selector, descendente)` — copia ordenada; `selector` es una función o una ruta de campo como `'file.name'`. Comparación según el tipo: fechas cronológicas, números numéricos, si no texto sin distinción de mayúsculas.

## Ejemplo: árbol de enlaces recursivo

Partiendo del documento propio se construye un árbol sobre las referencias salientes; cada destino es clicable, las páginas ya visitadas no se repiten:

````markdown
```perspective-script
function arbol(pagina, vistas) {
  return {
    content: pq.link(pagina),
    children: pagina.file.outlinks
      .map(function (l) { return pq.file(l.path); })
      .filter(function (p) { return p && vistas.indexOf(p.file.absPath) < 0; })
      .map(function (p) { return arbol(p, vistas.concat([p.file.absPath])); }),
  };
}
var inicio = pq.current();
pq.list([arbol(inicio, [inicio.file.absPath])]);
```
````

## Ejemplo: tabla sobre una fuente de tag

````markdown
```perspective-script
var paginas = pq.sort(pq.pages('#proyecto'), 'prio');
pq.table(['Archivo', 'Prio'], paginas.map(function (p) {
  return [pq.link(p), p.prio];
}));
```
````

## Errores y cancelaciones

Un error de sintaxis o de ejecución aparece localizado en el bloque, con el mensaje original del script y, cuando puede determinarse, la línea del script. Una ejecución que supera el límite de tiempo se cancela y se muestra como tal. Los scripts se ejecutan en modo estricto: las asignaciones a variables no declaradas son errores.

## Exportación

La exportación a PDF imprime el estado visible: con el ajuste activo, el resultado del script (la exportación espera a los scripts en curso); si no, la vista del código fuente. Al compartir el archivo Markdown, el bloque de script permanece como código fuente sin cambios; si se ejecuta en el destinatario lo decide su propio ajuste.
