# Propiedades de bloque

Lo que el frontmatter aporta al documento completo, las propiedades de bloque lo aportan a bloques individuales: datos clave-valor estructurados y tipados, por ejemplo un estado de reunión por párrafo o una fecha límite por punto de acción. El soporte es el **ancla de bloque**; los datos se guardan en el **archivo complementario** del documento (Markdown Data, `.mdd`), el mismo archivo que lleva el [historial del documento](history.md) y las [notas del documento](notes.md). El texto del documento permanece intacto.

## El ancla de bloque como soporte

Un ancla de bloque es un identificador de libre elección al final de un bloque:

```markdown
Este párrafo lleva un ancla. ^reunion-1
```

En la vista renderizada el ancla es invisible; hace que el bloque sea direccionable. Se permiten letras (también acentuadas), dígitos, guion y guion bajo. Las propiedades se asocian a este identificador: mientras el ancla figure en el texto, los datos pertenecen a este bloque, sin importar adónde se mueva el bloque dentro del documento.

## El panel Propiedades de bloque

El panel «Propiedades de bloque» se conmuta como cualquier panel lateral: mediante el menú Ver → Barra lateral → Paneles → Propiedades de bloque, el icono de llaves de la barra de estado o un atajo de teclado personalizado (de fábrica no hay ninguno asignado). Lado, orden y grupos de pestañas siguen las reglas de la [barra lateral](sidebar.md).

El panel **sigue al cursor**: muestra las propiedades del bloque en el que está el cursor. La cabecera nombra el ancla activa y ofrece un selector de todas las anclas del archivo para saltar; las anclas con propiedades están marcadas. Si el cursor está en un bloque **sin** ancla, el panel ofrece «Crear ancla» y escribe al final del bloque un identificador aleatorio corto, único dentro del archivo.

Las filas de propiedades funcionan como en el panel de propiedades del documento: cada fila tiene una clave de libre elección, un tipo (texto, lista, número, verdadero/falso, fecha, multilínea, enlace, hora) y un campo de valor adecuado. Para la clave, el panel sugiere las claves de bloque ya usadas en el documento. El guardado es **automático** poco después de la entrada; la pestaña del documento no se marca como modificada, porque los datos residen en el archivo complementario, no en el texto. En las vistas de solo lectura el panel solo muestra los datos.

Si al documento le aplican **perfiles de propiedades**, sus bloques heredan sus definiciones: un campo definido lleva aquí el mismo tipo, los mismos valores propuestos y la misma marca que en el panel del documento. Los campos estructurados (objeto y lista de objetos) también se pueden editar en un párrafo; se guardan en el archivo acompañante. **Sin embargo, un valor anidado así no aparece en el índice del área** y por eso no puede servir de condición en una consulta de bloque, a diferencia de los valores simples. Los campos derivados también aparecen aquí, con su valor calculado y no editables; nunca se guardan en el archivo acompañante.

## Renombrar un ancla

El icono de lápiz junto al selector de anclas renombra el ancla activa. El ancla en el texto, la entrada de datos en el archivo complementario y las referencias entrantes **dentro del mismo documento** se actualizan a la vez:

```markdown
Véase el primer punto: [[#^reunion-1]]
```

Las referencias desde otros archivos no se ajustan; quien referencia entre archivos renombra con cuidado.

## Datos huérfanos

Si un ancla desaparece del texto, sus propiedades **no se pierden**: permanecen en el archivo complementario y aparecen en la sección «Datos huérfanos» del panel. Desde allí pueden asignarse a un ancla existente sin datos o eliminarse definitivamente. Si un archivo lleva la misma ancla más de una vez, cuenta la primera aparición; el panel señala el duplicado.

## Visibilidad en el bloque

Los bloques con propiedades llevan un indicador discreto al final del bloque en la vista renderizada y en el modo en vivo. Al pasar el ratón se ve la lista clave-valor; un clic abre el panel con esa ancla. El indicador no aparece en la exportación a PDF.

## Referirse a bloques

Un bloque con ancla puede referenciarse desde el mismo documento o desde otros; el clic salta al bloque:

```markdown
[[Acta#^reunion-1]]
```

La página [Enlaces](linking.md) describe la sintaxis de referencias en detalle. Mediante la [Consulta Perspective](frontmatter-query.md), los bloques también pueden consultarse por sus propiedades (añadido de ámbito `BLOCKS`).

## Ubicación y límites

Las propiedades residen en una sección propia del archivo complementario `.mdd` y viajan con él cuando documento y archivo complementario se copian o mueven juntos; el **renombrado dentro de la aplicación** lleva consigo el archivo complementario automáticamente. El ancla es la única identidad: si el contenido del bloque cambia, los datos siguen asociados al ancla.

Conviene conocer dos límites. Otros programas de Markdown no conocen el acoplamiento al archivo complementario: si el texto se reestructura fuera de la aplicación y desaparecen anclas, los datos afectados pasan a la sección de datos huérfanos (nada se pierde en silencio). Y si un bloque se mueve a **otro archivo**, sus propiedades no lo acompañan automáticamente, porque el archivo complementario está ligado al documento; se recrean en el archivo de destino, mientras quedan como datos huérfanos por limpiar en el archivo de origen.
