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
| `lastId` | nivel de crecida: el número más alto jamás asignado por la tabla. El siguiente identificador surge de él y no de los registros existentes, para que el número de un registro borrado no se asigne una segunda vez |
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

## Visualización de los registros

En la vista de lectura y en el modo de edición el bloque aparece como una tabla con las columnas de la definición. Cada valor se representa según el tipo de su columna: números alineados a la derecha y con los decimales declarados, valores de verdad como marca de verificación, valores de varias líneas con sus saltos. Si un valor no encaja con su tipo, la celda muestra su texto original y se señala con color en lugar de sustituirse.

A partir de **2000 registros** la vista muestra un extracto e indica debajo de qué lo es. Es una ventana y no un recorte silencioso: usted ve que hay más. El límite se ha medido, no decretado — hasta ahí la tabla aparece sin espera perceptible.

En la **exportación portátil**, en cambio, la tabla está completa, sin ventana. Un archivo que usted entrega no debe ocultar nada: el destinatario no tiene la aplicación y no vería que falta algo.

Los registros no se editan en esta vista, sino en su **formulario**, que describe la sección siguiente; el botón al comienzo de cada fila lo abre. El archivo de tabla es almacenamiento técnico — sigue siendo legible a mano y, en caso de emergencia, corregible a mano, pero en el funcionamiento normal usted no trabaja dentro de él.

## Editar registros en el formulario

Cada registro tiene un **formulario**: una página propia que muestra sus campos uno debajo de otro, en el orden de la definición, cada uno con su etiqueta. La aplicación lo genera a partir de la definición de la tabla; no hay nada que construir. En el formulario usted crea registros, los modifica y los elimina.

### Abrir y crear

Un registro existente se abre con el botón **«Abrir registro»** al comienzo de su fila, delante del botón de los justificantes de cambio, tanto en la vista de lectura como en el modo En vivo. Con el teclado, la flecha izquierda lleva a él desde el botón de los justificantes.

Tres caminos crean un registro nuevo:

- el botón **«Nuevo registro»** debajo de cada tabla, también debajo de una vacía,
- el botón **«Nuevo registro»** en la fila de cada tabla del resumen de la base de datos,
- el comando **«Nuevo registro en la tabla activa»** de la paleta de comandos. Actúa sobre el archivo de tabla de la pestaña activa; si allí no hay ninguno abierto, la barra de estado lo indica.

El formulario se abre como pestaña propia cuyo título nombra el archivo y el registro. Hay uno por ventana: si usted abre otro registro, la misma pestaña lo muestra. Si la edición en curso aún no está guardada, el formulario pregunta antes si debe descartarse.

Un registro nuevo recibe su identificador interno ya al abrirse el formulario: figura en la cabecera, y el nivel de crecida `lastId` de la tabla ya está actualizado. Los campos aparecen vacíos, y el registro solo llega al archivo con el primer guardado.

### Leer y editar

El formulario se abre **en modo de lectura**. Los valores aparecen como texto, un valor de verdad como marca de verificación, y un campo obligatorio está señalado como tal. La cabecera lleva las acciones **«Editar»**, **«Eliminar»** y **«Justificantes»**; la última abre los justificantes de cambio del registro.

**«Editar»** convierte cada campo en una entrada con la forma de su tipo:

| Tipo | Entrada |
| --- | --- |
| `string`, `link`, `record` | entrada de texto de una línea, en `record` con ayuda de valores |
| `multiline` | entrada de texto de varias líneas |
| `number`, `date`, `time` | entrada de un número, una fecha o una hora |
| `boolean` | casilla de verificación |

Un valor que no encaja con su tipo recibe en su lugar la entrada de texto simple, para que usted vea y corrija lo que figura en el archivo; una entrada numérica lo descartaría si no en silencio.

**«Guardar»** escribe el cambio y vuelve a la lectura, **«Descartar»** vuelve sin escribir nada al estado leído. Solo se escriben los campos que usted ha cambiado. Si no ha cambiado nada, no hay nada que guardar, y la barra de estado lo indica.

Si un registro no se puede editar según la condición de su tabla, faltan **«Editar»** y **«Eliminar»**, y una frase en el formulario indica el motivo, con el texto de aviso de la condición si lo tiene.

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

La próxima vez que se abre, el formulario muestra el texto del archivo. La cabecera indica entonces de qué archivo procede el formulario, y la acción deja de ofrecerse; el resumen de la base de datos nombra el archivo en la columna **«Formulario»**. Si se elimina el archivo, el formulario vuelve a mostrar la versión generada.

**Solo se lee el marcador de campo.** Un campo que el archivo no nombra no aparece en el formulario, y al guardar queda intacto; un registro nuevo solo rellena los campos nombrados. Cualquier otro marcador y un nombre de campo que la tabla no conoce se quedan como texto y se señalan, como describe la sección «Indicaciones defectuosas».

## Guardado por la aplicación

Los registros se crean, se modifican y se eliminan en el formulario que describe la sección anterior. Este guarda por un camino de la aplicación que es el mismo para cada cambio en los registros; lo que describe esta sección vale por tanto para cada uno de ellos.

Cada cambio pasa por un camino que lo comprueba antes de escribir. Un valor que no encaja con el tipo de su campo se rechaza, igual que un campo vacío que exige un valor. En ambos casos no se escribe nada.

A ello se suman las reglas de la definición de la tabla, descritas en las secciones anteriores. Un cambio también se rechaza si

- después una **clave funcional** quedaría asignada dos veces,
- un **enlace** no da con ningún registro o da con más de uno, o falta su tabla de destino,
- se quiere eliminar un registro al que todavía **se remite**,
- un valor o un registro incumple una **regla de comprobación**,
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

## Bloqueos

Cuando varias personas trabajan en la misma área de base de datos, por ejemplo en una unidad de red compartida, un bloqueo procura que dos de ellas no editen a la vez el mismo registro.

### Qué se bloquea y cuándo

Se bloquea el **registro** concreto, y justo en el momento en que comienza su edición. Se libera en cuanto la edición termina, tanto al guardar como al descartar. La mera consulta no bloquea nada: de lo contrario, una lista con cientos de registros los bloquearía todos de golpe con cada vistazo.

En el formulario, la edición comienza con **«Editar»** o con **«Eliminar»**, que toma el bloqueo ya antes de su pregunta de confirmación. Termina al guardar, con **«Descartar»**, con **«Volver a cargar»**, al cancelar la pregunta de eliminación, al cambiar a otro registro y al cerrar la pestaña del formulario. Si la aplicación rechaza un guardado, el bloqueo se mantiene, porque la edición continúa. Abrir el formulario y crear un registro nuevo no bloquean nada.

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

## Comprobación de coherencia

En el guardado por la aplicación se comprueba cada cambio. Lo que llega a los archivos por otro camino, por ejemplo a mano en un editor, nadie lo comprueba por el camino, y algunas reglas no actúan en absoluto al leer. La **comprobación de coherencia** recorre por eso todos los datos e indica dónde contradicen las reglas de la base de datos.

Está en el resumen de la base de datos: **«Comprobar coherencia»** en la cabecera comprueba todas las tablas, **«Comprobar»** en la fila de una tabla solo esa. El comando **«Comprobar la coherencia de la base de datos»** de la paleta de comandos también comprueba todas las tablas; para ello abre el resumen.

El resultado figura en la sección **«Comprobación de coherencia»** del resumen: la duración, por tabla el número de sus registros y hallazgos, y debajo los hallazgos con tabla, registro, campo y una frase en claro. Un clic en el registro abre su formulario. La lista muestra como mucho los primeros 500 hallazgos e indica entonces cuántos hay en total.

Se detectan:

- una clave funcional asignada más de una vez, con un hallazgo por cada registro implicado, y un identificador que figura más de una vez en la tabla;
- un enlace que no da con ningún registro, que da con varios o que apunta mediante un valor de clave a una tabla con clave de varios elementos, y una columna de enlace cuya tabla de destino falta o no está indicada;
- un valor que no encaja con su tipo, que incumple una regla de campo o que falta siendo obligatorio, y un registro que incumple una regla bajo `checks`;
- un registro con más o menos celdas que campos tiene la tabla;
- en un archivo de formulario, un campo desconocido, un marcador desconocido o una tabla desconocida;
- una tabla cuya definición no se puede leer; sus registros quedan entonces sin comprobar, y la comprobación continúa con las demás tablas.

**La comprobación no cambia nada.** Solo lee, y una función que limpie los hallazgos por sí misma no existe deliberadamente: cuál de dos registros con la misma clave es el correcto lo decide usted en el formulario. El resultado se mantiene mientras el resumen está abierto; tras una corrección, usted vuelve a comprobar.

La comprobación es rápida: con unos miles de registros dura unas decenas de milisegundos. Si el índice del área todavía se está construyendo, lo indica y le pide que vuelva a intentarlo en un momento.

## Uso de tablas y registros

El **uso** indica quién utiliza una tabla o un registro. Solo se lee cuando usted lo pide, y no se cambia nada.

**Para una tabla**, la acción **«Uso»** figura en su fila del resumen. Bajo «Usado por» nombra las tablas que apuntan a esta tabla con una columna de enlace, cada una con los nombres de esas columnas, y los archivos de formulario de la tabla. Si nadie la utiliza, indica «Sin uso».

**Para un registro**, la acción **«Usado por»** figura en la cabecera de su formulario mientras este está en modo de lectura. Enumera los registros que remiten a él, cada uno con tabla, campo, forma de visualización e identificador; un clic abre el formulario del registro que remite. En un registro nuevo falta la acción, porque nadie puede remitir a un registro que aún no está guardado.

**La lista del registro es la vista previa de la protección contra la eliminación.** Busca exactamente igual que la comprobación al eliminar, también mediante la forma corta del identificador, mediante el valor de una clave de un solo elemento y en los archivos siguientes de una tabla. Si un registro figura en ella, el mostrado no se puede eliminar. Un registro que remite a sí mismo no aparece, porque no impide su propia eliminación. Como en la protección contra la eliminación, solo cuenta la columna de enlace; un enlace en el texto corrido, por ejemplo `[[Clientes#^r-00001]]`, no es un uso.

## Localizabilidad: búsqueda y enlaces

La búsqueda sobre el **área** recoge un documento de tabla sin sus registros. El texto explicativo situado encima del bloque de datos sigue siendo consultable, una coincidencia posterior a él sigue llevando al lugar correcto, y los registros mismos no se encuentran por esta vía.

El motivo está en el área y no en la tabla: el espacio de búsqueda mantiene en memoria los textos de todos los archivos Markdown y lleva para ello un tope sobre el área **entera**. Unas pocas tablas de algunos megabytes bastan para romperlo, y a partir de ahí cada búsqueda vuelve a leer del disco, también la que recorre un documento corriente. Los registros en el espacio de búsqueda no costarían, pues, su velocidad a sí mismos, sino al área entera.

**Esto es un estado intermedio.** Mientras los registros no tengan un tipo de coincidencia propio, no son localizables mediante la búsqueda del área. Aun así, dos caminos llevan hasta ellos:

- **Buscar dentro del documento abierto.** Quien tiene delante el archivo de tabla y busca en él (predeterminado `Ctrl+F`) busca en el texto que tiene delante y encuentra sus registros sin cambio alguno. El límite anterior afecta únicamente a la búsqueda sobre el área.
- **Enlazar directamente a un registro**, como se describe en la sección siguiente.

### Enlace a un registro concreto

Un enlace nombra la tabla y el identificador interno, escrito como un ancla de bloque:

```markdown
[[Personen#^r-00042]]
```

El enlace **vale** si la tabla nombrada lleva ese registro, y está roto si no lo lleva. Se comporta así como cualquier otro enlace de la aplicación. Vale también cuando el registro no está en el primer archivo de la tabla sino en uno de sus archivos siguientes: para quien lo escribe la tabla es una sola, y su reparto entre archivos no le incumbe.

La comprobación se hace contra el estado **guardado** de la tabla, como con cualquier otra ancla. Un enlace a un registro recién creado y todavía sin guardar no vale todavía.

Si un enlace vale lo muestra el [linter de Markdown](tools.md): un destino roto recibe un subrayado ondulado en el editor, es decir en las vistas Código, Dividida y En vivo. La vista de lectura pura no representa la validez; allí los enlaces válidos y los rotos se ven igual.

Un clic abre el archivo de tabla. Todavía no lleva al registro concreto.

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

Cada una de estas indicaciones puede faltar por separado, y ninguna es requisito para las tablas: cada tabla lleva su definición ella misma y sigue siendo plenamente interpretable incluso sin ficha.

## El área como base de datos

En cuanto un documento del contenido de un área lleva la ficha, la aplicación trata esa área como **área de base de datos**. Usted no la declara aparte: la ficha es la declaración. Así la afirmación está en un solo lugar y no en dos que pudieran contradecirse.

Un área de base de datos recibe dos cosas que un área corriente no tiene.

**El resumen de los objetos de la base de datos** responde en un solo lugar a qué hay en esta área: la ficha con nombre y descripción, las tablas con el número de sus campos y las incidencias detectadas al leer las definiciones, en claro y no como un código. Se abre como pestaña propia, y en el propio resumen no se modifica nada; sus acciones llevan al formulario y a las comprobaciones. Tres caminos llevan hasta él:

- **Ver → Resumen de la base de datos**,
- el **menú contextual del panel del área**,
- la **paleta de comandos**.

En un área sin base de datos no se ofrece ninguno de estos caminos.

En la lista de tablas, la columna **«Formulario»** nombra el archivo de formulario de una tabla y queda vacía para el formulario generado. Además, el resumen lleva cuatro acciones: **«Comprobar coherencia»** en la cabecera para todas las tablas, y en la fila de cada tabla **«Nuevo registro»**, **«Comprobar»** y **«Uso»**. Lo que hacen lo describen las secciones «Editar registros en el formulario», «Comprobación de coherencia» y «Uso de tablas y registros». Entre las incidencias figuran también los avisos sobre archivos de formulario, nombrados según el archivo.

**La sección de ajustes «Base de datos»** está en el grupo de navegación «Área actual» (Archivo → Configuración… → Área actual → Base de datos). Muestra la misma información en forma breve, es decir, el nombre y la descripción de la base de datos, el número de sus tablas y el número de incidencias, y lleva una opción: **«Mostrar el resumen al abrir el área»**. Si está marcada, el resumen se abre por sí mismo en cuanto el área queda vinculada. La opción reside en el archivo del área y viaja con la carpeta del área. A ello se suma el campo **«Nombre de la carpeta de bloqueos»**; está descrito en la sección «Bloqueos».

Además, la aplicación mantiene en la raíz del área el pequeño archivo `Area_Database.mdda`. Guarda el estado del contador de los identificadores de operación, no aparece en ninguna lista de archivos y viaja con la carpeta del área; usted no tiene que hacer nada en él. Si falta, la aplicación recupera ese estado a partir de los justificantes de cambio.

## Indicaciones defectuosas

Para la definición entera rige la línea indulgente de la casa: una **indicación aislada** defectuosa se omite y se señala, la entrada sigue vigente; una **entrada** defectuosa se omite, las demás columnas permanecen. El aviso nombra el lugar, es decir, la columna afectada, la indicación errónea y lo que se esperaba en su lugar.

La única excepción es el **tipo**: un tipo fuera del conjunto de más arriba hace que se omita la entrada entera, porque una columna sin tipo interpretable no es una columna.

Una indicación que la aplicación no conoce se omite por separado con un aviso y no causa daño alguno.

Para la indicación `changeLog` de los justificantes de cambio rigen tres incidencias propias. Si `changeLog` no es un objeto, esta tabla no conserva límites propios, y se aplican los valores predeterminados de la aplicación. Si `maxBytes` o `maxPerRecord` no es un número entero mayor que cero ni la palabra `unlimited`, esa indicación se descarta, y rige su valor predeterminado. Cada una de estas situaciones se comunica; ninguna se pasa por alto en silencio.

La misma línea indulgente rige para las reglas de comprobación y para la condición de edición, regla por regla. Una regla inservible bajo `check` o `checks` se omite por separado, y las demás reglas, el campo y la tabla permanecen; se comunican una entrada que no es ni texto ni un objeto con `rule`, una expresión regular no válida, una expresión no válida, una regla de campo con una referencia distinta de `value`, un nombre de regla desconocido y una regla bajo `checks` que nombra un campo desconocido. Si `checks` no es una lista, se omiten todas las reglas bajo `checks`. Una indicación `editable` inservible se omite igualmente, y la tabla sigue siendo editable. Un aviso propio que no se puede interpretar se omite por sí solo; su regla o su condición sigue comprobando.

La misma línea flexible vale para los archivos de formulario. Si el contenedor `db-form` no nombra ninguna tabla, o una que no existe en la base de datos, el archivo sigue siendo un documento corriente. Si una tabla tiene varios archivos de formulario, se aplica el primero según la ruta, y los demás no se utilizan. Estos tres casos figuran entre las incidencias del resumen. Un marcador que no es un marcador de campo y un nombre de campo que la tabla no conoce se quedan como texto; el formulario los señala con su línea en su cabecera, y la comprobación de coherencia los enumera como hallazgos.

## Desactivar la base de datos

Toda la base de datos es una [extensión interna](extensions.md) llamada «Base de datos», de la categoría Herramientas, y se desactiva con un único interruptor. Requiere los [Perfiles de propiedades](property-profiles.md), porque la forma de una definición de tabla se describe y se comprueba mediante un perfil interno; si se desactiva ese requisito, la base de datos se desactiva con él.

Estando desactivada:

- El **bloque de registros queda como un bloque de código corriente**, en la vista de lectura, en el modo de edición y en la exportación portátil. Su contenido sigue siendo legible; lo que se desactiva es la representación como tabla, no el dato.
- **El resumen y la sección de ajustes desaparecen**, junto con los accesos del menú Ver, del menú contextual del panel del área y de la paleta de comandos. Un resumen ya abierto permanece hasta que usted lo cierre, como cualquier otra página del sistema.
- Con el bloque de registros desaparecen sus botones **«Abrir registro»** y **«Nuevo registro»**, con el resumen sus acciones **«Comprobar coherencia»**, **«Comprobar»** y **«Uso»**, y los comandos **«Nuevo registro en la tabla activa»** y **«Comprobar la coherencia de la base de datos»** desaparecen de la paleta de comandos. Así tampoco se puede llegar ya al **formulario**, y la aplicación deja de suministrar datos a él, a la comprobación de coherencia y al uso.
- Un **enlace a un registro concreto** ya no se marca como roto. Sin definiciones no hay nada con lo que contrastarlo, y un aviso sin comprobación sería solo una afirmación.
- La **búsqueda sobre el área permanece sin cambios**. Los registros siguen excluidos del texto completo, porque ese límite pertenece al archivo de tabla y no al interruptor; la sección «Localizabilidad» de más arriba sigue siendo válida.
- **No se escribe nada.** La aplicación no crea, modifica ni elimina registros, no toma ningún bloqueo y no genera ningún justificante de cambio; tampoco termina un guardado que quedó a medias mientras esté desactivada.

**Los archivos quedan intactos.** Desactivar retira la interpretación, no los datos: no se cambia ni un carácter, y al volver a activarla todo regresa. El índice del área se reconstruye una vez en ese momento; en fondos grandes eso tarda un instante.
