# Mindmap-Ansicht

Die Mindmap-Ansicht zeigt die Struktur **eines** Dokuments als Karte: Überschriften und Listenpunkte werden zu Knoten eines Baums, der Fließtext darunter wird zur Notiz seines Knotens. Sie ist eine Ansicht auf dasselbe Dokument, kein zweites Dokument, und ändert den Text nicht.

Die Ansicht gehört zur Erweiterung **Mindmap-Ansicht** und lässt sich unter Einstellungen → Erweiterungen abschalten. Ist sie aus, entfällt der Menü-Eintrag, und ein Reiter, der zuletzt als Mindmap offen war, kehrt in die Lese-Ansicht zurück.

## Öffnen

Die Mindmap ist der fünfte Ansichts-Modus eines Reiters, neben Quellcode, Geteilt, Gerendert und Live: Ansicht → Mindmap oder Standard `Strg+5`. Der Modus gilt pro Reiter, ein Dokument darf also als Karte offen sein, während daneben ein zweites im Quelltext bearbeitet wird. Die Karte folgt dem Dokument: Wer im Quelltext eine Überschrift ergänzt, sieht sie kurz darauf in der Karte.

## Was zum Knoten wird

| Im Dokument | In der Karte |
| ----------- | ------------ |
| Überschriften | die oberen Ebenen des Baums |
| Listenpunkte | setzen die Hierarchie unter ihrem Knoten fort |
| Absätze, Tabellen, Code-Blöcke, Bilder | Notiz ihres übergeordneten Knotens |

Die Wurzel ist die Überschrift erster Ebene, sofern das Dokument genau eine trägt; sonst trägt der Dateiname die Wurzel, und alle Überschriften erster Ebene werden ihre Kinder. Eine übersprungene Ebene erzeugt keinen Leerknoten: Ein Knoten hängt am nächsthöheren vorhandenen Vorfahren.

## Lage der Wurzel

Die Wuchsrichtung ist wählbar, weil sie am Dokument und am Bildschirm hängt: Ein tiefer Baum liest sich von links nach rechts besser, ein flacher, breiter von oben nach unten, und die mittige Lage nutzt einen breiten Bildschirm am besten aus.

| Lage | Bild |
| ---- | ---- |
| **Links** | Wurzel links, alle Äste wachsen nach rechts |
| **Mitte** | Wurzel mittig, die Äste verteilen sich auf beide Seiten |
| **Rechts** | Wurzel rechts, alle Äste wachsen nach links |
| **Oben** | Wurzel oben, der Baum wächst nach unten |
| **Unten** | Wurzel unten, der Baum wächst nach oben |

Der Knotentext bleibt in jeder Lage waagerecht lesbar; gedreht wird die Anordnung, nicht die Beschriftung. Bei mittiger Lage bleiben die Hauptäste in Dokument-Reihenfolge und werden an einer Stelle geteilt: Die vorderen Äste stehen rechts, die übrigen links, und geteilt wird dort, wo beide Seiten möglichst gleich hoch werden. Dasselbe Dokument ergibt damit stets dasselbe Bild.

## Bedienung

- **Klappen** — der Kreis am Ast-Ende klappt den Teilbaum zu und wieder auf. Mit `Strg` wirkt der Klick auf den ganzen Unterbaum.
- **Zoom** — Mausrad über der Fläche, zentriert um den Mauszeiger.
- **Verschieben** — die Fläche mit gedrückter Maustaste ziehen. Beim Wechsel in die Ansicht passt sich die Karte selbst ins Bild ein; ein erneuter Wechsel holt sie nach freiem Zoomen und Verschieben zurück.
- **Notizen** — Knoten mit Fließtext tragen ein Zettel-Symbol; ein Klick darauf zeigt den Text in einem Feld neben dem Knoten. Ein Klick auf die freie Fläche schließt es wieder.
- **Sprung zur Quelle** — ein Klick auf den Knotentext wechselt in die geteilte Ansicht und setzt den Cursor auf die zugehörige Zeile.

Der Klapp-Zustand gilt für die laufende Sitzung und wird weder in das Dokument noch in eine Begleitdatei geschrieben: Reiner Anzeige-Zustand soll ein Format nicht belasten, das ohne die Anwendung lesbar bleibt.

## Darstellung einstellen

Der Bereich Mindmap der Einstellungen ist die **Vorgabe für alle Dokumente**:

- **Lage der Wurzel** — die fünf Richtungen von oben.
- **Linienführung** — geschwungene oder gerade Verbindungen.
- **Ast-Farbe einfrieren ab Ebene** — bis zu welcher Ebene ein neuer Ast eine eigene Farbe bekommt; darunter erbt der ganze Teilbaum die Farbe seines Hauptastes.
- **Anfangs ausgeklappte Tiefe** — bis zu welcher Tiefe die Karte offen startet; `-1` klappt alles aus.
- **Höchstbreite eines Knotens** — ab welcher Breite ein langer Titel umbricht.

## Vorgabe je Dokument

Jedes Dokument darf die Vorgabe für sich übersteuern, im YAML-Kopf unter dem Schlüssel `mindmap`:

```yaml
---
mindmap:
  layout: mitte
  linienfuehrung: gerade
  anfangsTiefe: 2
---
```

Die Angabe gilt nur für dieses Dokument; alle übrigen folgen weiter der Einstellung. Erlaubt sind für `layout` die Werte `links`, `mitte`, `rechts`, `oben` und `unten`, für `linienfuehrung` die Werte `geschwungen` und `gerade`; dazu die Zahlen `farbEinfrierEbene`, `anfangsTiefe` und `hoechstBreite`. Was nicht verstanden wird, fällt still auf die Vorgabe zurück, damit die Datei lesbar bleibt. Die übrigen Kopf-Angaben beschreibt die Seite [Frontmatter und Properties](frontmatter.md).

## Grenzen

- Die Karte ist eine **Darstellung**, kein Editor: Knoten lassen sich nicht in ihr verschieben oder umbenennen. Geändert wird im Dokument, die Karte zieht nach.
- Sie zeigt **ein** Dokument. Die Beziehungen zwischen Dateien zeigt die [Graphenansicht](graph.md).
- Sehr große Dokumente werden bei 3000 Knoten gekappt; ein Hinweis unter der Karte nennt die Zahl der dargestellten Knoten.
- Ein Dokument ohne Überschriften und Listen hat keine Struktur für eine Karte und zeigt statt ihrer einen Hinweis.
