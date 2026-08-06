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
- **Buch schließen** schließt das Buch samt seinem Fenster und seinen Reitern; bei ungespeicherten Änderungen fragt die Anwendung wie beim Fenster-Schließen nach.

Ein geöffnetes Buch verhält sich **wie ein Bereich**: Es öffnet als eigene Applikation mit eigenem Fenster, der Fenstertitel trägt den Buchnamen, und der Buch-Ordner samt Unterordnern ist der Arbeitsraum dieses Fensters. Was außerhalb des Buch-Ordners liegt, ist dort nicht sichtbar und nicht nutzbar; auch Bilder und Anlagen eines Buches gehören deshalb in den Buch-Ordner. Zwei Bücher sind nie im selben Fenster: Läuft das Buch bereits, springt die Anwendung in sein Fenster, und ein zweites Buch öffnet ein eigenes. Beim Öffnen erscheint die Buch-Datei als Reiter, das Inhaltsverzeichnis wird eingeblendet, und beim nächsten Start wird ein offenes Buch wiederhergestellt. Ein Kapitel lässt sich daneben ganz gewöhnlich öffnen, ohne Buch-Kontext; es bleibt eine normale Markdown-Datei.

## Das Inhaltsverzeichnis

Das Panel **Buch** zeigt den Kapitel-Baum in der erklärten Reihenfolge. Ein Klick öffnet ein Kapitel, das gerade gelesene ist hervorgehoben. Vor jedem Namen steht ein Marker, der zugleich der Anfasser für die Pflege ist. Geschaltet wird das Panel wie jedes andere: über die Schaltfläche in der Statusbar-Leiste oder über Ansicht → Sidebar → Panels → Buch. Seite, Reihenfolge und Reiter-Gruppen folgen den Regeln der [Sidebar](sidebar.md).

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

## Bücherregale

Ein Bücherregal gruppiert Bücher. Es lebt in einem eigenen Ordner; darin liegen die **Regal-Datei** (eine gewöhnliche Markdown-Datei mit dem Beschreibungstext des Regals; Eigenschaften und der Bild-Verweis `cover` stehen wie überall im [Frontmatter](frontmatter.md)), die **Begleitdatei** `Shelf_Settings.mdda` und die **Bücher** als Buch-Ordner unmittelbar darunter. Die Hierarchie endet beim Regal; Regale in Regalen gibt es nicht.

```json
{
  "schemaVersion": 1,
  "shelf": { "file": "Meine Bibliothek.md" },
  "books": ["Reise nach Ithaka", "Kochbuch"]
}
```

Die Begleitdatei benennt die Regal-Datei und führt die zugeordneten Bücher in ihrer Reihenfolge. Wie beim Buch erkennt die Anwendung ein Regal **allein an der Begleitdatei**; die Regal-Datei trägt keinen Rückverweis.

### Regal öffnen und anlegen

Die Wege stehen im Menü **Datei**, neben den Buch-Einträgen: **Bücherregal öffnen…** fragt nach dem Regal-Ordner (ein Ordner ohne benannte Regal-Datei wird mit Meldung abgewiesen), **Neues Bücherregal…** legt Ordner, Regal-Datei und Begleitdatei an, **Bücherregal schließen** schließt das Regal samt seinem Fenster. Auch das Öffnen der Regal-Datei selbst öffnet das Regal.

Ein geöffnetes Regal verhält sich **wie ein Bereich**, genau wie ein Buch: Es öffnet als eigene Applikation mit eigenem Fenster, der Fenstertitel trägt den Regal-Namen, und der Regal-Ordner ist der Arbeitsraum dieses Fensters. Läuft das Regal bereits, springt die Anwendung in sein Fenster. Beim nächsten Start wird ein offenes Regal wiederhergestellt.

Das Regal-Fenster hält dabei ausschließlich die **Regal-Ebene**: Jeder Griff in ein Buch, ob Buch-Datei oder Kapitel-Datei, führt in das Fenster dieses Buches, und die Datei öffnet dort. Im Regal-Fenster selbst öffnen nur Dateien, die unmittelbar im Regal-Ordner liegen, etwa die Regal-Datei mit ihrem Beschreibungstext. So liegen nie Kapitel verschiedener Bücher im selben Fenster.

### Die Regal-Ansicht

Ein geöffnetes Regal erscheint als eigene Seite im Reiter-System. Zwei Darstellungen stehen bereit, umschaltbar in der Ansicht und je Regal gemerkt: **Kacheln** zeigen die Buch-Bilder als Raster; ein Buch ohne Bild-Verweis erhält eine Platzhalter-Kachel mit seinem Titel. **Zeilen** zeigen Bild, Name, Kapitel-Anzahl, Autor und Beschreibung. Ein Klick öffnet das Buch in seinem eigenen Fenster; das Regal bleibt als Übersicht stehen.

Unter dem Bestand steht der Abschnitt **Nicht zugeordnet** mit den Buch-Ordnern des Regal-Ordners, die dem Regal noch nicht zugeordnet sind; **Aufnehmen** ordnet sie zu, **Lösen** entfernt eine Zuordnung wieder, ohne den Buch-Ordner anzutasten. Ein zugeordnetes Buch, dessen Ordner fehlt, bleibt sichtbar und ist als fehlend markiert.

## Ein- und ausschalten

Bücher und Bücherregale sind gemeinsam eine schaltbare Erweiterung (Einstellungen → [Erweiterungen](extensions.md), Gruppe Werkzeuge) und ab Werk eingeschaltet. Im Aus-Zustand verschwinden die Menüpunkte, die Kommandos, das Panel und die Regal-Ansicht; Buch- und Regal-Dateien öffnen dann wie jede andere Markdown-Datei. Buch-Datei, Regal-Datei, Begleitdateien und Kapitel bleiben unangetastet, das Wieder-Einschalten bringt den Stand unverändert zurück.
