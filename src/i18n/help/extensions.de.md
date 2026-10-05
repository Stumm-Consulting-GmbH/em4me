# Erweiterungen

Viele Funktionen der App sind interne Erweiterungen und lassen sich einzeln ein- und ausschalten. Der Kern — Editor, Tabs und Fenster, Datei-Handling, Ansichts-Modi, Sidebar-Rahmen, Einstellungen, Handbuch, Theme, Sprachen und das CommonMark-Basis-Rendering — ist bewusst nicht abschaltbar; die App bleibt damit immer funktionsfähig.

## Schalten

Der Einstellungs-Bereich Erweiterungen (Datei → Einstellungen → Erweiterungen) listet alle internen Erweiterungen in drei Kategorien:

- **Rendering** — Markdown-Konstrukte wie Callouts, Fußnoten, Highlight, Typografie, Perspective-Tabellen, KaTeX-Formeln, Mermaid-Diagramme oder Syntax-Highlighting.
- **Vernetzung** — Wiki-Links, Wiki-Embeds, Tags und Autocomplete.
- **Werkzeuge** — Markdown-Linter, Lesezeichen, Fokus-Modus mit Typewriter-Scroll, Wort-Statistik und Code-Copy-Button.

Jede Zeile zeigt Name und Kurzbeschreibung. Änderungen wirken bei Anwenden oder OK — sofort, ohne Neustart und in allen Fenstern.

## Arbeitsmodi

Über der Schalter-Liste steht der Abschnitt Arbeitsmodus. Ein Arbeitsmodus setzt die Schalter der internen Erweiterungen gebündelt — statt vieler einzelner Entscheidungen eine einzige. Drei feste Modi stehen zur Wahl, und sie sind ineinander geschachtelt: Was der kleinere enthält, enthält der größere auch.

- **Einsteiger** — Schreiben und Verlinken. Enthalten sind das gängige Markdown-Repertoire (unter anderem Callouts, Fußnoten, Hervorhebungen, Typografie, Emoji, Bilder mit Größenangabe, Perspective-Tabellen und Syntax-Hervorhebung), die Vernetzung über Wiki-Links, Schlagworte und Autocomplete sowie die Werkzeuge des täglichen Schreibens: Aufgaben-Listen, Vorlagen, Lesezeichen, Rechtschreibprüfung, Format-Toolbar, Tabellen-Editor, Titelzeile, Datums-Auswahl, Wort-Statistik, Fokus-Modus und der Demo-Bereich.
- **Fortgeschritten** — alles daraus und zusätzlich das Organisieren und Planen: Bücher, Journale, Eigenschafts-Profile, Erinnerungen, Ereignisse, Graphenansicht, Mindmap, Gliederung, Arbeitsbereiche, Reiter-Gruppen, Uhr, Formeln und Diagramme, dazu die selteneren Markdown-Konstrukte wie Custom Containers, Definitionslisten, Abkürzungen, Spoiler, Kommentare, Überschriften-Nummerierung und erweiterte Aufgaben-Status.
- **Voll** — alle internen Erweiterungen, also zusätzlich Canvas-Flächen, Datenbank, Perspective Datatable, Diagramme zu Tabellen, Inline-Rechnen, Critic Markup, Line Blocks, Überschriften-Attribute, eigene Kalender-Systeme, eigene Oberflächen-Sprache, My Extended Memory, eigene Statusleisten-Schaltflächen und den Austausch der eigenen Einrichtung.

Die Wahl wirkt wie jede andere Änderung dieser Seite mit Anwenden oder OK — dann sofort, ohne Neustart und in allen offenen Fenstern.

**Ein Modus ist ein Ausgangspunkt, keine Sperre.** Nach dem Umschalten bleibt jeder einzelne Schalter unverändert nachjustierbar, und kein Modus nimmt etwas weg, das sich nicht wieder einschalten ließe. Unter den drei Schaltflächen steht, welcher Modus dem aktuellen Schalter-Stand entspricht; stimmt er mit keinem überein, weil einzelne Schalter abweichend stehen, steht dort **Angepasst**. Der Modus-Name beschreibt damit den Stand, statt ihn festzuhalten — und sobald der Stand wieder genau einem Modus entspricht, erscheint dieser wieder als aktiv.

Der Abhängigkeits-Schutz gilt unverändert: Kein Modus erzeugt einen Stand, den das Abschalten einer einzelnen Erweiterung verböte.

### Der erste Start

Eine neue Einrichtung startet im Modus Einsteiger. Die Wahl wird dort angeboten, wo die Anwendung zum ersten Mal zu sehen ist: Die geführte Produkt-Tour, die beim allerersten Programmstart von selbst anläuft, trägt dafür eine eigene Station mit den drei Modi. Einsteiger ist dort vorgewählt, und ein Klick wirkt sofort — die Tour muss dafür weder beendet noch ein Fenster neu geladen werden. Wer die Station überspringt oder die Tour abbricht, bleibt im Einsteiger-Modus.

Eine bestehende Einrichtung behält ihren Schalter-Stand: Dort läuft die Tour beim Start nicht an, und der Funktionsumfang ändert sich nicht. Wird die Tour später von Hand aufgerufen, zeigt die Station den tatsächlich geltenden Stand an und stellt nichts ungefragt zurück.

### Eigene Modi

Unter den drei festen Modi lässt sich der aktuelle Schalter-Stand unter einem eigenen Namen festhalten: „Aktuellen Stand als Modus speichern…" fragt nach dem Namen. Die Zahl eigener Modi ist nicht begrenzt.

Jeder eigene Modus trägt vier Handgriffe: Ein Klick auf seinen Namen **wendet** ihn an, **Umbenennen** gibt ihm einen anderen Namen, **Überschreiben** setzt ihn auf den aktuellen Schalter-Stand, **Löschen** entfernt ihn. Umbenennen und Löschen ändern den geltenden Schalter-Stand nicht. Die drei festen Modi bleiben davon unberührt — sie lassen sich weder überschreiben noch umbenennen noch löschen.

Ist ein Name bereits vergeben, kommt eine Rückfrage statt eines stillen Überschreibens; ein leerer Name wird abgewiesen. Ein gespeicherter Modus hält den Stand des Augenblicks fest: Wer danach einzelne Schalter ändert, ändert den Modus nicht — dafür ist das Überschreiben da.

**Ein gespeicherter Modus hält fest, welche Erweiterungen abgeschaltet sind.** Deshalb übersteht er Zu- und Abgänge: Eine Erweiterung, die es nicht mehr gibt, entfällt beim Anwenden; eine, die nach dem Speichern hinzugekommen ist und im Modus nicht vorkommt, bleibt eingeschaltet.

Eigene Modi gelten in allen Bereichen und wandern mit der eigenen Einrichtung — siehe [Einstellungen exportieren und importieren](setup-exchange.md).

## Wirkung des Aus-Zustands

- **Render-Erweiterungen:** die Syntax erscheint als normaler Text bzw. Standard-Markdown. `==markiert==` bleibt zum Beispiel sichtbarer Klartext, ein Mermaid-Block wird zum gewöhnlichen Code-Block.
- **Panels und Zugänge:** zugehörige Sidebar-Panels, Statusbar-Buttons, Menü-Einträge und Tastenkürzel verschwinden; es bleiben keine toten Bedienelemente zurück.
- **Einstellungs-Bereiche:** bringt eine Erweiterung einen eigenen Einstellungs-Bereich mit (zum Beispiel Task-Status), erscheint dieser nur bei aktiver Erweiterung in der Bereichsnavigation.

## Abhängigkeiten

Manche Erweiterungen bauen aufeinander auf: Wiki-Embeds und Bereichs-Verknüpfungen brauchen Wiki-Links, Erinnerungen brauchen Aufgaben, Ereignisse und Datenbank brauchen die Eigenschafts-Profile, Diagramme zu Tabellen brauchen die Perspective Datatable. Solange eine solche abhängige Erweiterung eingeschaltet ist, lässt sich ihre Grundlage nicht abschalten: Deren Schalter ist gesperrt, und unter der Beschreibung steht „Nicht abschaltbar — wird gebraucht von:" mit den Namen der Abhängigen; mehrere stehen gemeinsam in einem Satz. Ein Klick auf die gesperrte Zeile blendet denselben Hinweis kurz in der Statusleiste ein und ändert nichts am Schalter. Wer die Grundlage abschalten will, schaltet zuerst die Abhängigen ab; danach ist ihr Schalter frei.

Gesperrt wird nur dort, wo die abhängige Erweiterung ohne ihre Grundlage nicht mehr arbeiten kann. Lässt das Abschalten einer Erweiterung eine andere lediglich verarmen — ein Bedienelement entfällt, ein Vorschlag bleibt aus, eine Prüfung schweigt, während die Erweiterung im Übrigen weiterläuft —, bleibt der Schalter frei.

Bringt eine von anderswo eingespielte Einrichtung eine abgeschaltete Grundlage mit, während eine abhängige Erweiterung eingeschaltet ist, bleibt dieser Stand, wie er ist: Die abhängige Erweiterung wirkt als abgeschaltet und zeigt den Hinweis „Über Abhängigkeit deaktiviert"; ihr eigener Schalter bleibt erhalten und greift wieder, sobald die Grundlage eingeschaltet ist.

## Daten bleiben erhalten

Abschalten löscht nichts: Lesezeichen-Baum, Task-Status-Definitionen, Panel-Sichtbarkeiten, eigene Tastenkürzel und alle übrigen Einstellungen bleiben gespeichert und kehren beim Einschalten zurück.

## Externe Erweiterungen

Neben den internen Erweiterungen lädt die App auch selbst erstellte, externe Erweiterungs-Pakete. Sie werden im Einstellungs-Bereich Erweiterungen (extern) verwaltet: neu erkannte Pakete sind deaktiviert, die Aktivierung verlangt eine ausdrückliche Bestätigung im Warn-Dialog (fremder Code erhält vollen Zugriff auf Dokumente und App), fehlerhafte Pakete werden automatisch deaktiviert. Wie ein eigenes Paket entsteht, beschreibt die Seite [Erweiterungen erstellen](extensions-dev.md).
