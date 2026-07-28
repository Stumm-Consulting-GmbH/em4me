# Aplicaciones, ventanas y áreas

La app organiza el trabajo en tres niveles: **aplicaciones** (contextos de trabajo independientes), **ventanas** (tantas como se desee por aplicación) y **pestañas**. Esta página describe el inicio múltiple, la gestión de ventanas, la sistemática de títulos, las **áreas** (una carpeta como espacio de trabajo exclusivo de una aplicación) y los **espacios de trabajo** (aplicaciones con nombre, guardadas de forma permanente con todas sus ventanas).

## Aplicaciones

El programa se puede iniciar varias veces: cada inicio adicional del archivo del programa crea una nueva aplicación, un contexto de trabajo independiente con sus propias ventanas y su propia numeración. «Archivo → Nueva aplicación» hace lo mismo.

Todas las aplicaciones se ejecutan en un mismo proceso y comparten la configuración. La restauración de sesión (Ayuda → Restaurar sesión) reabre en el siguiente inicio todas las aplicaciones con sus ventanas y pestañas.

## Borradores sin guardar

Los documentos nuevos que nunca se han guardado (pestañas sin título con contenido) sobreviven al cierre de la aplicación: su contenido se almacena al cerrar y se vuelve a abrir como pestañas sin título en el siguiente inicio. Esto funciona con independencia de la restauración de sesión, por lo que también se aplica cuando esta está desactivada.

El almacenamiento solo actúa al cerrar la aplicación o una ventana, no al cerrar una sola pestaña (Ctrl+W); un borrador individual se descarta deliberadamente mediante el diálogo de guardado. Los archivos ya guardados no se ven afectados y conservan su diálogo de guardado al salir.

Desactivación en «Ajustes → Comportamiento» con «Conservar los documentos nuevos sin guardar al salir» (predeterminado: activado).

## Ventanas

Dentro de una aplicación se pueden abrir tantas ventanas como se desee: mediante el menú contextual de la pestaña («Mover a» / «Copiar a» → «Ventana nueva»), una pestaña pasa a una ventana nueva de la misma aplicación. Con varias ventanas abiertas, el submenú lista todas las demás ventanas como destino; en cuanto hay varias aplicaciones en ejecución, las entradas de destino llevan el contexto de aplicación.

## Posición de las pestañas nuevas

Una pestaña creada **desde otra** se abre inmediatamente a su derecha. Esto vale para cada clic en el contenido de un documento — enlace wiki, resultado de consulta, fuente de un evento, navegación de diarios, enlace de diagrama — y también para el historial del documento, que aparece junto a la pestaña de su documento. La relación entre origen y destino permanece visible y el camino de vuelta es corto.

Si una acción abre varios archivos a la vez, se colocan detrás del origen en su propio orden. Si el archivo de destino ya está abierto, solo se activa su pestaña; el orden de la barra nunca cambia por ello.

Todas las aperturas **sin** origen siguen colocándose al final de la barra: diálogo de archivos, paleta de comandos, marcadores, paneles, lista de archivos del área, así como el manual y los ajustes.

## Grupos de pestañas

Las pestañas pueden reunirse en grupos con nombre y color: los miembros permanecen juntos detrás de una **cabecera de grupo** coloreada en la barra de pestañas, y sus pestañas llevan un subrayado en el color del grupo.

- **Crear:** menú contextual de una pestaña → «Nuevo grupo con esta pestaña». El grupo recibe un nombre predeterminado y el siguiente color libre; el diálogo de renombrado con selección de color (paleta fija de ocho colores, ajustada a los temas claro y oscuro) se abre directamente.
- **Rellenar:** «Añadir al grupo» en el menú contextual de la pestaña, o arrastrar una pestaña sobre la cabecera del grupo o entre dos miembros. «Quitar del grupo» o arrastrar una pestaña fuera del bloque termina la pertenencia; los grupos permanecen siempre contiguos.
- **Mover en conjunto:** si hay varias pestañas seleccionadas (véase «Selección múltiple de pestañas»), las tres entradas de grupo del menú contextual actúan sobre toda la selección, y arrastrar una pestaña seleccionada sobre la cabecera hace que se una el conjunto entero. Se añade al final del bloque del grupo en su orden de la barra; al salir, queda justo detrás del bloque.
- **Archivos derivados:** cuando un clic en el contenido de un documento agrupado abre otro archivo (enlace wiki, resultado de consulta, fila de evento, navegación de diario), la nueva pestaña se une al mismo grupo, en su posición junto al origen (véase «Posición de las pestañas nuevas»). El bloque permanece contiguo. Las aperturas fuera del contenido del documento —lista de archivos, paneles, marcadores, paleta de comandos, diálogos— permanecen sin agrupar; los archivos de destino ya abiertos solo se activan.
- **Contraer:** un clic en la cabecera contrae el grupo — solo queda visible la cabecera con el número de miembros. Esto vale también cuando la pestaña activa está dentro del grupo: sigue activa, su contenido permanece en la ventana y la cabecera lleva la misma marca que una pestaña activa. El grupo solo se expande con un clic; una activación desde fuera (enlace wiki, paleta de comandos, cambio de pestaña con el teclado) lo deja contraído.
- **Pasar el ratón en lugar de expandir:** al pasar el ratón por la cabecera de un grupo contraído aparece, tras una breve pausa, la lista de sus pestañas; un clic en ella cambia a ese archivo sin expandir el grupo. La pestaña activa está marcada en la lista y los archivos sin guardar llevan su punto de modificación.
- **Gestionar:** menú contextual de la cabecera — «Renombrar y color…», «Desagrupar» (las pestañas quedan abiertas) y «Cerrar el grupo» (todos los miembros con las preguntas de guardado habituales). Arrastrar la cabecera mueve el grupo entero por la barra.

Los grupos pertenecen a su barra de pestañas (una por lado en la vista dividida); una pestaña que cambia de barra abandona su grupo. El nombre, el color, los miembros y el estado contraído sobreviven a la restauración de la sesión. La función puede desactivarse como extensión «Grupos de pestañas»; los grupos se conservan y reaparecen sin cambios al reactivarla.

## Selección múltiple de pestañas

Se pueden seleccionar varias pestañas a la vez y moverlas después en un solo paso.

- **Seleccionar:** **Ctrl** y clic añade una pestaña a la selección y la vuelve a quitar, **Mayús** y clic selecciona el tramo desde la pestaña activa hasta la pulsada. Las pestañas seleccionadas quedan resaltadas; la selección se hace visible a partir de dos miembros.
- **Mover:** arrastrar una pestaña seleccionada mueve todo el conjunto, dentro de la barra y sobre una cabecera de grupo. En cambio, a través del límite de columna solo viaja la pestaña arrastrada.
- **Menú contextual:** las entradas de grupo actúan sobre la selección en cuanto la pestaña pulsada forma parte de ella. Las entradas que se refieren exactamente a un archivo —renombrar, marcador, mover o copiar a una ventana— siguen ligadas a la pestaña pulsada, igual que el clic central para cerrar.
- **Fin de la selección:** un clic sin tecla modificadora, el cambio de columna o el cierre de la sesión. La selección pertenece a una sola barra de pestañas y no se guarda.

## Forma de las pestañas

Las pestañas y las cabeceras de grupo tienen esquinas superiores rectas o redondeadas, a elección (Archivo → Configuración… → Apariencia). En modo redondeado, un espacio estrecho sustituye a la línea separadora vertical entre pestañas; la marca de la pestaña activa, las franjas de color de los grupos y la marca de la columna activa no cambian. El ajuste se aplica a toda la aplicación y surte efecto de inmediato en todas las ventanas abiertas.

## Sistemática de títulos

El título de la ventana muestra entre paréntesis a dónde pertenece una ventana, solo lo necesario:

| Situación | Sufijo del título |
|---|---|
| Una aplicación, una ventana | *(sin sufijo)* |
| Una aplicación, varias ventanas | `(Ventana 2)` |
| Varias aplicaciones, una ventana cada una | `(App 2)` |
| Varias aplicaciones y ventanas | `(App 2, Ventana 3)` |
| Aplicación de área | `(Área Notas)` o `(Área Notas, Ventana 2)` |
| Espacio de trabajo | `(Espacio de trabajo Alpha)` o combinado `(Espacio de trabajo Alpha, Área Notas, Ventana 2)` |

Los números se reordenan al cerrar: si se cierra la aplicación 1, la aplicación 2 pasa a ser el nuevo número 1; lo mismo ocurre con los números de ventana dentro de una aplicación. Las aplicaciones de área no llevan número; siempre muestran el nombre de su carpeta de área. Los espacios de trabajo muestran su nombre, combinado con el nombre del área cuando hay un área vinculada.

## Áreas

Un **área** vincula una aplicación a una carpeta: todo lo que hay en esa carpeta, subcarpetas incluidas, es el espacio de trabajo, nada más. «Archivo → Abrir área…» elige la carpeta; «Archivo → Cerrar área» termina el trabajo en el área y cierra todas las ventanas de la aplicación del área (con las preguntas de guardado habituales). El vínculo es fijo: un área no se puede cambiar, solo cerrar.

Al abrir se aplican tres reglas:

- Si la aplicación está vacía (sin archivo abierto), adopta el área.
- Si la aplicación ya tiene un archivo abierto, se crea una nueva aplicación para el área.
- Si el área ya está en ejecución, el foco salta a una ventana de la aplicación del área; la misma área nunca se ejecuta dos veces.

**Demo-Area:** «Archivo → Crear la Demo-Area…» copia una colección de ejemplos incluida en inglés —páginas Markdown junto con adjuntos de imagen y PDF que muestran las funciones más importantes— en una carpeta vacía y la abre directamente como área: un entorno de pruebas para experimentar sin riesgo. Las carpetas de destino no vacías se rechazan, y los archivos existentes nunca se sobrescriben. La función puede desactivarse como extensión «Demo-Area»; las carpetas de demostración ya creadas son áreas ordinarias y permanecen intactas.

### Límites estrictos

Dentro de una aplicación de área, el área es el límite: el diálogo de apertura empieza en el área y rechaza una selección externa, «Recientes» solo muestra archivos del área, «Guardar como» solo acepta destinos dentro del área, y tampoco entra ningún archivo ajeno por arrastrar y soltar. Los archivos del explorador se abren siempre en una aplicación sin área.

Los enlaces cuyo destino está fuera del área se marcan con un subrayado de advertencia; la información sobre herramientas muestra la ruta completa del destino. Un clic no abre el destino, sino que informa del motivo en la barra de estado. Las imágenes incrustadas se siguen mostrando aunque estén fuera; el límite se aplica a la apertura de archivos, no al renderizado.

### Espacio de búsqueda e índice

En una aplicación de área, el espacio de búsqueda de los retroenlaces, las etiquetas, el autocompletado y el linter abarca **toda** el área en lugar de solo la carpeta del archivo activo. Para que el área esté lista con rapidez al abrirla, la aplicación crea el archivo **`Area_Cache.mdda`** en la carpeta raíz del área. Es una simple caché del índice y se puede eliminar sin riesgo; se reconstruye la próxima vez que se abre el área.

### Panel del área

El panel «Área» muestra el área como estructura de carpetas en la barra lateral (acoplable a la izquierda o a la derecha como cualquier panel; el conmutador es el icono de carpeta de la barra de estado o Ver → Paneles → Área): el árbol de carpetas arriba y debajo los archivos Markdown de la carpeta seleccionada; otros tipos de archivo no aparecen. Un clic en un archivo lo abre como pestaña, todas las entradas muestran la ruta completa como información sobre herramientas, y los cambios externos (archivo creado, borrado, renombrado) aparecen automáticamente. El botón «+» en la cabecera de la lista crea un nuevo archivo Markdown en la carpeta seleccionada y lo abre. En una aplicación de área recién abierta y todavía vacía, el panel es visible automáticamente.

### Estadísticas del área

«Ver → Estadísticas del área» abre una página de indicadores del área abierta como pestaña propia; el mismo punto de entrada está en el menú contextual del panel del área. La página es de solo lectura y muestra seis secciones: **Archivos y almacenamiento** (archivos Markdown y no Markdown repartidos en imágenes, PDF y otros, número de carpetas, almacenamiento ocupado con sus partes), **Propiedades** y **Etiquetas** (el número de archivos por entrada, ordenable por nombre o por número), **Archivos complementarios** (el `.mdd` de cada documento y los archivos del área `.mdda`), **Contenido** (tareas por estado, enlaces wiki y Markdown, alias, archivos sin enlace entrante) y **Archivos destacados** (los más grandes, los modificados más recientemente y los más enlazados). Un clic en un nombre de archivo de estas tres últimas listas abre el archivo.

Se cuentan **archivos, no apariciones**: si la etiqueta `#proyecto` muestra 180, entonces 180 archivos llevan esa etiqueta; con qué frecuencia aparece en su texto no se indica. Las listas largas empiezan con 25 filas y se pueden desplegar por completo.

Las cifras llevan arriba una marca de tiempo y se calculan **a petición**, no de forma continua: el botón «Actualizar» las vuelve a calcular, igual que una nueva llamada de la entrada de menú. Sin un área abierta no hay un conjunto de archivos delimitado; la entrada aparece entonces atenuada. La función se puede desactivar como extensión «Estadísticas del área».

### Áreas recientes

«Archivo → Áreas recientes» lista las áreas abiertas recientemente por su nombre de carpeta. Un clic abre el área con las reglas habituales. Las áreas se restauran con la sesión; si falta una carpeta de área al iniciar, la aplicación correspondiente no se restaura y se muestra un aviso.

## Espacios de trabajo

Un **espacio de trabajo** es una aplicación con nombre, guardada de forma permanente: comprende todas sus ventanas con paneles, pestañas con sus ajustes de vista, grupos de pestañas, una posible vinculación de área y los borradores sin guardar. Un espacio de trabajo abierto mantiene su estado al día **automáticamente**, sin paso manual de guardado; al reabrirlo, el trabajo continúa exactamente en el último estado. Acceso: el submenú «Archivo → Espacios de trabajo» con la lista de todos los espacios de trabajo (el punto de color muestra también el estado: relleno = abierto, anillo = cerrado) y las cuatro acciones debajo; las mismas acciones están disponibles como comandos en la paleta de comandos.

**Área y espacio de trabajo son dos cosas distintas:** un *área* vincula una aplicación a una **carpeta** y delimita su espacio de trabajo (véase arriba). Un *espacio de trabajo* es una **colección de ventanas** con nombre y reabrible, es decir, un estado de trabajo guardado. Ambos se pueden combinar: un espacio de trabajo cuya aplicación tiene un área vinculada lleva esa vinculación consigo en su registro.

**Color de la barra de título:** las ventanas de un espacio de trabajo abierto llevan su color en la barra de título de la ventana —una variante intensa en el tema claro, una variante pastel de la paleta en el tema oscuro, cada una con un color de texto de título acorde—. La coloración sigue el ciclo de vida: aparece al abrir, cambia de inmediato con el color en la gestión, desaparece al cerrar o eliminar, y se suprime al desactivar la extensión «Espacios de trabajo». Requiere Windows 11; sin esta compatibilidad permanece la barra de título estándar y la aplicación no se ve afectada.

### Ciclo de vida

- **Crear:** «Guardar como espacio de trabajo…» da nombre a la aplicación en curso con todas sus ventanas (el diálogo pide nombre y color; los colores proceden de la paleta de ocho colores de los grupos de pestañas). «Nuevo espacio de trabajo…» crea un espacio de trabajo vacío y abre de inmediato su primera ventana.
- **Abrir:** un clic en una entrada de la lista restaura todas las ventanas en su último estado. El mismo espacio de trabajo nunca está abierto dos veces; si ya está abierto, el foco pasa a su ventana activa más reciente.
- **Cerrar:** «Cerrar el espacio de trabajo» (o cerrar la última ventana) congela el estado y cierra todas las ventanas del espacio de trabajo. Los cambios sin guardar de archivos con nombre pasan por las preguntas de guardado habituales; cancelar detiene el cierre. Las pestañas sin título con contenido pasan al registro sin preguntar y vuelven la próxima vez que se abra el espacio de trabajo.
- **Renombrar y color:** en cualquier momento mediante «Gestionar los espacios de trabajo…»; el título de la ventana se actualiza de inmediato.
- **Eliminar:** tras una confirmación, quita solo el registro guardado, nunca archivos Markdown. Un espacio de trabajo abierto en ese momento no se cierra; continúa como aplicación ordinaria sin nombre, y sus borradores aún guardados pasan al almacén general de borradores.

### Gestión

«Gestionar los espacios de trabajo…» abre un diálogo con todos los espacios de trabajo: punto de color, nombre, estado (abierto o cerrado) y momento de la última apertura. Cada entrada ofrece las acciones **Abrir**, **Renombrar y color…** y **Eliminar**.

### Restauración de sesión y casos límite

Con la restauración de sesión activa, el siguiente inicio recupera las aplicaciones sin nombre **y** todos los espacios de trabajo abiertos al cerrar. Si la restauración está desactivada, se inicia como siempre una ventana vacía; los registros se conservan íntegros y pueden abrirse en cualquier momento desde el submenú. Si al abrir falta la carpeta de área vinculada de un espacio de trabajo, aparece un aviso y la apertura no se realiza; el registro queda sin cambios.

La función puede desactivarse como extensión «Espacios de trabajo»: desaparecen el submenú, los comandos y la gestión, mientras que los registros y los espacios de trabajo abiertos quedan intactos; al reactivarla, todo vuelve sin cambios.
