# Barra lateral

La barra lateral agrupa los paneles de la app: desde marcadores, índice y área, pasando por propiedades, etiquetas y retroenlaces, hasta calendario, recordatorios y grafo del archivo (la lista completa está en la [tabla de funciones](functions.md)). Cada columna tiene un área de barra lateral a la izquierda y a la derecha del contenido. Qué paneles son visibles se conmuta por columna; la disposición de los paneles (lado, orden, grupos) se aplica a toda la aplicación. En cambio, qué pestaña de un grupo está delante pertenece a cada columna: dos columnas contiguas pueden mostrar paneles distintos del mismo grupo, y las demás ventanas no se ven afectadas.

## Mostrar y ocultar paneles

Cada panel tiene un icono en la barra de estado y una entrada en el submenú Ver → Barra lateral → Paneles (atajos predeterminados en el [resumen de atajos](shortcuts.md)); el conmutador actúa sobre la columna activa. Ambos lugares muestran los mismos paneles en el mismo orden; el orden se puede reordenar libremente en Configuración → Orden de los paneles y afecta a la vez al menú y a la barra de estado. El contenido de los distintos paneles se describe en la [tabla de funciones](functions.md) y en las páginas [Vinculación](linking.md) (etiquetas, retroenlaces, enlaces salientes), [Frontmatter y propiedades](frontmatter.md), [Notas del documento](notes.md) (panel Notas) y [Aplicaciones, ventanas y áreas](apps-windows.md) (panel del área).

## Contraer y expandir columnas

Más allá de los conmutadores de paneles individuales, una columna entera de la barra lateral se puede contraer y expandir de una vez cuando hace falta brevemente un poco más de espacio para el texto. Contraer coloca un estado propio sobre la visibilidad de los paneles sin modificarla; expandir restablece exactamente el estado anterior.

- **Icono de cabecera:** En la cabecera superior de cada columna, en el borde interior, donde la columna se junta con el texto, hay un icono de barra lateral. Un clic contrae la columna. El icono se alinea a la derecha en la columna izquierda y, reflejado, a la izquierda en la columna derecha; aparece tanto en la cabecera de sección como en la barra de pestañas de un grupo, y en la representación en texto y en símbolo de los títulos.
- **Contraída:** Una columna contraída sigue visible como una franja estrecha en el borde de la ventana. Al pasar el ratón por encima aparece el icono; un clic vuelve a expandir la columna. La indicación breve cambia entonces entre contraer y expandir.
- **Menú y comandos:** Ver → Barra lateral → Contraer la barra lateral izquierda y Ver → Barra lateral → Contraer la barra lateral derecha conmutan los mismos estados. Ambos comandos están también en la paleta de comandos y pueden recibir un atajo en Configuración → Atajos de teclado; no hay asignación predeterminada.

En la vista dividida, cada columna del editor conmuta sus dos barras laterales de forma autónoma; contraer solo afecta a esa columna. El último estado definido se guarda de forma global y sigue vigente en el siguiente inicio.

Una columna sin panel visible permanece sin cambios y desaparece por completo como antes, sin franja ni icono. El modo concentración oculta además la barra lateral de forma puramente visual y deja intacto el estado de contracción; al salir de él, ese estado sigue vigente.

## Disposición: lado y orden

Cada panel puede situarse a la izquierda o a la derecha, y el orden es de libre elección. Dos caminos llevan a la disposición deseada:

- **Arrastrar y soltar:** arrastrar el título del panel (en los grupos, la pestaña). El tercio superior o inferior de un panel lo ordena delante o detrás, el centro forma un grupo de pestañas y el área libre de una barra lateral añade el panel allí; en un lado vacío aparece una franja estrecha de destino durante el arrastre. Las zonas de destino se marcan en color; Esc cancela. Los cambios surten efecto de inmediato, también en otras ventanas.
- **Configuración → Barra lateral:** ambos lados como listas con acciones para mover (arriba, abajo, cambiar de lado), agrupar y desagrupar, además de un restablecimiento a la disposición predeterminada. Los cambios surten efecto con Aplicar u OK.

La **disposición predeterminada** reparte los paneles entre ambos lados y los agrupa en grupos de pestañas temáticos: a la izquierda los paneles de entrada, estructura y agenda, a la derecha las notas y los paneles de metadatos y enlaces. Se aplica mientras no se haya definido una disposición propia; «Restablecer la disposición predeterminada» restablece exactamente esta distribución.

## Variantes

La disposición actual se puede guardar como **variante con nombre** — con la visibilidad de los paneles de ambas columnas, es decir, toda la estructura de la barra lateral. Es posible un número ilimitado de variantes, por ejemplo una para el trabajo conceptual y otra para el trabajo diario.

- **Guardar:** Ver → Barra lateral → Disposiciones de la barra lateral → «Guardar la disposición actual…», o el botón del mismo nombre en Configuración → Barra lateral, sección Variantes. El nombre se asigna en el cuadro de diálogo; guardar con un nombre existente actualiza esa variante.
- **Aplicar:** con un clic en el submenú Ver → Barra lateral → Disposiciones de la barra lateral, mediante la ventana de selección del comando «Aplicar variante de barra lateral», o en las listas de variantes de la configuración. Aplicar reemplaza de inmediato la disposición actual; las reorganizaciones posteriores no modifican la variante — «Sobrescribir» traslada explícitamente la disposición actual a una variante existente.
- **Gestionar:** Configuración → Barra lateral, sección Variantes enumera las variantes globales con Aplicar, Renombrar, Sobrescribir y Eliminar.

Las **variantes de área** pertenecen a un área: se encuentran en el archivo del área, se desplazan con la carpeta del área y solo aparecen cuando el área está abierta, separadas en el menú en su propio grupo con el nombre del área. Su gestión, con un botón de guardado propio, se encuentra en la sección de configuración «Variantes de barra lateral» del grupo «Área actual»; al guardar mediante el menú o el comando, una opción del cuadro de diálogo elige el destino (global o área). Se permiten nombres iguales en ambos grupos. La entrada «Disposición predeterminada» del submenú restablece en cualquier momento la distribución suministrada.

Las variantes son independientes de los espacios de trabajo: un espacio de trabajo recuerda las ventanas y las pestañas, una variante de barra lateral solo la estructura de la barra lateral.

## Grupos de pestañas

Varios paneles en la misma posición comparten el espacio como grupo de pestañas: una barra de pestañas sustituye a los títulos de los paneles y solo el panel activo es visible. Mostrar un panel agrupado activa su pestaña; la pestaña activa se recuerda.

## Anchuras

Cada lado tiene su propia anchura (180 a 500 píxeles), ajustable en el divisor entre la barra lateral y el contenido. La anchura se aplica por lado a ambas columnas y queda guardada.

## Alturas de los paneles

Cuando varios paneles están apilados en un lado de la barra lateral, un tirador se sitúa entre cada par de paneles. Ajusta la altura del panel situado encima: arrastrar el tirador hacia arriba o hacia abajo con el ratón. Las alturas definidas se guardan y se restablecen al iniciar; un doble clic en el tirador restablece la altura automática.

El panel inferior de un lado no tiene tirador, porque detrás de él no sigue ningún otro. Por eso sigue siempre la altura de su contenido y ocupa el espacio que le dejan los paneles de encima. Allí solo aparece una barra de desplazamiento cuando ese espacio no basta para el contenido.

Si las alturas definidas requieren en conjunto más espacio del que tiene el lado, toda la columna se puede desplazar verticalmente. Con ello no desaparece ningún panel: cada uno conserva al menos su cabecera y los inferiores son accesibles desplazándose. Para recuperar el estado anterior, reducir el panel agrandado en exceso o devolverle la altura automática con un doble clic en su tirador.

## Altura por panel o por grupo

De qué depende la altura de un bloque se puede elegir (Ajustes → Barra lateral).

Con **Altura por panel**, cada panel conserva su propia altura. En un grupo de pestañas rige la altura del panel mostrado; al recorrerlo cambia por tanto la altura del bloque y los paneles inferiores se desplazan con él. Es la opción predeterminada.

Con **Altura fija por grupo**, un grupo de pestañas conserva su altura al cambiar de pestaña. Todos los paneles del grupo aparecen con la misma altura y lo que hay debajo permanece en su sitio. El tirador situado bajo el grupo ajusta entonces su altura común; un doble clic restablece la altura automática de todo el grupo.

Los paneles aislados se comportan igual en ambos casos. Las alturas de ambos ajustes se recuerdan por separado: al volver atrás se encuentran sin cambios las alturas de panel anteriores.

## Títulos como símbolo

Los títulos de los paneles pueden cambiarse de texto al símbolo del panel correspondiente (Ajustes → Barra lateral). El cambio afecta por igual a las cabeceras de sección y a las pestañas de paneles agrupados; el nombre del panel sigue disponible como indicación breve y para lectores de pantalla. Como la disposición, el conmutador surte efecto con Aplicar u OK.
