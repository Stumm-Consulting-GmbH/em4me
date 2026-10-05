# Gráficos de tablas

Un **gráfico de tabla** muestra los valores de una [Perspective Datatable](datatable.md) como gráfico de líneas, de barras, circular o de anillo. El gráfico es un **bloque de código propio** en el documento que nombra su tabla por su nombre. **No guarda números propios**: el bloque solo indica qué tabla y cuáles de sus columnas o filas se muestran, y el gráfico sigue a la tabla en cada cambio — ya al escribir, tanto en el código fuente como en la cuadrícula, incluso antes de guardar el documento.

El gráfico está donde se coloca: encima de la tabla, debajo de ella o en un lugar muy distinto del documento. Una tabla puede tener varios gráficos, por ejemplo dos perspectivas sobre las mismas cifras. Tabla y gráfico se ven al mismo tiempo; no hay ningún conmutador en la tabla. Los gráficos aparecen en la vista de lectura, en la vista dividida y en el modo en vivo.

## Un ejemplo

Una tabla de datos llamada `Ventas` y un gráfico de barras sobre ella:

````markdown
```perspective-datatable
table: Ventas
columns: Mes:text, Ingresos:number, Gastos:number
aggregate: Ingresos:sum, Gastos:sum
| Enero | 1200 | 800 |
| Febrero | 1350 | 900 |
| Marzo | 1100 | 950 |
| Abril | 1500 | 1000 |
```

```perspective-chart
table: Ventas
type: bar
labels: Mes
values: Ingresos, Gastos
title: Ingresos y gastos
```
````

Renderizados, aparecen la tabla y el gráfico:

```perspective-datatable
table: Ventas
columns: Mes:text, Ingresos:number, Gastos:number
aggregate: Ingresos:sum, Gastos:sum
| Enero | 1200 | 800 |
| Febrero | 1350 | 900 |
| Marzo | 1100 | 950 |
| Abril | 1500 | 1000 |
```

```perspective-chart
table: Ventas
type: bar
labels: Mes
values: Ingresos, Gastos
title: Ingresos y gastos
```

Cada columna de valores es una serie de datos y cada mes una categoría en el eje. La fila de agregados con las sumas no forma parte de ello.

## El nombre de la tabla

El nombre de una tabla de datos lo lleva la línea `table:` de su bloque, entre las directivas de cabecera antes de las filas de datos, en el ejemplo como primera línea. El gráfico lo indica con la misma grafía en su indicación `table:`. Se admiten letras (también con tilde y la ß), cifras, guion y guion bajo, sin espacios ni puntos; mayúsculas y minúsculas cuentan, `Ventas` y `ventas` son dos nombres. El nombre es a la vez el identificador de la tabla como bloque: un enlace como `[[Informe#^Ventas]]` salta a ella, una incrustación la muestra, y sus [propiedades de bloque](block-properties.md) dependen de él. En la vista renderizada, en la impresión y en el PDF la línea no se ve.

- Si un nombre aparece varias veces, cuenta la **primera aparición** en el documento.
- Un nombre dentro de un bloque de código o en el frontmatter no nombra nada; por eso los ejemplos en bloques de código no molestan.
- Si el nombre incumple la regla o la línea aparece dos veces en el bloque, la tabla señala el error con su número de línea; sus valores siguen visibles.
- Una línea `^nombre` justo debajo de la tabla, como la llevan documentos más antiguos, sigue contando como su nombre.
- Si el nombre se cambia mediante el panel [Propiedades de bloque](block-properties.md), los gráficos **del mismo documento** lo siguen.

## Las indicaciones del bloque

El bloque `perspective-chart` lleva una indicación por línea con la forma `clave: valor`:

| Indicación | Significado |
|---|---|
| `table:` | la tabla: su nombre en el mismo documento, por ejemplo `Ventas`, o `[[Archivo#^Ventas]]` para una tabla de otro documento |
| `type:` | el tipo: `line`, `bar`, `pie` o `donut` |
| `series:` | de dónde vienen las series de datos: `columns` (columnas) o `rows` (filas); sin la línea se aplica `columns` |
| `labels:` | la columna de etiquetas |
| `values:` | las columnas de valores, separadas por comas |
| `rows:` | las filas, por su entrada en la columna de etiquetas, separadas por comas (solo con `series: rows`) |
| `title:` | un título en el gráfico; sin la línea no aparece ninguno |

Las claves y los nombres de los tipos son los mismos en todos los idiomas de la interfaz; así, un documento significa lo mismo en todas partes. Las columnas se nombran por su **identificador**, como en los agregados de la tabla de datos, no por un encabezado propio; las mayúsculas y minúsculas no importan. Si una indicación aparece dos veces, se aplica la primera. Las líneas que el gráfico no conoce se pasan por alto y quedan sin cambios.

## Los cuatro tipos

- **Líneas** (`line`) y **barras** (`bar`) llevan una o varias series de datos; con varias series, las barras de una categoría quedan una al lado de otra. Los valores negativos se dibujan.
- **Circular** (`pie`) y **anillo** (`donut`) llevan exactamente una serie de datos; cada porción se rotula con el nombre de su categoría. Con muchísimas porciones, un gráfico circular o de anillo solo muestra los rótulos que tienen espacio.

Los números del eje de valores se escriben como en la tabla de datos, con punto decimal y sin separador de miles.

## Series de datos a partir de columnas o de filas

**A partir de columnas** (`series: columns`, el caso habitual): cada columna de valores es una serie de datos. Las categorías proceden de la columna de etiquetas, una entrada por fila de la tabla — como en el ejemplo de arriba.

**A partir de filas** (`series: rows`): cada fila nombrada es una serie de datos y lleva el nombre de su entrada en la columna de etiquetas. El gráfico nombra una fila por esa entrada, no por su posición en la tabla; la entrada debe escribirse exactamente como la muestra la tabla, incluidas mayúsculas y minúsculas. Si una entrada contiene una coma, se escribe `\,`. Las categorías son los encabezados de las columnas de valores; sin indicación `values:`, son todas las columnas numéricas excepto la columna de etiquetas.

````markdown
```perspective-chart
table: Ventas
type: donut
series: rows
labels: Mes
rows: Abril
title: Abril
```
````

Renderizado, sobre la misma tabla que arriba:

```perspective-chart
table: Ventas
type: donut
series: rows
labels: Mes
rows: Abril
title: Abril
```

Para ambas direcciones:

- **Los valores solo proceden de columnas numéricas**, incluidas las columnas numéricas calculadas, con sus valores calculados. La columna de etiquetas puede ser de cualquier tipo.
- Donde una serie o una categoría lleva el nombre de una columna, lleva el **encabezado** que la tabla muestra en la cabecera de esa columna.
- Series y categorías siguen el **orden de la tabla**, no el orden en que se nombran.
- La **fila de agregados** no pertenece ni a las series de datos ni a las categorías.
- Lo que cuenta es el contenido escrito de la tabla: **ordenar y filtrar** la tabla de datos en la vista no cambia el gráfico.

## Una tabla en otro documento

Un gráfico también puede nombrar una tabla de datos que está en otro documento, con la escritura de un enlace a un bloque con nombre:

```markdown
table: [[Informe#^Ventas]]
```

Así se puede crear, por ejemplo, una página de resumen con gráficos de tablas de varias notas. Todo lo que vale para un gráfico en el mismo documento vale también para un gráfico así. Además:

- **El otro documento se busca como una incrustación** del mismo destino (véase [Enlaces](linking.md)): con las mismas reglas y dentro de los mismos límites del área. La extensión `.md` puede omitirse.
- **Si el otro documento está abierto**, el gráfico muestra su estado escrito, incluso lo no guardado, ya al escribir — tanto si está abierto en la misma ventana como en otra. Si no está abierto, se aplica el estado guardado.
- **Si el archivo se cambia desde fuera** y la aplicación lo advierte, el gráfico se vuelve a dibujar con el nuevo estado sin volver a abrir el documento. Las incrustaciones del mismo destino se actualizan igualmente.
- **Si se cambia el nombre del archivo**, la indicación `table:` del gráfico lo sigue.
- **La referencia es un enlace**: en los retroenlaces, en los enlaces salientes y en el grafo cuenta como una incrustación.
- El gráfico solo **lee** el otro documento; nunca lo modifica.

## Cuando un gráfico no se puede dibujar

Si una tabla no se presta en ese momento a un gráfico, en su lugar aparece un aviso con el título **El gráfico no se puede dibujar** y una frase que nombra el motivo. Los motivos, en su orden fijo:

1. **Falta el otro documento** indicado.
2. **El nombre no aparece en el documento** — o el gráfico no nombra ninguna tabla.
3. El nombre **no pertenece a una tabla de datos**, sino por ejemplo a una tabla corriente, a una Perspective Table o a otro bloque.
4. La propia tabla de datos notifica un **error en su estructura** — aunque, pese al mensaje, siga mostrando valores. El gráfico aparece en cuanto se corrige el error en la tabla.
5. **Falta una columna** indicada, una entrada de fila indicada no coincide con **ninguna fila o con varias**, o falta en el gráfico una indicación necesaria o tiene un valor desconocido.
6. Una columna indicada como valores **no es una columna numérica**.
7. Las series de datos elegidas **no contienen ni un solo número**.
8. El **tipo no admite los datos**: un gráfico circular o de anillo recibe valores negativos, consta solo de ceros o lleva más de una serie de datos — o el tipo falta o es desconocido.

Si se dan varios motivos a la vez, el aviso nombra el primero. En cuanto se corrige el motivo, el gráfico aparece en lugar del aviso, ya al escribir. El aviso aparece en el idioma de la interfaz y no modifica el documento.

### Valores omitidos

Si solo algunas celdas de las series elegidas están **vacías** o son **celdas de error** — valores que no corresponden al tipo de la columna —, el gráfico se dibuja sin esos valores. Una línea debajo del gráfico indica su número, por ejemplo:

> Se omitieron 2 valores porque sus celdas están vacías o no son legibles.

Sin valores omitidos, esta línea no aparece; cuando se rellena o corrige una celda, el número baja. Una tabla que se está rellenando aparece así como gráfico desde su primer número. Las líneas y barras formadas solo por ceros se dibujan, porque los ceros son números.

## Colores

Las series de datos llevan los colores del [esquema de color](color-schemes.md) activo: en el grupo **Gráficos**, cada esquema de color tiene diez colores, de **Serie de datos 1** a **Serie de datos 10**. La primera serie lleva el primer color, la segunda el segundo, y así sucesivamente; en los gráficos circular y de anillo, esto vale para cada porción. A partir de la undécima serie, los colores vuelven a empezar por el primero.

Si se cambia uno de estos colores, se cambia de esquema de color o se pasa de claro a oscuro, el gráfico lo sigue de inmediato. Etiquetas y ejes toman los colores de texto del esquema de color.

## Impresión, PDF y exportación portable

**La impresión y la exportación a PDF** (véase [Herramientas](tools.md)) muestran el gráfico cuando salen de la vista de lectura, de la vista dividida o del modo en vivo. Allí el gráfico se dibuja **claro**, con los colores de gráfico del esquema de color claro, aunque la aplicación funcione en oscuro; después la aplicación vuelve a mostrar sus propios colores. Un gráfico que no se puede dibujar aparece con su aviso, como en pantalla, y en un salto de página el gráfico permanece en lo posible junto a su aviso y a su línea de valores omitidos. Si la tabla está en otro documento, la salida espera hasta que se haya leído; si no se consigue a tiempo, el aviso «La tabla no se pudo leer a tiempo.» ocupa el lugar del gráfico. Desde la vista de código fuente, la impresión y la exportación a PDF producen el Markdown sin procesar.

La **exportación portable** escribe el gráfico en el archivo como **imagen**, dibujada en claro, para que un destinatario lo vea sin esta aplicación. La tabla sigue siendo una tabla en la exportación; la imagen ocupa únicamente el lugar del bloque del gráfico. Si hubo que omitir valores, debajo de la imagen figura la misma línea que en pantalla. Un gráfico que no se puede dibujar se queda como bloque sin cambios. La imagen va incrustada en el archivo; el visor del destinatario tiene que poder mostrar tales imágenes, como con los diagramas Mermaid de la página [Matemáticas y diagramas](math-diagrams.md).

En todos los casos, la salida contiene los valores que el gráfico muestra en el momento de la salida, incluidos los no guardados y los de otro documento. La impresión y la exportación no modifican el documento.

## Insertar y editar un gráfico

No hace falta escribir un gráfico a mano. Dos comandos con un cuadro de diálogo común lo insertan a partir de una tabla de datos y lo modifican después, sin necesidad de conocer las indicaciones del bloque, el nombre de la tabla ni los identificadores de sus columnas: **Insertar gráfico para esta tabla** y **Editar gráfico**.

### Insertar

**Insertar gráfico para esta tabla** está en cuatro lugares:

- en el **menú contextual de la tabla de datos**: clic derecho sobre la cuadrícula en el modo en vivo o en la mitad renderizada de la vista dividida, sobre una celda, un encabezado de columna o el margen alrededor de la cuadrícula. La tabla sigue mostrándose como cuadrícula, y el menú lleva solo esta entrada.
- en el [menú contextual del editor](context-menu.md), cuando el cursor está en una tabla de datos, por ejemplo tras un clic derecho en su código fuente;
- en el menú **Ver → Gráfico**;
- en la **paleta de comandos** (`Ctrl+K` predeterminado).

El comando solo se puede elegir si el documento se puede modificar y está claro sobre qué tabla de datos actúa: el cursor está en una tabla de datos, o se ha hecho clic en la tabla — porque se está trabajando en una de sus celdas o porque el clic derecho la ha alcanzado. Mientras se edita una celda de la tabla de datos, el comando se puede elegir por tanto también desde el menú y la paleta de comandos. Una tabla Markdown corriente o una Perspective Table no cuenta como tabla de datos. Un clic derecho en la entrada de una celda que está abierta no muestra ningún menú; la entrada sigue abierta.

El comando abre el cuadro de diálogo descrito más abajo. Tras confirmar:

- **El nombre de la tabla.** Si la tabla aún no tiene nombre, recibe como primera línea de su bloque `table: tabelle-1`, con el número más pequeño que siga libre en el documento: si `tabelle-1` ya está ocupado, será `tabelle-2`, y así sucesivamente. Debajo de la tabla no se escribe nada. Si ya tiene un nombre, se queda sin cambios, y el gráfico indica ese nombre.
- **La posición.** El bloque del gráfico queda justo debajo de la tabla; un gráfico que ya estuviera allí baja un puesto. Otro gráfico para la misma tabla indica el mismo nombre.
- **La visualización.** La tabla y el nuevo gráfico aparecen dibujados al instante; en el modo en vivo, el nuevo gráfico queda después seleccionado.
- **Deshacer.** Un único paso de deshacer (`Ctrl+Z`) retira juntos el gráfico y un nombre asignado por el camino.

Cancelar el cuadro de diálogo no cambia nada: no se crea ni un gráfico ni un nombre.

### El cuadro de diálogo

El cuadro de diálogo lleva el título del comando, **Insertar gráfico para esta tabla** al insertar y **Editar gráfico** al editar; al editar, nombra debajo la tabla, por ejemplo **Tabla: Ventas**. Solo ofrece lo que la tabla proporciona, de modo que no puede surgir ninguna indicación no válida. Los campos, de arriba abajo:

| Campo | Qué ofrece |
|---|---|
| **Tipo de gráfico** | Líneas, Barras, Circular o Anillo |
| **Series de datos a partir de** | Columnas o Filas; una dirección que no dejaría ninguna serie de datos no se puede elegir |
| **Columna de etiquetas** | cada columna de la tabla, con su encabezado; no se puede elegir una columna junto a la cual no quedaría ninguna serie de datos |
| **Series de datos (columnas de valores)** | con series a partir de columnas: las columnas numéricas excepto la columna de etiquetas, incluidas las calculadas, marcadas con «calculada» |
| **Series de datos (filas)** | con series a partir de filas: las filas, cada una con su entrada en la columna de etiquetas |
| **Título (opcional)** | un texto libre; si queda vacío, no aparece ningún título |

Debajo están los botones **Cancelar** e **Insertar** o **Aplicar**. Además:

- Con **Líneas** y **Barras** se pueden marcar varias series de datos; una queda siempre marcada. Con **Circular** y **Anillo** hay que elegir exactamente una, y el cuadro de diálogo lo dice: «Un gráfico circular o de anillo muestra exactamente una serie de datos.»
- Las filas cuya entrada en la columna de etiquetas está vacía o no es inequívoca no se pueden elegir; una frase debajo de la lista indica cuántas son.
- Al insertar, el cuadro de diálogo viene rellenado con: Barras, series a partir de columnas, como etiquetas la primera columna que no es numérica (si no, la primera que se pueda elegir), y todas las columnas numéricas que se puedan elegir.
- **Sin ratón:** al abrirse, el foco está en el tipo de gráfico; el tabulador recorre los campos y permanece dentro del cuadro de diálogo. `Intro` confirma desde un campo, `Esc` cancela, igual que un clic fuera del cuadro de diálogo.
- Solo hay un cuadro de diálogo abierto a la vez. Volver a llamar a uno de los dos comandos, por ejemplo desde la paleta de comandos, trae al frente el cuadro de diálogo abierto.

### Editar

**Editar gráfico** actúa sobre el gráfico seleccionado. Un gráfico está seleccionado cuando el cursor está en su bloque y, en el modo en vivo, también cuando se ha hecho clic en él: un clic lo resalta, sigue dibujado y el cursor se queda donde estaba. `Esc` o un clic en el texto de al lado anula la selección. El código fuente del bloque sigue siendo accesible con las teclas de flecha.

El comando está en los mismos cuatro lugares:

- en el **menú contextual del gráfico**: clic derecho sobre el gráfico dibujado en el modo en vivo o en la mitad renderizada de la vista dividida. El gráfico sigue dibujado, y el menú lleva solo esta entrada.
- en el [menú contextual del editor](context-menu.md), cuando el cursor está en el bloque del gráfico;
- en el menú **Ver → Gráfico**;
- en la **paleta de comandos**.

Solo se puede elegir si hay un gráfico seleccionado y el documento se puede modificar. Abre el mismo cuadro de diálogo que al insertar, rellenado con las indicaciones del bloque; ofrece las columnas y filas de la tabla que nombra el gráfico. Tras confirmar, el bloque lleva las indicaciones modificadas, y el gráfico aparece al instante con ellas. Se aplica lo siguiente:

- El nombre que indica el gráfico y la propia tabla no cambian; solo se escribe el bloque del gráfico.
- Las indicaciones del bloque que el cuadro de diálogo no conoce se conservan.
- Confirmar sin cambios no escribe nada, cancelar no cambia nada.
- Un único paso de deshacer retira el cambio.

**Una tabla en otro documento.** Un gráfico con la indicación `table: [[Archivo#^nombre]]` también se puede editar así. El cuadro de diálogo lee las columnas y filas del otro documento y lo nombra debajo del título, por ejemplo **Tabla: Ventas en el documento «Informe»**. Solo se escribe el bloque del documento propio; el otro documento no cambia. Un gráfico así no se puede insertar con el comando, porque este actúa siempre sobre la tabla en la que se llama; un gráfico para una tabla de otro documento se crea escribiéndolo (véase «Una tabla en otro documento» más arriba).

### Cuándo aparece un mensaje en lugar del cuadro de diálogo

Si no se puede crear ningún gráfico para la tabla, no se abre ningún cuadro de diálogo; en su lugar, un mensaje en la barra de estado indica el motivo, por ejemplo «No se puede insertar un gráfico para esta tabla. La tabla no tiene ninguna columna numérica.» Ocurre así:

- al insertar y al editar, si la tabla **no tiene ninguna columna numérica**, si ninguna de sus columnas y filas da una serie de datos o si notifica un **error en su estructura**, y si el bloque de la tabla o del gráfico no está cerrado;
- al editar, además, si la tabla que nombra el gráfico **no se encuentra** — el nombre no aparece, o falta el otro documento — o si el nombre **no pertenece a una tabla de datos**. Si el otro documento todavía se está indexando, el mensaje pide volver a intentarlo en un momento.

Si la tabla o el gráfico cambian mientras el cuadro de diálogo está abierto, confirmar no escribe nada, y un mensaje lo indica; lo mismo si entretanto se ha desactivado el modo de edición o si otro documento ha ocupado el lugar del documento.

### Dónde no se pueden elegir los comandos

- En la **vista de lectura** el documento no se puede modificar: un clic derecho sobre una tabla de datos o un gráfico no muestra ningún menú, y ninguno de los dos comandos se puede elegir.
- Si el **modo de edición está desactivado** (Ver → Editar), ocurre lo mismo en el modo en vivo y en la vista dividida; un clic tampoco selecciona entonces ningún gráfico.
- Una tabla de datos o un gráfico dentro de una incrustación, en la salida de un bloque de script o en una tarjeta de un lienzo no ofrece ninguna de estas entradas con el clic derecho.

### Con el teclado

En el modo en vivo, la cuadrícula de la tabla de datos no es accesible con el teclado. El camino sin ratón pasa por el cursor: con las teclas de flecha hasta el bloque de la tabla o del gráfico, que entonces muestra su código fuente, y después el comando desde la paleta de comandos o el menú **Ver → Gráfico**. En la mitad renderizada de la vista dividida, el tabulador llega a las celdas de la tabla de datos; una celda con el foco cuenta como una celda en la que se ha hecho clic. El propio cuadro de diálogo se maneja por completo sin ratón.

## La extensión «Gráfico de una tabla de datos»

Los gráficos forman parte de las [extensiones internas](extensions.md) y están activados en el modo de trabajo **Completo**. Si la extensión está desactivada, el bloque aparece como un bloque de código corriente, también en la impresión, en PDF y en la exportación portable; el documento no cambia, y al volver a activarla el gráfico reaparece. Los dos comandos no existen entonces, ni en el menú, ni en la paleta de comandos, ni en ningún menú contextual.

Los gráficos se basan en la extensión **Perspective Datatable**: mientras están activados, la tabla de datos no se puede desactivar. Si la tabla de datos está desactivada, los gráficos también lo están.

## Límites

- **La única fuente es la tabla de datos.** Una tabla Markdown corriente, una Perspective Table, los resultados de una consulta y los registros de la base de datos no son fuente de un gráfico.
- **Se edita la tabla, no el gráfico.** El gráfico es una imagen; en él no se pueden cambiar valores ni mostrarlos al pasar el puntero. En el gráfico solo se modifican sus indicaciones, con «Editar gráfico» o en el código fuente.
- **Sin cálculos propios.** El gráfico no forma sumas ni promedios entre series; para mostrarlos, se calculan en una columna calculada de la tabla.
- **Cuatro tipos.** No existen gráficos de áreas, barras apiladas ni otros tipos.
- **Los colores pertenecen al esquema de color**, no a cada gráfico.
- **Los cambios desde fuera en otro documento** solo se advierten si la aplicación vigila el archivo: si el documento está en un área, toda la raíz del área; si no, la carpeta del documento hasta dos niveles de profundidad — y solo después de que la aplicación haya leído esa carpeta por completo una vez.
- **Otro documento en un área vinculada** (escrito `[[@zt:Archivo#^nombre]]`) no se encuentra; en lugar del gráfico aparece el aviso del documento que falta, igual que no aparece una incrustación del mismo destino.
- **Cambiar el nombre de una tabla** solo actualiza los gráficos del mismo documento. Los gráficos de otros documentos no lo siguen, ni tampoco una indicación que nombra el propio documento con la forma `[[Archivo#^nombre]]`.
- **Una tabla de datos dentro de una cita** o de una lista con más sangría no lleva ningún nombre que encuentren el gráfico, un enlace o una incrustación.
