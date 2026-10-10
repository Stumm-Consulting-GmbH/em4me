# Versión portátil

EM4me existe como versión instalada y como versión portátil. La versión portátil no se instala: es un único archivo de programa que usted inicia desde cualquier ubicación, y guarda todo lo que almacena en una carpeta a su lado. Así puede llevarse en una memoria USB y usarse en otro ordenador sin configurar nada en él. La versión portátil se distribuye para Windows; en Linux, EM4me guarda sus datos en el perfil del usuario.

## Iniciar

La versión portátil es el archivo del programa `EM4me-<Version>-Portable.exe`. Colóquelo en una ubicación en la que tenga permiso de escritura, por ejemplo en una carpeta propia dentro de su carpeta Documentos o en una memoria USB, e inícielo allí.

No se instala nada: no se crea ni una entrada en la lista de programas de Windows ni una asociación de extensiones de archivo con EM4me.

## La carpeta de datos

En el primer inicio, EM4me crea la carpeta `Data` junto al archivo del programa. Recoge todo lo que EM4me almacena: configuración, sesión, borradores, idiomas de interfaz propios, extensiones externas y archivos temporales. Si la carpeta ya está allí, EM4me la sigue usando.

**Por eso, no borre ni cambie el nombre de la carpeta `Data`.** Si falta al iniciarse, EM4me la vuelve a crear vacía y comienza como en el primer inicio; lo que había en la carpeta anterior no se usa entonces.

Llevarla consigo significa copiar el archivo del programa junto con la carpeta `Data`, lo más sencillo copiando la carpeta en la que están ambos, por ejemplo a una memoria USB o a otro ordenador. La configuración y la sesión viajan con ella.

## Dónde están los datos

En la versión portátil, «Ayuda → Acerca de…» muestra la línea «Versión portátil – sus datos se encuentran en:» con la ruta completa de la carpeta `Data`. El botón «Abrir la carpeta de datos» situado debajo la abre en el gestor de archivos. En la versión instalada no aparecen ni la línea ni el botón.

## El primer inicio

La versión portátil no adopta nada del ordenador en el que funciona. Su primer inicio comienza con la configuración predeterminada, aunque en el mismo ordenador esté configurada la versión instalada: la versión portátil no lee su configuración, sus listas de recientes ni sus áreas. Es el primer inicio de una instalación nueva: se inicia la visita guiada, y EM4me comienza en el modo de trabajo Principiante ([Extensiones](extensions.md)).

### Llevarse la configuración propia

Quien quiera seguir usando la configuración de la versión instalada se la lleva mediante un archivo de intercambio:

1. En la versión **instalada**, elegir «Archivo → Configuración → Exportar…», seleccionar los tipos de datos deseados y guardar el archivo, por ejemplo directamente en la memoria USB.
2. En la versión **portátil**, elegir «Archivo → Configuración → Importar…», seleccionar el archivo, leer la vista previa y elegir «Aplicar».

Ambos caminos pertenecen a la extensión «Exportación e importación de la configuración», que solo está activada en el modo de trabajo Completo. En una versión portátil recién iniciada falta, por tanto, el submenú al principio; se activa en «Archivo → Configuración… → Extensiones», con el modo de trabajo Completo o con el interruptor individual de la extensión. Lo mismo vale para la versión instalada si en ella está ajustado un modo de trabajo menor.

Qué se lleva el archivo y qué no se describe en la página [Exportar e importar la configuración](setup-exchange.md). Los idiomas de interfaz propios y los paquetes de extensiones externas no forman parte de él: un idioma propio se vuelve a cargar en la versión portátil ([Idioma de interfaz propio](custom-locale.md)), un paquete de extensión se copia en su directorio de extensiones ([Crear extensiones](extensions-dev.md)).

## Cuando EM4me no puede escribir

Si EM4me no puede crear la carpeta `Data` junto al archivo del programa o no puede escribir en ella, por ejemplo en una memoria USB protegida contra escritura o en una carpeta protegida del sistema, lo comunica al iniciarse con «EM4me no puede iniciarse» y se cierra. En ese caso no guarda nada en ninguna parte, tampoco como alternativa en el perfil del usuario. El mensaje aparece en el idioma del sistema operativo, porque en ese momento la configuración todavía no se ha leído.

Solución: coloque el archivo del programa en una ubicación en la que tenga permiso de escritura, por ejemplo su carpeta Documentos o una memoria USB con escritura permitida, e inícielo allí.

## Lo que la versión portátil deja en el ordenador

La versión portátil no se instala. Todo lo que EM4me almacena está en la carpeta `Data` junto al archivo del programa: configuración, sesión, borradores y también archivos temporales. Llévese el archivo del programa con la carpeta `Data`, por ejemplo en una memoria USB, y se lo lleva todo.

**Lo que hace el archivo del programa al iniciarse.** Al iniciarse, el archivo del programa descomprime el programa propiamente dicho en la carpeta temporal de Windows y lo inicia desde allí; al cerrarse, lo vuelve a eliminar. Si EM4me se cierra de forma forzada, por ejemplo desde el Administrador de tareas, esa copia puede quedarse allí. Es una propiedad de esta forma de distribución y afecta solo al programa en sí, nunca a sus datos.

Sus documentos están donde usted los guarda. En la carpeta de un área que usted abra, EM4me crea como de costumbre sus archivos de área.

**Lo que Windows registra.** Windows lleva sus propios registros sobre cada programa; EM4me no puede impedirlo. En ellos puede leerse que EM4me se ejecutó en el ordenador, desde qué ubicación se inició y qué carpetas visitó usted en sus diálogos de archivo. Entre ellos están, por ejemplo, el nombre visible del programa, las vistas de carpeta memorizadas y la última carpeta visitada del diálogo de archivo, una caché de gráficos y la hora de modificación de dos archivos de la ortografía. La enumeración no es completa. El contenido de sus documentos y los nombres de sus archivos no figuran en ninguno de los registros medidos.

**Lo que EM4me hace al respecto.** La versión portátil no anota nada en la lista de archivos usados recientemente, recuerda la última carpeta visitada solo mientras se ejecuta y no añade palabras al diccionario; la corrección ortográfica en sí funciona como de costumbre.

## Qué es distinto en la versión portátil

Dos cosas se comportan deliberadamente de otro modo en la versión portátil que en la instalada, porque de lo contrario escribirían o leerían fuera de la carpeta `Data`:

- **Diccionario.** La corrección ortográfica marca palabras y hace sugerencias como en la versión instalada. Sin embargo, las palabras no pueden añadirse al diccionario: el menú contextual del editor no ofrece «Añadir al diccionario», y en «Configuración → Corrección ortográfica» falta la eliminación de palabras sueltas. Ambas cosas escribirían en el diccionario del usuario de Windows, es decir, en el ordenador en lugar de en la carpeta `Data`. Más sobre la comprobación en la página [Herramientas](tools.md), sección «Corrección ortográfica».
- **Diálogos de archivo.** Tras el inicio, los diálogos de abrir y guardar comienzan en la carpeta «Documentos», salvo que la propia acción proponga una ubicación. EM4me recuerda la última carpeta visitada solo mientras el programa se ejecuta; tras cerrarlo se olvida, y el siguiente inicio vuelve a comenzar en «Documentos». Lo que Windows recuerda por sí mismo sobre estos diálogos, EM4me no lo lee.

Las listas de archivos y áreas abiertos recientemente dentro de EM4me siguen existiendo; están en la carpeta `Data`.
