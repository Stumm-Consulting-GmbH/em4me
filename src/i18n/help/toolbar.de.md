# Format-Toolbar

Die Format-Toolbar ist eine Schaltflächen-Leiste oberhalb des Editors für die häufigen Bearbeitungs-Handgriffe: Zeichen-Formate, Überschriften, Listen, Zitat, Links und Tabellen. Jede Schaltfläche löst ein Kommando der zentralen Registry aus — dieselben Kommandos, die auch Editor-Kontextmenü, Tastenkürzel und Kommando-Palette ausführen. Die Leiste gehört zur schaltbaren Erweiterung „Format-Toolbar" (Kategorie Werkzeuge).

## Sichtbarkeit

Die Leiste erscheint genau dann, wenn der aktive Tab im Edit-Modus steht und die Ansicht einen Editor zeigt (Quellcode-, Geteilt- oder Live-Ansicht). In der Lese-Ansicht, auf Handbuch- und System-Seiten und im Fokus-Modus ist sie unsichtbar. Im geteilten Fenster-Layout trägt jede Editor-Spalte ihre eigene Leiste; ein Klick in die Leiste der zweiten Spalte aktiviert diese zugleich.

## Standard-Belegung und Zustands-Anzeige

Die Standard-Belegung gruppiert per Trenner: die Zeichen-Formate (Fett, Kursiv, Durchgestrichen, Hervorheben, Code), das Überschrift-Menü, die Listen-Typen (Aufzählung, nummerierte Liste, Aufgaben-Liste), das Zitat, die beiden Link-Aktionen (Wiki-Link, externer Link) und den Tabellen-Button. Tooltips zeigen den Kommando-Namen und das aktuell wirksame Kürzel, eigene Anzeigenamen stehen davor.

Gedrückte Schaltflächen zeigen den Zustand an der Cursor-Position: Listen-, Überschrift- und Zitat-Schaltflächen folgen der Cursor-Zeile, die Zeichen-Format-Schaltflächen der Selektion beziehungsweise dem Wort unter dem Cursor. Gedrückt bedeutet dabei: ein erneuter Klick entfernt das Format — Anzeige und Umschalt-Wirkung bleiben deckungsgleich.

## Überschrift-Menü

Der Überschrift-Button öffnet die Ebenen-Auswahl: Überschrift-Ebene eins bis sechs plus „Keine Überschrift", mit Häkchen auf der Ebene der Cursor-Zeile. Der Button selbst erscheint gedrückt, sobald die Cursor-Zeile eine Überschrift ist.

## Tabellen-Raster

Der Tabellen-Button öffnet ein Auswahl-Raster nach Textverarbeitungs-Vorbild: Überstreichen markiert Zeilen mal Spalten (die Beschriftung zeigt die Größe, Zeilen inklusive Kopfzeile), ein Klick fügt die leere Tabelle mit Kopfzeile und Trennzeile am Cursor ein. Rückgängig entfernt die eingefügte Tabelle in einem Schritt. An allen anderen Zugängen (Kontextmenü, Palette, Kürzel) fügt das Tabellen-Kommando unverändert seine kompakte Standard-Schablone ein.

## Überlauf

Passt die Belegung nicht in die Breite der Editor-Spalte, wandern die hinteren Einträge in ein Mehr-Menü am rechten Rand der Leiste. Die Menü-Einträge zeigen Icon, Namen und Zustands-Häkchen; das Überschrift-Menü erscheint dort als Untermenü, der Tabellen-Eintrag öffnet das Auswahl-Raster.

## Belegung anpassen

Der Bereich „Datei → Einstellungen… → Format-Toolbar" pflegt die Belegung als Liste: Einträge umordnen (Hoch/Runter), bearbeiten und entfernen; neue Kommandos entstehen im Drei-Schritt-Dialog (Kommando per Filter-Suche, Icon aus dem kuratierten Set, optionaler Anzeigename). Trenner und das Überschrift-Menü sind eigene Eintrags-Typen; „Auf Standard zurücksetzen" stellt die Standard-Belegung wieder her. Einträge, deren Kommando zu einer deaktivierten Erweiterung gehört, erscheinen nicht in der Leiste — die Konfiguration bleibt erhalten und kehrt mit der Erweiterung zurück.

## Abgrenzung

Die Format-Toolbar ist der Editier-Zugang im Edit-Modus. Die [eigenen Statusbar-Buttons](command-placement.md) der Kommando-Platzierung sind dauerhaft sichtbare, frei belegbare Zugänge in der Statusleiste; die Kommando-Palette (siehe [Werkzeuge](tools.md)) ist der flüchtige Tastatur-Zugriff auf alle Kommandos.

## Aus-Zustand

Wird die Erweiterung „Format-Toolbar" deaktiviert, verschwindet die Leiste vollständig und der Einstellungs-Bereich ist ausgeblendet; alle Format-Kommandos bleiben über Kontextmenü, Kürzel und Palette erreichbar. Die Belegung bleibt gespeichert und wirkt nach dem Wieder-Einschalten unverändert.
