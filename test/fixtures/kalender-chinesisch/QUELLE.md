# Quelle der Vergleichswerte: chinesischer Kalender

Die sechs Dateien im Ordner `portal/` sind die amtliche Stichprobe, gegen die
`test/unit/kalender-vorlage-chinesisch.test.js` die mitgelieferte Tafel des
traditionellen chinesischen Kalenders nachweist. Die Tafel ist aus einer
astronomischen Rechnung erzeugt (Bibliothek `lunar-javascript`); die Werte hier
stammen nicht aus dieser Rechnung, sondern von der zuständigen Behörde
Hongkongs.

## Herausgeber und Bezug

```
Source: Hong Kong Observatory, dataset "Gregorian-Lunar calendar conversion table",
provided via DATA.GOV.HK (https://data.gov.hk/en-data/dataset/hk-hko-rss-gregorian-lunar-calendar-conversion-table),
retrieved 2026-10-24. Intellectual property rights in the data belong to the Government of the
Hong Kong Special Administrative Region and the Hong Kong Observatory. Used under the
DATA.GOV.HK Terms and Conditions of Use (version 1.2, 26 May 2025).
```

- Adresse je Datei:
  `https://data.weather.gov.hk/weatherAPI/hko_data/calendar/nongli_calendar_<Jahr>.csv`
- Abgerufen am 2026-10-24 um 07:02:23 UTC, alle sechs mit HTTP 200.
- Die Fassung der Nutzungsbedingungen (version 1.2, 26 May 2025) ist am
  2026-10-24 erneut gelesen; sie erlaubt das Kopieren und Weitergeben der Daten
  bei Nennung der Quelle.

## Die Dateien

Byte für Byte so abgelegt, wie das Portal sie liefert (Byte-Order-Mark der
Datei 2023 und gemischte Zeilenenden eingeschlossen); `.gitattributes` nimmt den
Ordner deshalb von der Umschreibung der Zeilenenden aus. Die Prüfdatei weist die
Unverändertheit über die SHA-256 nach.

| Datei | Tage | SHA-256 |
|---|---|---|
| `nongli_calendar_2023.csv` | 365 | `765361bc4a65ce8bc4687f062d1c8afdb08deba1fb365aaea7c7b44481cb7419` |
| `nongli_calendar_2024.csv` | 366 | `f2d67d5407e433bcaebbfd048bc54e4ab5c12bfb65a91b4e00af52db11278175` |
| `nongli_calendar_2025.csv` | 365 | `d2c5d752f370d3e583bde4950845fb6b4bfce1e1551da913ad14d655014fb32c` |
| `nongli_calendar_2026.csv` | 365 | `8b2892b0e04faa632f09ea36ffee29e67b4427b85a18708d907d88d8be452b98` |
| `nongli_calendar_2027.csv` | 365 | `11de6b80c61769851aa579af009dc728ca4c544b75b9a0a466ef36446c6bb4fe` |
| `nongli_calendar_2028.csv` | 366 | `49304a711e0e57db7b8b2733159e735550febb17c1a4998a3cd9179dad78bd8a` |

Kopfzeile `Gregorian Date,Chinese year (Gan-Zhi),Chinese year (Zodiac),Lunar month,Lunar Date`;
Datum `T-Mon-JJ`; das Jahr als Name im Zyklus von 60 Jahren ohne Jahreszahl;
Monat `正月` bis `十二月`, ein Schaltmonat mit der Vorsilbe `閏`; Tag `初一` bis
`三十`.

## Nutzung

Weder das Programm noch ein Prüflauf ruft das Portal auf; die Dateien wurden
einmalig beschafft (Story 4S-001110). Weiteres Material des Observatoriums liegt
nicht im Projekt.
