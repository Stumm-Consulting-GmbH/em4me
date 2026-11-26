# Diarios

Los diarios son series de documentos periódicos en un área: cada diario tiene una **granularidad** (día, semana, mes, trimestre o año), un **esquema de carpeta** y un **esquema de nombre** basados en marcadores de fecha, una plantilla opcional y propiedades de fecha automáticas en el frontmatter. Las **estanterías** agrupan varios diarios, por ejemplo del día al año de un cuaderno. Las entradas se abren o se crean en el primer acceso, mediante los comandos, el panel de calendario o el bloque de navegación.

Los diarios solo existen dentro de un área: la configuración vive en el archivo del área y todas las rutas son relativas a la raíz del área. Sin área, los comandos y el panel muestran un aviso. La funcionalidad es conmutable como extensión «Diarios» (Configuración → Extensiones).

## Definir diarios y estanterías

Configuración → Diarios muestra las estanterías del área; «Abrir» en una estantería lleva a sus diarios, «Cerrar estantería» vuelve a la vista general (la fila «Sin estantería» reúne los diarios sin asignación). Por diario:

- **Nombre** y, opcionalmente, una **estantería**.
- **Granularidad**: día, semana, mes, trimestre o año.
- **Esquema de carpeta** y **esquema de nombre**: literales más los marcadores de fecha de las plantillas (`{{date::…}}`), evaluados al inicio del periodo. Una vista previa muestra la ruta de ejemplo del periodo actual.
- **Plantilla** (opcional) de la carpeta de plantillas; la creación ejecuta la evaluación completa de marcadores, diálogos incluidos.
- **Fecha de inicio/fin** (opcional): antes o después no se crean entradas y la navegación se detiene allí.
- **Nombres de campo** de las propiedades de fecha automáticas.

Ejemplo de un diario semanal con subcarpetas por año:

| Campo | Valor |
| --- | --- |
| Granularidad | Semana |
| Esquema de carpeta | `Diario/{{date::yyyy}}` |
| Esquema de nombre | `{{date::kkkk-KWww}}` |

La entrada de la semana 28 de 2026 queda entonces en `Diario/2026/2026-KW28.md`. Para las semanas existen dos tokens de formato adicionales: `ww` (semana ISO, dos dígitos) y `kkkk` (año de la semana, que puede diferir del año natural en el cambio de año); las mayúsculas como `KW` quedan literales. Para los trimestres, el token `q` da el número del trimestre (1–4), por ejemplo `{{date::yyyy-Qq}}` → `2026-Q3`.

Un esquema modificado no renombra los archivos existentes; los puntos del calendario y la detección de entradas siguen el nuevo esquema. Los archivos periódicos existentes coinciden automáticamente si los esquemas de carpeta y nombre se configuran de forma idéntica.

## Abrir y crear entradas

- **Entrada de diario de hoy** (menú Archivo → Más funciones de archivo): abre o crea la entrada de hoy de un diario de día; con selección si hay varios diarios de día.
- **Entrada de diario para una fecha…** (menú Archivo → Más funciones de archivo): pide una fecha (AAAA-MM-DD) y el diario; el periodo es el de la fecha en la granularidad del diario.
- **Trasladar tareas abiertas a la entrada de diario actual** (menú Archivo → Más funciones de archivo): abre o crea la entrada del periodo en curso y traslada a ella las tareas abiertas de la última entrada; véase la sección «Trasladar tareas abiertas».

La creación produce la cadena de carpetas, el contenido de plantilla rellenado (una entrada vacía sin plantilla) y las propiedades de diario en el frontmatter. Una entrada lleva **cuatro** propiedades, sea cual sea su granularidad: el nombre del diario (`journal`), la fecha del periodo (`journal-date`), el inicio (`journal-start-date`) y el fin (`journal-end-date`). La fecha del periodo es siempre su **inicio**; en las entradas diarias, por tanto, las tres fechas coinciden. Los nombres de campo son configurables por diario y están disponibles para la consulta Perspective — como cada entrada lleva el mismo conjunto, una consulta no tiene que distinguir por granularidad. Los marcadores de fecha de la plantilla se evalúan al inicio del periodo: `{{date}}` da la fecha del periodo, no el momento de creación. Cancelar cualquier diálogo de plantilla interrumpe la creación; no se crea ningún archivo.

Una entrada **ya existente** se completa cuando le faltan propiedades, por ejemplo porque procede de otra aplicación o se creó a mano. Esto ocurre de dos maneras. Al **abrirla** mediante comando, calendario o bloque de navegación, las propiedades que faltan se añaden en silencio; si la entrada ya está completa, el archivo queda intacto. El comando **Completar propiedades del diario…** lleva todas las entradas existentes de un diario al mismo estado de una vez; antes indica cuántas entradas se comprueban y pide confirmación.

Crear y completar se comportan a propósito de forma distinta: al **crear**, la aplicación fija las propiedades y sustituye los campos homónimos de la plantilla. Al **completar** solo se añade lo que falta; un valor existente permanece aunque difiera del periodo, pues puede ser una corrección deliberada. Los campos ajenos y el resto del contenido quedan intactos en ambos casos, y un frontmatter dañado no se toca.

## Trasladar tareas abiertas

La aplicación traslada las tareas abiertas de la última entrada existente de un diario a la entrada del periodo en curso: en un diario de día, a la de hoy; en un diario de semana, a la de la semana en curso. Esto vale para diarios de cualquier granularidad, aunque la última entrada sea de hace días. La fuente es siempre la entrada anterior más reciente del mismo diario; las entradas futuras no cuentan.

**Configuración.** En el editor de un diario, en Configuración → Diarios, el grupo «Trasladar tareas abiertas» reúne tres ajustes:

- **Trasladar automáticamente al crear la entrada** (desactivado por defecto): con el interruptor activado, el traslado se produce en cuanto se crea la entrada del periodo en curso, sea cual sea el camino: los comandos, el panel de calendario, el bloque de navegación o de línea de tiempo, o la fecha de una tarjeta de un tablero Kanban. Abrir sin más una entrada existente o crear una entrada para otro periodo no hace nada.
- **En la entrada anterior**: «marcar como trasladada» (por defecto) pone allí la tarea trasladada en el estado «Trasladado» (`- [»] …`, página [Listas de tareas](tasks.md)); «eliminar» la borra de allí.
- **Solo de la sección** (vacío por defecto): el texto de un encabezado. Si el campo está relleno, solo se trasladan las tareas bajo ese encabezado y sus subencabezados; si está vacío, todas las tareas abiertas de la entrada.

**Comando a mano.** **Trasladar tareas abiertas a la entrada de diario actual** (menú Archivo → Más funciones de archivo, también en la paleta de comandos) traslada en cualquier momento a la entrada del periodo en curso, aunque el interruptor esté desactivado, y también a una entrada que ya existe; si la entrada falta, se crea. Si hay varios diarios, el comando pregunta cuál se quiere. Una segunda ejecución no traslada nada dos veces, porque las tareas trasladadas quedan marcadas o eliminadas en la entrada anterior.

**Dónde llegan las tareas.** Cada tarea llega a la nueva entrada bajo el encabezado bajo el que estaba en la anterior, al final de esa sección. Del mismo nombre significa el mismo texto, sin distinguir mayúsculas y minúsculas ni el nivel del encabezado; si el encabezado aparece varias veces en la nueva entrada, vale el primero. Si falta allí, se crea con las tareas al final de la entrada. Las tareas que en la entrada anterior estaban antes del primer encabezado van al final de la nueva. El orden se conserva.

**Subelementos.** Una tarea se muda con todo lo que está sangrado directamente debajo de ella, hasta la siguiente línea en blanco: subtareas abiertas y hechas, sus subelementos y líneas de nota. Lo que sigue sangrado después de una línea en blanco ya no le pertenece y se queda en la entrada anterior. Con «marcar como trasladada», cada línea de tarea del bloque mudado se marca en la entrada anterior, también una subtarea hecha; con «eliminar», desaparece el bloque entero. Una tarea abierta bajo una hecha o cancelada, sin tarea abierta por encima, se muda sola y queda sin sangría en la nueva entrada.

**Qué cuenta como abierto.** Las tareas cuyo estado es de tipo Abierto, En curso o En espera (página [Listas de tareas](tasks.md), sección «Estados propios, tipo y símbolo siguiente»); una casilla con un carácter para el que no hay ningún estado configurado también cuenta como abierta. Las tareas hechas y canceladas y las líneas de tipo No es una tarea se quedan donde están. Una línea marcada como «Trasladado» nunca se vuelve a trasladar, aunque ese estado esté desactivado. Las casillas en bloques de código, citas y tablas no son tareas y se quedan donde están. Un Filtro global definido también se aplica aquí.

Ejemplo con «marcar como trasladada». La entrada anterior antes:

```markdown
## Trabajo
- [ ] Redactar el presupuesto
  - [x] Conseguir las cifras
  - [ ] Esbozar el texto
- [x] Revisar la factura

## Personal
- [ ] Llevar la bici al taller
```

La nueva entrada, creada a partir de la plantilla:

```markdown
## Trabajo

## Personal
```

La nueva entrada después del traslado:

```markdown
## Trabajo

- [ ] Redactar el presupuesto
  - [x] Conseguir las cifras
  - [ ] Esbozar el texto

## Personal

- [ ] Llevar la bici al taller
```

La entrada anterior después del traslado:

```markdown
## Trabajo
- [»] Redactar el presupuesto
  - [»] Conseguir las cifras
  - [»] Esbozar el texto
- [x] Revisar la factura

## Personal
- [»] Llevar la bici al taller
```

Con «eliminar», en la entrada anterior solo quedarían después los dos encabezados y «Revisar la factura».

**Reglas de detalle.**

- **Cambios sin guardar:** si la entrada anterior o la nueva tiene cambios sin guardar en cualquier ventana, no se traslada nada, y la barra de estado nombra la entrada. En el traslado automático, la nueva entrada se crea entonces sin las tareas; después de guardar, el comando a mano recupera el traslado.
- **Funciones desactivadas:** si la extensión «Tareas» está desactivada, no se traslada nada, porque entonces nada cuenta como tarea; el comando lo indica en la barra de estado. Si la extensión «Diarios» está desactivada, el comando y los ajustes desaparecen, y no se traslada nada.
- **Solo la última entrada:** la fuente es exactamente la entrada anterior más reciente. Lo que quedó abierto en entradas aún más antiguas se queda allí.
- **La tarea ya está:** si la plantilla trae una tarea cada día y la misma tarea sigue abierta en la entrada anterior, no llega una segunda vez a la nueva; en la anterior se marca o se elimina de todos modos. Esto solo vale si la línea es idéntica carácter por carácter, está bajo el mismo encabezado y no tiene nada debajo en la entrada anterior. Si allí ha recibido subelementos, se muda con ellos y entonces aparece dos veces en la nueva entrada.
- **Sección no encontrada:** si «Solo de la sección» nombra un encabezado que la entrada anterior no tiene, no se traslada nada, y la barra de estado lo indica, también en el traslado automático.
- **Mensajes:** después de un traslado, la barra de estado indica el número de tareas y la entrada de la que proceden. Que no haya entrada anterior o ninguna tarea abierta solo lo comunica el comando a mano.
- **Listas numeradas y encabezados vacíos:** una tarea de una lista numerada conserva su número; no se renumera nada. Si tras «eliminar» queda en la entrada anterior un encabezado sin contenido, se mantiene.
- **Límites:** como máximo 500 tareas por traslado, entradas de hasta 5 MB y como máximo 20 000 archivos Markdown en las carpetas del diario; por encima no se traslada nada, y la barra de estado lo indica.
- **Vuelta atrás:** no hay un comando propio para deshacer. Ambas entradas reciben una entrada en su [Historial del documento](history.md), donde esté activado para el documento; con «marcar como trasladada», un clic en la casilla vuelve a abrir la tarea en la entrada anterior.
- **Sin enlace:** la línea marcada en la entrada anterior no recibe ningún enlace a la nueva entrada.

## Panel de calendario

El panel de calendario (símbolo de calendario en la barra de estado) muestra la vista mensual del área:

- Cabecera de días con **inicio en lunes**, a la izquierda la **columna de semanas ISO**.
- Los **puntos** marcan los días con una entrada diaria existente; **hoy** aparece resaltado.
- Un clic en un **día** abre o crea la entrada diaria; un clic en la **celda de semana**, la entrada semanal; con varios diarios coincidentes aparece una selección.
- El filtro de la cabecera limita a **todos los diarios**, una **estantería** o un **solo diario**; las flechas hojean los meses y el botón Hoy vuelve al mes actual.

## Bloque de navegación

El bloque de navegación se coloca en la entrada como bloque de código, típicamente mediante la plantilla del diario:

````markdown
```perspective-journal-nav
```
````

Dentro de una entrada de diario muestra el periodo actual en grande (debajo, la situación temporal: «Hoy» o «Esta semana» para el periodo en curso, y si no su distancia — «ayer», «hace 3 semanas», «dentro de 2 años», siempre en la unidad del periodo), encima los periodos superiores de la misma estantería (mes, trimestre, año, donde exista un diario; los huecos se omiten) y flechas al periodo anterior y siguiente. Los clics abren las entradas y crean las que faltan; la navegación se detiene en los límites de fechas del diario. **Las dos flechas hojean en la misma pestaña:** la entrada anterior deja sitio a la nueva, y la pestaña conserva su modo de vista, modo de edición, zoom, grupo y posición. Si lleva cambios sin guardar, aparece la misma pregunta que al cerrar; si la entrada vecina ya está abierta, se activa su pestaña. Los enlaces a los periodos superiores, en cambio, abren una pestaña propia, porque cambian de nivel en lugar de hojear. **Junto a cada flecha está el nombre de su periodo de destino**, para que se vea adónde lleva; si el bloque se estrecha, ese nombre cede y el botón permanece. **Un punto bajo un periodo significa: esa entrada ya existe** — la misma marca que en el panel de calendario y en la línea de tiempo. Aparece en todos los periodos del bloque, también en los superiores y en ambos vecinos; donde falta, el clic crea la entrada. Aquí mismo, en la página del manual, el mismo bloque muestra el aviso para documentos fuera de un diario:

```perspective-journal-nav
```

Ambos bloques de diario, este y la línea de tiempo más abajo, comprueban además si se refieren a la entrada mostrada. Si no es así, o si la entrada ya no existe, un mensaje de error sustituye a la visualización: un período incorrecto no sería reconocible como tal y por eso se omite.

En la exportación a PDF y portable, el bloque se sustituye por la etiqueta estática del periodo, sin enlaces de creación.

## Bloque de línea de tiempo

El bloque de línea de tiempo muestra el resumen de periodos como calendario dentro de la entrada. Conoce cuatro modos:

````markdown
```perspective-journal-timeline
mode: month
```
````

| Modo | Representación |
|---|---|
| `week` | la semana de la entrada en una sola fila |
| `month` | un calendario mensual |
| `quarter` | tres calendarios mensuales uno junto a otro |
| `year` | doce calendarios mensuales como cuadrícula anual |

`calendar` es la escritura equivalente de `year` (procede de material importado). Sin indicación `mode` se aplica `month`. Un valor desconocido aparece como aviso dentro del bloque, para que una errata no pase inadvertida.

**Estructura.** La columna de números de semana está a la izquierda y el encabezado de días arriba, empezando por el lunes. Los días con entrada existente llevan un punto y el día de hoy está resaltado. La línea de encabezado muestra los periodos por encima del nivel del calendario, y el nivel del modo aparece resaltado: el modo semana resalta la semana, el modo mes el mes, el modo trimestre el trimestre y el modo año el año.

**Clic.** Cada elemento abre su periodo: el día abre la entrada diaria, la semana la entrada semanal, el nombre del mes y las etiquetas del encabezado su periodo correspondiente. Las entradas que falten se crean en el proceso. Lo que cuenta son los diarios del estante al que pertenece la entrada; donde ese estante no tiene diario para un nivel, la etiqueta es solo informativa. Fuera de los límites de fechas de un diario no se crea ninguna entrada.

El periodo que muestra el bloque sigue a la entrada en la que se encuentra, no al día de hoy: en la nota semanal de una semana pasada, `month` muestra el mes de esa semana.

Igual que el bloque de navegación, este bloque aparece como aviso fuera de una entrada de diario:

```perspective-journal-timeline
mode: week
```

La exportación a PDF imprime el calendario tal como aparece en pantalla. La exportación portable lo convierte en una tabla por mes, con un punto en los días que tienen entrada y sin enlaces de creación.

## Reglas de semana

Las semanas siguen estrictamente ISO 8601: la semana empieza el lunes y la primera semana de un año es la que contiene el primer jueves. El año de la semana (`kkkk`) puede por eso diferir del año natural (`yyyy`) en el cambio de año; el 1 de enero de 2021, por ejemplo, pertenece a la semana 53 del año de semana 2020.
