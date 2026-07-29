# Adjuntos

Un adjunto es un archivo que pertenece a un documento: una captura de pantalla, un informe, una hoja de cálculo. Pegarlo o arrastrarlo al documento evita guardarlo y enlazarlo a mano. El archivo se guarda y en el texto aparece la referencia correspondiente.

## Pegar un adjunto

Un archivo o una imagen del portapapeles se inserta con `Ctrl+V`. El archivo se guarda en la ubicación configurada y la referencia aparece en el cursor.

Una imagen se convierte en una referencia de imagen; cualquier otro archivo, en un enlace normal:

```markdown
![Acta_20260729-143022](Acta/Acta_20260729-143022.png)
[Informe](Acta/Informe.pdf)
```

`Ctrl+Mayús+V` sigue siendo un pegado simple y no guarda nada.

## Arrastrar un adjunto

Un archivo también puede arrastrarse desde el gestor de archivos. El lugar donde se suelta decide el resultado:

| Lugar donde se suelta | Resultado |
|---|---|
| Área del editor | Adjunto, referencia en la posición del puntero |
| Vista renderizada | Adjunto, referencia al final del documento |
| Barra de pestañas, panel lateral, ventana vacía | El archivo se abre |

Durante el arrastre, la superposición indica cuál de los dos resultados se aplica. Así también se puede adjuntar deliberadamente un archivo Markdown en lugar de abrirlo.

Varios archivos arrastrados a la vez producen varias referencias. Pegar o arrastrar cuenta como **un** paso: `Ctrl+Z` retira la referencia. El archivo guardado permanece y puede borrarse desde el gestor de archivos si hace falta.

## Dónde se guarda el archivo

La ubicación se define en Configuración → Adjuntos y además puede fijarse por área (Configuración → Área actual → Adjuntos).

| Ubicación | Dónde va el archivo |
|---|---|
| Carpeta con el nombre del documento | a una subcarpeta con el nombre del documento (predeterminado) |
| Subcarpeta fija | a una subcarpeta con el nombre configurado |
| Junto al documento | a la misma carpeta que el documento |
| Carpeta central del área | a una carpeta directamente en la raíz del área |

La carpeta central solo se ofrece con un área abierta, ya que de otro modo no tendría punto de referencia. El nombre de la carpeta vale para las dos formas que lo necesitan; es un nombre simple, sin segmentos de ruta.

Un nombre de archivo ya existente nunca se sobrescribe. En su lugar, el archivo nuevo recibe un contador, por ejemplo `Imagen-2.png` junto a `Imagen.png`. Los adjuntos sin nombre propio, como una captura del portapapeles, se nombran según el documento y el momento.

Un documento que nunca se ha guardado no ofrece ningún lugar para un adjunto. En ese caso aparece un aviso en la barra de estado y no se guarda nada.

## Abrir un adjunto

Una referencia a un adjunto lo abre en el programa que le asigna el sistema operativo. En una imagen incrustada, el gesto depende de la vista:

| Vista | Gesto |
|---|---|
| Lectura y vista renderizada | clic simple |
| Edición y vista directa | doble clic |

En el editor, el clic simple queda reservado para situar el cursor; escribir junto a una imagen no debe iniciar otro programa.

Solo se abren destinos dentro del área o, sin área, dentro de la carpeta del documento. En archivos que pueden ejecutar código al abrirse aparece primero una confirmación con el nombre y la ruta completa.

## Adjuntos y límites del área

Con un área abierta, las imágenes de toda el área son visibles, incluso por encima de la carpeta del documento. Eso es lo que hace utilizable la carpeta central de adjuntos. Sin área, el límite sigue siendo la carpeta del documento y sus subcarpetas; véase también la página [Imágenes](images.md).
