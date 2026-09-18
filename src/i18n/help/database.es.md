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

## Visualización de los registros

En la vista de lectura y en el modo de edición el bloque aparece como una tabla con las columnas de la definición. Cada valor se representa según el tipo de su columna: números alineados a la derecha y con los decimales declarados, valores de verdad como marca de verificación, valores de varias líneas con sus saltos. Si un valor no encaja con su tipo, la celda muestra su texto original y se señala con color en lugar de sustituirse.

A partir de **2000 registros** la vista muestra un extracto e indica debajo de qué lo es. Es una ventana y no un recorte silencioso: usted ve que hay más. El límite se ha medido, no decretado — hasta ahí la tabla aparece sin espera perceptible.

En la **exportación portátil**, en cambio, la tabla está completa, sin ventana. Un archivo que usted entrega no debe ocultar nada: el destinatario no tiene la aplicación y no vería que falta algo.

Los registros no se editan en esta vista. El archivo de tabla es almacenamiento técnico — sigue siendo legible a mano y, en caso de emergencia, corregible a mano, pero en el funcionamiento normal usted no trabaja dentro de él.

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

**El resumen de los objetos de la base de datos** responde en un solo lugar a qué hay en esta área: la ficha con nombre y descripción, las tablas con el número de sus campos y las incidencias detectadas al leer las definiciones, en claro y no como un código. Se abre como pestaña propia y es una vista de solo lectura; en ella no se modifica nada. Tres caminos llevan hasta él:

- **Ver → Resumen de la base de datos**,
- el **menú contextual del panel del área**,
- la **paleta de comandos**.

En un área sin base de datos no se ofrece ninguno de estos caminos.

**La sección de ajustes «Base de datos»** está en el grupo de navegación «Área actual» (Archivo → Configuración… → Área actual → Base de datos). Muestra la misma información en forma breve, es decir, el nombre y la descripción de la base de datos, el número de sus tablas y el número de incidencias, y lleva una opción: **«Mostrar el resumen al abrir el área»**. Si está marcada, el resumen se abre por sí mismo en cuanto el área queda vinculada. La opción reside en el archivo del área y viaja con la carpeta del área.

## Indicaciones defectuosas

Para la definición entera rige la línea indulgente de la casa: una **indicación aislada** defectuosa se omite y se señala, la entrada sigue vigente; una **entrada** defectuosa se omite, las demás columnas permanecen. El aviso nombra el lugar, es decir, la columna afectada, la indicación errónea y lo que se esperaba en su lugar.

La única excepción es el **tipo**: un tipo fuera del conjunto de más arriba hace que se omita la entrada entera, porque una columna sin tipo interpretable no es una columna.

Una indicación que la aplicación no conoce se omite por separado con un aviso y no causa daño alguno.

## Desactivar la base de datos

Toda la base de datos es una [extensión interna](extensions.md) llamada «Base de datos», de la categoría Herramientas, y se desactiva con un único interruptor. Requiere los [Perfiles de propiedades](property-profiles.md), porque la forma de una definición de tabla se describe y se comprueba mediante un perfil interno; si se desactiva ese requisito, la base de datos se desactiva con él.

Estando desactivada:

- El **bloque de registros queda como un bloque de código corriente**, en la vista de lectura, en el modo de edición y en la exportación portátil. Su contenido sigue siendo legible; lo que se desactiva es la representación como tabla, no el dato.
- **El resumen y la sección de ajustes desaparecen**, junto con los accesos del menú Ver, del menú contextual del panel del área y de la paleta de comandos. Un resumen ya abierto permanece hasta que usted lo cierre, como cualquier otra página del sistema.
- Un **enlace a un registro concreto** ya no se marca como roto. Sin definiciones no hay nada con lo que contrastarlo, y un aviso sin comprobación sería solo una afirmación.
- La **búsqueda sobre el área permanece sin cambios**. Los registros siguen excluidos del texto completo, porque ese límite pertenece al archivo de tabla y no al interruptor; la sección «Localizabilidad» de más arriba sigue siendo válida.

**Los archivos quedan intactos.** Desactivar retira la interpretación, no los datos: no se cambia ni un carácter, y al volver a activarla todo regresa. El índice del área se reconstruye una vez en ese momento; en fondos grandes eso tarda un instante.
