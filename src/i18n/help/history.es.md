# Historial del documento

El historial del documento registra los cambios de un documento Markdown como **historial de revisiones**: quien mantiene un documento durante mucho tiempo ve qué cambios se hicieron y cuándo, puede comparar dos estados línea a línea y recuperar un estado anterior. El historial vive en un **archivo acompañante** junto al documento y viaja con él cuando ambos archivos se copian o mueven juntos.

## Archivos Markdown-Data (.mdd)

Al documento `Notas.md` le corresponde el archivo acompañante `Notas.mdd` («Markdown-Data») en la misma carpeta. Se crea con el primer guardado con el historial activo y contiene el historial completo: el estado inicial, todos los paquetes de cambios y, a intervalos, estados intermedios completos como puntos de anclaje. El formato es texto legible (JSON), deliberadamente transparente; un `.mdd` no puede abrirse como documento.

El mismo archivo acompañante aloja también, junto al historial, la [nota del documento](notes.md), en una sección propia. A diferencia del historial, la nota no tiene revisiones ni restauración.

Dos cosas conviene saber:

- Si el documento se **renombra o mueve** fuera de la aplicación, el archivo acompañante debe llevarse a mano; de lo contrario el historial pierde la conexión y empieza de nuevo.
- En carpetas que otros programas **sincronizan, respaldan o versionan**, los archivos `.mdd` viajan también. Es intencionado (el historial pertenece al documento), pero hay que saberlo: el historial completo de cambios de un documento viaja con el archivo acompañante.

## Activar: tres niveles

De fábrica el historial está **desactivado**. Se activa en tres niveles; gana el nivel más específico y los niveles no definidos heredan del siguiente más general:

| Nivel | Lugar | Efecto |
|---|---|---|
| Documento | propiedad YAML `history` en el frontmatter | prevalece sobre área y aplicación |
| Área | archivo de área `Area_Settings.mdda` en la carpeta raíz del área | prevalece sobre el ajuste de la aplicación, vale para todos los documentos del área |
| Aplicación | Ajustes → Comportamiento → Historial del documento | ajuste base para todo lo demás |

El nivel de documento está en el frontmatter:

```yaml
---
history: true
---
```

`history: false` desactiva; una propiedad ausente hereda. Lo más sencillo es el menú del icono de la barra de estado (activar, desactivar, usar el valor heredado). El valor predeterminado del área se ajusta en la entrada de configuración «Historial del documento» del grupo de navegación «Área actual» (visible solo cuando hay un área abierta); el archivo de área solo se crea al establecerlo por primera vez.

**Desactivar no borra nada.** El registro solo se pausa; el archivo acompañante se conserva. Al reactivarlo, el hueco se anota como un paquete agrupado y el historial sigue siendo trazable sin rupturas.

## Paquetes de cambios

Para que guardar con frecuencia (por ejemplo con el guardado automático) no inunde el historial de micro-pasos, la aplicación agrupa los guardados consecutivos en un **paquete de cambios**. Lo controlan dos ventanas de tiempo (Ajustes → Comportamiento):

- **Duración máxima del paquete** (predeterminado 5 minutos): después comienza un paquete nuevo, aunque se trabaje sin pausa.
- **Cierre por inactividad** (predeterminado 2 minutos): tras una pausa sin cambios, el siguiente guardado abre un paquete nuevo.

Cada paquete lleva marcas de tiempo y el origen detectado: **Edición** (guardado en la aplicación) o **Externo** (el archivo fue cambiado por otro programa; la aplicación lo detecta al abrir y antes de cada guardado y anota la diferencia en lugar de dejar que el historial se rompa).

## Origen de un cambio

Cada paquete de cambios registra además **con qué nombre de inicio de sesión** y **en qué equipo** se originó. La vista del historial muestra ambos en dos columnas propias, de modo que la distinción entre persona y dispositivo siga siendo visible. Quien trabaja en varios equipos ve así dónde surgió un cambio; en cuanto un conjunto se comparte, también por quién.

El dato es una **constatación en el momento del cambio**, no una cuenta de usuario gestionada. Se lee, no se asigna, y nunca se reescribe después: si más tarde se cambia el nombre de inicio de sesión, las entradas existentes permanecen igual. Si alguno de los dos valores no puede determinarse, la columna queda vacía en lugar de inventar un sustituto.

Las entradas anteriores a esta función no llevan origen, y no puede añadirse después porque no es reconstruible. Un cambio realizado **fuera** de la aplicación tampoco lo lleva: la aplicación solo lo advierte y no sabe quién lo hizo.

**Al transmitir un documento, el dato viaja con él.** Quien comparte el archivo acompañante junto al documento comparte también los nombres de inicio de sesión que contiene. No existe una vía propia para retirarlos antes; quien no lo desee, desactiva el historial (véanse los tres niveles arriba). Sin historial tampoco hay origen.

## Barra de estado

El icono de reloj en la barra de estado muestra el estado del documento activo:

- **Activo** (relleno): los cambios se registran.
- **En pausa** (contorno): el historial está efectivamente desactivado, existe un archivo acompañante.
- **Inactivo**: el historial está desactivado, no hay archivo acompañante.

La descripción emergente indica además qué nivel determina el ajuste (archivo, área o aplicación). Un clic abre el menú con la vista del historial y los interruptores del nivel de documento.

## Vista del historial

«Ver → Historial del documento» (o el menú de la barra de estado) abre la lista de revisiones del documento activo como pestaña de solo lectura: la revisión más reciente arriba, debajo todos los paquetes con fecha, origen y alcance (+líneas insertadas/−eliminadas), y abajo del todo el estado inicial. La pestaña se sitúa inmediatamente a la derecha de la pestaña del documento. Por ventana existe exactamente una vista de historial; abrirla para otro documento traslada esa misma pestaña junto a la pestaña de este.

- **Ver** muestra el estado completo de una revisión debajo de la lista.
- **Comparar** contrasta dos estados seleccionados línea a línea (columnas «De» y «A», opcionalmente también contra el estado actual): líneas eliminadas en rojo, insertadas en verde, con marcas de omisión para los pasajes sin cambios.
- **Restaurar** carga el estado elegido en la pestaña de edición del documento. El documento cuenta entonces como modificado; solo al guardar la restauración se hace efectiva y se crea con ello una revisión **nueva**. Las revisiones anteriores nunca se borran ni se sobrescriben.
