# Bücher

Ein Buch fasst mehrere Markdown-Dateien zu einer **erklärten Lese-Ordnung** zusammen. Der Ordnerbaum eines [Bereichs](apps-windows.md) sortiert alphabetisch, die [Unterseiten](subpages.md) tragen ihre Hierarchie im Dateinamen; ein Buch dagegen schreibt seine Gliederung ausdrücklich auf, in einer Begleitdatei im Buch-Ordner. Die Kapitel selbst bleiben gewöhnliche Markdown-Dateien und sind auch ohne die Anwendung einzeln lesbar.

## Was ein Buch ist

Ein Buch lebt in einem eigenen Ordner. Darin liegen drei Dinge:

- die **Buch-Datei**, eine gewöhnliche Markdown-Datei mit dem Text des Buches; Eigenschaften und ein Bild-Verweis stehen wie überall im [Frontmatter](frontmatter.md),
- die **Begleitdatei** `Book_Settings.mdda`, die die Buch-Datei benennt und den Kapitel-Baum trägt,
- die **Kapitel** als Markdown-Dateien, unmittelbar im Buch-Ordner oder in beliebig tiefen Unterordnern.

Ein Buch-Ordner sieht damit etwa so aus:

```text
Reise nach Ithaka/
  Book_Settings.mdda
  Reise nach Ithaka.md
  Teil 1/
    Aufbruch.md
    Der Hafen.md
  Teil 2/
    Heimkehr.md
```

### Die Begleitdatei

Die Begleitdatei ist lesbar eingerücktes JSON. Sie benennt die Buch-Datei und beschreibt den Kapitel-Baum; die Pfade liegen relativ zum Buch-Ordner:

```json
{
  "schemaVersion": 1,
  "book": { "file": "Reise nach Ithaka.md" },
  "chapters": [
    {
      "path": "Teil 1/Aufbruch.md",
      "children": [{ "path": "Teil 1/Der Hafen.md", "children": [] }]
    },
    { "path": "Teil 2/Heimkehr.md", "children": [] }
  ]
}
```

Daraus folgen zwei Eigenschaften des Modells. Erstens erkennt die Anwendung ein Buch **allein an der Begleitdatei**: Eine Markdown-Datei ist genau dann Buch-Datei, wenn die Begleitdatei ihres Ordners sie benennt. In der Markdown-Datei selbst steht dafür nichts, sie bleibt ohne Rückverweis. Zweitens ist die **Ordner-Lage keine Struktur-Aussage**: Wo eine Kapitel-Datei liegt, ist frei wählbar und jederzeit änderbar, die Gliederung steht ausschließlich im Kapitel-Baum.

Ein Kapitel gehört zu genau einem Buch und hängt dort genau einmal. Dieselbe Datei mehrfach einzuhängen ist nicht vorgesehen.

## Ein Buch öffnen und anlegen

Beide Wege stehen im Menü **Datei**, bei den Bereichs-Einträgen:

- **Buch öffnen…** fragt nach dem Buch-Ordner. Enthält er keine Begleitdatei mit benannter Buch-Datei, meldet die Anwendung, dass der Ordner kein Buch ist, und ändert nichts.
- **Neues Buch…** fragt nach einem Eltern-Ordner und einem Namen. Die Anwendung legt darin den Buch-Ordner an, dazu die gleichnamige Buch-Datei und die Begleitdatei, und öffnet das Buch.
- **Buch schließen** löst die Bindung wieder. Offene Reiter bleiben offen; geschlossen wird das Buch, nicht das Dokument.

Beim Öffnen erscheint die Buch-Datei als Reiter, und das Inhaltsverzeichnis wird eingeblendet. Es gibt **ein aktives Buch je Applikation**: Alle Fenster derselben Applikation teilen es, und beim nächsten Start wird es wiederhergestellt. Ein Kapitel lässt sich daneben ganz gewöhnlich öffnen, ohne Buch-Kontext; es bleibt eine normale Markdown-Datei.

## Das Inhaltsverzeichnis

Das Panel **Buch** zeigt den Kapitel-Baum in der erklärten Reihenfolge. Ein Klick öffnet ein Kapitel, das gerade gelesene ist hervorgehoben. Vor jedem Namen steht ein Marker, der zugleich der Anfasser für die Pflege ist. Geschaltet wird das Panel wie jedes andere: über die Schaltfläche in der Statusbar-Leiste oder über Ansicht → Panels → Buch. Seite, Reihenfolge und Reiter-Gruppen folgen den Regeln der [Sidebar](sidebar.md).

### Nicht eingehängte Dateien

Unter dem Baum steht der Abschnitt **Nicht eingehängt** mit den Markdown-Dateien des Buch-Ordners, die in keinem Kapitel hängen. Sie werden nicht versteckt, sondern bleiben sichtbar und bedienbar, damit erkennbar ist, was noch auf seinen Platz wartet. Die Buch-Datei selbst erscheint dort nie, sie ist kein Kapitel.

## Die Kapitel-Struktur pflegen

Alle drei Wege ändern **nur die Deklaration** in der Begleitdatei. Keine Datei wird dabei bewegt, umbenannt oder gelöscht.

### Ziehen

Am Marker vor dem Kapitelnamen wird ein Kapitel samt seinen Unterkapiteln gezogen. Wohin es fällt, entscheidet die Stelle über der Ziel-Zeile: Das obere Drittel ordnet davor ein, das untere dahinter, die Mitte hängt als Unterkapitel ein. Ein Zug auf die freie Fläche des Panels hängt ans Ende der obersten Ebene. Ein Eintrag aus „Nicht eingehängt“ wandert auf demselben Weg in den Baum. Ein Kapitel unter eines seiner eigenen Unterkapitel zu ziehen ist ausgeschlossen.

### Tastatur

Ist eine Zeile fokussiert, wirken diese festen Eingaben auf das Kapitel samt seinen Unterkapiteln:

| Eingabe | Wirkung |
|---|---|
| `Alt+↑` / `Alt+↓` | eine Position innerhalb der Ebene nach oben oder unten |
| `Alt+→` | einrücken: wird letztes Unterkapitel seines Vorgängers |
| `Alt+←` | ausrücken: rückt eine Ebene höher, hinter sein bisheriges Eltern-Kapitel |
| `Enter` / `Leertaste` | Kapitel öffnen |

Am Rand einer Ebene bleibt der Baum unverändert und meldet nichts: Dort gibt es schlicht kein Ziel.

### Kontextmenü

Der Rechtsklick auf eine Zeile bietet:

- **Neues Kapitel** legt eine Datei an und hängt sie sofort ein. Der Name wird direkt im Panel eingegeben; die Datei entsteht im Ordner des Eltern-Kapitels, auf oberster Ebene im Buch-Ordner.
- **Aushängen** nimmt den Eintrag aus dem Baum. Die Datei bleibt und erscheint anschließend unter „Nicht eingehängt“.
- **Einhängen** ist der umgekehrte Weg an einer nicht eingehängten Datei; sie wandert ans Ende der obersten Ebene.

Auf der freien Fläche des Panels legt der Rechtsklick ein neues Kapitel auf oberster Ebene an.

## Leseführung über Kapitel-Grenzen

Zwei Schaltflächen im Kopf des Panels blättern eine Position vor und zurück; dieselben Schritte liegen als Kommandos in der Palette und im Standard auf `Strg+Alt+Bild ab` und `Strg+Alt+Bild auf`. Die Führung folgt der Lese-Ordnung des Baumes: Ein Kapitel steht vor seinen Unterkapiteln, danach folgen seine Geschwister.

An den Enden gibt es keinen Umlauf. Statt still ans andere Ende zu springen, meldet die Statuszeile, dass Anfang oder Ende des Buches erreicht ist; die Schaltflächen sind dort abgeschaltet. Nicht eingehängte Dateien bleiben außerhalb der Führung.

## Kapitel-Dateien verschieben

Weil die Ordner-Lage frei ist, gibt es für ihre Änderung ein eigenes Kommando: **Kapitel-Datei verschieben…** im Kontextmenü eines Eintrags. Es fragt nach einem Ziel-Ordner innerhalb des Buch-Ordners und bewegt die Datei dorthin. Dabei ziehen nach:

- die **Verweise** auf die Datei aus anderen Dokumenten,
- der **Kapitel-Baum**, dessen Eintrag denselben Platz und dieselben Unterkapitel behält.

Ein Ziel außerhalb des Buch-Ordners wird abgewiesen, ebenso ein Ziel, in dem bereits eine Datei dieses Namens liegt. Die Buch-Datei selbst lässt sich nicht verschieben. Das Umbenennen einer Kapitel-Datei läuft wie bei jeder anderen Datei und führt den Kapitel-Baum genauso nach.

## Fehlende Kapitel reparieren

Wird eine Kapitel-Datei außerhalb der Anwendung verschoben oder gelöscht, zeigt ihr Eintrag ins Leere. Er verschwindet nicht, sondern bleibt im Verzeichnis stehen und ist als **fehlend** markiert; anklicken lässt er sich nicht, weil es nichts zu öffnen gibt.

Gibt es im Buch-Ordner an anderer Stelle eine Datei gleichen Namens, trägt die Zeile zusätzlich ein Such-Zeichen als Wiederfinde-Vorschlag. Ausgeführt wird er nie von selbst. Das Kontextmenü des Eintrags bietet zwei Wege:

- **Neu zuordnen…** öffnet eine Auswahl unter der Zeile. Ein einzelner namensgleicher Fund ist darin hervorgehoben und vorbelegt; daneben führt „Andere Datei wählen…“ zur freien Wahl innerhalb des Buch-Ordners.
- **Aushängen** entfernt den Eintrag, wenn das Kapitel wirklich fort ist.

Sobald die Zuordnung steht, verliert die Zeile ihre Markierung.

## Ein- und ausschalten

Bücher sind eine schaltbare Erweiterung (Einstellungen → [Erweiterungen](extensions.md), Gruppe Werkzeuge) und ab Werk eingeschaltet. Im Aus-Zustand verschwinden die Menüpunkte, die Kommandos und das Panel; eine Buch-Datei öffnet dann wie jede andere Markdown-Datei. Buch-Datei, Begleitdatei und Kapitel bleiben unangetastet, das Wieder-Einschalten bringt den Stand unverändert zurück.
