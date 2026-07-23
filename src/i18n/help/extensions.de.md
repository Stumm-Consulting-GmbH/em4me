# Erweiterungen

Viele Funktionen der App sind interne Erweiterungen und lassen sich einzeln ein- und ausschalten. Der Kern — Editor, Tabs und Fenster, Datei-Handling, Ansichts-Modi, Sidebar-Rahmen, Einstellungen, Handbuch, Theme, Sprachen und das CommonMark-Basis-Rendering — ist bewusst nicht abschaltbar; die App bleibt damit immer funktionsfähig.

## Schalten

Der Einstellungs-Bereich Erweiterungen (Datei → Einstellungen → Erweiterungen) listet alle internen Erweiterungen in drei Kategorien:

- **Rendering** — Markdown-Konstrukte wie Callouts, Fußnoten, Highlight, Typografie, Perspective-Tabellen, KaTeX-Formeln, Mermaid-Diagramme oder Syntax-Highlighting.
- **Vernetzung** — Wiki-Links, Wiki-Embeds, Tags und Autocomplete.
- **Werkzeuge** — Markdown-Linter, Lesezeichen, Fokus-Modus mit Typewriter-Scroll, Wort-Statistik und Code-Copy-Button.

Jede Zeile zeigt Name und Kurzbeschreibung. Änderungen wirken bei Anwenden oder OK — sofort, ohne Neustart und in allen Fenstern.

## Wirkung des Aus-Zustands

- **Render-Erweiterungen:** die Syntax erscheint als normaler Text bzw. Standard-Markdown. `==markiert==` bleibt zum Beispiel sichtbarer Klartext, ein Mermaid-Block wird zum gewöhnlichen Code-Block.
- **Panels und Zugänge:** zugehörige Sidebar-Panels, Statusbar-Buttons, Menü-Einträge und Tastenkürzel verschwinden; es bleiben keine toten Bedienelemente zurück.
- **Einstellungs-Bereiche:** bringt eine Erweiterung einen eigenen Einstellungs-Bereich mit (zum Beispiel Task-Status), erscheint dieser nur bei aktiver Erweiterung in der Bereichsnavigation.

## Abhängigkeiten

Manche Erweiterungen bauen aufeinander auf: Wiki-Embeds brauchen Wiki-Links. Wird die Grundlage abgeschaltet, deaktivieren sich abhängige Erweiterungen mit; der Bereich zeigt dann den Hinweis „Über Abhängigkeit deaktiviert". Der eigene Schalter der abhängigen Erweiterung bleibt erhalten und greift wieder, sobald die Grundlage eingeschaltet ist.

## Daten bleiben erhalten

Abschalten löscht nichts: Lesezeichen-Baum, Task-Status-Definitionen, Panel-Sichtbarkeiten, eigene Tastenkürzel und alle übrigen Einstellungen bleiben gespeichert und kehren beim Einschalten zurück.

## Externe Erweiterungen

Neben den internen Erweiterungen lädt die App auch selbst erstellte, externe Erweiterungs-Pakete. Sie werden im Einstellungs-Bereich Erweiterungen (extern) verwaltet: neu erkannte Pakete sind deaktiviert, die Aktivierung verlangt eine ausdrückliche Bestätigung im Warn-Dialog (fremder Code erhält vollen Zugriff auf Dokumente und App), fehlerhafte Pakete werden automatisch deaktiviert. Wie ein eigenes Paket entsteht, beschreibt die Seite [Erweiterungen erstellen](extensions-dev.md).
