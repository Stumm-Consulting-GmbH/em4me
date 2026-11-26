# Frontmatter y propiedades

Un bloque YAML al inicio del archivo lleva los metadatos. Aparece en la vista Lectura como una línea de frontmatter plegada, se muestra discretamente diferenciado en el editor de código y se mantiene como formulario mediante la barra Propiedades.

## Bloque YAML

El bloque va entre dos líneas `---` y debe ser la primerísima línea del archivo — por eso esta página del manual lo muestra como bloque de código en lugar de en vivo:

```markdown
---
title: Plan de proyecto
aliases: [Plan, Roadmap]
tags: [proyecto/markdown, planificación]
review: 2026-07-01
final: false
---
```

## Visualización en la vista renderizada

Al inicio de la vista renderizada el frontmatter aparece como una línea plegada discreta con el número de campos. Al pasar el ratón se despliega el YAML en texto plano (incluidos los comentarios), al alejarlo se vuelve a plegar; un clic en la línea la fija, otro clic la suelta. La línea se maneja con el teclado (foco y luego Enter o Espacio) y es solo de lectura — la edición se hace mediante la barra Propiedades o el texto fuente. Con un error de sintaxis YAML la línea muestra el texto en bruto sin número de campos.

En el modo Live la misma línea sustituye a las líneas YAML mientras el cursor esté fuera; la entrada del cursor o un clic en el YAML desplegado cambia al texto fuente editable, al salir se vuelve a plegar.

La visualización puede desactivarse en Archivo → Configuración… → Apariencia (por defecto: activada). El ajuste adicional «Mostrar el frontmatter desplegado» (por defecto: desactivado) mantiene allí el bloque permanentemente abierto: en la vista renderizada, en el modo en vivo y, por tanto, también en la exportación a PDF.

## Campos especiales

- `aliases:` hace el archivo enlazable bajo nombres adicionales mediante `[[Alias]]`; los retroenlaces lo encuentran a través de cualquier alias y marcan los aciertos con «vía alias» (ver [Enlaces](linking.md)).
- `tags:` añade etiquetas además de las `#etiquetas` del texto; ambas fuentes alimentan la barra lateral de etiquetas.

## Vista del editor por documento

Los tres conmutadores de vista del editor — margen de plegado, números de línea y ajuste de línea — se guardan por documento en el frontmatter y viajan con el archivo, también al copiarlo o abrirlo en otro equipo:

```markdown
---
fold-gutter: false
line-numbers: true
word-wrap: true
---
```

Solo surten efecto los valores reales `true`/`false`; los demás valores se ignoran. La resolución sigue este orden: la clave del frontmatter antes del ajuste global por defecto (Archivo → Configuración… → Apariencia) antes del valor por defecto integrado (plegado activado, números de línea activados, ajuste de línea desactivado).

Conmutar mediante la barra de estado o el menú Ver escribe el nuevo valor directamente en el frontmatter del documento activo: el archivo queda así modificado y se guarda por la vía de guardado normal. Si un documento aún no tiene frontmatter, la conmutación crea el bloque.

Casos especiales: en destinos de solo lectura (como las páginas del manual) y con YAML defectuoso, el conmutador solo actúa de forma efímera durante la sesión en curso. En las pestañas Sin título también es efímero; al primer guardado la aplicación traslada al frontmatter del nuevo archivo los valores que difieren del valor por defecto.

## Imagen de portada

La propiedad `cover` coloca una imagen al principio del documento: a todo el ancho del contenido, recortada a una altura ajustable y nunca deformada. Otras dos propiedades fijan la altura y el encuadre:

```markdown
---
cover: imagenes/playa.jpg
cover-height: 240
cover-position: top
---
```

La imagen se indica de dos maneras:

- **como ruta relativa al documento**, igual que una imagen corriente: `cover: imagenes/playa.jpg`. Rigen el mismo límite, los mismos formatos y el mismo tope de 20 MB que en la página [Imágenes](images.md).
- **como nombre entre dobles corchetes, entre comillas**: `cover: "[[playa.jpg]]"`. Así la aplicación encuentra la imagen por su nombre, esté en la carpeta del área que esté.

Si se cambia el nombre de la imagen, la aplicación no ajusta el valor de `cover`; el nuevo nombre se introduce a mano.

`cover-height` es la altura en píxeles, 200 por defecto; los valores por debajo de 80 o por encima de 600 se ajustan al límite más cercano. `cover-position` elige la parte visible de la imagen: un número de 0 a 100, medido desde arriba (0 muestra el borde superior, 100 el inferior), o una de las palabras `top`, `center` y `bottom`; por defecto, el centro. Lo que no se entiende vuelve en silencio al valor por defecto.

La imagen de portada aparece en la vista renderizada, en su mitad de la vista dividida y en el modo Live, debajo de la [línea de título](tools.md) con el nombre de archivo y encima de la línea del frontmatter. En el modo Live permanece en su sitio aunque el cursor esté en las líneas YAML, y un cambio en `cover` muestra al instante la nueva imagen. La imagen de portada no depende de la visualización del frontmatter y aparece aunque esta esté desactivada; un bloque con un error de sintaxis YAML no produce imagen de portada.

La impresión, la exportación a PDF y la exportación a HTML contienen la imagen de portada tal como la muestra la vista renderizada. La [presentación](presentation.md), los documentos incrustados, las tarjetas y las vistas previas no muestran imagen de portada.

Si la aplicación no encuentra la imagen — el archivo falta, está fuera del límite, no es un archivo de imagen o supera los 20 MB —, aparece en su lugar el aviso discreto «Imagen de portada no encontrada», sin mensaje de error. Lo mismo ocurre en un documento que nunca se ha guardado, hasta que se guarda. Una dirección de Internet (`http:` o `https:`) no se carga; en su lugar un aviso pide guardar la imagen como archivo en el área. La impresión y la exportación omiten los avisos; una imagen de portada sin imagen desaparece allí por completo.

Los archivos de libro y de estantería llevan su imagen de portada en la misma propiedad `cover` (véase [Libros](books.md)); al abrir uno de estos archivos como documento, la imagen aparece también arriba, encima de su contenido.

La imagen de portada pertenece a la [extensión interna](extensions.md) «Imagen de portada», que está activada a partir del modo de trabajo **Avanzado**. Si está desactivada, no aparecen ni imagen ni aviso; las propiedades permanecen sin cambios en el documento y en la barra Propiedades, y al volver a activarla la imagen de portada reaparece.

## Mapa mental por documento

La clave `mindmap` determina cómo dibuja la [vista de mapa mental](mindmap.md) este documento concreto y sustituye así el valor por defecto en Archivo → Configuración… → Mapa mental:

```markdown
---
mindmap:
  layout: mitte
  linienfuehrung: gerade
  anfangsTiefe: 2
---
```

`layout` admite la posición de la raíz (`links`, `mitte`, `rechts`, `oben`, `unten`) y `linienfuehrung` los valores `geschwungen` y `gerade`; se añaden los números `farbEinfrierEbene`, `anfangsTiefe` y `hoechstBreite`. Lo que no se entiende vuelve en silencio al valor por defecto.

## Barra Propiedades

La barra Propiedades muestra los campos del frontmatter editables en vivo. El tipo de campo se infiere del valor: texto, lista, fecha, número, booleano o multilínea. Los campos nuevos se crean con «+ Añadir propiedad»; los cambios siguen la configuración de autoguardado.

Un clic en un campo de valor ofrece los valores ya asignados a esa propiedad en el área, en orden alfabético; cada carácter escrito reduce la lista y un valor propio sigue siendo libremente escribible. Si un perfil de propiedades define un conjunto de valores, ambos orígenes aparecen juntos y siguen siendo distinguibles: los valores procedentes de lo existente están marcados como tales. Si la propiedad no aparece en ninguna parte del área, no se muestra ninguna lista. Se puede desactivar en Archivo → Ajustes… → Extensiones.

Al escribir, el bloque se conserva en el viaje de ida y vuelta: comentarios, orden de campos y estilo de los campos no modificados no se reformatean, y los finales de línea CRLF permanecen estables. Las listas de una sola línea entre corchetes se escriben sin espacios interiores (`[a, b]`); una lista escrita como `[ a, b ]` cambia una sola vez a esta forma al guardar por primera vez y después permanece sin cambios.

Con un error de sintaxis YAML, la barra muestra el mensaje de error y bloquea el añadir hasta reparar el bloque en el editor.

## Fecha de creación y modificación

Dos campos pueden mantenerse automáticamente al guardar: la fecha de creación a partir de la fecha de creación del archivo y la fecha de modificación a partir del momento de guardado.

```yaml
created: 2025-06-23 15:43
updated: 2026-07-18 12:04
```

Ambos campos se activan de forma independiente y sus nombres son libremente seleccionables. El formato es a elección solo fecha o fecha y hora, siempre en hora local. Una fecha de creación existente nunca se sobrescribe; la fecha de modificación acompaña cada guardado. Si un guardado escribe una nueva fecha de modificación, un `Ctrl+Z` justo después deshace esa fecha junto con el último cambio anterior, también tras el guardado automático.

Los campos que faltan solo se crean si la opción correspondiente está activa. De lo contrario solo se mantienen los campos que ya están en el bloque y el documento permanece por lo demás sin cambios. El acceso y el interruptor figuran en la [tabla de funciones](functions.md).
