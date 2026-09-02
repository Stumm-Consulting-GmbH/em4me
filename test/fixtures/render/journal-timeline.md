# Journal-Timeline-Block (4T-001064)

Der Fence rendert als Platzhalter-Container mit dem Fence-Körper als Attribut;
Modus-Auswertung, Kontext und Gitter baut der Renderer.

```perspective-journal-timeline
mode: month
```

Ein leerer Körper ist zulässig und bedeutet den Monats-Modus.

```perspective-journal-timeline
```

Auch der Alias `year` reist unverändert als Quelltext mit; ausgewertet wird er
erst im Renderer.

```perspective-journal-timeline
mode: year
```

Text nach den Blöcken.
