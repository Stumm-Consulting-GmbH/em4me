# Sistemas de calendario

Cronologías de libre definición para mundos de fantasía y casos de uso especiales: cada área puede llevar sus propios bloques de calendario, cuyos calendarios pueden estar construidos de forma completamente distinta al calendario estándar habitual — con sus propias longitudes de mes, reglas intercalares, ciclos semanales y épocas. La función pertenece a la extensión «Sistemas de calendario» y solo rige en el contexto de un área: sin un área abierta, la sección de configuración y el comando de inserción están inactivos.

## Concepto

### Bloques

Un bloque es un mundo temporal autónomo con un nombre y cualquier número de calendarios. Los calendarios de un mismo bloque se ejecutan en paralelo, pueden ponerse en correspondencia y convertirse entre sí. Los bloques distintos deliberadamente no tienen nada que ver entre sí — entre ellos no hay ni conversión ni comparabilidad.

### Calendarios y niveles

Un calendario se compone de una lista ordenada de niveles, el más pequeño primero (por ejemplo segundo → minuto → hora → día → mes → año), agrupados en grupos de niveles con nombre (en la plantilla estándar «Tiempo» y «Fecha»). Cada nivel describe su relación con el inmediatamente inferior mediante uno de los cinco tipos de relación:

- **Factor fijo** — un número fijo de unidades inferiores, por ejemplo 60 segundos por minuto.
- **Tabla de longitudes** — unidades con longitudes individuales, por ejemplo tres meses de 30, 30 y 35 días; los nombres de fila de la tabla son al mismo tiempo los nombres de posición (nombres de mes).
- **Regla intercalar** — determina los años bisiestos **por divisibilidad**, con reglas de ciclo según el patrón «intercalación cada 4, excepto cada 100, excepto cada 400», o **según un patrón**: una longitud de ciclo en años y las posiciones de los años bisiestos dentro de él, contadas desde 1 — por ejemplo 2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29 en un ciclo de 30 años. En ambos casos forman parte de ella la unidad prolongada y la prolongación.
- **Ciclo independiente** — el patrón semanal: un ciclo de longitud fija corre más allá de los límites de mes y de año, anclado a una fecha de referencia, opcionalmente con una regla de numeración (el número del ciclo se rige por el año en que cae el día determinante del ciclo).
- **Agrupación** — una síntesis puramente calculada, por ejemplo trimestres de tres meses cada uno.

### Épocas

Cada calendario tiene exactamente una época pasada abierta (cuenta hacia atrás), cualquier número de épocas intermedias cerradas y una época futura abierta. Los límites se encadenan sin huecos y se sitúan en una fecha sin componente de hora; el conteo de años empieza en 1 en cada época, no hay año 0. Un límite de época puede caer en mitad del año — el año 1 de la nueva época es entonces un año parcial.

### Conversión mediante el eje del bloque

Cada bloque posee un eje temporal neutro. Cada calendario se proyecta sobre ese eje mediante un ancla (el instante del calendario que se sitúa en el punto cero del eje) y una escala (la duración de su unidad más pequeña en unidades del eje, como fracción de numerador y denominador). Las conversiones entre calendarios pasan siempre por el eje del bloque y redondean de forma determinista al nivel más pequeño del calendario de destino; el comando «Convertir fecha» muestra el resultado (sección del mismo nombre).

## Mantenimiento en la configuración

La sección de configuración «Sistemas de calendario» muestra los bloques del área abierta en dos niveles: la vista general gestiona los bloques (añadir, renombrar, abrir, eliminar); la vista de detalle de un bloque muestra sus calendarios como formularios con editores para niveles, épocas, ciclos, agrupaciones y el eje del bloque.

- El menú desplegable **«Insertar plantilla …»** crea una cronología completamente rellenada a partir de las plantillas incluidas (sección «Plantillas incluidas»). Para empezar sin plantilla, **«Añadir calendario»** crea una cronología vacía.
- **Plural:** junto al nombre de cada nivel figura el campo «Plural», igual que en el ciclo («Nombre del ciclo (plural)») y en cada agrupación («Nombre de la agrupación (plural)»). Una duración muestra el singular con exactamente una unidad y, si no, el plural, por ejemplo «1 mes, 2 semanas, 4 días»; sin plural rige siempre el singular.
- **«Escribir siempre la abreviatura de la época»:** la casilla al final del grupo «Épocas» escribe la abreviatura en el valor también en la época más reciente. Es útil si más adelante se añaden otras épocas: los valores ya guardados conservan entonces su significado. Un valor de la época más reciente designa el mismo día con y sin abreviatura. Lo que ocurre con los valores sin abreviatura al añadir una época más tarde se describe en la sección «Añadir una época más tarde».
- La **vista previa en vivo** muestra un valor de ejemplo de libre elección de forma canónica y con nombres; mientras una definición esté incompleta, el editor lo señala como un aviso (validación leve), y solo al aplicar se verifica de forma estricta.
- Las definiciones se guardan en el archivo del área (archivo `Area_Settings.mdda`) y rigen para todas las ventanas del área.

La edición deliberadamente nunca está bloqueada: se permiten los cambios de estructura en calendarios ya utilizados. Los valores del documento que por ello quedan no válidos se conservan sin cambios y se marcan de forma visible.

### Añadir una época más tarde

Un valor de la época más reciente figura en el documento sin abreviatura, y un valor sin abreviatura se lee siempre como valor de la época más reciente. Cuando una cronología recibe una nueva época más reciente, los valores guardados de la anterior designarían por ello otro día o dejarían de ser válidos. Si el área contiene tales valores, la aplicación pregunta al aplicar, antes de guardar, e indica cuántos son:

- **«Asegurar valores y aplicar»** guarda el cambio y reescribe cada valor afectado de modo que designe el mismo día que antes. Un valor anterior al inicio de la nueva época recibe la abreviatura de la anterior: `@{Nombre del calendario: 30-06-01}` pasa a ser `@{Nombre del calendario: 30-06-01 AZ}`. Un valor situado a partir del inicio de la nueva época recibe su número de año: si comienza en el año 31 de la anterior, `@{Nombre del calendario: 32-01-15}` pasa a ser `@{Nombre del calendario: 2-01-15}`. Esto vale también para un valor que ya lleva la abreviatura de la época anterior y que de otro modo dejaría de ser válido.
- **«Aplicar sin asegurar»** guarda el cambio y deja los valores como están.
- **«Cancelar»** deja la configuración y los documentos sin cambios.

Se asegura cada posición de texto con un valor afectado, en los documentos Markdown del área y en las notas del documento, también en tarjetas Canvas, en tableros Kanban y en secciones de código. Antes de modificar un documento, la aplicación deposita su estado anterior en el historial del documento; un documento abierto con cambios sin guardar recibe el cambio en su estado sin guardar y solo queda asegurado al guardarlo; el informe lo señala. Las notas del documento no tienen historial.

Al final, un informe indica por documento el número de valores asegurados y, por separado, los documentos que no pudieron modificarse: documentos divididos, documentos abiertos en otra ventana con cambios sin guardar y documentos modificados desde el recuento. Allí los valores han de corregirse a mano. Los estados anteriores del historial del documento permanecen tal como se guardaron.

En un área muy grande cuyo texto la búsqueda del área no mantiene disponible, la aplicación no puede contar ni asegurar los valores; la pregunta lo indica y solo ofrece «Aplicar» y «Cancelar».

Quien cuente desde el principio con más épocas activa «Escribir siempre la abreviatura de la época»: cada valor nuevo lleva entonces su abreviatura, y solo quedan por asegurar los valores situados a partir del inicio de la nueva época.

## Plantillas incluidas

El menú desplegable **«Insertar plantilla …»** en la vista de detalle de un bloque ofrece los calendarios incluidos en este orden:

1. Calendario gregoriano
2. Calendario juliano
3. Calendario hijri tabular
4. Calendario nacional hindú
5. Calendario budista
6. Calendario etíope
7. Calendario cóptico
8. Calendario japonés
9. Calendario de la República de China

La selección crea la cronología de inmediato en el bloque abierto, completamente rellenada y sin más datos; después, el menú vuelve a su primera entrada. La cronología lleva el nombre del menú; si ese nombre ya está ocupado en el área, recibe un número añadido, por ejemplo «Calendario gregoriano 2». Como cualquier cambio de esta sección, se guarda con **«Aplicar»**.

Cada plantilla trae los niveles de tiempo segundo, minuto y hora, una semana de siete días y el singular y el plural de sus unidades. El calendario gregoriano muestra además todos los tipos de relación en una sola definición: doce meses, regla intercalar, ciclo semanal, trimestres y semestres. Todas las plantillas se sitúan sobre el mismo eje de días: las cronologías creadas a partir de plantillas se convierten entre sí dentro del mismo bloque sin más indicaciones.

### Qué es una plantilla creada

Una plantilla creada es una cronología normal del área. Después se edita, se renombra, se amplía y se elimina como cualquier otra; la plantilla es el punto de partida, no un vínculo permanente. Por eso, una actualización del programa no alcanza una cronología ya creada.

Las demás funciones de fecha de la aplicación siguen siendo gregorianas: los marcadores de tarea, los diarios, las comparaciones de consulta y los tipos de tabla de datos no conocen cronologías propias.

### Lecturas y límites

- **Calendario hijri tabular** — reproduce la lectura tabular: doce meses que alternan 30 y 29 días; en un año bisiesto, el duodécimo mes (dhuʻl-hijjah) tiene 30 días; los años bisiestos son los años 2, 5, 7, 10, 13, 16, 18, 21, 24, 26 y 29 de cada ciclo de 30 años, contados desde la época civil. Este cálculo rige igual para cada año. La fecha vivida en la práctica religiosa, en cambio, se rige por la observación de la luna creciente y puede diferir en un día, rara vez en dos. Los días empiezan a medianoche, no a la puesta del sol.
- **Calendario budista** — el cómputo budista de los años tal como rige en Tailandia: meses y años bisiestos gregorianos, con el número de año 543 por encima del gregoriano. Hasta 1940, el año tailandés empezaba el 1 de abril; la plantilla cuenta siempre con el inicio del año el 1 de enero y por eso muestra antes de 1941, de enero a marzo, un año uno más alto que el del uso de entonces, y el mismo año a partir de abril.
- **Calendario nacional hindú** y **Calendario de la República de China** — ambos siguen contando hacia atrás también antes de su introducción (calendario nacional hindú 1957, calendario de la República de China 1912). Para ese período, las fuentes no los acreditan como válidos; antes de 1912, las fuentes indican a menudo el mes y el día según el calendario lunar.
- **Calendario japonés** — meses y años bisiestos gregorianos con las eras Meiji (desde el 23 de octubre de 1868), Taishō (desde el 30 de julio de 1912), Shōwa (desde el 25 de diciembre de 1926), Heisei (desde el 8 de enero de 1989) y Reiwa (desde el 1 de mayo de 2019); el año 1 de una era va desde su inicio hasta el 31 de diciembre. Antes de eso, la época «antes de Meiji» cuenta hacia atrás; faltan las eras más antiguas porque se basan en el calendario lunar. Antes de 1873, Japón usaba el calendario lunar: las fechas anteriores a 1873 son por tanto fechas gregorianas calculadas hacia atrás y difieren del uso histórico en el mes y el día, a veces también en el año. La plantilla escribe siempre la era (casilla «Escribir siempre la abreviatura de la época» marcada): el 30 de septiembre de 2026 figura en el documento como `8-09-30 Reiwa`.

### Añadir una nueva era japonesa

Cuando empieza una nueva era en Japón, la siguiente versión del programa tras su anuncio la incorpora a la plantilla «Calendario japonés». Una cronología ya creada no se ve afectada; en ella, la era se añade a mano:

1. En la configuración, abrir la sección «Sistemas de calendario» y abrir el bloque con **«Abrir»**.
2. En la cronología japonesa, bajo «Épocas», elegir **«Añadir época»**.
3. En la nueva y última época, introducir el nombre de la era tanto en **«Nombre»** como en **«Abreviatura»**, y en **«Inicio»** su primer día según el calendario gregoriano.
4. Elegir **«Aplicar»**.

Como la plantilla escribe siempre la abreviatura de la era, los valores ya guardados anteriores al inicio de la nueva era conservan su significado: `8-09-30 Reiwa` sigue siendo el 30 de septiembre de 2026. Un valor situado a partir del inicio de la nueva era y contado todavía en la anterior dejaría de ser válido; la aplicación pregunta al aplicar y, si se desea, lo convierte al cómputo de años de la nueva era (sección «Añadir una época más tarde»).

## Valores en el documento

Un valor de calendario figura en forma canónica en el texto fuente:

```text
@{Nombre del calendario: Año-Mes-Día}
@{Nombre del calendario: Año-Mes-Día Abreviatura de época}
@{Nombre del calendario: Año-Mes-Día Hora:Minuto:Segundo}
```

El primer signo de dos puntos separa el nombre del calendario del valor. Los segmentos de fecha van de mayor a menor; la abreviatura de época se omite en la época más reciente, salvo que la cronología tenga activado «Escribir siempre la abreviatura de la época», y la parte de hora se omite cuando todos los segmentos de tiempo están en su mínimo. En la vista renderizada, el modo en vivo y la exportación portable, el valor aparece como un distintivo con los nombres de la definición (por ejemplo nombres de mes y abreviatura de época).

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

## Convertir fecha

El comando «Convertir fecha» muestra a qué instante de los demás calendarios de un bloque corresponde una fecha. Está en la paleta de comandos y en el menú contextual del editor; se puede asignar un atajo en Archivo → Configuración… → Atajos de teclado. Está activo en cuanto el área abierta define al menos un calendario, también en la vista de lectura.

El diálogo ofrece las selecciones **«Bloque»** (solo si hay varios bloques) y **«Calendario»**, el campo **«Fecha»** para un valor en notación canónica sin el nombre del calendario (sección «Valores en el documento») y el botón **«Elegir …»**, que abre el selector. Debajo, la lista **«Corresponde a»** muestra una fila «Nombre: valor» para cada uno de los demás calendarios del bloque. Un clic o Intro sobre una fila convierte su calendario en el punto de partida; así se convierte en cualquier sentido. El diálogo se precarga con la selección del texto: si esta toca un valor de calendario o el cursor está dentro de uno, con su calendario y su valor. Si hay seleccionado texto de una sola línea sin valor de calendario, se toma como valor en notación canónica en el primer calendario del área en el que es válido; si no es válido en ninguno, aparece en el primer calendario con el mensaje «No es una fecha válida de este calendario.». Otras notaciones, como «3.10.2026», no se interpretan.

Cada fila con resultado lleva los botones **«Copiar»** e **«Insertar»**; ambos toman la correspondencia como valor de calendario con su nombre, `@{Nombre: valor}`, tal como lo escribe «Insertar fecha de calendario». «Copiar» la deja en el portapapeles; el diálogo sigue abierto y el botón muestra brevemente «Copiado». «Insertar» la escribe en el documento en un único paso de deshacer y cierra el diálogo: una selección se sustituye, y si el cursor está sin selección dentro de un valor de calendario, la correspondencia se inserta detrás de él. Solo es posible si el diálogo se abrió desde un documento en modo edición; si no, el botón está desactivado y su descripción emergente indica el motivo. «Copiar» funciona siempre. Por sí mismo, el diálogo no cambia nada en el documento; solo «Insertar» escribe. Así se sustituye una fecha por su correspondencia: seleccionar el valor de calendario completo o una fecha como texto, llamar a «Convertir fecha» y elegir «Insertar» en la fila deseada.

Donde no hay resultado, aparece una indicación en lugar de un valor:

- Una fecha que no existe en el calendario elegido se señala con «No es una fecha válida de este calendario.»; la lista desaparece entonces.
- Si un calendario no puede representar el instante, su fila dice «Nombre: fuera del rango representable».
- Si el bloque tiene un solo calendario, el diálogo indica que falta un segundo.

Solo se convierte dentro de un bloque; la línea de aviso del diálogo lo recuerda. Por eso, los calendarios que deban convertirse entre sí deben estar en el mismo bloque. Una cronología no se puede mover a otro bloque: se crea de nuevo en el bloque de destino o se inserta allí como plantilla. El resultado es tan bueno como el ancla y la escala de los calendarios implicados: las plantillas incluidas se sitúan por sí mismas sobre el mismo eje de días; en los calendarios definidos por uno mismo, el grupo «Eje del bloque (conversión)» de la configuración fija su posición.

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

De ahí se muestra la duración en el nivel elegido, sin las partes de longitud cero, por ejemplo «1 mes, 2 semanas, 4 días». La ayuda emergente indica además el valor canónico y el momento correspondiente de la cronología de referencia. Si la cronología derivada se apoya en la cronología estándar, las unidades aparecen en singular y plural; en calendarios propios rige para ello el campo «Plural» de cada unidad, y sin plural figura siempre el singular.

### Selector

El selector de una cronología derivada muestra la cuadrícula de su referencia: se elige una fecha normal y se inserta el recuento. **«Al ancla»** salta al punto cero.

### Cambios en la cronología de referencia

Un valor es una coordenada de su cronología. Si cambia la referencia, los valores de sus cronologías derivadas se desplazan con ella. El editor señala de forma permanente las cronologías derivadas existentes y pide confirmación al aplicar; una cronología con derivadas no se puede eliminar mientras estas existan. Las simples denominaciones — nombres y plurales de niveles, ciclos y agrupaciones, así como nombres de mes y de día de la semana — no desplazan ningún valor y no requieren confirmación.
