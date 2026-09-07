# Vista de grafo

La vista de grafo hace visibles las relaciones de enlaces de los archivos Markdown: cada archivo es un nodo, cada enlace una arista dirigida. Hay dos accesos con la misma interacción: el **grafo del área** en su propia pestaña para toda el área y el **grafo del archivo** como panel lateral para el entorno del archivo activo. El grafo del área presenta sus datos como **red** o como **árbol**.

Ambas formas pertenecen a la extensión **Vista de grafo** y pueden desactivarse juntas en Configuración → Extensiones.

## Grafo del área (pestaña)

El grafo del área muestra todos los archivos Markdown del área abierta junto con sus enlaces en la gran superficie de una pestaña dedicada. Se abre mediante el menú Ver → Grafo del área o mediante el menú contextual del panel del área; hay una pestaña de grafo por ventana, abrirla de nuevo activa la existente. La pestaña es una vista de solo lectura sin modo de edición; su título lleva el nombre del área. Sin un área abierta, la entrada no está disponible.

La barra de herramientas en la cabecera de la pestaña ofrece:

- **Presentación** — cambia entre **red** y **árbol**. La elección vale para la pestaña abierta; la próxima vez que se abra empieza de nuevo con la red. La dirección y «Reorganizar» valen solo para la red.
- **Dirección** — «Ambas direcciones» muestra el grafo completo. «Entrantes» o «Salientes» limitan la visualización a los archivos alcanzables desde el archivo activo mediante enlaces de la dirección elegida (a cualquier profundidad). Si no hay archivo activo, el grafo sigue mostrando todas las aristas y lo indica.
- **Contador de archivos** — el número de nodos mostrados actualmente.
- **Reorganizar** — recalcula la disposición y descarta las posiciones movidas a mano.

### Árbol de enlaces

El árbol responde a la pregunta del **orden** que la red deja abierta: qué cuelga de un punto de entrada y a qué profundidad. Muestra los mismos datos —los mismos archivos, los mismos enlaces, el mismo límite del área—, solo que dirigidos desde una raíz y desplegables.

**La raíz** es en principio la página de inicio del área; si no hay ninguna definida, el árbol se enraíza en el archivo que estaba activo al abrir la vista. Se cambia de dos maneras: mediante la indicación de la raíz en la barra de herramientas, que abre la misma selección por nombre que «Abrir archivo por su nombre», o mediante la entrada «Como raíz del árbol de enlaces» en el menú contextual de un archivo del panel del área. La raíz elegida vale para la pestaña abierta; la página de inicio no se ve afectada.

**Cada archivo aparece exactamente una vez.** Si es accesible por varios caminos, se sitúa en su camino **más corto** hacia la raíz; a igual longitud decide el padre alfabéticamente primero. Un archivo que no encuentre donde lo espera está, por tanto, más arriba. Los ciclos no producen repeticiones.

**El despliegue es paso a paso:** al abrir, el primer nivel está visible, los niveles más profundos con un clic en el triángulo; «Desplegar todo» y «Plegar todo» actúan sobre todo el árbol. El número tras un nombre indica sus hijos. Un clic en el nombre abre el archivo.

**El pie** indica el número de archivos que **no** son accesibles desde esa raíz. No es un error, sino una propiedad de su material: el árbol muestra lo que cuelga de la raíz, no el área entera. Si no hay ningún archivo así, la línea desaparece.

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
- En áreas muy grandes (más de 1500 archivos) **la red** muestra los nodos más conectados e indica los ocultos. El árbol no conoce ese límite: solo dibuja las ramas desplegadas y por eso permanece completo.
- El grafo del área requiere un área abierta; el panel del archivo funciona también sin área, entonces con un espacio de búsqueda limitado.
