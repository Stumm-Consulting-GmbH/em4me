# Subpáginas

Las páginas pueden tener subpáginas a cualquier profundidad, por ejemplo `Proceso-A/Borrador` o `Proceso-A/Implementacion/Detalle`. La jerarquía es una estructura lógica e independiente de las carpetas en las que se encuentran los archivos. Esto también permite subpáginas con el mismo nombre bajo páginas distintas, por ejemplo un `Borrador` para `Proceso-A` y otro para `Proceso-B`.

## Convención de nombres

El nombre del archivo porta la jerarquía: el **separador de subpáginas es `∕` (Unicode U+2215, «barra de división»)**. Parece una barra oblicua, pero está permitido en nombres de archivo de Windows y prácticamente nunca aparece en nombres normales — precisamente eso hace inequívoco que un archivo es una subpágina.

```text
Proceso-A.md                       página
Proceso-A∕Borrador.md              subpágina de Proceso-A
Proceso-A∕Implementacion∕Detalle.md  segundo nivel
```

El carácter nunca hay que teclearlo: las subpáginas nuevas se crean con **Archivo → Nueva subpágina…** (un diálogo pide el nombre; el archivo se crea en la carpeta del archivo activo y se abre como pestaña). Para crear archivos manualmente en el explorador, copie el carácter desde esta página: `∕`

## Enlaces a subpáginas

En los enlaces wiki se escribe siempre la barra normal; la aplicación la traduce al nombre de archivo. Los destinos relativos apuntan a la propia subpágina o a la página padre y funcionan por tanto con independencia del nombre de la página actual:

```markdown
[[Proceso-A/Borrador]]     abre la subpágina Borrador de Proceso-A
[[/Borrador]]              subpágina Borrador de la página ACTUAL
[[..]]                     página padre de la subpágina actual
![[Proceso-A/Borrador]]    incrusta la subpágina
```

La resolución busca primero una ruta de carpeta real (`[[subcarpeta/Archivo]]` sigue siendo un enlace de ruta) y después el archivo de subpágina — en la propia carpeta y en todo el ámbito de búsqueda. Si existen ambos, el [linter de Markdown](tools.md) marca el destino como ambiguo. Tras `[[`, el autocompletado propone subpáginas en notación de barra; tras `[[/`, las subpáginas de la página actual.

## Navegación

Cuando una subpágina está activa, una **ruta de navegación** sobre el documento (vistas lectura, dividida y live) muestra la cadena de páginas padre con niveles clicables; los niveles intermedios inexistentes aparecen subrayados con puntos y no son clicables. La sección lateral **Subpáginas** (Ver → Paneles → Subpáginas, o el icono de subpáginas en la barra de estado) lista las subpáginas directas del archivo activo; un clic las abre.

## Cambiar nombre

**Archivo → Cambiar nombre…** (también en el menú contextual de la pestaña) renombra el archivo activo. Las pestañas abiertas, los marcadores, la lista de archivos recientes y el [archivo acompañante del historial](history.md) se actualizan.

- Renombrar una página **con subpáginas** arrastra todo su árbol de subpáginas; el diálogo indica antes la cantidad.
- Renombrar una **subpágina** cambia solo su propio segmento de nombre; la cadena padre se conserva.
- **Actualizar los enlaces:** La casilla «Actualizar los enlaces en otros archivos» reescribe los enlaces wiki, las incrustaciones y los enlaces Markdown relativos entrantes al nuevo nombre; en la cascada, también las referencias a cada subpágina renombrada. Una segunda casilla muestra de antemano una **vista previa** de los archivos afectados; tras la ejecución, un **informe** resume los archivos renombrados, actualizados y no actualizables. Los valores predeterminados están en Ajustes → Comportamiento → «Enlaces al cambiar el nombre».
- Los documentos abiertos se actualizan; un documento con **cambios sin guardar** recibe la actualización en el editor como un paso de deshacer propio, mientras que en el disco solo se actualiza el último estado guardado.
- Con el [historial del documento](history.md) activado, cada actualización es rastreable como revisión y se puede deshacer; sin historial no hay vuelta atrás.
- En una aplicación de área, la actualización abarca toda el área; sin área, el espacio de búsqueda conocido, y el linter sigue siendo la red para el resto.
