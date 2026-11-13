# Workflows

Un **workflow** deja por escrito gestiones recurrentes como una secuencia fija de pasos: crear, renombrar, mover, copiar y mover a la papelera archivos y carpetas, añadir o insertar texto, establecer propiedades y etiquetas en la cabecera, marcar tareas como hechas, ejecutar comandos, macros y otros workflows. Las condiciones y las repeticiones deciden qué pasos se ejecutan y para qué archivos; un paso de script calcula un valor sin escribir nada. Los comandos de base de datos crean, cambian y eliminan registros, escriben el resultado de una consulta en un archivo, abren formularios y comprueban la coherencia. Un workflow es un **archivo Markdown corriente**; lo que hace figura en un bloque de comandos fijos, una línea por paso. Así el archivo sigue siendo legible sin la aplicación, se puede compartir y se edita como cualquier otro documento.

Un workflow se inicia **a mano**: desde el menú, la paleta de comandos, con un atajo de teclado, un botón sobre el bloque o el menú contextual del panel del área. Un workflow con programación se ejecuta además **según su programación**, y un workflow con evento **ante un evento** del área, por ejemplo un archivo nuevo en una carpeta, en ambos casos en cuanto está activado. **Antes de que se ejecute el primer paso, la aplicación comprueba todo el workflow**; un error aparece sobre el bloque con la línea y el motivo, y no se ejecuta nada.

## La extensión «Workflows»

La función forma parte de las [extensiones integradas](extensions.md) («Workflows», grupo **Herramientas**) y está activada en el modo de trabajo **Completo** y desactivada en los modos **Principiante** y **Avanzado**. Desactivada, un bloque `workflow` es un bloque de código corriente sin resaltado, sin indicación de comprobación y sin botones; no hay comandos de los workflows, ni submenú **Workflows**, ni página **Ejecuciones de workflows**, ni elemento **Workflows** en la barra de estado, ni secciones de configuración **Workflows**, ni ejecución según la programación, ni ejecución ante eventos. Un archivo de workflow es entonces un documento corriente. No se pierde nada: los archivos, los estados de ejecución con su estado de activación y la carpeta de workflows definida siguen intactos al volver a activarla.

## Estructura de un archivo de workflow

Un archivo es un workflow si su cabecera lleva la marca `workflow: true`. Lo que hace el workflow figura en **exactamente un** bloque de código con el lenguaje `workflow`. El resto del texto es la descripción para las personas; sus secciones pueden servir de fuente de un contenido (sección «Fuentes de un contenido» más abajo).

````markdown
---
workflow: true
name: Repaso semanal
description: Crea el repaso de la semana y lo anota en el registro.
---

# Repaso semanal

```workflow
# Crear el repaso a partir de la plantilla y abrirlo
create "Repasos/{{date}} Semana.md" from-template "Repaso.md"
open "Repasos/{{date}} Semana.md"
insert "Registro.md" under "Repasos" from-section "Entrada"
notify "Repaso creado"
```

## Entrada

- Repaso semanal creado.
````

La cabecera lleva marca, nombre, disparador, descripción y, según el disparador, la programación o el evento:

| Clave | Obligatoria | Significado |
| --- | --- | --- |
| `workflow` | sí | `true` marca el archivo como workflow. |
| `name` | no | Nombre del workflow en el menú, la paleta de comandos y los avisos; sin indicación vale el nombre del archivo sin extensión. |
| `trigger` | no | Disparador: `manual` para el inicio a mano, `schedule` para la ejecución según la programación, `event` para la ejecución ante un evento; sin indicación vale `manual`. |
| `schedule` | con `trigger: schedule` | Programación en una línea, por ejemplo `every weekday at 08:00` (sección «Programación y activación»). |
| `missed` | no | Tratamiento de las ejecuciones perdidas: `run-once` recupera una vez, `skip` las deja caducar; sin indicación vale `run-once`. |
| `event` | con `trigger: event` | Evento en una línea, por ejemplo `file-created in "Entrada"` (sección «Eventos»). |
| `description` | no | Descripción breve; la página **Ejecuciones de workflows** la muestra como información emergente en el nombre. |

Un disparador distinto de `manual`, `schedule` o `event` se muestra como «todavía no compatible», y el workflow no se ejecuta; el archivo queda sin cambios. Un archivo con dos o más bloques `workflow`, o con ninguno, tampoco se ejecuta. Un bloque que solo contiene comentarios es válido y no hace nada.

## Líneas de comando

Las líneas del bloque siguen una forma fija:

- **Una línea es un comando.** Las líneas vacías y las que empiezan por `#` son comentarios. No hay comentario detrás de un comando ni continuación en varias líneas.
- **Primero la palabra clave, después los datos**, separados por espacios. Las palabras clave son inglesas y se escriben en minúscula: `create`, no `Create`.
- **Rutas y textos** van entre comillas dobles rectas. Una comilla dentro del texto se escribe `\"`; cualquier otra barra invertida se queda como está. Las comillas tipográficas, como las que inserta un procesador de textos al copiar, cuentan como error.
- **Números e identificadores de comando** van sin comillas: `wait 2`, `command view.modeSplit`.
- **Las opciones con nombre** son un par de opción y valor, como `from-template "Día.md"` o `under "Registro"`, o una sola palabra como `at-start`. Siguen a los demás datos en cualquier orden, como máximo una de cada tipo.
- **Las rutas** son relativas a la raíz del área en la que se inicia el workflow; el separador es la barra `/`. No se permiten rutas absolutas ni rutas con `..`. La ruta detrás de `from-template` nombra una plantilla y es relativa a la [carpeta de plantillas](templates.md).

```workflow
# Comentario: crear la carpeta de un proyecto nuevo
mkdir "Proyectos/{{prompt:¿Nombre del proyecto?}}/Notas"
replace "{{file}}" "Estado: abierto" "Estado: \"en curso\""
insert "{{file}}" at-start from-file "Bloques/Cabecera.md"
```

## Comprobar antes de ejecutar

Antes del primer paso, la aplicación comprueba todo el archivo, junto con cada workflow al que llama. Señala, entre otras cosas:

- comandos desconocidos y comandos de una etapa posterior,
- datos que faltan, sobran o están mal escritos, opciones desconocidas o duplicadas,
- rutas fuera del área, rutas y textos vacíos, nombres nuevos no válidos,
- una espera de más de diez segundos,
- comandos, macros y workflows desconocidos, así como nombres que llevan varias macros o varios workflows,
- un workflow que se llama a sí mismo, también a través de otro, y un anidamiento de más de cinco niveles,
- marcadores de posición erróneos, plantillas ilegibles y plantillas desactivadas,
- una programación ilegible, una hora que falta o no está permitida, `schedule` sin `trigger: schedule` y a la inversa, así como un valor desconocido en `missed`,
- una línea de evento ilegible, un evento desconocido, una carpeta fuera del área, un patrón no válido, `event` sin `trigger: event` y a la inversa, más de una línea `event` y un marcador que el evento no proporciona,
- un `end` que falta o sobra, un `else` sin condición o un segundo `else`, bloques de más de tres niveles, un bucle dentro de un bucle, un patrón no válido en `for-each` y `{{item}}` fuera de un bucle,
- en el paso de script, una sección que falta, aparece varias veces o no contiene script, un nombre no válido o repetido, un resultado que solo proporciona una línea posterior, y bloques de script desactivados.

Un hallazgo detiene la ejecución **antes del primer paso**; un archivo de workflow erróneo no se ejecuta en absoluto en lugar de ejecutarse en parte. La comprobación señala todos los hallazgos a la vez; la línea indicada es la línea en el documento tal como la cuenta el editor, cabecera incluida. La única excepción es el hallazgo «Solo manual» (secciones «Programación y activación» y «Eventos»): impide únicamente la activación, y el inicio a mano sigue siendo posible.

Lo que solo un paso anterior puede producir lo comprueba la aplicación en el propio paso: si existe un archivo, una sección o un encabezado. Si falta en ese momento, el paso falla.

## Comandos

Los comandos, ordenados según su objeto. Las rutas son relativas a la raíz del área.

### Archivos y carpetas

| Comando | Significado | Datos | Ejemplo |
| --- | --- | --- | --- |
| `create` | crear un archivo, vacío o con contenido | ruta; opcionalmente una fuente | `create "Diario/{{date}}.md" from-template "Día.md"` |
| `rename` | renombrar un archivo o una carpeta | ruta, nombre nuevo | `rename "Borrador.md" "Nota {{date}}.md"` |
| `move` | mover un archivo o una carpeta a una carpeta; los enlaces se actualizan | ruta, carpeta de destino | `move "{{file}}" "Archivo/2026"` |
| `copy` | copiar un archivo | ruta, destino | `copy "Modelos/Lista.md" "Proyectos/Nuevo/Lista.md"` |
| `mkdir` | crear una carpeta, también anidada | ruta | `mkdir "Proyectos/Nuevo/Notas"` |
| `open` | abrir un archivo en la ventana o cambiar a él | ruta | `open "Diario/{{date}}.md"` |
| `close` | cerrar un documento abierto | ruta | `close "{{file}}"` |

- **Destino existente:** si el destino de `create`, `copy`, `rename` o `move` ya existe, el paso falla; no se sobrescribe nada.
- **Carpeta de destino que falta:** `create`, `copy` y `move` la crean dentro del área.
- **Mover y renombrar** siguen el mismo camino que en el panel del área: los enlaces al archivo se actualizan, las subpáginas y el archivo acompañante se mueven con él.
- `mkdir` sobre una carpeta existente y `close` sobre un documento no abierto tienen éxito sin cambiar nada. `close` sobre un documento sin guardar muestra la pregunta de guardado habitual; «Cancelar» termina la ejecución en esa línea.

### Contenido y cabecera

| Comando | Significado | Datos | Ejemplo |
| --- | --- | --- | --- |
| `append` | poner un contenido al final de un archivo | ruta, fuente | `append "{{file}}" from-section "Puntos abiertos"` |
| `insert` | insertar un contenido bajo un encabezado o al principio | ruta, lugar (`under "Encabezado"` o `at-start`), fuente | `insert "{{file}}" under "Registro" from-section "Entrada"` |
| `replace` | sustituir cada aparición de un texto | ruta, texto buscado, sustituto | `replace "{{file}}" "PROYECTO" "{{prompt:¿Nombre del proyecto?}}"` |
| `set-property` | establecer o cambiar una propiedad en la cabecera | ruta, nombre, valor | `set-property "{{file}}" estado "hecho"` |
| `remove-property` | quitar una propiedad de la cabecera | ruta, nombre | `remove-property "{{file}}" borrador` |

- `insert … under` inserta directamente bajo el encabezado, antes de su contenido anterior; `insert … at-start` inserta al principio del texto, detrás de la cabecera. Si el encabezado falta o aparece varias veces, el paso falla.
- `replace` sustituye cada aparición, como «Reemplazar todo» en el editor; si no encuentra ninguna, el paso falla.
- `set-property` y `remove-property` dejan las demás propiedades en su orden. `remove-property` sobre una propiedad que no existe tiene éxito sin cambios.
- **Archivos abiertos:** si el archivo de destino está abierto en una ventana y sin guardar, el cambio va a esa ventana y aparece allí como cambio en el editor; el trabajo sin guardar se conserva. Si no, el archivo se escribe directamente.

### Aplicación y desarrollo

| Comando | Significado | Datos | Ejemplo |
| --- | --- | --- | --- |
| `command` | ejecutar un comando de la aplicación | identificador de comando | `command view.modeSplit` |
| `macro` | ejecutar una macro de la configuración | nombre de la macro | `macro "Inicio del día"` |
| `workflow` | ejecutar otro workflow de la carpeta de workflows | nombre del workflow | `workflow "Crear carpetas"` |
| `wait` | pausa en segundos, como máximo 10 | número | `wait 2` |
| `notify` | mostrar un texto como aviso | texto | `notify "Repaso semanal creado"` |
| `stop` | terminar la ejecución con un texto | texto | `stop "Nada que hacer"` |

- `command` toma el identificador fijo de un comando, como `view.modeSplit`, `view.modeLive` o `file.save`, y lo ejecuta en la ventana de inicio. Si en ese momento no se puede ejecutar, el paso falla. Las macros y los workflows no se ejecutan con `command`, sino con sus propios comandos.
- `macro` y `workflow` pueden anidarse como máximo cinco niveles. Un workflow llamado vuelve tras su último paso; si en él falla un paso, termina toda la ejecución.
- `notify` muestra su texto en la barra de estado y, en una ejecución programada o por un evento, además como notificación del sistema operativo (sección «Desarrollo de una ejecución»).
- `stop` termina toda la ejecución, también desde un workflow llamado; la barra de estado muestra «Workflow ‹Nombre› detenido en la línea N: texto».

### Comandos de mantenimiento

| Comando | Significado | Datos | Ejemplo |
| --- | --- | --- | --- |
| `delete` | borrar: mover un archivo o una carpeta a la papelera | ruta | `delete "Borradores/Viejo.md"` |
| `add-tag` | añadir una etiqueta a la lista `tags` de la cabecera | ruta, etiqueta | `add-tag "{{file}}" "hecho"` |
| `remove-tag` | quitar una etiqueta de la lista `tags` de la cabecera | ruta, etiqueta | `remove-tag "{{file}}" "borrador"` |
| `complete-task` | marcar como hecha la primera tarea abierta que contiene el texto buscado | ruta, texto buscado | `complete-task "Proyectos/Plan.md" "Enviar oferta"` |
| `confirm` | hacer una pregunta con «Sí» y «No» | pregunta | `confirm "¿Archivar todos los borradores?"` |

- **`delete`** mueve el destino a la papelera, como el borrado en el panel del área; una carpeta va entera. Con un archivo van su archivo acompañante (`.mdd`) con el estado de ejecución y sus registros de cambios (`.mddl`). La raíz del área no se puede borrar. Un destino borrado se recupera de la papelera.
- **Una confirmación por ejecución:** si una ejecución contiene `delete`, **una** confirmación antes del primer paso nombra todos los destinos de la ejecución con su ruta, también los de los workflows llamados; «No» no deja ejecutar ningún paso, y la ejecución cuenta como entrada cancelada. Si un destino está abierto en esta ventana, se cierra antes del paso; con cambios sin guardar aparece la pregunta de guardado habitual, y «Cancelar» termina la ejecución en esa línea.
- **`add-tag` y `remove-tag`** solo cambian la lista `tags` de la cabecera; una etiqueta ya presente o ausente no es un error. Una `#` inicial se omite, y las mayúsculas y minúsculas no cuentan en la comparación; una etiqueta vacía o con espacios no es válida. Si `remove-tag` quita la última etiqueta, queda la lista vacía `tags: []`. Las etiquetas del texto (`#etiqueta`) no se tocan; para ellas está `replace`.
- **`complete-task`** busca entre las tareas abiertas del archivo, las mismas que muestra la [consulta de tareas](tasks.md), la primera cuyo texto contiene el texto buscado, distinguiendo mayúsculas y minúsculas. La marca como hecha igual que un clic en la consulta de tareas, con la fecha de finalización según la configuración de las tareas. Si no encuentra ninguna, el paso falla.
- **`confirm`** muestra la pregunta con «Sí» y «No». «Sí» continúa la ejecución; «No» la termina sin fallo, y la barra de estado muestra «Workflow ‹Nombre› detenido en la línea N: «pregunta» respondida con No».
- **Archivos abiertos:** sobre un archivo abierto y sin guardar en una ventana, `add-tag`, `remove-tag` y `complete-task` actúan a través de esa ventana, como los comandos de contenido.
- `delete` y `confirm` necesitan a alguien presente: en un workflow con `trigger: schedule` o `trigger: event` son el hallazgo «Solo manual».

### Condiciones, repeticiones y scripts

Estos comandos abren un **bloque** que cierra una línea `end`; los pasos intermedios solo se ejecutan si la condición se cumple, o una vez por archivo. `script` es un paso suelto. Detalles en las secciones «Condiciones y repeticiones» y «Paso de script».

| Comando | Significado | Datos | Ejemplo |
| --- | --- | --- | --- |
| `if-exists` | si existe: bloque solo si el archivo o la carpeta existe | ruta | `if-exists "Registro.md"` |
| `if-missing` | si falta: bloque solo si el archivo o la carpeta falta | ruta | `if-missing "Diario/{{date}}.md"` |
| `if-property` | si propiedad: bloque solo si la propiedad de la cabecera tiene el valor o, sin valor, está establecida | ruta, nombre, valor opcional | `if-property "{{file}}" status "abierto"` |
| `if-script` | si script: bloque solo si el script de una sección se cumple | título | `if-script "Recuento"` |
| `else` | si no: inicia la parte que vale si la condición no se cumple | ninguno | `else` |
| `end` | fin: cierra el bloque de una condición o de un bucle | ninguno | `end` |
| `for-each` | para cada: bloque una vez por archivo que coincide con el patrón | carpeta con patrón de archivo | `for-each "Entrada/*.md"` |
| `script` | script: ejecutar el bloque de script de una sección y nombrar su resultado | título, `as "nombre"` | `script "Recuento" as "cantidad"` |

### Base de datos

Estos comandos trabajan con los registros de la [base de datos](database.md) del área. Detalles en la sección «Comandos de base de datos».

| Comando | Significado | Datos | Ejemplo |
| --- | --- | --- | --- |
| `db-create` | crear un registro | tabla, pares `campo="valor"`, opcionalmente `as "nombre"` | `db-create "Library" title="The Invincible" author="Stanisław Lem" pages="186"` |
| `db-update` | cambiar un registro | tabla, registro, pares `campo="valor"` | `db-update "Library" "Solaris" loanNote="prestado"` |
| `db-delete` | eliminar un registro | tabla, registro | `db-delete "Library" "r-00024"` |
| `db-query` | consulta a un archivo: escribir el resultado de un archivo de consulta como tabla | archivo de consulta, `into "destino"`, opcionalmente `under "encabezado"` | `db-query "Long Books.md" into "Lista de lectura.md" under "Libros largos"` |
| `db-for-each` | para cada registro: el bloque una vez por registro de un archivo de consulta | archivo de consulta | `db-for-each "Long Books.md"` |
| `db-open` | abrir un formulario: mostrar un registro en su formulario predeterminado o, sin registro, empezar uno nuevo | tabla, opcionalmente registro | `db-open "Library" "Solaris"` |
| `db-open-list` | abrir un formulario de lista: abrir un archivo de consulta | archivo de consulta | `db-open-list "Loans List.md"` |
| `db-check` | comprobar la coherencia: todas las tablas o una | opcionalmente tabla | `db-check "Library"` |

### Fuentes de un contenido

`create`, `append` e `insert` toman su contenido de una de tres fuentes. Un contenido nunca figura como texto libre en la línea de comando.

| Opción | Contenido |
| --- | --- |
| `from-template "ruta"` | una plantilla de la carpeta de plantillas, rellenada como al aplicar una plantilla; sus diálogos de entrada aparecen antes del primer paso |
| `from-file "ruta"` | el contenido de otro archivo del área, literal, tal como está en el paso |
| `from-section "Encabezado"` | el contenido de una sección del propio archivo de workflow, literal |

Una sección es el texto bajo su encabezado hasta el siguiente encabezado del mismo nivel o superior, sin el encabezado mismo; las subsecciones forman parte de ella. Se encuentra como con un enlace `[[Archivo#Encabezado]]`. `from-file` y `from-section` copian de forma literal: los marcadores de posición que contienen se quedan como están. Solo una plantilla se rellena. Si la extensión «Plantillas» está desactivada, la comprobación señala «Las plantillas están desactivadas» para `from-template`; los workflows sin plantillas siguen ejecutándose.

## Marcadores de posición

Los marcadores de posición valen en cada dato de una línea de comando. Plantillas y workflows comparten el mismo conjunto; la escritura con desplazamiento y formato se describe en la página [Plantillas](templates.md).

| Marcador | Valor en una línea de comando |
| --- | --- |
| `{{date}}`, `{{time}}` | fecha y hora del inicio, también con desplazamiento y formato: `{{date:+7d:dd.MM.yyyy}}` |
| `{{file}}` | ruta del documento activo al iniciar, relativa a la raíz del área, por ejemplo `Proyectos/Plan.md`; en una ejecución por un evento, el archivo del evento (sección «Eventos») |
| `{{title}}` | título del documento activo al iniciar |
| `{{folder}}` | carpeta del documento activo al iniciar, relativa a la raíz del área |
| `{{area}}` | nombre del área |
| `{{clipboard}}` | texto del portapapeles al iniciar; en una ejecución programada o por un evento, lo que haya en ese momento en el portapapeles |
| `{{prompt:Pregunta}}`, `{{prompt:Pregunta:Valor}}` | diálogo de entrada |
| `{{select:Pregunta:a,b,c}}` | diálogo de selección |
| `{{from}}` | con `file-moved`, la ruta anterior del archivo |
| `{{task}}` | con `task-done`, el texto de la tarea completada |
| `{{item}}`, `{{item:name}}` | en un bucle `for-each`, la ruta del archivo de cada vuelta y su nombre sin extensión |
| `{{script:name}}` | el resultado del paso de script `script … as "name"` |
| `{{record:campo}}`, `{{record:id}}`, `{{record:table}}`, `{{record:file}}` | en un bucle `db-for-each`, un campo del registro actual, su identificador, su tabla y su archivo (sección «Comandos de base de datos») |
| `{{created:nombre}}` | el identificador del registro que ha creado `db-create … as "nombre"` |
| `{{db:Tabla:Registro:Campo}}` | el valor de un campo de la base de datos, leído en el propio paso |

- **Todos los diálogos antes del primer paso:** los diálogos de entrada y de selección de toda la ejecución aparecen uno tras otro antes de que ocurra nada, incluidos los de las plantillas usadas y los de los workflows llamados. Una misma pregunta se hace una vez y vale en todas partes. Cancelar un diálogo cancela la ejecución, y no se ejecuta ningún paso.
- **Un instante por ejecución:** `{{date}}` y `{{time}}` tienen el mismo valor en todas las líneas, también al pasar la medianoche. Del mismo modo, el portapapeles se lee una sola vez al iniciar, y `{{clipboard}}` tiene el mismo contenido en todas las líneas.
- **En una plantilla usada por un workflow**, `{{title}}` y `{{folder}}` designan como siempre el archivo nuevo, mientras que `{{file}}` y `{{area}}` designan el documento activo y el área.
- **Según la programación y ante eventos** no hay nadie que responda a un diálogo: en un workflow con `trigger: schedule` o `trigger: event`, los marcadores de entrada y de selección son el hallazgo «Solo manual».
- `{{item}}`, `{{item:name}}`, `{{script:name}}`, `{{record:…}}`, `{{created:…}}` y `{{db:…}}` solo reciben su valor durante la ejecución; en el nombre de un workflow o de una macro, en la ruta de una plantilla y en el destino de `delete` son por eso un hallazgo.
- `{{record:…}}`, `{{created:…}}` y `{{db:…}}` solo valen en las líneas de comando. En una plantilla, también en una que inserta un workflow, se quedan como texto.
- `{{cursor}}` no se permite en una línea de comando. `\{{` escribe un `{{` literal.
- Si `{{folder}}` queda vacío en la carpeta raíz, `"{{folder}}/Nuevo.md"` da la ruta `Nuevo.md`. Sin documento activo, `{{file}}` está vacío, y una ruta formada con él es un hallazgo.

## Iniciar un workflow

Un workflow solo se inicia en un área abierta, y sus rutas valen en esa área, aunque el archivo proceda de la carpeta de workflows de toda la aplicación o de un área vinculada. Las vías a mano:

| Vía | Efecto |
| --- | --- |
| **Archivo → Workflows** | cada workflow de la carpeta de workflows como entrada, las subcarpetas como submenús |
| **Paleta de comandos** (`Ctrl+K` por omisión) | cada workflow de la carpeta de workflows como comando con su nombre |
| **Barra de estado y menú contextual** | el comando de un workflow, colocado mediante la [colocación de comandos](command-placement.md) |
| **Atajo de teclado** | asignado al comando de un workflow en «Configuración → Atajos de teclado» |
| **Botón «Iniciar» sobre el bloque** | en el modo en vivo, la vista renderizada y la vista dividida, a la derecha en la línea de cabecera del bloque; inicia cualquier archivo de workflow, también fuera de la carpeta de workflows, con el estado del editor |
| **«Iniciar» en el panel del área** | en lo más alto del menú contextual de cada archivo de workflow del área |
| **Página «Ejecuciones de workflows»** | botón «Iniciar» en la fila de cada workflow |

El botón sobre el bloque está desactivado mientras la comprobación señale un hallazgo. En un documento que nunca se ha guardado muestra «Guarde primero», fuera de un área «Solo se puede iniciar dentro de un área abierta». Un workflow activado se ejecuta además por sí solo según su programación o ante su evento; el inicio a mano sigue siendo posible en cualquier momento.

El comando de un workflow recibe su identificador de la ruta del archivo en la carpeta de workflows; así, dos workflows del mismo nombre en subcarpetas distintas siguen distinguiéndose. **Renombrar un workflow en la aplicación o moverlo dentro de la carpeta de workflows conserva sus asignaciones:** un atajo de teclado, un sitio en la barra de estado, el menú contextual o la barra de formato y un paso de macro que lo llama se trasladan con él. **Fuera de la aplicación**, por ejemplo en el gestor de archivos, la aplicación no advierte el cambio de nombre; las asignaciones pierden entonces su destino y deben asignarse de nuevo. Un workflow movido fuera de la carpeta de workflows deja de ser un comando; sus asignaciones quedan guardadas y vuelven a funcionar en cuanto regresa al mismo lugar.

## Desarrollo de una ejecución

1. La aplicación comprueba el workflow junto con los workflows a los que llama.
2. Los diálogos de todos los marcadores aparecen uno tras otro; si la ejecución contiene `delete` o `db-delete`, sigue la confirmación única de los destinos que se borrarán.
3. Los pasos se ejecutan estrictamente uno tras otro; cada uno espera al anterior. Las condiciones y los bucles deciden qué pasos se ejecutan y cuántas veces.
4. El primer fallo termina la ejecución. La barra de estado muestra «Workflow ‹Nombre› cancelado en la línea N: motivo».

Los pasos ejecutados quedan ejecutados; no hay forma de deshacer una ejecución (sección «Lo que ha hecho una ejecución»). **En cada ventana se ejecuta como máximo un workflow**; un segundo inicio durante una ejecución se rechaza con un aviso.

**Mensajes:** en un inicio a mano, `notify` muestra su texto en la barra de estado. En una ejecución programada, también si es recuperada, y en una ejecución por un evento, el texto sale además como **notificación del sistema operativo**, con el nombre del workflow como título; lo mismo la cancelación de una ejecución así con línea y motivo, aunque el workflow no contenga `notify`. La notificación solo aparece si ninguna ventana de la aplicación está en primer plano, y una vez por mensaje; si no, basta el aviso de la barra de estado. Si el sistema operativo la muestra y cómo lo hace depende de sus propios ajustes de notificaciones.

## Condiciones y repeticiones

Una **condición** solo deja ejecutar pasos si algo se cumple; un **bucle** repite pasos para cada archivo de una carpeta. Ambos abren un bloque que cierra una línea `end`:

```workflow
# Crear la nota del día solo si falta
if-missing "Diario/{{date}}.md"
  create "Diario/{{date}}.md"
else
  notify "La nota del día ya existe"
end
open "Diario/{{date}}.md"
```

### Condiciones

- `if-exists "ruta"` se cumple si el archivo o la carpeta existe, `if-missing "ruta"` si falta.
- `if-property "ruta" nombre "valor"` se cumple si la propiedad de la cabecera tiene exactamente ese valor; los números y los valores lógicos se comparan por su escritura. En una **lista** como `tags`, se cumple si la lista contiene el valor. Sin valor (`if-property "ruta" nombre`), se cumple si la propiedad está establecida y no está vacía, en una lista si la lista no está vacía. Un archivo sin cabecera no la cumple; si el archivo falta, el paso falla.
- `if-script "sección"` se cumple si el script de la sección se cumple (sección «Paso de script»).
- La comprobación se hace al llegar a la línea, con el estado que han dejado los pasos anteriores; un archivo abierto y sin guardar cuenta con su estado en el editor.

### La forma de bloque

- `else` inicia opcionalmente la parte que vale si la condición no se cumple; cada condición tiene como máximo un `else`, un bucle ninguno.
- `end` cierra el último bloque abierto. `else` y `end` van cada uno en su propia línea.
- **La sangría** está permitida y se recomienda para que el bloque siga siendo legible; no tiene ningún significado.
- Los bloques se pueden anidar hasta **tres niveles**, incluido el bucle.
- Un `end` que falta o sobra, un `else` sin condición y un anidamiento demasiado profundo los señala la comprobación antes del primer paso, con la línea.

### Bucle sobre los archivos de una carpeta

`for-each "carpeta/patrón"` repite los pasos hasta `end` para cada archivo que coincide con el patrón. `{{item}}` es la ruta del archivo de cada vuelta, relativa a la raíz del área, y `{{item:name}}` su nombre sin extensión:

```workflow
# Llevar al archivo las notas terminadas de la entrada
for-each "Entrada/*.md"
  if-property "{{item}}" status "terminado"
    add-tag "{{item}}" "archivo"
    move "{{item}}" "Archivo"
  end
end
```

- **Patrón:** primero la carpeta, luego un patrón del nombre de archivo con `*` para cualquier número de caracteres y `?` para exactamente uno, por ejemplo `Entrada/*.md`. Un `**` antes del patrón de archivo añade las subcarpetas (`Proyectos/**/*.md`), un `**` al final significa todos los archivos con sus subcarpetas (`Entrada/**`). Las mayúsculas y minúsculas no cuentan; los comodines en la parte de la carpeta son un hallazgo.
- **Lista fija:** los archivos se determinan al entrar en el bucle y se procesan en orden alfabético, los números como en el gestor de archivos (`2` antes de `10`). Los archivos que la ejecución crea dentro del bucle no se añaden. Los archivos y carpetas cuyo nombre empieza por un punto no cuentan.
- **Límite:** como máximo **500 archivos**. Con más, el paso falla antes de la primera vuelta, con «Más de 500 archivos; no se procesó ningún archivo». Una carpeta que falta también es un fallo.
- Los bucles no se pueden anidar unos dentro de otros; una condición dentro del bucle está permitida.
- `{{item}}` y `{{item:name}}` solo valen dentro de un bucle. Los diálogos de entrada del bucle aparecen una vez antes del primer paso, y la respuesta vale para cada archivo.

## Paso de script

Un **paso de script** ejecuta un [bloque de script](scripts.md) del archivo de workflow y usa su resultado en las líneas siguientes o como condición. El script calcula y comprueba; no puede escribir. El ejemplo cuenta los archivos de la carpeta «Tareas» con `status: abierto`:

````markdown
```workflow
script "Recuento" as "abiertos"
if-script "Recuento"
  notify "Archivos abiertos en la carpeta Tareas: {{script:abiertos}}"
else
  notify "Nada abierto"
end
```

## Recuento

```perspective-script
return pq.pages('Tareas').filter(function (p) { return p.status === 'abierto'; }).length;
```
````

- **`script "sección" as "nombre"`** ejecuta el primer bloque de script (`perspective-script`) bajo el título «sección» del archivo de workflow; la sección se encuentra como con `from-section`. Su **resultado** queda después disponible como `{{script:nombre}}` en cada línea siguiente: el valor de retorno del script (un texto, un número o un valor lógico), si no el texto de su salida sin espacios en los bordes. El nombre consta de letras, cifras, `_` y `-`; las mayúsculas y minúsculas no cuentan, y cada nombre se asigna una sola vez.
- **`if-script "sección"`** abre un bloque como las demás condiciones. Se cumple si el script devuelve `true`, un texto no vacío o un número distinto de cero; `false`, un texto vacío, `0` y la falta de valor no la cumplen.
- **El mismo entorno aislado que los bloques de script:** el script lee los datos del área a través de la interfaz pq, con el archivo de workflow como documento propio (`pq.current()`), y no tiene acceso a archivos, red ni a la aplicación. Es **de solo lectura**. Se interrumpe a los **5 segundos**. Un error o una interrupción es un fallo del paso y termina la ejecución con «El script ha fallado» o «Script interrumpido tras 5 segundos».
- **Ajuste «Ejecutar bloques de script»:** el paso de script sigue el mismo ajuste que los bloques de script (**Ajustes → Comportamiento**, desactivado de forma predeterminada). Si está desactivado, la comprobación señala «Los bloques de script están desactivados» con la línea; el workflow no se ejecuta y no se puede activar. Justo antes de cada script, la aplicación vuelve a consultar el ajuste.
- La comprobación busca la sección antes del primer paso: si falta, aparece varias veces o no contiene ningún bloque de script, es un hallazgo. Un `{{script:nombre}}` antes del paso que lo proporciona también es un hallazgo; si el paso que lo proporciona no se ha ejecutado en una rama, la línea falla.

## Comandos de base de datos

Con los comandos de base de datos, un workflow trabaja con los registros de la [base de datos](database.md) del área: crea, cambia y elimina registros, escribe el resultado de un archivo de consulta como tabla en un archivo, repite pasos para cada registro de una consulta, lee valores de campo sueltos, abre formularios y comprueba la coherencia. El ejemplo anota una nota de préstamo en cada libro largo, escribe la lista de libros largos en una nota y después comprueba la tabla:

````markdown
```workflow
db-for-each "Long Books.md"
  db-update "Library" "{{record:id}}" loanNote="largo: {{record:pages}} páginas"
end
db-query "Long Books.md" into "Lista de lectura.md" under "Libros largos"
db-check "Library"
```
````

Los comandos de base de datos requieren la extensión «Base de datos». Si está desactivada, la comprobación señala «La base de datos está desactivada» en cada uno de estos comandos, y el workflow no se ejecuta.

### Tabla, registro y valores

- **La tabla** se indica por su nombre, como con `FROM` en una consulta, o por la ruta de su archivo: `"Library"` o `"Library.md"`. Si dos tablas se llaman igual, la comprobación señala «Tabla ambigua»; entonces ayuda la ruta.
- **El registro** se encuentra como en un enlace: primero como identificador, `r-00042` o `r-42`, si no por su forma de visualización, por ejemplo `"Solaris"`. Si varios registros llevan esa forma de visualización, el paso falla con «ambiguo» y nunca toma el primero; si no se encuentra ninguno, con «no se encontró».
- **Los valores** se escriben como pares `campo="valor"` y son siempre texto, también un número como `pages="224"`. Si un valor encaja con su campo lo comprueba la base de datos al escribir, como en el formulario.
- **La comprobación antes de la ejecución** conoce tablas y campos: una tabla desconocida, un campo que la tabla no tiene y un campo repetido en una línea son un hallazgo con línea. Si un dato contiene un marcador, la aplicación comprueba tras rellenarlo.

### Crear, cambiar y eliminar registros

- `db-create` crea un registro, `db-update` cambia los campos nombrados de un registro, `db-delete` elimina uno. Los dos primeros necesitan al menos un par.
- **La misma vía que el formulario:** cada comando escribe con todas las reglas de la tabla, es decir reglas de comprobación, valores obligatorios, clave, protección contra el borrado y permisos. Si la base de datos lo rechaza, el paso falla con la frase que también muestra el formulario.
- **Leído de nuevo:** `db-update` y `db-delete` leen el registro justo antes de escribir. Si otra persona lo cambia entretanto, el paso falla. Si alguien está editando el registro en un formulario en ese momento, el paso falla de inmediato, sin esperar.
- **El nuevo identificador:** tras `db-create "Library" title="The Invincible" as "nuevo"`, el identificador del registro creado está disponible en cada línea siguiente como `{{created:nuevo}}`, por ejemplo en `db-open "Library" "{{created:nuevo}}"`. El nombre consta de letras, cifras, `_` y `-`; mayúsculas y minúsculas no cuentan, y cada nombre se asigna solo una vez. Un `{{created:…}}` antes de su creación es un hallazgo; si la creación no se ha ejecutado en una rama, la línea falla.
- En una tabla en **forma de fichero**, `db-create` crea una ficha; su nombre es el valor de la clave. También allí valen los valores obligatorios: si un campo obligatorio queda sin valor, el paso falla con un motivo como en forma de tabla, y no se crea nada.
- **Antes de borrar**, la aplicación pregunta una vez antes del primer paso y nombra lo que se borrará; «No» no deja ejecutarse ningún paso. Si un destino solo se conoce durante la ejecución, la confirmación dice con palabras lo que se borrará, por ejemplo «El registro de la tabla 'Library' creado en esta ejecución»; en un bucle sobre registros nombra la consulta, la tabla y el límite de 500.
- **Un registro al que aún se hace referencia** no se puede eliminar, como en el formulario.

### Consulta a un archivo

`db-query "Long Books.md" into "Lista de lectura.md" under "Libros largos"` ejecuta un [archivo de consulta](database.md) y escribe su resultado como tabla fija en un archivo.

- **La fuente** es un archivo de consulta con la marca `db-query` y exactamente un bloque de consulta. Se ejecuta como en su vista de lectura, datos como `this.minpages` incluidos. Si el archivo no es un archivo de consulta, la comprobación señala «No es un archivo de consulta»; si su consulta es errónea, «Consulta errónea».
- **La tabla** lleva las etiquetas de las columnas como fila de encabezado y los valores tal como los muestra la vista de consulta; un registro se convierte en un enlace con su forma de visualización como texto, por ejemplo `[[Library#^r-00003|Solaris]]`, de modo que la nota muestra el título como la vista de consulta. Sin resultados queda una tabla sin filas, seguida de la frase que también muestra la vista de consulta.
- **Con `under`**, la tabla sustituye el contenido de esa sección, y el encabezado se mantiene; si falta o aparece más de una vez, el paso falla como con `insert`. Una segunda ejecución sustituye la tabla en lugar de añadir otra. **Sin `under`**, el paso crea el archivo y falla si ya existe, como con `create`. Para acumular, se escribe en un archivo con fecha: `into "Informes/{{date}}.md"`.
- Los registros que un paso anterior de la misma ejecución ha escrito ya figuran en el resultado.

### Bucle sobre registros

`db-for-each` repite los pasos hasta `end` para cada registro que devuelve un archivo de consulta, con la forma del bucle `for-each`:

````markdown
```workflow
db-for-each "Long Books.md"
  db-update "Library" "{{record:id}}" loanNote="largo: {{record:pages}} páginas"
end
```
````

| Marcador | Valor en cada repetición |
| --- | --- |
| `{{record:campo}}` | el valor del campo en el registro actual, por ejemplo `{{record:pages}}` |
| `{{record:id}}` | el identificador del registro |
| `{{record:table}}` | la tabla en la que está |
| `{{record:file}}` | el archivo en el que está: en forma de fichero su ficha, si no el archivo de tabla |

- **La consulta debe devolver registros:** una consulta `TABLE RECORDS`, sin agrupar. Si no, la comprobación señala que la consulta no devuelve registros.
- **Lista fija:** la lista queda fijada al entrar en el bucle y se recorre en el orden de la consulta; cada registro exactamente una vez. Los registros que la ejecución crea dentro del bucle no se añaden.
- **Leído de nuevo:** un registro se lee al comienzo de su repetición y otra vez antes de cada paso posterior que nombra uno de sus campos; así un paso ve lo que ha escrito un paso anterior de la misma repetición. Si el registro ha desaparecido para entonces, la ejecución termina en esa línea con «no se encontró».
- **Límites:** como máximo **500 registros**; si son más, el paso falla antes de la primera repetición, y no se ha procesado ningún registro. Un conjunto vacío no da ninguna repetición y no es un fallo. Ningún bucle dentro de un bucle, sea del tipo que sea; una condición dentro del bucle está permitida.
- `{{record:…}}` fuera de un bucle sobre registros es un hallazgo. Si falla un paso dentro del bucle, la ejecución termina; los registros ya procesados quedan procesados.

### Valor de campo como marcador

`{{db:Library:Solaris:pages}}` lee el campo `pages` del registro «Solaris» de la tabla «Library», por ejemplo en `notify "Páginas: {{db:Library:Solaris:pages}}"`.

- Los tres datos son tabla, registro y campo; el registro se encuentra como arriba, por su identificador o por su forma de visualización.
- **Se lee en el propio paso**, no antes de la ejecución; así vale un valor que ha escrito un paso anterior de la misma ejecución.
- **Fallo en lugar de vacío:** si no se encuentra el registro, es ambiguo o la tabla no conoce el campo, el paso falla con un motivo. Un valor de campo vacío de un registro encontrado es un texto vacío.
- La comprobación señala de antemano un marcador sin exactamente tres datos, una tabla desconocida y un campo desconocido; no busca el registro, porque solo vale en el momento del paso.

### Abrir formularios y comprobar la coherencia

- **`db-open "Library" "Solaris"`** muestra el registro en el formulario predeterminado de su tabla. **`db-open "Library"`** sin registro empieza un registro nuevo como «Nuevo registro» y exige el permiso para crear en la tabla; si falta, el paso falla nombrando rol y tabla. Una tabla en forma de fichero no tiene ese registro nuevo, y el paso falla con un motivo; una ficha nueva se crea con «Nueva ficha» en el resumen de la base de datos o con `db-create`.
- Si el formulario tiene una edición sin guardar, pregunta antes de cambiar, y el paso espera la respuesta sin límite de tiempo. «Descartar» abre el destino, y la ejecución continúa. «Seguir editando» deja la edición sin cambios y termina la ejecución en esta línea con un motivo; la ejecución termina igual si la pregunta se cierra sin respuesta, por ejemplo con la pestaña del formulario.
- **`db-open-list "Loans List.md"`** abre un archivo de consulta como `open`; un [formulario de lista](database.md) muestra allí su cuadrícula. Si el archivo no es un archivo de consulta, la comprobación señala «No es un archivo de consulta».
- **`db-check`** comprueba todas las tablas, **`db-check "Library"`** una, con la misma comprobación que «Comprobar coherencia» en el resumen de la base de datos. El resultado aparece como con `notify`, por ejemplo «Coherencia: 3 hallazgos en ‹Library›» o «Coherencia: ningún hallazgo»; sin tabla nombrada, nombra las tablas con hallazgos. **Un hallazgo no detiene la ejecución**; quien no quiera seguir después pone `db-check` al final. Si falla la propia comprobación, es un fallo del paso. Los hallazgos en detalle los muestra «Comprobar coherencia» en el resumen de la base de datos. `db-check` no escribe nada.

### Sin nadie presente, interrupción y rastro

**Un workflow escribe en la base de datos con sus permisos; según la programación y ante eventos crea y cambia, pero nunca elimina.**

| Comando | a mano | programado y ante eventos |
| --- | --- | --- |
| `db-create`, `db-update` | sí | sí |
| `db-delete` | sí, tras la confirmación | hallazgo «Solo manual» |
| `db-query`, `db-for-each`, `{{db:…}}` | sí | sí |
| `db-open` | sí | hallazgo «Solo manual» |
| `db-open-list`, `db-check` | sí | sí |

- **Si un workflow se interrumpe, se quedan los registros que ya ha escrito.** Cada comando de base de datos que escribe registros es un guardado propio que se aplica entero o no se aplica; la ejecución no se deshace.
- **Rastro en el registro de la ejecución:** en la página «Ejecuciones de workflows», el registro de la ejecución nombra para cada paso de base de datos la tabla, el registro y el identificador de operación, por ejemplo «Línea 2: db-update – tabla Library, registro r-00007, operación 12». Los [justificantes de cambio](database.md) de este paso llevan el mismo identificador de operación.
- **Sin eventos:** lo que un workflow escribe en la base de datos no dispara ningún evento, ni en el archivo de tabla ni en una ficha.

## Programación y activación

Un workflow con `trigger: schedule` y una línea `schedule` se ejecuta por sí solo en las fechas de su programación en cuanto está **activado**:

```yaml
---
workflow: true
name: Nota del día
trigger: schedule
schedule: every weekday at 08:00
missed: skip
---
```

### La línea de programación

La programación es una línea en palabras inglesas, según el modelo de las [tareas recurrentes](tasks.md):

| Forma | Significado | Ejemplo |
| --- | --- | --- |
| `every N minutes` | cada N minutos | `every 30 minutes` |
| `every N hours` | cada N horas | `every 2 hours` |
| `every day at HH:MM`, `every N days at HH:MM` | a diario o cada N días a la hora | `every day at 08:00` |
| `every weekday at HH:MM` | de lunes a viernes a la hora | `every weekday at 07:30` |
| `every <días> at HH:MM` | los días de la semana indicados | `every monday, thursday at 18:00` |
| `every N weeks on <días> at HH:MM` | cada N semanas los días indicados | `every 2 weeks on monday at 08:00` |
| `every N months on the <día> at HH:MM` | cada N meses el día indicado | `every month on the 1st at 09:00` |
| `every month on the last at HH:MM` | el último día del mes | `every month on the last at 17:00` |

- **Hora:** `at HH:MM` es obligatorio para días, días laborables, semanas y meses, y no se permite para minutos y horas; la hora tiene exactamente la forma `08:00`.
- **Escritura:** sin número vale `1` (`every day`, `every week`, `every month`); singular y plural valen igual. Los días de la semana van en inglés (`monday` a `sunday`), separados por coma o `and`. El día del mes se escribe `1st`, `2nd`, `3rd`, `15th` o como número sin más. Las mayúsculas y minúsculas no cuentan.
- **Cómputo:** un intervalo como `every 30 minutes` o `every 2 weeks` se cuenta desde el final de la última ejecución, antes de la primera ejecución desde la activación, no sobre una cuadrícula fija del reloj.
- Un archivo lleva exactamente una línea `schedule`. Un error en ella es un hallazgo con su línea en la cabecera, por ejemplo «La programación … no se puede leer» o «Falta 'at'».

### Interpretación

- **Hora local:** la hora es la del ordenador, como en los recordatorios y las alarmas. `08:00` sigue siendo `08:00` al cambiar al horario de verano o de invierno; si una hora no existe al adelantar el reloj, por ejemplo `02:30`, el workflow se ejecuta en el siguiente minuto existente.
- **Semana:** la semana empieza el lunes.
- **Fin de mes:** `last` es el último día del mes. Un día que un mes no tiene, por ejemplo `31st` en abril, se salta ese mes; quien quiera decir fin de mes escribe `last`.

### Cuándo se ejecuta un workflow programado

**Un workflow programado se ejecuta mientras la aplicación y su área están abiertas.** No hay ningún servicio en segundo plano, y la aplicación no se inicia sola. Comprueba cada 30 segundos si hay un workflow pendiente; por eso una ejecución empieza hasta medio minuto después de su fecha.

- Un workflow pendiente se ejecuta en exactamente una ventana de su área, aunque el área esté abierta en varias ventanas. Si hay otro workflow en marcha, el pendiente espera hasta que una ventana del área quede libre.
- Tras cada ejecución, la aplicación calcula la fecha siguiente; la página **Ejecuciones de workflows** la muestra en la columna **Próxima ejecución**.
- Una ejecución programada transcurre sin nadie presente y no hace preguntas. Por eso los marcadores de entrada y de selección, `confirm` y `delete` son el hallazgo **«Solo manual»** en un workflow con `trigger: schedule`: no se puede activar, pero se puede seguir iniciando a mano, y los diálogos aparecen entonces como siempre. Si solo una plantilla usada o un workflow llamado pide una entrada, la ejecución programada se cancela antes del primer paso con este hallazgo.

### Ejecuciones perdidas

Una fecha se pierde si llegó mientras la aplicación o el área estaban cerradas o el ordenador estaba en reposo. Lo que ocurre entonces lo fija el campo `missed`:

- **`run-once`** (por omisión): el workflow se recupera **una vez** al abrir el área, aunque se hayan perdido varias fechas. La barra de estado informa «Workflow ‹Nombre› recuperado», y la página **Ejecuciones de workflows** muestra «(recuperado)» tras la última ejecución.
- **`skip`**: la fecha perdida caduca, y el workflow espera a la siguiente. La página muestra «omitido:» con la fecha caducada.

### Activar

Un workflow con `trigger: schedule` o `trigger: event` **no está activado** después de crearlo, copiarlo o recibirlo; solo se ejecuta por sí solo cuando el usuario lo activa. El estado de activación está en el estado de ejecución del archivo acompañante y no viaja al copiar. Se activa en tres lugares, que solo aparecen con `trigger: schedule` y `trigger: event`:

- **página «Ejecuciones de workflows»**: la casilla de la columna **Activado**,
- **sobre el bloque**: el botón «Activado» junto a «Iniciar», pulsado «✓ Activado»,
- **panel del área**: en el menú contextual del archivo de workflow, «Activar» o «Desactivar».

La activación comprueba el workflow como antes de ejecutarlo. Si hay un hallazgo, se rechaza, y la barra de estado muestra «No activado:» con motivo y línea; si no, informa «Workflow ‹Nombre› activado, próxima ejecución» con la fecha. Desactivar es posible en cualquier momento, también con un hallazgo.

**Definición modificada:** si, tras la activación, cambia el bloque `workflow`, una de las líneas `trigger`, `schedule`, `missed` y `event` o un bloque de script que ejecuta un paso de script, aunque sea sin guardar en el editor, el workflow cuenta como «no activado: definición modificada» y deja de ejecutarse por sí solo hasta que se active de nuevo. Cambiar el nombre y la descripción no tiene efecto. Así nunca se ejecuta sin nadie presente un contenido modificado que nadie ha aprobado.

### El elemento «Workflows» de la barra de estado

Mientras al menos un workflow del área esté activado, el elemento **Workflows** figura en la parte derecha de la barra de estado. Muestra la última ejecución programada o por un evento con el signo del resultado, el nombre y la hora, por ejemplo «✓ Nota del día 08:00»; una ejecución de un día anterior lleva además el día y el mes. Los signos son `✓` para completado, `✗` para cancelado, `■` para detenido y `–` para una entrada cancelada; una cancelación aparece en el color del aviso de error. Sin una ejecución así hasta ahora, muestra «Workflows». La información emergente indica fecha, hora y resultado, y un clic abre la página **Ejecuciones de workflows**. En una barra de estado estrecha, el elemento se pliega junto con los demás elementos.

## Eventos

Un workflow con `trigger: event` y una línea `event` se ejecuta por sí solo cuando su **evento** ocurre en el área, en cuanto está activado. Así surge, por ejemplo, una **regla de carpeta**: cada nota que llega a la carpeta «Entrada» recibe una etiqueta, tanto si se creó en la aplicación como si se dejó con el gestor de archivos o la trajo una sincronización.

````markdown
---
workflow: true
name: Etiquetar la entrada
trigger: event
event: file-created in "Entrada" matching "*.md"
---

```workflow
add-tag "{{file}}" "entrada"
notify "Nuevo en la entrada: {{file}}"
```
````

### La línea de evento

La línea tiene la forma `event: <evento> [in "<carpeta o archivo>"] [matching "<patrón>"]`:

| Evento | ocurre cuando … | `{{file}}` es … | Ejemplo |
| --- | --- | --- | --- |
| `file-created` | se crea un archivo en el área, también desde fuera | el archivo nuevo | `event: file-created in "Entrada"` |
| `file-changed` | se modifica un archivo, también desde fuera; incluido el guardado en la aplicación | el archivo modificado | `event: file-changed in "Proyectos" matching "*.md"` |
| `file-moved` | se renombra o se mueve un archivo en la aplicación | la ruta nueva; la anterior es `{{from}}` | `event: file-moved in "Archivo"` |
| `task-done` | una tarea pasa a hecha | el archivo de la tarea; su texto es `{{task}}` | `event: task-done in "Plan semanal.md"` |
| `area-opened` | el área se abre y se lee | (ningún archivo) | `event: area-opened` |
| `reminder-due` | vence un recordatorio del área | el archivo del recordatorio | `event: reminder-due` |

- **`in`** limita a una carpeta con sus subcarpetas o a un solo archivo, relativo a la raíz del área; una carpeta `Entrada` nunca coincide con una carpeta cuyo nombre solo empieza por ese nombre, como `Entradas viejas`. **`matching`** limita a un patrón del nombre de archivo, con `*` y `?`, sin carpeta. Ambos son opcionales; `in` va antes de `matching`, los valores van entre comillas rectas, y las mayúsculas y minúsculas no cuentan. Con `file-moved` vale la ubicación nueva.
- Con `area-opened` y `reminder-due`, `in` y `matching` no están permitidos.
- **Exactamente una línea `event` por archivo.** Quien quiera responder a varios eventos escribe por cada evento un workflow pequeño que llama a uno común con `workflow "Nombre"`.
- **Mover:** mover un archivo en el gestor de archivos aparece como `file-created` en la ubicación nueva; solo la aplicación conoce `file-moved`, porque solo ella sabe de dónde vino un archivo.
- **Tarea hecha** significa: una línea de tarea cambia a un estado del tipo «hecha», ya sea con un clic en la casilla, en la [consulta de tareas](tasks.md), con una `x` tecleada o con un cambio desde fuera. Un clic o una `x` tecleada disparan poco después, incluso antes de guardar; el guardado posterior no dispara una segunda vez. Una tarea cancelada no está hecha. `{{task}}` es el texto de la tarea sin casilla, fechas ni prioridad.

### Qué puede hacer una ejecución ante un evento

- Una ejecución por un evento se ejecuta **sin nadie presente**, como una ejecución programada: los marcadores de entrada y de selección, `confirm`, `delete`, `db-delete` y `db-open` son el hallazgo «Solo manual». **Ante eventos nunca se elimina nada.**
- `{{file}}`, `{{from}}` y `{{task}}` llevan los valores del evento (tabla anterior). La comprobación señala un marcador que el evento no proporciona: `{{file}}` con `area-opened`, `{{from}}` salvo con `file-moved`, `{{task}}` salvo con `task-done`.

### Cuándo actúan los eventos

**Los eventos actúan mientras la aplicación y el área están abiertas en una ventana, y no se recuperan.** Lo que ocurrió mientras el área estaba cerrada no dispara nada al abrirla; quien quiera ordenar al abrir escribe un workflow con `area-opened` y `for-each`.

- **Antirrebote:** los avisos del mismo archivo en **2 segundos** dan un solo evento; un guardado que produce varios avisos inicia así un workflow una sola vez. Un archivo que se escribe sin parar dispara como muy tarde a los 10 segundos.
- **Lo que nunca dispara:** los archivos acompañantes (`.mdd`, `.mddl`), la carpeta de bloqueos y los archivos y carpetas cuyo nombre empieza por un punto.
- **Orden:** si un evento coincide con varios workflows activados, cada uno se ejecuta una vez, uno tras otro en el orden de sus rutas. Por área, las ejecuciones por eventos van una tras otra, en el orden de los eventos y en exactamente una ventana; si allí se está ejecutando un workflow, el evento espera. Al cerrar el área, los eventos en espera caducan.
- `area-opened` ocurre una vez por apertura, también para un área que la aplicación vuelve a abrir al iniciarse. `reminder-due` ocurre cuando el recordatorio vence a su hora; los recordatorios entregados con retraso al abrir el área no disparan nada.

### Sin cadenas

**Un workflow reacciona a lo que usted u otros programas hacen, nunca a lo que hace un workflow.** Lo que una ejecución crea, modifica, mueve o marca como hecho, también un registro que escribe en la base de datos, no dispara ningún evento; un workflow que, ante un archivo nuevo en «Entrada», crea él mismo un archivo en «Entrada» no entra por eso en un círculo. Quien quiera una secuencia llama expresamente al segundo workflow con `workflow "Nombre"`. Si un paso escribe en un documento abierto y sin guardar, solo su guardado es un cambio del archivo y dispara `file-changed`; una tarea que un paso así marca como hecha en el documento dispara `task-done`.

**Freno de emergencia:** si el mismo workflow se ejecuta por eventos más de **20 veces en 5 minutos**, por ejemplo porque otro programa responde a sus cambios, la ejecución 21 ya no se inicia. El workflow se desactiva, los eventos en espera para él caducan, y la barra de estado avisa «Workflow ‹Nombre› desactivado: más de 20 ejecuciones activadas por eventos en 5 minutos», sin ventana en primer plano también como notificación del sistema operativo. La página **Ejecuciones de workflows** muestra «no activado: freno de emergencia» bajo la casilla y el motivo en la columna **Resultado**. Tras activarlo de nuevo, el freno vuelve a contar desde cero.

### Activación e indicación

Un workflow con `trigger: event` se activa en los mismos tres lugares que uno programado (sección «Activar»); la línea `event` forma parte de la definición. Tras activarlo, la barra de estado avisa, por ejemplo, «Workflow ‹Nombre› activado, se ejecuta al crear un archivo en ‹Entrada›». En la página **Ejecuciones de workflows**, la columna **Próxima ejecución** muestra el evento en palabras, por ejemplo «al crear un archivo en ‹Entrada›», y la columna **Última ejecución** el origen, por ejemplo «evento: archivo nuevo ‹Entrada/Scan.md›». `notify` y una cancelación salen también como notificación del sistema operativo, como en la programación, y el elemento **Workflows** de la barra de estado muestra también la última ejecución por un evento.

## Carpeta de workflows y menú

Como en las plantillas, hay una **carpeta de workflows**, definida en dos niveles en «Archivo → Configuración…»:

- **Para toda la aplicación** en la sección **Extensiones (internas) → Workflows**.
- **Por área** en la sección **Área actual → Workflows** con el interruptor «Usar configuración del área» y el botón «Examinar…». La carpeta se guarda relativa a la raíz del área en el archivo del área y **sustituye** por completo a la de toda la aplicación.

La carpeta de workflows de toda la aplicación viaja con el archivo de configuración, como tipo de datos «Carpeta de workflows» de la página [Exportar e importar la configuración](setup-exchange.md), y surte efecto en cuanto se importa. La carpeta por área está en el archivo del área y viaja con el área.

El submenú **Archivo → Workflows** está justo después del submenú **Área**. Muestra los archivos de la carpeta que llevan la marca, en orden alfabético por nombre en cada nivel; las subcarpetas aparecen como submenús, los archivos sin marca se omiten. Tras los propios siguen, cada uno detrás de un separador, los workflows de las áreas vinculadas con consentimiento (sección siguiente). Tras otro separador siguen:

- **Mostrar ejecuciones de workflows** — abre la página **Ejecuciones de workflows**.
- **Nuevo workflow…** — pide el nombre, crea en la carpeta de workflows un archivo con cabecera, una línea de descripción y un bloque `workflow` vacío con dos líneas de comentario, y lo abre. Sin carpeta definida, pide primero la carpeta y la guarda, en la configuración del área si hay un área abierta. Nunca sobrescribe un archivo existente. La entrada también está en la paleta de comandos.
- **Definir carpeta de workflows…** — abre la configuración en la sección **Workflows**.

Sin carpeta definida, el submenú muestra «No hay carpeta de workflows definida», con una carpeta vacía «No hay workflows en la carpeta de workflows», con una carpeta inaccesible «No se encontró la carpeta de workflows». El submenú y los comandos siguen cada cambio en la carpeta.

## Workflows de áreas vinculadas

Como las plantillas, los workflows de un [área vinculada](linking.md) pueden ofrecerse junto a los propios. Para ello, cada vínculo en **Configuración → Área actual → Vínculos entre áreas** lleva junto a «Plantillas» la casilla **Workflows**; al principio está desactivada y es independiente de la de las plantillas.

- **Dónde aparecen:** los workflows de la carpeta de workflows que el área vinculada ha definido para sí aparecen en el submenú **Archivo → Workflows** tras los propios, en la paleta de comandos y en la página **Ejecuciones de workflows**, cada uno como «Nombre (@prefijo)» con el prefijo del vínculo. Los workflows nuevos de la fuente aparecen sin reiniciar.
- **Dónde actúan:** un workflow así se ejecuta en el área **propia**. Todas las rutas valen en la raíz del área propia; del área vinculada solo se lee el propio archivo de workflow, incluidas sus secciones para `from-section`. Una llamada `workflow "Nombre"` busca en el área propia.
- **Solo a mano:** un workflow de un área vinculada no se puede activar. La aplicación no escribe ningún estado de ejecución en el área ajena; la página muestra en su lugar «del área ‹prefijo›», y la barra de estado informa de una ejecución correcta con «Workflow ‹Nombre› del área ‹prefijo› ejecutado correctamente».
- **Sin acceso:** si el área vinculada, su archivo del área o su carpeta de workflows no se pueden leer, sus workflows se omiten sin aviso. Con los vínculos entre áreas desactivados no aparecen workflows ajenos.

## Estado de ejecución y la página «Ejecuciones de workflows»

Tras cada ejecución, la aplicación anota en el **archivo acompañante** del workflow (`.mdd`, sección `workflow`) el momento, el resultado, en su caso la línea cancelada, el número de ejecuciones, el origen de la ejecución y el registro de la última ejecución, y en un workflow programado o con evento además el estado de activación, en la programación la fecha siguiente y en una ejecución por un evento el evento que la disparó con su archivo; el texto del archivo de workflow no se toca. El estado de ejecución acompaña al archivo cuando se renombra o se mueve, no cuando se copia.

La página **Ejecuciones de workflows** se abre con «Ver → Mostrar ejecuciones de workflows», con «Archivo → Workflows → Mostrar ejecuciones de workflows», desde la paleta de comandos y con un clic en el elemento **Workflows** de la barra de estado. Enumera **todos los workflows del área**, también los que están fuera de la carpeta de workflows, y a continuación los workflows de las áreas vinculadas con consentimiento, con estas columnas y un botón «Iniciar» por fila:

| Columna | Contenido |
| --- | --- |
| **Workflow**, **Ubicación** | nombre con la descripción como información emergente, carpeta del archivo |
| **Activado** | casilla para activar, solo con `trigger: schedule` y `trigger: event`; con una definición modificada, además «no activado: definición modificada», tras intervenir el freno de emergencia «no activado: freno de emergencia» |
| **Próxima ejecución** | fecha de la próxima ejecución programada, en un workflow con evento el evento en palabras, en ambos casos mientras el workflow esté activado |
| **Última ejecución** | momento de la última ejecución, con «(recuperado)» en una ejecución recuperada, con evento y archivo en una ejecución por un evento, debajo en su caso «omitido:» con la fecha; además el botón «Registro (N)» |
| **Resultado** | resultado de la última ejecución, tabla siguiente |
| **Ejecuciones** | número de ejecuciones |

Un workflow que nunca se ha ejecutado figura con «nunca ejecutado».

| Resultado | Significado |
| --- | --- |
| completado | se han ejecutado todos los pasos |
| cancelado en la línea N: motivo | un hallazgo o un fallo terminó la ejecución |
| detenido en la línea N | el comando `stop` o un «No» en `confirm` terminó la ejecución |
| Entrada cancelada, ningún paso ejecutado | se canceló un diálogo o la confirmación de los destinos que se borrarán |

Tras una ejecución en esta ventana, la página muestra el mismo motivo que la barra de estado. El archivo acompañante solo guarda la línea y el tipo de motivo; tras un reinicio y para una ejecución desde otra ventana, los detalles como un nombre de archivo aparecen por eso como «…». La página se actualiza tras cada ejecución y cada activación; el botón «Actualizar» la vuelve a leer.

### Lo que ha hecho una ejecución

El botón «Registro (N)» despliega bajo la fila el **registro** de la última ejecución: cada archivo y cada carpeta que ha creado, cambiado, movido, copiado o borrado, como «Línea N: comando – ruta», con la ruta relativa a la raíz del área; un paso de base de datos aparece como «Línea N: comando – tabla, registro, operación» (sección «Comandos de base de datos»). Si la ejecución no ha tocado nada, muestra «Ningún archivo tocado»; con muchísimos archivos tocados, el registro aparece recortado y lo indica.

No hay forma de deshacer una ejecución entera. Se deshace de forma selectiva, con los medios que existen de todos modos: los cambios de contenido con el [historial del documento](history.md) del archivo tocado, lo borrado desde la papelera, lo creado, movido y copiado en el panel del área.

## Ayuda en el editor

- **Resaltado:** en las líneas de comando, la palabra clave aparece en negrita, el texto entre comillas en color y los marcadores en cursiva, tanto en el editor como en la vista de lectura. Las palabras de bloque de las condiciones y los bucles, `else` y `end` aparecen además subrayadas con puntos en el editor.
- **Indicación de comprobación:** el modo en vivo, la vista renderizada y la vista dividida muestran sobre el bloque el resultado de la comprobación: en verde «listo» o en rojo «Línea N: motivo», con «(+N más)» si hay varios hallazgos. Allí aparecen también los avisos sobre varios bloques y sobre un disparador todavía no compatible, así como los hallazgos de la programación con su línea en la cabecera. La indicación sigue al texto poco después de cada cambio y muestra el mismo hallazgo que señala el inicio. Al imprimir, en una exportación y en un archivo incrustado, la línea de cabecera no aparece.
- **Botón «Activado»:** con `trigger: schedule` y `trigger: event`, la línea de cabecera lleva junto a «Iniciar» el botón para activar (sección «Programación y activación»).

El resaltado y la indicación no cambian el texto del archivo.

## Límites

- **Solo dentro del área:** ningún comando lee ni escribe fuera de la raíz del área en la que se inició el workflow, tampoco mediante un marcador de posición; esto vale también para un workflow de un área vinculada.
- **Sin red, sin programas externos.** Los archivos solo los borra `delete`, los registros solo `db-delete`, ambos solo en un inicio a mano y tras una confirmación; los archivos van a la papelera.
- **Ninguna ejecución sin área abierta:** un workflow programado solo se ejecuta mientras la aplicación y su área están abiertas; recupera las fechas perdidas según las reglas de `missed`. Los eventos también actúan solo con el área abierta y no se recuperan.
- **Sin cadenas:** un workflow reacciona a lo que usted u otros programas hacen, nunca a lo que hace un workflow. Quien quiera una secuencia llama al siguiente workflow con `workflow "Nombre"`; contra un bucle a través de otros programas, el freno de emergencia detiene un workflow tras más de 20 ejecuciones por eventos en 5 minutos (sección «Eventos»).
- **Límites de los bloques:** como máximo tres niveles de anidamiento, ningún bucle dentro de un bucle y como máximo 500 archivos o registros por bucle.
- **Base de datos:** un workflow escribe en la base de datos con sus permisos; según la programación y ante eventos crea y cambia, pero nunca elimina. Si un workflow se interrumpe, se quedan los registros que ya ha escrito. Lo que un workflow escribe en la base de datos no dispara ningún evento.
- **No se deshace una ejecución:** los pasos ejecutados quedan ejecutados; el registro muestra lo que ha tocado la última ejecución, y se deshace de forma selectiva.
- **Las macros** siguen como están y pueden llamarse como paso; una macro es una secuencia de comandos en la configuración, un workflow un procedimiento como documento. **Los [bloques de script](scripts.md)** siguen siendo de solo lectura, también como paso de script; un workflow no es un lenguaje de script general, sino un catálogo fijo de comandos.

## Etapas posteriores

Hay prevista otra etapa, sin que su alcance ni su fecha estén fijados: comandos para el intercambio de datos de tabla de la [base de datos](database.md), `db-export` y `db-import`. La comprobación ya conoce estas dos palabras clave y las señala como «solo estará disponible en una etapa posterior», para que un archivo así no se ejecute en parte.
