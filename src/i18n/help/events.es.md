# Eventos

La gestión de eventos mantiene **las citas, los cumpleaños, los aniversarios y las fechas de proyecto** directamente en el documento: como bloque de eventos integrado con sus propias filas de datos o como agregación mediante las propiedades del frontmatter a partir de los archivos del área. Cada entrada muestra la **diferencia de tiempo respecto a hoy** en cuatro escalones, además de hitos, recurrencia anual, filtros, cuatro vistas y vínculos entre eventos.

La función pertenece a las [extensiones internas](extensions.md) («Eventos») y requiere los [Perfiles de propiedades](property-profiles.md): si esa extensión se desactiva, la gestión de eventos también se desactiva. Desactivado, el bloque sigue siendo un bloque de código normal.

## Estructura del bloque

Un bloque de código con la etiqueta de lenguaje `perspective-events` contiene directivas de cabecera opcionales y filas de datos; el comando «Insertar bloque de eventos» (mediante la paleta de comandos, se puede asignar un atajo en los ajustes) inserta un bloque vacío en la posición del cursor:

````markdown
```perspective-events
| 2020-01-01 | | Inicio del proyecto Alpha | projekt | Nota de inicio | | | | |
| 1990-03-10 | | Cumpleaños de Anna | geburtstag | | x | | | |
| 2024-11-11 | 2025-02-11 | Fase del proyecto | projekt | | | | | |
```
````

Renderizada, la tabla de eventos aparece con distintivos de categoría y una columna de diferencia de tiempo:

```perspective-events
| 2020-01-01 | | Inicio del proyecto Alpha | projekt | Nota de inicio | | | | |
| 1990-03-10 | | Cumpleaños de Anna | geburtstag | | x | | | |
| 2024-11-11 | 2025-02-11 | Fase del proyecto | projekt | | | | | |
```

Cada fila de datos lleva nueve celdas en un orden fijo:

| Celda | Campo | Contenido |
|---|---|---|
| 1 | Fecha | fecha `AAAA-MM-DD` |
| 2 | Fin | fecha opcional para intervalos de tiempo |
| 3 | Evento | el texto del evento (obligatorio) |
| 4 | Categoría | uno de los ocho valores de categoría |
| 5 | Notas | multilínea, salto de línea como `\n` |
| 6 | anual | `x` = recurrencia anual |
| 7 | Identificador | asignado automáticamente en cuanto se vincula la entrada |
| 8 | Predecesor | lista de identificadores, separados por comas |
| 9 | Sucesor | lista de identificadores, separados por comas |

Un `|` en el texto se escribe `\|`, una barra invertida `\\`. Los problemas de valor de entradas individuales (fecha ausente o no válida, fin antes del inicio, categoría desconocida) son **avisos leves**: la entrada permanece visible. Los errores de estructura del bloque (directiva desconocida, demasiadas celdas) bloquean la edición hasta que se corrija el código fuente.

## Modelo de campos: el perfil interno

Los campos de evento se definen como un **perfil de propiedades interno** fijo llamado `Ereignis`. Aparece automáticamente en la resolución de perfiles y en la lista de perfiles de los ajustes (marcado, no modificable) y actúa incluso sin una carpeta de perfiles configurada. Detalles sobre el mecanismo de perfiles en la página [Perfiles de propiedades](property-profiles.md).

| Campo | Tipo |
|---|---|
| `event-date` | Fecha |
| `event-end` | Fecha |
| `event-text` | Texto |
| `event-category` | selección entre los ocho valores de categoría |
| `event-notes` | texto multilínea |
| `event-recurring` | Booleano |
| `event-predecessors` | Lista |
| `event-successors` | Lista |

Los ocho valores de categoría son `geburtstag`, `todestag`, `jahrestag`, `jubilaeum`, `projekt`, `termin`, `erinnerung` y `sonstiges`: valores técnicos en el código fuente, que se muestran como nombres localizados en distintivos de colores.

## Editar en la tabla

La tabla es directamente editable en la vista dividida, en el modo en vivo **y en la vista de lectura** (las páginas del manual y las incrustaciones permanecen en modo de solo lectura). Cada confirmación escribe de vuelta en el bloque de código, como un único paso de deshacer.

- **Añadir**: fila de formulario bajo la tabla; el texto del evento es el campo obligatorio, el símbolo 📅 abre un selector de calendario para los campos de fecha.
- **Editar**: la acción de lápiz de la fila abre los campos de entrada; `Intro` confirma, `Esc` descarta.
- **Duplicar**: crea una copia de la entrada, deliberadamente sin vínculos.
- **Eliminar**: tras confirmación; los vínculos de otras entradas hacia la eliminada también se depuran.

### Columna de diferencia de tiempo

La diferencia respecto a hoy aparece en cuatro escalones: años, meses, semanas y días, calculados con exactitud de calendario, con el sentido «pasado», «próximo» u «hoy». Si se define un fin, la columna muestra además la duración del intervalo. En caso de recurrencia anual, una cuenta atrás corre hasta la próxima aparición; el 29 de febrero cae el 28 en los años no bisiestos.

### Hitos

Los eventos informan de distancias redondas como hitos: múltiplos de mil en días, múltiplos de cien en semanas, múltiplos de cien en meses, años completos así como los años de jubileo 10, 18, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90 y 100.

## Ordenar y filtrar

Un clic en la cabecera de columna ordena por fecha, fin, evento o categoría (un nuevo clic invierte el sentido; por defecto, fecha descendente, los valores vacíos se colocan al final). La barra de filtros combina la búsqueda de texto, la selección de categoría, el periodo (con preajustes como «Hoy», «Esta semana», «Próximos 30 días») y los indicadores «solo con notas», «solo recurrentes», «solo con duración»; un contador muestra las entradas visibles.

Los filtros con nombre pueden guardarse como directiva `filter:` en el bloque y aplicarse desde la barra:

````markdown
```perspective-events
filter: Recurrentes := recurring=x
filter: Cumpleaños := categories=geburtstag; from=2026-01-01
| 1990-03-10 | | Cumpleaños de Anna | geburtstag | | x | | | |
```
````

La directiva lleva pares `Nombre := Clave=Valor`, separados por `;`: `text`, `categories` (separados por comas, `none` = sin categoría), `from`, `to` y los indicadores `notes`, `recurring` y `timespan` (`x` = activado). Un `;` en el valor se escribe `\;`.

## Vistas

El conmutador sobre el bloque alterna entre **Tabla, Panel, calendario mensual, calendario semanal y Cronología**; la elección se escribe en el bloque como directiva `view:` (`table`, `dashboard`, `month`, `week`, `timeline`). Un clic en un evento en una vista adicional salta a la fila de la tabla.

```perspective-events
view: dashboard
| 1990-03-10 | | Cumpleaños de Anna | geburtstag | | x | | | |
| 2026-07-20 | | Taller | termin | | | | | |
| 2026-08-30 | | Fiesta de verano | jahrestag | | x | | | |
```

El panel reúne los eventos próximos, los hitos alcanzados y cercanos y la distribución por categoría; los calendarios colocan las entradas en una cuadrícula mensual o semanal con una marca de hoy; la cronología agrupa cronológicamente.

## Agregación mediante frontmatter

En lugar de sus propias filas de datos, el bloque puede recopilar los eventos **a partir de los archivos del área**: una directiva `query:` marca la agregación, entonces no se permiten filas de datos. El conjunto base son todos los archivos del área cuyo campo de asignación nombra el perfil `Ereignis`; los datos de evento provienen de sus campos de frontmatter (`event-date`, `event-text`, …).

````markdown
```perspective-events
query: WHERE event-category = 'geburtstag'
```
````

El texto de consulta usa el lenguaje de cláusulas de la [Consulta Perspective](frontmatter-query.md) (`FROM`, `WHERE`, comparaciones, funciones); una consulta vacía recopila todos los archivos con el perfil `Ereignis`. Los valores de texto van entre comillas (`'geburtstag'`): una palabra desnuda sería una referencia de campo.

- **Clic en una fila** abre el archivo de origen; la procedencia de cada entrada permanece visible.
- **La edición escribe de vuelta**: las modificaciones en la tabla agregada llegan al frontmatter del archivo de origen, aunque no esté abierto. Si el archivo de origen está abierto con cambios sin guardar, un aviso remite allí; si se modificó entre tanto en el disco, no se escribe nada (aviso de conflicto).
- **Límites**: en la agregación no existen añadir ni eliminar: los nuevos archivos de evento surgen como documentos normales con el perfil `Ereignis`. La agregación necesita un área abierta con índice.

## Vínculos

Los eventos pueden encadenarse como **predecesores y sucesores**: en el bloque mediante identificadores asignados automáticamente (celdas 7 a 9), en la agregación mediante los campos de lista `event-predecessors`/`event-successors` con referencias de archivo. Ambos lados se mantienen siempre juntos.

- El **indicador de vínculo** en la columna de fecha abre una ventana emergente con las referencias: salto a la entrada vinculada o apertura del archivo vinculado, en el contexto editable además una búsqueda y un conmutador predecesor/sucesor.
- Los identificadores solo surgen con el primer vínculo; la duplicación no reproduce ningún vínculo, la eliminación depura ambos lados.
- Los vínculos solo conectan entradas del mismo mundo: entradas de bloque entre sí o archivos entre sí, no a través de la frontera.
- Las referencias huérfanas (destino eliminado o renombrado) aparecen como aviso leve con un botón para quitarlas.

## Exportación

La exportación portable convierte los bloques de eventos integrados en tablas estáticas con textos ya generados en el idioma de exportación (la columna de diferencia de tiempo calcula en el momento de la exportación); los bloques de agregación permanecen como bloque de código, porque su contenido depende del área.
