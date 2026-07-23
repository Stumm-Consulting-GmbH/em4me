# Ereignis-Zusatz-Ansichten

Dashboard (Anstehende, Meilensteine, Kategorie-Statistik):

```perspective-events
view: dashboard
| 2026-07-20 | | Workshop | termin | | | | | |
| 1990-03-10 | | Geburtstag Anna | geburtstag | | x | | | |
| 2023-10-19 | | Tausend Tage | projekt | | | | | |
```

Monats-Kalender mit Zeitspanne über die Tage:

```perspective-events
view: month
| 2026-07-20 | | Workshop | termin | | | | | |
| 2026-07-08 | 2026-07-11 | Projekt-Phase | projekt | | | | | |
```

Wochen-Kalender:

```perspective-events
view: week
| 2026-07-15 | | Heutiger Termin | termin | | | | | |
| 2026-07-13 | 2026-07-17 | Wochen-Spanne | projekt | | | | | |
```

Timeline mit Jahres- und Monats-Gruppierung:

```perspective-events
view: timeline
| 1990-03-10 | | Geburtstag Anna | geburtstag | | x | | | |
| 2020-01-01 | | Projektstart Alpha | projekt | | | | | |
| 2026-07-20 | | Workshop | termin | | | | | |
```
