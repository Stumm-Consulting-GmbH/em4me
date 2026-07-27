# Esquemas de color

Un esquema de color define los colores de la aplicación: la interfaz (fondos, texto, acento, barras, pestañas) y el contenido renderizado (encabezados, enlaces, citas, código, tablas). Los colores pasan por una lista seleccionada de ranuras de color con nombre que alimentan los colores del tema. Un esquema está activo por modo; el conmutador claro/oscuro (icono de la barra de estado, Ver → Tema) alterna entre el esquema claro y el oscuro.

## Ranuras y grupos

Una ranura es un color con nombre, no un acceso directo a los detalles internos. Las ranuras se organizan en cinco grupos: Superficies (Fondo, Superficie, Superficie atenuada, Barra de herramientas), Texto (Texto principal, Texto atenuado), Acento y bordes (Acento, Texto sobre acento, Borde, Borde marcado), Pestañas (Barra de pestañas, Pestaña activa) y Contenido (Fondo de código, Color de advertencia). El contenido renderizado sigue las ranuras de superficie: los enlaces llevan el acento, los encabezados el texto principal, la línea de los encabezados y los bordes de tabla el borde, la barra de cita el borde marcado.

## Gestionar esquemas

La gestión de esquemas se abre en Configuración → Esquemas de color.

- **Asignación por modo:** arriba se elige un esquema activo para cada modo (Esquema para claro, Esquema para oscuro).
- **Esquemas incluidos** son de solo lectura y sirven de plantilla: Estándar claro y oscuro, Alto contraste claro y oscuro, Sepia, además de otros cuatro pares con una versión clara y otra oscura cada uno: Azul acero (frío), Verde bosque (verde apagado), Ámbar (cálido) y Grafito (gris neutro).
- **Esquema propio:** «Nuevo desde plantilla» o «Duplicar» crea una copia editable. Un esquema propio se puede renombrar y eliminar; al eliminar el esquema activo, el modo vuelve al esquema predeterminado.
- **Editor de ranuras:** un selector de color por ranura; «Restablecer» restaura el valor de la plantilla. Los cambios surten efecto de inmediato en toda la aplicación (vista previa en vivo) y en las demás ventanas tras aplicar.

El editor siempre edita el esquema activo del modo en el que la aplicación se está ejecutando: en modo claro el esquema claro, en modo oscuro el esquema oscuro. Para ajustar el esquema del otro modo, primero se cambia la aplicación a ese modo mediante el icono de tema en la barra de estado (o Ver → Tema). Así, cada cambio de color surte efecto de inmediato en el modo exacto al que se aplica (vista previa en vivo).

## Contraste y límites

La legibilidad de tus propios esquemas está en tus manos: no hay una comprobación automática del contraste. La vista previa en vivo muestra el efecto de inmediato, y «Restablecer» por ranura devuelve a un valor de la plantilla. Algunos colores quedan a propósito fuera de las ranuras: los colores de los grupos de pestañas y el resaltado de sintaxis de los bloques de código siguen el tema. La exportación PDF permanece clara y toma los colores del esquema claro activo.
