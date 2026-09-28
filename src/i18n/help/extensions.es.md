# Extensiones

Muchas funciones de la aplicación son extensiones integradas y pueden activarse o desactivarse individualmente. El núcleo — editor, pestañas y ventanas, gestión de archivos, modos de vista, marco de la barra lateral, configuración, manual, tema, idiomas y el renderizado base CommonMark — no es desactivable a propósito; la aplicación permanece así siempre operativa.

## Activar y desactivar

La sección Extensiones de la configuración (Archivo → Configuración → Extensiones) lista todas las extensiones integradas en tres categorías:

- **Renderizado** — construcciones Markdown como callouts, notas al pie, resaltado, tipografía, tablas Perspective, fórmulas KaTeX, diagramas Mermaid o resaltado de sintaxis.
- **Conexiones** — enlaces wiki, incrustaciones wiki, etiquetas y autocompletado.
- **Herramientas** — linter de Markdown, marcadores, modo de enfoque con desplazamiento de máquina de escribir, estadísticas de palabras y botón de copiar código.

Cada fila muestra un nombre y una breve descripción. Los cambios surten efecto con Aplicar u OK: de inmediato, sin reiniciar y en todas las ventanas.

## Modos de trabajo

Encima de la lista de interruptores está la sección Modo de trabajo. Un modo de trabajo ajusta en bloque los interruptores de las extensiones integradas: una sola decisión en lugar de muchas decisiones sueltas. Hay tres modos fijos a elegir, y están anidados: lo que contiene el menor lo contiene también el mayor.

- **Principiante** — escribir y enlazar. Se incluyen el repertorio habitual de Markdown (entre otros callouts, notas al pie, resaltado, tipografía, emoji, imágenes con tamaño, tablas Perspective y resaltado de sintaxis), las conexiones mediante enlaces wiki, etiquetas y autocompletado, además de las herramientas de la escritura diaria: listas de tareas, plantillas, marcadores, corrección ortográfica, barra de formato, editor de tablas, línea de título, selector de fecha, estadísticas de palabras, modo de enfoque y el área de demostración.
- **Avanzado** — todo eso y, además, organizar y planificar: libros, diarios, perfiles de propiedades, recordatorios, eventos, vista de grafo, mapa mental, esquema, espacios de trabajo, grupos de pestañas, reloj, fórmulas y diagramas, así como las construcciones Markdown menos frecuentes como contenedores personalizados, listas de definiciones, abreviaturas, spoilers, comentarios, numeración de títulos y estados de tarea ampliados.
- **Completo** — todas las extensiones integradas, es decir, además lienzos canvas, base de datos, Perspective Datatable, cálculo en línea, Critic Markup, bloques de líneas, atributos de título, sistemas de calendario propios, idioma de interfaz propio, My Extended Memory, botones propios de la barra de estado y el intercambio de la configuración propia.

Como cualquier otro cambio de esta página, la elección surte efecto con Aplicar o Aceptar; a partir de ahí, de inmediato, sin reiniciar y en todas las ventanas abiertas.

**Un modo es un punto de partida, no un candado.** Tras el cambio, cada interruptor sigue siendo ajustable como antes, y ningún modo quita algo que no se pueda volver a activar. Debajo de los tres botones se indica qué modo coincide con el estado actual de los interruptores; si no coincide con ninguno porque algunos están puestos de otro modo, allí pone **Personalizado**. El nombre del modo describe así el estado en lugar de fijarlo, y en cuanto el estado vuelve a coincidir exactamente con un modo, este aparece de nuevo como activo.

La protección de dependencias se aplica sin cambios: ningún modo crea un estado que la desactivación de una extensión suelta prohibiría.

### El primer arranque

Una instalación nueva arranca en el modo Principiante. La elección se ofrece allí donde la aplicación se ve por primera vez: la visita guiada, que se inicia por sí sola en el primerísimo arranque, lleva para ello una estación propia con los tres modos. Principiante está preseleccionado allí, y un clic surte efecto de inmediato: no hace falta ni terminar la visita ni recargar una ventana. Quien se salte la estación o interrumpa la visita permanece en el modo Principiante.

Una instalación existente conserva el estado de sus interruptores: allí la visita no se inicia al arrancar y el conjunto de funciones no cambia. Si más tarde se llama a la visita a mano, la estación muestra el estado realmente vigente y no restablece nada sin preguntar.

### Modos propios

Debajo de los tres modos fijos, el estado actual de los interruptores se puede guardar con un nombre propio: «Guardar el estado actual como modo…» pregunta por el nombre. El número de modos propios no está limitado.

Cada modo propio lleva cuatro operaciones: un clic sobre su nombre lo **aplica**, **Renombrar** le da otro nombre, **Sobrescribir** lo fija al estado actual de los interruptores, **Eliminar** lo quita. Renombrar y eliminar no cambian el estado vigente. Los tres modos fijos quedan al margen: no se pueden sobrescribir, ni renombrar, ni eliminar.

Si un nombre ya está en uso, llega una pregunta en lugar de una sobrescritura silenciosa; un nombre vacío se rechaza. Un modo guardado retiene el estado del momento: cambiar después interruptores sueltos no cambia el modo; para eso está Sobrescribir.

**Un modo guardado registra qué extensiones están desactivadas.** Por eso sobrevive a altas y bajas: una extensión que ya no existe se omite al aplicarlo; una que se añadió después de guardarlo y no figura en el modo permanece activada.

Los modos propios valen en todas las áreas y viajan con la configuración propia — véase [Exportar e importar la configuración](setup-exchange.md).

## Efecto del estado desactivado

- **Extensiones de renderizado:** la sintaxis se muestra como texto sin formato o Markdown estándar. `==resaltado==` queda por ejemplo como texto visible, y un bloque Mermaid se convierte en un bloque de código normal.
- **Paneles y accesos:** los paneles laterales, botones de la barra de estado, entradas de menú y atajos asociados desaparecen; no quedan controles muertos.
- **Secciones de configuración:** si una extensión aporta su propia sección de configuración (por ejemplo los estados de tareas), esta solo aparece en la navegación mientras la extensión está activa.

## Dependencias

Algunas extensiones se apoyan en otras: las incrustaciones wiki y los vínculos entre áreas necesitan los enlaces wiki, los recordatorios necesitan las tareas, los eventos y la base de datos necesitan los perfiles de propiedades. Mientras una extensión dependiente esté activada, su base no se puede desactivar: el interruptor de la base queda bloqueado y, bajo su descripción, aparece «No se puede desactivar — necesario para:» con los nombres de las dependientes; varias de ellas aparecen juntas en una sola frase. Un clic en la fila bloqueada muestra brevemente la misma indicación en la barra de estado y no cambia nada en el interruptor. Quien quiera desactivar la base, desactiva primero sus dependientes; después su interruptor queda libre.

Solo se bloquea allí donde la extensión dependiente ya no puede trabajar sin su base. Cuando desactivar una extensión solo empobrece a otra — desaparece un control, no llega una sugerencia, una comprobación calla, mientras la extensión sigue funcionando por lo demás —, el interruptor permanece libre.

Si una configuración importada de otro lugar trae una base desactivada mientras una extensión dependiente está activada, ese estado permanece tal cual: la dependiente no surte efecto y muestra la indicación «Desactivado por dependencia»; conserva su propio interruptor y vuelve a surtir efecto en cuanto la base se activa.

## Los datos se conservan

Desactivar no borra nada: el árbol de marcadores, las definiciones de estados de tareas, la visibilidad de los paneles, los atajos propios y el resto de la configuración permanecen guardados y regresan al activar.

## Extensiones externas

Además de las extensiones internas, la aplicación también carga paquetes de extensión externos creados por ti. Se gestionan en la sección de configuración Extensiones (externas): los paquetes recién detectados están desactivados, la activación requiere una confirmación explícita en el diálogo de advertencia (el código de terceros obtiene acceso completo a los documentos y a la aplicación) y los paquetes defectuosos se desactivan automáticamente. Cómo crear un paquete propio se describe en la página [Crear extensiones](extensions-dev.md).
