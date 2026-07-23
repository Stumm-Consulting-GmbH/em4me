# Herramientas

Nueve ayudantes para el trabajo diario con el texto: linter, búsqueda, buscar y reemplazar, editor de tablas, exportación a PDF, paleta de comandos, entrada de fecha y hora, reloj con alarmas, temporizador y cronómetro, línea de título. Los accesos y atajos predeterminados figuran en la [tabla de funciones](functions.md).

## Linter Markdown

El linter marca discretamente siete defectos típicos en el editor (vistas Código, Dividida y En vivo); pasar el ratón sobre una marca muestra la explicación. Los ejemplos están en bloques de código para que esta página quede libre de marcas.

| Regla | Infracción | Corrección |
|---|---|---|
| URL desnuda | `Ver https://example.org al respecto.` | `Ver [el ejemplo](https://example.org) al respecto.` |
| Texto de enlace vacío | `[](https://example.org)` | `[Ejemplo](https://example.org)` |
| Texto alternativo ausente | `![](imagen.png)` | `![Boceto de arquitectura](imagen.png)` |
| Enlace wiki sin destino | `[[Nombre-erróneo]]` | `[[Plan de proyecto]]` (archivo existente) |
| Ancla wiki rota | `[[Plan de proyecto#Falta]]` | `[[Plan de proyecto#Hitos]]` (ancla existente) |
| Tipo de callout desconocido | `> [!importante] Título` | `> [!warning] Título` (tipo de la lista blanca) |
| Marcador de comentario sin pareja | `Texto %% sin cierre` | `Texto %%privado%% sigue` o `\%%` para un `%%` literal |

## Búsqueda de texto completo

La búsqueda (predeterminado `Ctrl+F`) encuentra en vivo al teclear; el ámbito de búsqueda sigue la vista (texto fuente o vista previa). Dos conmutadores la amplían: `.*` para expresiones regulares, `Aa` para mayúsculas/minúsculas. `F3` y `Mayús+F3` saltan entre resultados, en la barra de búsqueda también `Intro` / `Mayús+Intro`.

El signo de interrogación de la barra abre una referencia rápida de regex; los patrones más importantes:

| Patrón | Significado |
|---|---|
| `.` | cualquier carácter |
| `*` / `+` / `?` | 0+, 1+ o 0–1 repeticiones |
| `^` / `$` | inicio / fin de línea |
| `\d` / `\w` / `\s` | dígito / carácter de palabra / espacio |
| `[abc]` / `[^abc]` | uno / ninguno de los caracteres |
| `a\|b` | a o b |

## Buscar y reemplazar

En modo edición (predeterminado `Ctrl+H`) se añade una fila de reemplazo. Con el conmutador regex activo funcionan las referencias hacia atrás en el texto de reemplazo: `$1`, `$2` para grupos capturados. «Reemplazar todo» es una sola transacción, un único `Ctrl+Z` lo deshace todo junto.

```text
Buscar:     (\d{2})\.(\d{2})\.(\d{4})
Reemplazar: $3-$2-$1
Efecto:     12.06.2026 → 2026-06-12
```

## Editor de tablas

En tablas pipe, `Tab` salta a la celda siguiente y `Mayús+Tab` a la anterior. Al final de la última fila, `Tab` o `Intro` crean una nueva fila con el mismo número de columnas; dos `Intro` en una fila vacía salen de la tabla. También se reconocen tablas sin bordes (sin pipes exteriores). Las operaciones de estructura (mover, insertar y eliminar filas y columnas, alineación, transposición) las ofrece el submenú **Tabla** en el [Menú contextual del editor](context-menu.md).
## Exportación a PDF

«Archivo → Exportar como PDF…» (predeterminado `Ctrl+Mayús+P`) imprime el contenido de la pestaña activa en un archivo PDF. La exportación sigue la vista activa: la vista de código fuente imprime el Markdown en bruto con resaltado de sintaxis, incluidos los números de línea si están activados en la pestaña; los modos renderizado, dividido y en vivo imprimen el documento formateado (dividido y en vivo cambian internamente a la vista renderizada para imprimir y después restauran la vista). El PDF es siempre claro, incluso si la aplicación usa el tema oscuro; los diagramas Mermaid se redibujan en colores claros y siguen siendo gráficos vectoriales. Fórmulas, resaltado de código, avisos y tablas perspective aparecen como en la vista previa.

El tamaño de página, la orientación y los márgenes se configuran en la sección «Exportación» de la configuración (Archivo → Configuración…); el valor predeterminado es A4 vertical con márgenes normales. Al fluir el contenido entre páginas, los bloques de código, tablas, diagramas, fórmulas y avisos se mantienen juntos en lo posible; los encabezados no quedan solos al final de una página.

## Paleta de comandos

«Ver → Paleta de comandos» (predeterminado `Ctrl+K`) abre una ventana emergente filtrable con todos los comandos de la aplicación. Al teclear se filtra la lista por subcadena sobre los nombres de comando; las teclas de flecha mueven la selección, `Intro` o un clic ejecuta el comando y cierra la ventana, `Esc` cancela. A la derecha de cada comando figura el atajo de teclado actualmente activo, incluidas tus propias reasignaciones de la sección de configuración «Atajos de teclado». Los comandos no disponibles en el contexto actual (por ejemplo, comandos de área sin un área abierta) aparecen atenuados y no se pueden ejecutar.

La paleta es el acceso fugaz por teclado al registro de comandos; para accesos propios permanentes — botones de la barra de estado, entradas de menú contextual y macros — véase la página [Colocación de comandos](command-placement.md).

## Entrada de fecha y hora

Una ventana emergente de calendario inserta una fecha y una hora en la posición del cursor, también en el campo de nota. Tres comandos la abren: predeterminado `Ctrl+Alt+T` para fecha y hora, predeterminado `Ctrl+Alt+D` para solo fecha, predeterminado `Ctrl+Alt+U` para solo hora. Los formatos insertados son `2026-07-10`, `14:30` o combinado `2026-07-10 14:30`.

### Manejar la ventana

A la izquierda hay un calendario mensual con una columna de semanas y el lunes como inicio de semana; las flechas pasan los meses, `Hoy` salta al día actual. A la derecha, la hora se presenta como cuatro dígitos ajustables por separado (decenas y unidades de las horas, decenas y unidades de los minutos) con dos puntos en medio; `Ahora` fija la hora actual. La fecha y la hora se activan por separado, permaneciendo activa al menos una parte.

El teclado maneja el calendario: las flechas mueven un día (izquierda, derecha) o una semana (arriba, abajo), `Re Pág` y `Av Pág` un mes, `Intro` confirma, `Esc` cancela. Un clic fuera de la ventana también cancela.

En la hora, un clic selecciona uno de los cuatro dígitos: los botones de flecha ▲/▼ y las teclas de flecha arriba/abajo ajustan el dígito activo con vuelta completa, izquierda/derecha cambian de dígito, y las teclas numéricas lo fijan directamente y avanzan al siguiente. Así no se pueden introducir horas no válidas.

### Disparador de escritura

Dos puntos y coma `;;` en el editor abren el selector combinado en ese punto. La confirmación reemplaza los dos caracteres por el valor elegido, `Esc` los deja en su sitio. En código, fórmulas y frontmatter la secuencia no dispara nada; en las celdas de una tabla Perspective sí funciona, porque allí la secuencia es contenido y no código.

### Valores clicables en el editor

En el editor, tanto en modo código como en vivo, la aplicación reconoce los valores en los tres formatos y los subraya con un discreto punteado. Un clic abre el selector precargado con el valor, los conmutadores según su forma; la confirmación lo reemplaza en el sitio. No son clicables los valores

- en código, fórmulas y frontmatter,
- en la línea en la que está actualmente el cursor,
- en destinos de enlace wiki,
- detrás de los marcadores de fecha de las [listas de tareas](tasks.md), que allí aparecen como insignia.

La línea con el cursor queda a propósito sin decoración: allí transcurre la edición normal del texto, y el valor vuelve a ser clicable en cuanto el cursor abandona la línea. En las vistas de solo lectura no hay valores clicables.

El reconocimiento capta a propósito también los valores escritos a mano: así toda fecha y hora en estos formatos se vuelve editable.

### Extensión

Esta función pertenece a la extensión conmutable «Entrada de fecha y hora» (Configuración → Extensiones). Si se desactiva, desaparecen los comandos, el disparador de escritura y la decoración al hacer clic; los valores siguen siendo texto normal. Los formatos coinciden con los marcadores de fecha de las listas de tareas, de modo que ambas funciones comparten la misma notación.

## Reloj, alarmas, temporizador y cronómetro

Un panel lateral muestra la hora como reloj analógico, como indicación digital y con una línea de fecha; tamaño, tipo de esfera, segundero, formato horario y de fecha así como la semana natural se eligen en los ajustes. Una barra en la parte superior del panel alterna entre cuatro vistas: reloj, alarma, temporizador y cronómetro. La elección vale por columna de la barra lateral y sobrevive a un reinicio.

### Tamaño

Tres niveles dimensionan esfera y texto conjuntamente, de modo que el panel forme una sola imagen. El ajuste está en el bloque «Visualización» de los ajustes y vale también cuando la esfera está desactivada y solo funciona la indicación digital. Hora, línea de fecha y semana natural crecen juntas y mantienen sus proporciones.

El nivel pequeño está pensado para columnas estrechas, el grande para una columna ensanchada. Si una línea no cabe en la columna, no se parte en dos líneas sino que se recorta a izquierda y derecha; el centro sigue siendo legible. Para verla entera, ensanchar la columna o elegir un nivel más pequeño.

### Alarmas

El modo alarma admite tantas alarmas como se quiera. Al crear una se eligen la hora, un nombre y el patrón de repetición: una vez, a diario o en días concretos de la semana. La hora pasa por un control de dígitos, de modo que una entrada inválida no es posible. Cada alarma se activa por separado sin borrarla; una alarma única se desactiva tras sonar.

Una alarma vencida muestra un aviso que se puede confirmar o posponer una duración configurable (Ajustes → Reloj). Si la ventana no está en primer plano se añade una notificación del sistema; al pulsarla la ventana pasa al frente.

### Temporizador y cronómetro

El modo temporizador lista los temporizadores con tiempo restante y barra de progreso. Tres botones inician duraciones habituales de inmediato, las duraciones propias pasan por un control de horas, minutos y segundos. Iniciar, pausar y reiniciar actúan por temporizador. El tiempo restante se calcula a partir de marcas de tiempo en lugar de descontarse: un temporizador sigue por tanto correctamente aunque la ventana estuviera en segundo plano o la aplicación se cerrara entretanto. Un temporizador finalizado muestra un aviso y se puede confirmar o iniciar de nuevo.

El cronómetro cuenta hacia delante, con centésimas. Además de iniciar, pausar y reiniciar registra tiempos de vuelta; la vuelta más reciente está arriba.

### Límite

Las alarmas y los temporizadores solo suenan con la aplicación en marcha. Con la aplicación cerrada no hay aviso, y una hora de alarma transcurrida entretanto no se recupera en el siguiente inicio. Un temporizador en marcha, en cambio, sigue contando correctamente y suena en cuanto se agota el tiempo restante.

### Extensión

El reloj pertenece a la extensión conmutable «Reloj» (Ajustes → Extensiones). Desactivada, desaparecen el panel, el botón de la barra de estado, la entrada de menú y el área de ajustes; tampoco se vigilan alarmas ni temporizadores.

## Línea de título

Encima del documento aparece el nombre de archivo sin extensión como una línea de título compacta, con aspecto de encabezado — sin número de línea, fija al desplazarse y en las cuatro vistas (en la vista dividida una sola vez, encima de la columna del texto fuente). Las subpáginas muestran su nombre lógico completo en notación con barras, los documentos sin nombre el marcador de posición «Sin título». Las páginas del manual y del sistema no tienen línea de título.

### Cambiar nombre directamente

Un clic en el título (o `Intro` o `F2` en la línea con el foco) lo hace editable; `Intro` o un clic fuera confirma, `Esc` descarta, un texto sin cambios termina en silencio. La confirmación renombra el archivo mediante el mecanismo de cambio de nombre normal: los enlaces al archivo se actualizan según la opción «Actualizar los enlaces en otros archivos», el archivo acompañante se traslada con él, una página con subpáginas se lleva todo su árbol de subpáginas. Los cambios sin guardar se guardan antes. El diálogo de cambio de nombre (Archivo → Cambiar nombre…) permanece como vía con vista previa e informe de resultados.

Una indicación directamente debajo del título muestra los nombres no válidos (vacíos, caracteres no permitidos) y las colisiones de nombres; el archivo permanece entonces sin cambios. En los documentos sin nombre, confirmar un nombre activa «Guardar como» con ese nombre precargado.

### Extensión

La línea de título pertenece a la extensión conmutable «Línea de título» (Configuración → Extensiones). Si se desactiva, la línea desaparece por completo; el nombre de archivo sigue visible mediante el título de la pestaña y el título de la ventana, y el cambio de nombre sigue accesible a través del diálogo.
