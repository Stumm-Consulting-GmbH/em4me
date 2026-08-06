# Vista de grafo

La vista de grafo hace visibles las relaciones de enlaces de los archivos Markdown: cada archivo es un nodo, cada enlace una arista dirigida. Hay dos formas con la misma interacción: el **grafo del área** en su propia pestaña para toda el área y el **grafo del archivo** como panel lateral para el entorno del archivo activo.

Ambas formas pertenecen a la extensión **Vista de grafo** y pueden desactivarse juntas en Configuración → Extensiones.

## Grafo del área (pestaña)

El grafo del área muestra todos los archivos Markdown del área abierta junto con sus enlaces en la gran superficie de una pestaña dedicada. Se abre mediante el menú Ver → Grafo del área o mediante el menú contextual del panel del área; hay una pestaña de grafo por ventana, abrirla de nuevo activa la existente. La pestaña es una vista de solo lectura sin modo de edición; su título lleva el nombre del área. Sin un área abierta, la entrada no está disponible.

La barra de herramientas en la cabecera de la pestaña ofrece:

- **Dirección** — «Ambas direcciones» muestra el grafo completo. «Entrantes» o «Salientes» limitan la visualización a los archivos alcanzables desde el archivo activo mediante enlaces de la dirección elegida (a cualquier profundidad). Si no hay archivo activo, el grafo sigue mostrando todas las aristas y lo indica.
- **Contador de archivos** — el número de nodos mostrados actualmente.
- **Reorganizar** — recalcula la disposición y descarta las posiciones movidas a mano.

## Grafo del archivo (panel)

El panel «Grafo del archivo» muestra el entorno de enlaces del archivo activo y lo sigue automáticamente al cambiar de pestaña. Se conmuta mediante el menú Ver → Barra lateral → Paneles → Grafo del archivo, el icono del grafo en la barra de estado o un atajo de teclado propio; lado, orden y grupos de pestañas siguen las reglas de la [barra lateral](sidebar.md).

En la cabecera del panel hay dos controles:

- **Profundidad** (1 a 5) — cuántos pasos de enlaces alrededor del archivo activo se incluyen. La profundidad 1 muestra solo los vecinos directos, valores mayores amplían el entorno paso a paso.
- **Dirección** — «Salientes» sigue solo los enlaces que salen del archivo, «Entrantes» solo los enlaces que apuntan al archivo, «Ambas direcciones» combina ambos.

Ambos ajustes se aplican por columna durante la sesión en curso. Un archivo sin relaciones de enlaces aparece como nodo único con una indicación. Fuera de un área, el panel trabaja con el espacio de búsqueda limitado alrededor de la carpeta del archivo y lo indica discretamente; el grafo completo lo proporciona el área.

## Manejo

- **Zoom** — rueda del ratón sobre la superficie, centrado en el puntero.
- **Desplazar** — arrastrar la superficie con el botón del ratón pulsado.
- **Arrastrar nodos** — los nodos individuales pueden recolocarse con el ratón; la posición se conserva durante la sesión, incluso cuando el grafo se actualiza.
- **Resaltar** — al pasar el puntero por un nodo, destacan el propio nodo, sus vecinos directos y las aristas implicadas; el resto se atenúa.
- **Abrir** — un clic en un nodo abre el archivo (o salta a la pestaña ya abierta). El archivo activo está resaltado en color.
- **Nombres duplicados** — si varios archivos comparten el mismo nombre, una descripción emergente en el nodo muestra la ruta completa.

## Semántica de las flechas

Las aristas son dirigidas: la flecha apunta del documento que enlaza al documento enlazado. Si dos archivos se referencian mutuamente, ambos enlaces se funden en **una** arista con puntas de flecha en ambos extremos (flecha doble). En el grafo entran los enlaces wiki (incluida la resolución de alias) y los enlaces Markdown a archivos del espacio de búsqueda; varios enlaces entre los mismos dos archivos cuentan como una sola arista.

## Límites

- Los nodos son exclusivamente **archivos Markdown**; las etiquetas, los adjuntos o los bloques individuales no aparecen en el grafo.
- En áreas muy grandes (más de 1500 archivos) el grafo muestra los nodos más conectados e indica los ocultos.
- El grafo del área requiere un área abierta; el panel del archivo funciona también sin área, entonces con un espacio de búsqueda limitado.
