# División de documentos grandes

Los documentos muy grandes se dividen en varios archivos al guardarlos y se vuelven a unir en un único documento al abrirlos. En la pestaña trabajas como siempre: ves un texto continuo, deshacer funciona a través de los límites y la búsqueda encuentra el documento como un todo.

El motivo es la manejabilidad. Un documento que supera cierto tamaño hace lento el cambio al modo de edición. La división mantiene manejable cada archivo sin imponerte un límite de tamaño.

## Cuándo se divide

La división ocurre al **guardar**, en cuanto el documento supera aproximadamente un megabyte. La visualización y la lectura nunca se ven afectadas.

La primera división de un documento se anuncia. Puedes rechazarla: entonces el archivo permanece sin dividir y la pestaña queda en solo lectura hasta que la vuelvas a abrir. Una vez creadas las partes, las siguientes se añaden sin preguntar.

Si el guardado automático se ejecuta en segundo plano, no se divide nada sin preguntar. La pestaña simplemente queda modificada hasta que guardes una vez de forma manual y respondas a la pregunta.

## Dónde se corta

El corte se realiza únicamente antes de un **encabezado de los dos primeros niveles**, es decir, antes de una línea que empieza con una o dos almohadillas:

```markdown
# Primer capítulo

Texto …

## Una sección
```

Así ninguna construcción cruza jamás un límite: ningún bloque de código, tabla, lista ni aviso queda partido. Los encabezados dentro de un bloque de código o de una cita no cuentan como punto de corte.

**Si no existe ningún encabezado de este tipo, no se divide nada.** Un documento muy grande sin encabezados sigue siendo un único archivo; la barra de estado te dice una vez por qué. El precio es deliberado: cortar en un punto cualquiera caería en medio de un texto que forma una unidad.

## Cómo se llaman las partes

El primer archivo conserva el nombre del documento sin cambios. Las partes siguientes llevan el mismo nombre con un añadido:

```text
Diario de viaje.md
Diario de viaje•part-00002.md
Diario de viaje•part-00003.md
```

El separador es la **viñeta** `•`. Es deliberadamente distinto al de las [subpáginas](subpages.md), que usan la barra de división `∕`: una parte no es una subpágina, y ambas deben distinguirse a simple vista.

Cada archivo de parte es un archivo Markdown corriente y legible por sí mismo. En su cabecera hay una línea técnica que registra su pertenencia y su posición:

```yaml
doc-part: v1|2|Diario de viaje
```

Esta línea es la información vinculante sobre qué pertenece a qué, no el nombre del archivo. Si mueves un archivo de parte a otra carpeta, el documento ya no lo encontrará.

## Qué ves de esto en el programa

Poco, y esa es la intención:

- **La pestaña y el editor** muestran un documento continuo.
- **La lista de archivos del área** muestra solo el documento, no sus partes.
- **La búsqueda** informa de un resultado de una parte posterior como resultado del documento; el salto lo abre en ese punto.
- **El renombrado** se lleva todas las partes.
- **La cabecera del primer archivo** lleva la línea de pertenencia. Es el rastro visible de la división y aparece también en las propiedades.

En el gestor de archivos de tu sistema sigues viendo las partes: son archivos reales en tu carpeta.

## Cuando falta una parte

Si al abrir falta una parte, porque se ha borrado, movido o aún no se ha sincronizado, el documento se abre **en solo lectura** e indica la posición que falta. Guardar queda bloqueado mientras exista el hueco: escribir desde el texto incompleto perdería definitivamente la parte ausente.

Hay dos salidas. Vuelve a colocar el archivo que falta y el documento estará completo y editable la próxima vez que lo abras, sin que tengas que restablecer nada. O elimina el archivo complementario `.mdd` del documento si quieres continuar sin esa parte: en él está la lista de partes que hace visible el hueco.

Si una parte se ha **modificado** fuera de la aplicación, al guardar se informa de un conflicto y no se sobrescribe nada.

## Reunir las partes

La entrada de menú **Archivo → Más funciones de archivo → Reunir las partes…** convierte las partes de nuevo en un único archivo y elimina los archivos de parte. Esto ocurre solo a petición, nunca por sí mismo.

Si el documento reunido supera el umbral, el comando avisa de antemano: el próximo guardado lo volvería a dividir de inmediato. No se pierde contenido, pero el comando no tendría efecto duradero.

Si falta una parte, el comando se niega a ejecutarse: eliminaría las partes restantes y haría definitiva la pérdida.
