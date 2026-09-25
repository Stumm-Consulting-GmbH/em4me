---
kanban-plugin: board
---

## Planung (3)

- [ ] Angebot prüfen #kunde @{2026-10-01} @@{14:00}
- [ ] Nur ein Tag @{2026-10-02}
- [ ] Termin und Kalender @{Termine: 2026-10-01} @{2026-10-01} @@{14:00}
- [ ] Ungültiges Datum @{2026-13-40}
- [ ] Fremdes Format @{01.10.2026}
- [ ] Uhrzeit allein @@{09:30}
- [ ] Ungültige Uhrzeit @{2026-10-07} @@{25:00}
- [ ] Verknüpfter Termin @[[2026-10-04]]
    Eine Folgezeile mit @{2026-10-05}


## In Arbeit(2)

- [/] Laufende Aufgabe 📅 2026-09-30 @{2026-10-06}
- [ ] @{2026-10-08} Termin vorn


## Später (bald)

- [ ] Ohne Limit


## Fertig (0)

**Complete**

- [x] Abgeschlossen
    mit Folgezeile


***

## Archive

- [x] 2026-09-20 09:00 Alte Karte #intern
- [ ] Zweite alte Karte
    mit Folgezeile

Eine Prosa-Zeile im Archiv.


%% kanban:settings
```
{"kanban-plugin":"board","archive-with-date":true,"list-collapse":[false,false,false,false]}
```
%%
