# Vista de mapa mental

La vista de mapa mental muestra la estructura de **un** documento como un mapa: los títulos y los puntos de lista se convierten en nodos de un árbol, y el texto corrido que va debajo se convierte en la nota de su nodo. Es una vista del mismo documento, no un segundo documento, y nunca cambia el texto.

La vista pertenece a la extensión **Vista de mapa mental** y puede desactivarse en Configuración → Extensiones. Con ella desactivada desaparece la entrada de menú, y una pestaña que estaba abierta como mapa vuelve a la vista de lectura.

## Abrir

El mapa mental es el quinto modo de vista de una pestaña, junto a Código, Dividida, Renderizada y En vivo: Ver → Mapa mental o `Ctrl+5` por defecto. El modo vale por pestaña, de modo que un documento puede estar abierto como mapa mientras otro se edita como código al lado. El mapa sigue al documento: añada un título en el código y aparecerá en el mapa poco después.

## Qué se convierte en nodo

| En el documento | En el mapa |
| --------------- | ---------- |
| títulos | los niveles superiores del árbol |
| puntos de lista | continúan la jerarquía bajo su nodo |
| párrafos, tablas, bloques de código, imágenes | nota de su nodo superior |

La raíz es el título de primer nivel si el documento lleva exactamente uno; si no, la raíz la lleva el nombre del archivo y todos los títulos de primer nivel pasan a ser sus hijos. Un nivel omitido no genera un nodo vacío: un nodo se cuelga del antepasado existente más próximo.

## Posición de la raíz

La dirección de crecimiento se elige porque depende del documento y de la pantalla: un árbol profundo se lee mejor de izquierda a derecha, uno plano y ancho de arriba abajo, y la posición central aprovecha mejor una pantalla ancha.

| Posición | Imagen |
| -------- | ------ |
| **Izquierda** | raíz a la izquierda, todas las ramas crecen hacia la derecha |
| **Centro** | raíz en el medio, las ramas se reparten a ambos lados |
| **Derecha** | raíz a la derecha, todas las ramas crecen hacia la izquierda |
| **Arriba** | raíz arriba, el árbol crece hacia abajo |
| **Abajo** | raíz abajo, el árbol crece hacia arriba |

El texto de los nodos permanece horizontal en todas las posiciones; lo que gira es la disposición, no la etiqueta. En la posición central las ramas principales mantienen el orden del documento y se dividen en un único punto: las primeras ramas van a la derecha, las restantes a la izquierda, y el corte cae donde ambos lados quedan lo más igualados posible en altura. El mismo documento da así siempre la misma imagen.

## Manejo

- **Plegar** — el círculo al final de una rama pliega y despliega el subárbol. Con `Ctrl` el clic actúa sobre todo el subárbol.
- **Zoom** — rueda del ratón sobre la superficie, centrada en el puntero.
- **Desplazar** — arrastrar la superficie con el botón del ratón pulsado. Al entrar en la vista, el mapa se ajusta solo al encuadre; volver a entrar lo recupera tras un zoom o un desplazamiento libres.
- **Notas** — los nodos con texto corrido llevan un símbolo de hoja; un clic en él muestra el texto en un recuadro junto al nodo. Un clic en la superficie libre lo cierra.
- **Salto al origen** — un clic en el texto del nodo cambia a la vista dividida y coloca el cursor en la línea correspondiente.

El estado de plegado vale para la sesión en curso y no se escribe ni en el documento ni en un archivo acompañante: un mero estado de visualización no debe cargar un formato que sigue siendo legible sin la aplicación.

## Ajustar la presentación

La sección Mapa mental de la configuración es el **valor por defecto para todos los documentos**:

- **Posición de la raíz** — las cinco direcciones anteriores.
- **Estilo de línea** — conexiones curvas o rectas.
- **Congelar el color de rama a partir del nivel** — hasta qué nivel una rama nueva recibe color propio; por debajo, todo el subárbol hereda el color de su rama principal.
- **Profundidad desplegada al inicio** — hasta qué profundidad se abre el mapa; `-1` lo despliega todo.
- **Anchura máxima de un nodo** — la anchura a partir de la cual un título largo pasa a la línea siguiente.

## Valor por documento

Cada documento puede sustituir el valor por defecto para sí mismo, en el encabezado YAML bajo la clave `mindmap`:

```yaml
---
mindmap:
  layout: mitte
  linienfuehrung: gerade
  anfangsTiefe: 2
---
```

La indicación vale solo para ese documento; todos los demás siguen el ajuste. Para `layout` se admiten los valores `links`, `mitte`, `rechts`, `oben` y `unten`, para `linienfuehrung` los valores `geschwungen` y `gerade`; además los números `farbEinfrierEbene`, `anfangsTiefe` y `hoechstBreite`. Lo que no se entiende vuelve en silencio al valor por defecto, para que el archivo siga siendo legible. Las demás indicaciones del encabezado se describen en la página [Frontmatter y propiedades](frontmatter.md).

## Límites

- El mapa es una **representación**, no un editor: en él no se mueven ni se renombran nodos. Los cambios se hacen en el documento y el mapa los sigue.
- Muestra **un** documento. Las relaciones entre archivos las muestra la [vista de grafo](graph.md).
- Los documentos muy grandes se recortan a 3000 nodos; una nota bajo el mapa indica cuántos nodos se muestran.
- Un documento sin títulos ni listas no ofrece estructura para un mapa y muestra una nota en su lugar.
