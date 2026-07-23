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

## Properties-Sidebar

Die Properties-Sidebar zeigt die Frontmatter-Felder live editierbar. Der Feld-Typ wird aus dem Wert abgeleitet: Text, Liste, Datum, Zahl, Wahr/Falsch oder Mehrzeilig. Neue Felder entstehen über „+ Eigenschaft hinzufügen"; Änderungen folgen dem Auto-Save-Setting.

Beim Schreiben bleibt der Block im Round-Trip erhalten: Kommentare, Feld-Reihenfolge und Stil nicht geänderter Felder werden nicht umformatiert, auch CRLF-Zeilenenden bleiben stabil.

Bei einem YAML-Syntaxfehler zeigt die Sidebar die Fehlermeldung und sperrt das Hinzufügen, bis der Block im Editor repariert ist.

## Erstellungs- und Änderungszeitpunkt

Zwei Felder lassen sich beim Speichern automatisch pflegen: der Erstellungszeitpunkt aus der Erstellungszeit der Datei und der Änderungszeitpunkt aus dem Speicherzeitpunkt.

```yaml
created: 2025-06-23 15:43
updated: 2026-07-18 12:04
```

Beide Felder sind unabhängig zuschaltbar, ihre Namen frei wählbar. Als Format steht nur Datum oder Datum und Uhrzeit zur Wahl, jeweils in lokaler Zeit. Ein bereits vorhandener Erstellungszeitpunkt wird nie überschrieben; der Änderungszeitpunkt wandert mit jedem Speichern mit.

Fehlende Felder werden nur angelegt, wenn die entsprechende Option aktiv ist. Sonst werden ausschließlich Felder gepflegt, die bereits im Block stehen, und das Dokument bleibt im Übrigen unverändert. Zugang und Schalter stehen in der [Funktions-Tabelle](functions.md).
