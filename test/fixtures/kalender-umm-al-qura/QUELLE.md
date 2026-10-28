# Quelle der Vergleichswerte: islamischer Kalender nach Umm al-Qura

Die Datei `portal-abgleich.json` trägt die Vergleichswerte, gegen die
`test/unit/kalender-vorlage-umm-al-qura.test.js` die mitgelieferte Tafel des
islamischen Kalenders nach Umm al-Qura nachweist. Die Werte stammen nicht aus
der Kalender-Schnittstelle, aus der die Tafel erzeugt ist, sondern aus der
amtlichen Ausgabe der zuständigen saudischen Behörde.

## Herausgeber

King Abdulaziz City for Science and Technology (KACST), Riad. Nach der
Fußzeile des Portals: «Developed and maintained by King Abdulaziz City for
Science and Technology (KACST).»

## Abruf

- **Seite «Annual Reference»** des Portals «Umm Al-Qura Calendar»:
  `https://www.ummulqura.org.sa/en/annual-reference`
- Abgerufen am 2026-10-24 über die Website, Jahr für Jahr über die Auswahl
  «Select Hijri Year», alle 183 Jahre 1318 bis 1500 AH; gelesen wurde je Jahr
  die Tabelle der zwölf Monatsanfänge. Keine Schnittstelle direkt aufgerufen,
  keine Datei heruntergeladen.
- Länge des letzten Monats von 1500 AH aus der Kalender-Ansicht des Portals
  (`https://www.ummulqura.org.sa/en/calendar`): 18.10. bis 16.11.2077, also
  30 Tage. Ein Jahr 1501 bietet das Portal nicht an.

## Was abgelegt ist und warum

Die Nutzungsbedingungen des Portals (`/en/terms-and-conditions`, gelesen am
2026-10-24) regeln allein die Nutzung der Website: «The website may be used to
access Hijri calendar services, prayer times, date conversion, and related
informational content, provided that the website is not misused or
disrupted.» Zu Vervielfältigung, Weitergabe oder Quellenangabe sagen sie
nichts; die Fußzeile lautet «All rights reserved». Eine Erlaubnis zur
Weitergabe der Daten liegt damit nicht vor.

Abgelegt sind deshalb **nicht** die 2 196 gelesenen Monatsanfänge, sondern ihr
Fingerabdruck und Kennzahlen:

- `pruefsummeZeilen`: SHA-256 über die allein aus den Portal-Werten gebildeten
  Tafel-Zeilen (Bildung in `verfahren`, dieselbe wie die Prüfsumme im Kopf der
  Tafel). Gleichheit heißt, dass jeder Monatsanfang der Tafel der des Portals
  vom Abruf-Tag ist.
- `jahre`, `monatsanfaenge`, `tage`, `jahreMit355Tagen`,
  `laengeLetzterMonat`: Umfang des Abrufs.
- `stichtage`: drei Tage, die schon im Wortlaut der Story 4S-001110 stehen
  (erster und letzter Tag des Geltungs-Zeitraums, 1. Ramadan 1446).

Die gelesenen Werte selbst liegen im nicht veröffentlichten Protokoll des
Projekts (`Tests/3E-000333/4T-002008/portal-monatsanfaenge.txt`, Ablauf in
`protokoll.md`, Abschnitt 2), wo bei einer Abweichung der betroffene Monat zu
finden ist.

## Grenze

Ändert die Behörde später einen Monat, merkt der Nachweis das nicht; dafür
gilt die Zusage der Fortschreibung (Story 4S-001110). Weder das Programm noch
ein Prüflauf ruft das Portal auf; die Werte wurden einmalig beschafft.
