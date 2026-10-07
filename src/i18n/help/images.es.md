# Imágenes

Las imágenes se cargan desde archivos locales cuya ruta se indica en relación con el archivo Markdown, o desde datos incrustados en el texto. En un documento que nunca se ha guardado, las imágenes locales solo aparecen después de guardarlo, porque hasta entonces no tiene ninguna carpeta contra la que resolver su ruta. Las imágenes con una dirección de la red (`http(s)`) no se muestran de forma deliberada, porque por seguridad la aplicación no carga contenido de la red; en su lugar, coloca esa imagen como archivo junto al documento. El manual no incluye imágenes de demostración; los ejemplos muestran por ello la sintaxis como bloque de código con el resultado descrito — en tus propios archivos se renderizan directamente.

## Sintaxis de imagen

El texto alternativo entre corchetes describe la imagen (importante para la accesibilidad; un texto alternativo ausente lo señala el [linter Markdown](tools.md)).

```markdown
![Diagrama de arquitectura](imagenes/arquitectura.png)
```

Las rutas relativas se resuelven contra la carpeta del archivo Markdown. Por seguridad solo aparecen imágenes dentro de un límite fijo: si el documento está en un área abierta, es el área entera y, si no, la carpeta del archivo Markdown con sus subcarpetas. No se muestran las imágenes con una dirección de archivo (`file:`), las imágenes en un recurso compartido de red (`//servidor/…` o `\\servidor\…`) ni las rutas que salen del límite, sean relativas con `../` o absolutas. Formatos admitidos: PNG, JPG/JPEG, GIF, WebP, SVG, BMP; un archivo de imagen puede ocupar como máximo 20 MB.

## Tamaños de imagen

Un sufijo de tamaño tras la URL fija el ancho y/o alto en píxeles:

```markdown
![Alt](imagen.png =300x200)   ancho 300, alto 200
![Alt](imagen.png =300x)      solo ancho, alto proporcional
![Alt](imagen.png =x200)      solo alto, ancho proporcional
```

Los sufijos no válidos quedan como texto y no se interpretan.

## Figuras implícitas

Una imagen **sola en un párrafo** se convierte en figura con el texto alternativo como leyenda centrada. Las imágenes en el texto corriente quedan sin cambios.

```markdown
Párrafo anterior.

![Cifras trimestrales comparadas](chart.png)

Párrafo posterior.
```

Resultado: la imagen aparece con la leyenda «Cifras trimestrales comparadas» centrada debajo.

## Incrustar imágenes con incrustación wiki

Alternativamente, `![[imagen.png]]` incrusta una imagen mediante la sintaxis wiki, incluido el modificador de tamaño `![[imagen.png|300]]` — detalles en la página [Enlaces](linking.md).

## Ampliar una imagen

Un clic en una imagen en la vista «Renderizado» — igualmente en su mitad de la vista «Dividido» — la muestra ampliada sobre toda la ventana. El fondo se oscurece y la imagen aparece tan grande como lo permiten la ventana y su propia resolución: completa, sin deformar y nunca por encima de su propio tamaño. Por eso una imagen pequeña se queda en su tamaño, en el centro. Una indicación de tamaño en el documento (`=300x`) no limita la ampliación. Esto vale para toda imagen mostrada, también en tablas, callouts e incrustaciones, y también para una imagen que es en sí un enlace.

Debajo de la imagen figura su leyenda — el texto alternativo o, si falta, el nombre del archivo — y debajo dos botones:

- **Abrir en el programa predeterminado** abre el archivo de imagen en el programa que le asigna el sistema operativo, con los mismos límites que cualquier [adjunto](attachments.md). La ampliación sigue abierta. Una imagen escrita en el texto como datos, sin archivo propio, no muestra este botón.
- **Cerrar** cierra la ampliación.

Hay tres formas de cerrarla, todas con el mismo efecto: el botón «Cerrar», la tecla `Esc` o un clic en la zona oscurecida junto a la imagen. Con el teclado, `Tab` pasa de un botón a otro sin salir de la ampliación.

Una imagen que la vista no muestra — por ejemplo porque falta su archivo — aparece como su texto alternativo y no abre ninguna ampliación. En la vista «En vivo», un clic no abre ninguna ampliación; allí un doble clic abre la imagen en el programa predeterminado.
