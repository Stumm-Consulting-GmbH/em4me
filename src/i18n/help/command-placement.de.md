# Kommando-Platzierung

Jede Aktion der App ist ein Kommando in der zentralen Registry. Die Kommando-Platzierung macht daraus dauerhafte eigene Zugänge: Kommando-Buttons in der Statusleiste, eine Ausblende-Liste für die Standard-Buttons, eigene Einträge im Editor-Kontextmenü und Makros als Kommando-Sequenzen. Gepflegt wird das an zwei Orten: die beiden Statusleisten-Listen unter „Datei → Einstellungen… → Statusleiste", die Kontextmenü-Einträge und die Makros unter „Datei → Einstellungen… → Kontextmenü und Makros". Die vier Funktionen gehören zur schaltbaren Erweiterung „Kommando-Platzierung" (Kategorie Werkzeuge).

## Statusbar-Buttons

Eigene Kommando-Buttons erscheinen als eigenes Segment in der Statusleiste, rechts neben den Ansichts-Buttons. Die Anlage läuft in drei Schritten: Kommando per Filter-Suche wählen, Icon aus dem kuratierten internen Set festlegen, optional einen Anzeigenamen vergeben. Der Tooltip des Buttons zeigt den Anzeigenamen und dahinter in Klammern das Original-Kommando; ohne Anzeigenamen steht dort das Kommando selbst. In der Liste des Bereichs „Statusleiste" lassen sich Buttons umordnen (Hoch/Runter), bearbeiten und entfernen.

Reicht der Platz in der Statusleiste nicht — etwa bei schmalen Fenstern —, wandern die Buttons zusammen mit den übrigen Elementen der Leiste in deren Rand-Menüs und lassen sich dort weiter ausführen; siehe [Ansichten und Darstellung](views-display.md).

Buttons, deren Kommando zu einer deaktivierten Erweiterung gehört, erscheinen nicht (die Konfiguration bleibt erhalten und kehrt mit der Erweiterung zurück).

## Standard-Buttons ausblenden

Jedes Standard-Element der Statusleiste lässt sich einzeln ausblenden: die Panel-Schalter, die drei Editor-Schalter (Gliederung, Zeilennummern, Zeilenumbruch), die vier Ansichts-Buttons und die Elemente der rechten Seite (Wort-Statistik, Zoom-Anzeige, Bearbeiten, Scroll-Synchronisation, Dokument-Historie, Theme, Sprache). Nur die Hinweis-Zeile bleibt immer sichtbar — sie ist der einzige Kanal für kurze Meldungen wie den Speicher-Status.

Ausblenden räumt nur den Zugang auf, die Funktion bleibt erhalten: alles Ausgeblendete ist weiter über das Menü, die Kommando-Palette und Tastenkürzel erreichbar. Der Knopf „Alle einblenden" stellt die Standard-Statusleiste wieder her. Das Ausblenden hier ist dauerhaft und unabhängig davon, ob eine Schaltfläche gerade benutzbar wäre; wie die Leiste mit Schaltflächen umgeht, die im Augenblick nichts tun können, beschreibt [Ansichten und Darstellung](views-display.md).

## Editor-Kontextmenü

Eigene Kommando-Einträge erscheinen als zusätzliche Sektion am Ende des Editor-Kontextmenüs, im Quelltext- wie im Live-Modus. Sie werden in der Liste des Bereichs „Kontextmenü und Makros" gepflegt — gleicher Anlage-Flow und gleiches Eintrag-Modell wie die Statusbar-Buttons, aber mit eigener Reihenfolge. Jeder Eintrag zeigt sein Icon und seinen Anzeigenamen.

Einträge, deren Kommando im aktuellen Kontext nicht ausführbar ist (zum Beispiel ein Bereichs-Kommando ohne geöffneten Bereich), erscheinen deaktiviert statt zu verschwinden — konsistent zum restlichen Menü. Ohne konfigurierte Einträge entfällt die Sektion komplett. Die Sektion gehört zum Haupt-Editor; das Kontextmenü des Notiz-Felds bleibt unverändert.

## Makros

Ein Makro bündelt eine geordnete Folge von Schritten unter eigenem Namen und Icon. Zwei Schritt-Typen stehen bereit: „Kommando ausführen" (ein Kommando aus der Registry, auch ein anderes Makro) und „Verzögerung" (null bis zehn Sekunden, zum Beispiel um einer Ansicht Zeit zum Aufbau zu geben). Die Schritte laufen strikt nacheinander; jeder Schritt wartet auf den vorherigen.

Schlägt ein Schritt fehl oder ist sein Kommando im aktuellen Kontext nicht ausführbar, bricht die Sequenz ab und die Statusleiste zeigt einen Hinweis mit Makro-Name und Schritt-Nummer. Ruft ein Makro ein anderes Makro auf, ist die Aufruf-Kette begrenzt; eine zu tiefe Verschachtelung (auch ein Makro, das sich selbst aufruft) bricht mit einem eigenen Hinweis ab. Makros starten nie automatisch, sondern nur über ihre Zugänge.

Der entscheidende Kniff: Jedes Makro wird selbst als reguläres Kommando registriert. Damit ist es in der Kommando-Palette findbar, im Einstellungs-Bereich „Tastenkürzel" mit einem eigenen Kürzel belegbar und über Statusbar-Buttons und Kontextmenü-Einträge platzierbar — ohne Sonderbehandlung.

Der Schritt-Editor liegt im selben Einstellungs-Bereich: pro Makro eine aufklappbare Schritt-Liste mit Umordnen und Löschen, dazu ein Testlauf-Knopf. Der Testlauf führt den aktuellen Bearbeitungs-Stand sofort aus — im Kontext des Einstellungs-Tabs, sodass kontextpflichtige Schritte dort erwartungsgemäß mit dem Hinweis abbrechen.

## Abgrenzung zur Kommando-Palette

Die [Kommando-Palette](tools.md) und die Kommando-Platzierung arbeiten auf derselben Kommando-Registry, bedienen aber verschiedene Situationen: Die Palette ist der flüchtige Tastatur-Zugriff — öffnen, tippen, ausführen, ohne etwas einzurichten. Die Platzierung schafft dauerhafte Zugänge für wiederkehrende Handgriffe: ein Klick in der Statusleiste, ein Rechtsklick im Editor, ein Kürzel auf einem Makro.

## Aus-Zustand

Wird die Erweiterung „Kommando-Platzierung" deaktiviert, zeigt die Statusleiste wieder den Standard-Zustand: keine eigenen Buttons, keine Ausblendungen, keine Kontextmenü-Sektion; die Makro-Kommandos sind abgemeldet. In den Einstellungen entfällt der Bereich „Kontextmenü und Makros", und im Bereich „Statusleiste" verschwinden die beiden Listen; die Einstellung zum Zusammenklappen der Leiste bleibt dort stehen, denn sie gehört nicht zur Erweiterung. Die gesamte Konfiguration bleibt gespeichert und wirkt nach dem Wieder-Einschalten unverändert.
