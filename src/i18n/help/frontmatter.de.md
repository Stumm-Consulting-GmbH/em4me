# Frontmatter und Properties

Ein YAML-Block am Datei-Anfang trägt Metadaten. Er erscheint in der Lese-Ansicht als zusammengeklappte Frontmatter-Zeile, wird im Quellcode-Editor dezent abgesetzt dargestellt und über die Properties-Sidebar formularartig gepflegt.

## YAML-Block

Der Block steht zwischen zwei `---`-Zeilen und muss die allererste Zeile der Datei sein — deshalb zeigt diese Handbuch-Seite ihn als Code-Block statt live:

```markdown
---
title: Projektplan
aliases: [Plan, Roadmap]
tags: [projekt/markdown, planung]
review: 2026-07-01
final: false
---
```

## Anzeige im Gerenderten

Am Anfang der gerenderten Ansicht erscheint das Frontmatter als dezente, zusammengeklappte Zeile mit der Feldanzahl. Überfahren mit der Maus klappt das Klartext-YAML auf (einschließlich Kommentaren), Wegbewegen klappt es wieder zu; ein Klick auf die Zeile stellt sie fest, ein weiterer Klick löst. Die Zeile ist per Tastatur bedienbar (Fokussieren, dann Enter oder Leertaste) und reine Anzeige — bearbeitet wird über die Properties-Sidebar oder den Quelltext. Bei einem YAML-Syntaxfehler zeigt die Zeile den Roh-Text ohne Feldanzahl.

Im Live-Modus ersetzt dieselbe Zeile die YAML-Zeilen, solange der Cursor außerhalb steht; Cursor-Eintritt oder ein Klick in das aufgeklappte YAML wechselt zum editierbaren Quelltext, Verlassen klappt wieder zusammen.

Die Anzeige lässt sich unter Datei → Einstellungen… → Darstellung abschalten (Standard: eingeschaltet). Dort hält der zusätzliche Schalter „Frontmatter ausgeklappt anzeigen" (Standard: aus) den Block dauerhaft offen — in der gerenderten Ansicht, im Live-Modus und damit auch im PDF-Export.

## Besondere Felder

- `aliases:` macht die Datei unter weiteren Namen per `[[Alias]]` verlinkbar; Backlinks finden sie über alle Aliases und kennzeichnen Treffer mit „via Alias" (siehe [Vernetzung](linking.md)).
- `tags:` ergänzt Tags zusätzlich zu den `#tags` im Fließtext; beide Quellen landen in der Tag-Sidebar.

## Editor-Ansicht pro Dokument

Die drei Editor-Ansicht-Schalter — Gliederungs-Spur, Zeilennummern und Zeilenumbruch — werden pro Dokument im Frontmatter gespeichert und reisen mit der Datei, auch beim Kopieren oder Öffnen auf einem anderen Rechner:

```markdown
---
fold-gutter: false
line-numbers: true
word-wrap: true
---
```

Nur echte `true`/`false`-Werte wirken; andere Werte werden ignoriert. Aufgelöst wird in dieser Reihenfolge: der Frontmatter-Schlüssel vor der globalen Voreinstellung (Datei → Einstellungen… → Darstellung) vor dem eingebauten Standard (Gliederung an, Zeilennummern an, Zeilenumbruch aus).

Das Umschalten über die Statusbar oder das Ansicht-Menü schreibt den neuen Wert direkt in das Frontmatter des aktiven Dokuments: Die Datei wird dadurch änderungsbedürftig und über den normalen Speicher-Weg gesichert. Hat ein Dokument noch kein Frontmatter, legt das Umschalten den Block an.

Sonderfälle: In schreibgeschützten Zielen (etwa Handbuch-Seiten) und bei fehlerhaftem YAML wirkt der Schalter nur flüchtig für die laufende Sitzung. In Unbenannt-Tabs gilt er ebenfalls flüchtig; beim ersten Speichern übernimmt die App die Werte, die von der Voreinstellung abweichen, in das Frontmatter der neuen Datei.

## Titelbild

Die Eigenschaft `cover` stellt dem Dokument ein Bild voran: über die ganze Breite des Inhalts, auf eine einstellbare Höhe beschnitten und nie verzerrt. Zwei weitere Eigenschaften legen Höhe und Ausschnitt fest:

```markdown
---
cover: bilder/strand.jpg
cover-height: 240
cover-position: top
---
```

Das Bild lässt sich auf zwei Arten angeben:

- **als Pfad relativ zum Dokument**, wie bei einem gewöhnlichen Bild: `cover: bilder/strand.jpg`. Es gelten dieselbe Grenze, dieselben Formate und dieselbe Obergrenze von 20 MB wie auf der Seite [Bilder](images.md).
- **als Name in doppelten eckigen Klammern, in Anführungszeichen**: `cover: "[[strand.jpg]]"`. So findet die Anwendung das Bild über seinen Namen, gleich in welchem Ordner des Bereichs es liegt.

Wird das Bild umbenannt, passt die Anwendung den Wert von `cover` nicht an; der neue Name wird von Hand eingetragen.

`cover-height` ist die Höhe in Bildpunkten, Vorgabe 200; Werte unter 80 oder über 600 werden auf die nächste Grenze gesetzt. `cover-position` wählt den sichtbaren Ausschnitt des Bildes: eine Zahl von 0 bis 100, gemessen von oben (0 zeigt den oberen Rand, 100 den unteren), oder eines der Wörter `top`, `center` und `bottom`; Vorgabe ist die Mitte. Was nicht verstanden wird, fällt still auf die Vorgabe zurück.

Das Titelbild erscheint in der gerenderten Ansicht, in deren Hälfte der geteilten Ansicht und im Live-Modus, unter der [Titelzeile](tools.md) mit dem Dateinamen und über der Frontmatter-Zeile. Im Live-Modus bleibt es stehen, auch während der Cursor in den YAML-Zeilen steht, und eine Änderung an `cover` zeigt sofort das neue Bild. Das Titelbild hängt nicht an der Frontmatter-Anzeige und erscheint auch, wenn sie abgeschaltet ist; ein Block mit YAML-Syntaxfehler ergibt kein Titelbild.

Druck, PDF-Export und HTML-Export enthalten das Titelbild so, wie die gerenderte Ansicht es zeigt. Die [Präsentation](presentation.md), eingebettete Dokumente, Karten und Vorschauen zeigen kein Titelbild.

Findet die Anwendung das Bild nicht — die Datei fehlt, liegt außerhalb der Grenze, ist keine Bilddatei oder größer als 20 MB —, steht an seiner Stelle der unauffällige Hinweis «Titelbild nicht gefunden», ohne Fehlermeldung. Ebenso ist es in einem noch nie gespeicherten Dokument, bis es gespeichert ist. Eine Adresse aus dem Netz (`http:` oder `https:`) lädt die Anwendung nicht; an ihrer Stelle steht ein Hinweis, das Bild als Datei in den Bereich zu legen. Druck und Export lassen die Hinweise weg; ein Titelbild ohne Bild entfällt dort ganz.

Buch- und Regal-Dateien tragen ihr Titelbild in derselben Eigenschaft `cover` (siehe [Bücher](books.md)); öffnet man eine solche Datei als Dokument, steht das Bild auch oben über ihrem Inhalt.

Das Titelbild gehört zur [internen Erweiterung](extensions.md) «Titelbild», die ab dem Arbeitsmodus **Fortgeschritten** eingeschaltet ist. Ist sie aus, erscheinen weder Bild noch Hinweis; die Eigenschaften bleiben unverändert im Dokument und in der Properties-Sidebar, und nach dem Einschalten ist das Titelbild wieder da.

## Mindmap pro Dokument

Der Schlüssel `mindmap` legt fest, wie die [Mindmap-Ansicht](mindmap.md) genau dieses Dokument zeichnet, und übersteuert damit die Voreinstellung unter Datei → Einstellungen… → Mindmap:

```markdown
---
mindmap:
  layout: mitte
  linienfuehrung: gerade
  anfangsTiefe: 2
---
```

`layout` nimmt die Lage der Wurzel (`links`, `mitte`, `rechts`, `oben`, `unten`), `linienfuehrung` die Werte `geschwungen` und `gerade`; dazu kommen die Zahlen `farbEinfrierEbene`, `anfangsTiefe` und `hoechstBreite`. Was nicht verstanden wird, fällt still auf die Voreinstellung zurück.

## Properties-Sidebar

Die Properties-Sidebar zeigt die Frontmatter-Felder live editierbar. Der Feld-Typ wird aus dem Wert abgeleitet: Text, Liste, Datum, Zahl, Wahr/Falsch oder Mehrzeilig. Neue Felder entstehen über „+ Eigenschaft hinzufügen"; Änderungen folgen dem Auto-Save-Setting.

Ein Klick in ein Wert-Feld bietet die Werte an, die im Bereich für diese Eigenschaft bereits vergeben sind, alphabetisch geordnet; mit jedem getippten Zeichen verkleinert sich die Liste, und ein eigener Wert bleibt frei eingebbar. Gibt ein Eigenschafts-Profil einen Wertevorrat vor, erscheinen beide Herkünfte gemeinsam und bleiben unterscheidbar — die Werte aus dem Bestand sind als solche gekennzeichnet. Kommt die Eigenschaft im Bereich nirgends vor, erscheint keine Liste. Abschaltbar unter Datei → Einstellungen… → Erweiterungen.

Beim Schreiben bleibt der Block im Round-Trip erhalten: Kommentare, Feld-Reihenfolge und Stil nicht geänderter Felder werden nicht umformatiert, auch CRLF-Zeilenenden bleiben stabil. Einzeilige Listen in eckigen Klammern werden ohne Innen-Abstände geschrieben (`[a, b]`); eine Liste in der Schreibweise `[ a, b ]` wechselt beim ersten Speichern einmalig auf diese Form und bleibt danach unverändert.

Bei einem YAML-Syntaxfehler zeigt die Sidebar die Fehlermeldung und sperrt das Hinzufügen, bis der Block im Editor repariert ist.

## Erstellungs- und Änderungszeitpunkt

Zwei Felder lassen sich beim Speichern automatisch pflegen: der Erstellungszeitpunkt aus der Erstellungszeit der Datei und der Änderungszeitpunkt aus dem Speicherzeitpunkt.

```yaml
created: 2025-06-23 15:43
updated: 2026-07-18 12:04
```

Beide Felder sind unabhängig zuschaltbar, ihre Namen frei wählbar. Als Format steht nur Datum oder Datum und Uhrzeit zur Wahl, jeweils in lokaler Zeit. Ein bereits vorhandener Erstellungszeitpunkt wird nie überschrieben; der Änderungszeitpunkt wandert mit jedem Speichern mit. Setzt ein Speichern den Änderungszeitpunkt neu, nimmt ein `Strg+Z` unmittelbar danach den Zeitpunkt und die letzte Änderung davor zusammen zurück, auch nach dem automatischen Speichern.

Fehlende Felder werden nur angelegt, wenn die entsprechende Option aktiv ist. Sonst werden ausschließlich Felder gepflegt, die bereits im Block stehen, und das Dokument bleibt im Übrigen unverändert. Zugang und Schalter stehen in der [Funktions-Tabelle](functions.md).
