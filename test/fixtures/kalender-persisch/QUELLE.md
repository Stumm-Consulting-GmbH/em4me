# Quelle der Vergleichswerte: persischer Kalender

Die Datei `teheran-schaltjahre.json` trägt die Vergleichswerte, gegen die
`test/unit/kalender-vorlage-persisch.test.js` die mitgelieferte Tafel des
persischen Kalenders in der amtlichen Lesart nachweist. Die Werte stammen nicht
aus der Kalender-Schnittstelle, aus der die Tafel erzeugt ist, sondern aus zwei
Veröffentlichungen der zuständigen iranischen Stelle.

## Herausgeber

Kalender-Zentrum des Geophysik-Instituts der Universität Teheran (amtlich
zuständig für den iranischen Kalender). Nach der Fußnote der Tafel ist sie das
Ergebnis eines Forschungsvorhabens des Kalender-Zentrums, ausgeführt von Mahdi
Sohrabi, Mitglied des Rats des Kalender-Zentrums.

## Schaltjahre

- **Tafel der gewöhnlichen und Schaltjahre 1206 bis 1498** (persische Jahre, Jahresbeginn
  1827 bis 2119), PDF vom 2018-07-01, 101 KB:
  `https://calendar.ut.ac.ir/documents/2139738/7092644/Kabise+Shamsi+1206-1498.pdf/fbc45bf4-df46-c298-381c-2bff2c57f0e0?t=1719740029743`
- Abgerufen und ausgelesen am 2026-10-22.
- Übernommen sind allein die Schaltmarken der persischen Jahre 1279 bis 1479
  (Jahresbeginn 1900 bis 2100): `schaltjahre` nennt die 49 Jahre mit Marke,
  `fuenfjaehrig` die sechs davon mit der Marke `**`. Die Marke `*` bezeichnet
  die Schaltung nach vier Jahren, `**` die nach fünf Jahren; sie steht am Jahr,
  dessen letzter Monat Esfand 30 Tage hat. Jedes Jahr des Zeitraums ohne Marke
  ist ein Gemeinjahr mit 365 Tagen.
- **Nicht übernommen** ist die Datums-Spalte der Tafel: Sie nennt in 99 von 201
  Jahren einen Tag vor dem Jahresbeginn (nach dem Abgleich mit der Seite unten
  den Tag der Tagundnachtgleiche) und taugt nicht als Nachweis des
  Jahresbeginns.

## Anker-Tage

- **Seite «Jahreswechsel vergangener Jahre»** des Kalender-Zentrums (persische
  Jahre 1360 bis 1403), am 2026-10-22 aufgerufen:
  `https://calendar.ut.ac.ir/en/%D8%AA%D8%AD%D9%88%D9%8A%D9%84-%D8%B3%D8%A7%D9%84-%D9%87%D8%A7%D9%8A-%DA%AF%D8%B0%D8%B4%D8%AA%D9%87`
- Übernommen sind zwei Tage: Die Tagundnachtgleiche des Jahres 1360 lag am
  29. Esfand 1359 = 20.03.1981, die des Jahres 1403 am 1. Farvardin 1403 =
  20.03.2024 (`anker`). Mit einem dieser Tage und den Schaltmarken folgt jeder
  Jahresbeginn des Zeitraums.

## Nutzung

Nutzungsbedingungen wurden auf den Seiten des Kalender-Zentrums nicht gefunden.
Abgelegt sind deshalb allein abgeleitete Angaben (49 Jahreszahlen, sechs
Marken, zwei Tage) mit dieser Quellenangabe; die PDF selbst liegt nicht im
Projekt. Weder das Programm noch ein Prüflauf ruft die Seiten auf; die Werte
wurden einmalig beschafft (Story 4S-001110).
