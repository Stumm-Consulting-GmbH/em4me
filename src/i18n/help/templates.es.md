# Plantillas

Las plantillas son archivos Markdown corrientes en una **carpeta de plantillas** configurable. Al aplicarlas, la aplicación evalúa **marcadores** seleccionados: fecha y hora con desplazamiento y formato, título y carpeta del archivo de destino, diálogos de entrada y selección, el portapapeles y una posición de destino del cursor. Las plantillas crean archivos nuevos con estructura lista o insertan bloques recurrentes en la posición del cursor; las **reglas de carpeta** rellenan los archivos nuevos automáticamente.

La funcionalidad se puede conmutar como extensión «Plantillas» (Configuración → Extensiones); desactivada, desaparecen los comandos, la sección de configuración y las reglas de carpeta.

## Carpeta de plantillas

La carpeta de plantillas se configura en los ajustes (Configuración → Plantillas):

- **Globalmente**, la carpeta de la aplicación vale para todas las ventanas.
- **Por área** se puede definir una configuración propia («Usar configuración del área» en la entrada «Plantillas» del grupo de navegación «Área actual», visible solo cuando hay un área abierta); se guarda en el archivo del área y **anula por completo la global** (carpeta y reglas, sin resolución mixta). Las carpetas son relativas a la raíz del área; las rutas absolutas siguen permitidas.

Cada archivo Markdown de la carpeta (incluidas las subcarpetas) es una plantilla. Las subcarpetas aparecen como grupos en el popup de selección. Los cambios de configuración surten efecto de inmediato, sin reiniciar.

## Aplicar plantillas

Dos caminos llevan a la plantilla:

- **Nuevo archivo desde plantilla** (menú Archivo): elegir la plantilla en el popup filtrable, asignar un nombre de archivo (`/` crea una subpágina), responder la cadena de diálogos. El archivo nace con el contenido rellenado en la carpeta del archivo activo (sin archivo activo en la raíz del área; sin ninguno de los dos, un diálogo de carpeta pregunta por el destino), se abre como pestaña y el cursor salta al primer destino `{{cursor}}`.
- **Insertar plantilla** (menú contextual del editor → Insertar): el resultado rellenado se inserta en la posición del cursor como un único paso de edición (un deshacer lo elimina todo).

Varios marcadores de entrada y selección aparecen **uno tras otro** en el orden de su primera aparición; las preguntas idénticas se plantean una sola vez. Cancelar cualquier diálogo interrumpe toda la aplicación: no se crea archivo ni texto insertado.

## Referencia de marcadores

Los marcadores se escriben entre llaves dobles. `\{{` escribe un `{{` literal en la plantilla.

| Marcador | Efecto |
| --- | --- |
| `{{date}}` / `{{time}}` | fecha u hora de la aplicación (`2026-07-09` o `14:30`) |
| `{{date:+7d}}` | fecha con desplazamiento; unidades del lenguaje de consulta (`s`, `min`, `h`, `d`, `w`, `mo`, `y`, también combinadas: `1d 12h`), signo opcional |
| `{{date::dd.MM.yyyy}}` | fecha con formato propio; tokens `yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`, `ww`, `kkkk`, `q` (como la función de consulta `dateformat`); desplazamiento y formato combinables: `{{date:+7d:dd.MM.yyyy}}` |
| `{{time:-30min:HH:mm:ss}}` | la hora también acepta desplazamiento y formato |
| `{{title}}` | título del archivo de destino (en subpáginas la forma lógica con `/`) |
| `{{folder}}` | carpeta del archivo de destino (relativa a la raíz dentro de un área) |
| `{{prompt:Pregunta}}` | diálogo de entrada; valor por defecto opcional: `{{prompt:Pregunta:Valor}}` |
| `{{select:Pregunta:a,b,c}}` | diálogo de selección con las opciones `a`, `b`, `c` |
| `{{clipboard}}` | texto actual del portapapeles |
| `{{cursor}}` | posición de destino del cursor tras aplicar; varios destinos numerados con `{{cursor:2}}`, el más bajo es el destino del salto |

Plantilla de ejemplo:

````markdown
# {{title}}

Fecha: {{date}}, próxima cita: {{date:+7d:dd.MM.yyyy}}
Tema: {{prompt:Tema}}
Prioridad: {{select:Prioridad:Alta,Media,Baja}}

## Notas

{{cursor}}
````

Los marcadores desconocidos o los parámetros defectuosos interrumpen la aplicación con un mensaje en la barra de estado; no se crea ningún archivo a medio rellenar.

## Reglas de carpeta

Las reglas de carpeta rellenan los archivos nuevos automáticamente: cada regla asigna una **plantilla** a una **carpeta de destino** (Configuración → Plantillas). Al crear un archivo desde la aplicación (panel del área, nueva subpágina), la plantilla se ejecuta con la evaluación completa de marcadores, diálogos incluidos.

- Gana la **carpeta coincidente más profunda**; las subcarpetas cuentan como coincidencia. Una entrada de carpeta vacía es la regla raíz.
- La **propia carpeta de plantillas queda excluida**: las plantillas nuevas permanecen vacías.
- Si se elige explícitamente «Nuevo archivo desde plantilla», la plantilla elegida tiene prioridad; la regla no se aplica adicionalmente.
- Cancelar un diálogo crea el archivo **vacío** (la creación en sí era deseada) y muestra un aviso.
- Los archivos creados fuera de la aplicación (por ejemplo en el explorador de archivos) no pasan por las reglas.
