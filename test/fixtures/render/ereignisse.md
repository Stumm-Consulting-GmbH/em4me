# Ereignis-Fence

Eingebettete Verwaltung (Art 1) mit Direktiven, Kategorien, Notizen und Wiederkehr:

```perspective-events
view: table
filter: Runde := categories=geburtstag; recurring=x
| 2020-01-01 | | Projektstart Alpha | projekt | Kickoff-Notiz | | | | |
| 1990-03-10 | | Geburtstag Anna | geburtstag | | x | | | |
| 2024-02-29 | 2024-06-30 | Schaltjahres-Spanne | termin | Zeile1\nZeile2 | | | | |
| 2026-03-01 | 2026-02-01 | Ende vor Beginn | fantasie | | | | | |
```

Struktur-Fehler bleiben Fehler-Liste:

```perspective-events
spalten: kaputt
```

Aggregation (Art 2) rendert als Platzhalter:

```perspective-events
query: FROM "Personen" WHERE event-category = 'geburtstag'
```
