# Präsentation

Eine **Präsentation** ist ein gewöhnliches Markdown-Dokument, dessen Inhalt in **Folien** geteilt ist. Die Anwendung zeigt es in der Ansicht **Folien** Folie für Folie, führt es im Vollbild oder in einem eigenen Fenster vor, gibt dem Vortragenden eine **Referenten-Ansicht** mit Notizen und Zeit und gibt den Foliensatz als PDF oder als HTML-Seiten aus.

Die Präsentation ist eine **weitere Ansicht desselben Dokuments** und kein eigenes Dateiformat. Geschrieben wird in den Markdown-Ansichten; die Ansicht **Folien** zeigt nur und ändert nie etwas am Text. Einzige Ausnahme ist der Dialog **Gestaltung dieser Präsentation…**, der auf Wunsch die Gestaltung in den Kopf der Datei schreibt.

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

### An Überschriften trennen

Mit dem Schlüssel `headingDivider` im Kopf beginnt zusätzlich **vor jeder Überschrift** bis zur angegebenen Ebene eine neue Folie. Der Wert ist eine Zahl von 1 bis 6:

```markdown
---
presentation: true
headingDivider: 2
---

# Erster Teil

## Ein Unterpunkt

## Noch ein Unterpunkt
```

Hier ergibt jede Überschrift der Ebenen 1 und 2 eine eigene Folie, also drei Folien ohne eine einzige Trennzeile. Die Überschrift steht oben auf ihrer neuen Folie. Steht vor ihr auf der Folie nichts als Leerzeilen und Kommentare, beginnt keine weitere Folie; Trennzeilen und Überschriften lassen sich deshalb mischen, ohne dass leere Folien entstehen. Überschriften in Code-Blöcken, Zitaten und Listen trennen nicht.

Die Angabe gilt für den ganzen Foliensatz, auch wenn sie in einem Kommentar weiter unten steht (siehe «Angaben je Folie»); gibt es mehrere, gilt die letzte. Ein ungültiger Wert wird nicht beachtet, und die Hinweis-Zeile nennt ihn. Die Schreibweise als Liste, etwa `[1, 3]`, bleibt ohne Wirkung.

## Der Kopf: Steuer-Schlüssel

Neben dem Kennzeichen stehen im Kopf sechs Steuer-Schlüssel; alle sind freiwillig:

| Schlüssel | Wirkung | Vorgabe |
| --------- | ------- | ------- |
| `theme` | Gestaltung der Folien: `light`, `dark`, `accent` oder der Name eines eigenen Themes, wahlweise mit eigenen Werten (siehe unten) | `light` |
| `paginate` | `true` zeigt die Seitenzahl unten rechts auf jeder Folie | `false` |
| `header` | Text der Kopfzeile auf jeder Folie | keine |
| `footer` | Text der Fußzeile auf jeder Folie | keine |
| `size` | Format der Folien: `16:9` oder `4:3` | `16:9` |
| `headingDivider` | Zahl von 1 bis 6: jede Überschrift bis zu dieser Ebene beginnt eine neue Folie (siehe oben) | keine |

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

Weitere Schlüssel im Kopf, etwa `title` oder `tags`, bleiben unberührt und wirken wie in jedem anderen Dokument. Ist ein Wert ungültig, gilt die Vorgabe. Bei einem unbekannten oder ungültigen Theme, bei einem unbekannten Format und bei einem ungültigen Wert für `headingDivider` nennt eine **Hinweis-Zeile** über der Folie den Grund. Für einzelne Folien lassen sich Theme, Farben, Kopf- und Fußzeile und Seitenzahl abweichend angeben (siehe «Angaben je Folie»).

## Gestaltung

### Die drei Themes

| Theme | Aussehen |
| ----- | -------- |
| `light` | dunkle Schrift auf Weiß, Akzent in Blau |
| `dark` | helle Schrift auf fast Schwarz, Akzent in hellem Blau |
| `accent` | weiße Schrift auf kräftigem Blau, Akzent in Gelb |

Die Folien sehen unter jedem Farbschema der Anwendung gleich aus: Das Theme gehört zur Präsentation, nicht zur Oberfläche. Wer eine Gestaltung öfter braucht, legt sie als **eigenes Theme** an und wählt sie mit ihrem Namen (siehe «Eigene Themes»).

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

Jede Folie hat ein festes Format, 16:9 oder 4:3, und wird gleichmäßig in die verfügbare Fläche eingepasst; die Schrift wächst und schrumpft mit. Passt der Inhalt einer Folie nicht hinein, wird er **von selbst verkleinert**, bis er passt, höchstens auf die Hälfte seiner Größe. Kopfzeile, Fußzeile und Seitenzahl behalten ihre Größe, und der Rand der Folie bleibt gleich. Die Verkleinerung wirkt überall gleich: in der Ansicht, in Vorführung und Referenten-Ansicht, in der Folien-Übersicht und in beiden Exporten.

Erst was selbst bei halber Größe nicht passt, wird am Rand abgeschnitten, und ein **schraffierter Balken** am unteren Rand zeigt die übervolle Folie an. In der Vorführung und in den Exporten erscheint der Balken nicht. Abhilfe schafft eine weitere Folie.

## Eigene Themes

Ein **eigenes Theme** ist eine benannte Gestaltung, die auf einem der drei mitgelieferten Themes aufbaut und einzelne der sieben Werte anders setzt. Es gilt in jeder Präsentation, die es im Kopf nennt:

```yaml
theme: Firma
```

Der Name wird ohne Rücksicht auf Groß- und Kleinschreibung gefunden; `theme: firma` wählt also ebenso das Theme «Firma». Auf einem eigenen Theme lässt sich wie auf jedem anderen mit einem Block aufbauen, dessen Eintrag `name` es nennt. Gibt es das genannte Theme nicht, etwa auf einem anderen Rechner, erscheinen die Folien im Theme `light`, und die Hinweis-Zeile nennt den Namen.

Eigene Themes gehören zu den Einstellungen der Anwendung, nicht zur Datei. Sie gelten in allen Fenstern, und sie reisen in der Datei der eigenen Einrichtung mit (siehe [Einstellungen exportieren und importieren](setup-exchange.md)).

### Der Abschnitt «Folien-Themes» der Einstellungen

Unter **Datei → Einstellungen… → Folien-Themes** im Block «Erweiterungen (intern)» werden die eigenen Themes verwaltet:

- **Neu** legt ein Theme an, das auf der unter **Vorlage** gewählten Gestaltung `light`, `dark` oder `accent` aufbaut; es heißt zunächst «Neues Theme».
- **Duplizieren** legt eine Kopie des gewählten Themes an, **Löschen** entfernt es.
- Im Feld **Name** wird das Theme umbenannt. Ein Name darf nicht leer sein, nicht einem mitgelieferten Theme gehören und nicht schon vergeben sein, auch nicht in anderer Groß- und Kleinschreibung; ein Verstoß wird sofort genannt, und Anwenden und OK bleiben gesperrt, bis er behoben ist.

Darunter stehen die sieben Werte aus der Tafel «Einzelne Werte übersteuern», je mit einer Zeile: Die Farben haben einen Farbwähler und ein Textfeld, das jede Schreibweise von CSS annimmt, die Schrift ein Textfeld mit Vorschlägen. **Zurücksetzen** stellt eine Zeile auf den Wert des zugrunde liegenden Themes zurück. Ein ungültiger Wert wird markiert und nicht übernommen. Eine **Vorschau-Folie** zeigt die Gestaltung mit jeder Eingabe. Gespeichert wird mit **Anwenden** oder **OK**; die Änderung wirkt sofort in allen offenen Präsentationen.

### Gestaltung dieser Präsentation

**Ansicht → Präsentation → Gestaltung dieser Präsentation…** stellt die Gestaltung einer einzelnen Datei ein, ohne den Kopf von Hand zu schreiben. Der Befehl steht bei jeder Präsentation zur Wahl, die sich ändern lässt, gleich in welcher Ansicht sie steht, und in der Kommando-Palette.

Der Dialog nennt oben das Theme, gewählt aus den mitgelieferten und den eigenen Themes; ein unbekannter Name aus dem Kopf bleibt als «Name (unbekannt)» wählbar. Darunter steht je Wert, ob er **wie Theme** gilt, mit dem Wert des Themes in Klammern, oder als **eigener Wert**. Eine Eingabe stellt die Zeile auf «eigener Wert», **Zurücksetzen** wieder auf «wie Theme».

**OK** schreibt die Wahl in den Kopf der Datei: ohne eigene Werte als `theme:` mit dem Namen, sonst als Block mit `name:` und den eigenen Werten. Der Schritt lässt sich als Ganzes rückgängig machen. Die übrigen Einträge des Kopfs bleiben unverändert, und wer nichts geändert hat, ändert auch nichts an der Datei. Hat sich das Dokument geändert, während der Dialog offen war, wird nichts geschrieben, und die Statusleiste sagt es.

Zwei weitere Schaltflächen führen über die einzelne Datei hinaus:

- **Als Theme speichern…** fragt nach einem Namen, legt aus dem gewählten Theme und den eigenen Werten ein eigenes Theme an und schreibt in die Datei nur noch `theme:` mit diesem Namen. Wird der Name abgebrochen, bleibt alles, wie es war.
- **Theme-Werte in die Datei übernehmen** steht bei einem eigenen Theme zur Wahl. Sie schreibt alle sieben Werte als Block in den Kopf, aufgebaut auf dem mitgelieferten Theme darunter. Die Datei sieht danach auch dort gleich aus, wo es das eigene Theme nicht gibt, etwa nach der Weitergabe an andere.

## Seitenzahl, Kopf- und Fußzeile

`paginate: true` zeigt auf jeder Folie unten rechts ihre Nummer. `header` und `footer` setzen eine Zeile oben bzw. unten auf jede Folie; einfache Auszeichnungen wie fett, kursiv oder ein Verweis erscheinen dabei formatiert. Ein leerer Wert zeigt keine Zeile, ein zu langer Text endet mit Auslassungspunkten. Im Kopf gelten die Angaben für alle Folien gleich; für einzelne Folien lassen sie sich abweichend setzen (siehe «Angaben je Folie»).

## Angaben je Folie

Einzelne Folien lassen sich anders gestalten als der Rest. Dazu steht auf der Folie ein HTML-Kommentar mit einem oder mehreren Schlüsseln:

```markdown
# Zwischenstand

<!-- _backgroundColor: "#fff3bf" -->
<!-- _paginate: false -->
```

**Die Geltung hängt am Unterstrich:**

- Mit `_` vor dem Schlüssel gilt die Angabe **nur für diese Folie**.
- Ohne `_` gilt sie **ab dieser Folie** für alle folgenden, bis eine neue Angabe desselben Schlüssels kommt.
- Allein `headingDivider` gilt immer für den ganzen Foliensatz (siehe «An Überschriften trennen»).

**Gedeutet werden diese Schlüssel:**

| Schlüssel | Wirkung |
| --------- | ------- |
| `theme` | wechselt das Theme, mit dem Namen eines mitgelieferten oder eigenen Themes |
| `backgroundColor`, `backgroundImage` | Hintergrund der Folie, etwa eine Farbe oder ein Farbverlauf |
| `color` | Schriftfarbe des Fließtexts |
| `header`, `footer` | Text der Kopf- und der Fußzeile; ein leerer Text blendet die Zeile aus |
| `paginate` | `true` zeigt die Seitenzahl, `false` verbirgt sie und zählt weiter, `hold` zeigt sie, ohne weiterzuzählen, `skip` verbirgt sie, ohne weiterzuzählen |
| `background`, `text`, `heading`, `accent`, `font`, `header-footer`, `page-number` | die sieben Werte aus der Tafel «Einzelne Werte übersteuern» |

Ein Wechsel des Themes ersetzt das Theme samt den eigenen Werten aus dem Block im Kopf; Farben und Schrift, die per Kommentar gesetzt sind, gelten über den Wechsel hinweg weiter. Werte, die eine Datei oder Adresse laden würden, werden wie im Kopf nicht übernommen; ein Hintergrundbild setzt die Schreibweise mit `bg` (siehe «Hintergrundbild und Zweiteilung»). Ist ein Wert ungültig oder ein Theme unbekannt, gilt der bisherige Wert weiter, und die Hinweis-Zeile nennt den Grund auf dieser Folie.

Solche Kommentare sind keine Sprecher-Notizen. Weitere Schlüssel derselben Schreibweise, etwa `class` oder `style`, stehen im Dokument, bleiben hier aber ohne Wirkung (siehe «Verträglichkeit mit anderen Werkzeugen»).

## Sprecher-Notizen

Kommentare auf einer Folie sind ihre **Sprecher-Notizen**. Beide Formen gelten:

```markdown
# Ergebnisse

- Umsatz gestiegen
- Kosten gesenkt

%% Hier die Zahlen des Vorjahres nennen. %%

<!-- Bei Fragen auf den Anhang verweisen. -->
```

Notizen erscheinen nicht auf der Folie und nicht in der Vorführung. Die **Referenten-Ansicht** zeigt sie dem Vortragenden, formatiert wie Text auf einer Folie, also mit fett, kursiv, Listen und Verweisen; HTML in einer Notiz erscheint dort als Text. In PDF und HTML-Seiten erscheinen sie nur, wenn sie eingeschaltet sind (siehe «Sprecher-Notizen mitgeben»). Im Editor bleiben sie sichtbar. Ist die Erweiterung „Kommentare" abgeschaltet, ist `%%` gewöhnlicher Text und erscheint auf der Folie; HTML-Kommentare bleiben auch dann Notizen. Mehr zu den privaten Kommentaren mit `%%` steht auf der Seite [Inline-Konstrukte](inline.md).

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

## Folien-Übersicht

**Ansicht → Präsentation → Folien-Übersicht** zeigt in der Ansicht **Folien** alle Folien als **Raster**, jede als kleines Bild mit ihrer Nummer. Ausgewählt ist zu Beginn die Folie, die die Ansicht gerade zeigt.

| Eingabe | Wirkung |
| ------- | ------- |
| `Pfeil links`, `Pfeil rechts` | eine Folie zurück oder weiter |
| `Pfeil hoch`, `Pfeil runter` | eine Zeile des Rasters hoch oder runter |
| `Pos1`, `Ende` | erste bzw. letzte Folie |
| Klick, `Enter`, `Leertaste` | zur gewählten Folie wechseln und die Übersicht schließen |
| `Esc` | die Übersicht schließen, ohne die Folie zu wechseln |

Das Mausrad rollt das Raster. Ein zweiter Aufruf des Befehls schließt die Übersicht ebenfalls, ebenso der Start einer Vorführung. Die Übersicht zeigt den Stand beim Öffnen; ein erneutes Öffnen zeigt Änderungen am Dokument. Der Befehl steht auch in der Kommando-Palette.

## Vorführung

Die Vorführung zeigt die Präsentation im **Vollbild**: Das Fenster geht ins Vollbild, alle Leisten der Anwendung verschwinden, und zu sehen ist allein die Folie, so groß, wie der Bildschirm sie fasst. Gestartet wird sie in der Ansicht **Folien**:

- über **Ansicht → Präsentation → Vorführung starten**,
- mit Standard `F5`,
- mit der Schaltfläche **Vorführung starten** über der Folie.

Die Kommando-Palette führt den Befehl ebenfalls. Die Vorführung beginnt an der Folie, die die Ansicht gerade zeigt. Geblättert wird mit denselben Tasten wie in der Ansicht; dazu blättert ein **Mausklick** eine Folie weiter und das **Mausrad** eine Folie je Rad-Bewegung, nach unten weiter und nach oben zurück. Listen, deren Punkte Schritt für Schritt erscheinen sollen, beschreibt «Listen Punkt für Punkt aufdecken».

**Beendet** wird sie mit `Esc`. Sie endet auch, wenn das Vollbild auf anderem Weg verlassen wird, wenn ein anderes Fenster in den Vordergrund kommt oder wenn Dokument oder Ansicht wechseln. Danach steht die Ansicht auf der zuletzt gezeigten Folie. Das Fenster verlässt das Vollbild wieder, es sei denn, es war schon vor der Vorführung darin.

Diese Vorführung läuft immer im Fenster der Anwendung, auch wenn ein zweiter Bildschirm angeschlossen ist. Für den Vortrag mit Beamer oder zweitem Bildschirm gibt es die Vorführung im eigenen Fenster und die Referenten-Ansicht (siehe «Vortragen mit zwei Bildschirmen»).

## Listen Punkt für Punkt aufdecken

Die Punkte einer Liste lassen sich in der Vorführung **einzeln aufdecken**. Maßgeblich ist die Schreibweise der Liste:

```markdown
* erscheint mit dem ersten Schritt
* erscheint mit dem zweiten Schritt

1) auch nummerierte Listen
2) mit Klammer statt Punkt

- erscheint sofort
1. erscheint ebenfalls sofort
```

Punkte mit `*` und nummerierte Punkte mit `)` werden aufgedeckt, Punkte mit `-` oder `+` und nummerierte Punkte mit `.` stehen sofort da. Jeder Punkt ist ein Schritt, auch ein eingerückter; ein eingerückter Punkt bleibt verborgen, solange sein übergeordneter Punkt es ist.

In der Vorführung, gleich ob im Vollbild oder im eigenen Fenster, und in der Referenten-Ansicht deckt «weiter» den nächsten Punkt auf, erst nach dem letzten kommt die nächste Folie; «zurück» deckt den zuletzt aufgedeckten Punkt wieder zu. Eine Folie, die man rückwärts betritt, erscheint vollständig, eine Folie, die man vorwärts betritt, mit verdeckten Punkten. Verdeckte Punkte behalten ihren Platz, sodass die Folie beim Aufdecken nicht springt.

In der Ansicht **Folien**, in der Folien-Übersicht, in der Vorschau der nächsten Folie und in beiden Exporten erscheinen alle Punkte sofort.

## Vortragen mit zwei Bildschirmen

Für einen Vortrag mit Beamer oder zweitem Bildschirm zeigt ein **eigenes Fenster** dem Publikum allein die Folie, während das Fenster der Anwendung bedienbar bleibt. Beide Befehle stehen in der Ansicht **Folien** zur Wahl, im Untermenü **Ansicht → Präsentation** und in der Kommando-Palette; ein Vorgabe-Kürzel haben sie nicht, eines lässt sich unter Einstellungen → Tastenkürzel belegen.

**Der Bildschirm:** Sind zwei oder mehr Bildschirme angeschlossen, öffnet das Fenster im Vollbild auf einem Bildschirm, auf dem das Fenster der Anwendung nicht steht. Mit einem einzigen Bildschirm öffnet es als gewöhnliches Fenster, das sich verschieben und in der Größe ändern lässt. Das Fenster hat weder Menü noch Reiter, zählt nicht zu den Fenstern der Applikation und kehrt nach einem Neustart nicht zurück.

### Vorführung im eigenen Fenster

**Ansicht → Präsentation → Vorführung im eigenen Fenster** öffnet das Fenster für das Publikum und zeigt darin die Folie, die die Ansicht gerade zeigt. Geblättert wird in beiden Fenstern mit denselben Tasten wie in der Ansicht; im Fenster des Publikums blättern auch Mausklick und Mausrad. Beide Fenster zeigen stets dieselbe Folie. Änderungen am Dokument erscheinen sofort auch beim Publikum.

**Beendet** wird sie mit `Esc` in einem der beiden Fenster, mit **Ansicht → Präsentation → Vorführung beenden** oder durch Schließen des Fensters für das Publikum. Sie endet auch, wenn das Dokument nicht mehr in der Ansicht **Folien** steht. Es läuft immer nur eine Vorführung zugleich.

### Referenten-Ansicht

**Ansicht → Präsentation → Referenten-Ansicht** startet die Vorführung im eigenen Fenster und macht das Fenster der Anwendung zum Platz des Vortragenden. Dort stehen:

- links die **aktuelle Folie**, wie das Publikum sie sieht;
- rechts oben die **nächste Folie**, auf der letzten Folie stattdessen das Wort «Ende»;
- darunter die **Sprecher-Notizen** der aktuellen Folie, formatiert und bei langen Notizen rollbar; ohne Notizen ein kurzer Hinweis;
- darunter die **verstrichene Zeit** seit dem Start und die **Uhrzeit**, dazu die Schaltflächen **Anhalten** bzw. **Fortsetzen** und **Zurücksetzen**.

Über beiden stehen wie gewohnt der Zähler und die Schaltflächen **Zurück** und **Weiter**. Die Zeit beginnt mit dem Start der Referenten-Ansicht; **Zurücksetzen** stellt sie auf null, eine laufende Zeit läuft danach weiter, eine angehaltene bleibt angehalten.

Geblättert wird wie in der Vorführung im eigenen Fenster, in beiden Fenstern mit denselben Tasten; Listen mit aufzudeckenden Punkten deckt «weiter» Schritt für Schritt auf. Wird das Dokument während des Vortrags geändert, ziehen aktuelle Folie, nächste Folie und Notizen sofort nach; entfällt die gezeigte Folie, steht die Ansicht auf der letzten vorhandenen.

**Beendet** wird die Referenten-Ansicht auf denselben Wegen wie die Vorführung im eigenen Fenster. Danach ist die Zeit fort, und die Ansicht **Folien** steht auf der zuletzt gezeigten Folie.

## Foliensatz exportieren

Beide Ausgaben stehen unter **Datei → Weitere Datei-Funktionen → Exportieren** und in der Kommando-Palette. Sie stehen bei jedem Präsentations-Dokument zur Wahl, gleich in welcher Ansicht es gerade steht; bei einem Dokument ohne Kennzeichen bleiben sie gedämpft. Jede Folie erscheint darin so, wie die Ansicht sie zeigt, mit Theme, Angaben je Folie, Hintergrundbildern, Seitenzahl, Kopf- und Fußzeile, Diagrammen und Formeln, aber ohne den Balken übervoller Folien. Sprecher-Notizen kommen nur mit, wenn sie eingeschaltet sind (siehe unten). Bricht man den Dialog ab, entsteht nichts. Nach dem Export meldet die Statusleiste die Zahl der Folien und, falls etwas entfallen ist, was.

### Als PDF

**Foliensatz als PDF exportieren…** fragt nach dem Ziel, vorgeschlagen ist der Name des Dokuments mit der Endung `.pdf` im selben Ordner, und schreibt eine PDF-Datei mit **einer Folie je Seite**. Die Seite hat das Format der Folie, 16:9 oder 4:3, und keinen Rand. Die Einstellungen für Papierformat und Ränder des gewöhnlichen PDF-Exports wirken hier nicht.

### Als HTML-Seiten

**Foliensatz als HTML exportieren…** fragt nach einem Ordner und legt darin **eine HTML-Seite je Folie** an: `folie-001.html`, `folie-002.html` und so fort, dazu `index.html` als Startseite mit der ersten Folie. Ist der gewählte Ordner leer oder enthält er einen früheren Export, entstehen die Seiten darin; sonst entsteht ein Unterordner mit dem Namen des Dokuments und dem Zusatz `-Folien`, und die vorhandenen Dateien bleiben unberührt.

Die Seiten öffnet jeder Browser, ohne die Anwendung und ohne Netzverbindung. Jede Seite ist für sich vollständig: Bilder, Diagramme und Formeln sind in ihr eingebettet, sodass sich der Ordner als Ganzes verschieben oder weitergeben lässt. Unter der Folie stehen **Zurück**, der Zähler und **Weiter**, in der Sprache, die die Oberfläche beim Export hatte; geblättert wird außerdem mit denselben Tasten wie in der Vorführung, und die Folie passt sich der Größe des Browser-Fensters an. Verweise und Bilder folgen den Regeln des HTML-Exports eines Dokuments (siehe [Werkzeuge](tools.md)): Ein Verweis auf ein anderes Dokument bleibt als Text stehen, und ein Bild, das sich nicht einbetten lässt, steht als sein Text; ein solches Hintergrundbild entfällt.

### Sprecher-Notizen mitgeben

Ob die Notizen in die Ausgabe kommen, bestimmt der Schalter **Sprecher-Notizen mitgeben** unter **Datei → Einstellungen… → Export**, Gruppe **Foliensatz**. Er ist zu Beginn aus, damit eine Weitergabe nie unbemerkt Notizen enthält, und gilt für beide Ausgaben.

- **Im PDF** folgt hinter jeder Folie mit Notizen eine **Notiz-Seite** im Format der Folie, überschrieben mit «Folie N – Notizen», darunter die Notizen formatiert auf weißem Grund. Längere Notizen laufen auf weiteren Seiten desselben Formats weiter.
- **In den HTML-Seiten** steht bei jeder Folie mit Notizen zwischen Folie und Blätter-Leiste ein zugeklappter Bereich **Notizen**. Aufgeklappt legt er sich über die Folie, höchstens bis zur halben Höhe des Browser-Fensters, und lässt sich rollen.

Folien ohne Notizen bekommen weder Notiz-Seite noch Notiz-Bereich. Mit eingeschaltetem Schalter nennt die Meldung nach dem Export die Zahl der mitgegebenen Notizen; ausgeschaltet meldet sie, dass Sprecher-Notizen nicht enthalten sind.

## Die Erweiterung „Präsentations-Ansicht"

Die Funktion gehört zu den [internen Erweiterungen](extensions.md) („Präsentations-Ansicht", Gruppe „Rendering") und zum Arbeitsmodus **Fortgeschritten**: Im Modus **Einsteiger** ist sie aus, in **Fortgeschritten** und **Voll** an.

Ist sie abgeschaltet, entfallen die Ansicht **Folien**, das Untermenü **Präsentation** im Menü **Ansicht** mit allen seinen Befehlen, die beiden Export-Befehle, ihre Einträge in Kommando-Palette und Tastenbelegung und der Abschnitt **Folien-Themes** der Einstellungen. Das Kennzeichen hat dann keine Wirkung: Ein Präsentations-Dokument ist ein gewöhnliches Markdown-Dokument, und `---` ist darin eine waagerechte Linie. Ein Dokument, das in der Ansicht **Folien** offen war, erscheint in der Lese-Ansicht. Verloren geht dabei nichts, und geschrieben wird beim Ab- und Einschalten nie; nach dem Wiedereinschalten sind die Präsentation und die eigenen Themes unverändert da.

## Verträglichkeit mit anderen Werkzeugen

Kennzeichen, Steuer-Schlüssel, Trennzeilen, die Angaben je Folie und die Bild-Schreibweise mit `bg` folgen einem verbreiteten Werkzeug, das Folien aus Markdown erzeugt und seine Dateien mit `marp: true` kennzeichnet. Die Verträglichkeit ist eine ausdrückliche Zusage: Eine dort geschriebene Präsentation öffnet hier als Präsentation, ohne dass an der Datei etwas geändert werden muss.

**Was hier wie dort gilt:**

- das Kennzeichen `marp: true` und die Trennung an `---`;
- die Schlüssel `paginate`, `header`, `footer` und `size` im Kopf und `headingDivider` mit einer Zahl;
- die Angaben je Folie in derselben Schreibweise, mit `_` nur für die eigene Folie und ohne `_` ab dieser Folie, für `backgroundColor`, `backgroundImage`, `color`, `header`, `footer` und `paginate`;
- die Bild-Schreibweise `![bg …](…)` samt Zweiteilung;
- Listen mit `*` und mit `1)`, deren Punkte in der Vorführung einzeln erscheinen;
- HTML-Kommentare als Sprecher-Notizen. Kommentare mit Angaben je Folie zählen hier wie dort nicht als Notiz.

**Wo die Anwendung abweicht:**

- **`***` und `___` trennen hier keine Folien.** Das andere Werkzeug beginnt auch an ihnen eine neue Folie. Wer eine Datei in beiden Werkzeugen gleich geteilt sehen will, trennt allein mit `---` und setzt Linien auf einer Folie nicht mit `***` oder `___`.
- **`%%`-Notizen kennt das andere Werkzeug nicht** und zeigt sie als Text auf der Folie. Wer Notizen in beiden Werkzeugen braucht, schreibt sie als HTML-Kommentar `<!-- … -->`; diese gelten in beiden Richtungen.
- **Die Themes des anderen Werkzeugs gibt es hier nicht.** `default`, `gaia` und `uncover` sind hier unbekannt; die Folien erscheinen dann im Theme `light`, und die Hinweis-Zeile nennt den Namen. Ein **eigenes Theme** darf aber genau so heißen und greift dann: Wer unter dem Namen `gaia` ein eigenes Theme anlegt, sieht die Datei hier in dieser Gestaltung, ohne sie zu ändern.
- **`theme` in einem Kommentar gilt hier ab seiner Folie.** Das andere Werkzeug wendet ein Theme stets auf den ganzen Foliensatz an. Wer eine Datei in beiden Werkzeugen gleich sehen will, wählt das Theme im Kopf.
- **Einige Angaben je Folie bleiben ohne Wirkung:** `class`, `style`, `backgroundPosition`, `backgroundRepeat` und `backgroundSize`, ebenso `lang` und `math`. Sie bleiben im Dokument stehen und werden nicht ausgeführt, ohne Hinweis. Ein Hintergrundbild über `backgroundImage` mit einer Datei oder Adresse wird nicht geladen; dafür gibt es die Schreibweise mit `bg`.
- **`headingDivider` als Liste**, etwa `[1, 3]`, bleibt ohne Wirkung; eine Datei, die sie nutzt, ergibt hier weniger Folien.
- **Der Kommentar `<!-- fit -->`**, mit dem das andere Werkzeug eine Überschrift auf die Breite der Folie bringt, bleibt ohne Wirkung. Hier wird stattdessen eine übervolle Folie als Ganzes verkleinert.

**Was sonst zu beachten ist:**

- Die Anwendung schreibt `marp: true` nie selbst. Wer seine Datei auch im anderen Werkzeug vorführen will, trägt es zusätzlich zu `presentation: true` ein.
- Der Block unter `theme:` mit eigenen Werten und die sieben Werte als Angabe je Folie, etwa `<!-- accent: "#ff6b6b" -->`, sind eine Schreibweise dieser Anwendung.
- Das Wort `bg` muss hier das **erste** Wort des Alternativtexts sein. Weitere Wörter, etwa Bild-Filter, werden nicht gedeutet.

## Grenzen

- **Ausgegeben wird als PDF und als HTML-Seiten.** Eine Datei im Format pptx entsteht nicht.
- **Gestaltet wird über die Themes und ihre sieben Werte.** Eigene Stilangaben in CSS, Folien-Layouts über die Zweiteilung hinaus sowie Animationen und Übergänge zwischen den Folien gibt es nicht.
- **Aufgedeckt werden nur Listen-Punkte**, keine anderen Teile einer Folie.
- **Verkleinert wird höchstens auf die Hälfte.** Was dann noch nicht passt, wird abgeschnitten.
- **Bearbeitet wird in den Markdown-Ansichten**, nicht auf der Folie.

Die Ausgabe als pptx-Datei ist für eine spätere Ausbaustufe vorgesehen.
