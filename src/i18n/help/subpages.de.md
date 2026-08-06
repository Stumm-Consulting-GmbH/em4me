# Unterseiten

Seiten können Unterseiten in beliebiger Tiefe haben, zum Beispiel `Prozess-A/Entwurf` oder `Prozess-A/Umsetzung/Detail`. Die Hierarchie ist eine logische Ordnung und unabhängig davon, in welchen Ordnern die Dateien liegen. So kann es gleichnamige Unterseiten zu verschiedenen Seiten geben, etwa einen `Entwurf` zu `Prozess-A` und einen zu `Prozess-B`.

## Namens-Konvention

Träger der Hierarchie ist der Dateiname: Das **Unterseiten-Trennzeichen ist `∕` (Unicode U+2215, „Division Slash")**. Es sieht aus wie ein Schrägstrich, ist aber in Windows-Dateinamen erlaubt und kommt in normalen Namen praktisch nicht vor — genau dadurch ist eindeutig, dass eine Datei eine Unterseite ist.

```text
Prozess-A.md                    Seite
Prozess-A∕Entwurf.md            Unterseite von Prozess-A
Prozess-A∕Umsetzung∕Detail.md   zweite Ebene
```

Das Zeichen muss nie getippt werden: Neue Unterseiten entstehen über **Datei → Weitere Datei-Funktionen → Neue Unterseite…** (Dialog fragt den Namen ab, die Datei entsteht im Ordner der aktiven Datei und öffnet als Tab). Für die manuelle Anlage im Datei-Explorer lässt sich das Zeichen aus dieser Seite kopieren: `∕`

## Links auf Unterseiten

In Wiki-Links wird durchgängig der normale Schrägstrich geschrieben; die Übersetzung in den Dateinamen übernimmt das Programm. Relative Ziele verweisen auf die eigene Unterseite oder die Elternseite und funktionieren damit unabhängig vom Namen der aktuellen Seite:

```markdown
[[Prozess-A/Entwurf]]     öffnet die Unterseite Entwurf von Prozess-A
[[/Entwurf]]              Unterseite Entwurf der AKTUELLEN Seite
[[..]]                    Elternseite der aktuellen Unterseite
![[Prozess-A/Entwurf]]    bettet die Unterseite ein
```

Die Auflösung sucht zuerst einen realen Ordner-Pfad (`[[unterordner/Datei]]` bleibt ein Pfad-Link), dann die Unterseiten-Datei — im eigenen Ordner und im gesamten Suchraum. Existieren beide, markiert der [Markdown-Linter](tools.md) das Ziel als mehrdeutig. Autocomplete schlägt nach `[[` Unterseiten in Schrägstrich-Schreibweise vor, nach `[[/` die Unterseiten der aktuellen Seite.

## Navigation

Ist eine Unterseite aktiv, zeigt ein **Breadcrumb** über dem Dokument (Lese-, Geteilt- und Live-Ansicht) die Eltern-Kette mit klickbaren Ebenen; nicht existierende Zwischen-Ebenen sind gepunktet unterstrichen und nicht klickbar. Die Sidebar-Sektion **Unterseiten** (Ansicht → Sidebar → Panels → Unterseiten oder das Unterseiten-Symbol in der Statusbar) listet die direkten Unterseiten der aktiven Datei; ein Klick öffnet sie.

## Umbenennen

**Datei → Weitere Datei-Funktionen → Umbenennen…** (auch im Tab-Kontextmenü) benennt die aktive Datei um. Offene Tabs, Lesezeichen, die Liste der zuletzt geöffneten Dateien und die [Historien-Begleitdatei](history.md) ziehen mit.

- Eine Seite **mit Unterseiten** nimmt beim Umbenennen ihren gesamten Unterseiten-Baum mit; der Dialog nennt die Anzahl vorab.
- Eine **Unterseite** ändert nur ihr eigenes Namens-Segment; die Eltern-Kette bleibt erhalten. Das gilt an beiden Bedienorten, auch in der [Titelzeile](tools.md) über dem Dokument: Dort steht der übergeordnete Anteil gedämpft und unveränderlich vor dem editierbaren Segment.
- **Vollständigen Namen ändern:** Der gleichnamige Schalter im Umbenennen-Dialog gibt bei einer Unterseite auch die übergeordneten Namensteile frei. Er ist bewusst standardmäßig aus, weil eine Änderung dort die Seite unter eine andere übergeordnete Seite hängt und auf alle ihre untergeordneten Seiten wirkt.
- **Links anpassen:** Das Kontrollkästchen „Links in anderen Dateien anpassen" schreibt eingehende Wiki-Links, Embeds und relative Markdown-Links auf den neuen Namen um, bei der Kaskade auch die Verweise auf jede mit-umbenannte Unterseite. Ein zweites Kontrollkästchen zeigt vorab eine **Vorschau** der betroffenen Dateien, nach dem Durchlauf fasst ein **Bericht** die umbenannten, angepassten und nicht anpassbaren Dateien zusammen. Die Vorbelegungen stehen unter Einstellungen → Verhalten → „Links beim Umbenennen".
- Offene Dokumente ziehen nach; ein Dokument mit **ungespeicherten Änderungen** erhält die Anpassung im Editor als eigenen Rückgängig-Schritt, während auf der Festplatte nur der zuletzt gespeicherte Stand angepasst wird.
- Bei aktivierter [Dokument-Historie](history.md) ist jede Anpassung als Revision nachvollziehbar und lässt sich zurücknehmen; ohne Historie gibt es kein Zurückdrehen.
- In einer Bereichs-Applikation deckt die Anpassung den gesamten Bereich ab, ohne Bereich den bekannten Suchraum; für den Rest bleibt der Linter das Netz.

## Lösen

**Datei → Weitere Datei-Funktionen → Von der übergeordneten Seite lösen…** (auch im Tab-Kontextmenü einer Unterseite) macht aus einer Unterseite eine eigenständige Seite: Aus `Prozess-A/Entwurf` wird `Entwurf`.

- Der Dialog nennt vorab das Ziel und die Anzahl der **eigenen Unterseiten**, die mitwandern. Aus `Prozess-A/Entwurf/Tief` wird dabei `Entwurf/Tief`, die Hierarchie unterhalb bleibt also erhalten.
- **Verweise bleiben gültig:** Die Anpassung eingehender Links läuft über denselben Weg wie beim Umbenennen, mit denselben Kontrollkästchen für Vorschau und Bericht.
- Der **Ziel-Name ist im Dialog änderbar**. Das hilft, wenn auf der Zielebene bereits eine Datei so heißt: Die Umbenennung wird dann gar nicht erst begonnen, und ein abweichender Name führt im zweiten Anlauf zum Ziel.
- Ein Schrägstrich ist im Ziel-Namen nicht erlaubt: Das Ergebnis ist eine eigenständige Seite. Das gezielte Umhängen unter eine **andere** übergeordnete Seite gehört nicht dazu; wer es braucht, ändert im Umbenennen-Dialog den vollständigen Namen.
