// 4T-002363 (Epic 3E-000333): Probe-Tafel der Jahres-Struktur (erfunden), in
// der Form einer erzeugten Tafel. Vier Jahre ab dem Jahr 4700, das am Tag
// 730 155 der Rata-Die-Zählung (05.02.2000) beginnt: ein Gemeinjahr, ein Jahr
// mit Schaltmonat nach dem 4. Monat, ein Jahr mit 355 Tagen, ein Gemeinjahr
// mit anders verteilten Monatslängen.
export default {
  name: 'probe',
  erzeugt: 'von Hand für die Prüfungen von 4T-002363',
  ersteJahr: 4700,
  ersterTag: 730155,
  namensStellen: 24,
  jahre: [
    '29,30,29,30,29,30,29,30,29,30,29,30', // 4700, 354 Tage
    '30,29,30,29,29L,30,29,30,29,30,29,30,30', // 4701, 384 Tage
    '30,30,29,30,29,30,29,30,29,30,29,30', // 4702, 355 Tage
    '29,30,30,29,30,29,30,29,30,29,29,30', // 4703, 354 Tage
  ],
};
