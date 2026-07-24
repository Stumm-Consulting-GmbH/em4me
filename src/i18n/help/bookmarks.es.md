# Marcadores

Los marcadores mantienen a mano los archivos de uso frecuente, sin importar qué carpeta esté abierta en ese momento. Viven en un panel lateral propio, como un árbol de carpetas y entradas de archivo. Hay dos tipos: los **marcadores generales**, que valen en toda la aplicación, y los **marcadores del área**, que pertenecen a un [área](apps-windows.md) y viajan con ella.

## El panel de marcadores

El panel de marcadores se activa como cualquier panel lateral: mediante la estrella de la barra de estado, el menú Ver → Paneles → Favoritos (predeterminado `Ctrl+Mayús+L`) o un atajo que asignes tú mismo. El interruptor actúa sobre la columna activa; lado, orden y grupos de pestañas siguen las reglas de la [barra lateral](sidebar.md). La estrella de la barra de estado indica además si el archivo activo ya está marcado.

Un clic en una entrada abre el archivo. Si un archivo marcado falta en la ubicación esperada, la entrada lo señala en lugar de no llevar a ninguna parte. Incluso en el estado vacío de la aplicación, sin documento abierto, la lista sigue siendo utilizable, de modo que los archivos marcados pueden abrirse directamente.

## Dos secciones: general y ligada al área

Con un área abierta, el panel se divide en dos secciones con sus propios encabezados: **Marcadores del área** y **Marcadores**. Sin un área abierta, el panel muestra solo los marcadores generales, sin encabezados de sección, es decir, en la presentación habitual de una sola sección.

- Los **marcadores generales** viven en la configuración global de la aplicación y guardan rutas absolutas. Están siempre disponibles.
- Los **marcadores del área** pertenecen al área abierta y viven en su archivo de área. Sus destinos se guardan de forma relativa a la raíz del área; solo aparecen mientras el área está abierta y desaparecen del panel al cerrarla.

Qué sección va arriba lo determina la opción «Marcadores del área arriba» (Configuración → Comportamiento). De forma predeterminada, los marcadores del área van arriba; si la opción se desactiva, van arriba los generales. Sin un área abierta, el ajuste no tiene efecto visible.

## Por qué rutas relativas

Un marcador del área no recuerda su destino como una ruta completa, sino de forma relativa a la raíz del área, con barras diagonales. Así, los marcadores siguen siendo válidos cuando toda la carpeta del área se mueve o se copia a otro equipo: se resuelven de nuevo contra la raíz actual del área cada vez que el área se abre. Para que esa relatividad se sostenga, un marcador del área solo puede apuntar a archivos dentro del área. Un destino fuera del área no es posible; la aplicación lo rechaza.

## Crear marcadores

### Marcadores generales

El archivo activo se marca mediante el menú Archivo (predeterminado `Ctrl+D`) o la estrella. Si no hay un área abierta, o el archivo está fuera del área abierta, se crea un marcador general sin preguntar.

En cambio, si hay un área abierta y el archivo activo está dentro, `Ctrl+D` abre un pequeño menú de elección junto a la estrella, con los destinos «Marcador general» y «Marcador del área». Así, en cada creación queda claro a qué sección va el marcador.

### Marcadores del área directamente

Dos menús contextuales crean un marcador del área sin el rodeo por la elección del destino:

- La **fila de archivo del panel de área** ofrece «Añadir como marcador del área» con el clic derecho; allí los archivos están de todos modos dentro del área.
- El **menú contextual de una pestaña de archivo** ofrece «Añadir como marcador general» y, con un área abierta y el archivo dentro, además «Añadir como marcador del área».

## Convertir entre las secciones

Un marcador existente puede pasar al otro tipo mediante su menú contextual: «Convertir en marcador del área» o «Convertir en marcador general». Esto vale también para una carpeta entera con su subárbol, que se traslada entonces con su estructura y su orden.

Al convertir en un marcador del área, la aplicación comprueba si todos los destinos afectados están dentro del área. Si no es así, toda la operación se rechaza y señala que la conversión contiene destinos fuera del área. De este modo se mantiene intacta la regla de las rutas relativas.

## Organizar y mantener

Ambas secciones comparten las mismas herramientas. El menú del clic derecho de una entrada crea nuevas carpetas y subcarpetas; las entradas pueden renombrarse, moverse a una carpeta y eliminarse. Las carpetas contienen a su vez carpetas, de modo que la colección puede estructurarse libremente.

El arrastrar y soltar ordena dentro de una sección y coloca las entradas en carpetas. El arrastre se mantiene deliberadamente dentro de su propia sección: una entrada no se arrastra por encima del límite entre marcadores del área y generales. Para cambiar de sección, se usa la conversión.

Cuando un archivo marcado se renombra dentro de la aplicación, o se renombra su carpeta, los marcadores se ajustan automáticamente, en ambas secciones: el modelo general mediante las rutas absolutas, el árbol del área mediante las relativas.

## Sin un área abierta

Sin un área abierta, solo es visible la sección general, sin encabezado y sin sección de área. Los marcadores del área no se pierden entonces, sino que esperan en el archivo de área; en cuanto el área se vuelve a abrir, reaparecen en el panel.
