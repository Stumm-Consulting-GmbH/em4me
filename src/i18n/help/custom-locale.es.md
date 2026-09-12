# Idioma de interfaz propio

La interfaz está disponible en cinco idiomas incluidos. Quien necesite un sexto — una lengua regional, un idioma que ningún programa atiende o simplemente el vocabulario de su propia especialidad — lo traduce por sí mismo. El camino tiene tres pasos: **descargar la plantilla**, **traducirla en el propio editor**, **cargarla**. Después, el idioma propio figura en la selección de idioma de la barra de estado, junto a los incluidos. Todos los caminos están en el menú Archivo → Idioma propio: «Descargar la plantilla…», «Cargar…», «Eliminar…» y «Actualizar…».

Los caminos de manejo pertenecen a la extensión «Idioma de interfaz propio» ([Extensiones](extensions.md)); en el estado desactivado el submenú desaparece. Un idioma ya cargado no se ve afectado por ello: se sigue leyendo y permanece seleccionado. El estado desactivado quita un camino, nunca un idioma.

## Descargar la plantilla

«Archivo → Idioma propio → Descargar la plantilla…» escribe el conjunto completo de textos de la aplicación en un archivo JSON; el diálogo de guardado habitual pregunta por la ubicación y el nombre. La plantilla lleva **siempre inglés**, con independencia del idioma configurado: el inglés es la versión de referencia con la que se compara después una traducción.

El archivo es un directorio plano de claves y textos. Arriba del todo hay dos entradas vacías con las que el idioma se nombra a sí mismo; debajo sigue, entrada por entrada, el fondo inglés:

```json
{
  "@@locale": "",
  "@@name": "",
  "toolbar.open": "Open",
  "view.source": "Source",
  "view.split": "Split",
  …
}
```

A la izquierda está la clave, a la derecha el texto. **Solo se traduce la parte derecha.** Las claves permanecen inalteradas: por ellas encuentra la aplicación sus textos de nuevo.

Cómo se llame el archivo, en cambio, carece de importancia. Puede adoptar cualquier nombre al copiarlo, al descargarlo por segunda vez o al renombrarlo; qué idioma lleva está escrito **dentro** de él y no en su nombre.

## Traducir en el propio editor

El archivo es JSON corriente y se edita en cualquier editor que guarde texto en UTF-8. Cuatro cosas merecen atención.

### Nombrar el idioma

Las dos entradas de arriba están vacías para que se reconozcan como una invitación:

- `@@locale` es el **código** del idioma: dos o tres letras, opcionalmente con un añadido de escritura o de región, es decir, `nds` o `nds-DE`. Se comprueba la forma, no la existencia: quien traduce un idioma que ninguna norma recoge debe poder nombrarlo igualmente. El código de un idioma incluido no se admite: un idioma propio se coloca **junto** a los incluidos, no sustituye a ninguno.
- `@@name` es el **nombre visible**, tal como ha de aparecer en la selección de idioma, con 40 caracteres como máximo. Lo habitual es dar el nombre del idioma en el idioma mismo.

### Marcadores de posición

Algunos textos llevan marcadores de posición entre llaves, por ejemplo `{name}` o `{n}`. La aplicación inserta ahí un valor en tiempo de ejecución: un nombre de archivo, una cantidad. Los marcadores se toman **sin cambios**: la misma grafía, el mismo conjunto. Su **lugar en la frase**, en cambio, es libre, pues ninguna construcción se parece a otra.

### Marcado

Una parte de los textos lleva marcado Markdown porque aparece en una tabla del manual: una palabra en letra de código, más raramente un enlace o un resalte. La regla dice: un texto traducido puede llevar exactamente los **tipos** de marcado que el original lleva en **la misma** entrada, no la misma cantidad. Donde el original tiene un fragmento de código, puede haber dos; donde no tiene enlace, no se añade ninguno. Y un enlace apunta a un destino corriente: `http`, `https`, `mailto` o un destino dentro del manual.

### Lo incompleto está permitido

Una traducción no necesita estar terminada para surtir efecto. Basta con que el archivo lleve al menos una entrada conocida; todo lo demás puede quedar en inglés y completarse más tarde. Lo que falta aparece en inglés — véase el apartado «Lo que aún no está traducido».

## Cargar y comprobar

«Archivo → Idioma propio → Cargar…» pregunta por el archivo. La comprobación tiene lugar **antes** de que se deposite nada: tamaño y estructura, después cada entrada en cuanto a un texto como valor, a marcadores inalterados, a marcado admitido y a destinos de enlace admitidos, además de los dos campos de nombrado.

Rigen aquí dos garantías:

- **Un rechazo nombra la entrada** de la que depende, junto con el motivo: por ejemplo, que los marcadores de una clave determinada difieren de los del original. Así el punto se localiza en el editor en lugar de tener que repasar todo el archivo.
- **Nada se toma a medias.** Si la comprobación halla una infracción, el fondo existente queda intacto; no nace ningún idioma compuesto a medias del archivo y a medias de nada.

Si la comprobación pasa, el aviso nombra el idioma y el número de entradas asumidas. Las claves que la aplicación no conoce — restos de una plantilla más antigua — se omiten y se cuentan en el mismo aviso.

Si ya está cargado un idioma propio con el mismo código, **la aplicación pregunta antes**; cancelar es el valor predeterminado. La sustitución sobrescribe la versión cargada previamente; el archivo del que procede queda intacto.

## Elegir el idioma propio

Se elige como cualquier otro: mediante la selección de idioma en la barra de estado ([Vistas y presentación](views-display.md)). Los idiomas propios figuran allí en un grupo aparte, «Idiomas propios», bajo los incluidos, con el nombre tomado de `@@name`.

La elección surte efecto de inmediato y en todas partes: en la ventana, en los menús y en los diálogos del sistema operativo, y ello en todas las ventanas abiertas. Se mantiene más allá de un reinicio: el idioma propio es una configuración como cualquier otra.

Si alguna vez el archivo de idioma no se encuentra, la configuración se mantiene igualmente: la interfaz muestra inglés y un aviso dice qué idioma propio falta. En cuanto el archivo vuelve, el idioma surte efecto de nuevo sin más intervención.

## Lo que aún no está traducido

Si falta una entrada en el archivo de idioma propio, la aplicación muestra el texto **inglés**, entrada por entrada, no página por página ni diálogo por diálogo. Es intencionado y no un fallo: una interfaz traducida a medias es utilizable desde el principio, y el trabajo puede hacerse por etapas.

Así pues, quien tiene configurado su idioma propio y ve rótulos en inglés al lado está viendo las **lagunas de su traducción** y no un error del programa. Se cierran en cuanto las entradas correspondientes figuran en el archivo y este se carga de nuevo.

## Tras una nueva versión del programa

Una aplicación que crece aporta textos que un archivo traducido antes no puede conocer. El idioma propio envejece con ello, y la aplicación lo dice: un aviso en la barra de estado nombra el idioma y el **número de entradas que faltan**. Aparece una vez por estado: el mismo estado no vuelve a avisar, mientras que un número distinto o una versión del programa distinta sí lo hacen.

«Archivo → Idioma propio → Actualizar…» proporciona el medio para ello. Ese camino guarda el archivo de idioma propio al estado de la versión en ejecución: el nombrado y las traducciones propias se mantienen, y las entradas que faltan figuran en su lugar en inglés. Traduzca lo que aún está en inglés y cargue el archivo de nuevo. La diferencia con la plantilla es únicamente la fuente: aquí el idioma propio en lugar del inglés.

Un diálogo ofrece a elegir los idiomas cargados, incluso si hay solo uno; ello es independiente de cuál esté configurado. El aviso indica cuántas entradas del archivo guardado siguen en inglés. Si no hay ningún idioma propio cargado, lo dice un aviso en lugar de un diálogo vacío.

## Eliminar

«Archivo → Idioma propio → Eliminar…» ofrece a elegir los idiomas cargados con su nombre; cancelar es el valor predeterminado. Se borra el archivo de idioma en el perfil del usuario; el archivo desde el que se cargó permanece donde está.

Si el idioma eliminado es el que está configurado, la interfaz cambia a inglés. Esa es la diferencia con el archivo ausente de más arriba: a quien retira un idioma por sí mismo no se le debe recordar en cada arranque.

## Dónde está el archivo de idioma

Al cargarlo, la aplicación deposita una copia en el **perfil del usuario**, en la carpeta `locales`, junto a sus demás datos. De ello se siguen tres garantías:

- El idioma propio **sobrevive a una reinstalación** del programa; está fuera del directorio del programa.
- **No se escribe nada en el directorio del programa.** El camino no exige, pues, derechos elevados y funciona también allí donde el directorio del programa está protegido contra escritura.
- El archivo depositado es **del mismo tipo** que el cargado: lleva consigo su nombrado y se llama según el código del idioma. Quien quiera guardarlo o transmitirlo, lo copia.

El archivo se lee de nuevo en cada arranque y se comprueba otra vez al hacerlo: la carpeta es accesible con un editor, y por eso la comprobación no ocurre solo al cargar.

## Lo que la función no hace

Tres límites forman parte de ella, para que la expectativa sea la correcta:

- **El manual permanece en los cinco idiomas incluidos.** Lo que se traduce es la interfaz, no la documentación; con un idioma propio configurado, las páginas del manual aparecen en inglés.
- **No hay ayuda a la traducción.** La aplicación no propone nada, no traduce nada por sí misma y no comprueba corrección lingüística alguna. Comprueba la **forma** de un archivo, no su contenido.
- **No hay un lugar de intercambio.** Los idiomas terminados no se obtienen de un punto de recogida. Un archivo de idioma es un archivo corriente y sigue el camino de cualquier otro: por soporte de datos, como adjunto, a través de una carpeta compartida.
