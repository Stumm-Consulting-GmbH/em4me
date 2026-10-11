# Präsentation

Eine **Präsentation** ist ein gewöhnliches Markdown-Dokument, dessen Inhalt in **Folien** geteilt ist. Die Anwendung zeigt es in der Ansicht **Folien** Folie für Folie, führt es im Vollbild vor und gibt den Foliensatz als PDF oder als HTML-Seiten aus.

Die Präsentation ist eine **weitere Ansicht desselben Dokuments** und kein eigenes Dateiformat. Geschrieben wird in den Markdown-Ansichten; die Ansicht **Folien** zeigt nur und ändert nie etwas am Text.

## Woran eine Präsentation erkannt wird

Am **Kennzeichen** `presentation: true` im Kopfbereich des Dokuments:

```markdown
---
presentation: true
---

# Titel der ersten Folie
```

Der Wert muss `true` sein; `presentation: false`, ein Text wie `"true"` oder ein fehlender Schlüssel ergeben kein Präsentations-Dokument. Ebenso erkannt wird `marp: true`, damit Präsentationen aus einem anderen Folien-Werkzeug hier ohne Umbau öffnen (siehe «Verträglichkeit mit anderen Werkzeugen» weiter unten). Geschrieben wird dieser Schlüssel von der Anwendung nie.

Ein Dokument ohne Kennzeichen bleibt ein gewöhnliches Dokument: `---` ist dort eine waagerechte Linie wie überall.

## Eine Präsentation anlegen

**Ansicht → Präsentation → Neue Präsentation** legt ein neues, noch unbenanntes Dokument an und öffnet es gleich in der Ansicht **Folien**. Es trägt das Kennzeichen, das Theme `light` und die Seitenzahl, dazu drei Beispiel-Folien: eine Titelfolie, eine Folie mit Liste und Sprecher-Notiz und eine Folie, die die Schreibweise für Bild und Text nebeneinander zeigt. Gespeichert wird wie bei jedem neuen Dokument beim ersten Speichern. Der Befehl steht auch in der Kommando-Palette (Standard `Strg+K`).

Wer ein vorhandenes Dokument zur Präsentation machen will, trägt das Kennzeichen selbst in den Kopf ein.

## Folien trennen

Eine Zeile aus drei Bindestrichen `---` trennt zwei Folien, und zwar genau dort, wo sie nach CommonMark eine waagerechte Linie ist. Am sichersten steht sie mit einer Leerzeile davor und danach:

```markdown
# Erste Folie

Text der ersten Folie.

---

# Zweite Folie
```

**Was nicht trennt:**

- `---` direkt unter einer Textzeile: Das ist eine Überschriften-Unterstreichung (Setext) und keine Linie.
- `---` in einem Code-Block, in einem Zitat, eingerückt in einem Listenpunkt oder mit vier Leerzeichen davor.
- `---` in einem Kommentar.
- Die beiden Zeilen, die den Kopfbereich einschließen.
- `***` und `___`: Sie bleiben Linien **auf** der Folie, damit eine Folie selbst eine Trennlinie tragen kann.

Die Trennzeile gehört zu keiner Folie. Zwei Trennzeilen hintereinander ergeben eine leere Folie, ebenso eine Trennzeile direkt nach dem Kopf oder am Dokument-Ende; ein Dokument ohne Trennzeile ist eine einzige Folie.

## Der Kopf: Steuer-Schlüssel

Neben dem Kennzeichen stehen im Kopf fünf Steuer-Schlüssel; alle sind freiwillig:

| Schlüssel | Wirkung | Vorgabe |
| --------- | ------- | ------- |
| `theme` | Gestaltung der Folien: `light`, `dark` oder `accent`, wahlweise mit eigenen Werten (siehe unten) | `light` |
| `paginate` | `true` zeigt die Seitenzahl unten rechts auf jeder Folie | `false` |
| `header` | Text der Kopfzeile auf jeder Folie | keine |
| `footer` | Text der Fußzeile auf jeder Folie | keine |
| `size` | Format der Folien: `16:9` oder `4:3` | `16:9` |

Ein vollständiger Kopf:

```markdown
---
presentation: true
theme: dark
paginate: true
header: Quartalsbericht
footer: "**Abteilung Vertrieb** · intern"
size: 4:3
---
```

Weitere Schlüssel im Kopf, etwa `title` oder `tags`, bleiben unberührt und wirken wie in jedem anderen Dokument. Ist ein Wert ungültig, gilt die Vorgabe. Bei einem unbekannten oder ungültigen Theme und bei einem unbekannten Format nennt eine **Hinweis-Zeile** über der Folie den Grund.

## Gestaltung

### Die drei Themes

| Theme | Aussehen |
| ----- | -------- |
| `light` | dunkle Schrift auf Weiß, Akzent in Blau |
| `dark` | helle Schrift auf fast Schwarz, Akzent in hellem Blau |
| `accent` | weiße Schrift auf kräftigem Blau, Akzent in Gelb |

Die Folien sehen unter jedem Farbschema der Anwendung gleich aus: Das Theme gehört zur Präsentation, nicht zur Oberfläche.

### Einzelne Werte übersteuern

Statt eines Namens trägt `theme` einen Block. Der Eintrag `name` wählt das Theme, auf dem aufgebaut wird (ohne `name` ist es `light`); die übrigen Einträge übersteuern einzelne Werte:

```yaml
theme:
  name: dark
  accent: "#ff6b6b"
  font: Georgia, serif
```

| Eintrag | Wirkung |
| ------- | ------- |
| `background` | Hintergrund der Folie |
| `text` | Schriftfarbe des Fließtexts |
| `heading` | Schriftfarbe der Überschriften |
| `accent` | Farbe von Verweisen und Zitat-Balken |
| `font` | Schriftart der Folie |
| `header-footer` | Schriftfarbe von Kopf- und Fußzeile |
| `page-number` | Schriftfarbe der Seitenzahl |

Erlaubt sind Farben, Farbverläufe und Schriftlisten in der Schreibweise von CSS. Ein Wert, der eine Datei oder Adresse laden würde, wird nicht übernommen. Ein unbekannter Eintrag wird nicht beachtet, ein ungültiger Wert durch den Wert des Themes ersetzt; beides nennt die Hinweis-Zeile. Code-Blöcke und Hervorhebungen richten sich nach der Helligkeit des Basis-Themes; wer den Hintergrund stark verändert, wählt das Basis-Theme passend hell oder dunkel.

### Hintergrundbild und Zweiteilung

Ein Bild wird zum Hintergrund der Folie, wenn das erste Wort seines Alternativtexts `bg` ist:

```markdown
![bg](bilder/landschaft.jpg)
![bg contain](bilder/diagramm.png)
![bg left:40%](bilder/portrait.jpg)
```

| Angabe | Wirkung |
| ------ | ------- |
| `bg` oder `bg cover` | füllt die Folie; was übersteht, wird beschnitten |
| `bg contain` oder `bg fit` | zeigt das ganze Bild; freie Flächen zeigen den Hintergrund der Folie |
| `bg auto` | zeigt das Bild in seiner eigenen Größe |
| `bg 50%` | zeigt das Bild in der angegebenen Größe |
| `bg left`, `bg right` | **Zweiteilung**: Das Bild füllt die linke oder rechte Hälfte, der Text rückt auf die andere Seite |
| `bg left:40%`, `bg right:33%` | Zweiteilung mit eigener Breite der Bildseite |

Mehrere Hintergrundbilder einer Folie stehen nebeneinander, mit `vertical` am ersten Bild übereinander; bei einer Zweiteilung teilen sie sich die Bildseite. Kopfzeile, Fußzeile und Seitenzahl stehen dann auf der Textseite. Ein Bild, das sich nicht laden lässt, etwa weil seine Datei fehlt, entfällt; die Folie erscheint ohne es. Hintergrundbilder werden auf demselben Weg geladen wie jedes andere Bild im Dokument und unterliegen denselben Regeln.

### Übervolle Folien

Jede Folie hat ein festes Format, 16:9 oder 4:3, und wird gleichmäßig in die verfügbare Fläche eingepasst; die Schrift wächst und schrumpft mit. Was nicht auf die Folie passt, wird am Rand abgeschnitten, und ein **schraffierter Balken** am unteren Rand zeigt die übervolle Folie an. In der Vorführung und in den Exporten erscheint der Balken nicht. Abhilfe schafft eine weitere Folie.

## Seitenzahl, Kopf- und Fußzeile

`paginate: true` zeigt auf jeder Folie unten rechts ihre Nummer. `header` und `footer` setzen eine Zeile oben bzw. unten auf jede Folie; einfache Auszeichnungen wie fett, kursiv oder ein Verweis erscheinen dabei formatiert. Ein leerer Wert zeigt keine Zeile, ein zu langer Text endet mit Auslassungspunkten. Die Angaben gelten für alle Folien gleich.

## Sprecher-Notizen

Kommentare auf einer Folie sind ihre **Sprecher-Notizen**. Beide Formen gelten:

```markdown
# Ergebnisse

- Umsatz gestiegen
- Kosten gesenkt

%% Hier die Zahlen des Vorjahres nennen. %%

<!-- Bei Fragen auf den Anhang verweisen. -->
```

Notizen stehen allein im Quelltext: nicht auf der Folie, nicht in der Vorführung, nicht im PDF und nicht in den HTML-Seiten. Im Editor bleiben sie sichtbar. Ist die Erweiterung „Kommentare" abgeschaltet, ist `%%` gewöhnlicher Text und erscheint auf der Folie; HTML-Kommentare bleiben auch dann Notizen. Mehr zu den privaten Kommentaren mit `%%` steht auf der Seite [Inline-Konstrukte](inline.md).

## Die Ansicht «Folien»

Die Präsentation ist der achte Ansichts-Modus, neben Gerendert, Geteilt, Quellcode, Live, Mindmap, Canvas und Tafel: **Ansicht → Folien**, die Schaltfläche **Folien** in der Statusleiste oder Standard `Strg+8`. Wie bei den übrigen Modi gilt die Wahl je geöffnetem Dokument, und sie wird beim nächsten Start wiederhergestellt.

**Der Modus hängt am Dokument.** Wählbar ist er nur bei einem Dokument mit Kennzeichen. Sonst bleiben Schaltfläche und Menü-Eintrag sichtbar und gedämpft stehen, und der Titel der Schaltfläche nennt den Grund: „Dieses Dokument ist keine Präsentation". Ein Dokument, das in der Ansicht **Folien** steht oder beim Beenden darin offen war und kein Kennzeichen mehr trägt, erscheint in der Lese-Ansicht.

Die Ansicht zeigt eine Folie, darüber den Zähler, etwa „3 / 12", und die Schaltflächen **Zurück**, **Weiter** und **Vorführung starten**. Beim Wechsel in die Ansicht steht die Folie, in der die Schreibmarke steht. Gezeigt wird immer der aktuelle Stand des Dokuments, auch mit ungespeicherten Änderungen.

**Blättern** geht mit den Schaltflächen, mit dem **Mausrad** über der Folie (nach unten weiter, nach oben zurück, eine Folie je Rad-Bewegung) und mit der Tastatur, sobald die Folien-Fläche den Fokus hat:

| Taste | Wirkung |
| ----- | ------- |
| `Pfeil rechts`, `Bild ab`, `Leertaste` | nächste Folie |
| `Pfeil links`, `Bild auf`, `Umschalt+Leertaste` | vorige Folie |
| `Pos1`, `Ende` | erste bzw. letzte Folie |

An der ersten und an der letzten Folie bleibt das Blättern stehen.

## Vorführung

Die Vorführung zeigt die Präsentation im **Vollbild**: Das Fenster geht ins Vollbild, alle Leisten der Anwendung verschwinden, und zu sehen ist allein die Folie, so groß, wie der Bildschirm sie fasst. Gestartet wird sie in der Ansicht **Folien**:

- über **Ansicht → Präsentation → Vorführung starten**,
- mit Standard `F5`,
- mit der Schaltfläche **Vorführung starten** über der Folie.

Die Kommando-Palette führt den Befehl ebenfalls. Die Vorführung beginnt an der Folie, die die Ansicht gerade zeigt. Geblättert wird mit denselben Tasten wie in der Ansicht; dazu blättert ein **Mausklick** eine Folie weiter und das **Mausrad** eine Folie je Rad-Bewegung, nach unten weiter und nach oben zurück.

**Beendet** wird sie mit `Esc`. Sie endet auch, wenn das Vollbild auf anderem Weg verlassen wird, wenn ein anderes Fenster in den Vordergrund kommt oder wenn Dokument oder Ansicht wechseln. Danach steht die Ansicht auf der zuletzt gezeigten Folie. Das Fenster verlässt das Vollbild wieder, es sei denn, es war schon vor der Vorführung darin.

## Foliensatz exportieren

Beide Ausgaben stehen unter **Datei → Weitere Datei-Funktionen → Exportieren** und in der Kommando-Palette. Sie stehen bei jedem Präsentations-Dokument zur Wahl, gleich in welcher Ansicht es gerade steht; bei einem Dokument ohne Kennzeichen bleiben sie gedämpft. Jede Folie erscheint darin so, wie die Ansicht sie zeigt, mit Theme, Hintergrundbildern, Seitenzahl, Kopf- und Fußzeile, Diagrammen und Formeln, aber ohne Sprecher-Notizen und ohne den Balken übervoller Folien. Bricht man den Dialog ab, entsteht nichts. Nach dem Export meldet die Statusleiste die Zahl der Folien und, falls etwas entfallen ist, was.

### Als PDF

**Foliensatz als PDF exportieren…** fragt nach dem Ziel, vorgeschlagen ist der Name des Dokuments mit der Endung `.pdf` im selben Ordner, und schreibt eine PDF-Datei mit **einer Folie je Seite**. Die Seite hat das Format der Folie, 16:9 oder 4:3, und keinen Rand. Die Einstellungen für Papierformat und Ränder des gewöhnlichen PDF-Exports wirken hier nicht.

### Als HTML-Seiten

**Foliensatz als HTML exportieren…** fragt nach einem Ordner und legt darin **eine HTML-Seite je Folie** an: `folie-001.html`, `folie-002.html` und so fort, dazu `index.html` als Startseite mit der ersten Folie. Ist der gewählte Ordner leer oder enthält er einen früheren Export, entstehen die Seiten darin; sonst entsteht ein Unterordner mit dem Namen des Dokuments und dem Zusatz `-Folien`, und die vorhandenen Dateien bleiben unberührt.

Die Seiten öffnet jeder Browser, ohne die Anwendung und ohne Netzverbindung. Jede Seite ist für sich vollständig: Bilder, Diagramme und Formeln sind in ihr eingebettet, sodass sich der Ordner als Ganzes verschieben oder weitergeben lässt. Unter der Folie stehen **Zurück**, der Zähler und **Weiter**, in der Sprache, die die Oberfläche beim Export hatte; geblättert wird außerdem mit denselben Tasten wie in der Vorführung, und die Folie passt sich der Größe des Browser-Fensters an. Verweise und Bilder folgen den Regeln des HTML-Exports eines Dokuments (siehe [Werkzeuge](tools.md)): Ein Verweis auf ein anderes Dokument bleibt als Text stehen, und ein Bild, das sich nicht einbetten lässt, steht als sein Text; ein solches Hintergrundbild entfällt.

## Die Erweiterung „Präsentations-Ansicht"

Die Funktion gehört zu den [internen Erweiterungen](extensions.md) („Präsentations-Ansicht", Gruppe „Rendering") und zum Arbeitsmodus **Fortgeschritten**: Im Modus **Einsteiger** ist sie aus, in **Fortgeschritten** und **Voll** an.

Ist sie abgeschaltet, entfallen die Ansicht **Folien**, das Untermenü **Präsentation** im Menü **Ansicht**, die beiden Export-Befehle und ihre Einträge in Kommando-Palette und Tastenbelegung. Das Kennzeichen hat dann keine Wirkung: Ein Präsentations-Dokument ist ein gewöhnliches Markdown-Dokument, und `---` ist darin eine waagerechte Linie. Ein Dokument, das in der Ansicht **Folien** offen war, erscheint in der Lese-Ansicht. Verloren geht dabei nichts, und geschrieben wird beim Ab- und Einschalten nie; nach dem Wiedereinschalten ist die Präsentation unverändert da.

## Verträglichkeit mit anderen Werkzeugen

Kennzeichen, Steuer-Schlüssel, Trennzeilen und die Bild-Schreibweise mit `bg` folgen einem verbreiteten Werkzeug, das Folien aus Markdown erzeugt und seine Dateien mit `marp: true` kennzeichnet. Die Verträglichkeit ist eine ausdrückliche Zusage: Eine dort geschriebene Präsentation öffnet hier als Präsentation, ohne dass an der Datei etwas geändert werden muss.

**Was hier wie dort gilt:** das Kennzeichen `marp: true`, die Trennung an `---`, die Schlüssel `paginate`, `header`, `footer` und `size`, die Bild-Schreibweise `![bg …](…)` samt Zweiteilung und HTML-Kommentare als Sprecher-Notizen. Kommentare mit Steuer-Angaben des anderen Werkzeugs zählen hier wie dort nicht als Notiz.

**Wo die Anwendung abweicht:**

- **`***` und `___` trennen hier keine Folien.** Das andere Werkzeug beginnt auch an ihnen eine neue Folie. Wer eine Datei in beiden Werkzeugen gleich geteilt sehen will, trennt allein mit `---` und setzt Linien auf einer Folie nicht mit `***` oder `___`.
- **`%%`-Notizen kennt das andere Werkzeug nicht** und zeigt sie als Text auf der Folie. Wer Notizen in beiden Werkzeugen braucht, schreibt sie als HTML-Kommentar `<!-- … -->`; diese gelten in beiden Richtungen.
- **Steuer-Angaben je Folie wirken hier nicht.** Kommentare wie `<!-- _paginate: false -->` oder `<!-- _class: lead -->`, mit denen das andere Werkzeug einzelne Folien anders gestaltet, bleiben im Dokument stehen, werden aber nicht ausgeführt; für alle Folien gelten die Angaben des Kopfs. Ebenso wenig wirkt der Kopf-Schlüssel `headingDivider`, mit dem das andere Werkzeug an Überschriften neue Folien beginnt: Eine Datei, die ihn nutzt, ergibt hier weniger Folien. Beides kommt mit einer späteren Ausbaustufe.

**Was sonst zu beachten ist:**

- Die Anwendung schreibt `marp: true` nie selbst. Wer seine Datei auch im anderen Werkzeug vorführen will, trägt es zusätzlich zu `presentation: true` ein.
- Die Theme-Namen sind verschieden. Ein Theme-Name des anderen Werkzeugs ist hier unbekannt; die Folien erscheinen dann im Theme `light`, und die Hinweis-Zeile nennt den Namen. Der Block unter `theme:` mit eigenen Werten ist eine Schreibweise dieser Anwendung.
- Das Wort `bg` muss hier das **erste** Wort des Alternativtexts sein. Weitere Wörter, etwa Bild-Filter, werden nicht gedeutet.

## Grenzen

- **Notizen erscheinen nur im Quelltext.** Eine Referenten-Ansicht mit Notizen, nächster Folie und Uhr gibt es nicht, ebenso wenig Notizen im PDF oder in den HTML-Seiten.
- **Eine Folien-Übersicht** als Raster aller Folien gibt es nicht; zwischen den Folien wird geblättert.
- **Eigene Themes** entstehen allein über den Block unter `theme:` im Kopf; einen Editor für Themes in den Einstellungen gibt es nicht.
- **Ausgegeben wird als PDF und als HTML-Seiten.** Eine Datei im Format pptx entsteht nicht.
- **Gestaltet wird für den ganzen Foliensatz.** Ein eigenes Theme, ein eigener Hintergrund oder eine eigene Kopfzeile für eine einzelne Folie lässt sich nicht angeben, und eine Überschrift beginnt nicht von selbst eine neue Folie.
- **Bearbeitet wird in den Markdown-Ansichten**, nicht auf der Folie.

Referenten-Ansicht, Folien-Übersicht, Theme-Editor, Angaben je Folie, die Trennung an Überschriften und die Ausgabe als pptx-Datei sind für spätere Ausbaustufen vorgesehen.
