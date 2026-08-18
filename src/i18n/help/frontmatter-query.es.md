# Consulta Perspective

La consulta Perspective incrusta una **lista o tabla de archivos dinámica y cliqueable** directamente en el documento. Un bloque de código con la etiqueta de lenguaje `perspective-query` contiene una consulta sobre las propiedades del frontmatter y los campos de archivo; una vez renderizado, aparece en ese lugar el resultado sobre todos los archivos del ámbito de búsqueda. Cada coincidencia es cliqueable y abre el archivo de destino. El resultado se mantiene actualizado con el conjunto de archivos.

Así, las propiedades se convierten en vistas de conjunto navegables: una página de inicio temática que enumera todos los archivos relacionados se mantiene actualizada sin trabajo manual.

## Estructura de una consulta

La forma más simple es una condición sola; produce la lista alfabética de resultados:

````markdown
```perspective-query
area = "Privado"
```
````

La forma completa se compone de **cláusulas**: primero el tipo de salida opcional (`LIST` o `TABLE`) y después, en cualquier orden y cada una como máximo una vez, `FROM` (fuentes), `WHERE` (condición), `SORT` (ordenación), `LIMIT` (tope) y `COLUMNS` (disposición en columnas de la lista). Los saltos de línea cuentan como espacios; las palabras clave ignoran mayúsculas y minúsculas.

````markdown
```perspective-query
TABLE estado AS "Estado", file.mtime
FROM "Proyectos" AND #activo
WHERE file.mtime >= date(today) - dur(30 days)
SORT file.mtime DESC, file.name
LIMIT 20
```
````

Una condición sola sin palabra clave de cláusula se lee como `LIST WHERE condición`; las consultas existentes siguen funcionando sin cambios. Los nombres de campo que coinciden con palabras clave de cláusula (como `limit`) siguen siendo utilizables en esta forma corta.

## Tipos de salida

- **`LIST`** — lista de archivos cliqueable (predeterminado). Una expresión opcional a continuación (`LIST estado WHERE …`) aparece como sufijo atenuado detrás de cada coincidencia.
- **`TABLE columna [AS "Título"], …`** — tabla con columnas libremente definibles a partir de campos o expresiones. Sin alias, la propia expresión sirve de título de columna. La primera columna es el enlace de archivo cliqueable; `TABLE WITHOUT ID …` la oculta. Los valores de lista aparecen separados por comas, las fechas en formato ISO y los valores de enlace siguen siendo cliqueables.

## Nivel de bloque (`BLOCKS`)

El añadido de ámbito `BLOCKS` directamente tras `LIST` o `TABLE` evalúa la consulta sobre las **propiedades de bloque**: las propiedades por ancla de bloque de la página [Propiedades de bloque](block-properties.md). Los resultados son entonces bloques en lugar de archivos: cada resultado aparece como destino clicable de la forma `Archivo#^ancla`; el clic abre el archivo y salta al bloque.

````markdown
```perspective-query
LIST BLOCKS WHERE status = "offen" SORT updated DESC
```
````

- **Resolución de campos**: Los nombres de campo desnudos coinciden primero con las propiedades de bloque y, si no, recurren a las propiedades del frontmatter del documento portador: un bloque «hereda» su contexto de archivo. Los campos `file.*` y las fuentes `FROM` siguen refiriéndose al documento portador.
- **`updated`**: Momento del último cambio de las propiedades de bloque, como valor de fecha para comparaciones y ordenación (salvo que el bloque lleve su propia propiedad `updated`).
- **Tablas**: `TABLE BLOCKS columna, …` muestra el destino de bloque clicable en la primera columna; `WITHOUT ID` va tras `BLOCKS`. Las demás columnas provienen típicamente de propiedades de bloque.
- **Conjunto de resultados**: Solo cuentan los bloques cuya ancla existe en el documento; las entradas huérfanas (propiedades sin ancla en el texto) no son resultados. Los documentos sin propiedades de bloque simplemente no aportan resultados.

````markdown
```perspective-query
TABLE BLOCKS status AS "Status", updated
FROM "Proyectos"
WHERE prio > 2
```
````

## Nivel de tarea (`TASKS`)

El añadido de ámbito `TASKS` directamente tras `LIST` o `TABLE` evalúa la consulta sobre las **tareas** del ámbito de búsqueda (líneas con casilla como en la página [Listas de tareas](tasks.md); el Filtro global de la extensión también se aplica aquí). Los resultados son líneas de tarea individuales con caja de estado, descripción, insignias de marcador y procedencia de archivo; el clic en la descripción abre el archivo fuente en la línea. La caja de estado, el botón de aplazamiento y el botón de edición reescriben directamente en el archivo fuente — detalles en la página Listas de tareas.

````markdown
```perspective-query
LIST TASKS
FROM "Proyectos"
WHERE status.type = "TODO" AND due <= date(eow)
```
````

Los nombres de campo desnudos coinciden primero con los campos de tarea fijos y, si no, recurren a las propiedades del frontmatter del documento portador; los campos `file.*` y las fuentes `FROM` siguen refiriéndose al documento portador.

| Campo | Contenido |
|---|---|
| `due`, `scheduled`, `start` | vencimientos manuales como valores de fecha (ausente o no válido: vacío) |
| `created`, `done`, `cancelled` | fechas automáticas como valores de fecha |
| `due.set`, `due.invalid`, … | por campo de vencimiento: marcador presente o no válido en el calendario (`"true"`/`"false"`) |
| `happens` | valor más temprano entre vencimiento, planificado e inicio |
| `priority`, `priority.rank` | nivel de prioridad como nombre o como número de rango (0 = la más alta) |
| `status`, `status.type` | carácter de estado o tipo de estado (`TODO`, `IN_PROGRESS`, `ON_HOLD`, `DONE`, `CANCELLED`, `NON_TASK`) |
| `description`, `heading`, `tags` | texto de descripción, título de la sección circundante, etiquetas de la línea |
| `recurrence` | regla de recurrencia como texto |
| `id`, `dependson`, `id.set`, `id.duplicate` | ID de tarea, lista de predecesoras, «tiene ID», «ID asignado varias veces» |
| `blocked`, `blocking` | bloqueada por predecesoras abiertas, o bloquea a otras (`WHERE blocked = "true"`) |
| `urgency` | puntuación de urgencia (fórmula en la página Listas de tareas) |
| `line` | número de línea en el archivo fuente |

Los campos de tarea booleanos se filtran por comparación de cadena (`blocked = "true"`), como los valores booleanos del frontmatter.

**Comodidad de fechas:** además de `today`, `now` y las fechas fijas, los literales `date(...)` conocen las palabras relativas `tomorrow`, `yesterday` así como los límites de periodo `sow`/`eow` (inicio de semana lunes, fin de semana), `som`/`eom` (mes) y `soy`/`eoy` (año). Las palabras de inicio valen para las 00:00 del día, las de fin para el final del día — `due <= date(eow)` incluye por completo el domingo.

**Ordenación:** sin `SORT`, la lista de tareas se ordena por tipo de estado (lo en curso primero, lo hecho y lo descartado al final), luego urgencia descendente, vencimiento, prioridad y ruta. `SORT` (por ejemplo `SORT urgency DESC` o `SORT due`) prevalece sobre este valor predeterminado.

**Agrupación (`GROUP BY`):** `GROUP BY expresión, …` estructura la salida de tareas bajo títulos de grupo; cada expresión adicional crea un nivel de anidamiento. Los resultados sin valor forman el último grupo. En esta forma, la cláusula solo se aplica a `LIST TASKS`.

````markdown
```perspective-query
LIST TASKS GROUP BY heading, priority
```
````

**Disposición (`HIDE`/`SHOW`/`SHORT`):** `HIDE elemento, …` oculta bloques de salida, `SHOW` revela los ocultos por defecto, `SHORT` muestra las insignias de marcador solo como símbolo (valor completo en la información sobre herramientas). Elementos: las seis clases de vencimiento, `priority`, `recurrence`, `id`, `dependson`, `tags`, `backlink` (procedencia de archivo), `count` (contador de resultados), `urgency` (insignia de puntuación, solo mediante `SHOW`), `edit` y `postpone` (los dos botones de acción).

````markdown
```perspective-query
LIST TASKS SHOW urgency HIDE backlink, created SHORT
```
````

**Consulta global:** la sección de configuración **Tareas** puede almacenar partes `FROM`/`WHERE` que se anteponen implícitamente a cada consulta `TASKS` (por ejemplo un filtro de carpeta o de estado para toda la sección). Una consulta global errónea se señala en el bloque con su propio aviso.

## Fuentes (`FROM`)

`FROM` acota el espacio de resultados antes de comprobar la condición:

| Fuente | Significado |
|---|---|
| `"Carpeta/Subcarpeta"` | archivos de esta carpeta (relativa a la raíz de la consulta), incluidas las subcarpetas |
| `#etiqueta` | archivos con esta etiqueta; también cubre subetiquetas como `#etiqueta/sub` |
| `[[Archivo]]` | archivos que enlazan a `Archivo` |
| `outgoing([[Archivo]])` | archivos a los que `Archivo` enlaza |
| `[[]]` | archivos que enlazan al archivo portador (sección «Autorreferencia») |
| `outgoing([[]])` | archivos a los que enlaza el archivo portador |

Las fuentes se combinan con `AND`, `OR`, paréntesis y el prefijo de negación `-`:

````markdown
```perspective-query
FROM ("Proyectos" OR #importante) AND -#archivo-muerto
```
````

## Condiciones (`WHERE`)

| Categoría | Sintaxis | Significado |
|---|---|---|
| Comparación | `campo = "valor"`, `campo != "valor"` | igual, distinto (sin distinguir mayúsculas) |
| Orden | `campo < valor`, `<=`, `>`, `>=` | según el tipo: números numéricamente, fechas cronológicamente, texto alfabéticamente |
| Conjunto | `campo IN ("a", "b")`, `campo NOT IN (…)` | coincide con uno de los valores, o con ninguno |
| Lógica | `AND`, `OR`, `NOT` | y, o, no (precedencia: `NOT` antes de `AND` antes de `OR`) |
| Agrupación | `( … )` | los paréntesis agrupan subexpresiones |
| Función | `contains(tags, "rojo")` | las llamadas a funciones se permiten como condición |

Semántica de valores: un campo escalar se compara directamente; en un **campo de lista** (p. ej. `tags`), `=` comprueba la pertenencia e `IN` una intersección no vacía. Con un **campo ausente**, `=` e `IN` son falsos, `!=` y `NOT IN` son verdaderos. Solo los campos del nivel superior del frontmatter son consultables; los valores numéricos se comparan numéricamente en las comparaciones de orden (`10` está por encima de `5`).

## Campos

Además de las propiedades del frontmatter (nombre solo, p. ej. `estado`), hay campos de archivo implícitos bajo el espacio de nombres `file.`:

| Campo | Contenido |
|---|---|
| `file.name` | nombre lógico del archivo (sin extensión) |
| `file.day` | fecha del prefijo ISO del nombre (`2026-04-18 Reunión`), vacío en otro caso |
| `file.folder`, `file.path` | carpeta o ruta, relativa a la raíz de la consulta |
| `file.ext` | extensión del archivo |
| `file.size` | tamaño en bytes |
| `file.ctime`, `file.mtime` | fecha de creación y de modificación |
| `file.tags`, `file.aliases` | etiquetas y alias como listas |
| `file.inlinks`, `file.outlinks` | archivos que enlazan aquí, y archivos enlazados |
| `file.link` | el propio archivo como enlace cliqueable (para columnas de tabla) |

## Autorreferencia (`this.`)

El prefijo `this.` se refiere al **archivo portador** de la consulta, es decir, al documento que contiene el bloque, y no al archivo encontrado. Vale igual para los campos de archivo y para las propiedades del frontmatter: `this.X` es lo que `X` daría en el archivo portador.

````markdown
```perspective-query
LIST WHERE area = this.area AND file.path != this.file.path
```
````

- **El mismo sentido en todos los niveles**: también en las consultas `BLOCKS` y `TASKS`, `this.` designa el archivo portador del bloque, nunca el bloque suelto ni la línea de tarea.
- **Precedencia**: la regla `this.` se impone a una propiedad del frontmatter del mismo nombre, igual que el espacio de nombres `file.`.
- **Sin archivo portador**: si no puede resolverse, todo acceso `this.` da un valor vacío; un `this` a secas, sin punto, queda vacío como cualquier nombre de campo desconocido.

Como **fuente**, el enlace wiki vacío designa ese mismo archivo: `FROM [[]]` reúne los archivos que enlazan a él, `FROM outgoing([[]])` la dirección contraria. El archivo portador nunca es resultado de sí mismo; sin archivo portador resoluble el conjunto queda vacío en lugar de abarcar todos los archivos.

## Literales y cálculo

- **Los números** se escriben sin comillas (`prio > 2`); **las cadenas** van entre comillas dobles o simples.
- **Fecha**: `date(today)` (inicio del día), `date(now)`, `date(2026-12-31)` o con hora `date(2026-12-31 14:30)`.
- **Duración**: `dur(7 days)`, `dur(1 day 2 hours)`, abreviado `dur(2w)`. Unidades: `s`, `min`, `h`, `d`, `w`, `mo`, `y` más las formas largas; un mes cuenta como 30 días, un año como 365 días.
- **Aritmética**: `+`, `-`, `*`, `/` con la precedencia habitual; fecha ± duración da una fecha, fecha − fecha una duración. Los operadores entre nombres de campo necesitan espacios (`a - 1`, no `a-1` — esto último es un nombre de campo).
- **Concatenación de texto**: si `+` no cuadra numéricamente y un lado es una cadena, une las formas de presentación de ambos lados; así surgen columnas compuestas como `file.day + " — " + estado`. Las sumas puramente numéricas siguen siendo numéricas (`5 + "3"` da 8), y un valor ausente sigue ausente y deja la celda vacía.

Un patrón típico — «modificado en los últimos 7 días»:

````markdown
```perspective-query
WHERE file.mtime >= date(today) - dur(7 days)
```
````

## Funciones

| Función | Ejemplo | Significado |
|---|---|---|
| `contains(x, w)` | `contains(titulo, "Plan")` | subcadena en una cadena o elemento en una lista (distingue mayúsculas) |
| `icontains(x, w)` | `icontains(titulo, "plan")` | como `contains`, sin distinguir mayúsculas |
| `length(x)` | `length(tags) > 2` | longitud de una cadena o lista |
| `lower(s)`, `upper(s)` | `lower(estado) = "abierto"` | minúsculas o mayúsculas |
| `startswith(s, p)`, `endswith(s, p)` | `startswith(file.name, "Proyecto")` | inicio o final de una cadena |
| `default(x, d)` | `default(prio, 0) > 2` | valor de reserva cuando falta el campo |
| `choice(b, a, c)` | `choice(prio > 5, "alto", "normal")` | si-entonces-si no |
| `number(x)`, `string(x)` | `number(valor) * 2` | conversión a número o texto |
| `dateformat(d, f)` | `dateformat(file.mtime, "yyyy-MM-dd")` | formatear una fecha (tokens `yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`, `ww`, `kkkk`, `q` además de `MMMM`/`MMM`, `EEEE`/`EEE` para nombres de mes y día en el idioma configurado del programa y `d`, `M` sin cero inicial; los corchetes protegen el texto literal: `"[semana] ww"`) |
| `days(x)` | `days(date(today) - file.day)` | una duración como número de días enteros; redondeado, para que un cambio de hora no la desplace un día |
| `numberformat(x[, n])` | `numberformat(importe, 2)` | presentar un número localizado: sin segundo argumento según el idioma, si no con exactamente n decimales |
| `currencyformat(x[, m])` | `currencyformat(importe, "CHF")` | presentar un importe localizado: en euros sin indicación, y el número sin formato ante un código de moneda desconocido |
| `infolder(l, "Carpeta")` | `length(infolder(file.inlinks, "Proyectos")) = 0` | la sublista de valores de enlace cuyo destino está en la carpeta o por debajo |
| `sum(l)`, `min(l)`, `max(l)`, `average(l)` | `sum(valores) = 6` | agregados sobre listas de números |
| `bold(x)` | `bold(estado)` | presentar un valor resaltado (sección «Resalte») |

Una función desconocida o un número de argumentos incorrecto muestra un aviso de error en el bloque.

**Idioma de los formateadores:** `dateformat`, `numberformat` y `currencyformat` siguen el idioma del programa elegido en los ajustes, no el del sistema operativo. Donde no hay ningún documento detrás, como en las columnas calculadas de las tablas de datos y en los cálculos en línea, sigue rigiendo el idioma del entorno.

## Resalte

`bold(valor)` presenta un valor resaltado, tanto en celdas de tabla como en el complemento de una entrada de lista y en un título de grupo. La marca sobrevive a la concatenación: `bold` puede envolver solo una **parte** de una expresión compuesta, y el resto queda normal.

````markdown
```perspective-query
TABLE bold(estado) AS "Estado", file.mtime
```
````

El contenido de las celdas no evalúa Markdown: un asterisco en el texto aparece literalmente, y un resalte solo surge de esta llamada. Comparación, orden y agrupación trabajan sobre el texto puro y se comportan por tanto exactamente como sin la marca; un valor ausente queda vacío en lugar de producir un resalte vacío.

## Ejemplo: el último contacto

Juntas, las piezas de esta página dan una vista que muestra, en la nota de una persona, cuándo apareció por última vez en una nota fechada y cuánto tiempo hace de ello:

````markdown
```perspective-query
TABLE WITHOUT ID file.link AS "Nota",
  file.day + " — " + bold(days(date(today) - file.day) + " días") AS "Último contacto"
FROM [[]]
SORT file.day DESC
LIMIT 1
```
````

`FROM [[]]` reúne las notas que enlazan a este archivo. `file.day` lee su fecha del nombre del archivo, `date(today) - file.day` da la duración hasta hoy y `days(…)` el número de días enteros. El signo más compone fecha, guion y número de días en una celda, y `bold(…)` resalta la distancia: «2026-04-18 — **48 días**». Las notas sin fecha en el nombre se ordenan al final con independencia de la dirección y no desplazan el resultado.

## Ordenación y límite

`SORT campo [ASC|DESC], campo2 …` ordena el resultado por varias claves, según el tipo (números numéricamente, fechas cronológicamente, texto alfabéticamente según las reglas del idioma); los valores ausentes van al final sea cual sea la dirección. Sin `SORT` se mantiene el orden alfabético. `LIMIT n` recorta el resultado después de la ordenación.

## Listas multicolumna

`COLUMNS n` (1 a 8) hace que la lista de resultados fluya por varias columnas — pura presentación, sin cambio de datos. Con `TABLE`, `COLUMNS` se ignora y se señala con una nota en el bloque.

````markdown
```perspective-query
LIST FROM #marcadores COLUMNS 3
```
````

## Visualización e interacción

- **Coincidencias cliqueables**: cada coincidencia aparece con su nombre de archivo lógico; la ruta completa está en la información sobre herramientas. Un clic abre el archivo de destino en una pestaña, exactamente como un enlace wiki — incluidos los valores de enlace en celdas de tabla.
- **Actualización en vivo**: los archivos nuevos, modificados y eliminados se reflejan en los resultados visibles sin recarga manual, en cuanto el índice los registra.
- **Resultado vacío**: si la consulta no encuentra ningún archivo, aparece una breve nota en lugar de un área vacía.
- **Consulta no válida**: un error de sintaxis muestra un aviso de error con la posición en lugar de un resultado.

Las tres vistas Renderizado, Dividido y En vivo muestran el mismo resultado. En la vista de código fuente pura, el bloque permanece visible como código.

## Ámbito de búsqueda

El ámbito de búsqueda es el mismo que el del índice de archivos:

- **Con un área activa** abarca toda el área; las relaciones de enlaces (`FROM [[…]]`, `file.inlinks`) están completas allí.
- **Sin área** abarca la carpeta del archivo más dos subniveles.

Los archivos fuera del ámbito de búsqueda no aparecen en el resultado. Un archivo aún no guardado no tiene ámbito de búsqueda; la consulta muestra entonces una nota de que estará disponible tras guardar. En cambio, los cambios sin guardar de un archivo abierto se incluyen de inmediato en el resultado; no hace falta guardar nada para ello.

## Exportación

- **Exportación a PDF**: el resultado se imprime como estado estático del momento del renderizado, incluida la disposición en tabla y columnas. Las entradas aparecen como texto; en el PDF no son cliqueables.
- **Markdown portable**: la exportación deja el bloque `perspective-query` sin cambios como código fuente. Al reabrirlo en este programa se evalúa de nuevo dinámicamente; otros programas de Markdown lo muestran como bloque de código.

Para evaluaciones libres más allá del lenguaje de cláusulas — por ejemplo estructuras recursivas o resúmenes calculados — están disponibles los [bloques de script](scripts.md); su API pq usa el mismo modelo de campos y bloques que la consulta.
