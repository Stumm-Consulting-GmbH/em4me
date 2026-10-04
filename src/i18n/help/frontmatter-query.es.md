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

La forma completa se compone de **cláusulas**: primero el tipo de salida opcional (`LIST` o `TABLE`) y después, en cualquier orden y cada una como máximo una vez, `FROM` (fuentes), `WHERE` (condición), `GROUP BY` (agrupación), `HAVING` (condición sobre el grupo), `SORT` (ordenación), `LIMIT` (tope), `COLUMNS` (disposición en columnas de la lista) y `DISPLAY` (forma de presentación). Los saltos de línea cuentan como espacios; las palabras clave ignoran mayúsculas y minúsculas.

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

**Agrupación (`GROUP BY`):** `GROUP BY expresión, …` estructura la salida de tareas bajo títulos de grupo; cada expresión adicional crea un nivel de anidamiento, y los resultados sin valor forman el último grupo. La agrupación, los agregados y la condición sobre el grupo valen en todos los niveles; los describe la sección «Agrupación y agregación».

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

## Nivel de registro (`RECORDS`)

El añadido de ámbito `RECORDS` directamente tras `LIST` o `TABLE` evalúa la consulta sobre los **registros** de las tablas de base de datos (página [Base de datos](database.md)). Los resultados son registros individuales: cada uno aparece con su forma de visualización, si no la tiene con su identificador interno, y un clic abre su **formulario** en lugar del archivo de tabla.

````markdown
```perspective-query
TABLE RECORDS autor, paginas
FROM "Libros"
WHERE paginas > 500
SORT autor
```
````

- **Fuente**: `FROM` nombra la tabla como cadena, por el nombre de su archivo sin extensión y sin distinguir mayúsculas y minúsculas (`"Libros"`) o como ruta relativa a la raíz del área con extensión incluida (`"Archivo/Libros.md"`), como la indicación `table` de una columna de enlace. Varias tablas se combinan con `OR`, `AND`, paréntesis y `-` como de costumbre. Debe nombrarse sin negación al menos una tabla o una jerarquía (sección «Jerarquías» más abajo); una etiqueta, un enlace wiki, `outgoing(…)` y el enlace wiki vacío producen en este nivel un mensaje de error. Una tabla que no existe no da ningún resultado. Tampoco lo da una tabla cuyo archivo está en la carpeta de plantillas, salvo que `FROM` la nombre por su ruta a través de esa carpeta, por ejemplo `"Plantillas/Libros.md"`; su nombre solo no basta para ello (sección «Fuentes»).
- **Campos y valores**: los nombres desnudos son los campos de la tabla, sin distinguir mayúsculas y minúsculas. Cada valor tiene el tipo de su columna, de modo que la condición y la ordenación tratan los números como números y las fechas cronológicamente; un valor booleano se comprueba con `campo = "true"` o `campo = "false"`. Si el contenido de una celda no corresponde a su tipo, el valor cuenta como ausente. Un nombre que la tabla no lleva queda vacío y no recurre al frontmatter del archivo de tabla.
- **Datos propios**: `record.id` es el identificador interno del registro, `record.table` el nombre de su tabla; ambos tienen prioridad sobre un campo que se llame literalmente así. `file.*` designa el archivo de tabla, `this.` el archivo portador de la consulta.
- **Tablas**: `TABLE RECORDS …` muestra el resultado en la primera columna «Registro»; `WITHOUT ID` va tras `RECORDS`. El título de una columna es el alias, si no la etiqueta del campo en el idioma del programa elegido según la cadena de respaldo de la página [Base de datos](database.md), y si no la propia expresión, por ejemplo en una ruta.
- **Valores de enlace**: un campo de referencia muestra la forma de visualización de su destino, si no la tiene su identificador, y un clic abre el formulario del destino. Un enlace vacío y uno que no lleva a ninguna parte quedan como celda vacía.
- **Orden**: sin `SORT`, los resultados siguen su forma de visualización sin distinguir mayúsculas y minúsculas, con igual forma de visualización el identificador, y los registros sin forma de visualización van al final.
- **Dos destinos de clic**: un registro en el resultado de una consulta abre el formulario, mientras que un enlace en el texto corrido como `[[Libros#^r-00042]]` abre el archivo de tabla en la fila del registro. El formulario muestra el estado guardado.
- **Estado sin guardar**: los cambios de una tabla abierta se incluyen de inmediato en el resultado, sin guardar.
- **No en este nivel**: `bold()` en una columna o en una expresión de `GROUP BY` produce un mensaje de error, porque un valor de base de datos no lleva formato; en la condición y la ordenación sigue estando permitido. `HIDE`, `SHOW` y `SHORT` solo valen para `LIST TASKS` y se señalan aquí como en los niveles de archivo y de bloque.
- **Resultado vacío y base de datos desactivada**: sin resultados aparece «Ningún registro coincide con esta consulta». Si la extensión «Base de datos» está desactivada, la lista queda vacía, encima aparece una nota y no se muestra ningún mensaje de error.

### Vinculación mediante campos de referencia

Una **ruta** a través de un campo de referencia lee los campos del registro al que apunta: en un préstamo, `libro.titulo` es el título del libro referenciado, y `libro.editorial.ciudad` va un nivel más allá, a una tercera tabla. Las rutas actúan en las columnas, en `WHERE` y en `SORT`:

````markdown
```perspective-query
TABLE RECORDS libro.titulo AS "Título", libro.autor AS "Autor", devuelto
FROM "Préstamos"
WHERE libro.paginas > 300
SORT libro.titulo
```
````

- Un campo que se llama literalmente como la ruta, por ejemplo `libro.titulo`, tiene prioridad.
- Un enlace vacío, uno que no lleva a ninguna parte y uno cuyo valor de clave coincide con varios registros dan un valor vacío; en el ambiguo aparece además una nota encima del resultado. Una ruta a través de un campo que no es un enlace también queda vacía.
- Si una ruta termina en un campo de referencia, la celda vuelve a mostrar un enlace que abre el formulario.

La **dirección contraria** no necesita una notación propia. Qué préstamos apuntan a un libro lo indica una condición sobre el campo de referencia:

````markdown
```perspective-query
LIST RECORDS FROM "Préstamos" WHERE libro = "r-00005"
```
````

La comparación sigue la lectura de una celda de enlace: un identificador coincide en ambas grafías (`r-5` y `r-00005`), cualquier otro texto se compara con la clave funcional de un solo elemento del destino, carácter por carácter. La forma de visualización solo cuenta si es a la vez la clave. `!=`, `IN` y `NOT IN` siguen la misma regla, y `SORT` por un campo de referencia ordena según la forma de visualización del destino.

### Jerarquías (`ancestors`, `descendants`)

Dos fuentes reúnen registros a lo largo de **cualquier número de niveles** de un campo de referencia, por ejemplo el personal de una organización mediante el campo `jefe`:

````markdown
```perspective-query
LIST RECORDS FROM descendants([[Equipo#^r-00001]], jefe) WHERE desde > 2015
```
````

- `descendants(destino, campo, …)` devuelve todos los registros que apuntan al destino mediante los campos nombrados, directamente o a través de niveles intermedios; `ancestors(destino, campo, …)` la dirección contraria, es decir, la cadena de registros a los que apunta el destino, hasta arriba.
- El **destino** es un enlace a un registro en la grafía del texto corrido. La tabla figura por su nombre o como ruta, también sin extensión; tras `#` sigue el identificador, con o sin `^` y también en su forma corta, o el valor de la clave funcional de un solo elemento, por ejemplo `[[Equipo#Clara]]`. Un alias tras `|` no cuenta.
- **Campos**: uno o varios campos de referencia, separados por comas, por ejemplo `padre, madre`; un nombre con espacios va entre comillas. La jerarquía sigue todos los campos nombrados, también más allá de los límites de tabla.
- El **destino mismo no forma parte** del resultado, y cada registro aparece en él como máximo una vez. No hay límite de profundidad. Si los enlaces forman un ciclo, la búsqueda termina igualmente, y encima del resultado aparece una nota en lugar de un mensaje de error.
- El conjunto actúa como cualquier fuente: `WHERE`, `SORT`, `LIMIT` y las columnas se aplican, `AND "Tabla"` lo limita a una tabla, `-` lo excluye. Nombrada sola, una jerarquía es una fuente completa; solo negada, produce un mensaje de error, porque entonces no limita ninguna tabla.
- Un destino que no existe no da ningún resultado. Si el valor de clave del destino coincide con varios registros, el resultado queda vacío y encima aparece la nota sobre el enlace ambiguo.
- Ambas fuentes solo existen en el nivel de registro; en los demás niveles producen un mensaje de error.

Una jerarquía aparece como árbol sangrado con la indicación `DISPLAY tree BY campo` (sección «Forma de presentación»).

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
| `descendants([[Tabla#^r-00001]], campo)` | registros que apuntan al registro de destino mediante `campo`, en todos los niveles (solo nivel de registro, sección «Jerarquías») |
| `ancestors([[Tabla#^r-00001]], campo)` | registros a los que apunta el registro de destino mediante `campo`, en todos los niveles (solo nivel de registro) |

En el nivel de registro, una cadena nombra una tabla en lugar de una carpeta (sección «Nivel de registro»).

**Las plantillas no son resultados.** Lo que está en la carpeta de plantillas de la página [Plantillas](templates.md), subcarpetas incluidas, no aparece en el resultado en ningún nivel: ni el archivo, ni sus bloques y tareas, ni los registros de una tabla que esté en ella. Si `FROM` nombra expresamente la carpeta de plantillas o una de sus subcarpetas, la consulta muestra exactamente el contenido de la carpeta nombrada: `FROM "Plantillas"` todas las plantillas, `FROM "Proyectos" OR "Plantillas"` los proyectos y las plantillas. No cuentan como mención una carpeta superior como la raíz del área `""`, una carpeta negada como `-"Plantillas"`, una etiqueta y un enlace. Si la extensión «Plantillas» está desactivada, la exclusión no se aplica.

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

- **El mismo sentido en todos los niveles**: también en las consultas `BLOCKS`, `TASKS` y `RECORDS`, `this.` designa el archivo portador del bloque, nunca el bloque suelto, la línea de tarea ni el registro.
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
| `sum(l)`, `min(l)`, `max(l)`, `average(l)` | `sum(valores) = 6` | agregados sobre listas de números; sobre un grupo reúnen los valores de todos sus resultados (sección «Agrupación y agregación») |
| `count(x)` | `count(tags) > 2` | número de valores presentes: en una lista sus elementos, en un valor simple 1, sin valor 0; `count()` sin campo cuenta los resultados de un grupo |
| `bold(x)` | `bold(estado)` | presentar un valor resaltado (sección «Resalte») |

Una función desconocida o un número de argumentos incorrecto muestra un aviso de error en el bloque.

**Idioma de los formateadores:** `dateformat`, `numberformat` y `currencyformat` siguen el idioma del programa elegido en los ajustes, no el del sistema operativo. Donde no hay ningún documento detrás, como en las columnas calculadas de las tablas de datos y en los cálculos en línea, sigue rigiendo el idioma del entorno.

## Resalte

`bold(valor)` presenta un valor resaltado, tanto en celdas de tabla como en el complemento de una entrada de lista y en el valor de un grupo. La marca sobrevive a la concatenación: `bold` puede envolver solo una **parte** de una expresión compuesta, y el resto queda normal.

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

`SORT campo [ASC|DESC], campo2 …` ordena el resultado por varias claves, según el tipo (números numéricamente, fechas cronológicamente, texto alfabéticamente según las reglas del idioma); los valores ausentes van al final sea cual sea la dirección. Sin `SORT` se mantiene el orden alfabético; las tareas y los registros siguen el orden predeterminado de su sección. `LIMIT n` recorta el resultado después de la ordenación. En una tabla agrupada, `SORT` y `LIMIT` ordenan y recortan los grupos en lugar de los resultados (sección «Agrupación y agregación»).

## Agrupación y agregación (`GROUP BY`, `HAVING`)

`GROUP BY expresión, …` reúne los resultados en grupos según el valor de una expresión, en todos los niveles: archivos, bloques, tareas y registros. Cada expresión adicional forma un escalón bajo el anterior. Los grupos se ordenan por su valor, y los resultados sin valor quedan al final en el grupo «(sin valor)». Un valor de lista como `file.tags` forma un grupo por combinación, de modo que `[rojo, azul]` y `[azul, rojo]` son dos; no se reparte por elementos sueltos de la lista. Un campo de referencia en el nivel de registro agrupa según el registro al que apunta: dos libros con el mismo título dan dos grupos, cada uno muestra la forma de visualización de su libro, y un clic en él abre el formulario de ese libro.

- **Lista**: `LIST … GROUP BY …` muestra por grupo un título y debajo sus resultados, cada escalón un paso más sangrado. Un resultado aparece y responde al clic como en la lista sin agrupación.
- **Tabla**: `TABLE … GROUP BY …` muestra una fila por grupo, con varios escalones una por grupo del escalón más bajo; los resultados sueltos no aparecen. Delante figura, por cada expresión de `GROUP BY`, una columna con el valor del grupo, en lugar de la columna «Archivo» o «Registro». Su título es la etiqueta del campo en el nivel de registro y, si no, la propia expresión; `WITHOUT ID` oculta estas columnas. Las demás columnas muestran valores sobre el grupo.

````markdown
```perspective-query
TABLE RECORDS count() AS "Libros", sum(paginas) AS "Páginas"
FROM "Libros"
GROUP BY autor
HAVING count() > 1
SORT count() DESC, autor
```
````

**Fila o grupo.** Una función de agregación toma su significado del lugar en que está. Los **lugares de agregación** son las columnas y el `SORT` de una tabla agrupada, así como `HAVING`; allí calcula sobre todos los resultados del grupo. En cualquier otro lugar calcula sobre el valor del resultado individual, es decir, en `WHERE`, en las expresiones de `GROUP BY`, en las columnas de una tabla sin `GROUP BY`, en el complemento de la lista y en el `SORT` de una lista agrupada. Tres ejemplos:

| Consulta | Significado |
|---|---|
| `TABLE sum(valores)` | por archivo la suma de su lista `valores` (fila) |
| `TABLE sum(valores) GROUP BY estado` | por estado la suma de todos los valores de todos los archivos con ese estado (grupo) |
| `LIST GROUP BY estado HAVING count() > 2` | solo los estados con más de dos archivos, con sus archivos debajo (condición sobre el grupo) |

**Sobre el grupo**, `count()` cuenta los resultados y `count(x)` los resultados en los que `x` tiene un valor. `sum`, `average`, `min` y `max` reúnen los valores de todos los resultados, una lista con todos sus elementos; `min` y `max` admiten allí también fechas y devuelven entonces una fecha. Se permite calcular sobre agregados, por ejemplo `sum(paginas) / count()`. El agregado sobre la lista de un resultado individual no es accesible en un lugar de agregación. En la fila de agregados de la [Perspective Datatable](datatable.md) la media se llama `avg`, en la consulta `average`.

**Se permiten en un lugar de agregación** una expresión igual a una expresión de `GROUP BY` (las mayúsculas y minúsculas de los nombres de campo no cuentan), literales, agregados y cualquier cálculo o función sobre ellos, por ejemplo `upper(autor) + ": " + count()`. Producen en cambio un mensaje de error:

- otro campo en una columna o en el `SORT` de una tabla agrupada, también una autorreferencia con `this.`; el mensaje nombra la columna y remite a `LIST`, que muestra los resultados individuales;
- otro campo en `HAVING`; el mensaje nombra el campo y remite a `WHERE`, que filtra los resultados individuales;
- un agregado dentro de un agregado, por ejemplo `sum(count(x))`;
- `count()` sin campo en un lugar de fila, por ejemplo en `WHERE` o en una tabla sin `GROUP BY`;
- `HAVING` sin `GROUP BY`.

**Condición sobre el grupo (`HAVING`).** `HAVING` comprueba los grupos como `WHERE` comprueba los resultados: es una expresión de verdad como tras `WHERE`, solo aparece junto con `GROUP BY` en cualquier posición entre las cláusulas y actúa en la lista y en la tabla. Con varios escalones comprueba los grupos del escalón más bajo. Un grupo superior bajo el que no queda ningún subgrupo desaparece, y los demás conservan solo los resultados de sus subgrupos restantes.

**Orden.** En la tabla agrupada, `WHERE` filtra los resultados, después se forman los grupos, `HAVING` los comprueba, `SORT` los ordena (sin `SORT`, por su valor) y `LIMIT` recorta el número de filas. Con varios escalones, `SORT` ordena los grupos de cada escalón entre sí. En la lista agrupada, en cambio, `SORT` y `LIMIT` ordenan y recortan los resultados antes de que se formen los grupos, y `HAVING` actúa después; los grupos mismos se ordenan allí por su valor.

**Límites.** Una tabla sin `GROUP BY` calcula por resultado; no existe un total general sobre todos los resultados sin agrupación. `HIDE`, `SHOW` y `SHORT` siguen reservados a la lista de tareas. El árbol (`DISPLAY tree`) no se ajusta a ninguna consulta agrupada. Como fuente de un repertorio de valores o de un campo de recopilación, una consulta agrupada entrega los mismos resultados que sin agrupación (página [Perfiles de propiedades](property-profiles.md)).

## Listas multicolumna

`COLUMNS n` (1 a 8) hace que la lista de resultados fluya por varias columnas — pura presentación, sin cambio de datos. Con `TABLE`, `COLUMNS` se ignora y se señala con una nota en el bloque.

````markdown
```perspective-query
LIST FROM #marcadores COLUMNS 3
```
````

## Forma de presentación (`DISPLAY`)

La indicación `DISPLAY` seguida del nombre de una forma elige la forma en la que aparece el resultado. Es una cláusula como las demás y suele ir al final; sin ella, el resultado aparece como lista o como tabla, según el tipo de salida. La lista y la tabla se eligen con `LIST` y `TABLE`, no con `DISPLAY`; por eso `DISPLAY list` y `DISPLAY table` cuentan como formas desconocidas.

````markdown
```perspective-query
LIST RECORDS FROM "Equipo" DISPLAY tree BY jefe
```
````

La forma disponible es el **árbol** (`DISPLAY tree BY campo`). Muestra los registros de una consulta de registros sangrados a lo largo del campo de referencia nombrado:

- Un registro cuelga del registro al que apunta su campo, si este está en el resultado. Si no, es una **raíz** y queda en el extremo izquierdo: sin enlace, con un enlace que no lleva a ninguna parte o a un registro que la condición filtra. Con `descendants(…)` las raíces son por tanto los registros situados directamente bajo el destino, porque el destino mismo no forma parte del resultado.
- Las raíces y los hermanos siguen el orden del resultado, que determina `SORT`.
- Cada registro aparece exactamente una vez, aunque los enlaces formen un ciclo. Un ciclo sin raíz va detrás de las demás raíces y empieza por su primer registro en el orden del resultado.
- Solo actúa el campo tras `BY`. Si una tabla lleva dos campos de padre como padre y madre, el árbol sigue el nombrado; qué registros están en el resultado lo sigue determinando la fuente.
- Un nodo muestra la forma de visualización como una entrada de lista, con `LIST` seguida del campo adicional; con `TABLE` el árbol no muestra columnas. Un clic abre el formulario.
- Más allá de 32 niveles ya no se sangra más; los nodos más profundos aparecen completos en el nivel 32.

**Respaldo**: si una forma es desconocida o no se ajusta a la consulta, el resultado aparece sin ella, es decir, como lista o tabla, con encima una nota que nombra la forma y sin mensaje de error. El árbol solo se ajusta en el nivel de registro y solo con un campo tras `BY` que sea un campo de referencia en al menos una tabla del resultado. Nunca se ajusta a una consulta agrupada; aparece entonces la salida agrupada con la nota. Un resultado vacío muestra su nota de resultado vacío y ninguna forma. Si falta el nombre de la forma tras `DISPLAY` o el campo tras `BY`, la consulta no es válida.

## Visualización e interacción

- **Coincidencias cliqueables**: cada coincidencia aparece con su nombre de archivo lógico; la ruta completa está en la información sobre herramientas. Un clic abre el archivo de destino en una pestaña, exactamente como un enlace wiki — incluidos los valores de enlace en celdas de tabla. En el nivel de registro, una coincidencia lleva el nombre de su forma de visualización, y un clic abre su formulario.
- **Actualización en vivo**: los archivos nuevos, modificados y eliminados se reflejan en los resultados visibles sin recarga manual, en cuanto el índice los registra.
- **Resultado vacío**: si la consulta no encuentra ningún archivo ni ningún registro, aparece una breve nota en lugar de un área vacía.
- **Consulta no válida**: un error de sintaxis muestra un aviso de error con la posición en lugar de un resultado.

Las tres vistas Renderizado, Dividido y En vivo muestran el mismo resultado. En la vista de código fuente pura, el bloque permanece visible como código.

## Ámbito de búsqueda

El ámbito de búsqueda es el mismo que el del índice de archivos:

- **Con un área activa** abarca toda el área; las relaciones de enlaces (`FROM [[…]]`, `file.inlinks`) están completas allí.
- **Sin área** abarca la carpeta del archivo más dos subniveles.

Los archivos fuera del ámbito de búsqueda no aparecen en el resultado, como tampoco lo que está en la carpeta de plantillas, salvo que la consulta la nombre (sección «Fuentes»). Un archivo aún no guardado no tiene ámbito de búsqueda; la consulta muestra entonces una nota de que estará disponible tras guardar. En cambio, los cambios sin guardar de un archivo abierto, también de una tabla de base de datos, se incluyen de inmediato en el resultado; no hace falta guardar nada para ello.

## Exportación

- **Exportación a PDF**: el resultado se imprime como estado estático del momento del renderizado, incluida la disposición en tabla y columnas. Las entradas aparecen como texto; en el PDF no son cliqueables.
- **Markdown portable**: la exportación deja el bloque `perspective-query` sin cambios como código fuente. Al reabrirlo en este programa se evalúa de nuevo dinámicamente; otros programas de Markdown lo muestran como bloque de código.

Para evaluaciones libres más allá del lenguaje de cláusulas — por ejemplo estructuras recursivas o resúmenes calculados — están disponibles los [bloques de script](scripts.md); su API pq usa el mismo modelo de campos y bloques que la consulta.
