# Paneles

Un **panel** organiza **mosaicos** en filas. Cada mosaico ejecuta una [Consulta Perspective](frontmatter-query.md) y muestra su resultado como cifra clave, lista, tabla, gráfico de barras o circular, o bien contiene texto propio. Los **filtros** de la cabecera acotan a la vez las consultas de todos los mosaicos. Así surge una vista general que se mantiene al día por sí sola con el contenido del área: tareas abiertas por estado, páginas por tema, los libros más largos de una tabla de base de datos, todo de un vistazo.

**No debe confundirse con la vista «Panel» de los eventos.** Un [bloque de eventos](events.md) ofrece entre sus vistas una que también se llama «Panel» (`view: dashboard`): reúne los eventos próximos, los hitos y la distribución por categoría **de ese único bloque**. Esta página describe otra cosa: el bloque de código propio `perspective-dashboard`, cuyos mosaicos muestran consultas cualesquiera sobre toda el área.

Un panel lo sostiene un bloque de código con la etiqueta de lenguaje `perspective-dashboard`. Un documento puede contener tantos como quiera, y todo lo demás en él sigue siendo Markdown corriente.

La función pertenece a las [extensiones internas](extensions.md) («Panel») y está activada a partir del modo de trabajo **Avanzado**. No depende de ninguna otra extensión, tampoco de «Gráfico de una consulta». Desactivada, el bloque aparece como texto fuente con una nota encima, y el comando «Insertar panel» desaparece. El documento queda sin cambios, y tras volver a activarla el panel reaparece.

## Insertar un panel

El comando **«Insertar panel»** coloca un esqueleto en el punto de inserción. Dos caminos llevan allí: la paleta de comandos (`Ctrl+K` predeterminado) y el menú contextual del editor → Insertar → Insertar panel. No hay atajo preasignado; puede asignarse en la configuración. El comando requiere un documento modificable.

Inserta una fila con una cifra clave sobre todos los documentos del ámbito de búsqueda; su título sigue el idioma del programa elegido:

````markdown
```perspective-dashboard
!zeile
!kachel kennzahl titel="Recuento"
LIST
```
````

A continuación queda seleccionada la consulta `LIST`, porque es lo primero que se sustituye.

## Estructura del bloque

Dentro del bloque, cada elemento comienza con una **línea de marcador**: está en la columna 0 y comienza con `!` y una palabra. La línea de marcador lleva las indicaciones del elemento; las líneas siguientes hasta el siguiente marcador son su contenido. Hay tres elementos:

| Marcador | Escritura | Líneas de contenido |
|---|---|---|
| `!filter` | `!filter <nombre> [titel="…"] [eigenschaft=<campo>] [vorbelegung=<valor>]` | valores enumerados, uno por línea |
| `!zeile` | `!zeile` | ninguna |
| `!kachel` | `!kachel <tipo> [titel="…"] [breite=<parte>] [abfrage="<archivo de consulta>"]` | la consulta, para el tipo `text` Markdown |

- Las **indicaciones** tienen la forma `nombre=valor`. Un valor es una palabra sin espacios o una cadena entre comillas dobles, en la que `\"` representa una comilla y `\\` una barra invertida.
- **Vocabulario:** Las palabras del bloque son alemanas, como las de la [superficie Canvas](canvas.md), y son las mismas en todos los idiomas del programa: `!filter` es un filtro, `!zeile` una fila, `!kachel` un mosaico, `titel=` el título, `eigenschaft=` la propiedad, `vorbelegung=` la preselección, `breite=` el ancho y `abfrage=` el archivo de consulta. Marcadores, tipos de mosaico y palabras de ancho se escriben en minúsculas; `!Kachel` es un marcador desconocido. Solo los nombres de los filtros son libres en su escritura.
- **Protección:** Una línea de contenido que deba comenzar con `!` en la columna 0 se protege con `\!`, por ejemplo una línea de consulta que empieza con `!=`.
- **Orden:** Los filtros pueden estar en cualquier lugar del bloque y aparecen reunidos en la cabecera, en el orden del bloque. Las filas y los mosaicos siguen el orden del bloque.
- **Lo desconocido se conserva.** Un marcador o una indicación que la aplicación no conoce permanece en el bloque con su texto, y un elemento sin cambios se vuelve a escribir literalmente. Un error nunca desecha nada: aparece como nota, y el texto queda tal como está.

## Filtros (`!filter`)

En la cabecera del panel, un filtro se convierte en un **campo de selección**. Lo que se elige allí, la aplicación lo introduce en cada consulta que lleva su marcador de posición (sección «Marcadores de posición en las consultas»).

````markdown
```perspective-dashboard
!filter estado titel="Estado" vorbelegung=abierto
!filter prio titel="Prioridad"
alta
media
baja
```
````

- **Nombre:** letras, cifras y guion bajo, sin cifra al principio; se admiten letras con tilde, no el guion ni el punto. Mayúsculas y minúsculas no cuentan. El nombre es también el nombre del marcador de posición.
- **`titel=`** rotula el campo de selección; sin indicación, figura allí el nombre.
- **De dónde vienen los valores:** Si el filtro lleva líneas de contenido, los valores están **enumerados**: cada línea no vacía es un valor, sin los espacios de los bordes. Si no, **`eigenschaft=`** nombra la propiedad del frontmatter cuyos valores asignados en el área se ofrecen; un valor de lista cuenta por elemento, y lo que está en la carpeta de plantillas no cuenta. Si faltan ambos, vale la propiedad del mismo nombre: `!filter estado` solo ya está completo. Si están a la vez valores enumerados y `eigenschaft=`, valen los enumerados, con una nota en el campo.
- **La elección** comienza siempre con la entrada **«todos»**. Siguen los valores enumerados en su orden o los valores del área, por orden alfabético según el idioma del programa elegido. Si una propiedad no aparece en el área, el campo solo ofrece «todos», sin nota.
- **`vorbelegung=`** fija el valor con el que empieza el campo; sin indicación es «todos». Con valores enumerados, la preselección debe ser uno de ellos (sin distinguir mayúsculas), si no, el campo empieza con «todos» y figura una nota en el campo. Con valores del área, la preselección vale aunque el valor no aparezca en ningún sitio en ese momento.
- **Una elección no es un cambio.** Vale mientras el documento está abierto, por separado para cada columna de la vista dividida, y nunca se escribe en el archivo; el documento no recibe marca de cambio. Tras cerrarlo y volver a abrirlo, el campo empieza de nuevo con la preselección. Si cambia la serie de filtros del bloque, los campos también empiezan de nuevo.
- **Solo se recarga lo afectado.** Tras una nueva elección, solo se vuelven a evaluar los mosaicos cuya consulta lleva el marcador de posición de ese filtro; los demás quedan como están.
- **Los valores se mantienen al día.** Si en el área aparece un valor o desaparece uno, el campo de selección lo sigue. Un valor elegido que ha desaparecido del área sigue elegido; los mosaicos no muestran entonces ningún resultado hasta que se haga otra elección.
- **Límites de los campos:** Como máximo 20 filtros reciben un campo de selección, y no se ofrecen valores de más de 500 caracteres.
- **Casos de error:** Un filtro sin nombre válido se descarta, igual que un segundo filtro del mismo nombre; vale el primero. La nota de resumen al pie del panel nombra ambos.

## Marcadores de posición en las consultas

En la consulta de un mosaico, **`$nombre`** representa la elección del filtro de ese nombre, sin distinguir mayúsculas. Un marcador de posición solo está en `WHERE` y `HAVING`, pero allí en cualquier lugar de una expresión: como lado de una comparación, en una lista `IN` o como argumento de una función como `contains(tags, $tag)`.

````markdown
```perspective-dashboard
!filter estado
!kachel kennzahl titel="Resultados"
LIST FROM "Tareas" WHERE prioridad = "alta" OR estado = $estado
```
````

- **Un valor elegido** se compara como una cadena, así que `estado = $estado` se comporta exactamente como `estado = "abierto"`: sin distinguir mayúsculas y, en una propiedad de lista, como pertenencia. El valor nunca se lee como texto de consulta.
- **Si el filtro está en «todos»,** la condición más pequeña que lleva el marcador de posición desaparece y cuenta como cumplida; un `NOT` justo delante desaparece con ella. `AND` y `OR` por encima calculan con normalidad: en el ejemplo, «todos» entrega por eso todas las tareas, porque el lado derecho del `OR` se cumple. Una propiedad que lleve literalmente el valor «todos» no entra en conflicto con esto.
- **Un nombre sin filtro** cuenta como «todos»; encima del resultado del mosaico figura entonces una nota con el nombre.

Cómo se comportan los marcadores de posición fuera de un panel, por ejemplo en una consulta en el texto corrido o en un archivo de consulta abierto por sí solo, lo describe la página [Consulta Perspective](frontmatter-query.md), sección «Marcadores de posición».

## Filas (`!zeile`)

`!zeile` comienza una nueva fila de la cuadrícula; no lleva indicaciones. Los mosaicos anteriores al primer `!zeile` forman una primera fila, de modo que un panel de una sola fila prescinde de este marcador. Un `!zeile` sin mosaico detrás queda vacío. El texto en las líneas bajo `!zeile` no tiene significado, permanece en su sitio y se nombra en la nota de resumen.

## Mosaicos (`!kachel`)

Un mosaico nombra primero su **tipo** y después, opcionalmente, título, ancho y un archivo de consulta. Sin tipo no está completo; no hay tipo predeterminado.

- **`titel=`** figura encima del mosaico. Sin indicación, la línea de título queda vacía, y una cifra clave solo muestra su número.
- **Fuente de datos, exactamente una:** O bien las líneas de contenido son la consulta, o bien `abfrage=` nombra un archivo de consulta (sección «Mosaico con archivo de consulta»).
- Otras palabras tras el tipo, por ejemplo `!kachel kennzahl Abiertas`, no tienen significado; el mosaico sigue siendo válido, y una nota encima de él remite a la indicación `titel=`. Lo mismo vale para palabras tras el nombre de un filtro.

### Ancho

| Indicación | Parte de la fila |
|---|---|
| `breite=ganz` (entero) | 12/12 |
| `breite=halb` (mitad) | 6/12 |
| `breite=drittel` (tercio) | 4/12 |
| `breite=viertel` (cuarto) | 3/12 |
| `breite=n/12` (n de 1 a 12) | n/12; un `n` solo vale igual |

- **Los mosaicos sin indicación** se reparten a partes iguales lo que dejan en su fila los mosaicos con indicación. Sin ninguna indicación, todos los mosaicos se reparten el ancho completo.
- **Más de doce doceavos** en una fila pasan a la línea siguiente sin nota.
- **Un panel estrecho** coloca los mosaicos uno debajo de otro, y también los campos de selección de la cabecera. Cuenta el ancho del bloque, no el de la ventana, para que siga siendo legible también en una columna de la vista dividida.
- Un valor desconocido produce una nota encima del mosaico, que se comporta como sin indicación.

### Los seis tipos de mosaico

El tipo determina la presentación. Un `DISPLAY` en la consulta se omite, sin nota.

| Tipo | Espera | Muestra | No se ajusta |
|---|---|---|---|
| `kennzahl` (cifra clave) | cualquier consulta | un número grande o un número por grupo (abajo) | tabla agrupada o total general, en ambos casos sin número: tabla con nota |
| `liste` (lista) | `LIST`, también con `TASKS` y `BLOCKS` | la lista como en el texto corrido | `TABLE`: tabla con nota |
| `tabelle` (tabla) | `TABLE` | la tabla como en el texto corrido | `LIST`: lista con nota |
| `balken` (barras) | `TABLE` con una columna de números | un gráfico de barras como con `DISPLAY bar` | tabla con el motivo como nota |
| `kreis` (circular) | `TABLE` con una columna de números | un gráfico circular como con `DISPLAY pie` | tabla con el motivo como nota |
| `text` | ninguna consulta | el Markdown de las líneas de contenido | — |

Barras y circular leen la tabla según las reglas de los gráficos de la página [Consulta Perspective](frontmatter-query.md), sección «Forma de presentación». Dependen de la extensión «Gráfico de una consulta»; si está desactivada, muestran la tabla con la nota de que la presentación en gráfico está desactivada.

Lista y tabla muestran el resultado de una consulta de registros cuyo archivo de consulta activa el [formulario de lista](database.md) como cuadrícula, igual que en el texto corrido; la cifra clave muestra también entonces solo su número.

**La cifra clave** obtiene su número según la consulta:

- Una tabla cuyas columnas son exclusivamente agregados, sin `GROUP BY` (el **total general**, por ejemplo `TABLE WITHOUT ID sum(esfuerzo)`): su primer valor.
- Cualquier otra consulta sin agrupación: el número de resultados, tras `LIMIT`.
- Una tabla agrupada: por grupo, el valor de la primera columna que lleva un número; si le falta a un grupo, figura allí un guion, y un texto en esa columna aparece como texto.
- Una lista agrupada: por grupo, el número de sus resultados.

Un solo grupo da un número grande, varios dan por grupo un número con etiqueta; con varios niveles, los valores de grupo aparecen unidos con « › », como en la etiqueta de un gráfico. Sin resultados figura `0`. Una fecha o una duración también cuentan como número, de modo que `min(…)` y `max(…)` sobre fechas muestran el día más temprano o más tardío. Números, fechas y duraciones aparecen en el formato del idioma del programa elegido.

### Mosaicos de texto

Un mosaico del tipo `text` muestra el Markdown de sus líneas de contenido, con enlaces, resaltados y listas como en el resto del documento. Tres particularidades:

- **Los títulos en un mosaico de texto** parecen títulos, pero no pertenecen al esquema del documento: no aparecen en el índice, no llevan numeración y no son destino de salto.
- **Tablas de datos, notas al pie y anclas de bloque** en un mosaico de texto reciben identificadores y recuentos propios, que pueden coincidir con los del resto del documento.
- **Un bloque de panel dentro de un mosaico de texto** sigue siendo texto fuente. Sus líneas de marcador necesitan allí la protección `\!`, porque el bloque exterior leería si no cada línea con `!` en la columna 0 como un elemento propio.

Un mosaico de texto no tiene consulta; una indicación `abfrage=` en él se omite con una nota.

### Mosaico con archivo de consulta

En lugar de una consulta propia, un mosaico puede nombrar un **archivo de consulta**, un archivo con la marca `db-query` y exactamente un bloque de consulta (página [Base de datos](database.md), sección «Archivos de consulta»). Varios paneles comparten así una consulta que se mantiene en un solo lugar.

````markdown
```perspective-dashboard
!kachel liste titel="Consulta compartida" abfrage="Consultas/Modificados recientemente"
```
````

- **Destino:** el nombre del documento o una ruta relativa al panel, las mismas formas que con `doc=` de una tarjeta de la [superficie Canvas](canvas.md).
- **Referencia:** La consulta se ejecuta como si estuviera en el archivo de consulta. `this.` y el enlace wiki vacío designan el archivo de consulta, no el panel.
- **Los marcadores de posición** del archivo de consulta actúan como en una consulta del bloque. Sin marcadores de posición, los filtros no afectan al mosaico.
- **Enlace en el área:** La indicación cuenta como enlace al archivo de consulta. Por eso el panel aparece en los [retroenlaces](linking.md) del archivo de consulta, el mosaico entre los enlaces salientes del panel como incrustación, y si el archivo de consulta se renombra o se mueve, la indicación lo sigue, con la vista previa del cambio de nombre. Un destino que no existe sigue siendo un enlace abierto.
- **Casos de error:** Si el destino no se encuentra, no es un archivo de consulta, o contiene ninguno o más de un bloque de consulta, el mosaico muestra una nota con el nombre indicado.
- **Una sola fuente:** Si bajo el mosaico hay líneas de consulta y a la vez `abfrage=`, no se ejecuta ninguna de las dos; el mosaico se convierte en mosaico de error.

## Líneas de comentario

Una línea que comienza en la columna 0 con `%%` y termina con `%%` es un **comentario**. Puede estar antes del primer elemento, entre los elementos y entre las líneas de una consulta; desaparece antes de la evaluación y no se muestra en ningún sitio. En un mosaico de texto, `%%` sigue las reglas de la extensión «Comentarios» como en el resto del documento.

## Notas y mosaicos de error

Un error en el bloque no interrumpe el panel; cada hallazgo aparece donde le corresponde:

- **Un mosaico de error** está en su lugar de la cuadrícula, con borde discontinuo, con título, nota y la línea en el bloque, contada desde 1. Se convierte en mosaico de error un mosaico de tipo desconocido o ausente, y un mosaico de un tipo de datos sin fuente válida: ni consulta ni archivo de consulta, ambos a la vez, o un archivo de consulta que no puede usarse.
- **Las notas de un mosaico válido**, por ejemplo sobre un ancho desconocido, figuran encima de su contenido.
- **Un error de sintaxis de la consulta** aparece con su posición en el lugar del resultado del mosaico, como en una consulta en el texto corrido.
- **Las notas de un filtro** figuran bajo su campo de selección: valores enumerados y `eigenschaft=` a la vez, una preselección desconocida, palabras sin significado.
- **La nota de resumen** «Avisos sobre este panel» al pie nombra lo que no tiene lugar propio, cada cosa con su línea en el bloque: un marcador desconocido, texto antes del primer elemento, texto bajo `!zeile` y un filtro que se descarta. Un marcador desconocido no aparece él mismo, para no desplazar la cuadrícula.
- **Un panel sin mosaico** muestra, en lugar de la cuadrícula, una superficie de nota que explica cómo surge un mosaico; los filtros de la cabecera permanecen.

Un bloque de panel que a su vez está dentro de un bloque de código exterior sigue siendo texto literal.

## Vistas, impresión y exportación

- **Vistas:** Renderizado, Dividido y En vivo muestran el mismo panel con los mismos valores. En el modo En vivo, el bloque se despliega a texto fuente en cuanto el cursor lo toca, y al salir vuelve a plegarse en panel. En la vista de solo código fuente sigue siendo código.
- **Incrustación:** Un panel en un documento o una sección incrustados aparece como en el original, y sus campos de selección siguen siendo utilizables, porque una elección no cambia nada del documento.
- **Actualización en vivo:** Los archivos nuevos, modificados y eliminados se reflejan en los mosaicos en cuanto el índice los ha registrado, igual que los cambios sin guardar de un archivo abierto.
- **La impresión y la exportación a PDF** muestran los mosaicos con la **elección actual** de los filtros, en su disposición y sin los campos de selección. Los gráficos aparecen allí claros, aunque la aplicación funcione en oscuro.
- **El Markdown portable** (**Archivo → Más funciones de archivo → Exportar → Markdown portable…**) sustituye el bloque por un estado estático con la **preselección** de los filtros, no con la elección actual. Arriba figura una línea «Estado de la preselección: …» que nombra cada filtro con su título y su valor, «todos» para un filtro sin preselección; un panel sin filtros no tiene esta línea. Debajo siguen los mosaicos **uno debajo de otro**, porque el Markdown corriente no conoce cuadrícula, cada uno con su título como encabezado: la cifra clave como texto, la lista como enumeración, la tabla como tabla Markdown, barras y circular como imagen clara, el mosaico de texto como Markdown. Un mosaico de error aparece como encabezado con su nota, incluida la línea en el bloque, y un mosaico cuya evaluación no termina a tiempo, con una nota al respecto. En la exportación no hay campos de selección. Si la extensión está desactivada, el bloque sigue siendo un bloque de código en la exportación.

## Ámbito de búsqueda

El ámbito de búsqueda de los mosaicos es el mismo que el de cualquier consulta: con un área activa, toda el área; sin área, la carpeta del documento más dos subniveles. Lo que está en la carpeta de plantillas no es resultado, salvo que una consulta la nombre. Un documento aún no guardado no tiene ámbito de búsqueda; sus mosaicos muestran entonces la nota de que la consulta estará disponible tras guardar.

## Un ejemplo completo

````markdown
```perspective-dashboard
%% Vista general del proyecto, estado 2026-11 %%
!filter estado titel="Estado" vorbelegung=abierto
!filter prio titel="Prioridad"
alta
media
baja

!kachel text breite=ganz
## Vista general del proyecto
Trabajo abierto por estado y prioridad; detalles en [[Reglas del proyecto]].

!zeile
!kachel kennzahl titel="Tareas abiertas" breite=drittel
LIST FROM "Tareas" WHERE estado = $estado AND prioridad = $prio
!kachel kennzahl titel="Esfuerzo total" breite=drittel
TABLE WITHOUT ID sum(esfuerzo) AS "Esfuerzo" FROM "Tareas" WHERE estado = $estado
!kachel kennzahl titel="Por prioridad" breite=drittel
TABLE count() AS "Número" FROM "Tareas" WHERE estado = $estado GROUP BY prioridad

!zeile
!kachel balken titel="Tareas por estado" breite=halb
TABLE count() AS "Número" FROM "Tareas" WHERE prioridad = $prio GROUP BY estado
!kachel kreis titel="Parte por categoría" breite=halb
TABLE count() AS "Número" FROM "Tareas" WHERE estado = $estado GROUP BY categoria

!zeile
!kachel tabelle titel="Las diez más antiguas" breite=8/12
TABLE estado, prioridad FROM "Tareas" WHERE estado = $estado SORT file.ctime ASC LIMIT 10
!kachel liste titel="Consulta compartida" abfrage="Consultas/Modificados recientemente"
```
````

- El comentario de la primera línea no aparece en ningún sitio. El filtro «Estado» ofrece los valores de la propiedad `estado` del área y empieza con `abierto`; el filtro «Prioridad» ofrece los tres valores enumerados y empieza con «todos».
- El mosaico de texto está antes del primer `!zeile` y forma él solo la primera fila; su título no pertenece al esquema del documento.
- «Tareas abiertas» cuenta los resultados, «Esfuerzo total» muestra el total general sin agrupación, «Por prioridad» un número por prioridad con etiqueta.
- «Tareas por estado» depende solo del filtro Prioridad y por eso no se recarga cuando se cambia el estado.
- El último mosaico no tiene indicación de ancho y ocupa los 4/12 restantes. Los filtros no lo afectan mientras su archivo de consulta no lleve ningún marcador de posición.

Un panel que funciona sobre los archivos de la Demo-Area se muestra en su página «17 Dashboards».

## Límites

- **Los valores de un filtro tomados del área** proceden de las propiedades del frontmatter de los documentos del área, no de los campos de registros o tareas; para estos están los valores enumerados.
- **Un filtro elige exactamente un valor** o «todos»; no hay elección múltiple.
- **Un marcador de posición solo está en `WHERE` y `HAVING`.** En `FROM`, en columnas, en `SORT`, `GROUP BY` y `LIMIT` es un error de sintaxis.
- **Los tipos de mosaico se eligen solo por el tipo,** no por `DISPLAY`; el árbol (`DISPLAY tree`) no es accesible en un mosaico.
- **`!zeile` no lleva indicaciones,** y un mosaico no tiene una altura que elegir; la altura sigue a su contenido.
- **El gráfico de un mosaico es una imagen sin controles;** un clic sobre él no abre ningún resultado. Los resultados de una lista o tabla, en cambio, se pueden pulsar como en el texto corrido.
- **La elección de los filtros no se guarda.** Quien quiera ver un estado determinado de forma permanente lo fija como preselección en el bloque.
- **Un panel dentro de una cita o una lista** puede perder la elección de sus filtros al cambiar al modo En vivo y volver a la preselección.
