# Perfiles de propiedades

Los perfiles de propiedades definen los campos de propiedades de forma centralizada para un área: por campo un nombre, un tipo, opcionalmente un rango de valores fijo (selección simple o múltiple) y un valor predeterminado. Los perfiles pueden heredar unos de otros (sección «Herencia»). El editor de propiedades y el panel de propiedades de bloque sugieren los campos definidos, ofrecen los rangos de valores como listas de selección y toman el tipo de la definición. Los perfiles solo existen en el contexto de un área: la configuración vive en el archivo del área (Ajustes → Perfiles de propiedades), los perfiles en sí son archivos Markdown normales. La funcionalidad puede activarse o desactivarse como extensión «Perfiles de propiedades» (Ajustes → Extensiones); sin configuración o con la extensión desactivada, ambos editores se comportan como de costumbre (inferencia de tipos y sugerencias estándar).

## Archivos de perfil y formato de las definiciones

Un perfil es un archivo Markdown en la carpeta de perfiles configurada; el nombre del perfil es el nombre del archivo sin la extensión. Las definiciones de campos están en el frontmatter bajo la clave `fields`; el contenido del archivo debajo es una descripción libre:

```yaml
---
fields:
  - name: estado
    values: [abierto, en curso, terminado]
    default: abierto
  - name: presupuesto
    type: number
  - name: temas
    type: multistring
    values: [proyecto, persona, lugar]
  - name: vencimiento
    type: date
---
```

Atributos por definición:

| Atributo | Significado |
| --- | --- |
| `name` | nombre del campo (obligatorio, único por perfil) |
| `type` | `string`, `multistring`, `number`, `boolean`, `date` o `multiline`; sin indicación, `string` |
| `values` | opcional: rango de valores fijo como lista de valores (para `string`, `multistring`, `number` y `date`) |
| `multiple` | opcional: selección múltiple — el valor es una lista, el tipo `multistring`; ya no se requiere un rango de valores fijo |
| `default` | opcional: valor inicial al crear el campo mediante el editor |
| `valuesFrom` | opcional: fuente del repertorio de valores con `note` (ruta de una nota de valores) y/o `query` (consulta); junto con `values` se aplica `values` |
| `options` | opcional: indicaciones propias del tipo en un subobjeto, previsto para tipos futuros |
| `fields` | opcional: definiciones hijas anidadas según el mismo esquema, previsto para tipos estructurados |

Un campo `multistring` con `values` es automáticamente una selección múltiple. **El nombre del campo es la única indicación obligatoria**: cualquier otra indicación es opcional, y los archivos de perfil existentes siguen siendo válidos sin cambios. `valuesFrom`, `options` y los `fields` anidados ya forman parte del formato, pero en esta versión aún no se evalúan (sección «Límites»). Las definiciones individuales defectuosas (por ejemplo un tipo desconocido o un nombre de campo duplicado) solo se suspenden a sí mismas; las demás definiciones del perfil siguen vigentes. La lista de perfiles de los ajustes muestra los avisos escritos bajo el perfil correspondiente — con la definición afectada, la indicación errónea y lo que se esperaba en su lugar, en las definiciones hijas con la ruta hacia el campo padre — y abre el archivo del perfil con un clic.

## Asignación y perfil estándar

Los documentos se asignan mediante un campo del frontmatter; el nombre del campo es configurable por área (por defecto `class`). El valor es un nombre de perfil o una lista de varios nombres de perfiles:

```yaml
---
class:
  - proyecto
  - persona
---
```

Además se puede elegir un **perfil estándar**: sus definiciones se aplican a todos los archivos del área, incluso sin campo de asignación. Los nombres de perfiles coinciden sin distinguir mayúsculas y minúsculas.

## Herencia

Un perfil puede heredar las definiciones de otro. Para ello, el frontmatter del archivo de perfil nombra, junto a `fields`, como máximo un perfil padre y, opcionalmente, nombres de campos a excluir:

```yaml
---
extends: proyecto
exclude: [estado]
fields:
  - name: fase
  - name: autor
---
```

- `extends` nombra el perfil padre; son posibles cadenas de varios niveles, no existe más de un perfil padre.
- `exclude` excluye campos heredados. La exclusión actúa en la cadena de herencia en la que está, no para todo el documento.
- Un campo propio con el mismo nombre reemplaza por completo al heredado.

Un ciclo en la relación de padres o un perfil padre inexistente solo termina la cadena afectada y produce un aviso en la lista de perfiles de los ajustes; la resolución continúa.

## Perfil interno

Junto a los archivos de perfil de la carpeta existe el **perfil interno `Ereignis`** de la extensión [Eventos](events.md). Forma parte automáticamente de la resolución de perfiles y de la lista de perfiles en los ajustes (allí marcado como perfil interno), define los ocho campos `event-*` y no se puede editar ni eliminar; tampoco se ofrece como perfil estándar. Actúa también sin carpeta de perfiles configurada, con el campo de asignación estándar `class`; si un archivo de perfil lleva el mismo nombre, el perfil interno tiene prioridad. Con la extensión Eventos desactivada desaparece de la resolución y de la lista.

## Reglas de conflicto

Para un archivo se aplica la unión de todas las definiciones de los perfiles asignados con sus cadenas de padres más el perfil estándar con su cadena. La resolución es **una** secuencia ordenada: por perfil asignado, en el orden de mención, primero sus propios campos, después los de su cadena de padres de abajo hacia arriba, y luego lo mismo para el perfil estándar; cada perfil se procesa exactamente una vez. Si más de un perfil define el mismo nombre de campo, las reglas son deterministas:

1. Un **perfil asignado** gana frente al **perfil estándar**.
2. Entre varios perfiles asignados gana el **primero** nombrado en la lista de asignación.
3. Dentro de una cadena gana el **perfil heredero** frente a sus padres; un campo propio reemplaza así al heredado del mismo nombre.

Un ejemplo con cuatro perfiles: `todos` (campo `tags`), `proyecto` (hereda de `todos`; campos `fase`, `estado`), `artículo` (hereda de `proyecto`, excluye `estado`; campos propios `fase`, `autor`) y `reunión` (campos `estado`, `lugar`). Un documento con `class: [artículo, reunión]` y el perfil estándar `todos` recibe `fase` y `autor` de `artículo`, `tags` a través de la cadena desde `todos`, `estado` y `lugar` de `reunión` — la exclusión en `artículo` solo actúa en su cadena; a través de `reunión`, `estado` llega de todos modos.

## Efecto en los editores

Las definiciones actúan en el editor de propiedades y de forma idéntica en el panel de propiedades de bloque; los bloques de un archivo heredan la resolución de su archivo.

- **Sugerencias de campos**: «Añadir propiedad» muestra primero los campos definidos aún no presentes (con el nombre del perfil como distintivo), después las sugerencias habituales; «Campo propio» al final sigue siendo la vía libre. La selección crea el campo con el tipo definido y el valor predeterminado.
- **Listas de selección**: los campos con rango de valores ofrecen los valores definidos como lista de selección (selección simple) o como sugerencias de entrada de la barra de fichas (selección múltiple); «Valor propio…» sigue permitiendo entradas libres.
- **Tipo establecido**: los campos definidos muestran el tipo definido, el selector de tipo está bloqueado y nombra el perfil. Si el valor existente se desvía del tipo, el selector permanece libre para poder convertir el valor al tipo definido.
- Los campos definidos llevan una marca discreta en el nombre del campo; la información sobre herramientas nombra el perfil.

## Incorporación de todos los campos a la vez

El menú de sugerencias «Añadir propiedad» está agrupado por perfil: bajo cada **nombre de perfil** aparecen, con sangría, sus campos aún no presentes, y debajo las sugerencias estándar sin perfil bajo «Otros campos». Un clic en el **nombre del perfil** añade en un solo paso todos los campos que aún faltan de ese perfil; un clic en un campo individual sigue añadiendo solo ese.

La incorporación es deliberadamente aditiva:

- Solo se crean los campos **que faltan**; los valores existentes y el orden de los campos permanecen intactos, y no surgen duplicados.
- Un campo con valor predeterminado recibe ese valor; un campo sin valor predeterminado se crea vacío según el tipo: texto, fecha y lista quedan vacíos, un número empieza en `0`, un booleano en «falso». El contenido se edita después como de costumbre.
- En el frontmatter del documento, los campos vacíos aparecen como una simple clave sin valor (`campo:`).

Toda la incorporación es un único paso y puede deshacerse por completo con una sola acción de deshacer. Se aplica en el editor de propiedades y en el panel de propiedades de bloque, y desaparece cuando la extensión «Perfiles de propiedades» está desactivada.

## Validación suave

Las desviaciones nunca bloquean ni cambian el valor: un valor fuera del rango de valores o un valor que no corresponde al tipo definido solo produce un icono de aviso en el campo; la información sobre herramientas nombra el motivo. El Markdown y el frontmatter siguen siendo libremente editables, también directamente en el código fuente.

## Límites

- El formato ya prevé opciones propias del tipo (`options`), fuentes del repertorio de valores (`valuesFrom`) y definiciones hijas anidadas; en esta versión aún no se evalúan. Una indicación así no es un error, simplemente queda sin efecto hasta la ampliación.
- Renombrar un archivo de perfil no cambia los valores de asignación en los documentos; entonces apuntan a un perfil inexistente (los ajustes marcan un perfil estándar que falta).
- Los perfiles están directamente en la carpeta de perfiles; las subcarpetas no se incluyen.
- Las definiciones actúan en los dos editores de propiedades; los tipos de campos calculados o derivados de otros archivos no forman parte de los perfiles.
