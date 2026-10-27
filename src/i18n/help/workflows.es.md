# Workflows

Un **workflow** deja por escrito gestiones recurrentes como una secuencia fija de pasos: crear, renombrar, mover y copiar archivos y carpetas, añadir o insertar texto, establecer propiedades en la cabecera, ejecutar comandos, macros y otros workflows. Un workflow es un **archivo Markdown corriente**; lo que hace figura en un bloque de comandos fijos, una línea por paso. Así el archivo sigue siendo legible sin la aplicación, se puede compartir y se edita como cualquier otro documento.

Un workflow se inicia **a mano**: desde el menú, la paleta de comandos, con un atajo de teclado, un botón sobre el bloque o el menú contextual del panel del área. **Antes de que se ejecute el primer paso, la aplicación comprueba todo el workflow**; un error aparece sobre el bloque con la línea y el motivo, y no se ejecuta nada.

## La extensión «Workflows»

La función forma parte de las [extensiones integradas](extensions.md) («Workflows», grupo **Herramientas**) y está activada en el modo de trabajo **Completo** y desactivada en los modos **Principiante** y **Avanzado**. Desactivada, un bloque `workflow` es un bloque de código corriente sin resaltado, sin indicación de comprobación y sin botón; no hay comandos de los workflows, ni submenú **Workflows**, ni página **Ejecuciones de workflows**, ni secciones de configuración **Workflows**. Un archivo de workflow es entonces un documento corriente. No se pierde nada: los archivos, los estados de ejecución y la carpeta de workflows definida siguen intactos al volver a activarla.

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

La cabecera solo lleva marca, nombre, disparador y descripción:

| Clave | Obligatoria | Significado |
| --- | --- | --- |
| `workflow` | sí | `true` marca el archivo como workflow. |
| `name` | no | Nombre del workflow en el menú, la paleta de comandos y los avisos; sin indicación vale el nombre del archivo sin extensión. |
| `trigger` | no | Disparador; sin indicación vale `manual`, el inicio a mano. |
| `description` | no | Descripción breve; la página **Ejecuciones de workflows** la muestra como información emergente en el nombre. |

Un disparador distinto de `manual` se muestra como «todavía no compatible», y el workflow no se ejecuta; el archivo queda sin cambios. Un archivo con dos o más bloques `workflow`, o con ninguno, tampoco se ejecuta. Un bloque que solo contiene comentarios es válido y no hace nada.

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
- marcadores de posición erróneos, plantillas ilegibles y plantillas desactivadas.

Un hallazgo detiene la ejecución **antes del primer paso**; un archivo de workflow erróneo no se ejecuta en absoluto en lugar de ejecutarse en parte. La comprobación señala todos los hallazgos a la vez; la línea indicada es la línea en el documento tal como la cuenta el editor, cabecera incluida.

Lo que solo un paso anterior puede producir lo comprueba la aplicación en el propio paso: si existe un archivo, una sección o un encabezado. Si falta en ese momento, el paso falla.

## Comandos

Los comandos de la primera etapa, ordenados según su objeto. Las rutas son relativas a la raíz del área.

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
| `notify` | mostrar un texto como aviso en la barra de estado | texto | `notify "Repaso semanal creado"` |
| `stop` | terminar la ejecución con un texto | texto | `stop "Nada que hacer"` |

- `command` toma el identificador fijo de un comando, como `view.modeSplit`, `view.modeLive` o `file.save`, y lo ejecuta en la ventana de inicio. Si en ese momento no se puede ejecutar, el paso falla. Las macros y los workflows no se ejecutan con `command`, sino con sus propios comandos.
- `macro` y `workflow` pueden anidarse como máximo cinco niveles. Un workflow llamado vuelve tras su último paso; si en él falla un paso, termina toda la ejecución.
- `stop` termina toda la ejecución, también desde un workflow llamado; la barra de estado muestra «Workflow ‹Nombre› detenido en la línea N: texto».

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
| `{{prompt:Pregunta}}`, `{{prompt:Pregunta:Valor}}` | diálogo de entrada |
| `{{select:Pregunta:a,b,c}}` | diálogo de selección |

- **Todos los diálogos antes del primer paso:** los diálogos de entrada y de selección de toda la ejecución aparecen uno tras otro antes de que ocurra nada, incluidos los de las plantillas usadas y los de los workflows llamados. Una misma pregunta se hace una vez y vale en todas partes. Cancelar un diálogo cancela la ejecución, y no se ejecuta ningún paso.
- **Un instante por ejecución:** `{{date}}` y `{{time}}` tienen el mismo valor en todas las líneas, también al pasar la medianoche.
- **En una plantilla usada por un workflow**, `{{title}}` y `{{folder}}` designan como siempre el archivo nuevo, mientras que `{{file}}` y `{{area}}` designan el documento activo y el área.
- `{{cursor}}` no se permite en una línea de comando, y `{{clipboard}}` solo estará disponible allí en una etapa posterior. `\{{` escribe un `{{` literal.
- Si `{{folder}}` queda vacío en la carpeta raíz, `"{{folder}}/Nuevo.md"` da la ruta `Nuevo.md`. Sin documento activo, `{{file}}` está vacío, y una ruta formada con él es un hallazgo.

## Iniciar un workflow

Un workflow solo se inicia en un área abierta, y sus rutas valen en esa área, aunque el archivo proceda de la carpeta de workflows de toda la aplicación. Las vías:

| Vía | Efecto |
| --- | --- |
| **Archivo → Workflows** | cada workflow de la carpeta de workflows como entrada, las subcarpetas como submenús |
| **Paleta de comandos** (`Ctrl+K` por omisión) | cada workflow de la carpeta de workflows como comando con su nombre |
| **Barra de estado y menú contextual** | el comando de un workflow, colocado mediante la [colocación de comandos](command-placement.md) |
| **Atajo de teclado** | asignado al comando de un workflow en «Configuración → Atajos de teclado» |
| **Botón «Iniciar» sobre el bloque** | en el modo en vivo, la vista renderizada y la vista dividida, a la derecha en la línea de cabecera del bloque; inicia cualquier archivo de workflow, también fuera de la carpeta de workflows, con el estado del editor |
| **«Iniciar» en el panel del área** | en lo más alto del menú contextual de cada archivo de workflow del área |
| **Página «Ejecuciones de workflows»** | botón «Iniciar» en la fila de cada workflow |

El botón sobre el bloque está desactivado mientras la comprobación señale un hallazgo. En un documento que nunca se ha guardado muestra «Guarde primero», fuera de un área «Solo se puede iniciar dentro de un área abierta».

El comando de un workflow recibe su identificador de la ruta del archivo en la carpeta de workflows; así, dos workflows del mismo nombre en subcarpetas distintas siguen distinguiéndose. **Renombrar un workflow en la aplicación o moverlo dentro de la carpeta de workflows conserva sus asignaciones:** un atajo de teclado, un sitio en la barra de estado, el menú contextual o la barra de formato y un paso de macro que lo llama se trasladan con él. **Fuera de la aplicación**, por ejemplo en el gestor de archivos, la aplicación no advierte el cambio de nombre; las asignaciones pierden entonces su destino y deben asignarse de nuevo. Un workflow movido fuera de la carpeta de workflows deja de ser un comando; sus asignaciones quedan guardadas y vuelven a funcionar en cuanto regresa al mismo lugar.

## Desarrollo de una ejecución

1. La aplicación comprueba el workflow junto con los workflows a los que llama.
2. Los diálogos de todos los marcadores aparecen uno tras otro.
3. Los pasos se ejecutan estrictamente uno tras otro; cada uno espera al anterior.
4. El primer fallo termina la ejecución. La barra de estado muestra «Workflow ‹Nombre› cancelado en la línea N: motivo».

Los pasos ejecutados quedan ejecutados; no hay deshacer a lo largo de varios pasos. **En cada ventana se ejecuta como máximo un workflow**; un segundo inicio durante una ejecución se rechaza con un aviso.

## Carpeta de workflows y menú

Como en las plantillas, hay una **carpeta de workflows**, definida en dos niveles en «Archivo → Configuración…»:

- **Para toda la aplicación** en la sección **Extensiones (internas) → Workflows**.
- **Por área** en la sección **Área actual → Workflows** con el interruptor «Usar configuración del área» y el botón «Examinar…». La carpeta se guarda relativa a la raíz del área en el archivo del área y **sustituye** por completo a la de toda la aplicación.

El submenú **Archivo → Workflows** está justo después del submenú **Área**. Muestra los archivos de la carpeta que llevan la marca, en orden alfabético por nombre en cada nivel; las subcarpetas aparecen como submenús, los archivos sin marca se omiten. Tras un separador siguen:

- **Mostrar ejecuciones de workflows** — abre la página **Ejecuciones de workflows**.
- **Nuevo workflow…** — pide el nombre, crea en la carpeta de workflows un archivo con cabecera, una línea de descripción y un bloque `workflow` vacío con dos líneas de comentario, y lo abre. Sin carpeta definida, pide primero la carpeta y la guarda, en la configuración del área si hay un área abierta. Nunca sobrescribe un archivo existente. La entrada también está en la paleta de comandos.
- **Definir carpeta de workflows…** — abre la configuración en la sección **Workflows**.

Sin carpeta definida, el submenú muestra «No hay carpeta de workflows definida», con una carpeta vacía «No hay workflows en la carpeta de workflows», con una carpeta inaccesible «No se encontró la carpeta de workflows». El submenú y los comandos siguen cada cambio en la carpeta.

## Estado de ejecución y la página «Ejecuciones de workflows»

Tras cada ejecución, la aplicación anota en el **archivo acompañante** del workflow (`.mdd`, sección `workflow`) el momento, el resultado, en su caso la línea cancelada y el número de ejecuciones; el texto del archivo de workflow no se toca. El estado de ejecución acompaña al archivo cuando se renombra o se mueve, no cuando se copia.

La página **Ejecuciones de workflows** se abre con «Ver → Mostrar ejecuciones de workflows», con «Archivo → Workflows → Mostrar ejecuciones de workflows» y desde la paleta de comandos. Enumera **todos los workflows del área**, también los que están fuera de la carpeta de workflows, con las columnas **Workflow**, **Ubicación**, **Última ejecución**, **Resultado** y **Ejecuciones** y un botón «Iniciar» por fila. Un workflow que nunca se ha ejecutado figura con «nunca ejecutado».

| Resultado | Significado |
| --- | --- |
| completado | se han ejecutado todos los pasos |
| cancelado en la línea N: motivo | un hallazgo o un fallo terminó la ejecución |
| detenido en la línea N | el comando `stop` terminó la ejecución |
| Entrada cancelada, ningún paso ejecutado | se canceló un diálogo |

Tras una ejecución en esta ventana, la página muestra el mismo motivo que la barra de estado. El archivo acompañante solo guarda la línea y el tipo de motivo; tras un reinicio y para una ejecución desde otra ventana, los detalles como un nombre de archivo aparecen por eso como «…». La página se actualiza tras cada ejecución; el botón «Actualizar» la vuelve a leer.

## Ayuda en el editor

- **Resaltado:** en las líneas de comando, la palabra clave aparece en negrita, el texto entre comillas en color y los marcadores en cursiva, tanto en el editor como en la vista de lectura.
- **Indicación de comprobación:** el modo en vivo, la vista renderizada y la vista dividida muestran sobre el bloque el resultado de la comprobación: en verde «listo» o en rojo «Línea N: motivo», con «(+N más)» si hay varios hallazgos. Allí aparecen también los avisos sobre varios bloques y sobre un disparador todavía no compatible. La indicación sigue al texto poco después de cada cambio y muestra el mismo hallazgo que señala el inicio. Al imprimir, en una exportación y en un archivo incrustado, la línea de cabecera no aparece.

El resaltado y la indicación no cambian el texto del archivo.

## Límites

- **Solo dentro del área:** ningún comando lee ni escribe fuera de la raíz del área en la que se inició el workflow, tampoco mediante un marcador de posición.
- **Sin borrar, sin red, sin programas externos.**
- **Solo a mano:** un workflow nunca se inicia solo y únicamente se ejecuta mientras la aplicación está en marcha.
- `notify` muestra su texto en la barra de estado; no hay notificación del sistema operativo.
- **Las macros** siguen como están y pueden llamarse como paso; una macro es una secuencia de comandos en la configuración, un workflow un procedimiento como documento. **Los [bloques de script](scripts.md)** siguen siendo de solo lectura; un workflow no es un lenguaje de script general, sino un catálogo fijo de comandos.

## Etapas posteriores

Hay previstas otras etapas, sin que su alcance ni su fecha estén fijados: un inicio según un horario, comandos de mantenimiento como borrar con confirmación, poner y quitar etiquetas o marcar tareas como hechas, un inicio ante sucesos del área, condiciones y repeticiones, así como comandos para la [base de datos](database.md). La comprobación ya conoce las palabras clave de estos comandos y las señala como «solo estará disponible en una etapa posterior», para que un archivo así no se ejecute en parte.
