# Erweiterungen erstellen

Externe Erweiterungen sind selbst erstellte Pakete, die Rendering und Oberfläche der App über eine definierte, versionierte Schnittstelle (Erweiterungs-API v1) erweitern. Diese Seite beschreibt den Paket-Aufbau, die vollständige API und den Weg von der Installation bis zur Aktivierung.

> [!warning] Sicherheits-Hinweis
> Eine aktivierte externe Erweiterung ist fremder Code mit **vollem Zugriff auf deine Dokumente und die gesamte App**. Es gibt keine technische Schutzschicht (keine Sandbox); der Schutz ist deine bewusste Entscheidung im Warn-Dialog. Aktiviere nur Erweiterungen, deren Quelle du vertraust und deren Code du kennst oder prüfen kannst.

## Paket-Aufbau

Ein Erweiterungs-Paket ist ein Ordner im Erweiterungs-Verzeichnis des Nutzerprofils. Der Zugang „Ordner öffnen" im Einstellungs-Bereich Erweiterungen (extern) öffnet das Verzeichnis im Datei-Explorer.

```text
<Nutzerprofil>/extensions/
└── meine-erweiterung/
    ├── manifest.json     (Pflicht: beschreibt das Paket)
    ├── main.js           (UI-Einstiegspunkt, ES-Modul)
    └── markdown.js       (Render-Beitrag, markdown-it-Plugin)
```

Der Ordnername muss der Erweiterungs-ID entsprechen. Weitere Dateien sind erlaubt; `main.js` darf sie über relative `import`-Anweisungen laden.

## Manifest-Referenz

Die `manifest.json` beschreibt das Paket:

```json
{
  "id": "meine-erweiterung",
  "name": "Meine Erweiterung",
  "version": "1.0",
  "apiVersion": "1.0",
  "description": "Kurzbeschreibung für den Einstellungs-Bereich.",
  "entry": "main.js",
  "markdownPlugin": "markdown.js"
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | Stabile Kennung in Kleinbuchstaben mit Bindestrichen (kebab-case); muss dem Ordnernamen entsprechen. |
| `name` | ja | Anzeigename im Einstellungs-Bereich und im Warn-Dialog. |
| `version` | ja | Paket-Version (`major.minor.patch`). Die Vertrauens-Bestätigung gilt je Version; nach einem Versions-Wechsel ist eine erneute Bestätigung nötig. |
| `apiVersion` | ja | API-Version, gegen die das Paket gebaut ist (siehe Versionierung). |
| `entry` | eines von beiden | UI-Einstiegspunkt: ES-Modul mit `activate(ctx)`. |
| `markdownPlugin` | eines von beiden | Render-Beitrag: Datei, die ein markdown-it-Plugin exportiert. |
| `description` | nein | Kurzbeschreibung für den Einstellungs-Bereich. |

`entry` und `markdownPlugin` sind schlichte Dateinamen im Paket-Ordner (keine Pfade). Mindestens eines der beiden Felder ist Pflicht.

## Installation und Aktivierung

1. Paket-Ordner in das Erweiterungs-Verzeichnis kopieren.
2. Im Einstellungs-Bereich Erweiterungen (extern) auf „Aktualisieren" klicken — das Paket erscheint mit dem Status „Nicht aktiviert". Neu erkannte Pakete sind grundsätzlich deaktiviert.
3. „Aktivieren…" öffnet den Warn-Dialog. Erst nach der Bestätigung wird Code ausgeführt; die Bestätigung wird je Erweiterung und Version gespeichert.
4. Die Erweiterung wirkt sofort und in allen Fenstern; der Zustand übersteht den Neustart.

„Deaktivieren" nimmt alle Beiträge sofort zurück (die Bestätigung bleibt gespeichert, erneutes Aktivieren derselben Version fragt nicht erneut). „Entfernen…" löscht den Paket-Ordner nach einer eigenen Bestätigung endgültig.

## Render-Beitrag: markdown-it-Plugin

Die in `markdownPlugin` benannte Datei exportiert eine markdown-it-Plugin-Funktion:

```js
'use strict';
module.exports = function meinPlugin(md) {
  md.inline.ruler.after('emphasis', 'mein-smiley', function (state, silent) {
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

Die Datei läuft in einer eigenen, leeren Umgebung: es gibt `module` und `exports`, aber **kein** `require`, kein `process` und kein DOM. Das Plugin wird auf beide Render-Instanzen angewendet (Anzeige und portabler Export), nach allen eingebauten Registrierungen. Wirft das Plugin bei der Registrierung einen Fehler, wird die Erweiterung automatisch deaktiviert und der Fehlertext im Einstellungs-Bereich angezeigt.

Drei Punkte, die bei einer eigenen Syntax zuerst zu klären sind:

- **Das Start-Zeichen muss ein Terminator-Zeichen sein.** Inline-Regeln werden nur an bestimmten Zeichen aufgerufen; alles dazwischen verarbeitet die eingebaute Text-Regel am Stück. Eine Regel auf einem anderen Zeichen greift nur am Absatz-Anfang und mitten im Satz nie. Zur Liste gehören unter anderem `!`, `#`, `$`, `%`, `&`, `*`, `+`, `-`, `:`, `<`, `=`, `>`, `@`, `[`, `\`, `]`, `^`, `_`, `` ` ``, `{`, `}` und `~` — eine runde Klammer zum Beispiel nicht.
- **Inhalt aus dem Dokument gehört in ein eigenes Token.** Das Beispiel oben schiebt fertiges Markup als `html_inline`; das ist unbedenklich, solange der Inhalt konstant ist wie hier das Smiley. Sobald Text aus dem Dokument ins Markup wandert, muss er maskiert werden — dann besser ein eigenes Token mit einer Regel unter `md.renderer.rules` anlegen und die Maskierung der Render-Engine überlassen, statt sie selbst zu schreiben und irgendwo zu vergessen.
- **Der Render-Beitrag wirkt nicht im Live-Modus.** Er greift in der gerenderten Ansicht und im portablen Export; im Live-Modus arbeitet die Anwendung mit Editor-Dekorationen, für die die API keinen Beitrag kennt. Eine eigene Syntax bleibt im Editor unmarkiert.

## UI-Einstiegspunkt

Die in `entry` benannte Datei ist ein ES-Modul. Sein default-Export liefert `activate(ctx)` und optional `deactivate()`:

```js
export default {
  activate(ctx) {
    // Beiträge registrieren (siehe ctx-Referenz)
  },
  deactivate() {
    // optional: eigenes Aufräumen; registrierte Beiträge nimmt die App
    // beim Deaktivieren selbst zurück
  },
};
```

`activate` läuft beim App-Start (wenn die Erweiterung aktiv ist) und bei jeder Aktivierung. Wirft `activate`, werden alle bereits registrierten Beiträge zurückgerollt und die Erweiterung wird automatisch deaktiviert.

### ctx-Referenz (API v1)

| Mitglied | Bedeutung |
|---|---|
| `ctx.apiVersion` | API-Version der App (z. B. `1.0`). |
| `ctx.manifest` | Eingefrorene Kopie von `id`, `name`, `version`, `description`. |
| `ctx.registerSidebarPanel(def)` | Sidebar-Panel beitragen (siehe unten). |
| `ctx.registerCommand(def)` | Kommando beitragen, mit optionalem Standard-Kürzel. |
| `ctx.registerSettingsSection(def)` | Eigenen Einstellungs-Bereich beitragen. |
| `ctx.addTranslations(bundles, defaultLocale)` | Eigene Übersetzungen registrieren. |
| `ctx.t(key)` | Übersetzung auflösen: aktive Sprache → Standard-Sprache → Key. |
| `ctx.getLanguage()` | Aktive Oberflächen-Sprache (`de`, `en`, `fr`, `es`, `it`). |
| `ctx.getTheme()` | Aktives Theme (`light` oder `dark`). |
| `ctx.getThemeVariable(name)` | Wert einer Theme-CSS-Variable, z. B. `--render-font-size`. |
| `ctx.getRenderRoot(spalte)` | Container der gerenderten Ansicht einer Spalte, oder `null`. |
| `ctx.onRenderUpdated(cb)` | Ereignis nach jedem Neuaufbau der gerenderten Ansicht. |
| `ctx.storage.get(key)` / `ctx.storage.set(key, value)` | Persistenz-Namensraum der Erweiterung (asynchron). |

Alles, was hier nicht aufgeführt ist, gehört nicht zur öffentlichen API — auch wenn es technisch erreichbar ist — und kann sich jederzeit ändern.

### Sidebar-Panel

```js
ctx.registerSidebarPanel({
  id: 'demo',
  titleKey: 'panel.title',
  render(body, paneIdx) {
    body.textContent = 'Inhalt des Panels';
  },
});
```

Das Panel erhält je Spalte eine eigene Sektion und ist sichtbar, solange die Erweiterung aktiv ist. Anordnung, Seite und Reiter-Gruppen laufen über das normale Sidebar-Layout (Handbuch-Seite Sidebar) und werden gespeichert. Statt `titleKey` (empfohlen, mehrsprachig über `addTranslations`) ist auch `title` mit festem Text möglich.

### Kommando

```js
ctx.registerCommand({
  id: 'zaehlen',
  titleKey: 'command.title',
  defaultBinding: 'CmdOrCtrl+Alt+9',
  run() {
    // Aktion
  },
});
```

Das Kommando erscheint im Tastenkürzel-Editor (Gruppe „Allgemein") und ist dort umbelegbar; `defaultBinding` ist optional. Menü-Einträge und Einträge auf der generierten Tastenkürzel-Handbuch-Seite sind in v1 nicht vorgesehen.

### Einstellungs-Bereich

```js
ctx.registerSettingsSection({
  id: 'einstellungen',
  titleKey: 'settings.title',
  render(container) {
    const input = document.createElement('input');
    ctx.storage.get('wert').then((v) => {
      input.value = typeof v === 'string' ? v : '';
    });
    input.addEventListener('change', () => ctx.storage.set('wert', input.value));
    container.appendChild(input);
  },
});
```

Der Bereich erscheint in der Bereichsnavigation der Einstellungs-Seite, solange die Erweiterung aktiv ist. Werte gehören in den `ctx.storage`-Namensraum; sie bleiben beim Deaktivieren erhalten.

### Übersetzungen

```js
ctx.addTranslations(
  {
    de: { 'panel.title': 'Mein Panel' },
    en: { 'panel.title': 'My panel' },
  },
  'en',
);
```

`ctx.t('panel.title')` löst in der aktiven Sprache auf und fällt auf die Standard-Sprache der Erweiterung zurück (zweites Argument), zuletzt auf den Key selbst. Die Keys aus `titleKey`-Feldern werden über denselben Mechanismus aufgelöst und folgen dem Sprachwechsel der App.

### Render-Andockpunkt

Ein Panel, das etwas über das angezeigte Dokument sagen soll, braucht zwei Dinge: den Container der gerenderten Ansicht und die Nachricht, dass sie sich geändert hat.

```js
ctx.registerSidebarPanel({
  id: 'demo',
  titleKey: 'panel.title',
  render(body, spalte) {
    zeichne(body, spalte);
  },
});

ctx.onRenderUpdated((spalte) => {
  // Aufbau des Dokuments oder Wechsel der Ansicht in dieser Spalte
  const wurzel = ctx.getRenderRoot(spalte);
  const treffer = wurzel ? wurzel.querySelectorAll('.meine-marke') : [];
  // … Panel dieser Spalte neu füllen
});
```

Die Spalten-Nummer ist dieselbe wie im zweiten Argument von `render`. `ctx.getRenderRoot` liefert `null`, solange die Spalte keine gerenderte Ansicht zeigt, also in der Quelltext-, Live- und System-Ansicht; das ist kein Fehlerfall, sondern der normale Zustand. Das Ereignis meldet sich sowohl nach einem Neuaufbau des Dokuments als auch beim Wechsel in eine Ansicht mit gerendertem Inhalt und wieder heraus.

Zwei Hinweise: Suche im Container nur nach den **eigenen** Elementen, die dein Render-Beitrag erzeugt hat, nicht nach Elementen der Anwendung — deren Aufbau ist nicht zugesagt. Und das Abmelden übernimmt die Anwendung beim Deaktivieren; die zurückgegebene Funktion brauchst du nur, wenn du früher aufhören willst.

## Versionierung und Kompatibilität

Die Erweiterungs-API trägt eine eigene, semantische Versionsnummer; die Anwendung führt derzeit **1.1**. Ein Paket deklariert in `apiVersion`, gegen welche API-Version es gebaut ist. Kompatibel ist es, wenn die Major-Version mit der App übereinstimmt und die deklarierte Minor-Version nicht neuer ist als die der App. Ein Paket mit `"1.0"` läuft also unverändert weiter; wer den Render-Andockpunkt nutzt, deklariert `"1.1"` und verlangt damit eine App, die ihn kennt. Inkompatible Pakete werden nie geladen und im Einstellungs-Bereich mit klarer Meldung gelistet.

Stabilitäts-Zusage: die auf dieser Seite dokumentierten Signaturen bleiben innerhalb derselben Major-Version stabil.

## Fehler-Diagnose

- Wirft eine Erweiterung beim Laden (Manifest-Fehler, Import-Fehler, `activate`, Plugin-Registrierung), wird sie automatisch deaktiviert; der Einstellungs-Bereich zeigt den Status „Fehler" mit dem Fehlertext — auch nach einem Neustart.
- Ungültige Manifeste werden mit Diagnose-Details gelistet und nie geladen.
- Fehler in Kommandos oder beim Panel-Zeichnen zur Laufzeit brechen die App nicht ab; Details stehen im Konsolen-Log.
- „Aktivieren…" nach einem Fehler versucht das Laden erneut (der Fehlertext wird dabei zurückgesetzt).

## Qualitäts-Hinweise

Die Fehler-Isolation fängt Abstürze ab, nicht schlechte Qualität. In deiner Verantwortung liegen insbesondere:

- **Rendering-Performance:** markdown-it-Regeln laufen bei jedem Rendern; teure Regeln bremsen Tippen und Vorschau.
- **Saubere Ausgabe:** erzeugtes HTML sollte zum Dokument-Stil passen und keine fremden Ressourcen nachladen (Demo-Links auf `example.org`).
- **Aufräumen:** eigene Timer, Listener außerhalb der registrierten Beiträge und globale Zustände gehören in `deactivate()`.

Als lauffähige Vorlage dient die Referenz-Erweiterung **Notiz-Merker**. Sie nutzt alle Beitrags-Arten dieser Seite in einem Stück: Eine eigene Syntax markiert Textstellen als Merker, ein Panel sammelt sie als anspringbare Liste, ein Kommando geht sie durch, ein Einstellungs-Bereich steuert Farbe und Sortierung. Sie liegt im veröffentlichten Quellcode des Programms im Ordner `addon_examples/notiz-merker/` und bringt ein eigenes README mit, das auch die Grenzen benennt, auf die jede eigene Erweiterung trifft.
