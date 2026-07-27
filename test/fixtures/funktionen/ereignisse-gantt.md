# Ereignis-Gantt-Test

Zwei verkettete Spannen, ein Zeitpunkt ohne Ende. Die Spanne reicht
bewusst von 2020 bis 2099, damit der Stichtag des Laufs immer innerhalb
der Achse liegt und die Heute-Linie stabil erscheint (Datums-Regel des
Test-README).

```perspective-events
| 2020-01-06 | 2020-03-27 | Konzeptphase | projekt | | | e1 | | e2 |
| 2020-03-30 | 2020-07-31 | Umsetzung | projekt | | | e2 | e1 | |
| 2099-01-15 | | Abschluss-Termin | termin | | | | | |
```
