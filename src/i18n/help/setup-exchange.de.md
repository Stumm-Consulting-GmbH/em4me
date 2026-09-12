# Einstellungen exportieren und importieren

Die eigene Einrichtung ist Arbeit: Farbschemas, Tastenkürzel, die Belegung der Format-Toolbar, eigene Schaltflächen und Makros, die Anordnung der Sidebar, Vorlagen-Regeln, Lesezeichen. Diese Einrichtung lässt sich in eine **Datei schreiben** und anderswo wieder **einlesen** — auf einem zweiten Rechner, nach einer Neuinstallation oder als Sicherung vor einem größeren Umbau. Beide Wege stehen im Menü Datei → Einstellungen: „Exportieren…" und „Importieren…". Die Funktion gehört zur Erweiterung „Export und Import der eigenen Einstellungen"; im Aus-Zustand entfällt das Untermenü.

Ein dritter Anwendungsfall steht gleichberechtigt daneben und hat mit Sicherung nichts zu tun: die **Weitergabe eines einzelnen [Kalender-Systems](custom-calendars.md)** von einem [Bereich](apps-windows.md) an einen anderen.

## Exportieren

„Datei → Einstellungen → Exportieren…" öffnet eine Auswahl. Sie führt je Datenart eine Zeile mit ihrem Namen und der Zahl ihrer Einträge; angeboten wird nur, was tatsächlich etwas enthält. Vorbelegt ist alles — der häufigste Fall ist die vollständige Sicherung. Wer weniger mitnehmen will, hakt gezielt ab; ohne eine einzige Auswahl entsteht keine Datei, und die Auswahl bleibt mit einem Hinweis offen.

Anschließend fragt der gewohnte Speichern-Dialog nach Ort und Namen. Vorgeschlagen wird ein sprechender Name mit dem Tages-Datum.

Diese Datenarten stehen zur Wahl:

| Datenart | Inhalt |
|---|---|
| Einstellungen | Verhalten und Darstellung: Sprache, Erscheinungsbild, Editor- und Ansichts-Optionen, automatisches Speichern, Historie, Anlagen, Export-Optionen, die Konfiguration von Aufgaben, Erinnerungen und Kalender-Anzeige sowie die Spalten-Vorlieben der Panels |
| Farbschemas | die selbst angelegten Schemas samt der Zuordnung, welches im hellen und welches im dunklen Modus gilt |
| Tastenkürzel | eigene Umbelegungen der Kommandos |
| Format-Toolbar | die eigene Belegung der Schaltflächen-Leiste |
| Statusleisten-Schaltflächen und Makros | eigene Zugänge in der Statusleiste, die Kontextmenü-Sektion, die Ausblend-Liste und die selbst gebauten Makros |
| Schalt-Zustand der Erweiterungen | welche Erweiterungen ein- und welche ausgeschaltet sind |
| Anordnung der Sidebar | Seitenwahl, Reihenfolge, Reiter-Gruppen und Breiten samt eigener Layout-Varianten |
| Vorlagen-Ordner und -Regeln | der Vorlagen-Ordner und die geordnete Kette der Ordner-Regeln |
| Lesezeichen | der Baum der allgemeinen Lesezeichen mit Ordnern und Einträgen |
| Kalender-Systeme des Bereichs | die Zeitrechnungs-Blöcke des geöffneten Bereichs |

### Ein einzelnes Kalender-System auswählen

Kalender-Systeme sind die eine Ausnahme in dieser Liste: Sie gehören nicht der Anwendung, sondern dem geöffneten Bereich, und wandern deshalb mit dessen Ordner ohnehin mit. Sie stehen hier, weil ihre **Weitergabe** ein eigener Zweck ist — wer ein Kalender-System aufgebaut hat, soll es einem anderen Bereich geben können, ohne dass es dort nachgebaut wird.

Dafür ist diese Zeile zweistufig: Unter der Datenart steht **je Block eine eigene Zeile** mit seinem Namen und der Zahl seiner Zeitrechnungen, jede mit eigenem Häkchen. Damit trägt derselbe Weg beide Fälle — alle Blöcke zur Sicherung, ein einzelner zur Weitergabe. Der Schalter der Datenart sagt „alles" oder „nichts" und schaltet seine Blöcke mit; sind nur einige gewählt, zeigt er einen unbestimmten Zustand.

Gewählt wird der **Block**, nicht die einzelne Zeitrechnung. Der Grund liegt im Modell: Zeitrechnungen desselben Blocks sind einander zuordenbar, und eine abgeleitete Zeitrechnung stützt sich auf eine andere **ihres** Blocks. Eine einzeln herausgelöste Zeitrechnung risse diese Verbindung; ein ganzer Block nimmt sie unberührt mit.

Ohne geöffneten Bereich erscheint die Datenart gar nicht — es gibt dann keine.

## Was nie mitgeht

Ausgegeben wird ausschließlich, was zu den Datenarten oben gehört. Alles Übrige bleibt liegen, und zwar nicht aus Versehen, sondern als Zusicherung:

- **Zugangs-Geheimnisse jeder Art gehen nie mit.** Der Ablage-Raum, in dem eine externe Erweiterung ihre eigenen Daten hält, ist als Ganzes vom Export ausgenommen — auch dann, wenn niemand weiß, was darin steht. Gerade weil die Anwendung diesen Bestand nicht kennt, wird er nicht weitergegeben. Ihr Schalt-Zustand, also ob eine Erweiterung ein- oder ausgeschaltet ist, geht dagegen mit; das ist Einrichtung und kein Geheimnis.
- **Sitzungs-Stand** wie offene Reiter, Fenster-Größe und -Lage sowie die Zuletzt-Listen. Sie tragen absolute Pfade des Herkunfts-Rechners, die anderswo ins Leere zeigen.
- **Maschinengebundene Angaben** wie die eingerichteten Arbeitsbereiche und Bereiche mit ihren Pfaden, die gesehenen Einführungen und die Entscheidung, ob einer bestimmten externen Erweiterung auf diesem Rechner vertraut wird. Diese Entscheidung ist je Rechner zu treffen; sie mitzunehmen hieße, sie andernorts vorwegzunehmen.
- **Laufende Zustände** wie Wecker, Timer und Stoppuhr.

Auch der Datei selbst ist keine Person zu entnehmen: Der Kopf nennt Programm und Fassung, nicht Benutzer oder Rechner.

## Die Datei

Die Austausch-Datei ist eine gewöhnliche **Markdown-Datei**. Das ist Absicht: Sie lässt sich in dieser Anwendung öffnen, in jedem Editor lesen, vergleichen und versionieren. Ihr Kopf nennt die Fassung des Formats, den Zeitpunkt der Ausgabe und die Herkunft; darunter folgt je Datenart ein eigener Abschnitt mit einer Überschrift und einem Code-Block, dessen Inhalt die Werte trägt.

````text
---
em4me: "setup"
formatVersion: 1
created: "2026-09-09T10:43:12Z"
origin:
  program: "EM4me"
  version: "…"
---

## Farbschemas

```json em4me:colorSchemes
{ … }
```
````

Das Feld `em4me` weist die Datei als Einstellungs-Datei dieser Anwendung aus und schützt davor, dass beim Einlesen versehentlich eine beliebige Markdown-Datei gewählt wird. Die Angabe hinter der Marke im Code-Block — hier `em4me:colorSchemes` — benennt die Datenart des Abschnitts. Die Überschriften darüber sind für den Leser da; gelesen wird die Datenart aus der Marke.

## Importieren

„Datei → Einstellungen → Importieren…" fragt nach der Datei. Der Dialog ist nicht an einen geöffneten Bereich gebunden — eine Einstellungs-Datei liegt typischerweise gerade außerhalb, auf einem Stick oder im Download-Ordner.

**Geschrieben wird nicht sofort.** Zuerst erscheint eine **Vorschau**, die je Datenart nennt, was geschehen würde: was ergänzt, was ersetzt, was umbenannt und was übersprungen wird. Erst „Übernehmen" führt es aus; danach zeigt ein Bericht dieselbe Liste als Ergebnis. In der Vorschau steht außerdem die Schaltfläche „Bisherigen Stand sichern…", die den heutigen Stand der betroffenen Datenarten in eine eigene Datei schreibt, bevor etwas verändert wird.

Nichts wird stillschweigend übergangen: Jede Abweichung vom geradlinigen Fall steht in der Vorschau und im Bericht.

### Was mit vorhandenen Werten geschieht

Es gilt **eine** Regel für alle Datenarten:

> Ergänzt wird, was Sie als benannten Gegenstand angelegt haben. Ersetzt wird, was eine Einstellung oder eine Anordnung ist.

Ergänzt werden deshalb die eigenen Farbschemas, die Makros, die Layout-Varianten der Sidebar, die Lesezeichen und die Kalender-Blöcke: Sie treten **neben** das Vorhandene, und der vorhandene Bestand wird dabei nicht angefasst. Ersetzt werden die Einstellungen, die Tastenkürzel-Belegung, die Format-Toolbar, die Vorlagen-Regeln und der Schalt-Zustand der Erweiterungen: Ein Wert kennt keine Mehrzahl, und zwei verschränkte Anordnungen ergäben eine dritte, die niemand eingerichtet hat.

**Bei gleichem Namen bleibt der vorhandene Eintrag unverändert**, und der eingelesene kommt mit einem unterscheidenden Zusatz daneben: aus „Muster" wird „Muster (2)". Die Vorschau nennt jede solche Umbenennung namentlich. Verweise ziehen dabei mit — ein eingelesenes Makro, das eine neue Kennung bekommt, wird von seiner Schaltfläche weiterhin gefunden.

Zwei Sonderfälle folgen aus dem Gegenstand: Ein Lesezeichen auf eine Datei, die schon gemerkt ist, wird übersprungen statt doppelt angelegt — ein Lesezeichen-Ordner dagegen kommt immer als Ganzes mit, weil er Ihre Ordnungs-Arbeit ist. Und ein Kalender-Block, dessen Definition unvollständig ist, wird abgewiesen und namentlich genannt, statt einen halben Eintrag anzulegen.

Ein Teil der Einstellungen wirkt erst nach einem Neustart der Anwendung; die Vorschau sagt es, wenn das zutrifft.

### Dateien aus einer anderen Programm-Fassung

Eine Datei aus einer **älteren** Fassung wird gelesen. Genau dafür ist der Weg gedacht: Eine Sicherung, die nach dem nächsten Programm-Update nicht mehr einlesbar wäre, verfehlte ihren Zweck. Datenarten, die es inzwischen nicht mehr gibt, erscheinen als übersprungen — sie werden gemeldet, nicht verschwiegen.

Eine Datei aus einer **neueren** Fassung wird ebenfalls gelesen, mit einem Hinweis: Was diese Fassung nicht kennt, wird übersprungen und benannt. Dasselbe gilt innerhalb einer bekannten Datenart, deren Aufbau sich geändert hat — was nicht in die erwartete Form passt, wird verworfen und in der Vorschau aufgeführt, statt fremde Struktur in die Einstellungen zu lassen.

Ist die Datei beschädigt oder gar keine Einstellungs-Datei, sagt die Anwendung das und schreibt nichts.

## Ein Kalender-System weitergeben

Der Weg im Ganzen, als Beispiel:

1. Im **Quell-Bereich** „Datei → Einstellungen → Exportieren…" wählen.
2. Alle Häkchen bis auf den gewünschten Kalender-Block entfernen und die Datei speichern.
3. Den **Ziel-Bereich** öffnen und dort „Datei → Einstellungen → Importieren…" wählen.
4. Die Datei wählen, die Vorschau lesen, übernehmen.

Der Block steht danach im Ziel-Bereich neben dem, was dort schon war, und seine Zeitrechnungen lassen sich sofort im Dokument benutzen. Trägt er den Namen eines vorhandenen Blocks — der Normalfall, wenn dasselbe System dort schon einmal ankam —, bleibt der vorhandene stehen und der neue erscheint mit seinem Zusatz.

Geschrieben wird immer in den Bereich, der gerade geöffnet ist. Ist gar keiner geöffnet, wird die Datenart übersprungen und der Grund genannt.
