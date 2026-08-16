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

Al escribir, el bloque se conserva en el viaje de ida y vuelta: comentarios, orden de campos y estilo de los campos no modificados no se reformatean, y los finales de línea CRLF permanecen estables.

Con un error de sintaxis YAML, la barra muestra el mensaje de error y bloquea el añadir hasta reparar el bloque en el editor.

## Fecha de creación y modificación

Dos campos pueden mantenerse automáticamente al guardar: la fecha de creación a partir de la fecha de creación del archivo y la fecha de modificación a partir del momento de guardado.

```yaml
created: 2025-06-23 15:43
updated: 2026-07-18 12:04
```

Ambos campos se activan de forma independiente y sus nombres son libremente seleccionables. El formato es a elección solo fecha o fecha y hora, siempre en hora local. Una fecha de creación existente nunca se sobrescribe; la fecha de modificación acompaña cada guardado.

Los campos que faltan solo se crean si la opción correspondiente está activa. De lo contrario solo se mantienen los campos que ya están en el bloque y el documento permanece por lo demás sin cambios. El acceso y el interruptor figuran en la [tabla de funciones](functions.md).
