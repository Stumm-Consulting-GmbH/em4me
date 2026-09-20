# My Extended Memory

Quien trabaja un tiempo con esta aplicación va acumulando contenedores: [áreas](apps-windows.md) para los proyectos, [libros](books.md) para textos largos, estanterías para colecciones enteras, además de los [espacios de trabajo](apps-windows.md) que haya configurado. Están repartidos por el disco, en memorias USB y en unidades de red, y ninguna vista de la aplicación los muestra juntos: cada vista se refiere a lo que está abierto en ese momento.

**My Extended Memory es esa vista común.** La página se abre con «Ver → My Extended Memory» o desde la paleta de comandos, en una pestaña propia; no es modificable. En cuatro secciones — espacios de trabajo, áreas, libros, estanterías — cada contenedor ocupa una fila con su nombre, su ubicación y unas pocas cifras clave.

## Qué muestra la página — y qué no hace

**La página muestra lo que usted mismo ha añadido.** No explora ninguna unidad, no encuentra nada por sí sola y no pretende ser exhaustiva. Un área que nunca haya añadido no aparece aquí, aunque ayer trabajara en ella.

Es intencionado y no es una carencia. Una búsqueda por todas las unidades conectadas tardaría mucho, encontraría de paso carpetas que no incumben a nadie y dependería de qué unidades estén conectadas en ese instante. La lista que usted mismo mantiene es, en cambio, corta, fiable y su propio orden. La nota en la parte superior de la página lo dice de forma permanente, incluso cuando la lista ya está bien llena.

## Añadir un contenedor

«Añadir contenedor…» despliega un bloque de propuestas.

**Se proponen los contenedores abiertos más recientemente** — áreas, libros y estanterías de las listas de elementos recientes — **y los espacios de trabajo configurados**, agrupados por tipo. Lo que ya está en la lista deja de aparecer entre las propuestas. «Añadir» junto a una propuesta la incorpora.

**«Elegir carpeta…» es el camino completo** y está siempre disponible, incluso cuando no hay nada que proponer. El diálogo de carpetas habitual pregunta por la carpeta del contenedor; el tipo lo determina la propia aplicación, en el orden **estantería, libro, área**: si la carpeta lleva el archivo complementario de una estantería, es una estantería; si lleva el de un libro, es un libro; en caso contrario, es un área.

Tres casos llevan a un mensaje en lugar de a una entrada:

- La carpeta **no está accesible en este momento**: una memoria USB retirada, una unidad de red no conectada. Solo se añade lo que es legible en el momento de añadirlo; de otro modo no se puede determinar el tipo.
- La ruta elegida apunta a un **archivo** y no a una carpeta.
- El contenedor **ya está** en la lista. No se crea una segunda entrada para la misma carpeta.

## Eliminar una entrada

«Eliminar» saca la fila de la lista — **y nada más**. La carpeta, sus archivos y sus archivos complementarios quedan intactos; un espacio de trabajo sigue igualmente configurado. Lo que se elimina es la entrada, no el contenedor. Puede volver a añadirlo en cualquier momento.

## Las cifras clave

Cada fila lleva una marca de tiempo y una breve selección: en un área el número de archivos Markdown, en un libro el número de capítulos, en una estantería el número de libros, y en cada caso el almacenamiento ocupado.

**Las cifras no se mantienen al día de forma continua.** Se recopilan al añadir el contenedor y después solo cuando usted lo pide: «Volver a recopilar» lee el contenedor de nuevo y fija una nueva marca de tiempo. Por eso la marca figura en cada fila: dice a qué momento se refieren las cifras. Quien haya trabajado una semana en un área ve aquí primero las cifras de la semana anterior; un clic las pone al día de hoy.

Un **espacio de trabajo** no tiene cifras clave ni botón de recopilación: no es una carpeta, sino una composición. Lo que compone figura en su fila y en la vista de detalle: los contenedores a los que está vinculado, el número de sus ventanas y el número de **documentos abiertos** en ellas.

**Se cuentan documentos abiertos, no archivos de una carpeta.** La cifra dice cuántos documentos Markdown tiene abiertos el espacio de trabajo en sus ventanas; se cuenta por ventana. Las pestañas sin título, las páginas del manual y del sistema y los demás tipos de archivo no cuentan. Ambas cifras proceden del registro del espacio de trabajo y por eso figuran igual para uno cerrado que para uno abierto; un cero es ahí un cero contado como cualquier otro.

### Un contenedor que ahora no está accesible

**Permanece en la lista**, con la marca «no accesible» y con las últimas cifras conocidas junto con su marca de tiempo antigua. Una memoria USB guardada en el cajón no es motivo para perder la entrada: las cifras de entonces siguen siendo la información de la que dispone. «Abrir» y «Volver a recopilar» no tienen efecto en esa fila y por eso aparecen atenuados; «Detalles» y «Eliminar» siguen funcionando.

### Un área que no está abierta

En ella tres cifras clave quedan vacías: **etiquetas, tareas y archivos sin enlace entrante**. No proceden de contar archivos, sino del índice que la aplicación construye para un área abierta, y ese índice solo existe mientras el área está abierta. La fila lo dice con la nota «sin las cifras del índice; abra el área y vuelva a recopilar».

Para esta página **no** se construye un índice a propósito. Eso costaría un recorrido completo por cada área añadida y convertiría una vista de conjunto en un cálculo. Abra el área y vuelva a recopilar después: entonces están todas las cifras.

## La vista de detalle

«Detalles» despliega bajo la fila una tabla que muestra lo que cada contenedor puede ofrecer:

| Tipo | Cifras clave |
|---|---|
| Área | archivos Markdown, otros archivos, carpetas, almacenamiento ocupado, etiquetas, tareas, archivos sin enlace entrante |
| Libro | capítulos, archivos Markdown, almacenamiento ocupado, estantería a la que pertenece |
| Estantería | libros, de ellos no encontrados, archivos Markdown, almacenamiento ocupado |
| Espacio de trabajo | área, libro, estantería, ventanas, documentos abiertos, último uso |

**Dos clases de vacío, dos signos.** «no disponible» significa: nadie ha recopilado esa cifra — las etiquetas de un área no abierta, por ejemplo. La raya significa: aquí esa cosa no existe en absoluto — el libro de un espacio de trabajo que no lleva ninguno, por ejemplo. **Un cero nunca sustituye a ninguno de los dos**; siempre es un cero contado, y un área sin subcarpetas lo muestra con razón.

En un **libro**, la fila «Estantería» nombra únicamente una estantería que esté a su vez añadida. Si el libro se encuentra en una estantería que no figura aquí, la tabla dice que no está asignado a ninguna estantería de la lista, en lugar de afirmar una pertenencia que esta página no conoce.

### Abrir, y el camino hacia las estadísticas del área

**«Abrir» en la fila** abre el contenedor por la vía habitual: área, libro y estantería según las reglas usuales, el espacio de trabajo como cambio a él. La vista de detalle no tiene un segundo botón de apertura; el de la fila está justo encima.

**En un área se añade «Abrir las estadísticas del área».** Las [estadísticas del área](apps-windows.md) detalladas se refieren siempre al área de **esta** ventana, de modo que el área tiene que ser primero la abierta. Si ya lo es, las estadísticas se abren enseguida. Si no, el área se abre, y dónde acabe depende de lo que esté en marcha: si esta ventana la asume, las estadísticas siguen aquí. Si va a parar a otra ventana — porque allí ya se ejecuta una aplicación de área o porque surge una ventana nueva —, un aviso lo dice con exactitud: las estadísticas del área están allí en el menú Ver. Un salto aquí mostraría, si no, las cifras de un área ajena.

## Exportar e importar la configuración propia

En la parte superior de la página están «Exportar la configuración…» e «Importar la configuración…». Llevan al mismo camino que «Archivo → Configuración → Exportar…» e «Importar…»; todo lo demás — la elección de los tipos de datos, la vista previa, el informe — está en la página [Exportar e importar la configuración](setup-exchange.md).

El acceso está aquí porque ambos atienden la misma pregunta: ¿qué me he configurado y cómo me lo llevo? Si la extensión «Exportación e importación de la configuración» está desactivada, el bloque desaparece.

**La lista de contenedores añadidos nunca se lleva consigo.** Se compone de rutas absolutas de este equipo, que en otro no llevan a ninguna parte; como los espacios de trabajo configurados y las listas de elementos recientes, pertenece a lo que queda ligado a la máquina.

## Desactivar

La función se puede desactivar como [extensión](extensions.md) «My Extended Memory». En el estado desactivado desaparecen la entrada de menú y el comando de la paleta; una pestaña ya abierta permanece hasta que usted la cierre.

**La lista añadida se conserva.** La desactivación retira el acceso, no los datos: tras volver a activarla, la lista está de nuevo ahí sin cambios, con todas sus entradas y sus cifras recopiladas por última vez.
