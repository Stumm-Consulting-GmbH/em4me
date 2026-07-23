# Colocación de comandos

Cada acción de la aplicación es un comando del registro central. La colocación de comandos los convierte en accesos propios permanentes: botones de comando en la barra de estado, una lista de ocultación para los botones predeterminados, entradas propias en el menú contextual del editor y macros como secuencias de comandos. Todo se mantiene en una sección común: «Archivo → Configuración… → Colocación de comandos». Las cuatro funciones pertenecen a la extensión desactivable «Colocación de comandos» (categoría Herramientas).

## Botones de la barra de estado

Los botones de comando propios aparecen como un segmento independiente en la barra de estado, a la derecha de los botones de vista. La creación sigue tres pasos: elegir un comando mediante búsqueda con filtro, fijar un icono del conjunto interno seleccionado y, opcionalmente, asignar un nombre visible. La información sobre herramientas del botón muestra el nombre visible y, detrás entre paréntesis, el comando original; sin nombre visible muestra el propio comando. En la lista de la sección de configuración, los botones se pueden reordenar (subir/bajar), editar y quitar.

Si el espacio de la barra de estado no basta — por ejemplo con ventanas estrechas —, los botones sobrantes pasan desde la derecha a un menú de más opciones: un botón de puntos al final del segmento abre las entradas guardadas como menú, desde el que se pueden seguir ejecutando.

Los botones cuyo comando pertenece a una extensión desactivada no aparecen (la configuración se conserva y vuelve con la extensión).

## Ocultar los botones predeterminados

Cada elemento predeterminado de la barra de estado se puede ocultar individualmente: los conmutadores de paneles, los tres conmutadores del editor (plegado, números de línea, ajuste de línea), los cuatro botones de vista y los elementos del lado derecho (estadísticas de palabras, indicador de zoom, editar, sincronización de desplazamiento, historial del documento, tema, idioma). Solo la línea de aviso permanece siempre visible — es el único canal para mensajes breves como el estado de guardado.

Ocultar solo retira el acceso, la función se mantiene: todo lo oculto sigue accesible a través del menú, la paleta de comandos y los atajos de teclado. El botón «Mostrar todo» restablece la barra de estado predeterminada.

## Menú contextual del editor

Las entradas de comando propias aparecen como una sección adicional al final del menú contextual del editor, tanto en modo código como en modo live. Se mantienen en una segunda lista de la sección de configuración — mismo flujo de creación y mismo modelo de entrada que los botones de la barra de estado, pero con orden propio. Cada entrada muestra su icono y su nombre visible.

Las entradas cuyo comando no puede ejecutarse en el contexto actual (por ejemplo, un comando de área sin un área abierta) aparecen desactivadas en lugar de desaparecer — en consonancia con el resto del menú. Sin entradas configuradas, la sección se omite por completo. La sección pertenece al editor principal; el menú contextual del campo de nota permanece sin cambios.

## Macros

Una macro agrupa una serie ordenada de pasos bajo su propio nombre e icono. Hay dos tipos de paso disponibles: «Ejecutar comando» (un comando del registro, incluida otra macro) y «Retardo» (de cero a diez segundos, por ejemplo para dar tiempo a que una vista se construya). Los pasos se ejecutan estrictamente uno tras otro; cada paso espera al anterior.

Si un paso falla o su comando no puede ejecutarse en el contexto actual, la secuencia se interrumpe y la barra de estado muestra un aviso con el nombre de la macro y el número del paso. Si una macro llama a otra macro, la cadena de llamadas es limitada; un anidamiento demasiado profundo (incluida una macro que se llama a sí misma) se interrumpe con un aviso propio. Las macros nunca se inician automáticamente, solo a través de sus accesos.

El detalle decisivo: cada macro se registra a su vez como comando regular. Así es localizable en la paleta de comandos, se le puede asignar un atajo propio en la sección de configuración «Atajos de teclado» y se puede colocar mediante botones de la barra de estado y entradas del menú contextual — sin tratamiento especial.

El editor de pasos está en la misma sección de configuración: por macro, una lista de pasos desplegable con reordenación y borrado, más un botón de ejecución de prueba. La ejecución de prueba ejecuta de inmediato el estado de edición actual — en el contexto de la pestaña de configuración, de modo que los pasos ligados al contexto se interrumpen allí, como es de esperar, con el aviso.

## Delimitación frente a la paleta de comandos

La [paleta de comandos](tools.md) y la colocación de comandos trabajan sobre el mismo registro de comandos, pero sirven a situaciones distintas: la paleta es el acceso fugaz por teclado — abrir, teclear, ejecutar, sin configurar nada. La colocación crea accesos permanentes para gestos recurrentes: un clic en la barra de estado, un clic derecho en el editor, un atajo sobre una macro.

## Estado desactivado

Si se desactiva la extensión «Colocación de comandos», la barra de estado vuelve a mostrar el estado predeterminado: sin botones propios, sin ocultaciones, sin sección de menú contextual; los comandos de macro quedan dados de baja y la sección de configuración se oculta. Toda la configuración permanece guardada y se aplica sin cambios tras volver a activarla.
