# Exportar e importar la configuración

La instalación propia es trabajo: esquemas de color, atajos de teclado, la ocupación de la barra de formato, botones y macros propios, la disposición de la barra lateral, reglas de plantillas, favoritos. Esa instalación puede **escribirse en un archivo** y **volver a leerse** en otro sitio: en un segundo equipo, tras una reinstalación o como copia de seguridad antes de una remodelación mayor. Ambos caminos están en el menú Archivo → Configuración: «Exportar…» e «Importar…». La función pertenece a la extensión «Exportación e importación de la configuración»; en el estado desactivado, el submenú desaparece.

Un tercer caso de uso figura junto a ellos en igualdad de condiciones y nada tiene que ver con la copia de seguridad: la **transmisión de un solo [sistema de calendario](custom-calendars.md)** de un [área](apps-windows.md) a otra.

## Exportar

«Archivo → Configuración → Exportar…» abre una selección. Lleva una fila por tipo de datos, con su nombre y el número de sus entradas; solo se ofrece lo que realmente contiene algo. Todo viene marcado de antemano: el caso más frecuente es la copia de seguridad completa. Quien quiera llevarse menos desmarca de forma selectiva; sin ninguna selección no se crea archivo alguno, y la selección queda abierta con una indicación.

A continuación, el diálogo de guardado habitual pregunta por la ubicación y el nombre. Se propone un nombre expresivo con la fecha del día.

Estos tipos de datos están a elección:

| Tipo de datos | Contenido |
|---|---|
| Ajustes | Comportamiento y presentación: idioma, apariencia, opciones de editor y de vista, guardado automático, historial, adjuntos, opciones de exportación, la configuración de tareas, recordatorios y visualización del calendario, así como las preferencias de columnas de los paneles |
| Esquemas de color | los esquemas creados por uno mismo, junto con la asignación de cuál rige en el modo claro y cuál en el oscuro |
| Atajos de teclado | las reasignaciones propias de los comandos |
| Barra de formato | la ocupación propia de la barra de botones |
| Botones de la barra de estado y macros | los accesos propios en la barra de estado, la sección del menú contextual, la lista de elementos ocultos y las macros construidas por uno mismo |
| Estado de las extensiones | qué extensiones están activadas y cuáles desactivadas |
| Disposición de la barra lateral | elección de paneles, orden, grupos de pestañas y anchuras, junto con las variantes de disposición propias |
| Carpeta y reglas de plantillas | la carpeta de plantillas y la cadena ordenada de las reglas de carpeta |
| Favoritos | el árbol de los marcadores generales, con carpetas y entradas |
| Sistemas de calendario del área | los bloques de cronologías del área abierta |

### Elegir un solo sistema de calendario

Los sistemas de calendario son la única excepción de esta lista: no pertenecen a la aplicación, sino al área abierta, y por eso viajan de todos modos con su carpeta. Están aquí porque su **transmisión** es un fin propio: quien ha construido un sistema de calendario debe poder dárselo a otra área sin que allí se reconstruya.

Por eso esta fila tiene dos niveles: bajo el tipo de datos figura **una fila propia por bloque**, con su nombre y el número de sus cronologías, cada una con su propia casilla. Así, el mismo camino sostiene ambos casos: todos los bloques para la copia de seguridad, uno solo para la transmisión. El interruptor del tipo de datos dice «todo» o «nada» y conmuta sus bloques con él; si solo se eligen algunos, muestra un estado indeterminado.

Lo que se elige es el **bloque**, no la cronología aislada. La razón está en el modelo: las cronologías de un mismo bloque pueden ponerse en correspondencia, y una cronología derivada se apoya en otra de **su** bloque. Una cronología extraída por separado rompería ese vínculo; un bloque entero se la lleva intacta.

Sin un área abierta, el tipo de datos no aparece siquiera: entonces no hay ninguno.

## Lo que nunca va con ello

Solo se emite lo que pertenece a los tipos de datos de arriba. Todo lo demás se queda, y no por descuido, sino como garantía:

- **Los secretos de acceso de cualquier clase nunca van con ello.** El espacio de almacenamiento en el que una extensión externa guarda sus propios datos está excluido de la exportación en su conjunto, incluso cuando nadie sabe qué hay dentro. Precisamente porque la aplicación no conoce ese contenido, no se transmite. Su estado de activación, es decir, si una extensión está activada o desactivada, sí va con ello; eso es instalación y no un secreto.
- **El estado de la sesión**, como las pestañas abiertas, el tamaño y la posición de las ventanas, así como las listas de elementos recientes. Llevan rutas absolutas del equipo de origen, que en otro sitio no llevan a ninguna parte.
- **Los datos ligados a la máquina**, como los espacios de trabajo y las áreas configurados con sus rutas, las introducciones ya vistas y la decisión de confiar o no en una determinada extensión externa en este equipo. Esa decisión debe tomarse por equipo; llevársela significaría anticiparla en otro lugar.
- **Los estados en curso**, como la alarma, el temporizador y el cronómetro.

Tampoco del archivo mismo cabe deducir persona alguna: su encabezado nombra el programa y su versión, no al usuario ni al equipo.

## El archivo

El archivo de intercambio es un **archivo Markdown** corriente. Es intencionado: se puede abrir en esta aplicación, leer en cualquier editor, comparar y versionar. Su encabezado nombra la versión del formato, el momento de la emisión y la procedencia; debajo sigue, por tipo de datos, una sección propia con un encabezado y un bloque de código cuyo contenido lleva los valores.

````text
---
em4me: "setup"
formatVersion: 1
created: "2026-09-09T10:43:12Z"
origin:
  program: "EM4me"
  version: "…"
---

## Esquemas de color

```json em4me:colorSchemes
{ … }
```
````

El campo `em4me` identifica el archivo como archivo de configuración de esta aplicación y protege de que al leerlo se elija por descuido un archivo Markdown cualquiera. La indicación que sigue a la marca en el bloque de código —aquí `em4me:colorSchemes`— nombra el tipo de datos de la sección. Los encabezados de encima están ahí para el lector; el tipo de datos se lee de la marca.

## Importar

«Archivo → Configuración → Importar…» pregunta por el archivo. El diálogo no está ligado a un área abierta: un archivo de configuración está típicamente justo fuera, en una memoria o en la carpeta de descargas.

**No se escribe de inmediato.** Primero aparece una **vista previa** que indica, por tipo de datos, qué ocurriría: qué se añade, qué se reemplaza, qué se renombra y qué se omite. Solo «Aplicar» lo ejecuta; después, un informe muestra la misma lista como resultado. En la vista previa está además el botón «Guardar el estado actual…», que escribe el estado actual de los tipos de datos afectados en un archivo propio antes de que se modifique nada.

Nada se pasa por alto en silencio: cada desviación del caso sencillo figura en la vista previa y en el informe.

### Qué ocurre con los valores existentes

Rige **una sola** regla para todos los tipos de datos:

> Se añade lo que usted ha creado como objeto con nombre. Se reemplaza lo que es un ajuste o una disposición.

Por eso se añaden los esquemas de color propios, las macros, las variantes de disposición de la barra lateral, los marcadores y los bloques de calendario: se colocan **junto** a lo existente, y el fondo presente no se toca al hacerlo. Se reemplazan los ajustes, la asignación de los atajos de teclado, la barra de formato, las reglas de plantillas y el estado de las extensiones: un valor no conoce el plural, y dos disposiciones entrelazadas darían una tercera que nadie ha configurado.

**Con el mismo nombre, la entrada existente queda inalterada**, y la leída llega a su lado con un añadido distintivo: «Muestra» se convierte en «Muestra (2)». La vista previa nombra cada uno de esos cambios de nombre. Las referencias se ajustan con ello: una macro leída que recibe un identificador nuevo sigue siendo encontrada por su botón.

Dos casos especiales se derivan del objeto: un marcador a un archivo ya recordado se omite en lugar de crearse por duplicado; una carpeta de marcadores, en cambio, viene siempre como un todo, porque es su trabajo de ordenación. Y un bloque de calendario cuya definición está incompleta se rechaza y se nombra, en lugar de crear media entrada.

Una parte de los ajustes solo surte efecto tras reiniciar la aplicación; la vista previa lo dice cuando es así.

### Archivos de otra versión del programa

Un archivo de una versión **anterior** se lee. Justo para eso está pensado este camino: una copia de seguridad que ya no pudiera leerse tras la siguiente actualización del programa erraría su propósito. Los tipos de datos que entretanto ya no existen aparecen como omitidos: se informan, no se callan.

Un archivo de una versión **más reciente** también se lee, con una indicación: lo que esta versión no conoce se omite y se nombra. Lo mismo rige dentro de un tipo de datos conocido cuya estructura ha cambiado: lo que no encaja en la forma esperada se descarta y se enumera en la vista previa, en lugar de dejar entrar una estructura ajena en la configuración.

Si el archivo está dañado o no es en absoluto un archivo de configuración, la aplicación lo dice y no escribe nada.

## Transmitir un sistema de calendario

El camino en su conjunto, a modo de ejemplo:

1. En el **área de origen**, elegir «Archivo → Configuración → Exportar…».
2. Quitar todas las marcas salvo la del bloque de calendario deseado y guardar el archivo.
3. Abrir el **área de destino** y elegir allí «Archivo → Configuración → Importar…».
4. Elegir el archivo, leer la vista previa, aplicar.

El bloque figura después en el área de destino junto a lo que allí ya había, y sus cronologías pueden usarse de inmediato en el documento. Si lleva el nombre de un bloque existente —el caso normal cuando el mismo sistema ya llegó allí una vez—, el existente permanece y el nuevo aparece con su añadido.

Se escribe siempre en el área que está abierta en ese momento. Si no hay ninguna abierta, el tipo de datos se omite y se indica el motivo.
