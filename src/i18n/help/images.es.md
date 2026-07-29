# Imágenes

Las imágenes se cargan desde rutas relativas al archivo Markdown o desde URL `http(s)`. El manual no incluye imágenes de demostración; los ejemplos muestran por ello la sintaxis como bloque de código con el resultado descrito — en tus propios archivos se renderizan directamente.

## Sintaxis de imagen

El texto alternativo entre corchetes describe la imagen (importante para la accesibilidad; un texto alternativo ausente lo señala el [linter Markdown](tools.md)).

```markdown
![Diagrama de arquitectura](imagenes/arquitectura.png)
```

Las rutas relativas se resuelven contra la carpeta del archivo Markdown. Por seguridad solo se resuelven imágenes dentro de un límite fijo: la raíz del área mientras haya una abierta y, si no, la carpeta del archivo Markdown. Ningún `../` lleva más allá. Formatos admitidos: PNG, JPG/JPEG, GIF, WebP, SVG, BMP.

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
