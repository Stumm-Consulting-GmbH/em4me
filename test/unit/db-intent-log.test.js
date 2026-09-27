// 4T-001823 (Epic 3E-000254): Die Klammer des Absichts-Protokolls — die fünf
// Schritte, das Durchschreiben vor der Marke, der Inhalt des Protokolls und die
// beiden Ränder eines Abbruchs unmittelbar vor und unmittelbar nach der Marke.
//
// **Gearbeitet wird am echten Dateisystem in temporären Ordnern**, mit der
// ECHTEN Sperr-Verwaltung, der echten Schreib-Schnittstelle und dem echten
// gemeinsamen Schreibweg. Die Nähte der Klammer werden nicht ersetzt, sondern
// **umhüllt**: Jede ruft den echten Weg und zeichnet dabei auf, wann sie
// gerufen wurde. Nur so lässt sich die Reihenfolge der fünf Schritte am realen
// Ablauf beobachten, statt an einer Attrappe, die sie selbst festlegt.
//
// **Abbrüche entstehen über eingereichte Nähte** und nicht über Kindprozesse:
// Eine Naht wirft beim Anlegen des Protokolls (unmittelbar vor der Marke) oder
// beim ersten Umbenennen (unmittelbar nach ihr). Der Abbruch gegen echte Dateien
// auf der Netz-Freigabe gehört zum Messprogramm unter `Tests/4T-001823/`.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ABSICHT_PRAEFIX,
  ABSICHT_SCHEMA_VERSION,
  erzeugeAbsichtsProtokoll,
  protokollName,
} from '../../src/main/database/intent-log.js';
import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
// 4T-001824 (Epic 3E-000254): der Wiederanlauf, Pflicht-Naht der Schnittstelle.
import { erzeugeWiederanlauf } from '../../src/main/database/intent-recovery.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import {
  ART_CHANGE_LOG,
  ART_DATENSATZ,
  legeSperreAn,
  loeseGegenstand,
  sperrDateiName,
} from '../../src/main/database/lock-store.js';
import { ordneSperrGegenstaende } from '../../src/shared/database/lock-order.js';
import { belegPfadFuer, belegeDesDatensatzes } from '../../src/main/database/change-log.js';
import {
  _drosselLeeren,
  RESTE_MINDESTALTER_MS,
  benenneUmMitWiederholung,
  durchschreibeDatei,
  istAbsichtsSchattenkopie,
  istSchattenkopie,
  loeseSchattenkopie,
  raeumeSchattenkopien,
} from '../../src/main/documents/atomic-write.js';
import { DEFAULT_LOCK_FOLDER_NAME } from '../../src/shared/database/lock-folder-name.js';

// --- Bestands-Lesungen im Modulkopf (test/README) --------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

function quelltext(rel) {
  return fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
}

const KLAMMER_QUELLE = quelltext('src/main/database/intent-log.js');
const SCHNITTSTELLE_QUELLE = quelltext('src/main/database/record-auftrag.js');
const VERDRAHTUNG = quelltext('src/main/app/wiring.js');

// Zeilen-Nummern der Treffer eines Musters, ohne die Vorkommen in Kommentaren
// (übernommen aus db-sperren-belege-aus-zustand.test.js).
function trefferAusserhalbKommentaren(text, muster) {
  const zeilen = [];
  for (const m of text.matchAll(muster)) {
    const zeilenAnfang = text.lastIndexOf('\n', m.index) + 1;
    if (/(^|\s)(\/\/|\*)/.test(text.slice(zeilenAnfang, m.index))) continue;
    zeilen.push(text.slice(0, m.index).split('\n').length);
  }
  return zeilen;
}

// Der Quelltext einer Funktion, vom Kopf bis zum Kopf der nächsten genannten.
function abschnitt(text, von, bis) {
  const anfang = text.indexOf(von);
  const ende = text.indexOf(bis, anfang + von.length);
  expect(anfang, von).toBeGreaterThanOrEqual(0);
  expect(ende, bis).toBeGreaterThan(anfang);
  return text.slice(anfang, ende);
}

// --- Aufbau ------------------------------------------------------------------------------

let tmpDirs = [];
let verwaltungen = [];

afterEach(async () => {
  // Nach einem Abbruch hinter der Marke hält die Verwaltung ihre Sperren
  // bewusst weiter; der Prüffall gibt sie hier zurück, bevor der Ordner fällt.
  for (const v of verwaltungen) await v.gibAllesFrei();
  verwaltungen = [];
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Letzter Ausweg: Temp-Rest bleibt im OS-Temp liegen; unkritisch.
    }
  }
  tmpDirs = [];
});

function bereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-absicht-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

function tabelle(records, lastId) {
  const zeilen = [
    '---',
    'db-table:',
    '  fields:',
    '    - name: Name',
    '    - name: Ort',
    `  lastId: ${lastId}`,
    '---',
    '',
    '```perspective-records',
  ];
  for (const record of records)
    zeilen.push(`|- id="${record.id}"`, `| ${record.name}`, `| ${record.ort}`);
  zeilen.push('```', '');
  return zeilen.join('\n');
}

const ANNA = { id: 'r-00001', name: 'Anna', ort: 'Basel' };
const BERT = { id: 'r-00002', name: 'Bert', ort: 'Bern' };

function lege(wurzel, relativ, inhalt) {
  const ziel = path.join(wurzel, relativ);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, inhalt, 'utf8');
  return ziel;
}

function lies(pfad) {
  return fs.readFileSync(pfad, 'utf8');
}

function aendere(tabelleRel, record, ort) {
  return {
    tabelle: tabelleRel,
    art: 'update',
    id: record.id,
    erwartet: { Name: record.name, Ort: record.ort },
    werte: { Ort: ort },
  };
}

const ZEITPUNKT = '2026-09-23T08:00:00Z';
const HERKUNFT = { benutzer: 'anna', rechner: 'SC-026' };
const KONFIG = { leseKonfig: async () => undefined };

function sperrOrdner(wurzel) {
  return path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME);
}

function imSperrOrdner(wurzel) {
  try {
    return fs.readdirSync(sperrOrdner(wurzel)).sort();
  } catch {
    return [];
  }
}

function protokolleIn(wurzel) {
  return imSperrOrdner(wurzel).filter((name) => name.startsWith(ABSICHT_PRAEFIX));
}

function istProtokoll(pfad) {
  return path.basename(pfad).startsWith(ABSICHT_PRAEFIX);
}

// Alle Schattenkopien unterhalb eines Ordners, gewöhnliche wie die eines
// Auftrags (4T-001823, Nachschärfung).
function schattenkopienIn(ordner) {
  const gefunden = [];
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...schattenkopienIn(voll));
    else if (istSchattenkopie(eintrag.name) || istAbsichtsSchattenkopie(eintrag.name))
      gefunden.push(voll);
  }
  return gefunden;
}

function stoerung(code) {
  const fehler = new Error(`gestellter Abbruch (${code})`);
  fehler.code = code;
  return fehler;
}

/**
 * Baut Schnittstelle und Klammer mit umhüllten Nähten.
 *
 * @param {object} [optionen]
 * @param {'protokoll'|'umbenennen'} [optionen.wirf] Wo ein Abbruch gestellt wird.
 * @param {(pfad: string) => void} [optionen.beimDurchschreiben] Läuft vor dem
 *   ersten Durchschreiben einer Schattenkopie.
 * @param {Function} [optionen.lstat] 4T-001924: ersetzt die Existenz-Frage der
 *   Klammer für eine anzulegende Datei.
 */
function aufbau(optionen = {}) {
  const verwaltung = erzeugeSperrVerwaltung(KONFIG);
  verwaltungen.push(verwaltung);
  const ereignisse = [];
  const durchgeschrieben = [];
  const beobachtet = { ereignisse, durchgeschrieben, beiMarke: null, verwaltung };

  // Dieselbe Verwaltung, nur beobachtet: ein Register, eine Wahrheit.
  const beobachteteVerwaltung = {
    nimmGeordnet: async (wurzel, gegenstaende) => {
      const ergebnis = await verwaltung.nimmGeordnet(wurzel, gegenstaende);
      ereignisse.push('sperren');
      return ergebnis;
    },
    // 4T-001823 (Nachschärfung): Die Klammer gibt über den Rückweg der
    // Verwaltung zurück, in einem Aufruf für alle Sperren des Auftrags.
    gibZurueck: async (wurzel, genommen) => {
      ereignisse.push('freigeben');
      return verwaltung.gibZurueck(wurzel, genommen);
    },
  };
  const fsp = {
    ...fs.promises,
    writeFile: async (pfad, ...rest) => {
      if (optionen.wirf === 'protokoll' && istProtokoll(pfad)) throw stoerung('EIO');
      await fs.promises.writeFile(pfad, ...rest);
      if (istProtokoll(pfad)) ereignisse.push('protokoll-angelegt');
    },
    appendFile: async (...argumente) => {
      await fs.promises.appendFile(...argumente);
      ereignisse.push('beleg');
    },
    unlink: async (pfad) => {
      await fs.promises.unlink(pfad);
      ereignisse.push(istProtokoll(pfad) ? 'protokoll-weg' : 'schatten-weg');
    },
    ...(optionen.lstat ? { lstat: optionen.lstat } : {}),
  };
  let erstesMal = true;
  const durchschreiben = async (pfad) => {
    if (erstesMal && optionen.beimDurchschreiben) optionen.beimDurchschreiben(pfad);
    erstesMal = false;
    await durchschreibeDatei(pfad);
    durchgeschrieben.push(pfad);
    ereignisse.push(
      istProtokoll(pfad) ? 'protokoll-durchgeschrieben' : 'schatten-durchgeschrieben',
    );
  };
  const benenneUm = async (von, nach, opts) => {
    if (beobachtet.beiMarke === null) {
      // Der Augenblick unmittelbar nach der Marke: Was liegt vor, was ist
      // durchgeschrieben, und ist schon eine Zieldatei berührt?
      const wurzel = beobachtet.wurzel;
      const name = protokolleIn(wurzel)[0];
      const protokoll = JSON.parse(lies(path.join(sperrOrdner(wurzel), name)));
      beobachtet.beiMarke = {
        protokollPfad: path.join(sperrOrdner(wurzel), name),
        protokoll,
        durchgeschrieben: [...durchgeschrieben],
        // 4T-001924: Eine anzulegende Zieldatei gibt es bei der Marke noch nicht.
        ziele: protokoll.umbenennungen.map((u) => (fs.existsSync(u.nach) ? lies(u.nach) : null)),
        schatten: protokoll.umbenennungen.map((u) => lies(u.von)),
      };
    }
    if (optionen.wirf === 'umbenennen') throw stoerung('EIO');
    await benenneUmMitWiederholung(von, nach, opts);
    ereignisse.push('umbenennen');
  };

  const klammer = erzeugeAbsichtsProtokoll({
    sperrVerwaltung: beobachteteVerwaltung,
    ...KONFIG,
    fsp,
    durchschreiben,
    benenneUm,
  });
  const schnittstelle = erzeugeSchreibSchnittstelle({
    sperrVerwaltung: verwaltung,
    absichtsProtokoll: klammer,
    // 4T-001824: der Wiederanlauf mit der unbeobachteten Verwaltung; er
    // findet in diesen Fällen kein Protokoll und nimmt deshalb nichts.
    wiederanlauf: erzeugeWiederanlauf({
      sperrVerwaltung: verwaltung,
      ...KONFIG,
      erweiterungAktiv: () => true,
    }),
    erweiterungAktiv: () => true,
    jetzt: () => ZEITPUNKT,
    herkunft: () => HERKUNFT,
    warteAbstaende: [],
  });
  return {
    beobachtet,
    klammer,
    auftrag: (wurzel, anweisungen) => {
      beobachtet.wurzel = wurzel;
      return schnittstelle.fuehreAuftragAus(wurzel, { anweisungen });
    },
  };
}

// Aufeinander folgende gleiche Ereignisse zu einem zusammengezogen.
function schritte(ereignisse) {
  return ereignisse.filter((e, i) => i === 0 || e !== ereignisse[i - 1]);
}

// Zwei Tabellen, eine davon in einem Unterordner: So liegt jede Schattenkopie
// in einem anderen Verzeichnis, und die Frage nach ihrem Ort hat Gewicht.
function zweiTabellen() {
  const wurzel = bereich();
  const kunden = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], 2));
  const orte = lege(wurzel, 'Stamm/Orte.md', tabelle([ANNA], 1));
  const anweisungen = [aendere('Kunden.md', ANNA, 'Chur'), aendere('Stamm/Orte.md', ANNA, 'Sion')];
  return { wurzel, kunden, orte, anweisungen, vorher: [lies(kunden), lies(orte)] };
}

// --- AK1, AK5: die fünf Schritte und das Durchschreiben ---------------------------------

describe('Absichts-Protokoll: die fünf Schritte (4T-001823, AK1, AK5)', () => {
  it('AK1 läuft in der Reihenfolge Sperren, Schattenkopien, Protokoll, Umbenennen, Belege, Aufräumen', async () => {
    const { wurzel, anweisungen } = zweiTabellen();
    const a = aufbau();

    const ergebnis = await a.auftrag(wurzel, anweisungen);

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(schritte(a.beobachtet.ereignisse)).toEqual([
      'sperren',
      'schatten-durchgeschrieben',
      'protokoll-angelegt',
      'protokoll-durchgeschrieben',
      'umbenennen',
      'beleg',
      'protokoll-weg',
      'freigeben',
    ]);
    const zaehle = (name) => a.beobachtet.ereignisse.filter((e) => e === name).length;
    expect(zaehle('schatten-durchgeschrieben')).toBe(2);
    expect(zaehle('umbenennen')).toBe(2);
    expect(zaehle('beleg')).toBe(2);
    // Ein Rückweg für alle vier Sperren: je Tabelle Datensatz und Beleg-Datei.
    expect(zaehle('freigeben')).toBe(1);
  });

  it('AK1 berührt vor der Marke keine Zieldatei und räumt danach alles weg', async () => {
    const { wurzel, kunden, orte, anweisungen, vorher } = zweiTabellen();
    const a = aufbau();

    const ergebnis = await a.auftrag(wurzel, anweisungen);

    expect(ergebnis.ok).toBe(true);
    // Bei der Marke trugen die Zieldateien noch den alten Stand, und die
    // Schattenkopien lagen mit dem neuen vollständig vor.
    const marke = a.beobachtet.beiMarke;
    expect(marke.protokoll.umbenennungen.map((u) => u.nach)).toEqual([kunden, orte]);
    expect(marke.ziele).toEqual(vorher);
    expect(marke.schatten).toEqual([lies(kunden), lies(orte)]);
    expect(lies(kunden)).toContain('| Chur');
    expect(lies(orte)).toContain('| Sion');
    // Danach: kein Protokoll, keine Sperre, keine Schattenkopie.
    expect(imSperrOrdner(wurzel)).toEqual([]);
    expect(schattenkopienIn(wurzel)).toEqual([]);
    expect(a.beobachtet.verwaltung.gehalteneSperren()).toEqual([]);
  });

  it('AK5 schreibt jede Schattenkopie und das Protokoll durch, bevor umbenannt wird', async () => {
    const { wurzel, anweisungen } = zweiTabellen();
    const a = aufbau();

    await a.auftrag(wurzel, anweisungen);

    const marke = a.beobachtet.beiMarke;
    const erwartet = [
      ...marke.protokoll.umbenennungen.map((u) => u.von),
      marke.protokollPfad,
    ].sort();
    // Beim ersten Umbenennen ist GENAU das durchgeschrieben: alle
    // Schattenkopien und das Protokoll, und das Protokoll als letztes.
    expect([...marke.durchgeschrieben].sort()).toEqual(erwartet);
    expect(marke.durchgeschrieben[marke.durchgeschrieben.length - 1]).toBe(marke.protokollPfad);
  });

  it('AK5 legt das Protokoll erst an, wenn alle Schattenkopien durchgeschrieben sind', async () => {
    const { wurzel, anweisungen } = zweiTabellen();
    const a = aufbau();

    await a.auftrag(wurzel, anweisungen);

    const e = a.beobachtet.ereignisse;
    const angelegt = e.indexOf('protokoll-angelegt');
    expect(e.slice(0, angelegt).filter((x) => x === 'schatten-durchgeschrieben')).toHaveLength(2);
  });
});

// --- AK2: Fehlschlag beim Nehmen einer Sperre --------------------------------------------

describe('Absichts-Protokoll: eine belegte Sperre wirkt nichts (4T-001823, AK2)', () => {
  // Die Ordnung eines Auftrags über zwei Datensätze einer Tabelle: erst die
  // beiden Datensätze nach Nummer, dann die Beleg-Datei.
  const GEGENSTAENDE = {
    erste: { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00001' },
    mittlere: { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00002' },
    letzte: { art: ART_CHANGE_LOG, tabelle: 'Kunden.md' },
  };

  it.each(Object.keys(GEGENSTAENDE))(
    'AK2 lässt bei belegter %s Sperre jede Datei zeichengleich und hält danach nichts',
    async (stelle) => {
      const wurzel = bereich();
      const kunden = lege(wurzel, 'Kunden.md', tabelle([ANNA, BERT], 2));
      const vorher = lies(kunden);
      const fremd = await legeSperreAn(
        wurzel,
        GEGENSTAENDE[stelle],
        { marke: 'fremd', pid: 999999 },
        {
          ...KONFIG,
          herkunft: () => ({ benutzer: 'bert', rechner: 'FREMD-PC' }),
          jetzt: () => new Date().toISOString().slice(0, 19) + 'Z',
        },
      );
      expect(fremd.gehalten).toBe(true);
      const a = aufbau();

      const ergebnis = await a.auftrag(wurzel, [
        aendere('Kunden.md', ANNA, 'Chur'),
        aendere('Kunden.md', BERT, 'Thun'),
      ]);

      expect(ergebnis.code).toBe(LAGEN.gesperrt);
      expect(lies(kunden)).toBe(vorher);
      expect(fs.existsSync(belegPfadFuer(kunden))).toBe(false);
      expect(schattenkopienIn(wurzel)).toEqual([]);
      // Allein die fremde Sperre liegt noch da: kein Protokoll, keine eigene.
      expect(imSperrOrdner(wurzel)).toEqual([path.basename(fremd.pfad)]);
      expect(a.beobachtet.verwaltung.gehalteneSperren()).toEqual([]);
      expect(a.beobachtet.ereignisse).not.toContain('schatten-durchgeschrieben');
    },
  );
});

// --- AK3, AK4, AK6: Sperr-Menge, Ort der Schattenkopien, Inhalt des Protokolls -----------

describe('Absichts-Protokoll: Sperren, Schattenkopien und Inhalt (4T-001823, AK3, AK4, AK6)', () => {
  it('AK3 nimmt die Beleg-Datei jeder Tabelle mit, in der Ordnung der Sperr-Ordnung', async () => {
    const { wurzel, anweisungen } = zweiTabellen();
    const a = aufbau();

    await a.auftrag(wurzel, anweisungen);

    const gesperrt = a.beobachtet.beiMarke.protokoll.sperren;
    const menge = [
      { art: ART_DATENSATZ, tabelle: 'Stamm/Orte.md', id: 'r-00001' },
      { art: ART_CHANGE_LOG, tabelle: 'Stamm/Orte.md' },
      { art: ART_CHANGE_LOG, tabelle: 'Kunden.md' },
      { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00001' },
    ];
    const geordnet = ordneSperrGegenstaende(menge.map((g) => loeseGegenstand(wurzel, g))).map(
      (e) => ({ art: e.art, tabelle: e.relativ, id: e.kennung }),
    );
    expect(gesperrt).toEqual(geordnet);
    expect(gesperrt.filter((g) => g.art === ART_CHANGE_LOG).map((g) => g.tabelle)).toEqual([
      'Kunden.md',
      'Stamm/Orte.md',
    ]);
  });

  it('AK4 legt jede Schattenkopie in das Verzeichnis ihrer Zieldatei', async () => {
    const { wurzel, anweisungen } = zweiTabellen();
    const a = aufbau();

    await a.auftrag(wurzel, anweisungen);

    const umbenennungen = a.beobachtet.beiMarke.protokoll.umbenennungen;
    expect(umbenennungen).toHaveLength(2);
    for (const { von, nach } of umbenennungen) {
      expect(path.dirname(von)).toBe(path.dirname(nach));
      // 4T-001823 (Nachschärfung): mit der Marke eines Auftrags, die kein
      // Aufräumen anfasst, und nicht als gewöhnliche Schattenkopie.
      expect(istAbsichtsSchattenkopie(path.basename(von))).toBe(true);
      expect(istSchattenkopie(path.basename(von))).toBe(false);
    }
    // Und es waren genau diese Dateien, die durchgeschrieben wurden.
    const schatten = a.beobachtet.durchgeschrieben.filter((p) => !istProtokoll(p));
    expect(schatten).toEqual(umbenennungen.map((u) => u.von));
  });

  it('AK6 trägt alle Pflicht-Angaben unter der Schema-Version', async () => {
    const { wurzel, kunden, orte, anweisungen } = zweiTabellen();
    const a = aufbau();

    const ergebnis = await a.auftrag(wurzel, anweisungen);

    const { protokoll, protokollPfad } = a.beobachtet.beiMarke;
    expect(protokollPfad).toBe(path.join(sperrOrdner(wurzel), protokollName(ergebnis.vorgang)));
    expect(Object.keys(protokoll)).toEqual([
      'schemaVersion',
      'vorgang',
      'zeitpunkt',
      'halter',
      'umbenennungen',
      'belege',
      'sperren',
    ]);
    expect(protokoll.schemaVersion).toBe(ABSICHT_SCHEMA_VERSION);
    expect(ABSICHT_SCHEMA_VERSION).toBe(1);
    expect(protokoll.vorgang).toBe(ergebnis.vorgang);
    expect(protokoll.zeitpunkt).toBe(ZEITPUNKT);
    expect(protokoll.halter).toEqual({ ...HERKUNFT, pid: process.pid });
    expect(protokoll.umbenennungen.map((u) => Object.keys(u))).toEqual([
      ['von', 'nach'],
      ['von', 'nach'],
    ]);
    expect(protokoll.belege).toEqual([
      expect.objectContaining({ pfad: belegPfadFuer(kunden), tx: ergebnis.vorgang, id: 'r-00001' }),
      expect.objectContaining({ pfad: belegPfadFuer(orte), tx: ergebnis.vorgang, id: 'r-00001' }),
    ]);
    // Der fertige Anfüge-Text ist genau der, der danach in der Beleg-Datei steht.
    expect(lies(belegPfadFuer(kunden))).toBe(protokoll.belege[0].text);
    expect(lies(belegPfadFuer(orte))).toBe(protokoll.belege[1].text);
    expect(protokoll.belege[0].text).toContain(`tx="${ergebnis.vorgang}"`);
  });
});

// --- AK7: die beiden Ränder der Marke ----------------------------------------------------

describe('Absichts-Protokoll: Abbruch vor und nach der Marke (4T-001823, AK7, AK10)', () => {
  it('AK7 hinterlässt bei einem Abbruch unmittelbar VOR der Marke nichts', async () => {
    const { wurzel, kunden, orte, anweisungen, vorher } = zweiTabellen();
    const a = aufbau({ wirf: 'protokoll' });

    const ergebnis = await a.auftrag(wurzel, anweisungen);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe(LAGEN.schreibenFehlgeschlagen);
    expect(ergebnis.lagen[0].grund).toBe('EIO');
    expect([lies(kunden), lies(orte)]).toEqual(vorher);
    expect(fs.existsSync(belegPfadFuer(kunden))).toBe(false);
    expect(fs.existsSync(belegPfadFuer(orte))).toBe(false);
    expect(schattenkopienIn(wurzel)).toEqual([]);
    expect(protokolleIn(wurzel)).toEqual([]);
    expect(imSperrOrdner(wurzel)).toEqual([]);
    expect(a.beobachtet.verwaltung.gehalteneSperren()).toEqual([]);
    expect(a.beobachtet.ereignisse).not.toContain('umbenennen');
  });

  it('AK7 lässt bei einem Abbruch unmittelbar NACH der Marke alles für den Wiederanlauf stehen', async () => {
    const { wurzel, kunden, orte, anweisungen, vorher } = zweiTabellen();
    const a = aufbau({ wirf: 'umbenennen' });

    const ergebnis = await a.auftrag(wurzel, anweisungen);

    // Kein sauberer Fehlschlag, sondern der benannte Zwischenstand.
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe(LAGEN.teilweiseGeschrieben);
    const lage = ergebnis.lagen[0];
    expect(lage).toMatchObject({
      grundCode: LAGEN.schreibenFehlgeschlagen,
      geschriebeneDateien: [],
      angefuegteBelege: [],
      protokoll: a.beobachtet.beiMarke.protokollPfad,
    });
    // Das Protokoll liegt vollständig vor, jede seiner Schattenkopien auch.
    const protokoll = JSON.parse(lies(lage.protokoll));
    expect(protokoll).toEqual(a.beobachtet.beiMarke.protokoll);
    for (const { von } of protokoll.umbenennungen) expect(fs.existsSync(von)).toBe(true);
    // Keine Zieldatei geändert, kein Beleg — und die Sperren stehen.
    expect([lies(kunden), lies(orte)]).toEqual(vorher);
    expect(fs.existsSync(belegPfadFuer(kunden))).toBe(false);
    expect(a.beobachtet.verwaltung.gehalteneSperren()).toHaveLength(4);
    expect(a.beobachtet.ereignisse).not.toContain('freigeben');
    expect(a.beobachtet.ereignisse).not.toContain('schatten-weg');
  });

  it('AK7 weist einen zwischen Lesen und Marke von Hand geänderten Stand ab, ohne zu schreiben', async () => {
    // Die Sperren reihen nur die Schreiber dieser Anwendung. Speichert jemand
    // die Tabellen-Datei auf anderem Weg, während der Auftrag läuft, darf die
    // Klammer ihn nicht still überschreiben.
    const { wurzel, kunden, anweisungen } = zweiTabellen();
    const vonHand = lies(kunden).replace('| Bern', '| Genf');
    const a = aufbau({ beimDurchschreiben: () => fs.writeFileSync(kunden, vonHand, 'utf8') });

    const ergebnis = await a.auftrag(wurzel, anweisungen);

    expect(ergebnis.code).toBe(LAGEN.schreibenFehlgeschlagen);
    expect(ergebnis.lagen[0]).toMatchObject({ datei: kunden, grund: 'conflict' });
    expect(lies(kunden)).toBe(vonHand);
    expect(schattenkopienIn(wurzel)).toEqual([]);
    expect(imSperrOrdner(wurzel)).toEqual([]);
    expect(a.beobachtet.ereignisse).not.toContain('protokoll-angelegt');
  });

  it('entfernt schon geschriebene Schattenkopien, wenn eine spätere nicht entsteht', async () => {
    // Die Klammer allein, mit einem Plan, dessen zweite Datei in einem nicht
    // vorhandenen Ordner liegt: Die erste Schattenkopie steht bereits.
    const wurzel = bereich();
    const erste = lege(wurzel, 'Erste.md', 'alt\n');
    const zweite = path.join(wurzel, 'fehlt', 'Zweite.md');
    const a = aufbau();
    a.beobachtet.wurzel = wurzel;

    const ergebnis = await a.klammer.fuehreAuftragDurch({
      bereichsWurzel: wurzel,
      sperren: [{ art: ART_CHANGE_LOG, tabelle: 'Erste.md' }],
      vorbereiten: async () => ({
        ok: true,
        vorgang: 7,
        zeitpunkt: ZEITPUNKT,
        herkunft: HERKUNFT,
        plan: {
          dateien: [
            { pfad: erste, tabelle: 'Erste.md', gelesen: 'alt\n', neu: 'neu\n' },
            { pfad: zweite, tabelle: 'Zweite.md', gelesen: '', neu: 'neu\n' },
          ],
          belege: [],
        },
      }),
    });

    expect(ergebnis.code).toBe(LAGEN.schreibenFehlgeschlagen);
    expect(ergebnis.lagen[0]).toMatchObject({ datei: zweite });
    expect(a.beobachtet.ereignisse).toContain('schatten-weg');
    expect(schattenkopienIn(wurzel)).toEqual([]);
    expect(lies(erste)).toBe('alt\n');
    expect(imSperrOrdner(wurzel)).toEqual([]);
  });
});

// --- AK8: drei Tabellen, eine Vorgangs-Kennung ------------------------------------------

describe('Absichts-Protokoll: ein Auftrag über drei Tabellen (4T-001823, AK8)', () => {
  it('AK8 schreibt drei Beleg-Dateien unter derselben Vorgangs-Kennung', async () => {
    const wurzel = bereich();
    const pfade = ['Kunden.md', 'Stamm/Orte.md', 'Artikel.md'].map((rel) =>
      lege(wurzel, rel, tabelle([ANNA], 1)),
    );
    const a = aufbau();

    const ergebnis = await a.auftrag(wurzel, [
      aendere('Kunden.md', ANNA, 'Chur'),
      aendere('Stamm/Orte.md', ANNA, 'Sion'),
      aendere('Artikel.md', ANNA, 'Thun'),
    ]);

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(ergebnis.belege.sort()).toEqual(pfade.map(belegPfadFuer).sort());
    for (const pfad of pfade) {
      const gelesen = await belegeDesDatensatzes(pfad, 'r-00001');
      expect(gelesen.belege).toHaveLength(1);
      expect(gelesen.belege[0].vorgang).toBe(String(ergebnis.vorgang));
    }
    expect(new Set(a.beobachtet.beiMarke.protokoll.belege.map((b) => b.tx))).toEqual(
      new Set([ergebnis.vorgang]),
    );
  });

  it('legt für einen Auftrag ohne Änderung kein Protokoll an', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));
    const a = aufbau();

    const ergebnis = await a.auftrag(wurzel, [aendere('Kunden.md', ANNA, 'Basel')]);

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.dateien).toEqual([]);
    expect(a.beobachtet.ereignisse).toEqual(['sperren', 'freigeben']);
  });
});

// --- 4T-001924, B1: eine anzulegende Datei ----------------------------------------------

describe('Absichts-Protokoll: eine anzulegende Datei (4T-001924, B1)', () => {
  // Die Klammer allein, mit einem Plan aus einer zu ersetzenden und einer
  // anzulegenden Datei: So sieht der Plan einer Teilung aus, die ein neues
  // Folge-Segment hinten anlegt.
  function planMitNeuerDatei(wurzel, eintragNeu = {}) {
    const erste = lege(wurzel, 'Erste.md', 'alt\n');
    const neue = path.join(wurzel, 'Erste•part-00002.md');
    const dateien = [
      { pfad: neue, tabelle: 'Erste.md', gelesen: null, neu: 'neu angelegt\n', anlegen: true },
      { pfad: erste, tabelle: 'Erste.md', gelesen: 'alt\n', neu: 'neu\n' },
    ].map((eintrag, i) => (i === 0 ? { ...eintrag, ...eintragNeu } : eintrag));
    return {
      erste,
      neue,
      auftrag: {
        bereichsWurzel: wurzel,
        sperren: [{ art: ART_CHANGE_LOG, tabelle: 'Erste.md' }],
        vorbereiten: async () => ({
          ok: true,
          vorgang: 11,
          zeitpunkt: ZEITPUNKT,
          herkunft: HERKUNFT,
          plan: { dateien, belege: [] },
        }),
      },
    };
  }

  it('B1 legt eine neue Datei unter der Klammer an, mit Schattenkopie und Umbenennung im Protokoll', async () => {
    const wurzel = bereich();
    const { erste, neue, auftrag } = planMitNeuerDatei(wurzel);
    const a = aufbau();
    a.beobachtet.wurzel = wurzel;

    const ergebnis = await a.klammer.fuehreAuftragDurch(auftrag);

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(ergebnis.dateien).toEqual([neue, erste]);
    expect(lies(neue)).toBe('neu angelegt\n');
    expect(lies(erste)).toBe('neu\n');
    // Bei der Marke stand die neue Datei im Protokoll und gab es noch nicht.
    const marke = a.beobachtet.beiMarke;
    expect(marke.protokoll.umbenennungen.map((u) => u.nach)).toEqual([neue, erste]);
    expect(marke.ziele).toEqual([null, 'alt\n']);
    expect(marke.schatten).toEqual(['neu angelegt\n', 'neu\n']);
    expect(schattenkopienIn(wurzel)).toEqual([]);
    expect(imSperrOrdner(wurzel)).toEqual([]);
  });

  it('B1 weist ab, wenn die anzulegende Datei zwischen Lesen und Marke entstanden ist', async () => {
    // Ein zweiter Auftrag, der dieselbe Tabelle geteilt hat, hätte dasselbe
    // Segment angelegt; überschrieben werden darf es nicht.
    const wurzel = bereich();
    const { erste, neue, auftrag } = planMitNeuerDatei(wurzel);
    const a = aufbau({ beimDurchschreiben: () => fs.writeFileSync(neue, 'fremd\n', 'utf8') });
    a.beobachtet.wurzel = wurzel; // ohne die Prüfung liefe der Auftrag bis zum Umbenennen

    const ergebnis = await a.klammer.fuehreAuftragDurch(auftrag);

    expect(ergebnis.code).toBe(LAGEN.schreibenFehlgeschlagen);
    expect(ergebnis.lagen[0]).toMatchObject({ datei: neue, grund: 'exists' });
    expect(lies(neue)).toBe('fremd\n');
    expect(lies(erste)).toBe('alt\n');
    // Keine Schattenkopie, kein Protokoll, keine Sperre bleibt zurück.
    expect([...schattenkopienIn(wurzel), ...imSperrOrdner(wurzel)]).toEqual([]);
    expect(a.beobachtet.ereignisse).not.toContain('protokoll-angelegt');
  });

  it('B1 schreibt nicht blind, wenn sich die Existenz nicht prüfen lässt', async () => {
    const wurzel = bereich();
    const { erste, neue, auftrag } = planMitNeuerDatei(wurzel);
    const a = aufbau({
      lstat: async (pfad) => {
        if (pfad === neue) throw stoerung('EACCES');
        return fs.promises.lstat(pfad);
      },
    });

    const ergebnis = await a.klammer.fuehreAuftragDurch(auftrag);

    expect(ergebnis.code).toBe(LAGEN.schreibenFehlgeschlagen);
    expect(ergebnis.lagen[0]).toMatchObject({ datei: neue, grund: 'EACCES' });
    expect(fs.existsSync(neue)).toBe(false);
    expect(lies(erste)).toBe('alt\n');
    expect(schattenkopienIn(wurzel)).toEqual([]);
    expect(imSperrOrdner(wurzel)).toEqual([]);
  });

  it.each([
    ['eine anzulegende Datei mit gelesenem Stand', { gelesen: 'alt\n' }],
    ['eine anzulegende Datei ohne gelesenen Stand', { gelesen: undefined }],
    ['eine zu ersetzende Datei ohne gelesenen Stand', { gelesen: null, anlegen: false }],
    ['eine Angabe anlegen, die kein Wahrheitswert ist', { anlegen: 'ja' }],
  ])('B1 bricht den Vertrag laut bei %s und hält danach keine Sperre', async (_fall, eintrag) => {
    const wurzel = bereich();
    const { erste, neue, auftrag } = planMitNeuerDatei(wurzel, eintrag);
    const a = aufbau();

    await expect(a.klammer.fuehreAuftragDurch(auftrag)).rejects.toThrow(TypeError);

    expect(fs.existsSync(neue)).toBe(false);
    expect(lies(erste)).toBe('alt\n');
    expect(a.beobachtet.verwaltung.gehalteneSperren()).toEqual([]);
  });
});

// --- Nachschärfung: Rückweg der Verwaltung, Absichts-Marke, Aufräumen ------------------

describe('Absichts-Protokoll: Rückweg, Marke und Aufräumen (4T-001823, Nachschärfung)', () => {
  it('gibt über den Rückweg der Verwaltung in umgekehrter Reihenfolge frei, nie selbst über gibFrei', async () => {
    const { wurzel, anweisungen } = zweiTabellen();
    const verwaltung = erzeugeSperrVerwaltung(KONFIG);
    verwaltungen.push(verwaltung);
    const rueckweg = vi.spyOn(verwaltung, 'gibZurueck');
    const einzeln = vi.spyOn(verwaltung, 'gibFrei');
    const schnittstelle = erzeugeSchreibSchnittstelle({
      sperrVerwaltung: verwaltung,
      absichtsProtokoll: erzeugeAbsichtsProtokoll({ sperrVerwaltung: verwaltung, ...KONFIG }),
      wiederanlauf: erzeugeWiederanlauf({
        sperrVerwaltung: verwaltung,
        ...KONFIG,
        erweiterungAktiv: () => true,
      }),
      erweiterungAktiv: () => true,
      jetzt: () => ZEITPUNKT,
      herkunft: () => HERKUNFT,
      warteAbstaende: [],
    });

    const ergebnis = await schnittstelle.fuehreAuftragAus(wurzel, { anweisungen });

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(rueckweg).toHaveBeenCalledTimes(1);
    const [, genommen] = rueckweg.mock.calls[0];
    expect(genommen).toHaveLength(4);
    // Freigegeben in umgekehrter Reihenfolge des Nehmens.
    const zurueck = await rueckweg.mock.results[0].value;
    expect(zurueck.map((e) => e.freigegeben)).toEqual([true, true, true, true]);
    expect(zurueck.map((e) => path.basename(e.pfad))).toEqual(
      [...genommen].reverse().map((g) => sperrDateiName(wurzel, g).name),
    );
    // Die Klammer ruft das einzelne Freigeben nicht selbst.
    expect(einzeln).not.toHaveBeenCalled();
    expect(verwaltung.gehalteneSperren()).toEqual([]);
  });

  it('nennt im Protokoll Absichts-Schattenkopien, die das Aufräumen stehen lässt', async () => {
    const { wurzel, kunden, anweisungen } = zweiTabellen();
    const a = aufbau({ wirf: 'umbenennen' });

    const ergebnis = await a.auftrag(wurzel, anweisungen);

    expect(ergebnis.code).toBe(LAGEN.teilweiseGeschrieben);
    const { umbenennungen } = a.beobachtet.beiMarke.protokoll;
    for (const { von } of umbenennungen) {
      expect(istAbsichtsSchattenkopie(path.basename(von))).toBe(true);
      // Künstlich alt: Allein die Marke schützt sie noch.
      const alt = new Date(Date.now() - RESTE_MINDESTALTER_MS - 60_000);
      fs.utimesSync(von, alt, alt);
    }
    // Ein fremdes Aufräumen in beiden Verzeichnissen, ohne Drossel. Aus dem
    // Schutz der laufenden Vorgänge dieses Prozesses gelöst, wie nach einem
    // Absturz: Dann schützt allein die Marke.
    for (const { von } of umbenennungen) loeseSchattenkopie(von);
    for (const { nach } of umbenennungen)
      await raeumeSchattenkopien(path.dirname(nach), { ohneDrossel: true });
    for (const { von } of umbenennungen) expect(fs.existsSync(von)).toBe(true);
    expect(fs.existsSync(kunden)).toBe(true);
  });

  it('räumt nach einem gelungenen Auftrag alte gewöhnliche Schattenkopien im Tabellen-Verzeichnis auf', async () => {
    // Die Tabelle liegt im Unterordner: Im Wurzel-Ordner räumt schon das
    // Ersetzen der Zähler-Datei auf, und der Fall bewiese dann nichts.
    const wurzel = bereich();
    const orte = lege(wurzel, 'Stamm/Orte.md', tabelle([ANNA], 1));
    const ordner = path.dirname(orte);
    const alt = new Date(Date.now() - RESTE_MINDESTALTER_MS - 60_000);
    const gewoehnlich = path.join(ordner, '.Orte.md.em4me-neu-99999-1');
    const absicht = path.join(ordner, '.Orte.md.em4me-absicht-99999-2');
    for (const rest of [gewoehnlich, absicht]) {
      fs.writeFileSync(rest, 'Rest\n', 'utf8');
      fs.utimesSync(rest, alt, alt);
    }
    // Ohne Drossel: Ein früherer Fall darf das Aufräumen nicht verschluckt haben.
    _drosselLeeren();
    const a = aufbau();

    const ergebnis = await a.auftrag(wurzel, [aendere('Stamm/Orte.md', ANNA, 'Sion')]);

    expect(ergebnis.ok, JSON.stringify(ergebnis.lagen)).toBe(true);
    expect(fs.existsSync(gewoehnlich)).toBe(false);
    // 4T-001824 (Nachschärfung): Die alte Absichts-Schattenkopie nennt kein
    // Protokoll; der Wiederanlauf vor dem Auftrag entsorgt sie im Verzeichnis
    // der Tabelle. Dass das gewöhnliche Aufräumen sie nicht anfasst, zeigt der
    // Fall darüber und `atomic-write.test.js`.
    expect(fs.existsSync(absicht)).toBe(false);
  });
});

// --- AK9, AK10, AK13: Quelltext-Wächter -------------------------------------------------

describe('Absichts-Protokoll: Quelltext-Wächter (4T-001823, AK9, AK10, AK13)', () => {
  // Die Schritte nach der Marke: von `vollende` bis zum Einstieg.
  const NACH_DER_MARKE = abschnittOhneExpect(
    KLAMMER_QUELLE,
    'async function vollende(',
    '// --- Nach Schritt 5: Aufräumen',
  );

  function abschnittOhneExpect(text, von, bis) {
    const anfang = text.indexOf(von);
    return anfang < 0 ? '' : text.slice(anfang, text.indexOf(bis, anfang));
  }

  // Verbotenes nach der Marke: jedes Entfernen außer dem des Protokolls, jedes
  // Zurückschreiben und jeder Rückgriff auf den gelesenen alten Stand.
  function rueckrollStellen(text) {
    const befunde = [];
    const muster = {
      entferneSchattenkopien: /\bentferneSchattenkopien\s*\(/g,
      zieheProtokollZurueck: /\bzieheProtokollZurueck\s*\(/g,
      writeFile: /\bwriteFile\s*\(/g,
      rm: /\.(rm|rmdir|copyFile)\s*\(/g,
      gelesen: /\bgelesen\b/g,
      ersetzeDatei: /\bersetzeDatei\b/g,
    };
    for (const [name, m] of Object.entries(muster))
      if (trefferAusserhalbKommentaren(text, m).length > 0) befunde.push(name);
    for (const m of text.matchAll(/\bunlink\(([^)]*)\)/g))
      if (m[1].trim() !== 'marke.protokoll') befunde.push(`unlink(${m[1]})`);
    return befunde;
  }

  it('AK10 rollt nach der Marke nichts zurück', () => {
    expect(NACH_DER_MARKE.length).toBeGreaterThan(500);
    expect(rueckrollStellen(NACH_DER_MARKE)).toEqual([]);
    // Gegenprobe an einem erfundenen Rückweg.
    expect(
      rueckrollStellen('await fsp.unlink(von);\nawait ersetzeDatei(nach, eintrag.gelesen);'),
    ).toEqual(['gelesen', 'ersetzeDatei', 'unlink(von)']);
  });

  it('AK10 entfernt Schattenkopien nur vor der Marke', () => {
    const einstieg = abschnitt(
      KLAMMER_QUELLE,
      'async function fuehreAuftragDurch(',
      // 4T-001824: Der Einstieg trägt seither auch `laeuft`.
      'return { fuehreAuftragDurch, laeuft }',
    );
    expect(trefferAusserhalbKommentaren(einstieg, /\bentferneSchattenkopien\s*\(/g)).toEqual([]);
    const aufrufe = trefferAusserhalbKommentaren(KLAMMER_QUELLE, /\bentferneSchattenkopien\s*\(/g);
    const vorDerMarke = abschnitt(
      KLAMMER_QUELLE,
      'async function setzeMarke(',
      'function liegenGeblieben(',
    );
    // Eine Definition und ein Aufruf, und der steht in den Schritten vor der Marke.
    expect(aufrufe).toHaveLength(2);
    expect(
      trefferAusserhalbKommentaren(vorDerMarke, /\bentferneSchattenkopien\s*\(/g),
    ).toHaveLength(1);
  });

  it('AK13 benennt nur über die gemessene Wiederhol-Schleife um und bildet keine eigenen Schatten-Namen', () => {
    const verboten = [
      /\.rename\s*\(/g,
      /\brenameSync\b/g,
      /em4me-/g,
      /SCHATTEN_/g,
      /ABSICHT_MARKE|ABSICHT_MUSTER/g,
      /\bschattenPfad\b/g,
    ];
    for (const m of verboten)
      expect(trefferAusserhalbKommentaren(KLAMMER_QUELLE, m), String(m)).toEqual([]);
    // 4T-001823 (Nachschärfung): Die einzige zulässige Form ist die Marke der
    // Absichts-Schattenkopien, erbeten beim Schreibweg und nicht selbst gebildet.
    expect(
      trefferAusserhalbKommentaren(KLAMMER_QUELLE, /\bschreibeSchattenkopie\s*\(/g),
    ).toHaveLength(1);
    expect(trefferAusserhalbKommentaren(KLAMMER_QUELLE, /marke: 'absicht'/g)).toHaveLength(1);
    expect(KLAMMER_QUELLE).toMatch(/d\.benenneUm \|\| benenneUmMitWiederholung/);
    // Umbenannt wird an genau einer Stelle, über die Naht.
    expect(trefferAusserhalbKommentaren(KLAMMER_QUELLE, /\bbenenneUm\s*\(/g)).toHaveLength(1);
    // Gegenprobe.
    expect(trefferAusserhalbKommentaren('await fs.rename(a, b);', /\.rename\s*\(/g)).toHaveLength(
      1,
    );
  });

  it('AK9 lässt in der Schreib-Schnittstelle keinen Weg an der Klammer vorbei', () => {
    for (const name of ['schreibeBeleg', 'appendFile', 'fuehreSchreibPlanAus'])
      expect(
        trefferAusserhalbKommentaren(SCHNITTSTELLE_QUELLE, new RegExp(`\\b${name}\\b`, 'g')),
        name,
      ).toEqual([]);
    const auftrag = abschnitt(
      SCHNITTSTELLE_QUELLE,
      'async function fuehreAuftragAus(',
      'async function eroeffneNeuanlage(',
    );
    expect(auftrag).toContain('absichtsProtokoll.fuehreAuftragDurch(');
    expect(
      trefferAusserhalbKommentaren(auftrag, /\b(mitSperren|ersetzen|ersetzeDatei)\s*\(/g),
    ).toEqual([]);
    // Ersetzt wird allein noch beim Eröffnen einer Neuanlage: eine einzige
    // Datei ohne Beleg, die ganz oder gar nicht über den Schreibweg entsteht.
    const neuanlage = abschnitt(
      SCHNITTSTELLE_QUELLE,
      'async function eroeffneNeuanlage(',
      'return { fuehreAuftragAus',
    );
    const ersetzt = trefferAusserhalbKommentaren(
      SCHNITTSTELLE_QUELLE,
      /\b(ersetzen|ersetzeDatei)\s*\(/g,
    );
    expect(ersetzt).toHaveLength(1);
    expect(trefferAusserhalbKommentaren(neuanlage, /\bersetzen\s*\(/g)).toHaveLength(1);
  });

  it('bekommt in der Verdrahtung dieselbe Sperr-Verwaltung wie die Schnittstelle', () => {
    expect(VERDRAHTUNG.match(/erzeugeAbsichtsProtokoll\(/g)).toHaveLength(1);
    expect(VERDRAHTUNG).toMatch(/erzeugeAbsichtsProtokoll\(\{\s*\n\s*sperrVerwaltung,/);
    expect(VERDRAHTUNG).toMatch(
      /erzeugeSchreibSchnittstelle\(\{\s*\n\s*sperrVerwaltung,\s*\n\s*absichtsProtokoll,/,
    );
  });

  it('verweigert den Aufbau ohne Sperr-Verwaltung und ohne Konfigurations-Leser', () => {
    expect(() => erzeugeAbsichtsProtokoll({ ...KONFIG })).toThrow(TypeError);
    const verwaltung = erzeugeSperrVerwaltung(KONFIG);
    expect(() => erzeugeAbsichtsProtokoll({ sperrVerwaltung: verwaltung })).toThrow(TypeError);
    expect(() =>
      erzeugeAbsichtsProtokoll({ sperrVerwaltung: verwaltung, ...KONFIG, durchschreiben: true }),
    ).toThrow(TypeError);
    expect(() =>
      erzeugeSchreibSchnittstelle({ sperrVerwaltung: verwaltung, erweiterungAktiv: () => true }),
    ).toThrow(TypeError);
  });
});
