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

La creación produce la cadena de carpetas, el contenido de plantilla rellenado (una entrada vacía sin plantilla) y las propiedades de fecha en el frontmatter: los diarios de día reciben la fecha (`journal-date`), los periodos de varios días el inicio y el fin (`journal-start-date`, `journal-end-date`); los nombres de campo son configurables por diario y están disponibles para la consulta Perspective. Los marcadores de fecha de la plantilla se evalúan al inicio del periodo: `{{date}}` da la fecha del periodo, no el momento de creación. Cancelar cualquier diálogo de plantilla interrumpe la creación; no se crea ningún archivo.

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

Dentro de una entrada de diario muestra el periodo actual en grande (con una línea adicional como «Esta semana» para el periodo actual), encima los periodos superiores de la misma estantería (mes, trimestre, año, donde exista un diario; los huecos se omiten) y flechas al periodo anterior y siguiente. Los clics abren las entradas y crean las que faltan; la navegación se detiene en los límites de fechas del diario. **Las dos flechas hojean en la misma pestaña:** la entrada anterior deja sitio a la nueva, y la pestaña conserva su modo de vista, modo de edición, zoom, grupo y posición. Si lleva cambios sin guardar, aparece la misma pregunta que al cerrar; si la entrada vecina ya está abierta, se activa su pestaña. Los enlaces a los periodos superiores, en cambio, abren una pestaña propia, porque cambian de nivel en lugar de hojear. Aquí mismo, en la página del manual, el mismo bloque muestra el aviso para documentos fuera de un diario:

```perspective-journal-nav
```

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
