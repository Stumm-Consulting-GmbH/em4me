# Libros

Un libro reúne varios archivos Markdown en un **orden de lectura declarado**. El árbol de carpetas de un [área](apps-windows.md) ordena alfabéticamente, las [subpáginas](subpages.md) llevan su jerarquía en el nombre del archivo; un libro, en cambio, escribe su estructura de forma expresa, en un archivo complementario dentro de la carpeta del libro. Los capítulos siguen siendo archivos Markdown corrientes y se leen por separado, incluso sin la aplicación.

## Qué es un libro

Un libro vive en una carpeta propia. Dentro hay tres cosas:

- el **archivo del libro**, un archivo Markdown corriente con el texto del libro; las propiedades y una referencia de imagen van en el [frontmatter](frontmatter.md), como en todas partes,
- el **archivo complementario** `Book_Settings.mdda`, que nombra el archivo del libro y lleva el árbol de capítulos,
- los **capítulos** como archivos Markdown, directamente en la carpeta del libro o en subcarpetas de cualquier profundidad.

Así, una carpeta de libro tiene más o menos este aspecto:

```text
Viaje a Ítaca/
  Book_Settings.mdda
  Viaje a Ítaca.md
  Parte 1/
    La partida.md
    El puerto.md
  Parte 2/
    El regreso.md
```

### El archivo complementario

El archivo complementario es JSON con sangría legible. Nombra el archivo del libro y describe el árbol de capítulos; las rutas son relativas a la carpeta del libro:

```json
{
  "schemaVersion": 1,
  "book": { "file": "Viaje a Ítaca.md" },
  "chapters": [
    {
      "path": "Parte 1/La partida.md",
      "children": [{ "path": "Parte 1/El puerto.md", "children": [] }]
    },
    { "path": "Parte 2/El regreso.md", "children": [] }
  ]
}
```

De ahí se derivan dos propiedades del modelo. Primero, la aplicación reconoce un libro **solo por el archivo complementario**: un archivo Markdown es el archivo del libro exactamente cuando el archivo complementario de su carpeta lo nombra. Para ello no se escribe nada en el archivo Markdown, que no lleva referencia de vuelta. Segundo, la **ubicación de la carpeta no dice nada sobre la estructura**: dónde se encuentra un archivo de capítulo es de libre elección y modificable en cualquier momento, la estructura reside únicamente en el árbol de capítulos.

Un capítulo pertenece a exactamente un libro y cuelga allí exactamente una vez. Enganchar el mismo archivo varias veces no está previsto.

## Abrir y crear un libro

Ambas vías están en el menú **Archivo**, junto a las entradas de área:

- **Abrir libro…** pide la carpeta del libro. Si no contiene un archivo complementario que nombre un archivo de libro, la aplicación avisa de que la carpeta no es un libro y no cambia nada.
- **Libro nuevo…** pide una carpeta padre y un nombre. La aplicación crea allí la carpeta del libro, junto con el archivo del libro del mismo nombre y el archivo complementario, y abre el libro.
- **Cerrar libro** deshace el vínculo. Las pestañas abiertas siguen abiertas; lo que se cierra es el libro, no el documento.

Al abrir, el archivo del libro aparece como pestaña y se muestra el índice. Hay **un libro activo por aplicación**: todas las ventanas de la misma aplicación lo comparten y se restaura en el siguiente arranque. Un capítulo también se abre de forma totalmente corriente, sin contexto de libro; sigue siendo un archivo Markdown normal.

## El índice

El panel **Libro** muestra el árbol de capítulos en el orden declarado. Un clic abre un capítulo, el que se está leyendo aparece resaltado. Delante de cada nombre hay un marcador que sirve además de tirador para el mantenimiento. El panel se conmuta como cualquier otro: con el botón de la barra de estado o con Ver → Paneles → Libro. Lado, orden y grupos de pestañas siguen las reglas de la [barra lateral](sidebar.md).

### Archivos sin enganchar

Bajo el árbol está la sección **Sin enganchar** con los archivos Markdown de la carpeta del libro que no cuelgan de ningún capítulo. No se ocultan, sino que siguen visibles y manejables, para que se vea qué sigue esperando su sitio. El archivo del libro nunca aparece ahí, no es un capítulo.

## Mantener la estructura de capítulos

Las tres vías cambian **solo la declaración** del archivo complementario. Ningún archivo se mueve, se renombra ni se borra en el proceso.

### Arrastrar

El marcador delante del nombre de un capítulo permite arrastrar ese capítulo junto con sus subcapítulos. El punto sobre la fila de destino decide dónde cae: el tercio superior lo coloca delante, el inferior detrás, el centro lo engancha como subcapítulo. Soltar en el área libre del panel lo añade al final del nivel superior. Una entrada procedente de «Sin enganchar» llega al árbol por el mismo camino. Arrastrar un capítulo bajo uno de sus propios subcapítulos queda excluido.

### Teclado

Con una fila enfocada, estas entradas fijas actúan sobre el capítulo junto con sus subcapítulos:

| Entrada | Efecto |
|---|---|
| `Alt+↑` / `Alt+↓` | una posición hacia arriba o hacia abajo dentro del nivel |
| `Alt+→` | anidar: pasa a ser el último subcapítulo de su predecesor |
| `Alt+←` | desanidar: sube un nivel, detrás de su anterior capítulo padre |
| `Intro` / `Espacio` | abrir el capítulo |

En el borde de un nivel el árbol queda inalterado y no avisa de nada: allí sencillamente no hay destino.

### Menú contextual

El clic derecho sobre una fila ofrece:

- **Nuevo capítulo** crea un archivo y lo engancha de inmediato. El nombre se escribe directamente en el panel; el archivo nace en la carpeta del capítulo padre, en el nivel superior dentro de la carpeta del libro.
- **Desenganchar** saca la entrada del árbol. El archivo permanece y luego aparece bajo «Sin enganchar».
- **Enganchar** es la vía inversa en un archivo sin enganchar; pasa al final del nivel superior.

En el área libre del panel, el clic derecho crea un nuevo capítulo en el nivel superior.

## Leer más allá de los límites de capítulo

Dos botones en la cabecera del panel avanzan y retroceden una posición; los mismos pasos existen como comandos en la paleta y, de forma predeterminada, en `Ctrl+Alt+Av Pág` y `Ctrl+Alt+Re Pág`. El recorrido sigue el orden de lectura del árbol: un capítulo precede a sus subcapítulos y después vienen sus hermanos.

En los extremos no hay vuelta circular. En lugar de saltar en silencio al otro extremo, la barra de estado avisa de que se ha alcanzado el principio o el final del libro; allí los botones están desactivados. Los archivos sin enganchar quedan fuera del recorrido.

## Mover archivos de capítulo

Como la ubicación de la carpeta es libre, su cambio tiene un comando propio: **Mover el archivo del capítulo…** en el menú contextual de una entrada. Pide una carpeta de destino dentro de la carpeta del libro y mueve allí el archivo. Dos cosas se actualizan en consecuencia:

- las **referencias** al archivo desde otros documentos,
- el **árbol de capítulos**, cuya entrada conserva el mismo sitio y los mismos subcapítulos.

Un destino fuera de la carpeta del libro se rechaza, igual que un destino en el que ya hay un archivo con ese nombre. El archivo del libro no se puede mover. Renombrar un archivo de capítulo funciona como con cualquier otro archivo y actualiza el árbol de capítulos del mismo modo.

## Reparar capítulos faltantes

Si un archivo de capítulo se mueve o se borra fuera de la aplicación, su entrada apunta al vacío. No desaparece, sino que permanece en el índice y lleva la marca **falta**; no se puede pulsar, porque no hay nada que abrir.

Si en otro punto de la carpeta del libro existe un archivo con el mismo nombre, la fila lleva además un signo de búsqueda como propuesta de recuperación. Nunca se ejecuta por sí sola. El menú contextual de la entrada ofrece dos vías:

- **Reasignar…** abre una selección bajo la fila. Un único hallazgo con el mismo nombre aparece resaltado y preseleccionado; junto a él, «Elegir otro archivo…» lleva a la elección libre dentro de la carpeta del libro.
- **Desenganchar** elimina la entrada cuando el capítulo realmente ha desaparecido.

En cuanto la asignación está hecha, la fila pierde su marca.

## Activar y desactivar

Los libros son una extensión conmutable (Configuración → [Extensiones](extensions.md), grupo Herramientas), activada de fábrica. En estado desactivado desaparecen las entradas de menú, los comandos y el panel; un archivo de libro se abre entonces como cualquier otro archivo Markdown. El archivo del libro, el archivo complementario y los capítulos quedan intactos, y al volver a activar la extensión el estado regresa sin cambios.
