#!/usr/bin/env node
// 4T-001826 (Epic 3E-000254): Erzeugt die mitgelieferten Änderungsbelege des
// Demo-Bereichs, die Beleg-Datei `src/demo/Library.mddl` samt der Zähler-Datei
// `src/demo/Area_Database.mdda` und den drei geänderten Zellen von
// `src/demo/Library.md`.
//
// **Warum die Beleg-Datei nur so entstehen darf.** Von Hand wird an ihr nichts
// geschrieben. Die Vorgangs-Kennung eines Belegs hängt an einem Zähler, den
// allein die Schreib-Schnittstelle führt, und jeder Beleg muss an die Werte
// anschließen, die die Tabelle trägt; sonst zeigte die Beleg-Ansicht gleich im
// Demo-Bereich eine unterbrochene Spur. Ein von Hand gebauter Beleg gäbe vor,
// die Anwendung habe ihn geschrieben, und ginge beim nächsten Format-Wechsel
// still an ihr vorbei. Dieses Skript ruft deshalb die Schreib-Schnittstelle der
// Anwendung in ihrer produktiven Zusammensetzung (Sperr-Verwaltung, Klammer des
// Absichts-Protokolls, Wiederanlauf, Vorgangs-Zähler, wie `wiring.js` sie
// verdrahtet) und baut keinen eigenen Schreibweg, keinen eigenen Sperr-Speicher
// und keinen eigenen Zähler. Die Beleg-Datei ist damit per Konstruktion das,
// was die ausgelieferte Anwendung erzeugen würde.
//
// **Fest gesetzt sind allein Zeitpunkt und Herkunft**, über die Nähte `jetzt`
// und `herkunft` der Schnittstelle: Im ausgelieferten Beleg stehen weder das
// Bau-Datum noch Benutzer und Rechner des Bau-Rechners, und zwei Läufe erzeugen
// Zeichen für Zeichen dieselben Dateien.
//
// **Gearbeitet wird ausschließlich auf einer Kopie** unter `Tests/4T-001826/`
// (außerhalb der Versionskontrolle). `src/demo/` wird zu keinem Zeitpunkt
// beschrieben; am Ende wandern genau drei Dateien zurück. Mit `--pruefen` wandert
// nichts zurück: Die Erzeugnisse der Kopie werden Byte für Byte mit `src/demo/`
// verglichen, und jede Abweichung endet mit Rückgabewert 1.
//
// **Jeder Lauf beginnt beim selben Ausgangs-Stand** (Nachschärfung, Variante A
// der Sitzung vom 2026-09-23). Nach dem ersten Lauf trägt `src/demo/` bereits
// die Erzeugnisse; die Kopie wird deshalb vor den Aufträgen auf den Stand davor
// zurückgesetzt (siehe `stelleAusgangsStandHer`).
//
// Aufruf: node scripts/demo-belege-erzeugen.js [--pruefen]
//
// Ohne Aufrufer in der Anwendung und ohne Electron.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { erzeugeSperrVerwaltung } = require('../src/main/database/lock-lifecycle.js');
const { erzeugeAbsichtsProtokoll } = require('../src/main/database/intent-log.js');
const { erzeugeWiederanlauf } = require('../src/main/database/intent-recovery.js');
const { erzeugeSchreibSchnittstelle } = require('../src/main/database/record-auftrag.js');
const { leseBelegDatei } = require('../src/main/database/change-log.js');
const { VORGANGS_DATEI_NAME } = require('../src/main/database/vorgangs-kennung.js');
const { createAreaConfig } = require('../src/main/area/area-config.js');
const mddStore = require('../src/main/documents/mdd-store.js');
const { belegeZuDatensatz, pruefeVerkettung } = require('../src/shared/database/change-record.js');
// 4T-001826 (Nachschärfung): Leser der Tabelle, wie die Schnittstelle sie liest,
// und das gemeinsame Text-Modul des Datensatz-Blocks für den Ausgangs-Stand.
const { leseTabellenBestand } = require('../src/main/database/record-auftrag-bestand.js');
const { werteDes, zellText } = require('../src/main/database/record-auftrag-plan.js');
const { schreibeDatensaetze } = require('../src/shared/database/record-write.js');

const REPO = path.resolve(__dirname, '..');
const DEMO_ORDNER = path.join(REPO, 'src', 'demo');
const ARBEITS_ORDNER = path.join(REPO, 'Tests', '4T-001826');

const TABELLE = 'Library.md';
const BELEG_DATEI = 'Library.mddl';

// Die drei Dateien, die zurückgelegt werden; nichts sonst.
const ERZEUGNISSE = Object.freeze([TABELLE, BELEG_DATEI, VORGANGS_DATEI_NAME]);

// Die Herkunft des ausgelieferten Demo-Belegs, englisch wie der übrige
// Demo-Bereich (Entscheidung der Sitzung vom 2026-09-23).
const DEMO_BENUTZER = 'demo';
const DEMO_RECHNER = 'demo-pc';

// Die drei Aufträge in fester Reihenfolge, je ein eigener Auftrag mit eigener
// Vorgangs-Kennung (Variante B: die Tabelle trägt am Ende die neuen Werte).
// Die Zeitpunkte sind UTC und sekundengenau und liegen fachlich hinter den
// Anschaffungs-Daten der Bücher. `erwartet` trägt die gezeigten Werte des
// Datensatzes vor der Änderung.
const AUFTRAEGE = Object.freeze([
  {
    zeitpunkt: '2026-09-01T09:15:00Z',
    id: 'r-00005',
    erwartet: {
      title: 'A Wizard of Earthsea',
      author: 'Ursula K. Le Guin',
      pages: '183',
      acquired: '2020-02-08',
      onLoan: '',
    },
    werte: { onLoan: 'x' },
  },
  {
    zeitpunkt: '2026-09-08T14:30:00Z',
    id: 'r-00001',
    erwartet: {
      title: 'The Name of the Rose',
      author: 'Umberto Eco',
      pages: '640',
      acquired: '2019-03-14',
      onLoan: 'x',
    },
    werte: { onLoan: '' },
  },
  {
    zeitpunkt: '2026-09-15T11:05:00Z',
    id: 'r-00016',
    erwartet: {
      title: 'Gödel, Escher, Bach',
      author: 'Douglas Hofstadter',
      pages: '777',
      acquired: '2022-06-01',
      onLoan: '',
    },
    werte: { author: 'Douglas R. Hofstadter' },
  },
]);

function schritt(text) {
  process.stdout.write(`${text}\n`);
}

class Abbruch extends Error {}

function brichAb(text) {
  throw new Abbruch(text);
}

// --- Kopie ziehen ------------------------------------------------------------------------

// Leert den Arbeits-Ordner und kopiert den Demo-Bereich hinein. Der Ordner wird
// vorher gegen seinen festen Ort gehalten, damit ein Fehler im Pfad nie einen
// anderen Ordner leert.
function ziehKopie() {
  if (path.dirname(ARBEITS_ORDNER) !== path.join(REPO, 'Tests')) {
    brichAb(`Arbeits-Ordner liegt nicht unter Tests/: ${ARBEITS_ORDNER}`);
  }
  fs.rmSync(ARBEITS_ORDNER, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(ARBEITS_ORDNER, { recursive: true });
  kopiereBaum(DEMO_ORDNER, ARBEITS_ORDNER);
}

// 4T-001966: Rekursive Kopie Datei für Datei statt der rekursiven Baum-Kopie von
// Node (fs.cpSync mit recursive). Node 22 stürzt damit unter Windows ab oder
// verstümmelt den Ziel-Pfad, sobald er einen Umlaut enthält; so ist der Export
// von 1.142.0 in ein Repositorium unter einem Pfad mit «ö» an diesem Skript
// gescheitert. mkdirSync und copyFileSync treffen den Ziel-Pfad korrekt. Nach
// dem Vorbild von kopiereBaum in scripts/quellcode-export.js, hier eigenständig,
// weil jenes Werkzeug nicht mit exportiert wird.
function kopiereBaum(quelle, ziel) {
  if (fs.lstatSync(quelle).isDirectory()) {
    fs.mkdirSync(ziel, { recursive: true });
    for (const kind of fs.readdirSync(quelle))
      kopiereBaum(path.join(quelle, kind), path.join(ziel, kind));
  } else {
    fs.copyFileSync(quelle, ziel);
  }
}

// --- Den Ausgangs-Stand herstellen -------------------------------------------------------

/**
 * Setzt die Kopie auf den Stand vor den drei Aufträgen zurück.
 *
 * **Warum ein zweiter, nicht belegender Text-Schreibweg hier zulässig ist.** Er
 * schreibt ausschließlich in die Kopie unter `Tests/4T-001826/`, nie nach
 * `src/demo/`, und er erzeugt nichts, was zurückgelegt wird: Beleg-Datei und
 * Zähler-Datei werden aus der Kopie entfernt, und die drei Zellen bekommen genau
 * die Werte zurück, die die Aufträge danach als `erwartet` voraussetzen. Was
 * zurückwandert, entsteht weiterhin allein über die Schreib-Schnittstelle. Ein
 * Zurücksetzen über die Schnittstelle selbst schriebe dagegen Belege, die dann
 * mitgezählt würden. Geschrieben wird über `schreibeDatensaetze`, denselben
 * Text-Weg, den der Schreib-Plan der Schnittstelle nutzt, damit Zelle und
 * Maskierung genauso aussehen wie nach einem echten Auftrag.
 *
 * **Die Wache ist streng:** Jede der drei Zellen trägt entweder ihren
 * `erwartet`-Wert (Erstlauf) oder ihren `werte`-Wert (nach einem Lauf); alles
 * andere ist eine Änderung, die dieses Skript nicht kennt, und bricht ab. Nach
 * dem Zurücksetzen dürfen genau die zurückgesetzten Zeilen vom vorherigen Text
 * abweichen und keine sonst.
 */
async function stelleAusgangsStandHer() {
  for (const name of [BELEG_DATEI, VORGANGS_DATEI_NAME])
    fs.rmSync(path.join(ARBEITS_ORDNER, name), { force: true });

  const pfad = path.join(ARBEITS_ORDNER, TABELLE);
  const bestand = await leseTabellenBestand(fs.promises, pfad, TABELLE);
  if (!bestand.ok) brichAb(`Tabelle der Kopie nicht lesbar: ${JSON.stringify(bestand.lage)}`);
  if (bestand.dateien.length !== 1) brichAb('Tabelle der Kopie ist unerwartet segmentiert.');
  const datei = bestand.dateien[0];

  const operationen = [];
  for (const auftrag of AUFTRAEGE) {
    const texte = werteDes(datei.records.get(auftrag.id));
    const zellen = [];
    for (const name of Object.keys(auftrag.werte)) {
      const treffer = bestand.karte.get(name.toLowerCase());
      if (!treffer) brichAb(`Feld ${name} fehlt in der Definition.`);
      const vorgefunden = zellText(texte, treffer.index);
      if (vorgefunden === auftrag.erwartet[name]) continue;
      if (vorgefunden !== auftrag.werte[name])
        brichAb(`Zelle ${auftrag.id}/${name} trägt unbekannten Wert «${vorgefunden}».`);
      zellen[treffer.index] = auftrag.erwartet[name];
    }
    if (zellen.length > 0) operationen.push({ art: 'update', id: auftrag.id, zellen });
  }
  if (operationen.length === 0) {
    schritt('Ausgangs-Stand: Kopie trägt ihn bereits.');
    return;
  }

  const geschrieben = schreibeDatensaetze(datei.text, bestand.fields, operationen);
  if (!geschrieben.ok) brichAb(`Ausgangs-Stand nicht herstellbar: ${geschrieben.code}`);
  const vorher = datei.text.split('\n');
  const nachher = geschrieben.text.split('\n');
  const abweichend = vorher.filter((zeile, i) => zeile !== nachher[i]).length;
  if (vorher.length !== nachher.length || abweichend !== operationen.length)
    brichAb(`Ausgangs-Stand weicht in ${abweichend} statt ${operationen.length} Zeilen ab.`);
  fs.writeFileSync(pfad, geschrieben.text, 'utf8');
  schritt(`Ausgangs-Stand: ${operationen.length} Zellen der Kopie zurückgesetzt.`);
}

// --- Die produktive Zusammensetzung ------------------------------------------------------

// Dieselbe Zusammensetzung wie in `src/main/app/wiring.js`: eine
// Sperr-Verwaltung, Klammer und Wiederanlauf mit derselben Verwaltung und
// demselben Leser der Bereichs-Konfiguration, die Schnittstelle darüber, das Tor
// der Erweiterung immer an. Fest gesetzt sind allein `jetzt` und `herkunft`.
function baueSchnittstelle(uhr) {
  const areaConfig = createAreaConfig({
    getStore: () => null,
    areaOfWindow: () => null,
    markSelfWriting: () => {},
    mddStore,
  });
  const leseKonfig = (rootPath) => areaConfig.readAreaDatabaseConfig(rootPath);
  const erweiterungAktiv = () => true;
  const sperrVerwaltung = erzeugeSperrVerwaltung({ leseKonfig });
  const absichtsProtokoll = erzeugeAbsichtsProtokoll({ sperrVerwaltung, leseKonfig });
  const wiederanlauf = erzeugeWiederanlauf({
    sperrVerwaltung,
    leseKonfig,
    erweiterungAktiv,
    laeuft: (vorgang) => absichtsProtokoll.laeuft(vorgang),
  });
  return erzeugeSchreibSchnittstelle({
    sperrVerwaltung,
    absichtsProtokoll,
    wiederanlauf,
    erweiterungAktiv,
    jetzt: () => {
      if (typeof uhr.zeitpunkt !== 'string') brichAb('Zeitpunkt ohne laufenden Auftrag erfragt.');
      return uhr.zeitpunkt;
    },
    herkunft: () => ({ benutzer: DEMO_BENUTZER, rechner: DEMO_RECHNER }),
  });
}

// --- Die drei Aufträge -------------------------------------------------------------------

async function fahreAuftraege() {
  const uhr = { zeitpunkt: null };
  const schnittstelle = baueSchnittstelle(uhr);
  for (const [index, auftrag] of AUFTRAEGE.entries()) {
    uhr.zeitpunkt = auftrag.zeitpunkt;
    const ergebnis = await schnittstelle.fuehreAuftragAus(ARBEITS_ORDNER, {
      anweisungen: [
        {
          tabelle: TABELLE,
          art: 'update',
          id: auftrag.id,
          erwartet: auftrag.erwartet,
          werte: auftrag.werte,
        },
      ],
    });
    uhr.zeitpunkt = null;
    const nummer = index + 1;
    if (!ergebnis || ergebnis.ok !== true)
      brichAb(`Auftrag ${nummer} (${auftrag.id}) nicht ok: ${JSON.stringify(ergebnis)}`);
    if (ergebnis.vorgang !== nummer)
      brichAb(`Auftrag ${nummer} (${auftrag.id}): Vorgang ${ergebnis.vorgang} statt ${nummer}.`);
    const einzel = Array.isArray(ergebnis.ergebnisse) ? ergebnis.ergebnisse : [];
    if (einzel.length !== 1 || einzel[0].beleg !== true)
      brichAb(`Auftrag ${nummer} (${auftrag.id}): kein Beleg geschrieben.`);
    schritt(`Auftrag ${nummer}: ${auftrag.id}, Vorgang ${ergebnis.vorgang}, Beleg geschrieben.`);
  }
}

// Die Verkettung je geändertem Datensatz, gelesen über denselben Weg wie jeder
// andere Leser der Beleg-Datei.
async function pruefeBelege() {
  const gelesen = await leseBelegDatei(path.join(ARBEITS_ORDNER, TABELLE));
  if (!gelesen.ok) brichAb(`Beleg-Datei nicht lesbar: ${gelesen.code}`);
  if (gelesen.befunde.length > 0)
    brichAb(`Beleg-Datei trägt Befunde: ${JSON.stringify(gelesen.befunde)}`);
  if (gelesen.belege.length !== AUFTRAEGE.length)
    brichAb(`Beleg-Datei trägt ${gelesen.belege.length} statt ${AUFTRAEGE.length} Belege.`);
  for (const auftrag of AUFTRAEGE) {
    const belege = belegeZuDatensatz(gelesen.belege, auftrag.id);
    const verkettung = pruefeVerkettung(belege);
    if (belege.length !== 1 || !verkettung.lueckenlos)
      brichAb(`Verkettung von ${auftrag.id} nicht lückenlos: ${JSON.stringify(verkettung)}`);
  }
  schritt(`Verkettung: ${AUFTRAEGE.length} Datensätze lückenlos.`);
}

// --- Hinterlassenschaften ----------------------------------------------------------------

// Relative Pfade aller Einträge eines Ordners, Ordner mit Schrägstrich am Ende.
function eintraege(wurzel) {
  const liste = [];
  const lauf = (ordner, praefix) => {
    for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
      const rel = praefix + eintrag.name;
      if (eintrag.isDirectory()) {
        liste.push(`${rel}/`);
        lauf(path.join(ordner, eintrag.name), `${rel}/`);
      } else liste.push(rel);
    }
  };
  lauf(wurzel, '');
  return liste;
}

// Die Kopie darf außer den Erzeugnissen nichts tragen, was `src/demo/` fehlt,
// und keine übrige Datei darf sich geändert haben. Ein leerer Ordner, den
// `src/demo/` nicht kennt, ist der zurückgelassene Sperr-Ordner und wird
// genannt, aber nicht zurückgelegt.
function pruefeHinterlassenschaften() {
  const quelle = new Set(eintraege(DEMO_ORDNER));
  const abweichungen = [];
  const leereOrdner = [];
  for (const rel of eintraege(ARBEITS_ORDNER)) {
    if (ERZEUGNISSE.includes(rel)) continue;
    const voll = path.join(ARBEITS_ORDNER, rel);
    if (!quelle.has(rel)) {
      if (rel.endsWith('/') && fs.readdirSync(voll).length === 0) leereOrdner.push(rel);
      else if (!rel.endsWith('/')) abweichungen.push(`neu: ${rel}`);
      continue;
    }
    if (rel.endsWith('/')) continue;
    if (!fs.readFileSync(voll).equals(fs.readFileSync(path.join(DEMO_ORDNER, rel))))
      abweichungen.push(`geändert: ${rel}`);
  }
  if (abweichungen.length > 0)
    brichAb(`Kopie trägt Hinterlassenschaften: ${abweichungen.join(', ')}`);
  schritt(
    leereOrdner.length > 0
      ? `Hinterlassenschaften: keine; leerer Ordner nicht zurückgelegt: ${leereOrdner.join(', ')}.`
      : 'Hinterlassenschaften: keine.',
  );
}

// --- Zurücklegen oder vergleichen --------------------------------------------------------

function legeZurueck() {
  for (const name of ERZEUGNISSE) {
    fs.writeFileSync(
      path.join(DEMO_ORDNER, name),
      fs.readFileSync(path.join(ARBEITS_ORDNER, name)),
    );
  }
  schritt(`Zurückgelegt nach src/demo/: ${ERZEUGNISSE.join(', ')}.`);
}

function vergleiche() {
  const abweichend = [];
  for (const name of ERZEUGNISSE) {
    const ziel = path.join(DEMO_ORDNER, name);
    if (!fs.existsSync(ziel)) {
      abweichend.push(`${name} fehlt in src/demo/`);
      continue;
    }
    if (!fs.readFileSync(ziel).equals(fs.readFileSync(path.join(ARBEITS_ORDNER, name))))
      abweichend.push(`${name} weicht ab`);
  }
  if (abweichend.length > 0) brichAb(`Vergleich mit src/demo/: ${abweichend.join(', ')}`);
  schritt(`Vergleich mit src/demo/: ${ERZEUGNISSE.join(', ')} byte-gleich.`);
}

// --- Einstieg ----------------------------------------------------------------------------

async function haupt() {
  const argumente = process.argv.slice(2);
  const unbekannt = argumente.filter((a) => a !== '--pruefen');
  if (unbekannt.length > 0) brichAb(`Unbekannte Angabe: ${unbekannt.join(' ')}`);
  const pruefen = argumente.includes('--pruefen');

  ziehKopie();
  schritt(`Kopie gezogen: src/demo/ nach ${path.relative(REPO, ARBEITS_ORDNER)}/.`);
  await stelleAusgangsStandHer();
  await fahreAuftraege();
  await pruefeBelege();
  pruefeHinterlassenschaften();
  if (pruefen) vergleiche();
  else legeZurueck();
}

// 4T-001966: Die Kopier-Funktion wird für ihren Regressions-Prüffall
// exportiert; gefahren wird das Skript nur beim direkten Aufruf.
module.exports = { kopiereBaum };

if (require.main === module) {
  haupt().then(
    () => {
      process.exitCode = 0;
    },
    (err) => {
      const text =
        err instanceof Abbruch ? err.message : err && err.stack ? err.stack : String(err);
      process.stderr.write(`FEHLER: ${text}\n`);
      process.exitCode = 1;
    },
  );
}
