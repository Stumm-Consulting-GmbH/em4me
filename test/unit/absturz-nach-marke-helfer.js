// 4T-001824 (Epic 3E-000254, Bauplan B3): Der Kindprozess des einen echten
// Abbruchs nach der Marke, gestartet von `db-intent-recovery-absturz.test.js`.
//
// Er führt einen Auftrag über die produktive Zusammensetzung aus (eine
// Sperr-Verwaltung, die Klammer, der Wiederanlauf und die Schnittstelle, wie in
// `src/main/app/wiring.js`) und beendet sich mit dem Code 137, sobald das
// Protokoll durchgeschrieben ist: Das erste Umbenennen läuft erst nach der Marke,
// und genau dort sitzt der Abbruch. Kein Aufräumen, kein Freigeben, kein
// geordnetes Ende — das ist der Zustand, den ein Absturz hinterlässt, samt dem
// Datei-Zwischenspeicher des Betriebssystems.
//
// Aufruf: `node absturz-nach-marke-helfer.js <Bereichs-Wurzel> <Anweisungen als JSON>`.
// Eine Prüfdatei ist das nicht; vitest sammelt nur `*.test.js`.
'use strict';

const { erzeugeSperrVerwaltung } = require('../../src/main/database/lock-lifecycle.js');
const { erzeugeAbsichtsProtokoll } = require('../../src/main/database/intent-log.js');
const { erzeugeWiederanlauf } = require('../../src/main/database/intent-recovery.js');
const { erzeugeSchreibSchnittstelle } = require('../../src/main/database/record-auftrag.js');

const ABBRUCH_CODE = 137;

const wurzel = process.argv[2];
const anweisungen = JSON.parse(process.argv[3]);
const leseKonfig = async () => undefined;

const sperrVerwaltung = erzeugeSperrVerwaltung({ leseKonfig });
const absichtsProtokoll = erzeugeAbsichtsProtokoll({
  sperrVerwaltung,
  leseKonfig,
  // Unmittelbar nach der Marke: Das Protokoll ist angelegt und durchgeschrieben.
  benenneUm: () => process.exit(ABBRUCH_CODE),
});
const wiederanlauf = erzeugeWiederanlauf({
  sperrVerwaltung,
  leseKonfig,
  erweiterungAktiv: () => true,
});
const schnittstelle = erzeugeSchreibSchnittstelle({
  sperrVerwaltung,
  absichtsProtokoll,
  wiederanlauf,
  erweiterungAktiv: () => true,
  warteAbstaende: [],
});

// Kommt der Auftrag zurück, hat der Abbruch nicht gegriffen; das meldet der
// eigene Code, damit die Prüfdatei es vom Abbruch unterscheiden kann.
schnittstelle.fuehreAuftragAus(wurzel, { anweisungen }).then(
  (ergebnis) => {
    process.stderr.write(`Kein Abbruch: ${JSON.stringify(ergebnis)}\n`);
    process.exit(2);
  },
  (err) => {
    process.stderr.write(`Geworfen: ${err && err.stack ? err.stack : String(err)}\n`);
    process.exit(3);
  },
);
