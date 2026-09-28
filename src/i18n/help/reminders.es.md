# Recordatorios

Un recordatorio se avisa en un momento que usted elige y vuelve a poner una tarea a la vista. Cuelga del marcador de recordatorio ⏰ de una línea de tarea y se distingue así del vencimiento 📅: el vencimiento indica la fecha real (cuándo algo debe estar terminado), el marcador de recordatorio indica el momento de aviso (cuándo la aplicación lo recuerda). Los recordatorios son una extensión activable y se apoyan en las [listas de tareas](tasks.md).

## Marcador y vías de entrada

Como los demás marcadores de tarea, el marcador se coloca al final de la línea:

```
⏰ AAAA-MM-DD [HH:MM]
```

La parte de hora es opcional. En su ausencia, el recordatorio se avisa a la hora predeterminada configurada (véase Configuración).

```markdown
- [ ] Presentar la declaración ⏰ 2099-04-14
- [ ] Devolver la llamada al cliente ⏰ 2099-04-14 09:30
```

- [ ] Presentar la declaración ⏰ 2099-04-14
- [ ] Devolver la llamada al cliente ⏰ 2099-04-14 09:30

Hay varias vías para la entrada:

- **Comando «Establecer recordatorio»** (predeterminado `Ctrl+Alt+R`): en una línea de tarea abre el selector de fecha y hora y escribe el marcador.
- **Autocompletado**: en una línea de tarea la entrada «Recordatorio…» propone el marcador y abre el mismo selector.
- **Diálogo de edición de tarea**: la fila de recordatorio del diálogo establece o cambia el marcador junto con los demás campos.
- **Clic en el valor**: un clic en el valor ⏰ o en la insignia ⏰ abre el selector precargado.

## Diálogo de notificación

Cuando un recordatorio vence, un diálogo lo avisa con la descripción de la tarea y un enlace al archivo de origen. Quedan tres vías:

- **Hecho**: avanza la tarea por la cadena de estados configurada. Si la tarea lleva una regla de repetición, se crea la instancia siguiente y el marcador ⏰ pasa a esa instancia con un momento desplazado.
- **Recordar más tarde**: pospone el momento de aviso. Se ofrecen las opciones de posposición configuradas (predeterminado 10 minutos, 1 hora, 4 horas, 1 día, 1 semana) y una elección de fecha libre. El nuevo momento se escribe directamente en el marcador del archivo de origen.
- **Cerrar** (cerrar o Escape): silencia este recordatorio hasta el siguiente inicio de la aplicación. La tarea en sí permanece sin cambios.

**En todas las ventanas.** El diálogo aparece en cada ventana abierta de la aplicación, también en ventanas de otra área, en ventanas sin área y en ventanas de libro y de estantería. Por eso cada entrada indica su origen, por ejemplo «Origen: Proyectos»: el área, el libro o la estantería de donde procede el recordatorio. Hecho, Recordar más tarde y Cerrar actúan siempre sobre el archivo de ese origen, sea cual sea la ventana, y una sola vez: el recordatorio desaparece después de todas las ventanas, y una segunda acción casi simultánea en otra ventana queda sin efecto y sin mensaje de error. Si vencen varios recordatorios, cada ventana los reúne en un solo diálogo. Una ventana abierta más tarde muestra también un recordatorio que sigue pendiente.

**Enlace al archivo de origen.** Un clic en el nombre del archivo abre el archivo en la línea de la tarea, en la ventana de su área. Si la ventana en la que se hizo clic muestra otra área o ninguna, la ventana del área de origen pasa al frente y abre allí el archivo; si esa área no está abierta, se abre. El recordatorio sigue en su sitio: abrir el archivo no cuenta como atenderlo.

## Solo con la aplicación en ejecución

Los recordatorios se avisan **únicamente mientras la aplicación está en ejecución y el área está abierta**. No hay servicio en segundo plano ni aviso con la aplicación cerrada. Si la aplicación no está abierta en el momento de aviso, aun así no se pierde nada: en el siguiente inicio, un **diálogo de recuperación** reúne todos los recordatorios que vencieron entretanto y los muestra juntos, en cada ventana abierta, con las mismas acciones que en el diálogo normal. Fuera de un área abierta no se produce ninguna vigilancia.

Con un área abierta, la aplicación comprueba de forma continua los marcadores de todos los archivos del área (en un ciclo de 30 segundos sobre el índice del área). De forma opcional puede activarse una **notificación del sistema** que aparece además del diálogo cuando ninguna ventana de la aplicación está en primer plano. Aparece una sola vez por aviso, aunque haya varias ventanas abiertas; un clic en ella trae la aplicación al frente. La muestra el sistema operativo: en Linux se encarga el entorno de escritorio, y sin su servicio de notificaciones solo queda el diálogo dentro de la aplicación.

## Lista de recordatorios

Un panel de la barra lateral lista todos los recordatorios del área, agrupados en **Atrasados**, **Hoy**, **Mañana** y **Más tarde**. El panel se abre mediante el icono de despertador de la barra de estado o mediante Ver → Barra lateral → Paneles → Recordatorios.

- Cada entrada ofrece las acciones directas **Hecho** y **Más tarde**.
- Un clic en una entrada abre el archivo de origen en la línea correspondiente.
- El nombre del archivo de origen aparece aquí y en el diálogo de aviso sin la extensión Markdown; la información sobre herramientas indica la ruta completa.
- El grupo **Atrasados** incluye también los recordatorios silenciados y ofrece allí **Activar de nuevo**.

## Configuración y extensión

La sección de configuración **Recordatorios** (Archivo → Configuración…) controla:

- **Hora predeterminada**: hora de aviso para los marcadores sin parte de hora (predeterminado 09:00).
- **Opciones de posposición**: la lista de ofertas de posposición en el diálogo y en la lista.
- **Notificación del sistema**: activa o desactiva la notificación adicional que aparece cuando ninguna ventana de la aplicación está en primer plano.

Los recordatorios son una **extensión** activable con una dependencia de la extensión **Tareas**: si «Tareas» está desactivada, los recordatorios también quedan inactivos. Más detalles en la página [Extensiones](extensions.md).
