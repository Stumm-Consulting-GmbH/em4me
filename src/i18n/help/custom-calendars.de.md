# Kalender-Systeme

Frei definierbare Zeitrechnungen für Fantasie-Welten und besondere Anwendungsfälle: Jeder Bereich kann eigene Kalender-Blöcke führen, deren Kalender völlig anders aufgebaut sein dürfen als der gewohnte Standard-Kalender — mit eigenen Monats-Längen, Schalt-Regeln, Wochen-Zyklen und Epochen. Die Funktion gehört zur Erweiterung «Kalender-Systeme» und gilt nur im Bereichs-Kontext: Ohne geöffneten Bereich sind die Einstellungs-Sektion und das Einfüge-Kommando inaktiv.

## Konzept

### Blöcke

Ein Block ist eine in sich geschlossene Zeit-Welt mit einem Namen und beliebig vielen Kalendern. Kalender desselben Blocks laufen parallel, sind einander zuordenbar und lassen sich ineinander umrechnen. Verschiedene Blöcke haben bewusst nichts miteinander zu tun — zwischen ihnen gibt es weder Umrechnung noch Vergleichbarkeit.

### Kalender und Ebenen

Ein Kalender besteht aus einer geordneten Liste von Ebenen, kleinste zuerst (etwa Sekunde → Minute → Stunde → Tag → Monat → Jahr), gruppiert in benannte Ebenen-Bereiche (im Standard-Vorbild «Zeit» und «Datum»). Jede Ebene beschreibt ihr Verhältnis zur nächst-kleineren mit einem von fünf Beziehungs-Typen:

- **Fester Faktor** — eine feste Anzahl kleinerer Einheiten, etwa 60 Sekunden je Minute.
- **Längen-Tabelle** — Einheiten mit individuellen Längen, etwa drei Monate mit 30, 30 und 35 Tagen; die Zeilen-Namen der Tabelle sind zugleich die Positions-Namen (Monats-Namen).
- **Schalt-Regel** — Zyklus-Regeln nach dem Muster «Schaltung alle 4, außer alle 100, außer alle 400», mit Angabe der verlängerten Einheit und der Verlängerung.
- **Eigenständiger Zyklus** — das Wochen-Muster: Ein Zyklus fester Länge läuft über Monats- und Jahresgrenzen hinweg, verankert an einem Referenz-Datum, optional mit Nummerierungs-Regel (die Zyklus-Nummer richtet sich nach dem Jahr, in dem der maßgebliche Tag des Zyklus liegt).
- **Gruppierung** — eine rein rechnerische Zusammenfassung, etwa Quartale aus je drei Monaten.

### Epochen

Jeder Kalender hat genau eine offene Vergangenheits-Epoche (sie zählt rückwärts), beliebig viele geschlossene Zwischen-Epochen und eine offene Zukunfts-Epoche. Die Grenzen schließen nahtlos aneinander an und liegen auf einem Datum ohne Zeit-Anteil; die Jahres-Zählung startet in jeder Epoche bei 1, ein Jahr 0 gibt es nicht. Eine Epochen-Grenze darf mitten im Jahr liegen — das Jahr 1 der neuen Epoche ist dann ein Teiljahr.

### Umrechnung über die Block-Achse

Jeder Block besitzt eine neutrale Zeit-Achse. Jeder Kalender wird über einen Anker (der Kalender-Zeitpunkt, der auf dem Achsen-Nullpunkt liegt) und eine Skala (die Dauer seiner kleinsten Einheit in Achsen-Einheiten, als Bruch aus Zähler und Nenner) auf diese Achse abgebildet. Umrechnungen zwischen Kalendern laufen immer über die Block-Achse und runden deterministisch auf die kleinste Ebene des Ziel-Kalenders ab.

## Pflege in den Einstellungen

Der Einstellungs-Bereich «Kalender-Systeme» zeigt die Blöcke des geöffneten Bereichs in zwei Stufen: Die Übersicht verwaltet die Blöcke (anlegen, umbenennen, öffnen, entfernen), die Detail-Ansicht eines Blocks zeigt seine Kalender als Formulare mit Editoren für Ebenen, Epochen, Zyklen, Gruppierungen und die Block-Achse.

- Der Knopf **«Standard-Kalender als Vorlage einfügen»** erzeugt eine vollständige Definition mit zwölf Monaten, Schalt-Regel und Sieben-Tage-Zyklus — als Ausgangspunkt zum Anpassen und als lebendes Beispiel aller Beziehungs-Typen.
- Die **Live-Vorschau** zeigt einen frei wählbaren Beispiel-Wert kanonisch und mit Namen; solange eine Definition unvollständig ist, meldet der Editor das als Hinweis (weiche Validierung), erst das Anwenden prüft hart.
- Die Definitionen werden in der Bereichsdatei gespeichert (Datei `Area_Settings.mdda`) und gelten für alle Fenster des Bereichs.

Die Bearbeitung ist bewusst nie gesperrt: Struktur-Änderungen an bereits benutzten Kalendern sind erlaubt. Werte im Dokument, die dadurch ungültig werden, bleiben unverändert erhalten und werden sichtbar markiert.

## Werte im Dokument

Ein Kalender-Wert steht in kanonischer Form im Quelltext:

```text
@{Kalendername: Jahr-Monat-Tag}
@{Kalendername: Jahr-Monat-Tag Epochen-Kürzel}
@{Kalendername: Jahr-Monat-Tag Stunde:Minute:Sekunde}
```

Der erste Doppelpunkt trennt den Kalender-Namen vom Wert. Die Datums-Segmente stehen groß nach klein; das Epochen-Kürzel entfällt in der jüngsten Epoche, der Zeit-Teil entfällt, wenn alle Zeit-Segmente auf ihrem Minimum stehen. In gerenderter Ansicht, Live-Modus und Portable-Export erscheint der Wert als Badge mit den Namen aus der Definition (etwa Monats-Namen und Epochen-Kürzel).

Ist der genannte Kalender im Bereich nicht definiert oder der Wert ungültig, bleibt der Quelltext unverändert und der Wert wird sichtbar markiert — wie dieses Beispiel, dessen Kalender es auf dieser Handbuch-Seite nicht gibt:

@{Beispiel-Kalender: 500-2-09 ZZ}

In Code-Blöcken und Code-Spans bleibt die Syntax unangetastet: `@{Beispiel-Kalender: 500-2-09 ZZ}`.

## Einfügen und Bearbeiten

- **Einfügen:** Das Kommando «Kalender-Datum einfügen» (Kommando-Palette; Kürzel belegbar) öffnet den Picker und fügt den gewählten Zeitpunkt kanonisch am Cursor ein. Es ist aktiv, sobald der geöffnete Bereich mindestens einen Kalender definiert.
- **Bearbeiten:** Werte sind im Quelltext- und Live-Modus klickbar; der Klick öffnet den Picker mit dem Wert vorbelegt, Übernehmen ersetzt ihn an Ort und Stelle in einem einzigen Undo-Schritt.

## Picker

Der Picker für benutzerdefinierte Kalender arbeitet analog zum Standard-Datums-Picker:

- Kopf-Auswahlen für **Block**, **Kalender** und **Epoche** (Auswahlen mit nur einem Eintrag entfallen). Ein Kalender-Wechsel rechnet den gewählten Zeitpunkt um; ein Block-Wechsel springt zum Anker des Ziel-Kalenders.
- Das **Gitter** entsteht aus der Ebenen-Struktur: Mit definiertem Wochen-Zyklus als Spalten-Gitter (Zyklus-Länge = Spalten-Zahl, Positions-Namen als Kopf, Nummern-Spalte bei Nummerierungs-Regel), ohne Zyklus als fortlaufende Tages-Liste der Einheit.
- **Navigation:** Die äußeren Pfeil-Knöpfe schieben die größte Einheit (das Jahr), die inneren die Gitter-Einheit (den Monat); Pfeiltasten navigieren tage-weise, Enter übernimmt, Escape bricht ab. **«Zum Anker»** springt zum Referenz-Zeitpunkt des Kalenders.
- **Zeit-Ebenen** erscheinen als einzeln stellbare Segmente mit Pfeil- und Ziffern-Eingabe — ungültige Werte sind konstruktionsbedingt nicht eingebbar.

### Umrechnungs-Anzeige

Unterhalb des Gitters zeigt der Picker den gewählten Zeitpunkt in allen Parallel-Kalendern des Blocks. Ein Klick auf eine Entsprechung wechselt den aktiven Kalender dorthin. Kalender verschiedener Blöcke sind bewusst nicht umrechenbar.
