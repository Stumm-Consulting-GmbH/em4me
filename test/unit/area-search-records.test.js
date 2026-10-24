// 4T-002331 (Epic 3E-000264): Die Datensätze der Datenbank-Tabellen als eigene
// Treffer-Art der Bereichs-Suche.
//
// Setup-Muster aus `record-table-read.test.js` (Temp-Wurzeln, Index-Warteschleife,
// Aufräumen mit Wiederholung, geteilte Tabellen über den Teiler des Speicherns)
// und `area-search.test.js` (Vorrat freigeben, Puffer-Overlay zurücksetzen). Die
// Erwartungswerte sind am Prüfstand von Hand nachgerechnet.
//
// **Zwei Modul-Instanzen.** Vitest führt für `import` und `require` getrennte
// Instanzen desselben Moduls (Begründung in `area-search.test.js`). Die statischen
// Importe stellen die Module in die Import-Kette, über die die Auswahl des
// Prüf-Ausschnitts diese Datei findet; wo ein Fall Zustand vergleicht (Vorrat am
// Objekt des Tabellen-Lesers, Zwischenspeicher, Overlay, Schalter), nimmt er die
// Instanzen über `require`, die auch die Module unter Prüfung benutzen.
//
// Der Messlauf läuft nur auf Zuruf:
// `EM4ME_MESSLAUF=1 npx vitest run test/unit/area-search-records.test.js`.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PROZESS_ZEITLIMIT } from '../zeitlimits.js';
import { backlinksFor, releaseRoot, rootForActiveFile } from '../../src/main/backlinks.js';
import { sucheImBereich, gibBereichsVorratFrei } from '../../src/main/area/area-search.js';
import {
  datensatzTreffer,
  DATENSATZ_GRUPPEN_SUFFIX,
} from '../../src/main/area/area-search-records.js';

const require_ = createRequire(import.meta.url);
const { setBufferOverlay, clearAllBufferOverlays } = require_('../../src/main/index/overlay.js');
const { vergissAlleDefinitionen } = require_('../../src/main/index/datensatz-erfassung.js');
const { setzeDatensatzErfassung } = require_('../../src/main/index/index-schalter.js');
const { readRecordTable, readCount, clearCaches } = require_(
  '../../src/main/index/record-table-read.js',
);
const datensaetze = require_('../../src/main/area/area-search-records.js');
const { planeZerlegung } = require_('../../src/shared/document-split.js');
const { assembleParts } = require_('../../src/shared/document-assembly.js');

// --- Fixtures ---------------------------------------------------------------

const FELDER = ['name', 'email', 'ort'];

function tabelle(felder, zeilen, prosa = 'Die Tabelle der Personen.') {
  return [
    '---',
    'db-table:',
    '  fields:',
    ...felder.map((f) => `    - name: ${f}`),
    '  display: name',
    '---',
    '',
    prosa,
    '',
    '```perspective-records',
    ...zeilen,
    '```',
    '',
  ].join('\n');
}

function datensatz(nummer, zellen) {
  return [`|- id="r-${String(nummer).padStart(5, '0')}"`, ...zellen.map((z) => `| ${z}`)];
}

const PERSONEN = tabelle(FELDER, [
  ...datensatz(1, ['Anna Alt', 'anna@example.org', 'Basel']),
  ...datensatz(2, ['Bernd Beispiel', 'bernd@firma.de', 'Liestal']),
  ...datensatz(3, ['Clara Chor', 'clara@verein.ch', 'Olten']),
]);

// Eine Tabelle, die über die Schwelle des Teilers wächst.
function viele(anzahl) {
  const zeilen = [];
  for (let i = 1; i <= anzahl; i++) {
    zeilen.push(
      ...datensatz(i, [`Person ${i} ${'x'.repeat(40)}`, `person${i}@example.org`, `ort-${i}`]),
    );
  }
  return tabelle(FELDER, zeilen);
}

// --- Setup/Teardown ---------------------------------------------------------

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-asr-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile) {
  let result = backlinksFor(activeFile);
  openRoots.add(rootForActiveFile(activeFile));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile);
  }
  expect(result.status).toBe('ready');
  return rootForActiveFile(activeFile);
}

// Eine geteilte Tabelle über den Teiler des Speicherns, mit kleiner Schwelle.
function writeSplit(root, text, name, schwelle = 1500) {
  const plan = planeZerlegung({ text, base: name, schwelle, segmentFelder: FELDER });
  expect(plan.geteilt).toBe(true);
  for (const teil of plan.teile) write(root, `${teil.basename}.md`, teil.text);
  return plan.teile;
}

let generation = 0;
function suche(wurzel, muster, flags = 'gm') {
  generation += 1;
  return sucheImBereich(wurzel, { muster, flags, generation });
}

afterEach(() => {
  vi.restoreAllMocks();
  setzeDatensatzErfassung(true);
  clearAllBufferOverlays();
  gibBereichsVorratFrei();
  datensaetze.gibDatensatzVorratFrei();
  vergissAlleDefinitionen();
  clearCaches();
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* Windows hält die Datei manchmal noch */
    }
  }
  tmpDirs = [];
});

// --- AK1: der Datensatz-Treffer ------------------------------------------------

describe('Datensatz-Treffer der Bereichs-Suche (4T-002331, AK1)', () => {
  it(
    'AK1: ein Teil der E-Mail liefert genau einen Treffer mit Anzeige-Form, Tabelle, Feld und Fundlage',
    async () => {
      const root = makeRoot();
      const kopf = write(root, 'Personen.md', PERSONEN);
      const wurzel = await indexFor(kopf);
      const res = await suche(wurzel, 'firma');
      expect(res.treffer).toHaveLength(1);
      const t = res.treffer[0];
      expect(t.quelle).toBe('record');
      expect(t.anzeige).toBe('Bernd Beispiel');
      expect(t.feld).toBe('email');
      // Eigene Gruppen-Kennung: der Pfad der Kopf-Datei mit dem Suffix der Datensätze.
      expect(t.gruppe).toBe('Personen.md#datensaetze');
      expect(t.gruppe.endsWith(DATENSATZ_GRUPPEN_SUFFIX)).toBe(true);
      expect(t.gruppeTitel).toBe('Personen');
      expect(t.sprung.kennung).toBe('r-00002');
      expect(t.sprung.tabelle).toBe(kopf);
      // 'bernd@' sind sechs Zeichen, der Fund beginnt also an Stelle 6 des Feld-Texts.
      expect(t.sprung.offset).toBe(6);
      expect(t.sprung.spalte).toBe(6);
      expect(t.sprung.zeile).toBe(0);
      expect(t.ausschnitt.slice(t.von, t.bis)).toBe('firma');
      expect(res.gruppen).toEqual([
        { gruppe: 'Personen.md#datensaetze', titel: 'Personen', anzahl: 1 },
      ]);
    },
    PROZESS_ZEITLIMIT,
  );
});

// --- AK2: Reihenfolge und Deckel ---------------------------------------------

describe('Reihenfolge der Gruppen und gemeinsame Deckel (4T-002331, AK2)', () => {
  it(
    'AK2: Dokument-Gruppen stehen vor Datensatz-Gruppen, die Gesamtzahl zählt beide',
    async () => {
      const root = makeRoot();
      // Die Prosa der Tabelle trifft ebenfalls: Dieselbe Datei ergibt zwei Gruppen.
      const kopf = write(
        root,
        'Personen.md',
        PERSONEN.replace('Die Tabelle der Personen.', 'Personen aus Liestal und Umgebung.'),
      );
      // Alphabetisch hinter der Tabelle: Die Reihenfolge kommt aus der Treffer-Art.
      write(root, 'Zettel.md', 'Notiz zu Liestal und Olten');
      const wurzel = await indexFor(kopf);
      const res = await suche(wurzel, 'Liestal');
      expect(res.gruppen.map((g) => g.gruppe)).toEqual([
        'Personen.md',
        'Zettel.md',
        'Personen.md#datensaetze',
      ]);
      expect(res.treffer.map((t) => t.quelle)).toEqual(['area', 'area', 'record']);
      expect(res.treffer).toHaveLength(3);
    },
    PROZESS_ZEITLIMIT,
  );

  it(
    'AK2: 250 treffende Datensätze ergeben 200 Treffer der Gruppe und abgeschnitten',
    async () => {
      const root = makeRoot();
      const zeilen = [];
      for (let i = 1; i <= 250; i++) zeilen.push(...datensatz(i, [`Treffer ${i}`, '', '']));
      const kopf = write(root, 'Viele.md', tabelle(FELDER, zeilen, 'Ohne Fundstelle.'));
      const wurzel = await indexFor(kopf);
      const res = await suche(wurzel, 'Treffer');
      expect(res.gruppen).toEqual([
        { gruppe: 'Viele.md#datensaetze', titel: 'Viele', anzahl: 200 },
      ]);
      expect(res.treffer).toHaveLength(200);
      expect(res.abgeschnitten).toBe(true);
    },
    PROZESS_ZEITLIMIT,
  );
});

// --- AK3: Folge-Dateien und ungespeicherter Stand ------------------------------

describe('Folge-Dateien und ungespeicherter Stand (4T-002331, AK3)', () => {
  it(
    'AK3: ein Datensatz aus einer Folge-Datei wird gefunden, unter der Kopf-Datei',
    async () => {
      const root = makeRoot();
      const teile = writeSplit(root, viele(40), 'Personen');
      expect(teile.length).toBeGreaterThanOrEqual(3);
      const letzter = teile[teile.length - 1].text;
      // Zusicherung im Aufbau: Der gesuchte Datensatz liegt in der letzten Folge-Datei.
      expect(letzter).toContain('| person38@example.org');
      expect(teile[0].text).not.toContain('person38@');
      const kopf = path.join(root, 'Personen.md');
      const wurzel = await indexFor(kopf);
      const res = await suche(wurzel, 'person38@');
      expect(res.treffer).toHaveLength(1);
      expect(res.treffer[0]).toMatchObject({
        quelle: 'record',
        gruppe: 'Personen.md#datensaetze',
      });
      expect(res.treffer[0].sprung).toMatchObject({ kennung: 'r-00038', tabelle: kopf });
    },
    PROZESS_ZEITLIMIT,
  );

  it(
    'AK3: der Puffer-Stand der Kopf-Datei trifft, der Platten-Stand nicht mehr',
    async () => {
      const root = makeRoot();
      const teile = writeSplit(root, viele(40), 'Personen');
      const kopf = path.join(root, 'Personen.md');
      const wurzel = await indexFor(kopf);
      expect((await suche(wurzel, 'ort-38$')).treffer).toHaveLength(1);
      // Der Editor hält das zusammengesetzte Dokument unter dem Pfad der Kopf-Datei.
      const dokument = assembleParts(teile.map((t) => ({ index: t.index, content: t.text }))).text;
      setBufferOverlay(kopf, dokument.replace('| ort-38\n', '| Neustadt-38\n'));
      const neu = await suche(wurzel, 'Neustadt');
      expect(neu.treffer).toHaveLength(1);
      expect(neu.treffer[0]).toMatchObject({ quelle: 'record', anzeige: expect.any(String) });
      expect(neu.treffer[0].sprung.kennung).toBe('r-00038');
      expect((await suche(wurzel, 'ort-38$')).treffer).toHaveLength(0);
    },
    PROZESS_ZEITLIMIT,
  );
});

// --- AK4: Prosa bleibt Dokument-Treffer ------------------------------------------

describe('Prosa und Datensatz-Zeilen eines Tabellen-Dokuments (4T-002331, AK4)', () => {
  it(
    'AK4: die Prosa trifft als Dokument, ein Wort nur im Datensatz allein als Datensatz',
    async () => {
      const root = makeRoot();
      const kopf = write(
        root,
        'Personen.md',
        tabelle(FELDER, datensatz(1, ['Dora Datensatzwort', '', '']), 'Hier steht Prosawort.'),
      );
      const wurzel = await indexFor(kopf);
      const prosa = await suche(wurzel, 'Prosawort');
      expect(prosa.treffer.map((t) => t.quelle)).toEqual(['area']);
      const zeile = await suche(wurzel, 'Datensatzwort');
      expect(zeile.treffer.map((t) => t.quelle)).toEqual(['record']);
      expect(zeile.gruppen).toHaveLength(1);
    },
    PROZESS_ZEITLIMIT,
  );
});

// --- AK5: Vorrat, Entwertung, Abbruch, Deckel ---------------------------------------

describe('Vorrat am Objekt des Tabellen-Lesers (4T-002331, AK5)', () => {
  it(
    'AK5: zwei Läufe nutzen denselben Vorrat; nach einer Änderung der Datei entsteht ein neuer',
    async () => {
      const root = makeRoot();
      const kopf = write(root, 'Personen.md', PERSONEN);
      const wurzel = await indexFor(kopf);
      const { datensatzTreffer: treffer, _nurFuerTests: probe } = datensaetze;
      expect(treffer(wurzel, 'Basel', 'gm').treffer).toHaveLength(1);
      const leser = readRecordTable(wurzel, kopf);
      expect(probe.hatVorrat(leser)).toBe(true);
      const aufbauten = probe.aufbauten();
      expect(treffer(wurzel, 'Olten', 'gm').treffer).toHaveLength(1);
      expect(readRecordTable(wurzel, kopf)).toBe(leser);
      expect(probe.aufbauten()).toBe(aufbauten);

      // Größe ändert sich mit, damit der Abgleich unabhängig von der
      // Zeitstempel-Auflösung des Dateisystems greift.
      fs.writeFileSync(kopf, PERSONEN.replace('| Olten', '| Oltingen am See'), 'utf8');
      await indexFor(kopf);
      expect(treffer(wurzel, 'Oltingen', 'gm').treffer).toHaveLength(1);
      const neuerLeser = readRecordTable(wurzel, kopf);
      expect(neuerLeser).not.toBe(leser);
      expect(probe.hatVorrat(neuerLeser)).toBe(true);
      expect(probe.aufbauten()).toBe(aufbauten + 1);
    },
    PROZESS_ZEITLIMIT,
  );

  it(
    'AK5: ein überholter Lauf liefert null',
    async () => {
      const root = makeRoot();
      const kopf = write(root, 'Personen.md', PERSONEN);
      const wurzel = await indexFor(kopf);
      let aufrufe = 0;
      const istUeberholt = () => {
        aufrufe += 1;
        return aufrufe >= 2;
      };
      expect(datensaetze.datensatzTreffer(wurzel, 'Basel', 'gm', { istUeberholt })).toBeNull();
    },
    PROZESS_ZEITLIMIT,
  );

  it(
    'AK5: oberhalb des Deckels wird gesucht, aber kein Vorrat gehalten',
    async () => {
      const root = makeRoot();
      const kopf = write(root, 'Personen.md', PERSONEN);
      const wurzel = await indexFor(kopf);
      const res = datensaetze.datensatzTreffer(wurzel, 'Basel', 'gm', { deckelBytes: 1 });
      expect(res.treffer).toHaveLength(1);
      expect(res.bytes).toBeGreaterThan(1);
      expect(datensaetze._nurFuerTests.hatVorrat(readRecordTable(wurzel, kopf))).toBe(false);
    },
    PROZESS_ZEITLIMIT,
  );

  it(
    'AK5: der Umfang des Vorrats reist als datensatzBytes in der Antwort mit',
    async () => {
      const root = makeRoot();
      const kopf = write(root, 'Personen.md', PERSONEN);
      const wurzel = await indexFor(kopf);
      const res = await suche(wurzel, 'Basel');
      // Neun nicht-leere Feld-Texte, zwei Byte je Zeichen.
      const zeichen = [
        'Anna Alt',
        'anna@example.org',
        'Basel',
        'Bernd Beispiel',
        'bernd@firma.de',
        'Liestal',
        'Clara Chor',
        'clara@verein.ch',
        'Olten',
      ].join('').length;
      expect(res.datensatzBytes).toBe(zeichen * 2);
    },
    PROZESS_ZEITLIMIT,
  );
});

// --- AK7: Aus-Zustand ---------------------------------------------------------

describe('Aus-Zustand der Datenbank (4T-002331, AK7)', () => {
  it(
    'AK7: ohne Datensatz-Erfassung keine Datensatz-Treffer, keine Gruppen, kein Vorrat',
    async () => {
      const root = makeRoot();
      const kopf = write(root, 'Personen.md', PERSONEN);
      const wurzel = await indexFor(kopf);
      setzeDatensatzErfassung(false);
      const aus = await suche(wurzel, 'Basel');
      expect(aus.treffer).toEqual([]);
      expect(aus.gruppen).toEqual([]);
      expect(aus.datensatzBytes).toBe(0);
      expect(datensatzTreffer(wurzel, 'Basel', 'gm')).toEqual({
        treffer: [],
        gruppen: [],
        abgeschnitten: false,
        bytes: 0,
      });
      setzeDatensatzErfassung(true);
      expect((await suche(wurzel, 'Basel')).treffer.map((t) => t.quelle)).toEqual(['record']);
    },
    PROZESS_ZEITLIMIT,
  );
});

// --- AK6: Messlauf auf Zuruf --------------------------------------------------

// Ein fester Zufall, damit jeder Lauf dieselben Texte misst.
function zufall(saat) {
  let s = saat;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const SILBEN = ['ka', 'lo', 'mer', 'tin', 'sa', 'ber', 'gu', 'ro', 'fel', 'an', 'dri', 'mos'];

function grosseTabelle(anzahl) {
  const z = zufall(4711);
  const wort = (n) => {
    let w = '';
    for (let i = 0; i < n; i++) w += SILBEN[Math.floor(z() * SILBEN.length)];
    return w;
  };
  const zeilen = [];
  for (let i = 1; i <= anzahl; i++) {
    zeilen.push(
      ...datensatz(i, [
        `${wort(2)} ${wort(3)}`,
        `${wort(2)}.${wort(2)}@${wort(2)}.example`,
        wort(3),
        `+41 ${Math.floor(z() * 1e9)}`,
        `${wort(3)} ${wort(2)} ${wort(4)} ${wort(2)}`,
      ]),
    );
  }
  return tabelle(['name', 'email', 'ort', 'telefon', 'notiz'], zeilen, 'Messbestand.');
}

function median(werte) {
  return [...werte].sort((a, b) => a - b)[Math.floor(werte.length / 2)];
}

describe.skipIf(!process.env.EM4ME_MESSLAUF)('Messlauf Datensatz-Suche (4T-002331, AK6)', () => {
  it(
    'AK6: misst Aufbau und Suchlauf aus dem Vorrat an 10 000 Datensätzen in Folge-Dateien',
    async () => {
      const root = makeRoot();
      const text = grosseTabelle(10000);
      const plan = planeZerlegung({
        text,
        base: 'Gross',
        schwelle: Math.ceil(Buffer.byteLength(text) / 3),
        segmentFelder: ['name', 'email', 'ort', 'telefon', 'notiz'],
      });
      expect(plan.geteilt).toBe(true);
      for (const teil of plan.teile) write(root, `${teil.basename}.md`, teil.text);
      const kopf = path.join(root, 'Gross.md');
      const wurzel = await indexFor(kopf);
      const { datensatzTreffer: treffer, _nurFuerTests: probe } = datensaetze;
      // Ein Muster ohne Fundstelle: Der Lauf geht über jeden Feld-Text.
      const muster = 'Suchmarke-ohne-Fund';
      treffer(wurzel, muster, 'gmi'); // Aufwärm-Lauf

      const aufbau = [];
      const vorrat = [];
      let bytes = 0;
      for (let lauf = 0; lauf < 3; lauf++) {
        clearCaches();
        let start = performance.now();
        const erster = treffer(wurzel, muster, 'gmi');
        aufbau.push(performance.now() - start);
        // Zusicherung im Messweg: Der erste Lauf hat die Tabelle wirklich gelesen.
        expect(readCount()).toBe(1);
        bytes = erster.bytes;
        const aufbauten = probe.aufbauten();
        start = performance.now();
        const zweiter = treffer(wurzel, muster, 'gmi');
        vorrat.push(performance.now() - start);
        expect(zweiter.treffer).toHaveLength(0);
        expect(probe.aufbauten()).toBe(aufbauten);
      }
      expect(readRecordTable(wurzel, kopf).records).toHaveLength(10000);
      const zeilen = [
        `10 000 Datensätze in ${plan.teile.length} Dateien (Kopf-Datei und ` +
          `${plan.teile.length - 1} Folge-Dateien), Vorrat ${(bytes / 1048576).toFixed(1)} MB`,
        `Aufbau einschließlich Lesen: Median ${median(aufbau).toFixed(1)} ms ` +
          `(Läufe ${aufbau.map((t) => t.toFixed(1)).join(', ')} ms)`,
        `Suchlauf aus dem Vorrat: Median ${median(vorrat).toFixed(1)} ms ` +
          `(Läufe ${vorrat.map((t) => t.toFixed(1)).join(', ')} ms)`,
      ];
      // Die Zeilen sind das Ergebnis des Messlaufs; er läuft nur auf Zuruf und nie
      // unter dem Gate, deshalb ist die sonst gesperrte Ausgabe hier zulässig.
      // eslint-disable-next-line no-console
      console.log(`Messlauf Datensatz-Suche:\n${zeilen.join('\n')}`);
      expect(median(aufbau)).toBeLessThan(2000);
      expect(median(vorrat)).toBeLessThan(100);
    },
    PROZESS_ZEITLIMIT,
  );
});
