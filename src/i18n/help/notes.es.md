# Notas del documento

Cada documento puede llevar **una** nota, separada del contenido del documento. Reúne el conocimiento de trabajo y los metadatos sobre el documento (puntos abiertos, contexto, recordatorios) que no corresponden al texto en sí. La nota se escribe en un panel de barra lateral propio y se guarda en el **archivo acompañante** del documento, el mismo archivo `.mdd` junto al documento que también contiene el historial.

## El panel Notas

El panel «Notas» se conmuta como cualquier panel de la barra lateral: mediante el menú Ver → Paneles → Notas, el icono de bloc de notas en la barra de estado, o un atajo que asignes tú mismo (de fábrica no hay ninguno; la asignación se hace en los ajustes). El conmutador actúa sobre la columna activa; lado, orden y grupos de pestañas siguen las reglas de la [Barra lateral](sidebar.md).

Una nota pertenece siempre al documento activo. Un documento aún **sin nombre** (nunca guardado) no tiene lugar para el archivo acompañante; por eso el panel muestra entonces un aviso en lugar de un campo de entrada; tras el primer guardado, la nota queda disponible.

## Escribir y vista previa

El campo de entrada acepta Markdown. Un conmutador en la cabecera del panel alterna entre **edición** y una **vista previa renderizada** del texto de la nota. La vista previa está activa al principio; que un panel se abra en edición o en vista previa lo determina «Mostrar la vista previa de notas por defecto» (Ajustes → Apariencia). El conmutador vale por columna y para la sesión en curso.

Así puede verse una nota:

```markdown
- [ ] Consultar sobre el capítulo tres
- [x] Fuentes revisadas

Contexto: **borrador**, aún no aprobado.
```

- [ ] Consultar sobre el capítulo tres
- [x] Fuentes revisadas

Contexto: **borrador**, aún no aprobado.

## Dar formato como en el editor

El campo de edición ofrece las mismas ayudas de formato que el editor principal: el **menú contextual del clic derecho** con las secciones Formato, Párrafo, Insertar y Portapapeles, además de los atajos correspondientes (por ejemplo `Ctrl+B` para negrita, `Ctrl+I` para cursiva, o la inserción de una marca de tiempo). El [Menú contextual del editor](context-menu.md) describe estas funciones en detalle; actúan en el campo de nota igual que en el documento.

## Guardado automático

La nota se guarda **automáticamente**, sin botón de guardar: poco después de escribir, así como al salir del campo, al cambiar de documento y al cerrar la ventana. La nota no forma parte del contenido del documento; por eso **no** marca la pestaña del documento como modificada, y el guardado del documento es independiente de ella.

## Ubicación y distinción del historial

La nota reside en el archivo acompañante `.mdd`, en una sección propia junto al [Historial del documento](history.md). Ambos viajan con el archivo acompañante cuando el documento y el `.mdd` se copian o mueven juntos; el **renombrado dentro de la aplicación** lleva consigo el archivo acompañante, y con él la nota, automáticamente.

A diferencia del historial, la nota no tiene **ni revisiones ni restauración**: solo cuenta el estado actual, un texto anterior no se conserva. Si el archivo acompañante está dañado, la nota se suspende y el panel lo indica en lugar de sobrescribir un estado incierto.

## Varias ventanas

Si el mismo documento está abierto en varias ventanas, una nota guardada en otro lugar se adopta aquí mientras el campo esté sin cambios. Si un cambio ajeno se encuentra con tu **propio estado aún no guardado**, el panel indica que la nota se cambió en otra ventana, y tu texto se conserva para que nada se sobrescriba sin darte cuenta.
