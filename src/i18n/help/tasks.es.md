# Listas de tareas

Las listas de tareas son elementos de lista con una caja de estado. Además de los estados estándar (abierta, hecha) hay estados ampliados con carácter, glifo y color propios, así como marcadores de tarea para vencimientos, prioridad y recurrencia al final de la línea.

## Estados estándar

```markdown
- [ ] tarea abierta
- [x] tarea hecha
```

- [ ] tarea abierta
- [x] tarea hecha

En archivos editables, un clic en la casilla completa la tarea o la reabre — en la vista Lectura y en el modo En vivo. En el manual de solo lectura el clic no tiene efecto.

## Estados ampliados

Seis estados predefinidos; el carácter va entre los corchetes:

```markdown
- [/] en curso
- [-] cancelada
- [>] delegada
- [?] pregunta
- [!] importante
- [*] marcada
```

- [/] en curso
- [-] cancelada
- [>] delegada
- [?] pregunta
- [!] importante
- [*] marcada

Cada estado se muestra como caja de color con glifo. Un clic en la caja avanza al **símbolo siguiente** del estado (por defecto: completar con `[x]`); así se pueden configurar cadenas como «abierta → en curso → hecha».

## Estados propios, tipo y símbolo siguiente

La sección **Estados de tarea** de la página de configuración (Archivo → Configuración…) gestiona el conjunto: los estados predefinidos se pueden desactivar o recolorear, y se pueden añadir estados propios con carácter, etiqueta y color libres. No se permiten espacio, `x`, `X`, corchetes ni la barra invertida; una advertencia señala los caracteres usados más de una vez.

Cada estado lleva además un **tipo** y un **símbolo siguiente**:

- **Tipo** determina el significado del estado: Abierto, En curso, En espera, Hecho, Cancelado o No es una tarea. Solo el cambio a un estado de tipo **Hecho** fija la fecha de finalización y dispara la recurrencia; el tipo **Cancelado** fija la fecha de cancelación. Las líneas de tipo **No es una tarea** no cuentan como tareas. La asignación es libre: incluso un carácter como `*` puede llevar el tipo Hecho.
- **Símbolo siguiente** determina qué carácter fija a continuación el clic en la caja de estado. Los estados base son fijos: `[ ]` pasa a `[x]`, `[x]` pasa a `[ ]`.

## Marcadores de tarea: vencimientos

Los vencimientos figuran como marcadores de símbolo con una fecha `AAAA-MM-DD` al final de la línea y aparecen en todas las vistas como insignia:

```markdown
- [ ] Entregar informe 📅 2099-03-31
- [ ] Preparación ⏳ 2099-03-24 🛫 2099-03-17
- [ ] Muy vencida 📅 2020-01-01
```

- [ ] Entregar informe 📅 2099-03-31
- [ ] Preparación ⏳ 2099-03-24 🛫 2099-03-17
- [ ] Muy vencida 📅 2020-01-01

Se fijan manualmente **vencimiento** (`📅`), **planificado** (`⏳`) e **inicio** (`🛫`). Se crean automáticamente **creado** (`➕`), **hecho** (`✅`) y **cancelado** (`❌`) — véase fechas automáticas. Los vencimientos pasados se resaltan en rojo; los valores no válidos en el calendario (un 30 de febrero, por ejemplo) se conservan y se marcan como no válidos.

Tras la fecha se admite opcionalmente una **hora** `HH:mm`:

```markdown
- [ ] Cita con el dentista 📅 2099-03-31 14:30
```

- [ ] Cita con el dentista 📅 2099-03-31 14:30

La hora es una extensión de formato propia de esta aplicación; otros programas Markdown con el mismo formato de marcador no esperan una hora tras la fecha. Las líneas sin hora son totalmente intercambiables.

A distinguir de esta fecha real está el marcador de recordatorio ⏰, que activa un aviso en el momento indicado; se describe en la página [Recordatorios](reminders.md).

## Marcadores de tarea: prioridad

Seis niveles; «normal» no tiene símbolo y se sitúa entre media y baja:

```markdown
- [ ] Máxima 🔺
- [ ] Alta ⏫
- [ ] Media 🔼
- [ ] Normal (sin marcador)
- [ ] Baja 🔽
- [ ] Mínima ⏬
```

- [ ] Máxima 🔺
- [ ] Alta ⏫
- [ ] Media 🔼
- [ ] Normal (sin marcador)
- [ ] Baja 🔽
- [ ] Mínima ⏬

## Marcadores de tarea: recurrencia

Una regla de recurrencia sigue a `🔁` y, al completar la tarea, produce automáticamente la siguiente instancia — con vencimientos trasladados, estado abierto y, según la configuración, encima (por defecto) o debajo de la línea completada:

```markdown
- [ ] Planificación semanal 🔁 every week on Sunday ⏳ 2099-03-01
- [ ] Sacar la basura 🔁 every 3 days when done 📅 2099-03-05
- [ ] Revisar el alquiler 🔁 every month on the last 📅 2099-03-31
```

- [ ] Planificación semanal 🔁 every week on Sunday ⏳ 2099-03-01
- [ ] Sacar la basura 🔁 every 3 days when done 📅 2099-03-05
- [ ] Revisar el alquiler 🔁 every month on the last 📅 2099-03-31

Formas de regla: `every day`, `every 3 days`, `every weekday`, `every week`, `every week on Sunday` (también varios días de la semana), `every 2 weeks`, `every month`, `every month on the 15th`, `every month on the last`, `every 6 months`, `every year`. El añadido `when done` calcula a partir de la finalización real en lugar de la fecha prevista.

Comportamiento en detalle: la base de cálculo es el vencimiento, en su defecto el planificado, en su defecto el inicio — se requiere al menos un campo de fecha. Si varios campos llevan fechas, se conservan sus distancias; las horas se toman sin cambios. Las reglas mensuales omiten los meses sin el día objetivo (un 31 nunca cae, pues, en el 30). No hay fecha de fin ni límite de repeticiones; las reglas incomprensibles quedan sin efecto.

## Fechas automáticas

Al cambiar de estado, la aplicación escribe marcadores de fecha en la línea — cada uno de los tres automatismos se puede desactivar por separado en la sección de configuración **Tareas**:

- **Hecho** (`✅`): al cambiar a un estado de tipo Hecha; el cambio de vuelta retira de nuevo la fecha.
- **Cancelado** (`❌`): igual para el tipo Cancelada.
- **Creado** (`➕`): al convertir una línea en tarea mediante el comando «Lista de tareas» (desactivado por defecto).

El automatismo escribe solo la fecha, sin hora.

## Filtro global

El **Filtro global** (sección de configuración **Tareas**) decide qué líneas con casilla cuentan como tareas: solo las líneas que contienen el texto del filtro (por ejemplo `#task`) reciben insignias y fechas automáticas; con el filtro vacío cuenta cada línea con casilla. Opcionalmente, el texto del filtro se oculta en las vistas.

## ID y dependencias

Una tarea puede llevar un **ID** (`🆔`) y depender de otras tareas mediante **referencias a un predecesor** (`⛔` con uno o varios ID) — relaciones fin-inicio:

```markdown
- [ ] Verter los cimientos 🆔 abc12 📅 2099-04-01
- [ ] Levantar los muros ⛔ abc12
```

- [ ] Verter los cimientos 🆔 abc12 📅 2099-04-01
- [ ] Levantar los muros ⛔ abc12

Una tarea se considera **bloqueada** mientras al menos un predecesor siga abierto (tipos de estado Abierto, En curso o En espera en ambos lados); los predecesores completados o cancelados no bloquean. Los resultados bloqueados de la consulta de tareas llevan una marca `⛔` discreta; los campos `blocked`, `blocking` e `id.set` filtran en consecuencia (véase el Nivel de tarea de la página [Consulta Perspective](frontmatter-query.md)).

Los ID se componen de letras, cifras, `_` y `-`. Los ID generados automáticamente (diálogo o autocompletación) son **únicos en el ámbito de búsqueda**; los ID asignados dos veces a mano muestran una insignia `⚠` en los resultados y se localizan mediante el campo `id.duplicate`. En la instancia siguiente de una recurrencia, los marcadores de ID y de predecesor se eliminan para que no surjan ID duplicados.

## Diálogo de edición

El comando **Editar tarea…** (predeterminado `Ctrl+Alt+A`, también en el menú contextual del editor en Insertar y como botón de lápiz en los resultados de consulta) abre un formulario para todos los marcadores: descripción, estado (del conjunto de estados configurado), prioridad, regla de recurrencia con indicación si la forma es incomprensible, los tres vencimientos manuales mediante el calendario de fechas, así como ID, predecesoras y sucesoras con una búsqueda de tareas sobre el ámbito de búsqueda. En una línea de tarea el diálogo edita; en una línea vacía crea una nueva tarea. El cambio a un estado de tipo Hecho fija la fecha de finalización según el automatismo; una entrada de sucesora escribe la referencia al predecesor en la línea de destino (la propia tarea recibe automáticamente un ID si hace falta). Cada aplicación es un único paso de deshacer.

## Autocompletación

En las líneas de tarea, la autocompletación propone marcadores tras la caja de estado: los tres vencimientos (abren el calendario de fechas), la prioridad, las reglas de recurrencia frecuentes, los cambios de estado y «Generar ID». Las sugerencias aparecen a partir de una longitud de escritura configurable (o de inmediato con `Ctrl+Espacio`) y sustituyen la palabra escrita al aceptar; la longitud mínima de escritura y el número de sugerencias están en la sección de configuración **Tareas**.

## Consultas de tareas y reescritura

El ámbito de consulta `LIST TASKS` (página [Consulta Perspective](frontmatter-query.md), sección Nivel de tarea) enumera tareas por todo el ámbito de búsqueda — con filtros sobre todos los campos de marcador, agrupación y control de disposición. Los resultados son una superficie de trabajo: la **caja de estado** avanza el estado directamente en el archivo fuente (con alternancia en cadena, fechas automáticas y recurrencia), el **botón de aplazamiento** traslada el vencimiento pertinente a mañana, una semana después o una fecha libremente elegida (los vencimientos pasados cuentan desde hoy), el **botón de lápiz** abre el diálogo de edición. La escritura llega también a archivos no abiertos; los documentos abiertos se actualizan mediante el estado del editor y nunca se adelantan, y si una línea de resultado ha cambiado entretanto, aparece un aviso en lugar de una escritura a ciegas.

## Puntuación de urgencia

La puntuación hace que las listas de tareas se puedan ordenar sin trabajo manual (la ordenación predeterminada de la consulta de tareas; mostrable como valor mediante `SHOW urgency`, filtrable y ordenable mediante el campo `urgency`). Es la suma de cuatro componentes:

| Componente | Valor |
|---|---|
| Vencimiento | 12,0 desde siete días de retraso, decreciendo progresivamente hasta 2,4 desde catorce días en el futuro (vencimiento hoy: 8,8); 0 sin vencimiento |
| Prioridad | Máxima 9,0 · Alta 6,0 · Media 3,9 · Normal 1,95 · Baja 0,0 · Mínima −1,8 |
| Planificado | +5,0 si el vencimiento planificado es hoy o antes |
| Inicio | −3,0 si el vencimiento de inicio es mañana o después |

La puntuación calcula en base diaria; una hora tras la fecha no influye, y los vencimientos no válidos en el calendario cuentan como ausentes.
