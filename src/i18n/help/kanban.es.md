# Tablero Kanban

Un **tablero Kanban** ordena en el espacio las tareas de **un** documento: cada lista con nombre del documento se sitúa como **columna** junto a las demás, y cada línea de tarea que contiene, como **tarjeta**. Quien arrastra una tarjeta de una columna a la siguiente mueve con ello su línea dentro del documento: el tablero es una superficie de trabajo, no una evaluación.

El tablero es **otra vista del mismo documento** y no un formato de archivo propio. Todo lo que hay en él está en el archivo como Markdown corriente; las demás vistas muestran los mismos encabezados y las mismas listas de tareas que antes, y cambiar entre ellas no modifica el texto.

## Cómo se reconoce un tablero

Por la **marca de encabezado** `kanban-plugin` en el encabezado del documento:

```markdown
---
kanban-plugin: board
---
```

Lo que cuenta es la **presencia** de la clave, no su valor: `board`, `list` u otra cosa; todo documento con esta clave es un tablero, y el valor encontrado permanece intacto. Un documento sin la clave no es un tablero, aunque lleve encabezados y listas de tareas.

## La extensión «Kanban»

La función pertenece a las [extensiones internas](extensions.md) («Vista de tablero (Kanban)»). Si está desactivada, desaparece el modo de vista, desaparecen los comandos de tarjeta, columna y tablero, y con ellos el submenú **Tablero Kanban** del menú **Ver**, que no se queda vacío. El documento sigue siendo legible tal cual; en el estado desactivado nunca se escribe, y columnas y tarjetas permanecen en el texto.

El tablero presupone la extensión **Tareas**, porque una tarjeta **es** una línea de tarea. Si aquella está desactivada, el tablero también lo está.

## Crear un tablero

Dos caminos, ambos en el menú **Ver → Tablero Kanban** y en la paleta de comandos (`Ctrl+K` por omisión):

| Camino | Efecto |
| ------ | ------ |
| **Nuevo tablero Kanban** | crea un documento nuevo, todavía sin nombre, lo rellena con un tablero inicial y lo abre enseguida en la vista de tablero |
| **Convertir el documento vacío en tablero Kanban** | escribe ese mismo tablero inicial en el documento abierto |

**Nuevo tablero Kanban** está siempre disponible: es el camino al primer tablero y no presupone ninguno.

**La conversión**, en cambio, solo está disponible para un documento **vacío** que todavía no sea un tablero; en los demás casos la entrada permanece visible y atenuada. El motivo es la seguridad de sus archivos: un documento con contenido quedaría sobrescrito. La entrada se ajusta mientras se escribe: con el primer carácter pierde su base, con el último borrado la recupera. Además presupone un documento modificable; si falta una de las condiciones, la barra de estado lo dice en lugar de no hacer nada en silencio.

El tablero inicial lleva tres columnas — **Por hacer**, **En curso** y **Hecho** — y la última está ajustada para marcar como hechas las tarjetas que se arrastran a ella. Los títulos están en el idioma de la interfaz; se cambian como cualquier otro título de columna.

## Abrir la vista de tablero

El tablero es el séptimo modo de vista, junto a Código fuente, Dividida, Renderizada, En vivo, Mapa mental y Lienzo: **Ver → Tablero**, el botón de la barra de estado o `Ctrl+7` por omisión. Como en los demás modos, la elección vale por documento abierto y no para toda la aplicación, y se restablece en el siguiente arranque.

**El modo depende del documento.** Solo puede elegirse si el documento abierto es un tablero: una vista de tablero sin tablero no mostraría más que un aviso. Sin la marca de encabezado, el botón y la entrada de menú siguen **visibles y atenuados**; el motivo figura en la ayuda emergente del botón. El camino por el atajo y la paleta de comandos no lleva entonces a ninguna parte y tampoco expulsa de la vista actual. En cuanto la marca aparece en el texto o desaparece de él, el acceso se ajusta, y un documento que estaba abierto en la vista de tablero al cerrar la aplicación y que ya no es un tablero se abre en la vista de lectura. La [superficie Canvas](canvas.md) tiene la misma propiedad; los otros cinco modos están disponibles en cualquier documento.

## Qué muestra el tablero

- Las **columnas** una junto a otra, cada una con su título y el número de sus tarjetas; si la columna lleva un límite, el contador muestra ambos, por ejemplo `2/3`. Si no caben lado a lado, la franja de columnas se desplaza en horizontal; una columna larga se desplaza en vertical por sí sola.
- Las **tarjetas** una debajo de otra, en el orden de sus líneas en el documento. El texto de la tarjeta está **renderizado**: enlaces, etiquetas, resaltes e imágenes aparecen como en la vista de lectura. Las etiquetas figuran en el texto donde están escritas o, si se quiere, reunidas al pie de la tarjeta.
- Las **líneas de continuación sangradas** de una tarea figuran como añadido en su tarjeta.
- Los **datos de la tarea** —fecha y hora, prioridad, recurrencia y los demás marcadores— figuran como insignias bajo el texto de la tarjeta.
- El **estado** de la tarea aparece como casilla en la tarjeta, con el carácter que consta en el documento, incluido un carácter de estado propio.
- Una columna que marca como hechas las tarjetas arrastradas a ella lleva para ello una marca junto a su contador de tarjetas.

Un tablero sin columnas y una columna sin tarjetas lo dicen en su lugar, en vez de mostrar una superficie vacía. Si una parte del tablero no se puede leer, encima aparece un recuadro de aviso con el número de línea y una frase por hallazgo; lo que sí se pudo leer sigue apareciendo debajo.

## Tarjetas

| Acción | Ratón | Teclado | Menú contextual | Comando |
| ------ | ----- | ------- | --------------- | ------- |
| Crear | botón **Añadir tarjeta** al pie de la columna | — | — | **Añadir tarjeta al tablero** |
| Seleccionar | clic en la tarjeta | — | — | — |
| Editar | doble clic en la tarjeta | `Intro` o `F2` | **Editar la tarjeta** | — |
| Aplicar | clic fuera de la tarjeta | `Intro` | — | — |
| Descartar | — | `Esc` | — | — |
| Cambiar el estado | clic en la casilla | `Espacio` | — | — |
| Establecer o cambiar la fecha | clic en la insignia de fecha | — | **Establecer fecha…** | — |
| Quitar la fecha | — | — | **Quitar fecha** | — |
| Archivar | — | — | **Archivar la tarjeta** | **Archivar tarjeta del tablero** |
| Eliminar | — | `Supr` | **Eliminar la tarjeta** | — |

**Una tarjeta nueva se puede escribir de inmediato** y nace al pie de la columna en la que se creó. Si su texto queda vacío, no se crea ninguna tarjeta, ni en el documento ni como paso de deshacer.

**Lo que se edita es el texto en bruto de la tarjeta**, en una sola línea. Quien escribe una tarjeta escribe Markdown y debe verlo. Los marcadores de la línea de tarea —fecha, hora, prioridad y recurrencia— pertenecen a la línea y quedan intactos al editar; las líneas de continuación sangradas, también. Una fecha en la notación de la otra herramienta, en cambio, está en el texto y se reescribe al aplicar (véase «Datos en la tarjeta»). Un texto sin cambios no escribe nada en el documento.

**El cambio de estado sigue el mismo camino que un clic en la casilla en la vista de lectura**, con cadena de estados, fechas automáticas y recurrencia incluidas. No existe una segunda lógica de estados.

**Se elimina sin confirmación.** La acción está a un único paso de deshacer, y una pregunta en cada tarjeta sería un clic de más. Después, la selección pasa a la siguiente tarjeta de la columna y, si no la hay, a la anterior.

## Columnas

| Acción | Ratón | Teclado | Menú contextual | Comando |
| ------ | ----- | ------- | --------------- | ------- |
| Crear | botón **Añadir columna** al final de la franja | — | — | **Añadir columna al tablero** |
| Cambiar el nombre | doble clic en el título de la columna | — | **Cambiar el nombre de la columna** | — |
| Aplicar | clic fuera del campo | `Intro` | — | — |
| Descartar | — | `Esc` | — | — |
| Establecer o cambiar el límite | — | — | **Establecer el límite…** | — |
| Quitar el límite | — | — | **Quitar el límite** | — |
| Eliminar | — | — | **Eliminar la columna** | — |
| Activar o desactivar el marcado | — | — | **Marca como hechas las tarjetas que se arrastran a ella** (con una marca de verificación) | — |

El botón **Añadir columna** existe también en un tablero sin ninguna columna; de otro modo no habría camino hacia la primera. Si el título queda vacío, no se crea ninguna columna.

**Al cambiar el nombre solo se toca la línea del encabezado**: sangría, almohadillas y espaciado se mantienen, un límite se mantiene en la notación en que se encontró, y las tarjetas de la columna quedan intactas.

**Al eliminar se pregunta en cuanto la columna lleva tarjetas.** Una columna vacía desaparece sin pregunta; una llena indica en la pregunta su título y su número de tarjetas y viene preseleccionada con **Cancelar**. El motivo de la diferencia: al eliminar una columna desaparece más de lo que la acción anuncia, a saber, también sus tarjetas.

Los dos comandos de creación —el de la tarjeta y el de la columna— y el archivado de la tarjeta seleccionada están en el menú **Ver → Tablero Kanban** y en la paleta de comandos. No hay atajo de teclado predefinido para ellos; se puede asignar en los ajustes.

## Mover con el ratón

**Una tarjeta se arrastra por la tarjeta; una columna, por su cabecera.** Durante el arrastre, lo arrastrado se retira y una marca indica dónde se depositará. Con el puntero en el borde, la superficie bajo él sigue desplazándose: la franja de columnas en horizontal, la lista de tarjetas en vertical.

Qué columna se quiere decir lo decide solo la horizontal: un puntero por debajo de la última tarjeta sigue señalando esa columna.

El arrastre termina al soltar. `Esc`, la pérdida de la ventana y soltar fuera de toda columna lo cancelan sin modificar el documento; lo mismo ocurre si la tarjeta vuelve a su propio sitio. Tras depositarla, la tarjeta movida queda seleccionada.

Mientras se edita una tarjeta o un título de columna no comienza ningún arrastre; en un documento no modificable, tampoco. **Sin ratón no se puede mover**; todas las demás acciones del tablero son accesibles también por teclado y menú.

## Una columna que marca como hecho

Cada columna lleva el ajuste **Marca como hechas las tarjetas que se arrastran a ella**, conmutado desde su menú contextual. Cuando está puesto:

- Una tarjeta que se arrastra **hacia dentro** y sigue abierta queda marcada como hecha.
- Una tarjeta marcada como hecha que se arrastra **fuera** de esa columna hacia una corriente vuelve a abrirse.
- Reordenar entre dos columnas corrientes deja el estado intacto.

Mover y marcar son juntos **una** acción y, por tanto, un solo paso de deshacer. Qué estado se pone lo decide la cadena de estados de las tareas, y la fecha de finalización aparece y desaparece igual que en la vista de lectura.

**Si la tarjeta lleva una regla de recurrencia**, el marcado crea la siguiente instancia de la tarea, como en todas partes. En el tablero esa instancia aterriza **en la columna de la que se arrastró la tarjeta**, en el lugar de la tarjeta antigua, y no en la columna de hechos. Una tarea abierta en la columna de hechos sería justo la contradicción que un tablero está para resolver. Al reordenar dentro de la misma columna, la instancia se queda allí y ocupa el antiguo lugar de la tarjeta.

## Datos en la tarjeta

Bajo el texto de la tarjeta aparece una fila de **insignias** con los datos de la tarea: la fecha con su hora, las fechas planificada y de inicio, la prioridad, la recurrencia y los demás marcadores de tarea. Son las mismas insignias que en la vista de lectura, con el mismo señalamiento para los datos vencidos y no válidos. Una tarjeta sin datos no lleva esa fila.

**Establecer y quitar la fecha.** El menú contextual de una tarjeta ofrece **Establecer fecha…** y, en cuanto la tarjeta lleva una fecha, **Quitar fecha**; un clic en la insignia de fecha también lleva a establecerla. Se elige en el selector de fecha de las tareas, con hora si se quiere y con la fecha existente ya indicada. La fecha se escribe en la línea de la tarjeta con la notación de tareas de la aplicación:

```markdown
- [ ] Enviar el presupuesto 📅 2026-10-02 14:00
```

Así aparece también en la vista de lectura y en las consultas de tareas. Cada vez que se establece o se quita es un paso de deshacer; si el documento cambia mientras el selector de fecha está abierto, la elección se descarta y la barra de estado lo dice.

**Presentación relativa.** Con el interruptor **Ver → Tablero Kanban → Mostrar fechas relativas**, las fechas de vencimiento, planificada y de inicio se leen a partir de hoy: «hoy», «mañana», «dentro de 3 días», «hace 2 días», en el idioma de la interfaz y con la hora añadida. La fecha exacta figura entonces en la información emergente de la insignia. Las fechas de creación, de finalización y de cancelación siguen siendo absolutas, porque registran cuándo ocurrió algo. El interruptor viene desactivado, vale para todos los tableros de todas las ventanas y no cambia nada en el documento.

**Fechas en la notación de la otra herramienta.** La herramienta de tableros de la que procede el formato escribe una fecha como `@{…}` y una hora como `@@{…}` en la línea de la tarjeta. El tablero lee ambas y las muestra como insignia de fecha con borde discontinuo; su información emergente indica el origen. **La primera vez que se edita la tarjeta, esa fecha se reescribe en la notación de tareas**, tanto al aplicar un texto de tarjeta modificado como al establecer o quitar la fecha. La primera línea pasa a ser la segunda:

```markdown
- [ ] Enviar el presupuesto @{2026-10-02} @@{14:00}
- [ ] Enviar el presupuesto 📅 2026-10-02 14:00
```

**Esto tiene un precio:** en la otra herramienta, la fecha reescrita aparece después solo como texto de la tarea y ya no como fecha de la tarjeta. Quien lleva un tablero en ambas herramientas debería saberlo antes de editar aquí una tarjeta así. Sin edición no se reescribe nada: abrir, cambiar el estado, mover y archivar dejan la línea como está. Una fecha de esta notación que no se puede leer —una fecha que no existe o una hora sin fecha— permanece en el texto de la tarjeta y aparece además como insignia no válida cuya información emergente indica el motivo. Un [valor de calendario](custom-calendars.md) de la aplicación con la misma forma entre llaves no es una fecha de este tipo y queda intacto.

## Etiquetas al pie de la tarjeta

En la tarjeta, las etiquetas figuran primero donde están escritas: en el texto de la tarjeta, renderizadas como en la vista de lectura. Con el interruptor **Ver → Tablero Kanban → Etiquetas al pie de la tarjeta** abandonan el texto mostrado y figuran reunidas en una fila propia al pie de la tarjeta, también las etiquetas de las líneas de continuación sangradas, cada una una sola vez y en el orden en que aparece. El interruptor viene desactivado, vale para todos los tableros de todas las ventanas y no cambia nada en el documento: las etiquetas permanecen en la línea en la que están.

Un clic en una etiqueta de la tarjeta —al pie o en el texto— filtra la barra lateral de etiquetas por ella, como en la vista de lectura; la selección y la edición de la tarjeta no se ven afectadas. Mientras se edita una tarjeta, su fila de etiquetas se oculta, porque la entrada muestra el texto en bruto con las etiquetas. Los dos interruptores de presentación solo pueden elegirse en la vista de tablero abierta.

## Límite por columna

Una columna puede llevar un **límite**: el número de tarjetas que debe contener como máximo. En el documento figura entre paréntesis al final del título de la columna, por ejemplo `## En curso (3)`; en el tablero no aparece en el título, sino en el contador: `2/3`.

Se establece y se cambia con **Establecer el límite…** en el menú contextual de la cabecera de columna. La entrada aparece en el lugar del contador y, como un título de columna, se aplica con `Intro` o un clic al lado y se descarta con `Esc`. Una entrada vacía o `0` quita el límite, igual que la entrada **Quitar el límite**, que el menú ofrece en cuanto hay uno establecido.

**El límite no bloquea.** Si la columna lleva más tarjetas de las previstas, su contador se resalta y su información emergente dice «límite superado»; aun así se pueden arrastrar tarjetas a ella y crearlas. El tablero muestra lo que hay y le deja a usted la decisión. Un `(0)` escrito a mano no cuenta como límite y sigue siendo parte del título.

## Archivo

**Archivar la tarjeta** en el menú contextual de una tarjeta, o el comando **Archivar tarjeta del tablero** para la tarjeta seleccionada, saca la tarjeta con sus líneas de continuación sangradas de su columna y la escribe al final de la **sección de archivo** del mismo documento. Delante de su texto se coloca una marca de tiempo con fecha y hora; su estado y sus demás datos quedan como están:

```markdown
***

## Archive

- [x] 2026-09-23 14:05 Recoger el requisito
```

Si falta la sección, se crea detrás de la última columna, con el encabezado que también escribe la otra herramienta en el idioma de la interfaz; una sección existente se continúa con su encabezado y su contenido.

**El archivo conserva las 100 tarjetas más recientes.** Si se añade una cuando está lleno, sale la más antigua; un archivo que otra herramienta dejó con más tarjetas se reduce a las 100 más recientes la primera vez que se archiva.

**Una tarjeta archivada no se puede recuperar en el tablero**, porque el archivo no aparece allí. Archivar es, sin embargo, exactamente un paso de deshacer, y en el documento la tarjeta sigue estando en texto plano. Después, la selección pasa, como al eliminar, a la siguiente tarjeta de la columna; sin tarjeta seleccionada, el comando no tiene efecto.

## Buscar y filtrar tarjetas

En la vista de tablero, el comando de búsqueda (`Ctrl+F` por omisión) abre un **campo de filtro** encima de las columnas en lugar de la búsqueda en el texto. Ya mientras se escribe, el tablero oculta toda tarjeta cuyo texto no contiene el término buscado; las columnas se mantienen, y su contador muestra las coincidencias y el total, por ejemplo `1/3`. Si ninguna tarjeta coincide, lo dice un aviso bajo el campo.

Se recorre el texto de la tarjeta y sus líneas de continuación sangradas, incluidas las etiquetas y las fechas que contienen; mayúsculas y minúsculas no importan. El término se busca como una sola secuencia de caracteres: `revisar el presupuesto` encuentra «Revisar el presupuesto», `presupuesto revisar` no. Es la misma regla que en el campo de filtro de la lista de tarjetas de un [lienzo](canvas.md).

**El documento queda sin cambios**, porque el filtro solo oculta; por eso actúa también en un documento no modificable. Una tarjeta oculta no sigue seleccionada, para que ninguna tecla actúe sobre una tarjeta que no se ve. El resalte de un límite superado se mantiene durante el filtro, porque cuenta todas las tarjetas de la columna.

`Esc` en el campo termina el filtro y vuelve a mostrar todas las tarjetas; lo mismo ocurre al cambiar a otra vista o a otro documento. Si el tablero se vuelve a dibujar entretanto, el texto buscado y el foco de entrada se conservan.

## Deshacer

`Ctrl+Z` retira la última acción sobre el tablero, `Ctrl+Y` y `Ctrl+Mayús+Z` la restablecen. Cada acción es exactamente un paso: una tarjeta creada, un texto modificado, un cambio de estado, un arrastre junto con el marcado, una columna eliminada con todas sus tarjetas, una fecha establecida o quitada, un límite cambiado, una tarjeta archivada. Mientras esté abierta la entrada de una tarjeta o de un título de columna, `Ctrl+Z` se aplica al texto escrito allí.

Si el documento cambia entretanto en otro sitio —porque el mismo documento se está editando al lado, por ejemplo—, la acción empezada se descarta en lugar de escribirse a ciegas; la barra de estado lo dice y el tablero se dibuja de nuevo.

## Solo mirar

El tablero sigue la modificabilidad de su documento. Mientras el documento esté en simple visualización, sin el modo de edición activado, el tablero es **solo de consulta**: sin botones, sin arrastre, sin entrada de texto, sin casilla pulsable, y el menú contextual queda sin entradas. El camino por la paleta de comandos y el menú tampoco lo rodea; el fallo se dice en la barra de estado y no se calla. Mirar, seleccionar, desplazarse y filtrar las tarjetas siguen permitidos, porque no tocan el documento; también los dos interruptores de presentación. La insignia de fecha es aquí solo indicación.

El modo de edición libera el manejo: el lápiz de la barra de estado, `Ctrl+E` por omisión; los detalles los describe la página [Vistas y presentación](views-display.md).

## Tablero y consulta de tareas

El tablero y la [consulta de tareas](tasks.md) muestran ambos tareas y significan cosas distintas:

| Pregunta | Consulta de tareas | Tablero Kanban |
| -------- | ------------------ | -------------- |
| ¿De dónde vienen las líneas? | de **todos** los archivos del ámbito de búsqueda | de **un** documento |
| ¿De dónde viene el orden? | del filtro, la ordenación y la agrupación de la consulta | del lugar en el que la línea está en el documento |
| ¿Qué produce reordenar? | nada: la consulta vuelve a calcular | la línea se mueve dentro del documento |
| ¿Cuál es el resultado? | una vista sobre sus archivos | una superficie de trabajo con un orden propio |

En resumen: la consulta **recoge** a lo largo de sus archivos y ordena según reglas; el tablero **ordena** a mano las líneas de un documento y recuerda ese orden, porque está en el texto. Ambos no se excluyen: las tareas de un tablero aparecen en una consulta como cualquier otra línea de tarea.

## El formato de almacenamiento

Un tablero está en texto plano dentro de su documento. Por eso es legible también sin esta aplicación, y quien abre el archivo en una herramienta de texto ve una lista de tareas corriente por columna.

### Estructura

| Parte | Cómo consta en el documento |
| ----- | --------------------------- |
| Marca | la clave `kanban-plugin` en el encabezado |
| Columna | un **encabezado** con el título de la columna |
| Ajuste de hecho | justo debajo del encabezado, una línea formada por nada más que un **grupo de palabras en negrita** |
| Límite | un número entre paréntesis al final del encabezado, por ejemplo `## En curso (3)` |
| Tarjeta | una **línea de tarea** bajo ese encabezado |
| Fecha de una tarjeta | el marcador de vencimiento `📅` con una fecha y, si se quiere, una hora en la línea de tarea |
| Añadido de una tarjeta | las líneas **sangradas** justo debajo de su línea de tarea |
| Archivo | todo lo que sigue a una línea de separación de tres asteriscos: un encabezado y, debajo, las tarjetas archivadas con marca de tiempo |
| Ajustes | un comentario privado entre marcadores `%%` al final del archivo |

Un ejemplo:

```markdown
---
kanban-plugin: board
---

## Por hacer

- [ ] Revisar el presupuesto #compras
  La consulta a compras sigue abierta
- [ ] Confirmar la cita 📅 2026-10-02 14:00


## En curso (2)

- [/] Redactar el capítulo del manual


## Hecho

**Complete**

- [x] Recoger el requisito


***

## Archive

- [x] 2026-09-01 09:15 Esbozar la plantilla
```

**El nivel del encabezado no está fijado.** Se escriben dos almohadillas; se lee cualquier nivel, y una columna recién creada asume el nivel de la primera columna existente. Un tablero escrito a mano no se rechaza por ello.

**La marca de hecho es el propio texto en negrita**, no una palabra concreta: se reconoce por su forma y se conserva en la grafía que consta en el archivo. Cuando la aplicación crea ella misma una columna así, escribe primero el texto que ya aparece en ese tablero y, si no lo hay, el texto del idioma de interfaz elegido.

**Las líneas vacías forman parte de la forma:** una línea vacía bajo el encabezado o bajo la marca de hecho, dos antes del siguiente encabezado. Una columna vacía sin marca lleva por tanto tres líneas vacías seguidas.

**El archivo** está detrás de la última columna y empieza con la línea de separación; se reconoce por ella, no por el texto de su encabezado. Cada tarjeta archivada lleva delante de su texto una marca de tiempo con la forma `AAAA-MM-DD HH:mm`.

### Lo que queda intacto

**La sección de archivo y el bloque de ajustes no se muestran en el tablero.** El bloque de ajustes nunca se modifica, la sección de archivo solo al archivar una tarjeta; por lo demás, ambos permanecen tal cual en el archivo, y quien abre un tablero y lo vuelve a cerrar sin cambios recupera exactamente el mismo archivo, incluidos los fines de línea, un salto final ausente y todas las indicaciones que esta aplicación no conoce.

Una excepción con buen motivo: si el bloque de ajustes contiene la lista de qué columnas están plegadas, esa lista se ajusta al crear, eliminar y mover una columna. Si se quedara como estaba, la otra herramienta habría plegado después las columnas equivocadas. Todo lo demás del bloque permanece carácter por carácter como estaba.

Solo se escribe el rango de líneas que realmente cambia, nunca el documento entero. El cursor y los plegados del editor se mantienen así en su sitio.

## Compatibilidad con otras herramientas

El formato procede de una herramienta de tableros muy extendida para notas en Markdown, y la compatibilidad con ella es una promesa explícita: un tablero escrito allí se puede abrir y editar aquí, y un tablero editado aquí se puede seguir usando allí.

**Lo que se lee y se conserva:**

- la marca de encabezado con su valor, sea cual sea,
- columnas, tarjetas y sus líneas de continuación sangradas,
- el límite en el título de la columna, también en la notación sin espacio antes del paréntesis,
- fechas y horas en la notación de la otra herramienta, hasta la primera edición de su tarjeta (véase abajo),
- la marca de hecho en **su** idioma, aunque no sea el de la interfaz,
- la sección de archivo tras la línea de separación, con su encabezado y sus tarjetas,
- el bloque de ajustes al final del archivo con todas sus indicaciones, también las desconocidas,
- todo lo demás que conste en el archivo: viaja sin cambios.

**Lo que cambia al editar:** una fecha en la notación de la otra herramienta se reescribe en la notación de tareas de la aplicación la primera vez que se edita su tarjeta (véase «Datos en la tarjeta»). **En la otra herramienta aparece después solo como texto** y ya no como fecha de la tarjeta. Todos los demás datos de una tarea —marcadores de fecha, prioridad, recurrencia, etiquetas— permanecen en su línea y siguen actuando en todo lo demás, en la vista de lectura y en las consultas de tareas.

**Lo que aquí ocurre de otro modo:** el archivado pone siempre una marca de tiempo y mantiene el archivo en 100 tarjetas; la otra herramienta hace ambas cosas solo si está configurada así. Las indicaciones de su bloque de ajustes, como otro formato de fecha u otro límite de archivo, no las evalúa el tablero.

## Límites

- **Un documento lleva un tablero.** Varios tableros en un archivo no existen; las columnas del documento son las columnas del único tablero.
- **Solo se convierte un documento vacío.** Un documento con contenido no se declara tablero, porque se perdería texto; quien quiera trasladar una lista existente crea un tablero y lleva el texto él mismo.
- **Se mueve con el ratón.** No hay un gesto de teclado para mover tarjetas y columnas.
- **Una tarjeta lleva una línea.** Lo que se edita es el texto de la línea de tarea; sus líneas de continuación sangradas aparecen en la tarjeta, pero se modifican en el documento y no en ella.
- **Se lee la notación predeterminada de la otra herramienta:** una fecha con la forma `@{AAAA-MM-DD}` y una hora con la forma `@@{HH:mm}`, en cada caso la primera aparición en la línea de la tarjeta. Un formato configurado de otro modo, una segunda aparición y la forma de enlace `@[[…]]` quedan como texto.
- **En el tablero no hay camino de vuelta desde el archivo.** Las tarjetas archivadas no aparecen allí y solo se recuperan en el propio documento; el archivo conserva un número fijo de las 100 tarjetas más recientes.
- **No hay ajustes por tablero.** Los dos interruptores de presentación valen para todos los tableros; el bloque de ajustes se lee y se conserva, pero sus indicaciones no actúan en el tablero.
- **Una tarjeta no es una nota.** De una tarjeta no nace una nota propia, la tarjeta no muestra campos ni imágenes de una nota enlazada, y una fecha en la tarjeta no abre una nota diaria.
- **Una columna sin encabezado no existe.** Las líneas de tarea que están antes del primer encabezado no pertenecen a ninguna columna y por eso no aparecen en el tablero; en el documento permanecen donde están.
