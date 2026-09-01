# Sistemas de calendario

Cronologías de libre definición para mundos de fantasía y casos de uso especiales: cada área puede llevar sus propios bloques de calendario, cuyos calendarios pueden estar construidos de forma completamente distinta al calendario estándar habitual — con sus propias longitudes de mes, reglas intercalares, ciclos semanales y épocas. La función pertenece a la extensión «Sistemas de calendario» y solo rige en el contexto de un área: sin un área abierta, la sección de configuración y el comando de inserción están inactivos.

## Concepto

### Bloques

Un bloque es un mundo temporal autónomo con un nombre y cualquier número de calendarios. Los calendarios de un mismo bloque se ejecutan en paralelo, pueden ponerse en correspondencia y convertirse entre sí. Los bloques distintos deliberadamente no tienen nada que ver entre sí — entre ellos no hay ni conversión ni comparabilidad.

### Calendarios y niveles

Un calendario se compone de una lista ordenada de niveles, el más pequeño primero (por ejemplo segundo → minuto → hora → día → mes → año), agrupados en grupos de niveles con nombre (en la plantilla estándar «Tiempo» y «Fecha»). Cada nivel describe su relación con el inmediatamente inferior mediante uno de los cinco tipos de relación:

- **Factor fijo** — un número fijo de unidades inferiores, por ejemplo 60 segundos por minuto.
- **Tabla de longitudes** — unidades con longitudes individuales, por ejemplo tres meses de 30, 30 y 35 días; los nombres de fila de la tabla son al mismo tiempo los nombres de posición (nombres de mes).
- **Regla intercalar** — reglas de ciclo según el patrón «intercalación cada 4, excepto cada 100, excepto cada 400», con indicación de la unidad prolongada y de la prolongación.
- **Ciclo independiente** — el patrón semanal: un ciclo de longitud fija corre más allá de los límites de mes y de año, anclado a una fecha de referencia, opcionalmente con una regla de numeración (el número del ciclo se rige por el año en que cae el día determinante del ciclo).
- **Agrupación** — una síntesis puramente calculada, por ejemplo trimestres de tres meses cada uno.

### Épocas

Cada calendario tiene exactamente una época pasada abierta (cuenta hacia atrás), cualquier número de épocas intermedias cerradas y una época futura abierta. Los límites se encadenan sin huecos y se sitúan en una fecha sin componente de hora; el conteo de años empieza en 1 en cada época, no hay año 0. Un límite de época puede caer en mitad del año — el año 1 de la nueva época es entonces un año parcial.

### Conversión mediante el eje del bloque

Cada bloque posee un eje temporal neutro. Cada calendario se proyecta sobre ese eje mediante un ancla (el instante del calendario que se sitúa en el punto cero del eje) y una escala (la duración de su unidad más pequeña en unidades del eje, como fracción de numerador y denominador). Las conversiones entre calendarios pasan siempre por el eje del bloque y redondean de forma determinista al nivel más pequeño del calendario de destino.

## Mantenimiento en la configuración

La sección de configuración «Sistemas de calendario» muestra los bloques del área abierta en dos niveles: la vista general gestiona los bloques (añadir, renombrar, abrir, eliminar); la vista de detalle de un bloque muestra sus calendarios como formularios con editores para niveles, épocas, ciclos, agrupaciones y el eje del bloque.

- El botón **«Insertar el calendario estándar como plantilla»** crea una definición completa con doce meses, una regla intercalar y un ciclo de siete días — como punto de partida para adaptar y como ejemplo vivo de todos los tipos de relación.
- La **vista previa en vivo** muestra un valor de ejemplo de libre elección de forma canónica y con nombres; mientras una definición esté incompleta, el editor lo señala como un aviso (validación leve), y solo al aplicar se verifica de forma estricta.
- Las definiciones se guardan en el archivo del área (archivo `Area_Settings.mdda`) y rigen para todas las ventanas del área.

La edición deliberadamente nunca está bloqueada: se permiten los cambios de estructura en calendarios ya utilizados. Los valores del documento que por ello quedan no válidos se conservan sin cambios y se marcan de forma visible.

## Valores en el documento

Un valor de calendario figura en forma canónica en el texto fuente:

```text
@{Nombre del calendario: Año-Mes-Día}
@{Nombre del calendario: Año-Mes-Día Abreviatura de época}
@{Nombre del calendario: Año-Mes-Día Hora:Minuto:Segundo}
```

El primer signo de dos puntos separa el nombre del calendario del valor. Los segmentos de fecha van de mayor a menor; la abreviatura de época se omite en la época más reciente, y la parte de hora se omite cuando todos los segmentos de tiempo están en su mínimo. En la vista renderizada, el modo en vivo y la exportación portable, el valor aparece como un distintivo con los nombres de la definición (por ejemplo nombres de mes y abreviatura de época).

Si el calendario indicado no está definido en el área o el valor no es válido, el texto fuente permanece sin cambios y el valor se marca de forma visible — como este ejemplo, cuyo calendario no existe en esta página del manual:

@{Calendario de ejemplo: 500-2-09 ZZ}

En los bloques de código y los fragmentos de código, la sintaxis queda intacta: `@{Calendario de ejemplo: 500-2-09 ZZ}`.

## Insertar y editar

- **Insertar:** el comando «Insertar fecha de calendario» (paleta de comandos; se puede asignar un atajo) abre el selector e inserta el instante elegido de forma canónica en el cursor. Está activo en cuanto el área abierta define al menos un calendario.
- **Editar:** los valores son clicables en modo código y en vivo; el clic abre el selector precargado con el valor, y aplicar lo sustituye en el sitio en un único paso de deshacer. En la línea con el cursor, **Ctrl-clic** abre el selector mientras que el clic simple coloca allí el cursor.

## Selector

El selector de calendarios personalizados funciona de forma análoga al selector de fecha estándar:

- Selecciones de cabecera para **bloque**, **calendario** y **época** (las selecciones con una sola entrada se omiten). Un cambio de calendario convierte el instante elegido; un cambio de bloque salta al ancla del calendario de destino.
- La **cuadrícula** surge de la estructura de niveles: con un ciclo semanal definido, como cuadrícula de columnas (longitud del ciclo = número de columnas, nombres de posición como cabecera, columna de números en caso de regla de numeración); sin ciclo, como lista continua de los días de la unidad.
- **Navegación:** los botones de flecha exteriores desplazan la unidad más grande (el año), los interiores la unidad de la cuadrícula (el mes); las teclas de flecha navegan día a día, Intro confirma, Escape cancela. **«Al ancla»** salta al instante de referencia del calendario.
- **Los niveles de tiempo** aparecen como segmentos ajustables individualmente con entrada por flechas y por dígitos — los valores no válidos no se pueden introducir por construcción.

### Visualización de la conversión

Bajo la cuadrícula, el selector muestra el instante elegido en todos los calendarios paralelos del bloque. Un clic en una correspondencia cambia allí el calendario activo. Los calendarios de bloques distintos deliberadamente no se pueden convertir.

## Cronologías derivadas

Una cronología derivada cuenta desde un punto cero propio: cuánto falta para una fecha o cuánto hace que ocurrió algo. No necesita definición propia, solo una cronología de referencia y un punto cero.

### Crear una

En la sección de ajustes «Sistemas de calendario», el botón **«Añadir cronología derivada»** abre un formulario breve:

- **Cronología de referencia** — un calendario del mismo bloque o la cronología estándar incluida. Para una cuenta atrás no hace falta, por tanto, un calendario propio.
- **Punto cero (día 1)** — la fecha en la notación de la referencia, opcionalmente mediante el selector; siempre cae en un día completo.
- **Nivel de detalle** — cómo de fina es la división de la duración, desde la unidad más pequeña sola hasta los años.
- **Abreviaturas de dirección** — dos palabras breves para el tiempo antes y después del punto cero.

Aquí no aparecen editores de niveles, ciclos, agrupaciones ni épocas, porque nada de eso se puede sobrescribir.

### Qué se hereda

La cronología derivada asume las unidades de su referencia y desplaza sus límites al punto cero. Si este cae en un día 23, cada mes derivado empieza el 23 y cada año derivado el mismo día; las semanas empiezan en el día de la semana del punto cero. Así, cada unidad conserva la longitud que tiene en la referencia y un día bisiesto cae por sí solo en el año correcto. Los nombres acompañan: si el recuento empieza en julio, el primer mes se sigue llamando julio. Si el punto cero cae en un día que no todos los meses tienen, el límite retrocede al último día disponible.

### Valores en el documento

El valor cuenta en ambos sentidos desde el punto cero: las unidades mayores como número completo desde 0, la más pequeña como número ordinal desde 1. Antes del punto cero rige la misma forma con la abreviatura de dirección.

```text
@{Cronología: 0-0-1}              el punto cero mismo
@{Cronología: 0-1-18}             un mes y diecisiete días después
@{Cronología: 0-0-15 antes GL}    quince días antes
```

De ahí se muestra la duración en el nivel elegido, sin las partes de longitud cero, por ejemplo «1 mes, 2 semanas, 4 días». La ayuda emergente indica además el valor canónico y el momento correspondiente de la cronología de referencia. Si la cronología derivada se apoya en la cronología estándar, las unidades aparecen en singular y plural; en calendarios propios los nombres quedan tal como se introdujeron allí.

### Selector

El selector de una cronología derivada muestra la cuadrícula de su referencia: se elige una fecha normal y se inserta el recuento. **«Al ancla»** salta al punto cero.

### Cambios en la cronología de referencia

Un valor es una coordenada de su cronología. Si cambia la referencia, los valores de sus cronologías derivadas se desplazan con ella. El editor señala de forma permanente las cronologías derivadas existentes y pide confirmación al aplicar; una cronología con derivadas no se puede eliminar mientras estas existan.
