# Graphenansicht

Die Graphenansicht macht die Link-Beziehungen der Markdown-Dateien sichtbar: Jede Datei ist ein Knoten, jeder Link eine gerichtete Kante. Es gibt zwei Formen mit derselben Bedienung: den **Bereichs-Graph** als eigenen Tab für den gesamten Bereich und den **Datei-Graph** als Sidebar-Panel für das Umfeld der aktiven Datei.

Beide Formen gehören zur Erweiterung **Graphenansicht** und lassen sich unter Einstellungen → Erweiterungen gemeinsam abschalten.

## Bereichs-Graph (Tab)

Der Bereichs-Graph zeigt alle Markdown-Dateien des geöffneten Bereichs samt ihrer Verlinkung auf der großen Fläche eines eigenen Tabs. Geöffnet wird er über das Menü Ansicht → Bereichs-Graph oder über das Kontextmenü des Bereichs-Panels; pro Fenster gibt es einen Graph-Tab, erneutes Öffnen aktiviert den bestehenden. Der Tab ist eine Lese-Ansicht ohne Bearbeiten-Modus; sein Titel trägt den Bereichs-Namen. Ohne geöffneten Bereich ist der Eintrag nicht verfügbar.

Die Steuerleiste am Tab-Kopf bietet:

- **Richtung** — „Beide Richtungen" zeigt den vollständigen Graph. „Eingehend" bzw. „Ausgehend" begrenzen die Anzeige auf die Dateien, die von der aktiven Datei aus über Links der gewählten Richtung erreichbar sind (in beliebiger Tiefe). Ist keine Datei aktiv, zeigt der Graph weiterhin alle Kanten und weist darauf hin.
- **Datei-Zähler** — die Anzahl der aktuell dargestellten Knoten.
- **Neu anordnen** — berechnet das Layout frisch und verwirft von Hand verschobene Knoten-Positionen.

## Datei-Graph (Panel)

Das Panel „Datei-Graph" zeigt das Link-Umfeld der aktiven Datei und folgt beim Tab-Wechsel automatisch. Geschaltet wird es über das Graph-Symbol in der Statusbar, das Menü Ansicht → Panels → Datei-Graph oder ein selbst vergebenes Tastenkürzel; Seite, Reihenfolge und Reiter-Gruppen folgen den Regeln der [Sidebar](sidebar.md).

Im Panel-Kopf sitzen zwei Regler:

- **Tiefe** (1 bis 5) — wie viele Link-Schritte um die aktive Datei herum einbezogen werden. Tiefe 1 zeigt nur die direkten Nachbarn, größere Werte erweitern das Umfeld schrittweise.
- **Richtung** — „Ausgehend" folgt nur Links aus der Datei heraus, „Eingehend" nur Links auf die Datei, „Beide Richtungen" kombiniert beides.

Beide Einstellungen gelten je Spalte für die laufende Sitzung. Eine Datei ohne Link-Beziehungen erscheint als Einzel-Knoten mit Hinweis. Außerhalb eines Bereichs arbeitet das Panel mit dem begrenzten Suchraum rund um den Ordner der Datei und zeigt dazu einen dezenten Hinweis; den vollständigen Graph liefert der Bereich.

## Bedienung

- **Zoom** — Mausrad über der Fläche, zentriert um den Mauszeiger.
- **Verschieben** — die Fläche mit gedrückter Maustaste ziehen.
- **Knoten ziehen** — einzelne Knoten lassen sich mit der Maus umplatzieren; die Position bleibt für die Dauer der Sitzung erhalten, auch wenn sich der Graph aktualisiert.
- **Hervorheben** — beim Überfahren eines Knotens treten er selbst, seine direkten Nachbarn und die beteiligten Kanten hervor, der Rest wird gedimmt.
- **Öffnen** — ein Klick auf einen Knoten öffnet die Datei (bzw. springt zum bereits offenen Tab). Die aktive Datei ist farblich hervorgehoben.
- **Namens-Duplikate** — tragen mehrere Dateien denselben Namen, zeigt ein Tooltip am Knoten den vollständigen Pfad.

## Pfeil-Semantik

Kanten sind gerichtet: Der Pfeil zeigt vom verlinkenden zum verlinkten Dokument. Verweisen zwei Dateien aufeinander, verschmelzen beide Links zu **einer** Kante mit Pfeilspitzen an beiden Enden (Doppel-Pfeil). In den Graph gehen Wiki-Links (einschließlich Alias-Auflösung) und Markdown-Links auf Dateien des Suchraums ein; mehrfache Links zwischen denselben zwei Dateien zählen als eine Kante.

## Grenzen

- Knoten sind ausschließlich **Markdown-Dateien**; Tags, Anhänge oder einzelne Blöcke erscheinen nicht im Graph.
- Bei sehr großen Bereichen (mehr als 1500 Dateien) zeigt der Graph die am stärksten vernetzten Knoten und weist auf die ausgeblendeten hin.
- Der Bereichs-Graph setzt einen geöffneten Bereich voraus; das Datei-Panel arbeitet auch ohne Bereich, dann mit begrenztem Suchraum.
