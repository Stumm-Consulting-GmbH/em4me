# Base de datos

Un archivo Markdown puede declarar que es una **tabla de base de datos** y nombrar los campos que tiene esa tabla. La definición está en el frontmatter del mismo archivo que también lleva los registros; así la tabla queda completa en un solo archivo y sobrevive a cualquier operación de archivo, incluidos el renombrado y el traslado fuera de la aplicación.

Distinción: la [Perspective Datatable](datatable.md) es una tabla tipada **dentro de un documento**, pensada para conjuntos pequeños y calculables, mientras que la tabla de base de datos es una tabla con nombre **y archivo propio**, a cuyos registros se hace referencia desde otros archivos.

El formato de definición es el mismo que en los [Perfiles de propiedades](property-profiles.md): las mismas indicaciones por campo, la misma línea indulgente ante los errores. Aun así, una definición de tabla **no** es un perfil de propiedades, y un archivo de tabla no aparece en la lista de perfiles de los ajustes.

## El archivo de tabla

El contenedor `db-table` en el frontmatter señala el archivo como tabla y lleva bajo `fields` una entrada por columna:

```yaml
---
db-table:
  fields:
    - name: título
      type: string
      label: Título
      required: true
      options:
        maxLength: 120
    - name: páginas
      type: number
      options:
        decimals: 0
    - name: estado
      type: string
      values: [disponible, prestado, desaparecido]
      default: disponible
    - name: autor
      type: record
      options:
        table: Autores
  key: título
  display: título
  lastId: 42
---
```

Ya la mera **presencia** de la clave convierte el archivo en una tabla, con independencia de que su contenido sea utilizable. Una tabla con una errata en la definición no desaparece, pues, en silencio de la base de datos, sino que sigue siendo una tabla que señala un error.

## Indicaciones por columna

| Indicación | Significado |
| --- | --- |
| `name` | **Obligatorio.** El nombre técnico de la columna. Se mantiene neutral respecto al idioma, porque figura en las referencias y en el orden de los registros |
| `type` | uno de los ocho tipos de columna de más abajo; sin indicación rige `string` |
| `label` | la etiqueta para la visualización, como texto o como correspondencia de idioma a texto |
| `required` | `true` si la columna exige un valor |
| `values` | rango de valores fijo en forma de lista |
| `default` | valor predeterminado de la columna |
| `options` | indicaciones propias del tipo, véase más abajo |

El nombre es la **única indicación obligatoria**; cualquier otra indicación se puede omitir por separado.

## Tipos de columna

| Tipo | Significado |
| --- | --- |
| `string` | texto, el tipo predeterminado |
| `multiline` | texto de varias líneas |
| `number` | número |
| `boolean` | verdadero/falso |
| `date` | fecha |
| `time` | hora |
| `link` | enlace a un **archivo** |
| `record` | enlace a un **registro** de otra tabla |

El enlace a un registro es el tipo con el que dos tablas entran en relación: un `link` apunta a un archivo, pero un registro no es un archivo, sino una fila de una tabla.

**Un estado intermedio vale para ambos tipos de enlace.** La visualización muestra el valor de una columna de tipo `link` o `record` como texto y no resuelve el enlace; allí no se puede pulsar. La resolución llegará con una etapa posterior. El enlace a un registro concreto no se ve afectado: se escribe en el texto corrido y tiene más abajo una sección propia.

**Tres cosas quedan excluidas en una columna de tabla**, y el aviso nombra en cada caso el motivo y no solo el hecho:

- **los campos calculados** (`formula`, `lookup`) — una tabla no lleva columnas calculadas; el cálculo ocurre en consultas sobre los datos.
- **los valores estructurados** (`object`, `objectlist`) — lo que un objeto expresa en una celda se expresa, si no, mediante una tabla dependiente a través de una relación.
- **las columnas de varios valores** (`multistring` como tipo, `multiple: true` en otro tipo) — una columna múltiple es una relación disfrazada de columna.

Como indicaciones de un **campo de documento**, las tres siguen admitidas sin cambios; solo quedan excluidas en una columna de tabla.

## Indicaciones propias del tipo

El subobjeto `options` lleva las indicaciones que solo rigen para un tipo determinado. Son las mismas que en los [Perfiles de propiedades](property-profiles.md), ampliadas con una indicación que solo existe en una columna:

| Tipo | Indicación | Significado |
| --- | --- | --- |
| `string` | `maxLength` | longitud máxima en caracteres. Un valor más largo se señala y **no se recorta** |
| `number` | `decimals` | decimales esperados, de cero a diez. Un valor con más decimales se señala y **no se redondea** |
| `record` | `table` | nombre de la tabla a la que apunta el enlace al registro |

La longitud máxima y los decimales pertenecen al fondo común de indicaciones y rigen por eso igualmente para las propiedades corrientes de un documento. Ambas son un **aviso en el campo** y nunca cambian el valor guardado.

## Relaciones entre tablas

Una columna de tipo `record` es una **columna de enlace**. Su indicación `table` nombra la tabla de destino por el nombre de su archivo sin extensión, sin distinguir mayúsculas y minúsculas, y cada celda de la columna apunta a un registro de esa tabla:

```yaml
- name: autor
  type: record
  options:
    table: Autores
```

En la celda puede figurar una de dos cosas:

- el **identificador** del destino, también en su forma corta: `r-00007` y `r-7` apuntan al mismo registro;
- el **valor de la clave funcional** del destino, si esa clave consta de un solo campo, por ejemplo `Umberto Eco`. Se compara carácter por carácter, como la propia clave.

Un texto con la forma de un identificador se lee siempre como identificador. La escritura `[[Autores#^r-00007]]` de un enlace en el texto corrido no tiene cabida en la celda; allí cuenta como un valor de clave corriente. Una celda vacía no es un enlace y no se comprueba; si debe estar rellena lo dice `required`.

**En el guardado por la aplicación, cada enlace se comprueba y se escribe como identificador.** La tabla de destino tiene que existir en el área, y el contenido de la celda tiene que dar con exactamente un registro que exista después del cambio; un registro creado en el mismo cambio cuenta, uno eliminado en él no. Si no da con ninguno o da con varios, el cambio se rechaza. La resolución mediante el valor de clave solo funciona si la tabla de destino tiene una clave funcional de un solo elemento; con una clave de varios elementos, el identificador es el único camino. Lo que se ha resuelto, la aplicación lo escribe en la celda como identificador completado, tanto si allí figuraba el valor de clave como la forma corta; si el valor de clave del destino cambia más tarde, el enlace sigue siendo válido. Un registro también puede remitir a sí mismo.

**Un registro al que todavía se remite no se puede eliminar.** Esto vale para cada columna de enlace del área que apunta a su tabla, también para una de la misma tabla, y para los enlaces mediante el identificador igual que mediante el valor de una clave de un solo elemento. El aviso nombra la tabla que remite, sus columnas de enlace, el número de registros que remiten y el primero de ellos. La aplicación no elimina nada junto con él ni vacía ningún enlace. Quien quiera eliminar una cabecera con sus líneas elimina ambas en **un solo** cambio; del mismo modo, un enlace deja de contar si el mismo cambio lo dirige a otro destino o lo vacía. Un enlace en el texto corrido, por ejemplo `[[Autores#^r-00007]]`, en cambio no protege: puede romperse como un enlace a un archivo eliminado.

Ambas comprobaciones necesitan la vista general de las tablas del área. Si las tablas aún no se han leído por completo, la aplicación rechaza un cambio que establece un enlace o elimina un registro, y el aviso pide volver a intentarlo en un momento.

Las relaciones se evalúan con una consulta de registros: una ruta como `autor.nombre` lee el campo del registro referenciado, una condición sobre el campo de referencia encuentra la dirección contraria, y `ancestors(…)` y `descendants(…)` siguen los enlaces a lo largo de cualquier número de niveles. Cuántos registros apuntan a un registro lo cuenta una consulta agrupada como `TABLE RECORDS count() FROM "Préstamos" GROUP BY libro`. La página [Consulta Perspective](frontmatter-query.md) describe ambas cosas en las secciones «Nivel de registro» y «Agrupación y agregación».

## Etiquetas en varios idiomas

La etiqueta está en la clave `label`, ya sea como texto simple o como correspondencia de idioma a texto:

```yaml
- name: título
  label:
    de: Titel
    en: Title
    fr: Titre
```

El **nombre** del campo no se ve afectado por ello: si fuera traducible, una base de datos transmitida se desharía en el primer cambio de idioma. Si una correspondencia es defectuosa en sí misma, se omite la etiqueta entera y la visualización recae en el nombre técnico, en lugar de mostrar algunos idiomas y dejar que otros desaparezcan en silencio.

## Identificador de registro, clave funcional y forma de visualización

Cada registro lleva un **identificador interno** de la forma `r-00042`: la marca `r-` de record y un número de al menos cinco cifras. La anchura es una anchura mínima y no un límite; tras `r-99999` viene `r-100000`. Se leen ambas escrituras, `r-42` y `r-00042` designan el mismo registro.

Un enlace a un registro nombra la tabla y el identificador, escrito como un ancla de bloque: `[[Personen#^r-00042]]`. Lo que produce un enlace así y cuándo vale se describe más abajo, en la sección sobre la localizabilidad.

Tres indicaciones de la definición forman parte de esto:

| Indicación | Significado |
| --- | --- |
| `lastId` | nivel de crecida: el número más alto jamás asignado por la tabla. El siguiente identificador queda por encima de él y por encima del identificador más alto de los registros existentes, para que el número de un registro borrado no se asigne una segunda vez y ningún identificador se asigne dos veces, ni siquiera sin nivel de crecida o con uno demasiado bajo |
| `key` | la clave funcional: un nombre de campo o una lista de nombres de campo. Opcional, porque una tabla de movimientos o de mediciones no tiene una clave legible por personas que resulte útil |
| `display` | el campo con el que se designa un registro. Sin indicación rige una clave funcional de un solo elemento, sin ninguna de las dos, el identificador interno |

Si la clave funcional nombra un campo que la definición no conoce, se omite la clave **entera**: media clave sería una falsa promesa de unicidad.

**En el guardado por la aplicación, la clave funcional sigue siendo única.** La aplicación la comprueba frente a todos los registros de la tabla, también los de sus archivos siguientes, y rechaza un cambio tras el cual dos registros llevarían la misma clave; entonces no se escribe nada. El aviso distingue tres situaciones:

- La misma clave figura **dos veces en el mismo cambio**.
- La clave **ya está asignada a un registro**. El aviso lo nombra con su identificador y su forma de visualización.
- La clave **ya está asignada varias veces en los registros existentes**. Entonces hay que corregir primero los registros existentes; el aviso nombra los registros que la llevan.

Una clave de varios elementos solo cuenta como duplicada si coinciden todos sus elementos. Si un elemento está vacío, la clave no se comprueba; si el campo debe estar relleno lo dice la indicación `required`. Se compara carácter por carácter: `Müller` y `MÜLLER` son dos claves distintas, y un espacio inicial cuenta. Un cambio que deja sin modificar la clave de un registro no la comprueba; un registro que forma parte de un duplicado existente sigue así pudiendo modificarse en sus demás campos. Eliminar y volver a crear la misma clave en un solo cambio está permitido, igual que intercambiar las claves de dos registros.

## Los registros en el archivo

Los registros están en el cuerpo del mismo archivo, en un bloque propio:

````markdown
```perspective-records
|- id="r-00001"
| El nombre de la rosa
| 640
| disponible
|- id="r-00002"
| El péndulo de Foucault
| 880
| prestado
```
````

Las reglas son breves a propósito, porque el archivo es almacenamiento técnico:

- Una línea que empieza por `|-` en la **columna 0** abre un registro. A continuación va su identificador interno.
- Una línea que empieza por `| ` en la columna 0 abre una celda. Toda línea siguiente pertenece a la celda en curso, de modo que un valor puede ocupar varias líneas.
- No hay **fila de encabezado**. Las celdas corresponden a los campos de la definición, en orden; ese orden es el contrato.
- Solo cuenta la columna 0. Una línea con sangría es siempre contenido, aunque parezca un marcador.
- Si una línea debe empezar ella misma por `|` o `!`, se le antepone una barra invertida: `\| así empieza un valor con una barra`.

**Nunca se pierde un carácter.** Si un registro tiene demasiadas pocas celdas, los campos restantes quedan vacíos; si tiene demasiadas, las sobrantes permanecen intactas. Ambos casos se informan, pero nada se escribe en silencio — ese es el único fallo que un almacén de datos no debe cometer.

## Reglas de comprobación

Una regla de comprobación fija qué valores acepta una tabla. Figura en la definición, en uno de dos lugares según su alcance:

- **`check` en la entrada de una columna** comprueba el único valor de esa columna.
- **`checks` en el nivel superior del contenedor** es una lista de condiciones sobre varios campos de un registro.

```yaml
db-table:
  fields:
    - name: cp
      check: '/^\d{4}$/'
    - name: cantidad
      type: number
      check:
        - value > 0
        - rule: value <= 100
          message: Como máximo 100 piezas por línea.
    - name: inicio
      type: date
    - name: fin
      type: date
  checks:
    - rule: fin >= inicio
      message: El fin es anterior al inicio.
```

Una regla es un texto o un objeto `{ rule, message }` con un aviso propio; en un campo se admite también una lista de ambas formas. El texto de una regla de campo adopta una de tres formas:

- Una **expresión regular** va entre barras, seguida opcionalmente de indicadores, por ejemplo `/^\d{4}$/` o `/^[a-z]+$/i`. Los indicadores `g` e `y` quedan excluidos. Una barra dentro del patrón no necesita barra invertida, porque el patrón llega hasta la última barra.
- Una **palabra suelta** es el nombre de una regla incluida. La aplicación todavía no conoce ninguna; un nombre desconocido se omite con un aviso.
- **Cualquier otro texto** es una condición del lenguaje de consulta en la que el valor propio se llama `value`, por ejemplo `value > 0 AND value <= 100`. No debe nombrar otro campo; una condición sobre varios campos va bajo `checks`.

Una regla bajo `checks` es siempre una condición del lenguaje de consulta. Nombra los campos por su nombre, sin distinguir mayúsculas y minúsculas.

Se compara como en cualquier consulta: un número como número, una fecha y una hora cronológicamente, también frente a una fecha de la forma `date(2026-01-01)`, un texto sin distinguir mayúsculas y minúsculas.

**Hay que conocer una trampa.** El lenguaje de consulta no conoce las palabras `true`, `false` y `null`; las lee como nombres de campo, y la regla se omite con un aviso. Un valor verdadero/falso se comprueba con `value` solo o con `NOT value`, bajo `checks` con el nombre del campo solo o precedido de `NOT`. Si un campo está relleno lo dice `required`, no una regla de comprobación.

**Ninguna regla de campo comprueba un valor vacío**, ni tampoco un valor que no encaja con su tipo; ese lo señala ya la comprobación del tipo. La excepción es el valor verdadero/falso: su celda vacía significa «no», y `value` exige por eso una casilla marcada. Una regla bajo `checks`, en cambio, se comprueba siempre; una comparación con un campo vacío no se cumple entonces. Una regla que no se puede evaluar, por ejemplo por una división por cero, cuenta como incumplida.

**En el guardado por la aplicación, las reglas actúan de forma estricta.** Se comprueba el registro tal como quedaría después del cambio, con todos sus campos y no solo los modificados. Si incumple una regla, el cambio se rechaza. En una regla de campo el aviso nombra el campo, el valor y la regla, en una regla bajo `checks` el registro y la regla, y añade el aviso propio de la regla si lo tiene. La eliminación no comprueba ninguna regla.

**Al leer, actúan de forma indulgente.** Un valor que incumple una regla de campo se señala en la visualización como un valor que no encaja con su tipo; la celda muestra su texto sin cambios, el registro sigue visible y en el archivo no cambia nada. Del mismo modo se señala una celda vacía de un campo con `required`. Las reglas bajo `checks` no actúan al leer, porque no tienen una celda concreta que se pueda señalar.

## Edición condicionada

La indicación `editable` en el nivel superior del contenedor fija bajo qué condición un registro puede seguir editándose, por ejemplo para que una factura contabilizada quede sin cambios:

```yaml
db-table:
  fields:
    - name: estado
      values: [abierta, contabilizada]
  editable:
    rule: estado != "contabilizada"
    message: Una factura contabilizada ya no se modifica.
```

La condición es una expresión del lenguaje de consulta sobre los nombres de campo de la tabla, como texto o como objeto `{ rule, message }` con un aviso propio. Una tabla tiene exactamente una condición; quien necesite varias las combina en la expresión.

En el guardado por la aplicación rige lo siguiente:

- La condición vale para **modificar y eliminar** un registro. **Crear** sigue siendo siempre libre.
- Se mide con el estado **guardado** del registro antes del cambio, no con los valores nuevos. Quien restablece el estado en el mismo cambio sigue por eso bloqueado.
- Si la condición no se cumple, el cambio se rechaza. El aviso nombra el registro y la condición y añade el aviso propio.
- Una condición que no se puede evaluar bloquea.
- Una indicación inservible se omite con un aviso, y la tabla sigue siendo editable.

Sin esta indicación, todo registro es editable.

**La misma indicación en un campo.** Un campo concreto lleva `editable` en su propia entrada y entonces solo se puede modificar bajo esa condición; el registro sigue visible y editable en sus demás campos:

```yaml
db-table:
  fields:
    - name: libro
      type: record
      editable: false
    - name: vence
      type: date
      editable: NOT devuelto
    - name: devuelto
      type: boolean
```

- La condición tiene la misma forma que en la tabla, como texto o como objeto `{ rule, message }`, y puede nombrar cualquier campo de la tabla. `false` bloquea el campo de forma fija, `true` lo libera expresamente; ambas palabras valen solo en un campo, no en la tabla.
- Vale solo para **modificar**. Al crear un registro todo campo es libre, y la eliminación no se ve afectada. Como en la tabla, se mide con el estado guardado antes del cambio.
- Si un guardado cambia el valor de un campo bloqueado, se rechaza; el aviso nombra campo, registro y regla, en el bloqueo fijo la regla «false». Un valor sin cambiar en un campo bloqueado no es un error. Si el registro ya está bloqueado según la condición de su tabla, figura solo ese aviso.
- Al editar en el formulario y en una fila del formulario de lista, un campo bloqueado queda en modo de lectura, y una información emergente indica que, según la condición de la definición, por ahora no se puede modificar. En cuanto la condición se cumple tras un guardado, el campo queda libre en la siguiente edición.
- Una condición inservible se omite con un aviso, y el campo sigue siendo editable.

Edición condicionada y permisos actúan juntos y aun así son dos cosas distintas: `editable` depende del registro y vale para todos, los permisos dependen del rol (sección «Permisos»).

## Visualización de los registros

En la vista de lectura y en el modo de edición el bloque aparece como una tabla con las columnas de la definición. Cada valor se representa según el tipo de su columna: números alineados a la derecha y con los decimales declarados, valores de verdad como marca de verificación, valores de varias líneas con sus saltos. Si un valor no encaja con su tipo, la celda muestra su texto original y se señala con color en lugar de sustituirse.

A partir de **2000 registros** la vista muestra un extracto e indica debajo de qué lo es. Es una ventana y no un recorte silencioso: usted ve que hay más. El límite se ha medido, no decretado — hasta ahí la tabla aparece sin espera perceptible.

En la **exportación portátil**, en cambio, la tabla está completa, sin ventana. Un archivo que usted entrega no debe ocultar nada: el destinatario no tiene la aplicación y no vería que falta algo.

Los registros no se editan en esta vista, sino en su **formulario**, que describe la sección siguiente; el botón al comienzo de cada fila lo abre. El archivo de tabla es almacenamiento técnico — sigue siendo legible a mano y, en caso de emergencia, corregible a mano, pero en el funcionamiento normal usted no trabaja dentro de él.

## Editar registros en el formulario

Cada registro tiene un **formulario**: una página propia que muestra sus campos uno debajo de otro, en el orden de la definición, cada uno con su etiqueta. La aplicación lo genera a partir de la definición de la tabla; no hay nada que construir. En el formulario usted crea registros, los modifica y los elimina.

### Abrir y crear

Un registro existente se abre con el botón **«Abrir registro»** al comienzo de su fila, delante del botón de los justificantes de cambio, tanto en la vista de lectura como en el modo En vivo. Con el teclado, la flecha izquierda lleva a él desde el botón de los justificantes.

Desde el resultado de una consulta de registros, un clic en un registro o en un enlace abre igualmente el formulario (página [Consulta Perspective](frontmatter-query.md)). Este muestra el estado guardado, aunque la consulta muestre uno sin guardar. En un formulario de lista, el clic abre el formulario que nombra la lista (sección «Formulario de lista»). Un enlace a un registro en el texto de un documento (sección «Enlace a un registro concreto») y un resultado de registro de la búsqueda sobre el área (sección «Localizabilidad: búsqueda y enlaces») abren igualmente el formulario.

Tres caminos crean un registro nuevo:

- el botón **«Nuevo registro»** debajo de cada tabla, también debajo de una vacía,
- el botón **«Nuevo registro»** en la fila de cada tabla del resumen de la base de datos,
- el comando **«Nuevo registro en la tabla activa»** de la paleta de comandos. Actúa sobre el archivo de tabla de la pestaña activa; si allí no hay ninguno abierto, la barra de estado lo indica.

El formulario se abre como pestaña propia cuyo título nombra el archivo y el registro. Hay uno por ventana: si usted abre otro registro, la misma pestaña lo muestra. Si la edición en curso aún no está guardada, el formulario pregunta antes si debe descartarse.

Un registro nuevo recibe su identificador interno ya al abrirse el formulario: figura en la cabecera, y el nivel de crecida `lastId` de la tabla ya está actualizado. Los campos aparecen vacíos, y el registro solo llega al archivo con el primer guardado.

### Leer y editar

El formulario se abre **en modo de lectura**. Los valores aparecen como texto, un valor de verdad como marca de verificación, y un campo obligatorio está señalado como tal. La cabecera lleva las acciones **«Editar»**, **«Eliminar»** y **«Justificantes»**; la última abre los justificantes de cambio del registro.

Detrás de ellas está la acción **«Mostrar en el documento de tabla»**. Abre el archivo de tabla y pone a la vista la fila del registro, también cuando el registro está en un archivo siguiente: en la vista de lectura la visualización se desplaza hasta su fila, siempre que esté entre los 2000 registros que muestra; en las vistas En vivo y Código el cursor queda en esa fila. En un registro nuevo falta la acción, porque el registro todavía no está en el archivo.

**«Editar»** convierte cada campo en una entrada con la forma de su tipo:

| Tipo | Entrada |
| --- | --- |
| `string`, `link`, `record` | entrada de texto de una línea, en `record` con ayuda de valores |
| `multiline` | entrada de texto de varias líneas |
| `number`, `date`, `time` | entrada de un número, una fecha o una hora |
| `boolean` | casilla de verificación |

Un valor que no encaja con su tipo recibe en su lugar la entrada de texto simple, para que usted vea y corrija lo que figura en el archivo; una entrada numérica lo descartaría si no en silencio.

**«Guardar»** escribe el cambio y vuelve a la lectura, **«Descartar»** vuelve sin escribir nada al estado leído. Solo se escriben los campos que usted ha cambiado. Si no ha cambiado nada, no hay nada que guardar, y la barra de estado lo indica.

Si un registro no se puede editar según la condición de su tabla, faltan **«Editar»** y **«Eliminar»**, y una frase en el formulario indica el motivo, con el texto de aviso de la condición si lo tiene. Si su rol no permite modificar, falta «Editar» y la frase nombra el rol; si no permite eliminar, falta «Eliminar» (sección «Permisos»).

### Campos de referencia y ayuda de valores

Un campo de tipo `record` muestra al leer la forma de visualización de su destino y su identificador, por ejemplo `Umberto Eco (r-00007)`, aunque en el archivo figure la forma corta `r-7`. Si el valor no da con exactamente un registro de la tabla de destino, un aviso en el campo lo indica.

Al editar, el campo ofrece una **ayuda de valores**: una lista de los registros de la tabla de destino, cada uno con su forma de visualización y su identificador. Escribir acota la lista, una selección introduce el identificador, y la tecla Esc cierra la lista. Si coinciden más de cincuenta entradas, la lista indica cuántas más hay.

No es obligatorio elegir. Una forma corta del identificador o un valor de la clave funcional de un solo elemento introducido a mano se mantiene, y al guardar la aplicación escribe en su lugar el identificador completado, como describe la sección «Relaciones entre tablas». Si la definición no nombra ninguna tabla de destino o esta no existe, el campo es de solo lectura.

### Avisos y cambios de otros

Si la aplicación rechaza un cambio, no se escribe nada; el formulario sigue en edición, y lo que usted ha introducido se mantiene. Cada aviso está donde le corresponde. Si afecta a un campo, figura en ese campo, el campo queda señalado, y el primer campo afectado recibe el foco. Una regla incumplida bajo `checks` señala todos sus campos y figura en la cabecera del formulario, al igual que todo aviso que no pertenece a ningún campo, por ejemplo el de la protección contra la eliminación.

Ya al leer, el formulario señala con un aviso en el campo un valor que no encaja con su tipo, que incumple una regla de campo o que falta siendo obligatorio.

Si alguien ha modificado el registro desde que el formulario lo leyó, por ejemplo a mano en el archivo de tabla, la aplicación no guarda por el momento. El formulario muestra entonces el bloque **«El registro se ha modificado entretanto»** con dos caminos:

- **«Volver a cargar»** descarta su edición y muestra el estado encontrado.
- **«Guardar de todos modos»** escribe su versión. Un justificante del tipo **Modificado desde fuera** retiene la diferencia encontrada, de modo que nada desaparece sin que se note.

También el segundo camino comprueba todas las reglas de la tabla; con él no se puede eludir ninguna regla.

### Eliminar

**«Eliminar»** pregunta primero: **«¿Eliminar este registro?»** Con **«Sí, eliminar»** el registro se elimina y el formulario se cierra; **«No»** lo deja todo como está. Un registro al que todavía apunta una columna de enlace tampoco se puede eliminar aquí. Qué registros remiten a él lo muestra de antemano el uso descrito más abajo.

### El formulario como archivo

El formulario generado se puede diseñar. La acción **«Guardar formulario como archivo»** en la cabecera del formulario lo escribe como documento corriente junto al archivo de tabla, con el nombre de este seguido de ` Form`, para `Clientes.md` por tanto `Clientes Form.md`. Un archivo existente con ese nombre nunca se sobrescribe. El archivo nuevo empieza con la versión generada:

```markdown
---
title: Clientes Form
db-form:
  table: Clientes
---

# Clientes

**Nombre:** {{field:nombre}}

**Cantidad:** {{field:cantidad}}
```

El contenedor `db-form` nombra la tabla, y para cada campo figura en el texto un **marcador de campo** `{{field:<nombre>}}`. Alrededor de los marcadores todo es Markdown corriente: un título entre dos campos o una frase explicativa aparece en el formulario tal como figura en el archivo. Una barra invertida delante de las llaves convierte un marcador en texto corriente.

**Dos significados de `table`.** En el frontmatter de la base de datos, en el contenedor `db-form` como en la indicación `options.table` de una columna de referencia, `table` nombra una tabla de la base de datos. En un bloque de la [Perspective Datatable](datatable.md), en cambio, la línea `table:` da un nombre a esa misma datatable, con el que la alcanzan los diagramas y los enlaces. Solo la palabra es la misma: una datatable no es una tabla de la base de datos.

La próxima vez que se abre, el formulario muestra el texto del archivo. La cabecera indica entonces de qué archivo procede el formulario, y la acción deja de ofrecerse; el resumen de la base de datos nombra el archivo en la columna **«Formulario»**. Si se elimina el archivo, el formulario vuelve a mostrar la versión generada.

**Se muestra lo que el archivo nombra.** Un campo que el archivo no nombra no aparece en el formulario, y al guardar queda intacto; un registro nuevo solo rellena los campos nombrados. Un marcador que no es ni de campo ni de valor y un nombre de campo que la tabla no conoce se quedan como texto y se señalan, como describe la sección «Indicaciones defectuosas».

El **marcador de valor** `{{value:<expresión>}}` muestra un valor que el formulario calcula a partir de los campos del registro mostrado, por ejemplo `{{value:cantidad * precio}}` para el importe de una posición o `{{value:lent + dur(14 days)}}` para la fecha catorce días después del campo `lent`. La expresión es del [lenguaje de consulta](frontmatter-query.md), como en una regla de comprobación: nombra los campos por su nombre, un campo de fecha cuenta como fecha, y rigen las mismas operaciones y funciones. El valor aparece como en una consulta de tabla, un número por ejemplo como `7.5`, una fecha como `2026-10-15`, una duración como `10d` y un valor booleano como `true` o `false`. Al editar, el formulario lo vuelve a calcular con cada entrada, sin guardar. El valor en sí nunca se guarda; no es un campo del registro.

Si la expresión no da ningún valor para un registro, por ejemplo porque un campo está vacío, el lugar queda vacío y marcado; una información emergente lo indica, y no se señala nada. Una expresión no válida, por ejemplo con una errata, deja también el lugar vacío y se señala con su línea en la cabecera del formulario; el resto del formulario sigue siendo utilizable.

**El valor se integra en la frase** cuando el marcador está dentro de una línea de texto: `Vence el {{value:lent + dur(14 days)}}` muestra «Vence el 2026-10-15» en una sola línea. Si el marcador está solo en su línea, el valor recibe una línea propia. Un marcador de campo siempre está en una línea propia.

**Secciones condicionales.** Una sección entre las marcas `{{when:<condición>}}` y `{{end}}` solo aparece si se cumple la condición. Ambas marcas están solas en su línea; por eso una sección abarca párrafos enteros, títulos, tablas, listas y los marcadores que contienen, nunca medias líneas. La condición es una expresión del [lenguaje de consulta](frontmatter-query.md) sobre los campos del registro mostrado, como en una regla de comprobación: `{{when:onloan}}` muestra la sección para un libro prestado, `{{when:pages > 500}}` para uno grueso. Las secciones pueden anidarse; una interior solo aparece si también aparece la exterior. Al editar, una sección aparece y desaparece con cada entrada, sin guardar; en modo de lectura rige el estado guardado.

```markdown
**On loan:** {{field:onLoan}}

{{when:onloan}}
## Out on loan

**Loan note:** {{field:loanNote}}
{{end}}
```

**La condición solo actúa sobre la visualización, nunca sobre el valor.** Un campo de una sección oculta conserva su contenido y se guarda con el resto; la condición no lo exime ni del guardado ni de las reglas de comprobación. Si una regla rechaza un campo así, el mensaje figura en la cabecera del formulario y nombra el campo; la sección sigue oculta. No hay rama «si no» ni bucles: un caso contrario se escribe como una segunda sección con la condición negada, por ejemplo `{{when:NOT onloan}}`. Una barra invertida delante de las llaves convierte también una marca en texto corriente.

**Rutas de referencia.** Los marcadores de valor y las condiciones leen también, a través de un campo de referencia, los campos del registro referenciado: en un formulario de préstamos, `{{value:book.title}}` muestra el título del libro prestado, y `{{when:book.onloan}}` muestra una sección mientras el libro está marcado como prestado. Antes del punto va el campo de referencia y detrás un campo de la tabla de destino. La aplicación calcula una ruta así tras un breve retraso, y hasta la respuesta se mantiene el valor anterior; al editar, la ruta sigue cada entrada, también la elección de otra referencia, sin guardar. Si la referencia está vacía o no corresponde a ningún registro, el lugar queda vacío y marcado, sin aviso, y una sección queda oculta. Si la ruta no nombra ningún campo de referencia de la tabla o ningún campo de la tabla de destino, el lugar queda igualmente vacío, y el formulario la señala con su línea en la cabecera.

**Posiciones.** El marcador `{{list:<archivo de consulta>}}` muestra en el formulario los registros de otra tabla que apuntan al registro mostrado, y los guarda junto con él; la sección «Posiciones en el formulario» lo describe.

**Archivo de formulario y plantilla.** Un archivo de formulario parece una [plantilla](templates.md), porque ambos escriben sus marcadores entre llaves dobles, y sin embargo hace otra cosa. Una plantilla se aplica una vez: `{{date}}` se sustituye por la fecha al crear un archivo, y después allí hay texto. Un archivo de formulario nunca se aplica: el formulario resuelve `{{field:Name}}` y `{{value:cantidad * precio}}` en cada visualización según el registro mostrado, y el archivo conserva sus marcadores. Por eso un archivo de formulario va junto a su tabla y no en la carpeta de plantillas.

### Tras el reinicio

Si la restauración de sesión está activada (Ayuda → Restaurar sesión) y el formulario está abierto al salir, vuelve en el siguiente inicio: a su lugar entre los documentos abiertos de su columna, con el mismo registro en el mismo archivo de formulario. Si era el documento mostrado en su columna, vuelve a serlo. Un registro nuevo que aún no se ha guardado no vuelve. El recorrido de «Atrás» empieza de nuevo tras el reinicio.

**Si el registro ya no existe**, por ejemplo porque se eliminó entre la salida y el reinicio, el formulario no desaparece. Muestra la nota de que el registro ya no existe en su tabla y de que el formulario permanece abierto hasta que lo cierre, y lleva en la cabecera la acción **«Abrir la tabla»**, que abre el archivo de tabla.

**Si la base de datos está desactivada al iniciar**, el formulario no vuelve, pero su entrada no se pierde: queda en reposo y se conserva también a lo largo de otros reinicios. Tras activarla, el formulario vuelve a su lugar en el siguiente inicio. Si su columna no contenía más que el formulario, vuelve en la columna restante, detrás de sus documentos.

### Varios formularios y el formulario predeterminado

Una tabla puede tener varios archivos de formulario, por ejemplo uno detallado y uno breve. Cuál aparece al abrir un registro, el **formulario predeterminado**, lo fija la indicación `form` en la definición de la tabla, con el nombre del archivo de formulario sin extensión, como el destino de un enlace wiki:

```yaml
db-table:
  form: Clientes Form
  fields:
    - name: Nombre
      type: string
```

Sin la indicación se aplica el primer archivo de formulario de la tabla según la ruta, y si no hay ninguno, el formulario generado; un único archivo de formulario funciona, por tanto, sin indicación alguna. Los demás archivos de formulario siguen siendo formularios de la tabla: un enlace desde un formulario lleva a ellos, como describe la sección siguiente.

En el resumen de la base de datos, la columna **«Formulario»** nombra el formulario predeterminado de cada tabla y detrás el número de los demás archivos de formulario, por ejemplo «+1 más». Si el formulario predeterminado se elimina o se renombra sin actualizar la indicación, el resumen lo señala, y vuelve a regir la regla sin indicación.

### Cambiar entre formularios

Un enlace en el texto de un archivo de formulario, como enlace wiki tal como `[[Clientes Breve]]` o como enlace Markdown, actúa en el formulario según su destino:

- Si el destino es **otro archivo de formulario de la misma tabla**, el formulario muestra el mismo registro en ese formulario.
- Si el destino es **el archivo de formulario de otra tabla**, una frase bajo la cabecera indica que para ello falta un registro; no se abre ni se crea nada.
- Si el destino es **un registro**, como enlace wiki tal como `[[Clientes#^r-00002]]`, el formulario muestra ese registro en el formulario predeterminado de su tabla. Si el enlace no coincide con ningún registro de forma unívoca, abre el archivo de tabla; un enlace Markdown a un archivo de tabla lo abre como documento.
- **Cualquier otro enlace** abre su documento, como en toda la aplicación.

Un **campo de referencia** relleno se puede pulsar en modo de lectura: un clic abre el registro referenciado en el formulario predeterminado de su tabla. Si el valor no coincide con ningún registro, una frase bajo la cabecera lo indica, y el formulario se queda donde está. Un campo de referencia vacío no se puede pulsar, y al editar el campo sigue siendo la entrada con ayuda de valores.

Cada cambio a través de un enlace, de un campo de referencia, de un enlace a un registro en el texto o de «Usado por» recuerda el registro del que procede. **«Atrás»** encima del título en la cabecera vuelve a él en su formulario, también a lo largo de varios pasos; sin paso anterior, el botón no aparece. Si abre un registro desde fuera, por ejemplo desde su fila o desde el resumen, el recorrido empieza de nuevo, y cerrar el formulario lo termina. Si la edición no está guardada, el formulario pregunta antes de cada cambio, también antes de «Atrás»: **«Descartar»** cambia, **«Seguir editando»** se queda con todas las entradas.

## Guardado por la aplicación

Los registros se crean, se modifican y se eliminan en el formulario que describe la sección anterior. Este guarda por un camino de la aplicación que es el mismo para cada cambio en los registros; lo que describe esta sección vale por tanto para cada uno de ellos.

Cada cambio pasa por un camino que lo comprueba antes de escribir. Un valor que no encaja con el tipo de su campo se rechaza, igual que un campo vacío que exige un valor. En ambos casos no se escribe nada.

A ello se suman las reglas de la definición de la tabla, descritas en las secciones anteriores. Un cambio también se rechaza si

- el **rol** propio no permite la operación en la tabla (sección «Permisos»),
- después una **clave funcional** quedaría asignada dos veces,
- un **enlace** no da con ningún registro o da con más de uno, o falta su tabla de destino,
- se quiere eliminar un registro al que todavía **se remite**,
- un valor o un registro incumple una **regla de comprobación**,
- se cambia un **campo** que está bloqueado según su propia condición,
- un registro **no es editable** según la condición de su tabla, o
- las tablas del área **aún no se han leído por completo** y el cambio establece un enlace o elimina un registro.

La aplicación comunica juntos los motivos que proceden de estas reglas, no solo el primero.

**Un guardado se aplica entero o no se aplica en absoluto**, aunque afecte a varias tablas y a varios archivos: después están todos sus cambios o ninguno. Escribe sus justificantes de cambio en la misma operación, y todos los justificantes de una operación llevan el mismo **identificador de operación**.

Antes de que las nuevas versiones de los archivos surtan efecto, la aplicación las escribe de forma definitiva en el soporte de datos. Por eso, un corte de corriente o una conexión de red interrumpida no deja ninguna operación a medias. (En Linux esto rige con una salvedad: allí la aplicación no escribe de forma definitiva las entradas de carpeta por separado, de modo que un corte de corriente justo en el momento del guardado puede dejar la operación a medias hasta la próxima apertura del área.) Esto lleva tiempo: un guardado dura aproximadamente una décima de segundo en un disco local, y entre un cuarto de segundo y medio segundo en una unidad de red.

Quien lee al mismo tiempo, mientras un guardado está en curso, puede ver un estado intermedio, por ejemplo la cabecera de una factura sin sus líneas. Es un caso conocido y aceptado de forma deliberada.

Si un cierre inesperado deja un guardado a medias, la aplicación lo termina en el siguiente guardado en esta área o al abrir el área. Hasta entonces, las tablas afectadas no aceptan cambios y lo indican con un aviso. Con ello no se pierde nada.

## Justificantes de cambio

Quien crea, modifica o elimina un registro a través de la aplicación deja un rastro: junto al archivo de tabla, la aplicación mantiene un segundo archivo en el que cada uno de esos cambios figura como **justificante de cambio**. Responde a la pregunta de quién modificó qué campo, cuándo y de qué valor a qué valor.

### Qué son y dónde están

Al archivo de tabla `Clientes.md` le corresponde el archivo `Clientes.mddl` en la misma carpeta. La aplicación lo crea y lo va ampliando; usted no tiene que hacer nada para ello, y no debe hacer nada en él.

Conviene conocer cinco propiedades:

- **No aparece en ninguna lista de archivos** de la aplicación y no se abre como documento. Es un almacenamiento técnico junto a la tabla.
- **Solo se amplía** y nunca se reescribe. Un justificante ya escrito permanece carácter por carácter; la única operación que lo toca es la agrupación descrita más abajo.
- **Acompaña** a la tabla cuando usted le cambia el nombre o la mueve dentro de la aplicación, y va con ella a la papelera del sistema operativo cuando la elimina. Desde allí recupera ambos juntos.
- Quien lo **modifica o lo borra a mano** pierde el rastro de forma irrecuperable. No hay un segundo almacenamiento desde el que se pudiera restablecer.
- Todos los justificantes de un mismo guardado llevan **el mismo identificador de operación**. Así se sigue reconociendo en el archivo que varios cambios van juntos, por ejemplo la cabecera de una factura y sus líneas.

### La vista en el registro

En la vista de lectura y en el modo En vivo, cada fila de registro lleva al comienzo un botón **«Mostrar los justificantes de cambio»**. Un clic en él abre la página **«Justificantes de cambio»** como pestaña propia. Sin ratón, el tabulador lleva a la tabla, las flechas cambian de fila, Inicio y Fin llevan a la primera y a la última, y la tecla Intro o la barra espaciadora abre la página.

La página muestra los justificantes del registro, **el más reciente primero**. Cada uno lleva el momento en su zona horaria, el tipo (**Creado**, **Modificado**, **Eliminado**), el usuario, el equipo y, por cada campo afectado, el valor **Antes** y **Después**. Un valor que falta aparece como «no presente», uno vacío como «vacío»; ambos no son lo mismo.

Dos tipos están señalados aparte:

- **Modificado desde fuera** significa que la aplicación encontró, en su siguiente escritura propia, una diferencia que no había causado ella misma. Entonces no se conoce ningún autor, y el justificante lo dice.
- **Agrupado** significa que la agrupación ha reunido en un solo justificante un periodo de varios cambios. Indica cuántos cambios sustituye, desde cuándo abarca el periodo y qué tipos había en él.

Donde el rastro se rompe, la página lo dice en el lugar en el que salta a la vista. Hay dos situaciones. El valor anterior de un campo **difiere**, entonces el justificante no enlaza con el que lo precede. O un justificante **no se puede leer**, entonces se desconoce qué modificó, y la comprobación vuelve a empezar detrás de él. Si el archivo entero no se puede leer, la página lo dice también y deja su contenido intacto.

La página **solo lee**, en ella no se modifica nada; el botón «Actualizar» recoge el estado de nuevo. Con muchísimos justificantes muestra un extracto y escribe encima de qué es un extracto.

### La agrupación

Un archivo de justificantes crece con cada cambio. Para que no crezca sin fin, la aplicación agrupa, a partir de un umbral doble, los justificantes más antiguos de los registros muy modificados en lugar de borrarlos. Sin una indicación propia rigen **0,7 MB** para el archivo entero y **200 justificantes por registro**.

Ambos límites se fijan en cada tabla, en el frontmatter del archivo de tabla bajo la indicación `changeLog`:

```yaml
---
db-table:
  fields:
    - name: título
  changeLog:
    maxBytes: 2000000
    maxPerRecord: unlimited
---
```

`maxBytes` es el tamaño del archivo en bytes, `maxPerRecord` el número de justificantes por registro. La palabra `unlimited` desactiva el límite correspondiente. Cada indicación vale por sí sola, una indicación omitida conserva su valor predeterminado, y una indicación inutilizable se comunica como incidencia, tras lo cual también rige el valor predeterminado.

**La agrupación tiene un precio.** Un justificante agrupado indica de qué valor a qué valor llevó un periodo, cuántos cambios sustituye y si dentro de él hubo una creación o una eliminación. Ya no indica quién modificó qué y cuándo, uno por uno; esa parte del rastro ha desaparecido después. Una promesa rige sin excepción: nunca se agrupa por encima de un justificante del tipo **Modificado desde fuera**. Él termina el periodo y permanece sin cambios.

### El límite, dicho con honestidad

Un cambio que usted hace a mano en un editor sobre el archivo de tabla no genera **ningún** justificante. La aplicación no lo ve en el momento en que ocurre.

Lo que hace en su lugar: en su siguiente escritura propia compara el estado encontrado con el esperado. Si difieren, no guarda todavía el nuevo cambio, para que pueda verse la versión actual; si después se guarda de todos modos, un justificante del tipo **Modificado desde fuera** retiene la diferencia. Así no desaparece nada sin que se note. Sin embargo, el justificante no indica ni el momento ni el autor de ese cambio, porque ninguno de los dos se conoce.

**Por esta vía, los permisos solo protegen la definición.** Si guarda una definición modificada en el editor de la aplicación, la aplicación comprueba su rol (sección «Permisos»). Un cambio en el bloque de registros, en cambio, no lo comprueba allí ni frente al rol ni frente a las reglas de la tabla, y con otro editor no rige ninguna de las dos comprobaciones.

## Bloqueos

Un bloqueo procura que un registro no se edite en dos lugares a la vez, por ejemplo en dos ventanas de la aplicación. Los bloqueos y los justificantes de cambio están concebidos para preparar el acceso compartido de varias personas; ese acceso llegará con EM4us, el futuro componente de servidor. EM4me en sí es una herramienta para una persona que trabaja sola y en local. El uso de varios equipos en una misma área sobre una unidad de red no está garantizado.

### Qué se bloquea y cuándo

Se bloquea el **registro** concreto, y justo en el momento en que comienza su edición. Se libera en cuanto la edición termina, tanto al guardar como al descartar. La mera consulta no bloquea nada: de lo contrario, una lista con cientos de registros los bloquearía todos de golpe con cada vistazo.

En el formulario, la edición comienza con **«Editar»** o con **«Eliminar»**, que toma el bloqueo ya antes de su pregunta de confirmación. Termina al guardar, con **«Descartar»**, con **«Volver a cargar»**, al cancelar la pregunta de eliminación, al cambiar a otro registro y al cerrar la pestaña del formulario. Si la aplicación rechaza un guardado, el bloqueo se mantiene, porque la edición continúa. Abrir el formulario y crear un registro nuevo no bloquean nada. En un formulario de lista, la edición de una fila comienza con «Editar», el doble clic o «Eliminar» y termina con «Guardar», «Cancelar», la respuesta a la pregunta de eliminación y, a más tardar, cuando se cierra el documento, se cambia la vista o se muestra otro documento abierto; una fila nueva no bloquea nada. Una fila de la sección de posiciones de un formulario mantiene su bloqueo hasta que el formulario se guarda o se descarta.

Si se cambia la **definición de una tabla**, durante ese tiempo queda bloqueada la definición, porque un cambio en las columnas afecta a todos los registros de la tabla.

### Cuando un registro ya está bloqueado

La aplicación nunca sobrescribe en silencio. Informa de **quién** tiene el registro, **en qué equipo** y **desde cuándo**, y le deja a usted dos caminos: **solo leer** el registro o **forzar** el bloqueo.

En el formulario este aviso aparece como el bloque **«El registro está bloqueado»**, y el formulario sigue en modo de lectura. **«Solo consultar»** cierra el bloque. **«Romper el bloqueo»** solo aparece cuando ha transcurrido el plazo indicado abajo, y tras romperlo lleva directamente a la edición; si el bloqueo ha cambiado entretanto, la ruptura se rechaza, y el bloque muestra los datos leídos de nuevo.

Un bloqueo ajeno solo se puede forzar cuando es **más antiguo que cuatro horas**. El plazo es deliberadamente grueso: los relojes de dos equipos pueden desviarse entre sí sin que una edición en curso parezca abandonada. Tampoco una vez transcurrido el plazo retira la aplicación por sí misma un bloqueo ajeno. Solo ofrece forzarlo, y usted decide. Aquel cuyo bloqueo se ha forzado lo sabrá en cuanto termine su propia edición.

**Titular desconocido.** Si existe un bloqueo que no indica ningún titular, por ejemplo porque se escribió de forma incompleta al crearse, el bloque lo dice exactamente así en lugar de inventar datos. También entonces usted solo puede consultar el registro, y el bloqueo solo se puede romper cuando ha transcurrido el mismo plazo.

Si **otra ventana** de esta aplicación está editando el registro, el bloque también lo dice. Allí solo se ofrece «Solo consultar», porque el bloqueo de una ventana propia no se puede romper.

### Tras un cierre inesperado

Si tras un cierre inesperado de la aplicación queda atrás un bloqueo **propio**, no le estorba a usted: la aplicación reconoce que el bloqueo procede de este equipo y que el programa que lo mantenía ya no se ejecuta, y lo asume sin preguntar. Si en cambio es una segunda ventana de la aplicación la que tiene el registro, allí cuenta como bloqueado igual que para cualquier otro.

### Lo que el bloqueo no hace

Un bloqueo es un acuerdo entre las aplicaciones que trabajan en esta área, y no una propiedad del archivo. Quien modifica el archivo de tabla a mano en un editor no ve bloqueo alguno. Por eso la aplicación comprueba además en **cada** guardado si el registro sigue tal como lo leyó, incluso cuando mantiene el bloqueo.

### La carpeta de bloqueos

Los bloqueos están como archivos pequeños en una carpeta situada en la raíz del área, de manera predeterminada `.area-locks`. Nace con el primer bloqueo, y la aplicación la lleva: no aparece en ninguna lista de archivos, ni en la búsqueda ni en las estadísticas. A diferencia de los justificantes de cambio, no retiene nada duradero. Si nadie trabaja, está vacía y puede faltar. Durante un guardado, la aplicación deposita además allí un pequeño protocolo de la operación, que vuelve a desaparecer cuando esta termina; si un cierre inesperado deja la operación a medias, el protocolo permanece hasta que la aplicación ha terminado la operación. No borre nada de ella a mano mientras alguien trabaje o haya un protocolo en ella.

El **nombre de la carpeta** lo cambia usted en **Archivo → Configuración… → Área actual → Base de datos**, en el campo **«Nombre de la carpeta de bloqueos»**. Rige lo siguiente:

- El nombre vale **para el área** y, por tanto, para todas las personas que trabajan en ella. Reside en el archivo del área y viaja con la carpeta del área.
- El nombre **debe empezar por un punto**, porque es precisamente así como la aplicación reconoce que una carpeta no pertenece al índice, a la búsqueda ni a las estadísticas. Tampoco se admiten los separadores de ruta, los caracteres prohibidos en Windows ni los nombres de dispositivo reservados como `CON`, y con ese nombre no debe haber ya otra cosa en la raíz del área.
- El cambio le cambia el nombre a la carpeta existente en lugar de crear una segunda. Solo sale bien **mientras nadie tenga un registro en edición**. En caso contrario, el aviso indica quién está trabajando, y todo queda como estaba.

## Permisos

**Los permisos evitan errores de manejo, no abusos.** Son un acuerdo de trabajo como el bloqueo y no una garantía de confidencialidad. No existe un permiso de lectura: quien puede leer los archivos del área los lee con cualquier editor y también puede modificarlos allí, sin que se consulte ningún rol. Solo se puede imponer el límite del sistema operativo, es decir, quién puede acceder a la carpeta.

Dentro de la aplicación, los permisos fijan quién puede cambiar qué. Para ello la ficha lleva **roles** con nombre, y cada rol indica por tabla qué acciones están permitidas. La separación más importante es la que hay entre mantener los datos y cambiar la definición: quien maneja una base de datos entregada para mantener sus datos no debe cambiar su esquema por descuido. Eso ayuda ya cuando una sola persona trabaja con la base de datos.

### Roles en la ficha

Los roles figuran bajo `roles` en el contenedor `db-database`, junto a ellos el rol por defecto y la asignación de nombres de inicio de sesión:

```yaml
db-database:
  name: Biblioteca
  roles:
    bibliotecario: all
    auxiliar:
      Libros: [update]
      Préstamos: [create, update, delete]
  defaultRole: auxiliar
  users:
    mstumm: bibliotecario
```

Cada rol lleva o bien la palabra `all`, o bien una correspondencia de nombres de tabla a una lista de las operaciones permitidas:

| Operación | Significado |
| --- | --- |
| `create` | crear registros |
| `update` | modificar registros |
| `delete` | eliminar registros |
| `define` | cambiar la definición de la tabla |

La palabra `all` vale en tres lugares: como valor de un rol para las cuatro operaciones en todas las tablas, como nombre de tabla para todas las tablas y como entrada de una lista para las cuatro operaciones. Una tabla que un rol no nombra no le permite nada, igual que una lista vacía. Las operaciones y los nombres de tabla valen sin distinguir mayúsculas y minúsculas, los nombres de rol tal como están escritos.

**Sin `roles` todo está permitido**, como en una base de datos sin permisos. El resumen de la base de datos muestra en el bloque de la ficha la sección **«Roles»**, con una línea por rol y sus permisos por tabla. Si un rol nombra una tabla que no existe o una operación desconocida, el rol entero cuenta como no definido; el resumen nombra cada uno de sus errores entre las incidencias.

### Qué rol rige

Bajo `users` la ficha asigna un rol a nombres de inicio de sesión, y `defaultRole` nombra el **rol por defecto** para todos los demás. Lo que cuenta es el nombre de inicio de sesión con el que usted ha iniciado sesión en el sistema operativo, el mismo que los justificantes de cambio indican como usuario. Se compara carácter por carácter: `MStumm` y `mstumm` son dos nombres. No hay una interfaz de mantenimiento; la asignación se mantiene a mano en la ficha, como la definición.

Rige la primera regla que se cumple:

1. Sin roles todo está permitido.
2. Si su nombre de inicio de sesión figura bajo `users`, rige el rol que tiene asignado.
3. Si no, rige el rol por defecto.
4. Sin rol por defecto todo está permitido.

Qué rol rige para usted lo muestra el resumen en la línea **«Rol propio»**, con el nombre de inicio de sesión tal cual: el rol asignado, el rol por defecto o «todo permitido (sin asignación)». Quien introduce una asignación copia el nombre con más seguridad desde allí. Si `users` o `defaultRole` nombra un rol que no existe, esa indicación cuenta como no definida y también se notifica.

### Comprobación al escribir

Todo cambio en registros pasa por la vía que describe la sección «Guardado por la aplicación», y allí la aplicación comprueba primero el rol, para cada registro con tabla y operación. Si falta el permiso, se rechaza toda la operación, y el aviso nombra rol, tabla y acción. También empezar un registro nuevo exige `create`: sin ese permiso la aplicación rechaza el alta, por ejemplo con el comando «Nuevo registro en la tabla activa», y la barra de estado indica el motivo. Si los permisos no se pueden determinar, porque las tablas del área aún no se han leído por completo o la ficha no se puede leer, tampoco se escribe nada, y el aviso pide volver a intentarlo en un momento.

### Comprobación al guardar la definición

La definición es el contenedor `db-table` de un archivo de tabla y la ficha `db-database`. Si el guardado de un archivo cambia su definición, la aplicación exige `define`: en esa tabla para un archivo de tabla, en todas las tablas para la ficha. Esto vale al guardar en el editor, en **«Guardar como…»** sobre un archivo existente o nuevo y en la sustitución en toda el área. Si falta el permiso, no se escribe nada. Al guardar aparece el diálogo de error **«Error al guardar»** con una frase que nombra rol y tabla, y el texto queda sin guardar en el editor; la sustitución en toda el área recoge el archivo en su informe bajo **«No sustituidos»**.

Lo que no toca la definición queda libre: el bloque de registros y el resto del texto del archivo, así como los archivos de formulario y de consulta. Otra sangría u otro orden de las indicaciones no cuenta como cambio, el orden de los campos en cambio sí, porque determina las columnas. El nivel de crecida `lastId` lo mantiene al día la propia aplicación; nunca cuenta como cambio.

### En formularios y resumen

Los formularios solo ofrecen lo que su rol permite; quien diseña un formulario no escribe nada en él para ello.

- En el **formulario**, sin `update` falta la acción «Editar», los campos quedan en modo de lectura, y una frase nombra el rol que no puede modificar registros de esta tabla. Sin `delete` falta «Eliminar».
- Sin `create` falta el botón **«Nuevo registro»** debajo de la tabla y en la fila de la tabla del resumen.
- Un **formulario de lista** y una sección de posiciones solo ofrecen las acciones que `allow` y el rol permiten juntos. Si `allow` permite modificar y el rol no, una información emergente de la fila nombra el rol; una fila a la que no le queda ninguna acción aparece atenuada.
- El **resumen** indica debajo de cada tabla los permisos de su rol, por ejemplo «Permisos: crear, modificar», siempre que la ficha lleve roles.

Los formularios muestran, se decide al escribir: quien desencadena una acción por otra vía queda rechazado por la comprobación anterior.

### No dejarse fuera a sí mismo

Quien cambia la ficha de modo que el rol propio no tenga `define` en todas las tablas ya no puede cambiarla después en la aplicación, ni siquiera para deshacerlo. Es la separación prevista, pero en el uso por una sola persona le afecta a usted mismo. Tres vías llevan de vuelta: abre el archivo de la ficha con otro editor y elimina o corrige allí las indicaciones de rol. Desactiva la extensión «Base de datos», corrige la ficha en la aplicación y la vuelve a activar; mientras está desactivada, el guardado no comprueba ningún rol (sección «Desactivar la base de datos»). O bien, antes de restringir roles, asigna su propio nombre de inicio de sesión bajo `users` a un rol con `define` en todas las tablas, por ejemplo un rol con `all`.

### Entrega y nombres de inicio de sesión en el archivo

Los roles forman parte de la definición y viajan con la ficha. La asignación bajo `users` figura en el mismo archivo: los nombres de inicio de sesión son legibles allí para cualquiera que pueda abrir el archivo, y una copia de la carpeta se los lleva. La aplicación no ofrece una entrega que deje fuera la asignación; quien entrega un área retira antes la asignación si no debe ir con ella. En el destinatario una asignación solo coincide si su nombre de inicio de sesión es exactamente el mismo; si no, rige para él el rol por defecto o, sin él, todo está permitido.

## Comprobación de coherencia

En el guardado por la aplicación se comprueba cada cambio. Lo que llega a los archivos por otro camino, por ejemplo a mano en un editor, nadie lo comprueba por el camino, y algunas reglas no actúan en absoluto al leer. La **comprobación de coherencia** recorre por eso todos los datos e indica dónde contradicen las reglas de la base de datos.

Está en el resumen de la base de datos: **«Comprobar coherencia»** en la cabecera comprueba todas las tablas, **«Comprobar»** en la fila de una tabla solo esa. El comando **«Comprobar la coherencia de la base de datos»** de la paleta de comandos también comprueba todas las tablas; para ello abre el resumen.

El resultado figura en la sección **«Comprobación de coherencia»** del resumen: la duración, por tabla el número de sus registros y hallazgos, y debajo los hallazgos con tabla, registro, campo y una frase en claro. Un clic en el registro abre su formulario. La lista muestra como mucho los primeros 500 hallazgos e indica entonces cuántos hay en total.

Se detectan:

- una clave funcional asignada más de una vez, con un hallazgo por cada registro implicado, y un identificador que figura más de una vez en la tabla;
- un enlace que no da con ningún registro, que da con varios o que apunta mediante un valor de clave a una tabla con clave de varios elementos, y una columna de enlace cuya tabla de destino falta o no está indicada;
- un valor que no encaja con su tipo, que incumple una regla de campo o que falta siendo obligatorio, y un registro que incumple una regla bajo `checks`;
- un registro con más o menos celdas que campos tiene la tabla;
- en un archivo de formulario, un campo desconocido, un marcador desconocido, una expresión no válida de un marcador de valor, una marca de sección condicional sin su pareja, una condición no válida o una tabla desconocida, y en una definición de tabla una indicación `form` que no nombra ningún archivo de formulario de esta tabla;
- en un archivo de formulario, además, una ruta que no nombra ningún campo de referencia o ningún campo de la tabla de destino, y una sección de posiciones cuyo archivo de consulta falta o no lleva `editable: true`, cuyas posiciones no tienen ningún campo de referencia o ninguno inequívoco hacia la tabla del formulario, o cuya consulta no puede completarse con la relación;
- en un archivo de consulta, una indicación inservible en el contenedor `db-query`, una acción desconocida en `allow` y una indicación `form` que no nombra ningún archivo de formulario de la base de datos; un hallazgo así nombra en la columna «Origen» el archivo en lugar de una tabla;
- al comprobar todas las tablas, una indicación inservible en la ficha bajo `roles`, `defaultRole` o `users`, por ejemplo un rol con una tabla o una operación desconocida o una asignación a un rol que no existe; el resumen nombra el motivo entre las incidencias;
- como aviso, una tabla que lleva registros pero ningún nivel de crecida `lastId` o uno demasiado bajo; el siguiente alta se sitúa entonces por encima del identificador más alto existente y lo eleva;
- una tabla cuya definición no se puede leer; sus registros quedan entonces sin comprobar, y la comprobación continúa con las demás tablas.

**La comprobación no cambia nada.** Solo lee, y una función que limpie los hallazgos por sí misma no existe deliberadamente: cuál de dos registros con la misma clave es el correcto lo decide usted en el formulario. El resultado se mantiene mientras el resumen está abierto; tras una corrección, usted vuelve a comprobar.

La comprobación es rápida: con unos miles de registros dura unas decenas de milisegundos. Si el índice del área todavía se está construyendo, lo indica y le pide que vuelva a intentarlo en un momento.

## Uso de tablas y registros

El **uso** indica quién utiliza una tabla o un registro. Solo se lee cuando usted lo pide, y no se cambia nada.

**Para una tabla**, la acción **«Uso»** figura en su fila del resumen. Bajo «Usado por» nombra las tablas que apuntan a esta tabla con una columna de enlace, cada una con los nombres de esas columnas, y los archivos de formulario de la tabla. Si nadie la utiliza, indica «Sin uso».

**Para un registro**, la acción **«Usado por»** figura en la cabecera de su formulario mientras este está en modo de lectura. Enumera los registros que remiten a él, cada uno con tabla, campo, forma de visualización e identificador; un clic abre el formulario del registro que remite, y «Atrás» vuelve al registro mostrado. En un registro nuevo falta la acción, porque nadie puede remitir a un registro que aún no está guardado.

**La lista del registro es la vista previa de la protección contra la eliminación.** Busca exactamente igual que la comprobación al eliminar, también mediante la forma corta del identificador, mediante el valor de una clave de un solo elemento y en los archivos siguientes de una tabla. Si un registro figura en ella, el mostrado no se puede eliminar. Un registro que remite a sí mismo no aparece, porque no impide su propia eliminación. Como en la protección contra la eliminación, solo cuenta la columna de enlace; un enlace en el texto corrido, por ejemplo `[[Clientes#^r-00001]]`, no es un uso.

## Localizabilidad: búsqueda y enlaces

La búsqueda sobre el **área** encuentra registros como resultados propios. En el panel «Resultados de búsqueda», detrás de los grupos de los documentos, cada tabla tiene un grupo propio con el nombre de la tabla y el añadido «Registros». Cada fila nombra el registro con su forma de visualización y el campo que contiene el término buscado, y muestra su valor con la coincidencia resaltada. Un clic abre el registro en el formulario predeterminado de su tabla. Se buscan los valores de los campos en todos los archivos de una tabla, también en sus archivos siguientes, y, en una tabla abierta, su estado sin guardar. El recuento sobre la lista cuenta juntas las coincidencias de documentos y de registros. Con la fila de reemplazo abierta se omiten los grupos de registros, porque el reemplazo en el área no escribe en los registros.

El bloque de registros mismo, en cambio, no forma parte del espacio de búsqueda de texto completo: un término que solo figura en los registros de un archivo de tabla no da ninguna coincidencia para ese documento, sino solo los resultados de registro. El texto explicativo situado encima del bloque de datos sigue siendo consultable como documento, y una coincidencia posterior a él sigue llevando al lugar correcto. El motivo está en el área y no en la tabla: el espacio de búsqueda mantiene en memoria los textos de todos los archivos Markdown y lleva para ello un tope sobre el área **entera**. Unas pocas tablas de algunos megabytes bastan para romperlo, y a partir de ahí cada búsqueda vuelve a leer del disco, también la que recorre un documento corriente. Los registros en el espacio de búsqueda no costarían, pues, su velocidad a sí mismos, sino al área entera.

Además, tres caminos llevan a los registros:

- **Buscar dentro del documento abierto.** Quien tiene delante el archivo de tabla y busca en él (predeterminado `Ctrl+F`) busca en el texto que tiene delante y encuentra sus registros sin cambio alguno. El límite anterior afecta únicamente a la búsqueda sobre el área.
- **Plantear una consulta de registros.** Un bloque `perspective-query` con `LIST RECORDS` o `TABLE RECORDS` encuentra registros por sus campos, por ejemplo todos los libros de un autor; la página [Consulta Perspective](frontmatter-query.md) la describe. Una consulta que se necesita a menudo puede guardarse como archivo de consulta (sección «Archivos de consulta»).
- **Enlazar directamente a un registro**, como se describe en la sección siguiente.

### Enlace a un registro concreto

Un enlace nombra la tabla y el identificador interno, escrito como un ancla de bloque:

```markdown
[[Personen#^r-00042]]
```

**Otras dos grafías** valen igualmente: la forma corta del identificador, `[[Personen#^r-42]]`, y la forma de visualización del registro, `[[Personen#^Anna Muster]]`. Una forma de visualización en un enlace se compone de letras, cifras, espacios y los caracteres guion bajo, guion, punto, apóstrofo, coma y paréntesis redondos; con otro carácter, por ejemplo `&`, no se resuelve. Se compara sin espacios iniciales ni finales, pero teniendo en cuenta mayúsculas y minúsculas. La aplicación no reescribe el enlace: se guarda tal como está escrito.

**La resolución sigue un orden fijo.** Si el archivo de tabla lleva un ancla de bloque con exactamente este nombre, el enlace vale para ella, y el linter advierte de que el ancla de bloque oculta un registro; del mismo modo, el clic lleva a un encabezado del mismo nombre. Si no, cuenta primero el identificador, largo o corto, y después la forma de visualización. Si varios registros llevan la misma forma de visualización, el enlace vale de todos modos, el linter lo marca como nombre de registro ambiguo, y el clic abre el archivo de tabla; el identificador lo hace unívoco.

**La lista de sugerencias ayuda a escribir.** Tras `[[Tabla#^` ofrece, detrás de las anclas de bloque del archivo, los registros de la tabla, cada uno con su forma de visualización y el añadido «Registro», como máximo 30 entradas en total. Al escribir se acota la lista por forma de visualización e identificador, y la selección escribe el identificador largo, por ejemplo `[[Personen#^r-00042]]`.

El enlace **vale** si la tabla nombrada lleva ese registro, y está roto si no lo lleva. Se comporta así como cualquier otro enlace de la aplicación. Vale también cuando el registro no está en el primer archivo de la tabla sino en uno de sus archivos siguientes: para quien lo escribe la tabla es una sola, y su reparto entre archivos no le incumbe.

La comprobación se hace contra el estado **guardado** de la tabla, como con cualquier otra ancla. Un enlace a un registro recién creado y todavía sin guardar no vale todavía, y una forma de visualización modificada solo se resuelve después de guardar.

Si un enlace vale lo muestra el [linter de Markdown](tools.md): un destino roto recibe un subrayado ondulado en el editor, es decir en las vistas Código, Dividida y En vivo. La vista de lectura pura no representa la validez; allí los enlaces válidos y los rotos se ven igual.

**Un clic abre el formulario del registro**, en el formulario predeterminado de su tabla. La acción **«Mostrar en el documento de tabla»** en la cabecera del formulario lleva a la fila en el archivo de tabla (sección «Leer y editar»). Si un enlace no coincide con ningún registro de forma unívoca, el clic abre el archivo de tabla. Fuera de un área abierta, el clic abre el archivo de tabla y pone a la vista la fila del registro. En el resultado de una consulta de registros, un clic en un registro abre igualmente su formulario.

**Un enlace en el texto no retiene el registro.** Si el registro se elimina, el enlace se rompe como cualquier otro enlace de la aplicación, y el linter lo muestra. La protección contra la eliminación la lleva solo la columna de enlace (sección «Uso de tablas y registros»).

## Archivos de consulta

Una consulta que se necesita a menudo recibe un documento propio: si lleva en su frontmatter la marca `db-query` y en su texto exactamente un bloque de consulta, es un **archivo de consulta**. El resto del texto describe la consulta y aparece como en cualquier documento.

````markdown
---
db-query:
paginasmin: 500
---

# Libros largos

Libros de más de `paginasmin` páginas, los más largos primero.

```perspective-query
TABLE RECORDS autor, paginas FROM "Libros" WHERE paginas > this.paginasmin SORT paginas DESC
```
````

- **La marca basta.** El archivo se reconoce solo por la marca, basta `db-query:` sin valor; la consulta nombra ella misma su tabla en `FROM`. La consulta puede dirigirse a cualquier nivel, tanto a archivos como a registros. Con las indicaciones `editable`, `form` y `allow` en el contenedor, el archivo se convierte en un formulario de lista, que describe la sección siguiente.
- **Abrir e incrustar.** Abierto, el archivo muestra su resultado como cualquier documento con un bloque de consulta. Otro documento lo incrusta con `![[Libros largos]]` y muestra el mismo resultado, porque `this.` se refiere entonces al archivo de consulta y no al documento que lo incrusta. Por eso no existe una consulta que lea valores del documento que la incrusta.
- **Crear.** No hay un comando propio para ello: un archivo de consulta se escribe a mano o a partir de una [plantilla](templates.md) propia.
- **Sin la marca**, un documento con un bloque de consulta sigue siendo una consulta en el texto corrido y no aparece en el resumen.
- **En el resumen** de la base de datos, cada archivo de consulta figura en la sección «Consultas» (sección «El área como base de datos»); la falta de bloque de consulta o la presencia de varios se comunica entre las incidencias (sección «Indicaciones defectuosas»).

**Dos significados de `editable`.** En la definición de una tabla, en el contenedor `db-table`, `editable` es una condición que indica para cada registro por separado si todavía puede editarse (sección «Edición condicionada»). En el contenedor `db-query` de un archivo de consulta, `editable` es un sí o un no y convierte el archivo en un formulario de lista. Ambos actúan juntos: un formulario de lista ofrece la edición solo para las filas cuyo registro cumple la condición de su tabla.

## Formulario de lista

Un archivo de consulta se convierte en **formulario de lista** cuando su contenedor `db-query` lleva la indicación `editable: true`. Muestra entonces sus registros como cuadrícula, en la que se abren, modifican, crean y eliminan filas; el resto del texto del archivo describe la lista como en cualquier archivo de consulta.

````markdown
---
db-query:
  editable: true
  form: Préstamos Form
  allow: [create, update, delete]
---

# Préstamos abiertos

```perspective-query
TABLE RECORDS libro, lector, salida, vence FROM "Préstamos" WHERE NOT devuelto SORT vence
```
````

| Indicación | Significado |
| --- | --- |
| `editable` | `true` convierte el archivo de consulta en un formulario de lista. Sin la indicación o con `false` sigue siendo un archivo de consulta corriente |
| `form` | el nombre del archivo de formulario sin extensión que abre un clic en una fila. Sin la indicación vale el formulario predeterminado de la tabla |
| `allow` | las acciones permitidas como lista de `create` (crear), `update` (modificar) y `delete` (eliminar). Sin la indicación vale solo `update`; una lista vacía no permite ninguna |

`form` y `allow` solo actúan junto con `editable: true`.

### Ver y abrir

En cada vista que muestra el resultado, es decir, en las vistas Renderizado, Dividido y En vivo, la cuadrícula ocupa el lugar de la tabla de resultados: las mismas columnas, delante la columna «Registro» y encima una línea de recuento como «Filas 1 a 50 de 120». Una página muestra 50 filas fijas; si hay más filas, **«Siguiente»** y **«Atrás»** pasan las páginas.

Un clic en una fila abre su registro en el formulario que nombra `form`, si no en el formulario predeterminado de su tabla. Si `form` nombra un archivo de formulario que no existe o que pertenece a otra tabla, el clic abre igualmente el formulario predeterminado, y el resumen muestra un aviso entre las incidencias del archivo de consulta. En una fila que se puede editar, un clic simple en una celda editable no abre el formulario, porque allí el doble clic inicia la edición; el formulario lo abren entonces la columna «Registro» y las celdas de solo lectura. Si la consulta lleva `WITHOUT ID`, falta la columna «Registro», y en una fila así solo una celda de solo lectura abre el formulario. Un enlace en una celda abre, como en todas partes, el formulario de su destino.

**Mirar no bloquea nada.** De lo contrario, una lista con cientos de registros los bloquearía todos con cada vistazo; solo se bloquea la fila cuya edición comienza.

Un formulario de lista lee exactamente una tabla. Solo se pueden editar las columnas que nombran exactamente un campo de esa tabla; una columna calculada, una ruta a través de un campo de referencia y `record.id` quedan en modo de lectura. Toda la lista queda en modo de lectura si está agrupada o elige una forma de visualización con `DISPLAY`: una frase lo indica, y debajo aparece el resultado como en cualquier consulta. Una consulta sobre archivos, bloques o tareas en lugar de registros y una consulta cuyos resultados proceden de varias tablas muestran la tabla de resultados habitual.

### Editar filas

Si `allow` permite modificar, la cuadrícula lleva al final de la fila la columna **«Acciones»**. **«Editar»** allí o un doble clic en la fila inicia la edición: la aplicación bloquea el registro, lee su estado actual del archivo y convierte las celdas editables en entradas con la forma de su tipo, como en el formulario. **«Guardar»** o la tecla Intro escribe, en un campo de varias líneas Mayús+Intro hace un salto de línea; **«Cancelar»** o la tecla Esc descarta. Salir de la fila sin más no guarda. Se escribe por el mismo camino que en el formulario, con todas las reglas de la tabla.

Se edita una fila cada vez: mientras está abierta, el paso de página y las acciones de las demás filas quedan bloqueados. Si se cierra el documento, se cambia la vista o se muestra otro documento abierto, la edición termina sin guardar y el bloqueo se libera.

Si la aplicación rechaza el cambio, la fila sigue en edición. Si el aviso afecta a un campo, figura en su celda; una regla sobre varios campos figura en la columna «Acciones». Si alguien ha modificado el registro desde que la fila lo leyó, aparece debajo de la fila el mismo bloque que en el formulario, con **«Volver a cargar»** y **«Guardar de todos modos»**. Si otro lugar mantiene el registro bloqueado, aparece debajo de la fila el aviso de la sección «Bloqueos». Si no ha cambiado nada, no hay nada que guardar, y la fila vuelve a la lectura.

Si un registro puede modificarse lo indica la indicación `editable` de su tabla **para cada fila**: una fila cuyo registro no se puede modificar según esa condición aparece atenuada, sin «Editar» y sin «Eliminar», y una información emergente nombra el motivo.

### Crear y eliminar

Con `create` en `allow`, junto a la línea de recuento está el botón **«Nueva fila»**. Coloca una fila vacía arriba de la página mostrada, que muestra «Nuevo» en la columna «Registro», e inicia allí la edición. El registro nuevo recibe su identificador ya ahora, como en el formulario; al archivo llega solo con **«Guardar»**, y después figura donde lo sitúa la ordenación de la consulta, posiblemente en otra página. **«Cancelar»** vuelve a quitar la fila.

Con `delete` en `allow`, cada fila modificable lleva **«Eliminar»**. La aplicación bloquea el registro y pregunta debajo de la fila, como el formulario: **«Sí, eliminar»** elimina, y la lista muestra después los registros sin él; **«No»** lo deja todo como está. Un registro al que todavía apunta una columna de referencia tampoco se puede eliminar aquí: el aviso figura debajo de la fila, y la fila se queda.

Sin `update` faltan «Editar» y el doble clic, y un clic en cualquier celda abre el formulario; «Nueva fila» y «Eliminar» se mantienen en la medida en que `allow` los permite.

## Posiciones en el formulario

Además de los campos de su registro, un formulario puede mostrar los registros de otra tabla que apuntan a él, por ejemplo las posiciones de una factura o los préstamos de un libro. Para ello el archivo de formulario lleva el marcador `{{list:<archivo de consulta>}}` solo en su línea, con el nombre de un formulario de lista sin extensión:

```markdown
**Título:** {{field:titulo}}

## Préstamos

{{list:Préstamos abiertos}}
```

La **sección de posiciones** muestra la cuadrícula de ese formulario de lista, limitada a los registros cuyo campo de referencia apunta al registro mostrado. Para ello la aplicación completa la consulta con esa condición; las columnas, la ordenación y las demás condiciones del archivo de consulta siguen vigentes. Si la tabla de las posiciones tiene exactamente un campo de referencia hacia la tabla del formulario, ese es el que se quiere decir; si tiene varios, `{{list:<archivo de consulta> BY <campo de referencia>}}` nombra el que se quiere decir. En medio de una línea de texto, el marcador sigue siendo texto y se señala.

**Mientras el formulario está en modo de lectura, la sección también lo está:** un clic en una fila abre la posición en su formulario. **Al editar**, la sección ofrece las acciones que permite `allow` del archivo de consulta, como la lista independiente. Una fila guardada, sin embargo, solo queda **marcada**: muestra su nuevo estado, una información emergente dice «Marcado; se guardará con el formulario.», y su bloqueo se mantiene; una fila marcada para eliminar sigue en su sitio, señalada. Una posición nueva recibe la referencia al registro mostrado sin entrada alguna, aunque ese registro se esté creando en ese momento.

**Se guarda con el formulario, todo o nada.** **«Guardar»** del formulario escribe la cabecera y todas las posiciones marcadas en una sola operación. Si una fila de la sección sigue en edición, primero se marca; si en ello se rechaza, el formulario no guarda y lo indica. Si la aplicación rechaza la operación, no se escribe nada, y todo se mantiene; el aviso sobre una posición figura en la cabecera del formulario y empieza con «Posición» y su número entre las filas marcadas. Tras guardar, todos los bloqueos quedan libres.

**«Descartar»** descarta cabecera y posiciones juntas y libera todos los bloqueos. Una fila nueva marcada puede volver a editarse, pero no retirarse por separado; solo desaparece con «Descartar». Las posiciones marcadas cuentan como edición sin guardar: antes de cambiar a otro registro, el formulario pregunta.

Si la sección no puede construirse, en su lugar figura un aviso con la línea del archivo de formulario; la sección «Indicaciones defectuosas» nombra los casos.

## Reparto de grandes conjuntos de datos

Cuando los datos superan unos **0,7 MB**, la aplicación los reparte al guardar entre varios archivos contiguos y los sigue tratando como **una sola** tabla. Usted abre el primer archivo y ve todos los registros; un enlace a un registro no nota la diferencia.

Se aplican cuatro garantías, y tres de ellas dicen lo que **no** ocurre:

- El corte se hace únicamente **entre dos registros**, nunca dentro de uno.
- Un registro **nunca cambia** de archivo. Los registros nuevos se añaden al final, no se redistribuye nada — así no se rompe ningún enlace a un registro.
- Un **reparto existente nunca se reconstruye**, aunque se haya creado con otro umbral.
- Cada archivo siguiente indica los **nombres de los campos** en su frontmatter para seguir siendo legible por sí solo. Esa lista es una ayuda de lectura y no un contrato: si contradice la definición del primer archivo, prevalece la definición, y el siguiente guardado pone la lista en orden.

El mecanismo subyacente es el mismo que en la [división de documentos grandes](document-parts.md); para los archivos de tabla solo difieren el umbral y el punto de corte.

## La ficha de la base de datos

Una base de datos se describe a sí misma en el contenedor `db-database`, en el frontmatter de un documento propio:

```yaml
---
db-database:
  name: Biblioteca
  description: Fondo, préstamos y lectores de la biblioteca de la casa
  schemaVersion: '1.0'
  fallbackLocale: es
---
```

- **`name`** y **`description`** son etiquetas y por eso son posibles igualmente como correspondencia de idioma a texto.
- **`schemaVersion`** es texto y va entre comillas. Sin ellas, YAML leería `1.0` como un número, y la versión `1.0` se convertiría al leerla en la versión `1`.
- **`fallbackLocale`** es el idioma al que recae una etiqueta cuando no lleva el idioma de la interfaz. Sin indicación rige el primer idioma que aparece en la propia ficha.
- **`roles`**, **`defaultRole`** y **`users`** llevan los roles de la base de datos, el rol por defecto y la asignación de nombres de inicio de sesión; la sección «Permisos» los describe. Sin ellos todo está permitido en la base de datos.

Cada una de estas indicaciones puede faltar por separado, y ninguna es requisito para las tablas: cada tabla lleva su definición ella misma y sigue siendo plenamente interpretable incluso sin ficha.

## El área como base de datos

En cuanto un documento del contenido de un área lleva la ficha, la aplicación trata esa área como **área de base de datos**. Usted no la declara aparte: la ficha es la declaración. Así la afirmación está en un solo lugar y no en dos que pudieran contradecirse.

Un área de base de datos recibe dos cosas que un área corriente no tiene.

**El resumen de los objetos de la base de datos** responde en un solo lugar a qué hay en esta área: la ficha con nombre y descripción, las tablas con el número de sus campos, los archivos de consulta y las incidencias detectadas al leer las definiciones, en claro y no como un código. Se abre como pestaña propia, y en el propio resumen no se modifica nada; sus acciones llevan al formulario y a las comprobaciones. Tres caminos llevan hasta él:

- **Ver → Resumen de la base de datos**,
- el **menú contextual del panel del área**,
- la **paleta de comandos**.

En un área sin base de datos no se ofrece ninguno de estos caminos.

En la lista de tablas, la columna **«Formulario»** nombra el archivo de formulario de una tabla y queda vacía para el formulario generado. Además, el resumen lleva cuatro acciones: **«Comprobar coherencia»** en la cabecera para todas las tablas, y en la fila de cada tabla **«Nuevo registro»**, **«Comprobar»** y **«Uso»**. Lo que hacen lo describen las secciones «Editar registros en el formulario», «Comprobación de coherencia» y «Uso de tablas y registros». La sección **«Consultas»** nombra cada archivo de consulta con su nombre y su ubicación, la carpeta relativa a la raíz del área, y **«Abrir»** lo abre como cualquier documento; si el área no tiene ninguno, figura allí una frase explicativa. Entre las incidencias figuran también los avisos sobre archivos de formulario y de consulta, nombrados según el archivo. La columna **«Tipo»** de la sección «Consultas» distingue una «Consulta» corriente de un «Formulario de lista» y nombra para este las acciones permitidas; si no permite ninguna, allí figura «Formulario de lista, solo lectura». En el bloque de la ficha el resumen nombra además el rol propio y, si la ficha lleva roles, también estos con sus permisos, y debajo de cada tabla los permisos del rol propio (sección «Permisos»).

**La sección de ajustes «Base de datos»** está en el grupo de navegación «Área actual» (Archivo → Configuración… → Área actual → Base de datos; con un libro abierto el grupo se llama **Libro actual**, con una estantería abierta **Estantería actual**). Muestra la misma información en forma breve, es decir, el nombre y la descripción de la base de datos, el número de sus tablas y el número de incidencias, y lleva una opción: **«Mostrar el resumen al abrir el área»**. Si está marcada, el resumen se abre por sí mismo en cuanto el área queda vinculada. La opción reside en el archivo del área y viaja con la carpeta del área. A ello se suma el campo **«Nombre de la carpeta de bloqueos»**; está descrito en la sección «Bloqueos».

Además, la aplicación mantiene en la raíz del área el pequeño archivo `Area_Database.mdda`. Guarda el estado del contador de los identificadores de operación, no aparece en ninguna lista de archivos y viaja con la carpeta del área; usted no tiene que hacer nada en él. Si falta, la aplicación recupera ese estado a partir de los justificantes de cambio.

## Indicaciones defectuosas

Para la definición entera rige la línea indulgente de la casa: una **indicación aislada** defectuosa se omite y se señala, la entrada sigue vigente; una **entrada** defectuosa se omite, las demás columnas permanecen. El aviso nombra el lugar, es decir, la columna afectada, la indicación errónea y lo que se esperaba en su lugar.

La única excepción es el **tipo**: un tipo fuera del conjunto de más arriba hace que se omita la entrada entera, porque una columna sin tipo interpretable no es una columna.

Una indicación que la aplicación no conoce se omite por separado con un aviso y no causa daño alguno.

Para la indicación `changeLog` de los justificantes de cambio rigen tres incidencias propias. Si `changeLog` no es un objeto, esta tabla no conserva límites propios, y se aplican los valores predeterminados de la aplicación. Si `maxBytes` o `maxPerRecord` no es un número entero mayor que cero ni la palabra `unlimited`, esa indicación se descarta, y rige su valor predeterminado. Cada una de estas situaciones se comunica; ninguna se pasa por alto en silencio.

La misma línea indulgente rige para las reglas de comprobación y para la condición de edición, regla por regla. Una regla inservible bajo `check` o `checks` se omite por separado, y las demás reglas, el campo y la tabla permanecen; se comunican una entrada que no es ni texto ni un objeto con `rule`, una expresión regular no válida, una expresión no válida, una regla de campo con una referencia distinta de `value`, un nombre de regla desconocido y una regla bajo `checks` que nombra un campo desconocido. Si `checks` no es una lista, se omiten todas las reglas bajo `checks`. Una indicación `editable` inservible se omite igualmente, y la tabla sigue siendo editable. Un aviso propio que no se puede interpretar se omite por sí solo; su regla o su condición sigue comprobando. Una indicación `editable` inservible en un campo se omite igualmente, y el campo sigue siendo editable.

La misma línea flexible vale para los archivos de formulario. Si el contenedor `db-form` no nombra ninguna tabla, o una que no existe en la base de datos, el archivo sigue siendo un documento corriente. Ambos casos figuran entre las incidencias del resumen; varios archivos de formulario de una tabla, en cambio, no son una incidencia, sino el caso de la sección «Varios formularios y el formulario predeterminado». Un marcador que no es ni de campo ni de valor y un nombre de campo que la tabla no conoce se quedan como texto, y un marcador de valor con una expresión no válida deja su lugar vacío; el formulario señala los tres con su línea en su cabecera, y la comprobación de coherencia los enumera como hallazgos. Una marca `{{end}}` sin sección abierta se pasa por alto, una sección sin `{{end}}` muestra su contenido como fuera de la sección, y una sección con una condición no válida sigue oculta; también estos tres los señala el formulario con su línea en su cabecera, y la comprobación de coherencia los enumera como hallazgos. Una marca que no está sola en su línea no es una marca y se queda como texto en calidad de marcador desconocido. Si la indicación `form` de la definición de tabla no nombra ningún archivo de formulario, uno que no existe para esta tabla o el archivo de formulario de otra tabla, figura un aviso entre las incidencias del resumen, y se aplica el formulario predeterminado sin indicación; la comprobación de coherencia enumera además los dos últimos casos como hallazgos en la tabla. Una ruta que no nombra ningún campo de referencia de la tabla o ningún campo de la tabla de destino deja su lugar vacío y se señala igualmente con su línea. Para la sección de posiciones hay cinco casos: el archivo de consulta nombrado no existe; no lleva `editable: true`; las posiciones no tienen ningún campo de referencia hacia la tabla del formulario; tienen varios, y `BY` no nombra ninguno; o la consulta no nombra una tabla única o no puede completarse con la relación. En el segundo caso la sección queda en modo de lectura, si no, vacía; cada caso figura como aviso con su línea en el lugar de la sección, y la comprobación de coherencia lo registra como hallazgo del archivo de formulario.

La misma línea flexible vale para los archivos de consulta. Si un documento con la marca `db-query` no lleva ningún bloque de consulta o lleva varios, sigue siendo un documento corriente, y cada bloque que contiene se evalúa. El resumen lo incluye de todos modos en la sección «Consultas» y nombra el caso entre las incidencias, según el archivo. La misma línea vale para las indicaciones de un formulario de lista, indicación por indicación: un `editable` que no es un valor de verdad cuenta como `false`; un `form` que no nombra ningún nombre se descarta; un `allow` que no es ni una acción ni una lista vuelve a `update`, y una palabra desconocida en él se descarta por separado. `form` o `allow` sin `editable: true` no tienen efecto, y cualquier otra indicación del contenedor se pasa por alto. Si `form` nombra un archivo de formulario que no existe en la base de datos o que pertenece a una tabla distinta de la de la consulta, un clic en una fila abre el formulario predeterminado de la tabla. Cada uno de estos casos figura como aviso entre las incidencias del resumen.

La misma línea suave vale para los roles, el rol por defecto y la asignación en la ficha. Un rol con una tabla desconocida, una operación desconocida o una indicación en una tabla que no es ni `all` ni una lista cuenta como no definido, y se notifica cada uno de sus errores. Un rol por defecto o una asignación que no nombra ningún rol existente cuenta igualmente como no definido, y rige la regla siguiente de la sección «Permisos». Todos estos casos figuran entre las incidencias del resumen.

Si una tabla lleva registros pero ningún nivel de crecida `lastId` o uno demasiado bajo, la aplicación no asigna aun así ningún identificador dos veces: un alta toma el número siguiente por encima del identificador más alto existente y después actualiza el nivel de crecida. La comprobación de coherencia señala el caso como aviso.

## Desactivar la base de datos

Toda la base de datos es una [extensión interna](extensions.md) llamada «Base de datos», de la categoría Herramientas, y se desactiva con un único interruptor. Requiere los [Perfiles de propiedades](property-profiles.md), porque la forma de una definición de tabla se describe y se comprueba mediante un perfil interno; mientras la base de datos esté activada, ese requisito no se puede desactivar.

Estando desactivada:

- El **bloque de registros queda como un bloque de código corriente**, en la vista de lectura, en el modo de edición y en la exportación portátil. Su contenido sigue siendo legible; lo que se desactiva es la representación como tabla, no el dato.
- **El resumen y la sección de ajustes desaparecen**, junto con los accesos del menú Ver, del menú contextual del panel del área y de la paleta de comandos. Un resumen ya abierto permanece hasta que usted lo cierre, como cualquier otra página del sistema.
- Con el bloque de registros desaparecen sus botones **«Abrir registro»** y **«Nuevo registro»**, con el resumen sus acciones **«Comprobar coherencia»**, **«Comprobar»** y **«Uso»**, y los comandos **«Nuevo registro en la tabla activa»** y **«Comprobar la coherencia de la base de datos»** desaparecen de la paleta de comandos. Así tampoco se puede llegar ya al **formulario**, y la aplicación deja de suministrar datos a él, a la comprobación de coherencia y al uso.
- Una **consulta de registros** ya no lee ninguna tabla: muestra una lista vacía con la nota de que la extensión está desactivada, y ningún mensaje de error. Lo mismo vale para las rutas a través de campos de referencia, para las jerarquías y para el árbol.
- Un **archivo de consulta** sigue siendo un documento corriente: su bloque de consulta se sigue evaluando, sobre registros con la lista vacía y la nota recién descritas, y su sección «Consultas» desaparece con el resumen. Un formulario de lista no muestra entonces ninguna cuadrícula ni ofrece ninguna acción.
- Un **enlace a un registro concreto** ya no se marca como roto. Sin definiciones no hay nada con lo que contrastarlo, y un aviso sin comprobación sería solo una afirmación. Un clic abre el archivo de tabla sin salto a la fila en lugar del formulario, y la lista de sugerencias no ofrece registros.
- La **búsqueda sobre el área no da resultados de registro**. Los registros siguen excluidos del texto completo, porque ese límite pertenece al archivo de tabla y no al interruptor; a través del área, los registros no son entonces localizables.
- Un **formulario** abierto al salir no vuelve al iniciar. Su entrada en la sesión queda en reposo y lo trae de vuelta en el siguiente inicio después de activarla (sección «Tras el reinicio»).
- **Roles, rol por defecto y asignación** quedan como simple frontmatter de la ficha, igual que una indicación `editable` en un campo: no hay resolución ni comprobación, ni siquiera al guardar una definición modificada.
- **No se escribe nada.** La aplicación no crea, modifica ni elimina registros, no toma ningún bloqueo y no genera ningún justificante de cambio; tampoco termina un guardado que quedó a medias mientras esté desactivada.

**Los archivos quedan intactos.** Desactivar retira la interpretación, no los datos: no se cambia ni un carácter, y al volver a activarla todo regresa. El índice del área se reconstruye una vez en ese momento; en fondos grandes eso tarda un instante.
