# Dashboard-Block

Vor dem ersten Dashboard steht gewöhnlicher Fließtext.

````perspective-dashboard
%% Projekt-Überblick, Stand 2026-11 %%
!filter status titel="Status" vorbelegung=offen eigenschaft=status
offen
!filter prio titel="Priorität" vorbelegung=dringend
hoch
mittel
niedrig
!kachel text breite=ganz
## Projekt-Überblick
Offene Arbeit nach Status; Details in [[Projekt-Regeln]] und [extern](https://example.org).

- [ ] Eine Aufgabe in der Kachel
%% privat in der Text-Kachel %%

```perspective-dashboard
\!kachel liste
```

!zeile
!kachel kennzahl titel="Offene Aufgaben" breite=drittel
LIST FROM "Aufgaben" WHERE status = $status AND prioritaet = $prio
!kachel kennzahl titel="Aufwand gesamt" breite=4/12
%% Gesamtwert ohne Gruppierung %%
TABLE WITHOUT ID sum(aufwand) AS "Aufwand" FROM "Aufgaben"
!kachel kennzahl titel="Je Priorität" breite=4
TABLE count() AS "Anzahl" FROM "Aufgaben" GROUP BY prioritaet

!zeile
!kachel balken titel="Aufgaben je Status" breite=halb
TABLE count() AS "Anzahl" FROM "Aufgaben" GROUP BY status
!kachel kreis titel="Anteil <script>alert(1)</script> & mehr" breite=viertel
TABLE count() AS "Anzahl" FROM "Aufgaben" GROUP BY kategorie
!kachel liste titel="Gemeinsame Abfrage" abfrage="Abfragen/Zuletzt geändert"

!zeile
!kachel tabelle titel="Ohne Angabe eins"
TABLE status FROM "Aufgaben"
!kachel liste titel="Ohne Angabe zwei"
LIST FROM "Aufgaben"
!kachel liste titel="Ohne Angabe drei"
LIST FROM "Notizen"

!zeile
!kachel liste titel="Über zwölf" breite=8/12
LIST
!kachel liste titel="Bricht um" breite=halb
LIST
!kachel liste titel="Ungültige Breite" breite=13
LIST

!zeile
!kachel tacho titel="Unbekannte Art"
LIST
!kachel liste titel="Doppelte Quelle" abfrage="Q"
LIST
!kachel balken titel="Ohne Quelle"
!kachel kennzahl Offene Aufgaben
LIST
!ampel rot
ein Inhalt, den diese Fassung nicht kennt
!zeile
````

Zwischen den Dashboards steht wieder Fließtext.

```perspective-dashboard
!kachel liste
LIST
```

Ein leerer Block zeigt die Hinweis-Fläche.

```perspective-dashboard
!filter status
!zeile
```

Ein Block in einem äußeren Zaun bleibt wörtlicher Text.

````markdown
```perspective-dashboard
!kachel liste
LIST
```
````
