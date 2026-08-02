# Crear extensiones

Las extensiones externas son paquetes creados por ti que amplían el renderizado y la interfaz de la aplicación a través de una interfaz definida y versionada (API de extensiones v1). Esta página describe la estructura del paquete, la API completa y el camino desde la instalación hasta la activación.

> [!warning] Aviso de seguridad
> Una extensión externa activada es código de terceros con **acceso completo a tus documentos y a toda la aplicación**. No existe una capa técnica de protección (sin sandbox); la protección es tu decisión consciente en el diálogo de advertencia. Activa solo extensiones cuya fuente conozcas y cuyo código puedas revisar.

## Estructura del paquete

Un paquete de extensión es una carpeta dentro del directorio de extensiones del perfil de usuario. La acción «Abrir carpeta» de la sección de configuración Extensiones (externas) abre el directorio en el explorador de archivos.

```text
<perfil de usuario>/extensions/
└── mi-extension/
    ├── manifest.json     (obligatorio: describe el paquete)
    ├── main.js           (punto de entrada de UI, módulo ES)
    └── markdown.js       (contribución de renderizado, plugin markdown-it)
```

El nombre de la carpeta debe coincidir con el ID de la extensión. Se permiten archivos adicionales; `main.js` puede cargarlos mediante instrucciones `import` relativas.

## Referencia del manifiesto

El archivo `manifest.json` describe el paquete:

```json
{
  "id": "mi-extension",
  "name": "Mi extensión",
  "version": "1.0",
  "apiVersion": "1.0",
  "description": "Descripción breve para la sección de configuración.",
  "entry": "main.js",
  "markdownPlugin": "markdown.js"
}
```

| Campo | Obligatorio | Significado |
|---|---|---|
| `id` | sí | Identificador estable en minúsculas con guiones (kebab-case); debe coincidir con el nombre de la carpeta. |
| `name` | sí | Nombre mostrado en la sección de configuración y en el diálogo de advertencia. |
| `version` | sí | Versión del paquete (`major.minor.patch`). La confirmación de confianza vale por versión; tras un cambio de versión se requiere una nueva confirmación. |
| `apiVersion` | sí | Versión de la API contra la que está construido el paquete (véase versionado). |
| `entry` | uno de los dos | Punto de entrada de UI: módulo ES con `activate(ctx)`. |
| `markdownPlugin` | uno de los dos | Contribución de renderizado: archivo que exporta un plugin markdown-it. |
| `description` | no | Descripción breve para la sección de configuración. |

`entry` y `markdownPlugin` son nombres de archivo simples dentro de la carpeta del paquete (sin rutas). Al menos uno de los dos campos es obligatorio.

## Instalación y activación

1. Copia la carpeta del paquete en el directorio de extensiones.
2. En la sección Extensiones (externas), pulsa «Actualizar»: el paquete aparece con el estado «No activada». Los paquetes recién detectados siempre empiezan desactivados.
3. «Activar…» abre el diálogo de advertencia. El código solo se ejecuta tras la confirmación; la confirmación se guarda por extensión y versión.
4. La extensión surte efecto de inmediato y en todas las ventanas; el estado sobrevive al reinicio.

«Desactivar» retira todas las contribuciones de inmediato (la confirmación queda guardada; reactivar la misma versión no vuelve a preguntar). «Eliminar…» borra definitivamente la carpeta del paquete tras su propia confirmación.

## Contribución de renderizado: plugin markdown-it

El archivo indicado en `markdownPlugin` exporta una función de plugin markdown-it:

```js
'use strict';
module.exports = function miPlugin(md) {
  md.inline.ruler.after('emphasis', 'mi-smiley', function (state, silent) {
    if (state.src.slice(state.pos, state.pos + 3) !== ':-)') return false;
    if (!silent) {
      const token = state.push('html_inline', '', 0);
      token.content = '<span class="ext-beispiel-smiley">☺</span>';
    }
    state.pos += 3;
    return true;
  });
};
```

El archivo se ejecuta en un entorno propio y vacío: existen `module` y `exports`, pero **no** hay `require`, ni `process`, ni DOM. El plugin se aplica a las dos instancias de renderizado (visualización y exportación portable), después de todos los registros integrados. Si el plugin lanza un error al registrarse, la extensión se desactiva automáticamente y el texto del error se muestra en la sección de configuración.

Tres puntos que conviene resolver primero al definir una sintaxis propia:

- **El carácter inicial debe ser un carácter terminador.** Las reglas en línea solo se invocan en determinados caracteres; todo lo que queda entre ellos lo consume de una pieza la regla de texto integrada. Una regla situada en otro carácter solo se activa al principio del párrafo y nunca en mitad de la frase. La lista incluye, entre otros, `!`, `#`, `$`, `%`, `&`, `*`, `+`, `-`, `:`, `<`, `=`, `>`, `@`, `[`, `]`, `^`, `_`, `` ` ``, `{`, `}` y `~`; un paréntesis, por ejemplo, no está entre ellos.
- **El contenido procedente del documento va en un token propio.** El ejemplo anterior inserta marcado ya terminado como `html_inline`; eso es inofensivo mientras el contenido sea constante, como aquí el smiley. En cuanto texto del documento entra en el marcado, hay que escaparlo: conviene entonces definir un token propio con una regla en `md.renderer.rules` y dejar el escapado al motor de renderizado, en lugar de escribirlo uno mismo y olvidarlo en algún sitio.
- **La contribución de renderizado no actúa en el modo directo.** Surte efecto en la vista renderizada y en la exportación portable; en el modo directo la aplicación usa decoraciones del editor, para las que la API no prevé ninguna contribución. Tu sintaxis queda sin marcar en el editor.

## Punto de entrada de UI

El archivo indicado en `entry` es un módulo ES. Su export por defecto proporciona `activate(ctx)` y, opcionalmente, `deactivate()`:

```js
export default {
  activate(ctx) {
    // registrar contribuciones (véase la referencia de ctx)
  },
  deactivate() {
    // opcional: limpieza propia; las contribuciones registradas
    // las retira la propia aplicación al desactivar
  },
};
```

`activate` se ejecuta al iniciar la aplicación (si la extensión está activa) y en cada activación. Si `activate` lanza un error, todas las contribuciones ya registradas se revierten y la extensión se desactiva automáticamente.

### Referencia de ctx (API v1)

| Miembro | Significado |
|---|---|
| `ctx.apiVersion` | Versión de la API de la aplicación (p. ej. `1.0`). |
| `ctx.manifest` | Copia congelada de `id`, `name`, `version`, `description`. |
| `ctx.registerSidebarPanel(def)` | Aportar un panel de barra lateral (véase abajo). |
| `ctx.registerCommand(def)` | Aportar un comando, con atajo predeterminado opcional. |
| `ctx.registerSettingsSection(def)` | Aportar una sección de configuración propia. |
| `ctx.addTranslations(bundles, defaultLocale)` | Registrar traducciones propias. |
| `ctx.t(key)` | Resolver una traducción: idioma activo → idioma predeterminado → clave. |
| `ctx.getLanguage()` | Idioma activo de la interfaz (`de`, `en`, `fr`, `es`, `it`). |
| `ctx.getTheme()` | Tema activo (`light` o `dark`). |
| `ctx.getThemeVariable(name)` | Valor de una variable CSS del tema, p. ej. `--render-font-size`. |
| `ctx.getRenderRoot(columna)` | Contenedor de la vista renderizada de una columna, o `null`. |
| `ctx.onRenderUpdated(cb)` | Evento tras cada reconstrucción de la vista renderizada. |
| `ctx.storage.get(key)` / `ctx.storage.set(key, value)` | Espacio de persistencia de la extensión (asíncrono). |

Todo lo que no figura aquí no forma parte de la API pública — aunque sea técnicamente accesible — y puede cambiar en cualquier momento.

### Panel de barra lateral

```js
ctx.registerSidebarPanel({
  id: 'demo',
  titleKey: 'panel.title',
  render(body, paneIdx) {
    body.textContent = 'Contenido del panel';
  },
});
```

El panel recibe su propia sección por columna y es visible mientras la extensión está activa. Posición, lado y grupos de pestañas siguen la disposición normal de la barra lateral (página del manual Barra lateral) y se guardan. En lugar de `titleKey` (recomendado, multilingüe mediante `addTranslations`) también es posible un `title` fijo.

### Comando

```js
ctx.registerCommand({
  id: 'contar',
  titleKey: 'command.title',
  defaultBinding: 'CmdOrCtrl+Alt+9',
  run() {
    // acción
  },
});
```

El comando aparece en el editor de atajos de teclado (grupo «General») y puede reasignarse allí; `defaultBinding` es opcional. Las entradas de menú y las entradas de la página generada de atajos del manual no forman parte de la v1.

### Sección de configuración

```js
ctx.registerSettingsSection({
  id: 'configuracion',
  titleKey: 'settings.title',
  render(container) {
    const input = document.createElement('input');
    ctx.storage.get('valor').then((v) => {
      input.value = typeof v === 'string' ? v : '';
    });
    input.addEventListener('change', () => ctx.storage.set('valor', input.value));
    container.appendChild(input);
  },
});
```

La sección aparece en la navegación de la configuración mientras la extensión está activa. Los valores van al espacio `ctx.storage`; se conservan al desactivar.

### Traducciones

```js
ctx.addTranslations(
  {
    es: { 'panel.title': 'Mi panel' },
    en: { 'panel.title': 'My panel' },
  },
  'en',
);
```

`ctx.t('panel.title')` resuelve en el idioma activo y recurre al idioma predeterminado de la extensión (segundo argumento) y, por último, a la propia clave. Las claves de los campos `titleKey` se resuelven por el mismo mecanismo y siguen el cambio de idioma de la aplicación.

### Punto de anclaje del renderizado

Un panel que quiera decir algo sobre el documento mostrado necesita dos cosas: el contenedor de la vista renderizada y el aviso de que ha cambiado.

```js
ctx.registerSidebarPanel({
  id: 'demo',
  titleKey: 'panel.title',
  render(body, columna) {
    dibuja(body, columna);
  },
});

ctx.onRenderUpdated((columna) => {
  // Documento reconstruido o vista cambiada en esta columna
  const raiz = ctx.getRenderRoot(columna);
  const hallazgos = raiz ? raiz.querySelectorAll('.mi-marca') : [];
  // … volver a llenar el panel de esta columna
});
```

El número de columna es el mismo que en el segundo argumento de `render`. `ctx.getRenderRoot` devuelve `null` mientras la columna no muestre vista renderizada, es decir, en las vistas de código, directa y de sistema; no es un caso de error, sino el estado normal. El evento se dispara tanto tras una reconstrucción del documento como al pasar a una vista con contenido renderizado y al salir de ella.

Dos indicaciones: dentro del contenedor busca solo **tus propios** elementos, los que ha producido tu contribución de renderizado, y no elementos de la aplicación, cuya estructura no está garantizada. De la baja se encarga la aplicación al desactivar; la función devuelta solo hace falta si quieres detenerte antes.

## Versionado y compatibilidad

La API de extensiones lleva su propio número de versión semántico; la aplicación está actualmente en la **1.1**. Un paquete declara en `apiVersion` la versión de API contra la que está construido. Es compatible si la versión mayor coincide con la de la aplicación y la versión menor declarada no es más reciente que la de la aplicación. Un paquete que declare `"1.0"` sigue funcionando sin cambios; quien use el punto de anclaje del renderizado declara `"1.1"` y exige así una aplicación que lo conozca. Los paquetes incompatibles nunca se cargan y se listan en la sección de configuración con un mensaje claro.

Promesa de estabilidad: las firmas documentadas en esta página permanecen estables dentro de la misma versión mayor.

## Diagnóstico de errores

- Si una extensión lanza un error al cargar (error de manifiesto, error de importación, `activate`, registro del plugin), se desactiva automáticamente; la sección de configuración muestra el estado «Error» con el texto del error, también tras un reinicio.
- Los manifiestos no válidos se listan con detalles de diagnóstico y nunca se cargan.
- Los errores de ejecución en comandos o al dibujar un panel no bloquean la aplicación; los detalles aparecen en el registro de la consola.
- «Activar…» tras un error reintenta la carga (el texto del error se restablece).

## Notas de calidad

El aislamiento de errores intercepta los fallos, no la mala calidad. Es responsabilidad tuya, en particular:

- **Rendimiento de renderizado:** las reglas markdown-it se ejecutan en cada renderizado; las reglas costosas frenan la escritura y la vista previa.
- **Salida limpia:** el HTML generado debe encajar con el estilo del documento y no cargar recursos remotos (enlaces de demostración a `example.org`).
- **Limpieza:** tus propios temporizadores, escuchadores fuera de las contribuciones registradas y estados globales van en `deactivate()`.

La extensión de referencia **Notiz-Merker** (marcadores de nota) sirve como plantilla ejecutable. Usa todos los tipos de contribución de esta página en una sola pieza: una sintaxis propia marca pasajes, un panel los reúne en una lista a la que se puede saltar, un comando los recorre y una sección de configuración regula el color y el orden. Se encuentra en el código fuente publicado del programa, en la carpeta `addon_examples/notiz-merker/`, y trae su propio README, que nombra también los límites con los que se encontrará cualquier extensión propia.
