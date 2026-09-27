// 4T-001824 (Epic 3E-000254, Nachschärfung): Die Fälle zu den Befunden 1 bis 4
// der Umsetzung und zum Entsorgen in Unterordnern, aus
// `db-intent-recovery.test.js` hierher gelegt, weil jene Datei sonst ihr
// Größen-Budget risse. Aufbau wie dort: echtes Dateisystem, echte
// Sperr-Verwaltung, Klammer, Wiederanlauf und Schnittstelle; ein Neustart ist
// eine neue Sperr-Verwaltung im selben Prozess.
//
// - Befund 1: Ein Protokoll, an dem ein Lebender arbeitet, weist nicht ab; ohne
//   lebenden Halter seiner Sperren weist es ab.
// - Befund 2: Die Hinterlassenschaft eines gescheiterten Laufs desselben
//   Prozesses räumt dessen nächster Auftrag auf.
// - Befund 3: Abgelaufene fremde Sperren eines Protokolls werden in einer
//   begrenzten Schleife gebrochen, lebende nie.
// - Befund 4: Die Neuanlage sieht vorher nach einem hängenden Auftrag.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  WIEDERANLAUF_LAGEN as L,
  erzeugeWiederanlauf,
} from '../../src/main/database/intent-recovery.js';
import { ABSICHT_PRAEFIX, erzeugeAbsichtsProtokoll } from '../../src/main/database/intent-log.js';
import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { SPERR_FRIST_MS, erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import {
  ART_CHANGE_LOG,
  ART_SWEEP,
  legeSperreAn,
  sperrDateiName,
} from '../../src/main/database/lock-store.js';
import { leseBelegDatei } from '../../src/main/database/change-log.js';
import {
  RESTE_MINDESTALTER_MS,
  benenneUmMitWiederholung,
} from '../../src/main/documents/atomic-write.js';
import { DEFAULT_LOCK_FOLDER_NAME } from '../../src/shared/database/lock-folder-name.js';

// --- Aufbau (wie in db-intent-recovery.test.js) -----------------------------------------

let tmpDirs = [];
let verwaltungen = [];

afterEach(async () => {
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
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wiederanlauf-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

function tabelle(records, lastId) {
  const zeilen = ['---', 'db-table:', '  fields:', '    - name: Name', '    - name: Ort'];
  zeilen.push(`  lastId: ${lastId}`, '---', '', '```perspective-records');
  for (const r of records) zeilen.push(`|- id="${r.id}"`, `| ${r.name}`, `| ${r.ort}`);
  zeilen.push('```', '');
  return zeilen.join('\n');
}

const ANNA = { id: 'r-00001', name: 'Anna', ort: 'Basel' };
const NEU = ['Chur', 'Sion', 'Thun'];
const ZEITPUNKT = '2026-09-23T08:00:00Z';
const HERKUNFT = { benutzer: 'anna', rechner: 'SC-026' };
const KONFIG = { leseKonfig: async () => undefined };

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

const sperrOrdner = (wurzel) => path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME);
const imSperrOrdner = (wurzel) =>
  fs.existsSync(sperrOrdner(wurzel)) ? fs.readdirSync(sperrOrdner(wurzel)).sort() : [];
const protokolleIn = (wurzel) => imSperrOrdner(wurzel).filter((n) => n.startsWith(ABSICHT_PRAEFIX));
const sperrDateienIn = (wurzel) => imSperrOrdner(wurzel).filter((n) => n.endsWith('.lock'));

function altern(pfad, um = RESTE_MINDESTALTER_MS + 60_000) {
  const alt = new Date(Date.now() - um);
  fs.utimesSync(pfad, alt, alt);
}

const isoVor = (ms) => `${new Date(Date.now() - ms).toISOString().slice(0, 19)}Z`;

function stoerung(code) {
  return Object.assign(new Error(`gestellter Abbruch (${code})`), { code });
}

async function intakteBelege(tabellenPfad) {
  return (await leseBelegDatei(tabellenPfad)).belege.filter((b) => !b.beschaedigt);
}

/**
 * Ein «Prozess»: Sperr-Verwaltung, Klammer, Wiederanlauf und Schnittstelle, so
 * verdrahtet wie in `wiring.js`. Die Nähte der Klammer und des Wiederanlaufs
 * sind einzeln übersteuerbar.
 */
function prozess(o = {}) {
  const verwaltung = erzeugeSperrVerwaltung({ ...KONFIG, ...o.verwaltung });
  verwaltungen.push(verwaltung);
  const klammer = erzeugeAbsichtsProtokoll({
    sperrVerwaltung: o.klammerVerwaltung ? o.klammerVerwaltung(verwaltung) : verwaltung,
    ...KONFIG,
    ...o.klammer,
  });
  const wiederanlauf = erzeugeWiederanlauf({
    sperrVerwaltung: verwaltung,
    ...KONFIG,
    erweiterungAktiv: () => true,
    // 4T-001824 (Nachschärfung): wie in der Verdrahtung.
    laeuft: (vorgang) => klammer.laeuft(vorgang),
    // Dieselbe Herkunft wie die Schnittstelle, die den Halter des Protokolls
    // schreibt; in der Verdrahtung ist es für beide die des Rechners.
    herkunft: () => HERKUNFT,
    ...o.anlauf,
  });
  const schnittstelle = erzeugeSchreibSchnittstelle({
    sperrVerwaltung: verwaltung,
    absichtsProtokoll: klammer,
    wiederanlauf,
    erweiterungAktiv: () => true,
    jetzt: () => ZEITPUNKT,
    herkunft: () => HERKUNFT,
    warteAbstaende: [],
  });
  return {
    verwaltung,
    wiederanlauf,
    raeumeAuf: (wurzel) => wiederanlauf.raeumeAuf(wurzel),
    auftrag: Object.assign(
      (wurzel, anweisungen) => schnittstelle.fuehreAuftragAus(wurzel, { anweisungen }),
      { schnittstelle },
    ),
  };
}

async function erwarteGewirkt(pfade) {
  const vorgaenge = new Set();
  for (const [i, pfad] of pfade.entries()) {
    expect(lies(pfad), pfad).toContain(`| ${NEU[i]}`);
    const belege = await intakteBelege(pfad);
    expect(belege, pfad).toHaveLength(1);
    vorgaenge.add(belege[0].vorgang);
  }
  expect(vorgaenge.size).toBe(1);
}

// Eine Sperre von Hand, wie ein anderer Prozess oder Rechner sie hinterließe.
function fremdeSperre(
  wurzel,
  gegenstand,
  { rechner = 'FREMD-PC', alterMs = 0, pid = 424242 } = {},
) {
  return legeSperreAn(
    wurzel,
    gegenstand,
    { marke: 'fremd', pid },
    { ...KONFIG, herkunft: () => ({ benutzer: 'bert', rechner }), jetzt: () => isoVor(alterMs) },
  );
}

// Ein Auftrag über die gegebenen Tabellen, angehalten am ersten Umbenennen,
// also unmittelbar nach der Marke; zurück kommt das liegende Protokoll.
async function liegendesProtokoll(wurzel, tabellen = ['Kunden.md']) {
  const pfade = tabellen.map((rel) => lege(wurzel, rel, tabelle([ANNA], 1)));
  let melde;
  const erreicht = new Promise((r) => (melde = r));
  const benenneUm = () => {
    melde();
    return new Promise(() => {});
  };
  void prozess({ klammer: { benenneUm } }).auftrag(
    wurzel,
    tabellen.map((rel, i) => aendere(rel, ANNA, NEU[i])),
  );
  await erreicht;
  const pfad = path.join(sperrOrdner(wurzel), protokolleIn(wurzel)[0]);
  return { pfade, pfad, inhalt: JSON.parse(lies(pfad)) };
}

// --- Nachschärfung: Befunde 1 bis 4 und das Entsorgen in Unterordnern ------------------

// Ersetzt die Sperren eines liegenden Protokolls durch fremde, wie sie ein
// anderer Rechner hielte: lebend (frisch) oder abgelaufen.
async function sperrenFremd(wurzel, sperren, alterMs = 0) {
  for (const g of sperren) {
    fs.rmSync(path.join(sperrOrdner(wurzel), sperrDateiName(wurzel, g).name), { force: true });
    await fremdeSperre(wurzel, g, { alterMs });
  }
}

describe('Wiederanlauf: Nachschärfung (4T-001824, Befunde 1 bis 4)', () => {
  it('Befund 1: ein Protokoll mit lebendem Schreiber weist nicht ab; die Sperren entscheiden', async () => {
    const wurzel = bereich();
    const liegt = await liegendesProtokoll(wurzel);
    await sperrenFremd(wurzel, liegt.inhalt.sperren);
    const p = prozess();

    expect((await p.raeumeAuf(wurzel)).ergebnisse[0]).toMatchObject({
      lage: L.schreiberLebt,
      ohneLebendenHalter: false,
    });
    const auftrag = await p.auftrag(wurzel, [aendere('Kunden.md', ANNA, 'Genf')]);
    expect(auftrag.code).toBe(LAGEN.gesperrt);

    // Dasselbe, während ein lebender Fremder aufräumt.
    await fremdeSperre(wurzel, { art: ART_SWEEP, id: liegt.inhalt.vorgang });
    expect((await p.auftrag(wurzel, [aendere('Kunden.md', ANNA, 'Genf')])).code).toBe(
      LAGEN.gesperrt,
    );
    expect(protokolleIn(wurzel)).toEqual([path.basename(liegt.pfad)]);
  });

  it('Befund 1: räumt ein Fremder auf, dessen Protokoll-Sperren ohne lebenden Halter liegen, hängt der Auftrag', async () => {
    const wurzel = bereich();
    const liegt = await liegendesProtokoll(wurzel);
    await fremdeSperre(wurzel, { art: ART_SWEEP, id: liegt.inhalt.vorgang });

    const ergebnis = await prozess().raeumeAuf(wurzel);

    expect(ergebnis.ergebnisse[0]).toMatchObject({
      lage: L.wirdAufgeraeumt,
      ohneLebendenHalter: true,
    });
  });

  it('Befund 2: ein gescheiterter Lauf desselben Prozesses wird vom nächsten Auftrag aufgeräumt', async () => {
    const wurzel = bereich();
    const kunden = lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));
    let scheitert = true;
    const benenneUm = async (von, nach, o) => {
      if (scheitert) throw stoerung('EBUSY');
      return benenneUmMitWiederholung(von, nach, o);
    };
    const p = prozess({ klammer: { benenneUm } });

    expect((await p.auftrag(wurzel, [aendere('Kunden.md', ANNA, 'Chur')])).code).toBe(
      LAGEN.teilweiseGeschrieben,
    );
    expect(p.verwaltung.gehalteneSperren()).toHaveLength(2);
    scheitert = false;
    const zweiter = await p.auftrag(wurzel, [
      aendere('Kunden.md', { ...ANNA, ort: 'Chur' }, 'Sion'),
    ]);

    expect(zweiter.ok, JSON.stringify(zweiter.lagen)).toBe(true);
    expect(lies(kunden)).toContain('| Sion');
    expect((await intakteBelege(kunden)).map((b) => b.felder[0].neu)).toEqual(['Chur', 'Sion']);
    expect(protokolleIn(wurzel)).toEqual([]);
    expect(p.verwaltung.gehalteneSperren()).toEqual([]);
  });

  it('Befund 2: fährt die Klammer den Vorgang noch, fasst der Wiederanlauf nichts an (Gegenprobe)', async () => {
    const wurzel = bereich();
    const kunden = lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));
    const benenneUm = async () => Promise.reject(stoerung('EBUSY'));
    const p = prozess({ klammer: { benenneUm }, anlauf: { laeuft: () => true } });
    await p.auftrag(wurzel, [aendere('Kunden.md', ANNA, 'Chur')]);
    const vorher = lies(kunden);

    const ergebnis = await p.raeumeAuf(wurzel);

    expect(ergebnis.ergebnisse[0]).toMatchObject({
      lage: L.schreiberLebt,
      ohneLebendenHalter: false,
    });
    expect(lies(kunden)).toBe(vorher);
    expect(p.verwaltung.gehalteneSperren()).toHaveLength(2);
    expect(protokolleIn(wurzel)).toHaveLength(1);
  });

  it('Befund 3: bricht eine fremde abgelaufene Sperre des Protokolls einmal und schreibt zu Ende', async () => {
    const wurzel = bereich();
    const liegt = await liegendesProtokoll(wurzel);
    await sperrenFremd(
      wurzel,
      liegt.inhalt.sperren.filter((g) => g.art === ART_CHANGE_LOG),
      SPERR_FRIST_MS + 60_000,
    );

    expect((await prozess().raeumeAuf(wurzel)).ergebnisse[0].lage).toBe(L.fertiggeschrieben);
    await erwarteGewirkt(liegt.pfade);
    expect(sperrDateienIn(wurzel)).toEqual([]);
    expect(protokolleIn(wurzel)).toEqual([]);
  });

  it('Befund 3: lässt eine fremde lebende Sperre des Protokolls stehen', async () => {
    const wurzel = bereich();
    const liegt = await liegendesProtokoll(wurzel);
    await sperrenFremd(
      wurzel,
      liegt.inhalt.sperren.filter((g) => g.art === ART_CHANGE_LOG),
    );

    expect((await prozess().raeumeAuf(wurzel)).ergebnisse[0].lage).toBe(L.schreiberLebt);
    expect(lies(liegt.pfade[0])).toContain('| Basel');
  });

  it('Befund 4: die Neuanlage räumt vorher auf und vergibt keine Kennung zweimal', async () => {
    const wurzel = bereich();
    const liegt = await liegendesProtokoll(wurzel);
    const p = prozess();
    const neuanlage = p.auftrag.schnittstelle;

    const erste = await neuanlage.eroeffneNeuanlage(wurzel, 'Kunden.md');
    await p.auftrag(wurzel, [aendere('Artikel.md', ANNA, 'x')]);
    const zweite = await neuanlage.eroeffneNeuanlage(wurzel, 'Kunden.md');

    expect([erste.kennung, zweite.kennung]).toEqual(['r-00002', 'r-00003']);
    expect(lies(liegt.pfade[0])).toMatch(/lastId: 3/);
    expect(lies(liegt.pfade[0])).toContain('| Chur');
  });

  it('Befund 4: die Neuanlage weist bei einem hängenden Auftrag an ihrer Tabelle ab', async () => {
    const wurzel = bereich();
    const liegt = await liegendesProtokoll(wurzel);
    await fremdeSperre(wurzel, { art: ART_SWEEP, id: liegt.inhalt.vorgang });
    const vorher = lies(liegt.pfade[0]);

    const ergebnis = await prozess().auftrag.schnittstelle.eroeffneNeuanlage(wurzel, 'Kunden.md');

    expect(ergebnis).toMatchObject({ ok: false, code: LAGEN.haengt });
    expect(ergebnis.lagen[0].tabellen).toEqual(['Kunden.md']);
    expect(lies(liegt.pfade[0])).toBe(vorher);
  });

  it('entsorgt alte Absichts-Schattenkopien im Verzeichnis einer Tabelle des Auftrags, nicht anderswo', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Stamm/Orte.md', tabelle([ANNA], 1));
    const hier = lege(wurzel, 'Stamm/.Orte.md.em4me-absicht-424242-1', 'Rest\n');
    const anderswo = lege(wurzel, 'Archiv/.Alt.md.em4me-absicht-424242-2', 'Rest\n');
    altern(hier);
    altern(anderswo);

    expect((await prozess().auftrag(wurzel, [aendere('Stamm/Orte.md', ANNA, 'Sion')])).ok).toBe(
      true,
    );

    expect(fs.existsSync(hier)).toBe(false);
    expect(fs.existsSync(anderswo)).toBe(true);
  });
});

describe('Wiederanlauf: die Sperren eines Protokolls in begrenzter Schleife brechen (4T-001824, Befund 3)', () => {
  it('Befund 3: bricht vier abgelaufene fremde Sperren zweier Tabellen in einem Lauf und schreibt zu Ende', async () => {
    const wurzel = bereich();
    const liegt = await liegendesProtokoll(wurzel, ['Kunden.md', 'Orte.md']);
    expect(liegt.inhalt.sperren).toHaveLength(4);
    await sperrenFremd(wurzel, liegt.inhalt.sperren, SPERR_FRIST_MS + 60_000);

    const ergebnis = await prozess().raeumeAuf(wurzel);

    expect(ergebnis.ergebnisse[0].lage).toBe(L.fertiggeschrieben);
    await erwarteGewirkt(liegt.pfade);
    expect(sperrDateienIn(wurzel)).toEqual([]);
    expect(protokolleIn(wurzel)).toEqual([]);
  });

  it('Befund 3: bricht keine lebende Sperre, auch wenn die übrigen abgelaufen sind (Gegenprobe)', async () => {
    const wurzel = bereich();
    const liegt = await liegendesProtokoll(wurzel, ['Kunden.md', 'Orte.md']);
    const [lebend, ...abgelaufen] = [...liegt.inhalt.sperren].reverse();
    await sperrenFremd(wurzel, abgelaufen, SPERR_FRIST_MS + 60_000);
    await sperrenFremd(wurzel, [lebend]);
    const lebendPfad = path.join(sperrOrdner(wurzel), sperrDateiName(wurzel, lebend).name);
    const lebendVorher = lies(lebendPfad);

    const ergebnis = await prozess().raeumeAuf(wurzel);

    expect(ergebnis.ergebnisse[0].lage).toBe(L.schreiberLebt);
    expect(lies(lebendPfad)).toBe(lebendVorher);
    expect(lies(liegt.pfade[0])).toContain('| Basel');
    expect(protokolleIn(wurzel)).toHaveLength(1);
  });
});
