# Workflows

Un **workflow** deja por escrito gestiones recurrentes como una secuencia fija de pasos: crear, renombrar, mover, copiar y mover a la papelera archivos y carpetas, añadir o insertar texto, establecer propiedades y etiquetas en la cabecera, marcar tareas como hechas, ejecutar comandos, macros y otros workflows. Un workflow es un **archivo Markdown corriente**; lo que hace figura en un bloque de comandos fijos, una línea por paso. Así el archivo sigue siendo legible sin la aplicación, se puede compartir y se edita como cualquier otro documento.

Un workflow se inicia **a mano**: desde el menú, la paleta de comandos, con un atajo de teclado, un botón sobre el bloque o el menú contextual del panel del área. Un workflow con programación se ejecuta además **según su programación** en cuanto está activado. **Antes de que se ejecute el primer paso, la aplicación comprueba todo el workflow**; un error aparece sobre el bloque con la línea y el motivo, y no se ejecuta nada.

## La extensión «Workflows»

La función forma parte de las [extensiones integradas](extensions.md) («Workflows», grupo **Herramientas**) y está activada en el modo de trabajo **Completo** y desactivada en los modos **Principiante** y **Avanzado**. Desactivada, un bloque `workflow` es un bloque de código corriente sin resaltado, sin indicación de comprobación y sin botones; no hay comandos de los workflows, ni submenú **Workflows**, ni página **Ejecuciones de workflows**, ni elemento **Workflows** en la barra de estado, ni secciones de configuración **Workflows**, ni ejecución según la programación. Un archivo de workflow es entonces un documento corriente. No se pierde nada: los archivos, los estados de ejecución con su estado de activación y la carpeta de workflows definida siguen intactos al volver a activarla.

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

La cabecera lleva marca, nombre, disparador, descripción y, para una ejecución programada, la programación:

| Clave | Obligatoria | Significado |
| --- | --- | --- |
| `workflow` | sí | `true` marca el archivo como workflow. |
| `name` | no | Nombre del workflow en el menú, la paleta de comandos y los avisos; sin indicación vale el nombre del archivo sin extensión. |
| `trigger` | no | Disparador: `manual` para el inicio a mano, `schedule` para la ejecución según la programación; sin indicación vale `manual`. |
| `schedule` | con `trigger: schedule` | Programación en una línea, por ejemplo `every weekday at 08:00` (sección «Programación y activación»). |
| `missed` | no | Tratamiento de las ejecuciones perdidas: `run-once` recupera una vez, `skip` las deja caducar; sin indicación vale `run-once`. |
| `description` | no | Descripción breve; la página **Ejecuciones de workflows** la muestra como información emergente en el nombre. |

Un disparador distinto de `manual` o `schedule` se muestra como «todavía no compatible», y el workflow no se ejecuta; el archivo queda sin cambios. Un archivo con dos o más bloques `workflow`, o con ninguno, tampoco se ejecuta. Un bloque que solo contiene comentarios es válido y no hace nada.

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
- una programación ilegible, una hora que falta o no está permitida, `schedule` sin `trigger: schedule` y a la inversa, así como un valor desconocido en `missed`.

Un hallazgo detiene la ejecución **antes del primer paso**; un archivo de workflow erróneo no se ejecuta en absoluto en lugar de ejecutarse en parte. La comprobación señala todos los hallazgos a la vez; la línea indicada es la línea en el documento tal como la cuenta el editor, cabecera incluida. La única excepción es el hallazgo «Solo manual» (sección «Programación y activación»): impide únicamente la activación, y el inicio a mano sigue siendo posible.

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
- `notify` muestra su texto en la barra de estado y, en una ejecución programada, además como notificación del sistema operativo (sección «Desarrollo de una ejecución»).
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
- `delete` y `confirm` necesitan a alguien presente: en un workflow con `trigger: schedule` son el hallazgo «Solo manual».

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
| `{{file}}` | ruta del documento activo al iniciar, relativa a la raíz del área, por ejemplo `Proyectos/Plan.md` |
| `{{title}}` | título del documento activo al iniciar |
| `{{folder}}` | carpeta del documento activo al iniciar, relativa a la raíz del área |
| `{{area}}` | nombre del área |
| `{{clipboard}}` | texto del portapapeles al iniciar; en una ejecución programada, lo que haya en ese momento en el portapapeles |
| `{{prompt:Pregunta}}`, `{{prompt:Pregunta:Valor}}` | diálogo de entrada |
| `{{select:Pregunta:a,b,c}}` | diálogo de selección |

- **Todos los diálogos antes del primer paso:** los diálogos de entrada y de selección de toda la ejecución aparecen uno tras otro antes de que ocurra nada, incluidos los de las plantillas usadas y los de los workflows llamados. Una misma pregunta se hace una vez y vale en todas partes. Cancelar un diálogo cancela la ejecución, y no se ejecuta ningún paso.
- **Un instante por ejecución:** `{{date}}` y `{{time}}` tienen el mismo valor en todas las líneas, también al pasar la medianoche. Del mismo modo, el portapapeles se lee una sola vez al iniciar, y `{{clipboard}}` tiene el mismo contenido en todas las líneas.
- **En una plantilla usada por un workflow**, `{{title}}` y `{{folder}}` designan como siempre el archivo nuevo, mientras que `{{file}}` y `{{area}}` designan el documento activo y el área.
- **Según la programación** no hay nadie que responda a un diálogo: en un workflow con `trigger: schedule`, los marcadores de entrada y de selección son el hallazgo «Solo manual».
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

El botón sobre el bloque está desactivado mientras la comprobación señale un hallazgo. En un documento que nunca se ha guardado muestra «Guarde primero», fuera de un área «Solo se puede iniciar dentro de un área abierta». Un workflow activado se ejecuta además por sí solo según su programación; el inicio a mano sigue siendo posible en cualquier momento.

El comando de un workflow recibe su identificador de la ruta del archivo en la carpeta de workflows; así, dos workflows del mismo nombre en subcarpetas distintas siguen distinguiéndose. **Renombrar un workflow en la aplicación o moverlo dentro de la carpeta de workflows conserva sus asignaciones:** un atajo de teclado, un sitio en la barra de estado, el menú contextual o la barra de formato y un paso de macro que lo llama se trasladan con él. **Fuera de la aplicación**, por ejemplo en el gestor de archivos, la aplicación no advierte el cambio de nombre; las asignaciones pierden entonces su destino y deben asignarse de nuevo. Un workflow movido fuera de la carpeta de workflows deja de ser un comando; sus asignaciones quedan guardadas y vuelven a funcionar en cuanto regresa al mismo lugar.

## Desarrollo de una ejecución

1. La aplicación comprueba el workflow junto con los workflows a los que llama.
2. Los diálogos de todos los marcadores aparecen uno tras otro; si la ejecución contiene `delete`, sigue la confirmación única de los destinos que se borrarán.
3. Los pasos se ejecutan estrictamente uno tras otro; cada uno espera al anterior.
4. El primer fallo termina la ejecución. La barra de estado muestra «Workflow ‹Nombre› cancelado en la línea N: motivo».

Los pasos ejecutados quedan ejecutados; no hay forma de deshacer una ejecución (sección «Lo que ha hecho una ejecución»). **En cada ventana se ejecuta como máximo un workflow**; un segundo inicio durante una ejecución se rechaza con un aviso.

**Mensajes:** en un inicio a mano, `notify` muestra su texto en la barra de estado. En una ejecución programada, también si es recuperada, el texto sale además como **notificación del sistema operativo**, con el nombre del workflow como título; lo mismo la cancelación de una ejecución así con línea y motivo, aunque el workflow no contenga `notify`. La notificación solo aparece si ninguna ventana de la aplicación está en primer plano, y una vez por mensaje; si no, basta el aviso de la barra de estado. Si el sistema operativo la muestra y cómo lo hace depende de sus propios ajustes de notificaciones.

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

Un workflow con `trigger: schedule` **no está activado** después de crearlo, copiarlo o recibirlo; solo se ejecuta según la programación cuando el usuario lo activa. El estado de activación está en el estado de ejecución del archivo acompañante y no viaja al copiar. Se activa en tres lugares, que solo aparecen con `trigger: schedule`:

- **página «Ejecuciones de workflows»**: la casilla de la columna **Activado**,
- **sobre el bloque**: el botón «Activado» junto a «Iniciar», pulsado «✓ Activado»,
- **panel del área**: en el menú contextual del archivo de workflow, «Activar» o «Desactivar».

La activación comprueba el workflow como antes de ejecutarlo. Si hay un hallazgo, se rechaza, y la barra de estado muestra «No activado:» con motivo y línea; si no, informa «Workflow ‹Nombre› activado, próxima ejecución» con la fecha. Desactivar es posible en cualquier momento, también con un hallazgo.

**Definición modificada:** si, tras la activación, cambia el bloque `workflow` o una de las líneas `trigger`, `schedule` y `missed`, aunque sea sin guardar en el editor, el workflow cuenta como «no activado: definición modificada» y deja de ejecutarse según la programación hasta que se active de nuevo. Cambiar el nombre y la descripción no tiene efecto. Así nunca se ejecuta sin nadie presente un contenido modificado que nadie ha aprobado.

### El elemento «Workflows» de la barra de estado

Mientras al menos un workflow del área esté activado, el elemento **Workflows** figura en la parte derecha de la barra de estado. Muestra la última ejecución programada con el signo del resultado, el nombre y la hora, por ejemplo «✓ Nota del día 08:00»; una ejecución de un día anterior lleva además el día y el mes. Los signos son `✓` para completado, `✗` para cancelado, `■` para detenido y `–` para una entrada cancelada; una cancelación aparece en el color del aviso de error. Sin ejecución programada hasta ahora, muestra «Workflows». La información emergente indica fecha, hora y resultado, y un clic abre la página **Ejecuciones de workflows**. En una barra de estado estrecha, el elemento se pliega junto con los demás elementos.

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

Tras cada ejecución, la aplicación anota en el **archivo acompañante** del workflow (`.mdd`, sección `workflow`) el momento, el resultado, en su caso la línea cancelada, el número de ejecuciones, el origen de la ejecución y el registro de la última ejecución, y en un workflow programado además el estado de activación y la fecha siguiente; el texto del archivo de workflow no se toca. El estado de ejecución acompaña al archivo cuando se renombra o se mueve, no cuando se copia.

La página **Ejecuciones de workflows** se abre con «Ver → Mostrar ejecuciones de workflows», con «Archivo → Workflows → Mostrar ejecuciones de workflows», desde la paleta de comandos y con un clic en el elemento **Workflows** de la barra de estado. Enumera **todos los workflows del área**, también los que están fuera de la carpeta de workflows, y a continuación los workflows de las áreas vinculadas con consentimiento, con estas columnas y un botón «Iniciar» por fila:

| Columna | Contenido |
| --- | --- |
| **Workflow**, **Ubicación** | nombre con la descripción como información emergente, carpeta del archivo |
| **Activado** | casilla para activar, solo con `trigger: schedule`; con una definición modificada, además «no activado: definición modificada» |
| **Próxima ejecución** | fecha de la próxima ejecución programada, mientras el workflow esté activado |
| **Última ejecución** | momento de la última ejecución, con «(recuperado)» en una ejecución recuperada, debajo en su caso «omitido:» con la fecha; además el botón «Registro (N)» |
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

El botón «Registro (N)» despliega bajo la fila el **registro** de la última ejecución: cada archivo y cada carpeta que ha creado, cambiado, movido, copiado o borrado, como «Línea N: comando – ruta», con la ruta relativa a la raíz del área. Si la ejecución no ha tocado nada, muestra «Ningún archivo tocado»; con muchísimos archivos tocados, el registro aparece recortado y lo indica.

No hay forma de deshacer una ejecución entera. Se deshace de forma selectiva, con los medios que existen de todos modos: los cambios de contenido con el [historial del documento](history.md) del archivo tocado, lo borrado desde la papelera, lo creado, movido y copiado en el panel del área.

## Ayuda en el editor

- **Resaltado:** en las líneas de comando, la palabra clave aparece en negrita, el texto entre comillas en color y los marcadores en cursiva, tanto en el editor como en la vista de lectura.
- **Indicación de comprobación:** el modo en vivo, la vista renderizada y la vista dividida muestran sobre el bloque el resultado de la comprobación: en verde «listo» o en rojo «Línea N: motivo», con «(+N más)» si hay varios hallazgos. Allí aparecen también los avisos sobre varios bloques y sobre un disparador todavía no compatible, así como los hallazgos de la programación con su línea en la cabecera. La indicación sigue al texto poco después de cada cambio y muestra el mismo hallazgo que señala el inicio. Al imprimir, en una exportación y en un archivo incrustado, la línea de cabecera no aparece.
- **Botón «Activado»:** con `trigger: schedule`, la línea de cabecera lleva junto a «Iniciar» el botón para activar (sección «Programación y activación»).

El resaltado y la indicación no cambian el texto del archivo.

## Límites

- **Solo dentro del área:** ningún comando lee ni escribe fuera de la raíz del área en la que se inició el workflow, tampoco mediante un marcador de posición; esto vale también para un workflow de un área vinculada.
- **Sin red, sin programas externos.** Solo se borra con `delete`, solo en un inicio a mano, tras una confirmación y hacia la papelera.
- **Ninguna ejecución sin área abierta:** un workflow programado solo se ejecuta mientras la aplicación y su área están abiertas; recupera las fechas perdidas según las reglas de `missed`.
- **No se deshace una ejecución:** los pasos ejecutados quedan ejecutados; el registro muestra lo que ha tocado la última ejecución, y se deshace de forma selectiva.
- **Las macros** siguen como están y pueden llamarse como paso; una macro es una secuencia de comandos en la configuración, un workflow un procedimiento como documento. **Los [bloques de script](scripts.md)** siguen siendo de solo lectura; un workflow no es un lenguaje de script general, sino un catálogo fijo de comandos.

## Etapas posteriores

Hay previstas otras etapas, sin que su alcance ni su fecha estén fijados: un inicio ante sucesos del área, condiciones y repeticiones, así como comandos para la [base de datos](database.md). La comprobación ya conoce las palabras clave de estos comandos y las señala como «solo estará disponible en una etapa posterior», para que un archivo así no se ejecute en parte.
